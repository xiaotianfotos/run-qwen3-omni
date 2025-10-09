export interface ScreenConfig {
  width: number
  height: number
  frameRate: number
  quality: number
  format: 'jpeg' | 'png'
  compression: number
  captureInterval?: number
}

export interface ScreenCaptureOptions {
  video: {
    cursor: 'always' | 'never' | 'motion'
    displaySurface: 'monitor' | 'window' | 'browser'
    logicalSurface: boolean
  }
  audio: boolean
  preferCurrentTab: boolean
  selfBrowserSurface: 'exclude' | 'include'
  systemAudio: 'include' | 'exclude'
}

export interface ScreenStream {
  id: string
  active: boolean
  videoTrack: MediaStreamTrack | null
  audioTrack: MediaStreamTrack | null
  settings: MediaTrackSettings
}

export interface ScreenshotData {
  id: string
  image: string
  format: 'jpeg' | 'png'
  width: number
  height: number
  timestamp: number
  size: number
}

export interface ScreenCaptureState {
  isCapturing: boolean
  isPaused: boolean
  currentStream: ScreenStream | null
  lastScreenshot: ScreenshotData | null
  screenshotHistory: ScreenshotData[]
  captureInterval: number
  totalCaptures: number
}

export interface DisplayInfo {
  displayId: string
  name: string
  isPrimary: boolean
  isInternal: boolean
  width: number
  height: number
  devicePixelRatio: number
  refreshRate: number
}

export interface RegionOfInterest {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenPermission {
  granted: boolean
  reason: string
  timestamp: number
}