/**
 * Kokoro TTS Web Worker Entry Point
 * This file is imported as a Web Worker
 */

import type { ErrorMessage, LoadedMessage, ProgressMessage, SuccessMessage, VoiceKey, WorkerRequest } from './types'

import { KokoroTTS } from 'kokoro-js'

let ttsModel: KokoroTTS | null = null
let currentQuantization: string | null = null
let currentDevice: string | null = null

interface GenerateRequest {
  text: string
  voice: VoiceKey
}

async function loadModel(quantization: string, device: string) {
  // Check if we already have the correct model loaded
  if (ttsModel && currentQuantization === quantization && currentDevice === device) {
    const message: LoadedMessage = {
      type: 'loaded',
      voices: ttsModel.voices,
    }
    globalThis.postMessage(message)
    return
  }

  // Match quantization string to supported dtypes
  const modelQuantization = quantization as 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'

  // Clean up previous model before loading a new one
  if (ttsModel) {
    try {
      if (typeof (ttsModel as any).dispose === 'function') {
        (ttsModel as any).dispose()
      }
    }
    catch (e) {
      console.warn('[Kokoro Worker] Failed to dispose previous model', e)
    }
    finally {
      ttsModel = null
    }
  }

  ttsModel = await KokoroTTS.from_pretrained(
    'onnx-community/Kokoro-82M-v1.0-ONNX',
    {
      dtype: modelQuantization,
      device: device as 'wasm' | 'webgpu' | 'cpu',
      progress_callback: (progress) => {
        const message: ProgressMessage = {
          type: 'progress',
          progress,
        }
        globalThis.postMessage(message)
      },
    },
  )

  // Store the current settings
  currentQuantization = quantization
  currentDevice = device

  const message: LoadedMessage = {
    type: 'loaded',
    voices: ttsModel.voices,
  }
  globalThis.postMessage(message)
}

async function generate(request: GenerateRequest) {
  const { text, voice } = request
  console.log(`[Kokoro Worker] Starting generation for: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" with voice: ${voice}`)

  try {
    if (!ttsModel) {
      throw new Error('Kokoro TTS generation failed: No model loaded.')
    }

    // Generate audio from text
    const startTime = performance.now()
    const result = await ttsModel.generate(text, {
      voice,
    })
    const endTime = performance.now()
    console.log(`[Kokoro Worker] Generation completed in ${(endTime - startTime).toFixed(2)}ms`)

    const blob = await result.toBlob()
    const buffer: ArrayBuffer = await blob.arrayBuffer()

    console.log(`[Kokoro Worker] Audio produced: ${buffer.byteLength} bytes`)

    if (buffer.byteLength < 1000) {
      console.warn('[Kokoro Worker] Generated audio buffer is suspiciously small. This might be silence.')
    }

    // Send the audio buffer back to the main thread
    const successMessage: SuccessMessage = {
      type: 'result',
      status: 'success',
      buffer,
    }
    const transferList: ArrayBuffer[] = [buffer]
    ;(globalThis as any).postMessage(successMessage, transferList)
  }
  catch (error) {
    console.error('[Kokoro Worker] Generation error:', error)
    const errorMessage: ErrorMessage = {
      type: 'result',
      status: 'error',
      message: error instanceof Error ? error.message : 'Kokoro TTS generation failed: An unknown error occurred.',
    }
    globalThis.postMessage(errorMessage)
  }
}

// Listen for messages from the main thread
globalThis.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  switch (message.type) {
    case 'load':
      await loadModel(message.data.quantization, message.data.device)
      break

    case 'generate':
      await generate(message.data)
      break

    default:
      console.warn('[Kokoro Worker] Unknown message type:', (message as any).type)
  }
})
