/**
 * Type definitions for Whisper Worker messages
 */

export interface EventLoading {
  status: 'loading'
  data: string
}

export interface EventInitiate {
  status: 'initiate'
  name: string
  file: string
  progress?: number
  loaded?: number
  total?: number
}

export interface EventDownload {
  status: 'download'
  name: string
  file: string
  progress?: number
  loaded?: number
  total?: number
}

export interface EventProgress {
  status: 'progress'
  name: string
  file: string
  progress: number
  loaded: number
  total: number
}

export interface EventDone {
  status: 'done'
  name: string
  file: string
}

export interface EventReady {
  status: 'ready'
}

export interface EventStart {
  status: 'start'
}

export interface EventUpdate {
  status: 'update'
  tps: number
  output: any // ModelOutput | Tensor
  numTokens: number
}

export interface EventComplete {
  status: 'complete'
  output: string[]
}

export type WorkerResponse
  = | EventLoading
    | EventInitiate
    | EventDownload
    | EventProgress
    | EventDone
    | EventReady
    | EventStart
    | EventUpdate
    | EventComplete

export interface LoadMessage {
  type: 'load'
}

export interface GenerateMessage {
  type: 'generate'
  data: {
    audio: string // base64
    language: string
  }
}

export type WorkerRequest = LoadMessage | GenerateMessage
