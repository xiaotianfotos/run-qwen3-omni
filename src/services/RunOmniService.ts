/**
 * RunOmni Service - 多模态交互服务重构版本
 * 使用模块化架构，统一协调各个专业模块
 */

import { EventEmitter } from 'eventemitter3'
import { AudioManager } from '@/modules/audio'
import { ScreenManager } from '@/modules/screen'
import { ConversationManager } from '@/modules/conversation'
import { Agent } from '@/modules/agent'
import { ServiceState } from './MultiModalService'
import type { MultiModalServiceConfig, ServiceStatus } from './MultiModalService'
import type { ScreenshotData } from '@/types/screen'
import type { AudioVisualizationData } from '@/types/audio'

// 服务状态枚举
export enum RunOmniState {
  IDLE = 'idle',
  INITIALIZING = 'initializing', 
  READY = 'ready',
  LISTENING = 'listening',
  VOICE_ACTIVE = 'voice_active',
  PROCESSING = 'processing',
  ERROR = 'error'
}

interface Screenshot {
  data: string
  timestamp: number
}

export class RunOmniService extends EventEmitter {
  // 状态管理
  private currentState: RunOmniState = RunOmniState.IDLE
  private status: ServiceStatus
  
  // 核心模块
  private audioManager: AudioManager
  private screenManager: ScreenManager
  private conversationManager: ConversationManager
  private agent: Agent
  
  private config: MultiModalServiceConfig
  
  // 业务状态
  private screenshots: Screenshot[] = []
  private isVoiceRecording: boolean = false
  private listeningStartedAt: number | null = null
  private screenshotTimer: number | null = null

  constructor(config: MultiModalServiceConfig) {
    super()
    
    this.config = config
    this.status = {
      state: ServiceState.IDLE,
      isInitialized: false,
      isListening: false,
      isProcessing: false,
      isCapturing: false,
      isVoiceActive: false
    }

    // 初始化各个模块
    this.audioManager = new AudioManager(config.audioConfig)
    this.screenManager = new ScreenManager({
      captureInterval: config.screenshotConfig?.captureInterval ?? 1000,
      quality: 0.8,
      format: 'jpeg'
    })
    this.conversationManager = new ConversationManager()
    this.agent = new Agent(config.agentConfig)

    this.setupEventListeners()
  }

  // 初始化服务
  async initialize(): Promise<void> {
    try {
      this.currentState = RunOmniState.INITIALIZING
      this.emit('stateChanged', this.currentState)

      // 并行初始化各个模块
      await Promise.all([
        this.audioManager.initialize(),
        this.screenManager.initialize(),
        // conversationManager 不需要异步初始化
        // agent 在需要时初始化
      ])

      this.currentState = RunOmniState.READY
      this.status.isInitialized = true
      this.emit('initialized')
      this.emit('stateChanged', this.currentState)

      console.log('✅ RunOmniService 初始化成功')
    } catch (error) {
      this.currentState = RunOmniState.ERROR
      this.emit('stateChanged', this.currentState)
      console.error('❌ RunOmniService 初始化失败:', error)
      throw error
    }
  }

  // 更新VAD配置
  updateVadConfig(config: { threshold: number; silenceDuration: number }): void {
    this.audioManager.updateVadConfig(config)
    console.log('🔊 VAD配置已更新:', config)
  }

  // 开始监听（录音 + 截图）
  async startListening(): Promise<void> {
    if (!this.status.isInitialized) {
      throw new Error('Service not initialized')
    }

    if (this.status.isListening) {
      console.warn('Already listening')
      return
    }

    try {
      this.currentState = RunOmniState.LISTENING
      console.log('🎙️ 开始启动监听服务...')

      // 启动音频录制
      await this.audioManager.startRecording()
      this.status.isListening = true
      this.listeningStartedAt = Date.now()

      // 尝试启动屏幕捕获
      let screenshotStarted = false
      try {
        await this.screenManager.startCapture()
        screenshotStarted = true
        this.status.isCapturing = true
        this.startScreenshotTimer()
        console.log('🖼️ 屏幕捕获已启动')
      } catch (error) {
        console.warn('🖼️ 屏幕捕获启动失败，继续仅录音模式:', error)
        this.emit('captureDisabled', { reason: 'permission-denied' })
      }

      this.emit('listeningStarted')
      this.emit('stateChanged', this.currentState)
      
      if (screenshotStarted) {
        console.log('🎙️ 语音监听和屏幕捕获已启动')
      } else {
        console.log('🎙️ 语音监听已启动（无屏幕捕获）')
      }
    } catch (error) {
      // 清理已启动的资源
      if (this.audioManager.getRecordingState().isRecording) {
        this.audioManager.stopRecording()
      }

      if (this.screenManager.getCaptureState().isCapturing) {
        this.screenManager.stopCapture()
        this.status.isCapturing = false
      }

      this.currentState = RunOmniState.ERROR
      this.emit('stateChanged', this.currentState)
      console.error('❌ 启动监听失败:', error)
      throw error
    }
  }

  // 停止监听
  async stopListening(): Promise<void> {
    if (!this.status.isListening) {
      return
    }

    console.log('🛑 正在停止监听...')

    // 停止音频录制
    this.audioManager.stopRecording()
    
    // 停止屏幕捕获
    this.screenManager.stopCapture()

    // 停止定时截图
    this.stopScreenshotTimer()
    
    // 重置状态
    this.status.isListening = false
    this.status.isCapturing = false
    this.status.isVoiceActive = false
    this.isVoiceRecording = false
    this.screenshots = []
    this.listeningStartedAt = null
    
    this.currentState = RunOmniState.READY
    this.emit('listeningStopped')
    this.emit('stateChanged', this.currentState)
    console.log('🛑 监听已停止')
  }

  // 手动开始语音捕获（按住说话模式）
  beginManualVoiceCapture(): void {
    console.log('🎤 手动开始语音捕获 - 按住说话模式')
    
    if (!this.status.isListening) {
      console.warn('服务未在监听状态，无法开始语音捕获')
      return
    }

    if (this.status.isProcessing) {
      console.log('AI正在处理中，忽略语音捕获请求')
      return
    }

    this.startVoiceCapture()
  }

  // 手动结束语音捕获  
  async endManualVoiceCapture(): Promise<void> {
    console.log('🎤 手动结束语音捕获')
    
    if (!this.isVoiceRecording) {
      console.warn('当前未在录制语音')
      return
    }

    await this.finishVoiceCapture()
  }

  // 处理Agent请求
  private async processAgentRequest(payload: { text?: string; images?: string[]; audio?: string }): Promise<void> {
    const hasText = payload.text && payload.text.trim().length > 0
    const hasImages = Boolean(payload.images && payload.images.length > 0)
    const hasAudio = Boolean(payload.audio && payload.audio.length > 0)

    console.log('🚀 处理Agent请求', {
      hasText,
      hasImages, 
      hasAudio,
      textLength: payload.text?.length || 0,
      imagesCount: payload.images?.length || 0,
      audioLength: payload.audio?.length || 0
    })

    if (!hasText && !hasImages && !hasAudio) {
      console.warn('没有内容提供给Agent请求')
      this.currentState = RunOmniState.LISTENING
      this.emit('stateChanged', this.currentState)
      return
    }

    if (this.status.isProcessing) {
      console.warn('服务正在处理请求，忽略新的负载')
      return
    }

    try {
      this.status.isProcessing = true
      this.currentState = RunOmniState.PROCESSING
      this.emit('processingStarted')
      this.emit('stateChanged', this.currentState)

      // 暂停监听（AI回复期间停止录音）
      if (this.status.isListening) {
        this.pauseListening()
      }

      console.log('📤 发送到Agent的数据:', {
        hasText,
        hasImages,
        hasAudio,
        payload: {
          text: payload.text,
          images: payload.images ? `${payload.images.length} images` : 'no images',
          audio: payload.audio ? `${payload.audio.length} chars` : 'no audio'
        }
      })

      await this.agent.sendMultiModalMessage(payload)
    } catch (error) {
      console.error('❌ 处理Agent请求失败:', error)
      this.emit('error', error)
      if (this.status.isListening) {
        this.resumeListening()
      }
      this.status.isProcessing = false
      this.currentState = RunOmniState.LISTENING
      this.emit('stateChanged', this.currentState)
    }
  }

  // 创建文本回复（兼容性方法）
  async createResponse(text: string): Promise<void> {
    if (!text || !text.trim()) {
      console.warn('空文本消息，跳过发送')
      return
    }

    try {
      console.log('📤 发送文本消息:', text)
      
      // 添加用户消息到对话历史
      this.conversationManager.addUserMessage(text.trim())
      
      await this.agent.sendTextMessage(text.trim())
    } catch (error) {
      console.error('发送文本消息失败:', error)
      throw error
    }
  }

  // 获取状态
  getStatus(): ServiceStatus {
    return { ...this.status }
  }

  getCurrentState(): RunOmniState {
    return this.currentState
  }

  // 设置会话保存回合数
  setMaxHistoryRounds(rounds: number): void {
    if (this.conversationManager) {
      this.conversationManager.setMaxHistoryRounds(rounds)
      console.log('📁 ConversationManager maxHistoryRounds set to:', rounds)
    }
  }

  // 获取会话保存回合数
  getMaxHistoryRounds(): number {
    return this.conversationManager ? this.conversationManager.getMaxHistoryRounds() : 5
  }

  // 兼容性方法 - 保持向后兼容
  get state() {
    return this.status
  }

  // 私有方法：开始语音捕获
  private startVoiceCapture(): void {
    console.log('🎤 语音检测到，开始录制')
    this.currentState = RunOmniState.VOICE_ACTIVE
    this.status.isVoiceActive = true
    this.isVoiceRecording = true

    this.emit('voiceDetectionStarted')
    this.emit('voiceInputStarted')
    this.emit('stateChanged', this.currentState)
  }

  // 私有方法：结束语音捕获并处理
  private async finishVoiceCapture(): Promise<void> {
    console.log('🎤 语音结束，开始处理消息')
    this.status.isVoiceActive = false
    this.isVoiceRecording = false

    // 等待一小段时间以确保音频数据完整
    await new Promise(resolve => setTimeout(resolve, 100))

    // 获取音频数据
    const audioBuffer = this.audioManager.getAudioBuffer()
    if (!audioBuffer) {
      console.warn('没有音频数据')
      this.currentState = RunOmniState.LISTENING
      this.emit('stateChanged', this.currentState)
      return
    }

    // 获取最新截图
    const screenshots = this.getLatestScreenshots(10)
    const imageBase64List = screenshots.map(s => s.data)
    
    // 将音频转换为base64（这里需要实现具体的转换逻辑）
    const audioBase64 = this.convertAudioToBase64(audioBuffer)
    
    console.log('📋 准备发送数据', {
      screenshots: screenshots.length,
      imageBase64List: imageBase64List.length,
      audioBase64Length: audioBase64.length,
      hasAudio: audioBase64.length > 0,
      hasImages: imageBase64List.length > 0
    })

    this.emit('voiceDetectionStopped')
    this.emit('voiceInputCaptured', {
      audioChunks: 1,
      screenshotCount: screenshots.length,
      audioBase64Length: audioBase64.length,
      images: imageBase64List
    })

    await this.processAgentRequest({
      text: '',
      images: imageBase64List,
      audio: audioBase64
    })
  }

  // 私有方法：暂停/恢复监听
  private pauseListening(): void {
    console.log('⏸️ 暂停语音监听 - AI回复期间')
    // AudioManager 会处理具体的暂停逻辑
    this.emit('listeningPaused')
  }

  private resumeListening(): void {
    console.log('▶️ 恢复语音监听')
    // 重置时间和状态
    this.listeningStartedAt = Date.now()
    this.status.isVoiceActive = false
    this.isVoiceRecording = false
    
    this.emit('listeningResumed')
    console.log('▶️ 语音监听已恢复')
  }

  // 私有方法：截图定时器管理
  private startScreenshotTimer(): void {
    const interval = this.config.screenshotConfig?.captureInterval ?? 1000
    
    this.screenshotTimer = window.setInterval(async () => {
      try {
        const screenshot = await this.screenManager.takeScreenshot()
        this.addScreenshot({
          data: screenshot.image.split(',')[1], // 移除base64前缀
          timestamp: screenshot.timestamp
        })
      } catch (error) {
        console.warn('📸 自动截图失败:', error)
      }
    }, interval)
    
    console.log(`🖼️ 截图定时器已启动，间隔: ${interval}ms`)
  }

  private stopScreenshotTimer(): void {
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer)
      this.screenshotTimer = null
    }
  }

  // 私有方法：截图管理
  private addScreenshot(screenshot: Screenshot): void {
    const maxScreenshots = this.config.screenshotConfig?.maxScreenshots ?? 10
    
    this.screenshots.push(screenshot)
    
    if (this.screenshots.length > maxScreenshots) {
      this.screenshots.shift()
    }
    
    this.emit('screenshotTaken', screenshot)
  }

  private getLatestScreenshots(count?: number): Screenshot[] {
    const result = count === undefined ? [...this.screenshots] : this.screenshots.slice(-count)
    return result
  }

  // 私有方法：音频数据转换
  private convertAudioToBase64(audioBuffer: any): string {
    // TODO: 实现音频数据到base64的转换
    // 这里需要根据具体的音频格式进行转换
    return ''
  }

  // 设置事件监听器
  private setupEventListeners(): void {
    this.setupAudioManagerEventListeners()
    this.setupScreenManagerEventListeners()
    this.setupAgentEventListeners()
    this.setupConversationManagerEventListeners()
  }

  // 音频管理器事件监听
  private setupAudioManagerEventListeners(): void {
    this.audioManager.on('voiceStarted', () => {
      const now = Date.now()
      if (this.listeningStartedAt && now - this.listeningStartedAt < 800) {
        console.log('语音开始被忽略 - 在宽限期内')
        return
      }
      this.startVoiceCapture()
    })

    this.audioManager.on('voiceStopped', async () => {
      await this.finishVoiceCapture()
    })

    this.audioManager.on('visualizationData', (data: AudioVisualizationData) => {
      this.emit('microphoneVisualization', { volume: data.volume })
    })

    this.audioManager.on('playbackStarted', () => {
      this.emit('agentResponseStarted')
    })

    this.audioManager.on('playbackStopped', () => {
      // 恢复监听
      this.resumeListening()
      this.status.isProcessing = false
      this.currentState = RunOmniState.LISTENING
      
      this.emit('agentResponseCompleted')
      this.emit('processingCompleted')
      this.emit('stateChanged', this.currentState)
    })
  }

  // 屏幕管理器事件监听
  private setupScreenManagerEventListeners(): void {
    this.screenManager.on('screenshotTaken', (screenshot: ScreenshotData) => {
      // 已在定时器中处理
    })

    this.screenManager.on('permissionDenied', (error) => {
      this.emit('captureDisabled', { reason: 'permission-denied' })
    })
  }

  // Agent事件监听
  private setupAgentEventListeners(): void {
    this.agent.on('responseStarted', () => {
      console.log('🤖 AI开始回复')
      this.audioManager.beginStreamingPlayback()
      this.emit('agentResponseStarted')
    })

    this.agent.on('responseChunk', (response) => {
      if (response.audioChunk) {
        try {
          this.audioManager.enqueueAudioChunk(response.audioChunk)
        } catch (error) {
          console.error('处理音频块失败:', error)
        }
      }
      this.emit('agentResponseChunk', response)
    })

    this.agent.on('responseCompleted', (response) => {
      console.log('🤖 AI回复完成')
      this.audioManager.finishStreamingPlayback()
      
      this.emit('agentResponseCompleted', response)
    })

    this.agent.on('responseError', (error) => {
      console.error('Agent回复错误:', error)
      this.audioManager.stopPlayback()
      this.resumeListening()
      this.status.isProcessing = false
      this.currentState = RunOmniState.LISTENING
      this.emit('error', error)
      this.emit('stateChanged', this.currentState)
    })
  }

  // 对话管理器事件监听
  private setupConversationManagerEventListeners(): void {
    this.conversationManager.on('messageAdded', (message) => {
      // 可以在这里处理消息添加事件
    })

    this.conversationManager.on('audioResponseReceived', (audioData: ArrayBuffer) => {
      // 播放音频响应
      this.audioManager.playAudio(audioData)
    })
  }

  // 销毁服务
  dispose(): void {
    console.log('🧹 销毁RunOmniService')
    
    this.stopListening()
    
    this.audioManager.dispose?.()
    this.screenManager.dispose()
    // conversationManager 和 agent 不需要特殊清理
    
    this.removeAllListeners()
  }
}