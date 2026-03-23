import type { WebSocketEventInputs } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, Message, ToolMessage } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatSlices, ChatStreamEventContext, StreamingAssistantMessage } from '../types/chat'
import type { StreamEvent, StreamOptions } from './llm'

import { createQueue } from '@proj-airi/stream-kit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw } from 'vue'

import { useAnalytics } from '../composables'
import { useLlmmarkerParser } from '../composables/llm-marker-parser'
import { categorizeResponse, createStreamingCategorizer } from '../composables/response-categoriser'
import { createDatetimeContext } from './chat/context-providers'
import { useChatContextStore } from './chat/context-store'
import { createChatHooks } from './chat/hooks'
import { useChatSessionStore } from './chat/session-store'
import { useChatStreamStore } from './chat/stream-store'
import { useLLM } from './llm'
import { useConsciousnessStore } from './modules/consciousness'

/**
 * Creates a stateful filter that buffers the beginning of an LLM response to detect and strip
 * raw ACT/emotion JSON metadata that appears before speech text.
 *
 * NOTICE: This is a workaround because local LLMs (e.g. Llama 3 via Ollama) frequently fail to
 * follow the <|ACT:...|> marker format from the system prompt, outputting metadata as raw text
 * like: "emotion": {"name": "happy", "intensity": 1}, "cognitive": "thinking"
 *
 * Since tokens stream in ~24-character chunks, the metadata spans multiple chunks and cannot
 * be caught with a stateless regex. This filter buffers text until it can determine where
 * the metadata ends and actual speech begins.
 */
function createActMetadataFilter(onMetadata?: (metadata: string) => void) {
  let buffer = ''
  let metadataStripped = false
  // Maximum characters to buffer while looking for metadata boundary.
  // Most ACT metadata payloads are under 200 characters.
  const MAX_BUFFER = 300


  let speechStarted = false
  // Buffer for accumulating partial inline JSON across chunk boundaries
  let inlineBuffer = ''

  /**
   * Technical cleanup for speech text.
   * Strips artifacts left by smaller models like leading symbols (?, !, *),
   * pseudo-headers (Emotion:), and mid-sentence metadata.
   */
  function cleanupSpeech(text: string, isStartOfSpeech: boolean): string {
    let cleaned = text

    if (isStartOfSpeech) {
      // 1. Strip technical prefixes (ACT:, ACT JSON:, etc.)
      cleaned = cleaned.replace(/^(?:<\|)?ACT(?:\s*JSON)?\s*:\s*/i, '')

      // 2. Strip leading formatting artifacts that models sometimes hallucinate after metadata
      // This includes things like stand-alone symbols (?, !, *, >), bullet points, or "AIRI:" labels
      cleaned = cleaned.replace(/^\s*[?!=*#>-]+\s*/, '')

      // 3. Strip leading parenthetical or bracketed metadata: (Emotion), [Action]
      cleaned = cleaned.replace(/^\s*[([].*?[)\]]\s*/g, '')

      // 4. Strip leading pseudo-headers: "Emotion: Happy", "Neutral: "
      cleaned = cleaned.replace(/^[A-Z][a-z]+(?:\s+\([^)]+\))?:\s*/g, '')

      // 5. Strip leading stand-alone headers like "Reasoning" or "Thought"
      cleaned = cleaned.replace(/^(?:Reasoning|Think|Thought|Emotion)\b\s*/gi, '')
    }

    // 6. Strip XML-like tags correctly (both complete and unclosed)
    cleaned = cleaned.replace(/<(?:action|think|thought|reasoning)>.*?<\/(?:action|think|thought|reasoning)>/gi, '')
    cleaned = cleaned.replace(/<(?:action|think|thought|reasoning)>.*?>/gi, '')

    // 7. Strip pipe/exclamation/dollar based markers: | motion | ! emotion |
    cleaned = cleaned.replace(/[|$!].*?[|}>]/g, '')

    // 8. Strip inline JSON metadata objects (contains "emotion" or "motion")
    const combined = inlineBuffer + cleaned
    let result = ''
    let idx = 0

    while (idx < combined.length) {
      if (combined[idx] === '{') {
        let depth = 0
        let end = -1
        for (let j = idx; j < combined.length; j++) {
          if (combined[j] === '{')
            depth++
          else if (combined[j] === '}')
            depth--
          if (depth === 0) { end = j; break }
        }

        if (end === -1) {
          inlineBuffer = combined.slice(idx)
          return result
        }

        const candidate = combined.slice(idx, end + 1)
        if (candidate.includes('"emotion"') || candidate.includes('"motion"')) {
          onMetadata?.(candidate)
          idx = end + 1
          while (idx < combined.length && (combined[idx] === ' ' || combined[idx] === '\n')) idx++
          continue
        }
        result += candidate; idx = end + 1; continue
      }
      result += combined[idx]; idx++
    }
    inlineBuffer = ''

    // 9. Strip mid-sentence asterisk actions: *waves*
    result = result.replace(/\*.*?\*/g, '')

    // 10. Final whitespace cleanup: trim start only if we are at the very beginning
    return isStartOfSpeech ? result.trimStart() : result
  }

  return {
    /**
     * Feed a chunk of text. Returns text safe to speak, or empty string if still buffering.
     */
    feed(chunk: string): string {
      // Once metadata has been stripped, still scan for inline JSON metadata
      // that the AI may embed mid-sentence (e.g., `I'm Airi! {"emotion":...} I'm a...`)
      if (metadataStripped) {
        return cleanupSpeech(chunk, false)
      }

      buffer += chunk

      // Check if we can detect the boundary between metadata and speech:
      // 1. If buffer starts with known metadata patterns, buffer it
      // 2. If buffer contains a double newline, metadata ended
      // 3. If buffer contains a closing pattern followed by a letter, metadata ended
      // 4. If buffer exceeds MAX_BUFFER, force-flush

      const trimmed = buffer.trimStart()
      // NOTICE: The marker parser upstream may strip the leading `"` or other chars from `"emotion":`,
      // so we see `emotion":{` instead. We must detect both quoted and bare keyword patterns.
      const ACT_METADATA_KEYWORDS = ['emotion', 'cognitive', 'intent', 'motion', 'action', 'state', 'idle', 'neutral', 'happy', 'sad', 'angry', 'flick', 'tap', 'confused']
      const lowerTrimmed = trimmed.toLowerCase()
      const firstChar = trimmed[0]
      const isLikelyMetadata = ACT_METADATA_KEYWORDS.some(kw =>
        lowerTrimmed.startsWith(kw) || kw.startsWith(lowerTrimmed) || lowerTrimmed.startsWith(`"${kw}`) || `"${kw}`.startsWith(lowerTrimmed) || (lowerTrimmed.includes(`${kw}:`) && lowerTrimmed.indexOf(`${kw}:`) < 10),
      )
        || firstChar === '{'
        || trimmed.startsWith('ACT:')
        || trimmed.startsWith('<|ACT')
        || firstChar === '<' // <action>
        || firstChar === '/' // /action>
        || firstChar === '\\' // \action>
        || firstChar === '$' // $action>
        || firstChar === '*' // *action*
        || firstChar === '|' // | emotion |

      if (!isLikelyMetadata) {
        // No metadata at all, release everything
        metadataStripped = true
        const result = buffer
        buffer = ''
        const cleaned = cleanupSpeech(result, true)
        if (cleaned)
          speechStarted = true
        return cleaned
      }

      // Look for boundary: double newline separates metadata from speech.
      const doubleNewlineIndex = buffer.indexOf('\n\n')
      if (doubleNewlineIndex !== -1) {
        metadataStripped = true
        const metadata = buffer.slice(0, doubleNewlineIndex)
        const afterMetadata = buffer.slice(doubleNewlineIndex + 2)
        onMetadata?.(metadata)
        buffer = ''
        const cleaned = cleanupSpeech(afterMetadata, true)
        if (cleaned)
          speechStarted = true
        return cleaned
      }

      // Look for boundary: closing quote/brace followed by space and a capital letter
      // This handles cases like: ... "motion":"lean in" Ooh, another one!
      // Regex matches: any closing char } or " + space(s) + any UpperCase letter
      const speechStartMatch = /["}]\s+[A-Z]/i.exec(buffer)
      if (speechStartMatch && speechStartMatch.index !== undefined) {
        // Verify this isn't just a capital letter inside a JSON string
        // We look for the LAST metadata keyword "motion" before this match to ensure we've passed the metadata block
        const lastMotionIdx = buffer.lastIndexOf('motion')
        if (lastMotionIdx !== -1 && speechStartMatch.index > lastMotionIdx) {
          metadataStripped = true
          const speechCharMatch = /[A-Z]/i.exec(speechStartMatch[0])
          const offset = speechCharMatch ? speechStartMatch.index + speechCharMatch.index : speechStartMatch.index + speechStartMatch[0].length - 1
          const metadata = buffer.slice(0, offset)
          const result = buffer.slice(offset)
          onMetadata?.(metadata)
          buffer = ''
          const cleaned = cleanupSpeech(result, true)
          if (cleaned)
            speechStarted = true
          return cleaned
        }
      }

      // Max buffer reached, force-strip and release
      if (buffer.length >= MAX_BUFFER) {
        metadataStripped = true
        onMetadata?.(buffer)
        const cleaned = cleanupSpeech(buffer, true)
        if (cleaned)
          speechStarted = true
        buffer = ''
        return cleaned
      }

      // Still buffering, waiting for more text
      return ''
    },

    /**
     * Flush any remaining buffered text (call at end of stream).
     */
    flush(): string {
      if (metadataStripped || buffer.length === 0) {
        const result = buffer
        buffer = ''
        return result
      }

      metadataStripped = true
      const cleaned = cleanupSpeech(buffer, !speechStarted)
      if (cleaned)
        speechStarted = true
      buffer = ''
      return cleaned
    },
  }
}

interface SendOptions {
  model: string
  chatProvider: ChatProvider
  providerConfig?: Record<string, unknown>
  attachments?: { type: 'image', data: string, mimeType: string }[]
  tools?: StreamOptions['tools']
  input?: WebSocketEventInputs
}

interface ForkOptions {
  fromSessionId?: string
  atIndex?: number
  reason?: string
  hidden?: boolean
}

interface QueuedSend {
  sendingMessage: string
  options: SendOptions
  generation: number
  sessionId: string
  cancelled?: boolean
  deferred: {
    resolve: () => void
    reject: (error: unknown) => void
  }
}

export const useChatOrchestratorStore = defineStore('chat-orchestrator', () => {
  const llmStore = useLLM()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider } = storeToRefs(consciousnessStore)
  const { trackFirstMessage } = useAnalytics()

  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)

  const sending = ref(false)
  const pendingQueuedSends = ref<QueuedSend[]>([])
  const hooks = createChatHooks()

  const sendQueue = createQueue<QueuedSend>({
    handlers: [
      async ({ data }) => {
        const { sendingMessage, options, generation, deferred, sessionId, cancelled } = data

        if (cancelled)
          return

        if (chatSession.getSessionGeneration(sessionId) !== generation) {
          deferred.reject(new Error('Chat session was reset before send could start'))
          return
        }

        try {
          await performSend(sendingMessage, options, generation, sessionId)
          deferred.resolve()
        }
        catch (error) {
          deferred.reject(error)
        }
      },
    ],
  })

  sendQueue.on('enqueue', (queuedSend) => {
    pendingQueuedSends.value = [...pendingQueuedSends.value, queuedSend]
  })

  sendQueue.on('dequeue', (queuedSend) => {
    pendingQueuedSends.value = pendingQueuedSends.value.filter(item => item !== queuedSend)
  })

  async function performSend(
    sendingMessage: string,
    options: SendOptions,
    generation: number,
    sessionId: string,
  ) {
    if (!sendingMessage && !options.attachments?.length)
      return

    chatSession.ensureSession(sessionId)

    // Inject current datetime context before composing the message
    chatContext.ingestContextMessage(createDatetimeContext())

    const sendingCreatedAt = Date.now()
    const streamingMessageContext: ChatStreamEventContext = {
      message: { role: 'user', content: sendingMessage, createdAt: sendingCreatedAt, id: nanoid() },
      contexts: chatContext.getContextsSnapshot(),
      composedMessage: [],
      input: options.input,
    }

    const isStaleGeneration = () => chatSession.getSessionGeneration(sessionId) !== generation
    const shouldAbort = () => isStaleGeneration()
    if (shouldAbort())
      return

    sending.value = true

    const isForegroundSession = () => sessionId === activeSessionId.value

    const buildingMessage: StreamingAssistantMessage = { role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now(), id: nanoid() }

    const updateUI = () => {
      if (isForegroundSession()) {
        streamingMessage.value = JSON.parse(JSON.stringify(buildingMessage))
      }
    }

    updateUI()
    trackFirstMessage()

    try {
      await hooks.emitBeforeMessageComposedHooks(sendingMessage, streamingMessageContext)

      const contentParts: CommonContentPart[] = [{ type: 'text', text: sendingMessage }]

      if (options.attachments) {
        for (const attachment of options.attachments) {
          if (attachment.type === 'image') {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${attachment.mimeType};base64,${attachment.data}`,
              },
            })
          }
        }
      }

      const finalContent = contentParts.length > 1 ? contentParts : sendingMessage
      if (!streamingMessageContext.input) {
        streamingMessageContext.input = {
          type: 'input:text',
          data: {
            text: sendingMessage,
          },
        }
      }

      if (shouldAbort())
        return

      const sessionMessagesForSend = chatSession.getSessionMessages(sessionId)
      sessionMessagesForSend.push({ role: 'user', content: finalContent, createdAt: sendingCreatedAt, id: nanoid() })
      chatSession.persistSessionMessages(sessionId)

      const categorizer = createStreamingCategorizer(activeProvider.value)
      let streamPosition = 0
      const actFilter = createActMetadataFilter((metadata) => {
        // Emit the stripped metadata as a special token so it can be picked up by motion/emotion handlers
        // We wrap it back in <|ACT:...|> if it doesn't already have it, to satisfy existing markers expectations
        const marker = metadata.trim().startsWith('<|ACT') ? metadata.trim() : `<|ACT:${metadata.trim()}|>`
        void hooks.emitTokenSpecialHooks(marker, streamingMessageContext)
      })

      const parser = useLlmmarkerParser({
        onLiteral: async (literal) => {
          if (shouldAbort())
            return

          categorizer.consume(literal)

          const speechOnly = categorizer.filterToSpeech(literal, streamPosition)
          streamPosition += literal.length

          const cleanedSpeech = actFilter.feed(speechOnly)

          if (cleanedSpeech.trim()) {
            buildingMessage.content += cleanedSpeech

            await hooks.emitTokenLiteralHooks(cleanedSpeech, streamingMessageContext)

            const lastSlice = buildingMessage.slices.at(-1)
            if (lastSlice?.type === 'text') {
              lastSlice.text += cleanedSpeech
            }
            else {
              buildingMessage.slices.push({
                type: 'text',
                text: cleanedSpeech,
              })
            }
            updateUI()
          }
        },
        onSpecial: async (special) => {
          if (shouldAbort())
            return

          await hooks.emitTokenSpecialHooks(special, streamingMessageContext)
        },
        onEnd: async (fullText) => {
          if (isStaleGeneration())
            return

          // Flush any remaining buffered text from the metadata filter
          const remaining = actFilter.flush()
          if (remaining.trim()) {
            buildingMessage.content += remaining
            await hooks.emitTokenLiteralHooks(remaining, streamingMessageContext)
            const lastSlice = buildingMessage.slices.at(-1)
            if (lastSlice?.type === 'text') {
              lastSlice.text += remaining
            }
            else {
              buildingMessage.slices.push({ type: 'text', text: remaining })
            }
            updateUI()
          }

          const finalCategorization = categorizeResponse(fullText, activeProvider.value)

          buildingMessage.categorization = {
            speech: finalCategorization.speech,
            reasoning: finalCategorization.reasoning,
          }
          updateUI()
        },
        minLiteralEmitLength: 24,
      })

      const toolCallQueue = createQueue<ChatSlices>({
        handlers: [
          async (ctx) => {
            if (shouldAbort())
              return
            if (ctx.data.type === 'tool-call') {
              buildingMessage.slices.push(ctx.data)
              updateUI()
              return
            }

            if (ctx.data.type === 'tool-call-result') {
              buildingMessage.tool_results.push(ctx.data)
              updateUI()
            }
          },
        ],
      })

      let newMessages = sessionMessagesForSend.map((msg) => {
        const { context: _context, id: _id, createdAt: _createdAt, ...withoutContext } = msg
        const rawMessage = toRaw(withoutContext)

        if (rawMessage.role === 'assistant') {
          const { slices: _slices, tool_results: _toolResults, categorization: _categorization, ...rest } = rawMessage as ChatAssistantMessage
          return toRaw(rest)
        }

        return rawMessage
      })

      const contextsSnapshot = chatContext.getContextsSnapshot()
      if (Object.keys(contextsSnapshot).length > 0) {
        const system = newMessages.slice(0, 1)
        const afterSystem = newMessages.slice(1, newMessages.length)

        newMessages = [
          ...system,
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: ''
                  + 'These are the contextual information retrieved or on-demand updated from other modules, you may use them as context for chat, or reference of the next action, tool call, etc.:\n'
                  + `${Object.entries(contextsSnapshot).map(([key, value]) => `Module ${key}: ${JSON.stringify(value)}`).join('\n')}\n`,
              },
            ],
          },
          ...afterSystem,
        ]
      }

      streamingMessageContext.composedMessage = newMessages as Message[]

      await hooks.emitAfterMessageComposedHooks(sendingMessage, streamingMessageContext)
      await hooks.emitBeforeSendHooks(sendingMessage, streamingMessageContext)

      let fullText = ''
      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      if (shouldAbort())
        return

      await llmStore.stream(options.model, options.chatProvider, newMessages as Message[], {
        headers,
        tools: options.tools,
        onStreamEvent: async (event: StreamEvent) => {
          switch (event.type) {
            case 'tool-call':
              toolCallQueue.enqueue({
                type: 'tool-call',
                toolCall: event,
              })

              break
            case 'tool-result':
              toolCallQueue.enqueue({
                type: 'tool-call-result',
                id: event.toolCallId,
                result: event.result,
              })

              break
            case 'text-delta':
              fullText += event.text
              await parser.consume(event.text)
              break
            case 'finish':
              break
            case 'error':
              throw event.error ?? new Error('Stream error')
          }
        },
      })

      await parser.end()

      if (!isStaleGeneration() && buildingMessage.slices.length > 0) {
        sessionMessagesForSend.push(toRaw(buildingMessage))
        chatSession.persistSessionMessages(sessionId)
      }

      await hooks.emitStreamEndHooks(streamingMessageContext)
      await hooks.emitAssistantResponseEndHooks(fullText, streamingMessageContext)

      await hooks.emitAfterSendHooks(sendingMessage, streamingMessageContext)
      await hooks.emitAssistantMessageHooks({ ...buildingMessage }, fullText, streamingMessageContext)
      await hooks.emitChatTurnCompleteHooks({
        output: { ...buildingMessage },
        outputText: fullText,
        toolCalls: sessionMessagesForSend.filter(msg => msg.role === 'tool') as ToolMessage[],
      }, streamingMessageContext)

      if (isForegroundSession()) {
        streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
      }
    }
    catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
    finally {
      sending.value = false
    }
  }

  async function ingest(
    sendingMessage: string,
    options: SendOptions,
    targetSessionId?: string,
  ) {
    const sessionId = targetSessionId || activeSessionId.value
    const generation = chatSession.getSessionGeneration(sessionId)

    return new Promise<void>((resolve, reject) => {
      sendQueue.enqueue({
        sendingMessage,
        options,
        generation,
        sessionId,
        deferred: { resolve, reject },
      })
    })
  }

  async function ingestOnFork(
    sendingMessage: string,
    options: SendOptions,
    forkOptions?: ForkOptions,
  ) {
    const baseSessionId = forkOptions?.fromSessionId ?? activeSessionId.value
    if (!forkOptions)
      return ingest(sendingMessage, options, baseSessionId)

    const forkSessionId = await chatSession.forkSession({
      fromSessionId: baseSessionId,
      atIndex: forkOptions.atIndex,
      reason: forkOptions.reason,
      hidden: forkOptions.hidden,
    })
    return ingest(sendingMessage, options, forkSessionId || baseSessionId)
  }

  function cancelPendingSends(sessionId?: string) {
    for (const queued of pendingQueuedSends.value) {
      if (sessionId && queued.sessionId !== sessionId)
        continue

      queued.cancelled = true
      queued.deferred.reject(new Error('Chat session was reset before send could start'))
    }

    pendingQueuedSends.value = sessionId
      ? pendingQueuedSends.value.filter(item => item.sessionId !== sessionId)
      : []
  }

  return {
    sending,

    discoverToolsCompatibility: llmStore.discoverToolsCompatibility,

    ingest,
    ingestOnFork,
    cancelPendingSends,

    clearHooks: hooks.clearHooks,

    emitBeforeMessageComposedHooks: hooks.emitBeforeMessageComposedHooks,
    emitAfterMessageComposedHooks: hooks.emitAfterMessageComposedHooks,
    emitBeforeSendHooks: hooks.emitBeforeSendHooks,
    emitAfterSendHooks: hooks.emitAfterSendHooks,
    emitTokenLiteralHooks: hooks.emitTokenLiteralHooks,
    emitTokenSpecialHooks: hooks.emitTokenSpecialHooks,
    emitStreamEndHooks: hooks.emitStreamEndHooks,
    emitAssistantResponseEndHooks: hooks.emitAssistantResponseEndHooks,
    emitAssistantMessageHooks: hooks.emitAssistantMessageHooks,
    emitChatTurnCompleteHooks: hooks.emitChatTurnCompleteHooks,

    onBeforeMessageComposed: hooks.onBeforeMessageComposed,
    onAfterMessageComposed: hooks.onAfterMessageComposed,
    onBeforeSend: hooks.onBeforeSend,
    onAfterSend: hooks.onAfterSend,
    onTokenLiteral: hooks.onTokenLiteral,
    onTokenSpecial: hooks.onTokenSpecial,
    onStreamEnd: hooks.onStreamEnd,
    onAssistantResponseEnd: hooks.onAssistantResponseEnd,
    onAssistantMessage: hooks.onAssistantMessage,
    onChatTurnComplete: hooks.onChatTurnComplete,
  }
})
