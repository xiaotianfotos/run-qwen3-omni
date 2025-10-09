export * from './websocket'
export * from './audio'
export * from './screen'
export * from './config'

export interface StoreState {
  connection: {
    isConnected: boolean
    apiKey: string
    sessionConfig: any
    connectionError: string | null
    reconnectAttempts: number
  }
  audio: {
    isRecording: boolean
    isPlaying: boolean
    volumeLevel: number
    audioBuffer: ArrayBuffer[]
    recordingState: 'idle' | 'recording' | 'paused' | 'stopped'
    playbackState: 'idle' | 'playing' | 'paused' | 'stopped'
  }
  screen: {
    isCapturing: boolean
    lastScreenshot: string | null
    captureInterval: number
    resolution: { width: number; height: number }
    screenshotHistory: string[]
    captureState: 'idle' | 'capturing' | 'paused' | 'stopped'
  }
  conversation: {
    messages: Array<{
      id: string
      role: 'user' | 'assistant' | 'system'
      content: any
      timestamp: Date
      type: 'text' | 'audio' | 'image'
    }>
    isProcessing: boolean
    currentResponse: string | null
    transcription: string | null
  }
}

export type AppError = {
  code: string
  message: string
  details?: any
  timestamp: Date
}

export interface AppEvent {
  type: string
  payload?: any
  timestamp: Date
}

export interface ModuleConfig {
  name: string
  version: string
  enabled: boolean
  dependencies?: string[]
  config?: any
}