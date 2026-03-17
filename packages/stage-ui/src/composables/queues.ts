import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { EmotionPayload } from '../constants/emotions'

import { sleep } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { Emotion, EMOTION_VALUES } from '../constants/emotions'

export function useEmotionsMessageQueue(emotionsQueue: UseQueueReturn<EmotionPayload>) {
  const normalizeEmotionName = (value: string): Emotion | null => {
    const normalized = value.trim().toLowerCase()
    if (EMOTION_VALUES.includes(normalized as Emotion))
      return normalized as Emotion
    return null
  }

  const normalizeIntensity = (value: unknown): number => {
    if (typeof value !== 'number' || Number.isNaN(value))
      return 1
    return Math.min(1, Math.max(0, value))
  }

  /**
   * Extract the outermost JSON object from a string that contains
   * `"emotion"` or `"motion"` keywords. Uses brace-depth counting
   * so it works even when speech text is mixed in before the JSON.
   */
  function extractJsonFromContent(content: string): string | null {
    // Find the first '{' that is followed somewhere by "emotion" or "motion"
    for (let i = 0; i < content.length; i++) {
      if (content[i] !== '{')
        continue

      let depth = 0
      let end = -1
      for (let j = i; j < content.length; j++) {
        if (content[j] === '{')
          depth++
        else if (content[j] === '}')
          depth--

        if (depth === 0) {
          end = j
          break
        }
      }

      if (end === -1)
        continue

      const candidate = content.slice(i, end + 1)
      // Only accept if it looks like our metadata JSON
      if (candidate.includes('"emotion"') || candidate.includes('"motion"'))
        return candidate
    }

    return null
  }

  function parseActEmotion(content: string) {
    // First try the ACT marker format
    const match = /<\|ACT:?([\s\S]*?)\|>/i.exec(content)
    const rawContent = match ? match[1].trim() : content.trim()

    // Extract the JSON object from possibly mixed content
    const jsonStr = extractJsonFromContent(rawContent)
    if (!jsonStr)
      return { ok: false, emotion: null as EmotionPayload | null }

    try {
      const payload = JSON.parse(jsonStr) as { emotion?: unknown, motion?: unknown }
      const emotion = payload?.emotion
      const motion = typeof payload?.motion === 'string' ? payload.motion : undefined

      if (typeof emotion === 'string') {
        const normalized = normalizeEmotionName(emotion)
        if (normalized)
          return { ok: true, emotion: { name: normalized, intensity: 1, motion } }
      }
      else if (emotion && typeof emotion === 'object' && !Array.isArray(emotion)) {
        if ('name' in emotion && typeof (emotion as { name?: unknown }).name === 'string') {
          const normalized = normalizeEmotionName((emotion as { name: string }).name)
          if (normalized) {
            const intensity = normalizeIntensity((emotion as { intensity?: unknown }).intensity)
            return { ok: true, emotion: { name: normalized, intensity, motion } }
          }
        }
      }
      // If only motion is provided
      if (motion) {
        return { ok: true, emotion: { name: Emotion.Neutral, intensity: 1, motion } }
      }
    }
    catch (e) {
      // eslint-disable-next-line no-console
      console.debug(`[parseActEmotion] Failed to parse extracted JSON: "${jsonStr}"`, e)
    }

    return { ok: false, emotion: null as EmotionPayload | null }
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        const actParsed = parseActEmotion(ctx.data)
        if (actParsed.ok && actParsed.emotion) {
          ctx.emit('emotion', actParsed.emotion)
          emotionsQueue.enqueue(actParsed.emotion)
        }
      },
    ],
  })
}

export function useDelayMessageQueue() {
  function splitDelays(content: string) {
    if (!(/<\|DELAY:\d+\|>/i.test(content))) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delayExecArray = /<\|DELAY:(\d+)\|>/i.exec(content)

    const delay = delayExecArray?.[1]
    if (!delay) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delaySeconds = Number.parseFloat(delay)

    if (delaySeconds <= 0 || Number.isNaN(delaySeconds)) {
      return {
        ok: true,
        delay: 0,
      }
    }

    return {
      ok: true,
      delay: delaySeconds,
    }
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        const { ok, delay } = splitDelays(ctx.data)
        if (ok) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
        }
      },
    ],
  })
}
