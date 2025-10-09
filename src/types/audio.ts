export interface AudioConfig {
  sampleRate: number
  channelCount: number
  bufferSize: number
  inputVolume: number
  outputVolume: number
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
}

export interface AudioStream {
  id: string
  active: boolean
  muted: boolean
  volume: number
  sampleRate: number
  channelCount: number
}

export interface AudioBuffer {
  data: ArrayBuffer
  format: 'pcm16'
  sampleRate: number
  duration: number
  timestamp: number
}

export interface AudioVisualizationData {
  volume: number
  frequency: Uint8Array
  timeData: Uint8Array
  timestamp: number
}

export interface AudioRecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  fileSize: number
  audioBuffer: AudioBuffer[]
  currentBuffer: AudioBuffer | null
}

export interface AudioPlaybackState {
  isPlaying: boolean
  isPaused: boolean
  currentTime: number
  duration: number
  volume: number
  playbackRate: number
}

export interface AudioDevice {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
  groupId: string
  isDefault: boolean
}

export interface AudioConstraints {
  deviceId?: string
  autoGainControl?: boolean
  echoCancellation?: boolean
  noiseSuppression?: boolean
  sampleRate?: number
  channelCount?: number
}