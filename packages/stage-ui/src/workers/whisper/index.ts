/**
 * Whisper Transcription Worker Manager
 * Manages communication with the Whisper worker thread
 */

import type { WorkerRequest, WorkerResponse } from './types'

const LOAD_MODEL_TIMEOUT = 300000 // 5 minutes (models can be large)
const GENERATE_TIMEOUT = 120000 // 2 minutes

/**
 * An async mutex that ensures only one callback runs at a time.
 */
class AsyncMutex {
  private locked = false
  private waiters: { resolve: () => void, reject: (error: Error) => void }[] = []
  private generation = 0

  async run<T>(callback: () => Promise<T> | T): Promise<T> {
    const myGeneration = this.generation

    if (this.locked) {
      await new Promise<void>((resolve, reject) => {
        this.waiters.push({ resolve, reject })
      })
      if (myGeneration !== this.generation) {
        throw new Error('Mutex was reset')
      }
    }
    this.locked = true

    try {
      return await callback()
    }
    finally {
      if (myGeneration === this.generation) {
        const next = this.waiters.shift()
        if (next) {
          next.resolve()
        }
        else {
          this.locked = false
        }
      }
    }
  }

  reset(error: Error = new Error('Mutex reset')): void {
    this.generation++
    this.locked = false
    const waitersToReject = this.waiters
    this.waiters = []
    for (const waiter of waitersToReject) {
      waiter.reject(error)
    }
  }
}

interface WaitForEventOptions<T extends Event> {
  predicate?: (event: T) => boolean
  callback?: (event: T) => void
  timeout?: number
  timeoutError?: Error
}

function waitForEvent<T extends Event>(
  element: EventTarget,
  eventName: string,
  options: WaitForEventOptions<T> = {},
): Promise<T> {
  const {
    predicate = () => true,
    callback = () => {},
    timeout,
    timeoutError = new Error(`Timeout waiting for event: ${eventName}`),
  } = options

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const listener = (event: Event) => {
      const typedEvent = event as T
      if (predicate(typedEvent)) {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
        element.removeEventListener(eventName, listener)
        resolve(typedEvent)
      }
      else {
        callback(typedEvent)
      }
    }

    element.addEventListener(eventName, listener)

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        element.removeEventListener(eventName, listener)
        reject(timeoutError)
      }, timeout)
    }
  })
}

export class WhisperWorkerManager {
  private worker: Worker | null = null
  private asyncMutex: AsyncMutex
  private workerLifecycleAsyncMutex: AsyncMutex

  private restartAttempts = 0
  private readonly maxRestartAttempts = 3
  private readonly restartDelayMs = 1000
  private isModelLoaded = false

  constructor() {
    this.workerLifecycleAsyncMutex = new AsyncMutex()
    this.asyncMutex = new AsyncMutex()
  }

  public async start(): Promise<void> {
    await this.workerLifecycleAsyncMutex.run(async () => {
      if (!this.worker) {
        this.initializeWorker()
      }
    })
  }

  private initializeWorker(): void {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })

    this.worker.addEventListener('error', this.handleWorkerError.bind(this))
  }

  private handleWorkerError(event: ErrorEvent | Error): void {
    const error = event instanceof Error ? event : new Error(event.message ?? 'An unknown Whisper worker error occurred')
    this.asyncMutex.reset(error)
    this.terminate()
    this.scheduleRestart()
  }

  private scheduleRestart(): void {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(`[WhisperWorker] Max restart attempts (${this.maxRestartAttempts}) reached.`)
      return
    }

    this.restartAttempts++
    const delay = this.restartDelayMs * this.restartAttempts

    setTimeout(() => {
      this.start().catch((err) => {
        console.error('[WhisperWorker] Failed to restart worker:', err)
      })
    }, delay)
  }

  private onSuccessfulOperation(): void {
    this.restartAttempts = 0
  }

  async loadModel(options?: { onProgress?: (progress: any) => void }): Promise<void> {
    await this.start()
    return await this.asyncMutex.run(async () => {
      const readyPromise = waitForEvent<MessageEvent<WorkerResponse>>(
        this.worker!,
        'message',
        {
          predicate: event => event.data.status === 'ready',
          timeout: LOAD_MODEL_TIMEOUT,
          callback: (event) => {
            if ((event.data.status === 'progress' || event.data.status === 'initiate') && options?.onProgress) {
              options.onProgress(event.data)
            }
          },
        },
      )
      const message: WorkerRequest = { type: 'load' }
      this.worker!.postMessage(message)
      await readyPromise
      this.isModelLoaded = true
      this.onSuccessfulOperation()
    }).catch((error) => {
      this.handleWorkerError(error)
      return Promise.reject(error)
    })
  }

  async generate(audio: string, language: string): Promise<string[]> {
    await this.start()

    // Auto-load model if not loaded
    if (!this.isModelLoaded) {
      await this.loadModel()
    }

    return await this.asyncMutex.run(async () => {
      if (!this.worker) {
        throw new Error('Worker failed to initialize')
      }

      const resultPromise = waitForEvent<MessageEvent<WorkerResponse>>(
        this.worker,
        'message',
        {
          predicate: event => event.data.status === 'complete',
          timeout: GENERATE_TIMEOUT,
        },
      )
      const message: WorkerRequest = {
        type: 'generate',
        data: { audio, language },
      }
      this.worker.postMessage(message)
      const event = await resultPromise
      this.onSuccessfulOperation()
      return (event.data as any).output
    }).catch((error) => {
      this.handleWorkerError(error)
      return Promise.reject(error)
    })
  }

  private terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}

let globalWorkerManager: WhisperWorkerManager | null = null
const globalWorkerManagerGetterLock: AsyncMutex = new AsyncMutex()

export async function getWhisperWorker(): Promise<WhisperWorkerManager> {
  return globalWorkerManagerGetterLock.run(async () => {
    if (!globalWorkerManager) {
      globalWorkerManager = new WhisperWorkerManager()
      await globalWorkerManager.start()
    }
    return globalWorkerManager
  })
}
