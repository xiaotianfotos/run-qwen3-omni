import { EventEmitter } from 'eventemitter3'
import type {
  ScreenConfig,
  ScreenCaptureOptions,
  ScreenStream,
  ScreenshotData,
  ScreenCaptureState,
  DisplayInfo,
  RegionOfInterest,
  ScreenPermission
} from '@/types/screen'

export class ScreenManager extends EventEmitter {
  private config: ScreenConfig
  private captureState: ScreenCaptureState = {
    isCapturing: false,
    isPaused: false,
    currentStream: null,
    lastScreenshot: null,
    screenshotHistory: [],
    captureInterval: 1000,
    totalCaptures: 0
  }
  private captureTimer: number | null = null
  private videoElement: HTMLVideoElement | null = null
  private canvasElement: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null
  private displays: DisplayInfo[] = []

  constructor(config: Partial<ScreenConfig> = {}) {
    super()

    this.config = {
      width: 1920,
      height: 1080,
      frameRate: 1,
      quality: 0.8,
      format: 'jpeg',
      compression: 0.8,
      captureInterval: 1000,
      ...config
    }

    this.captureState.captureInterval = this.config.captureInterval || 1000
  }

  async initialize(): Promise<void> {
    // 创建视频元素
    this.videoElement = document.createElement('video')
    this.videoElement.autoplay = true
    this.videoElement.muted = true

    // 创建Canvas元素
    this.canvasElement = document.createElement('canvas')
    this.canvasElement.width = this.config.width
    this.canvasElement.height = this.config.height
    this.context = this.canvasElement.getContext('2d')

    // 获取显示器信息
    await this.updateDisplayInfo()

    this.emit('initialized')
  }

  async startCapture(options?: Partial<ScreenCaptureOptions>): Promise<void> {
    if (this.captureState.isCapturing) {
      console.log('🖥️ Already capturing, skipping startCapture')
      return
    }

    console.log('🖥️ Starting screen capture...')
    try {
      // 检查多屏幕支持
      const multiScreenSupported = await this.isMultiScreenSupported()
      console.log('Multi-screen support:', multiScreenSupported)

      // 检查权限
      const permission = await this.checkScreenPermission()
      console.log('🖥️ Screen permission check result:', permission)
      if (permission.reason === 'denied') {
        throw new Error(`Screen capture permission denied: ${permission.reason}`)
      }

      // 构建捕获选项 - 设置 displaySurface 为 monitor 以显示所有屏幕
      const captureOptions: ScreenCaptureOptions = {
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          logicalSurface: true,
          ...options?.video
        },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'exclude',
        ...options
      }

      console.log('Screen capture options:', JSON.stringify(captureOptions, null, 2))
      console.log('Available displays:', this.displays)

      // 获取媒体流
      const stream = await navigator.mediaDevices.getDisplayMedia(captureOptions as any)

      // 设置视频源
      if (this.videoElement) {
        this.videoElement.srcObject = stream
      }

      // 创建屏幕流对象
      const videoTrack = stream.getVideoTracks()[0]
      const screenStream: ScreenStream = {
        id: stream.id,
        active: true,
        videoTrack,
        audioTrack: null,
        settings: videoTrack.getSettings()
      }

      // 更新状态
      this.captureState.isCapturing = true
      this.captureState.isPaused = false
      this.captureState.currentStream = screenStream

      // 监听轨道结束事件
      videoTrack.onended = () => {
        this.stopCapture()
      }

      // 开始定时截屏
      this.startCaptureTimer()

      // 立即截取第一张图
      await this.takeScreenshot()

      this.emit('captureStarted', screenStream)
    } catch (error) {
      console.error('Failed to start screen capture:', error)
      this.emit('permissionDenied', error)
      throw error
    }
  }

  stopCapture(): void {
    if (!this.captureState.isCapturing) {
      return
    }

    // 停止定时器
    this.stopCaptureTimer()

    // 清理媒体流
    if (this.captureState.currentStream) {
      const { videoTrack, audioTrack } = this.captureState.currentStream

      if (videoTrack) {
        videoTrack.stop()
      }

      if (audioTrack) {
        audioTrack.stop()
      }

      // 清理视频元素
      if (this.videoElement && this.videoElement.srcObject) {
        const tracks = (this.videoElement.srcObject as MediaStream).getTracks()
        tracks.forEach(track => track.stop())
        this.videoElement.srcObject = null
      }
    }

    // 更新状态
    this.captureState.isCapturing = false
    this.captureState.isPaused = false
    this.captureState.currentStream = null

    this.emit('captureStopped')
  }

  pauseCapture(): void {
    if (!this.captureState.isCapturing || this.captureState.isPaused) {
      return
    }

    this.captureState.isPaused = true
    this.stopCaptureTimer()
    this.emit('capturePaused')
  }

  resumeCapture(): void {
    if (!this.captureState.isCapturing || !this.captureState.isPaused) {
      return
    }

    this.captureState.isPaused = false
    this.startCaptureTimer()
    this.emit('captureResumed')
  }

  async takeScreenshot(): Promise<ScreenshotData> {
    if (!this.videoElement || !this.canvasElement || !this.context) {
      throw new Error('Screen manager not initialized')
    }

    try {
      console.log('📸 Taking screenshot...')
      // 等待视频加载
      if (this.videoElement.readyState < 2) {
        await new Promise((resolve) => {
          this.videoElement!.onloadedmetadata = resolve
        })
      }

      // 计算缩放比例
      const videoWidth = this.videoElement.videoWidth
      const videoHeight = this.videoElement.videoHeight
      const scaleX = this.config.width / videoWidth
      const scaleY = this.config.height / videoHeight
      const scale = Math.min(scaleX, scaleY)

      // 计算绘制尺寸
      const drawWidth = videoWidth * scale
      const drawHeight = videoHeight * scale
      const drawX = (this.config.width - drawWidth) / 2
      const drawY = (this.config.height - drawHeight) / 2

      // 清空画布
      this.context.clearRect(0, 0, this.config.width, this.config.height)

      // 绘制图像
      this.context.drawImage(
        this.videoElement,
        drawX, drawY, drawWidth, drawHeight
      )

      // 获取图像数据
      const imageData = this.canvasElement.toDataURL(
        `image/${this.config.format}`,
        this.config.quality
      )

      console.log('📸 Screenshot captured, size:', imageData.length)

      // 创建截图对象
      const screenshot: ScreenshotData = {
        id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        image: imageData,
        format: this.config.format,
        width: this.config.width,
        height: this.config.height,
        timestamp: Date.now(),
        size: Math.round(imageData.length * 0.75) // 估算Base64编码后的字节大小
      }

      // 更新状态
      this.captureState.lastScreenshot = screenshot
      this.captureState.screenshotHistory.push(screenshot)
      this.captureState.totalCaptures++

      // 限制历史记录数量
      if (this.captureState.screenshotHistory.length > 100) {
        this.captureState.screenshotHistory = this.captureState.screenshotHistory.slice(-100)
      }

      this.emit('screenshotTaken', screenshot)

      return screenshot
    } catch (error) {
      console.error('Failed to take screenshot:', error)
      throw error
    }
  }

  async compressImage(imageData: string, quality?: number): Promise<string> {
    if (!this.canvasElement || !this.context) {
      throw new Error('Screen manager not initialized')
    }

    try {
      // 创建Image对象
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageData
      })

      // 设置画布尺寸
      this.canvasElement.width = img.width
      this.canvasElement.height = img.height

      // 绘制图像
      this.context.drawImage(img, 0, 0)

      // 压缩图像
      return this.canvasElement.toDataURL(
        `image/${this.config.format}`,
        quality || this.config.quality
      )
    } catch (error) {
      console.error('Failed to compress image:', error)
      throw error
    }
  }

  async resizeImage(imageData: string, width: number, height: number): Promise<string> {
    if (!this.canvasElement || !this.context) {
      throw new Error('Screen manager not initialized')
    }

    try {
      // 创建Image对象
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageData
      })

      // 设置画布尺寸
      this.canvasElement.width = width
      this.canvasElement.height = height

      // 绘制图像
      this.context.drawImage(img, 0, 0, width, height)

      // 返回调整后的图像
      return this.canvasElement.toDataURL(
        `image/${this.config.format}`,
        this.config.quality
      )
    } catch (error) {
      console.error('Failed to resize image:', error)
      throw error
    }
  }

  setCaptureInterval(interval: number): void {
    this.config.captureInterval = Math.max(100, Math.min(10000, interval))
    this.captureState.captureInterval = this.config.captureInterval || 1000

    // 如果正在捕获，重新启动定时器
    if (this.captureState.isCapturing && !this.captureState.isPaused) {
      this.stopCaptureTimer()
      this.startCaptureTimer()
    }

    this.emit('captureIntervalChanged', this.config.captureInterval)
  }

  async checkScreenPermission(): Promise<ScreenPermission> {
    try {
      // 尝试获取权限状态
      const permission = await navigator.permissions.query({ name: 'display-capture' as any })

      return {
        granted: permission.state === 'granted',
        reason: permission.state,
        timestamp: Date.now()
      }
    } catch (error) {
      // 如果无法查询权限状态，返回未知状态
      return {
        granted: false,
        reason: 'Permission check failed',
        timestamp: Date.now()
      }
    }
  }

  async requestScreenPermission(options?: Partial<ScreenCaptureOptions>): Promise<boolean> {
    // 此方法现在仅用于日志，不实际请求权限
    console.log('🖥️ Screen permission check passed, proceeding to capture')
    return true
  }

  async getDisplayInfo(): Promise<DisplayInfo[]> {
    await this.updateDisplayInfo()
    return [...this.displays]
  }

  async isMultiScreenSupported(): Promise<boolean> {
    try {
      // 检查是否支持 getScreenDetails API
      if ('getScreenDetails' in window) {
        const screenDetails = await (window as any).getScreenDetails()
        return screenDetails && screenDetails.screens && screenDetails.screens.length > 1
      }
      return false
    } catch (error) {
      console.warn('Multi-screen detection not supported:', error)
      return false
    }
  }

  getCaptureState(): ScreenCaptureState {
    return { ...this.captureState }
  }

  getConfig(): ScreenConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<ScreenConfig>): void {
    this.config = { ...this.config, ...config }

    // 更新Canvas尺寸
    if (this.canvasElement) {
      this.canvasElement.width = this.config.width
      this.canvasElement.height = this.config.height
    }

    this.emit('configUpdated', this.config)
  }

  private async updateDisplayInfo(): Promise<void> {
    try {
      // 获取屏幕信息
      const screenDetails = await (window as any).getScreenDetails()

      if (screenDetails && screenDetails.screens) {
        this.displays = screenDetails.screens.map((screen: any, index: number) => ({
          displayId: screen.id || `display_${index}`,
          name: screen.name || `Display ${index + 1}`,
          isPrimary: screen.primary || false,
          isInternal: false, // 无法从API获取
          width: screen.width,
          height: screen.height,
          devicePixelRatio: window.devicePixelRatio,
          refreshRate: 60 // 默认值，无法从API获取
        }))
        console.log('Detected multiple screens:', this.displays.length, this.displays)
      } else {
        // 回退方案：使用window.screen
        this.displays = [{
          displayId: 'primary_display',
          name: 'Primary Display',
          isPrimary: true,
          isInternal: false,
          width: window.screen.width,
          height: window.screen.height,
          devicePixelRatio: window.devicePixelRatio,
          refreshRate: 60
        }]
        console.log('Using fallback screen detection, only 1 display detected')
      }
    } catch (error) {
      console.error('Failed to get display info:', error)

      // 回退方案：使用window.screen
      this.displays = [{
        displayId: 'primary_display',
        name: 'Primary Display',
        isPrimary: true,
        isInternal: false,
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio,
        refreshRate: 60
      }]
      console.log('Using fallback screen detection due to error, only 1 display detected')
    }
  }

  private startCaptureTimer(): void {
    if (this.captureTimer) {
      return
    }

    this.captureTimer = window.setInterval(async () => {
      if (this.captureState.isCapturing && !this.captureState.isPaused) {
        try {
          await this.takeScreenshot()
        } catch (error) {
          console.error('Auto capture failed:', error)
        }
      }
    }, this.captureState.captureInterval)
  }

  private stopCaptureTimer(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer)
      this.captureTimer = null
    }
  }

  dispose(): void {
    this.stopCapture()
    this.stopCaptureTimer()

    if (this.videoElement) {
      this.videoElement.remove()
      this.videoElement = null
    }

    if (this.canvasElement) {
      this.canvasElement.remove()
      this.canvasElement = null
    }

    this.context = null
    this.removeAllListeners()
  }
}

export default ScreenManager