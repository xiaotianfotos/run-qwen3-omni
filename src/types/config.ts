export interface AppConfig {
  api: {
    baseUrl: string
    apiKey: string
    timeout: number
    retryAttempts: number
  }
  websocket: {
    url: string
    reconnectInterval: number
    maxReconnectAttempts: number
    heartbeatInterval: number
  }
  audio: {
    inputDeviceId?: string
    outputDeviceId?: string
    sampleRate: number
    channelCount: number
    bufferSize: number
    echoCancellation: boolean
    noiseSuppression: boolean
    autoGainControl: boolean
    inputVolume: number
    outputVolume: number
  }
  screen: {
    width: number
    height: number
    frameRate: number
    quality: number
    format: 'jpeg' | 'png'
    compression: number
    captureInterval: number
  }
  omni: {
    model: string
    voice: string
    modalities: ('text' | 'audio')[]
    inputAudioFormat: 'pcm16'
    outputAudioFormat: 'pcm24'
    smoothOutput: boolean | null
    turnDetection: {
      type: 'server_vad'
      threshold: number
      silenceDurationMs: number
      createResponse: boolean
      interruptResponse: boolean
    } | null
  }
  ui: {
    theme: 'light' | 'dark'
    language: 'zh' | 'en'
    showTranscript: boolean
    showVisualization: boolean
    autoScroll: boolean
  }
  conversation: {
    sendHistoryImages: boolean
  }
  debug: {
    enabled: boolean
    logLevel: 'error' | 'warn' | 'info' | 'debug'
    showDevTools: boolean
  }
}

export interface AppSessionConfig {
  id: string
  apiKey: string
  websocketUrl: string
  model: string
  voice: string
  modalities: ('text' | 'audio')[]
  inputAudioFormat: 'pcm16'
  outputAudioFormat: 'pcm24'
  smoothOutput: boolean | null
  turnDetection: {
    type: 'server_vad'
    threshold: number
    silenceDurationMs: number
    createResponse: boolean
    interruptResponse: boolean
  } | null
  inputAudioTranscription: {
    model: string
  } | null
  createdAt: Date
  updatedAt: Date
}