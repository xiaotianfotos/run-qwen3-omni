import { EventEmitter } from 'eventemitter3'

export interface Screenshot {
  id: string
  data: string // base64 encoded image
  timestamp: number
  width: number
  height: number
}

export interface ScreenshotManagerConfig {
  captureInterval: number // 截图间隔（毫秒）
  maxScreenshots: number // 最大保存截图数量
  targetWidth: number     // 目标宽度
  targetHeight: number    // 目标高度
  quality: number         // 图片质量 (0-1)
}

export class ScreenshotManager extends EventEmitter {
  private config: ScreenshotManagerConfig
  private screenshots: Screenshot[] = []
  private isCapturing: boolean = false
  private captureTimer: number | null = null
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(config: Partial<ScreenshotManagerConfig> = {}) {
    super()
    
    this.config = {
      captureInterval: 1000, // 每秒截图一次
      maxScreenshots: 10,    // 保存最新10张
      targetWidth: 1920,     // 目标宽度
      targetHeight: 1080,    // 目标高度
      quality: 0.8,          // 图片质量
      ...config
    }

    // 创建离屏canvas用于图片处理
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.config.targetWidth
    this.canvas.height = this.config.targetHeight
    this.ctx = this.canvas.getContext('2d')!
  }

  // 开始截图
  async startCapture(): Promise<void> {
    if (this.isCapturing) {
      console.warn('Screenshot capture already running')
      return
    }

    try {
      // 请求屏幕捕获权限
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      })

      this.isCapturing = true
      this.emit('captureStarted')

      // 创建video元素用于截图
      const video = document.createElement('video')
      video.srcObject = stream
      video.play()

      video.onloadedmetadata = () => {
        // 开始定时截图
        this.captureTimer = window.setInterval(async () => {
          try {
            const screenshot = await this.captureFrame(video)
            this.addScreenshot(screenshot)
          } catch (error) {
            console.error('Failed to capture frame:', error)
            this.emit('captureError', error)
          }
        }, this.config.captureInterval)
      }

      // 监听流结束事件
      stream.getVideoTracks()[0].onended = () => {
        this.stopCapture()
      }

    } catch (error) {
      console.error('Failed to start screen capture:', error)
      this.emit('captureError', error)
      throw error
    }
  }

  // 停止截图
  stopCapture(): void {
    if (!this.isCapturing) {
      return
    }

    this.isCapturing = false
    
    if (this.captureTimer) {
      clearInterval(this.captureTimer)
      this.captureTimer = null
    }

    this.emit('captureStopped')
  }

  // 手动截图
  async takeScreenshot(): Promise<Screenshot | null> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      })

      const video = document.createElement('video')
      video.srcObject = stream
      video.play()

      return new Promise((resolve) => {
        video.onloadedmetadata = async () => {
          try {
            const screenshot = await this.captureFrame(video)
            
            // 停止流
            stream.getTracks().forEach(track => track.stop())
            
            resolve(screenshot)
          } catch (error) {
            console.error('Failed to take screenshot:', error)
            resolve(null)
          }
        }
      })
    } catch (error) {
      console.error('Failed to take screenshot:', error)
      return null
    }
  }

  // 获取最新的截图列表
  getLatestScreenshots(count?: number): Screenshot[] {
    if (count === undefined) {
      return [...this.screenshots]
    }
    const num = count || this.config.maxScreenshots
    return this.screenshots.slice(-num)
  }

  // 清空截图
  clearScreenshots(): void {
    this.screenshots = []
    this.emit('screenshotsCleared')
  }

  // 获取截图状态
  getCaptureState(): 'capturing' | 'stopped' {
    return this.isCapturing ? 'capturing' : 'stopped'
  }

  // 更新配置
  updateConfig(newConfig: Partial<ScreenshotManagerConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // 如果画布尺寸改变，重新设置
    if (newConfig.targetWidth || newConfig.targetHeight) {
      this.canvas.width = this.config.targetWidth
      this.canvas.height = this.config.targetHeight
    }

    this.emit('configUpdated', this.config)
  }

  // 截取视频帧
  private async captureFrame(video: HTMLVideoElement): Promise<Screenshot> {
    // 清空画布
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    
    // 计算缩放比例，保持宽高比
    const scaleX = this.config.targetWidth / video.videoWidth
    const scaleY = this.config.targetHeight / video.videoHeight
    const scale = Math.min(scaleX, scaleY)
    
    const scaledWidth = video.videoWidth * scale
    const scaledHeight = video.videoHeight * scale
    
    // 居中绘制
    const offsetX = (this.config.targetWidth - scaledWidth) / 2
    const offsetY = (this.config.targetHeight - scaledHeight) / 2
    
    // 绘制视频帧到画布
    this.ctx.drawImage(
      video,
      offsetX, offsetY,
      scaledWidth, scaledHeight
    )
    
    // 转换为base64
    const dataUrl = this.canvas.toDataURL('image/jpeg', this.config.quality)
    const base64Data = dataUrl.split(',')[1]
    
    const screenshot: Screenshot = {
      id: this.generateId(),
      data: base64Data,
      timestamp: Date.now(),
      width: this.config.targetWidth,
      height: this.config.targetHeight
    }
    
    return screenshot
  }

  // 添加截图到列表
  private addScreenshot(screenshot: Screenshot): void {
    this.screenshots.push(screenshot)
    
    // 保持最大数量限制
    if (this.screenshots.length > this.config.maxScreenshots) {
      const removed = this.screenshots.shift()
      this.emit('screenshotRemoved', removed)
    }
    
    this.emit('screenshotAdded', screenshot)
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // 销毁资源
  dispose(): void {
    this.stopCapture()
    this.clearScreenshots()
    this.removeAllListeners()
  }
}