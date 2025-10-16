/**
 * MultiModalService - 多模态交互服务
 * 整合录音、截图和VAD检测，实现完整的语音交互流程
 * 基于example中的成熟模块重构，提供更好的性能和稳定性
 * 
 * 语音交互控制流程：
 * - 通过VAD检测语音开始与结束
 * - 发送时附带最后一张截图
 * - AI回复期间停止录音，界面显示等待状态
 * - VAD失效直至回复结束
 */

import { EventEmitter } from 'eventemitter3'
import { Agent, type AgentConfig } from '@/modules/agent'
import { AudioRecorder } from '@/lib/audio-recorder'
import { AudioStreamer } from '@/lib/audio-streamer'
import { useScreenCapture, type UseScreenCaptureResult } from '@/composables/useScreenCapture'
import { ModernVadDetector, type ModernVadConfig } from '@/lib/modern-vad-detector'
import { audioContext } from '@/lib/utils'
import { testTool } from '@/modules/llm/LLMExample'
import { canvasTools } from '@/modules/tools/canvasTools'

// ===== 类型定义 =====
export interface MultiModalServiceConfig {
  agentConfig: AgentConfig
  vadConfig?: Partial<ModernVadConfig>
  screenshotConfig?: {
    captureInterval?: number
    maxScreenshots?: number
    includeSystemAudio?: boolean
    showPreview?: boolean
    imageQuality?: number
  }
  audioConfig?: {
    sampleRate?: number
    quality?: number
    volume?: number
  }
  conversationConfig?: {
    sendHistoryImages?: boolean
    sendHistoryAudio?: boolean  // 新增：是否发送历史音频
  }
}

export enum ServiceState {
  IDLE = 'idle',
  INITIALIZING = 'initializing', 
  READY = 'ready',
  LISTENING = 'listening',
  VOICE_ACTIVE = 'voice_active',
  PROCESSING = 'processing',
  ERROR = 'error'
}

export interface ServiceStatus {
  state: ServiceState
  isInitialized: boolean
  isListening: boolean
  isProcessing: boolean
  isCapturing: boolean
  isVoiceActive: boolean
}

interface Screenshot {
  data: string
  timestamp: number
}

export class MultiModalService extends EventEmitter {
  // 状态管理
  private currentState: ServiceState = ServiceState.IDLE
  private status: ServiceStatus
  
  // 核心组件 - 使用现代化实现
  private agent: Agent
  private audioRecorder: AudioRecorder
  private audioStreamer: AudioStreamer | null = null
  private audioContext: AudioContext | null = null
  private vadDetector: ModernVadDetector
  private detachVadListeners: (() => void) | null = null
  private screenCapture: UseScreenCaptureResult
  
  private config: MultiModalServiceConfig
  private toolsEnabled = true
  
  // 音频处理相关
  private audioChunks: string[] = [] // 存储base64音频数据
  private screenshots: Screenshot[] = []
  private isRecordingVoice: boolean = false
  private hasRecordedVoiceChunk: boolean = false
  private listeningStartedAt: number | null = null
  private captureTimer: number | null = null

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

    // 合并conversationConfig到agentConfig中
    const mergedAgentConfig = {
      ...config.agentConfig,
      sendHistoryImages: config.conversationConfig?.sendHistoryImages ?? false,
      sendHistoryAudio: config.conversationConfig?.sendHistoryAudio ?? false  // 支持历史音频配置
    }

    // 初始化各个管理器
    this.agent = new Agent(mergedAgentConfig)
    this.agent.setToolsEnabled(this.toolsEnabled)

    // 注册测试工具与画布控制工具
    this.agent.registerTools([testTool])
    this.agent.registerTools(canvasTools)

    // 初始化音频录制器
    const sampleRate = config.audioConfig?.sampleRate ?? 16000
    this.audioRecorder = new AudioRecorder(sampleRate)

    // 初始化VAD检测器
    this.vadDetector = new ModernVadDetector({
      threshold: config.vadConfig?.threshold ?? 5,
      silenceDuration: config.vadConfig?.silenceDuration ?? 800,
      onVoiceStart: () => this.onVoiceStart(),
      onVoiceStop: () => this.onVoiceStop()
    })

    // 初始化屏幕捕获
    this.screenCapture = useScreenCapture()

    // 应用默认截图配置
    if (!this.config.screenshotConfig) {
      this.config.screenshotConfig = {}
    }
    this.config.screenshotConfig.captureInterval = this.config.screenshotConfig.captureInterval ?? 2000
    this.config.screenshotConfig.maxScreenshots = this.config.screenshotConfig.maxScreenshots ?? 1
    this.config.screenshotConfig.showPreview = this.config.screenshotConfig.showPreview ?? true
    this.config.screenshotConfig.imageQuality = this.config.screenshotConfig.imageQuality ?? 0.8

    this.setupEventListeners()
  }

  // 初始化服务
  async initialize(): Promise<void> {
    try {
      this.currentState = ServiceState.INITIALIZING
      this.emit('stateChanged', this.currentState)

      // 初始化音频上下文
      this.audioContext = await audioContext({ 
        sampleRate: this.config.audioConfig?.sampleRate ?? 24000 
      })
      
      // 初始化VAD检测器
      this.vadDetector.initialize((volume) => {
        this.vadDetector.processVolume(volume)
      })

      this.currentState = ServiceState.READY
      this.status.isInitialized = true
      this.emit('initialized')
      this.emit('stateChanged', this.currentState)
      
      console.log('✅ MultiModalService 初始化成功')
    } catch (error) {
      this.currentState = ServiceState.ERROR
      this.emit('stateChanged', this.currentState)
      console.error('❌ MultiModalService 初始化失败:', error)
      throw error
    }
  }

  // 开始监听（仅录音）
  async startListening(): Promise<void> {
    if (!this.status.isInitialized) {
      throw new Error('Service not initialized')
    }

    if (this.status.isListening) {
      console.warn('Already listening')
      return
    }

    try {
      this.currentState = ServiceState.LISTENING

      // 启动音频录制
      await this.audioRecorder.start()
      this.status.isListening = true
      this.listeningStartedAt = Date.now()

      // 启动VAD检测
      this.vadDetector.startDetection()

      this.emit('listeningStarted')
      this.emit('stateChanged', this.currentState)

      console.log('🎙️ 语音监听已启动')
    } catch (error) {
      // 清理已启动的资源
      if (this.audioRecorder.isRecording()) {
        await this.audioRecorder.stop()
      }

      this.currentState = ServiceState.ERROR
      this.emit('stateChanged', this.currentState)
      console.error('❌ 启动监听失败:', error)
      throw error
    }
  }

  // 开始屏幕捕获
  async startScreenCapture(): Promise<void> {
    if (this.status.isCapturing) {
      console.warn('Already capturing screen')
      return
    }

    try {
      await this.screenCapture.startScreenCapture()

      // 等待一小段时间确保Vue响应性更新完成
      await new Promise(resolve => setTimeout(resolve, 50))

      console.log('🖼️ 检查流状态:', {
        isStreaming: this.screenCapture.isStreaming.value,
        getStreamingStatus: this.screenCapture.getStreamingStatus(),
        stream: !!this.screenCapture.stream.value,
        streamActive: this.screenCapture.stream.value?.active
      })

      // 使用同步检查方法验证屏幕捕获是否真正启动
      if (this.screenCapture.getStreamingStatus()) {
        this.status.isCapturing = true
        this.startScreenshotCapture()
        console.log('🖼️ 屏幕捕获已启动')
        this.emit('screenCaptureStarted')
      } else {
        throw new Error('屏幕捕获启动失败：流未激活')
      }
    } catch (error) {
      console.error('🖼️ 屏幕捕获启动异常:', error)
      if (this.isScreenshotPermissionDenied(error)) {
        console.warn('🖼️ 屏幕捕获权限被拒绝')
        this.emit('captureDisabled', { reason: 'permission-denied' })
        throw new Error('屏幕捕获权限被拒绝')
      } else {
        console.error('🖼️ 屏幕捕获启动失败:', error)
        throw error
      }
    }
  }

  // 停止屏幕捕获
  async stopScreenCapture(): Promise<void> {
    if (!this.status.isCapturing) {
      return
    }

    console.log('🛑 正在停止屏幕捕获...')

    // 停止屏幕捕获
    if (this.screenCapture.isStreaming.value) {
      this.screenCapture.stopScreenCapture()
    }

    // 停止定时截图
    if (this.captureTimer) {
      clearInterval(this.captureTimer)
      this.captureTimer = null
    }

    // 重置状态
    this.status.isCapturing = false
    this.screenshots = []

    this.emit('screenCaptureStopped')
    console.log('🛑 屏幕捕获已停止')
  }

  // 停止监听
  async stopListening(): Promise<void> {
    if (!this.status.isListening) {
      return
    }

    console.log('🛑 正在停止监听...')

    // 停止音频录制
    if (this.audioRecorder.isRecording()) {
      await this.audioRecorder.stop()
    }

    // 停止VAD检测
    this.vadDetector.stopDetection()

    // 重置状态
    this.status.isListening = false
    this.status.isVoiceActive = false
    this.isRecordingVoice = false
    this.hasRecordedVoiceChunk = false
    this.audioChunks = []
    this.listeningStartedAt = null

    this.currentState = ServiceState.READY
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
    
    if (!this.isRecordingVoice) {
      console.warn('当前未在录制语音')
      return
    }

    await this.finalizeVoiceCapture()
  }

  // 开始语音捕获
  private startVoiceCapture(): void {
    console.log('🎤 startVoiceCapture - 状态检查', {
      isListening: this.status.isListening,
      isProcessing: this.status.isProcessing,
      isRecordingVoice: this.isRecordingVoice
    })

    if (!this.status.isListening || this.status.isProcessing) {
      console.log('🎤 跳过语音捕获 - 服务状态不允许')
      return
    }

    if (this.isRecordingVoice) {
      console.log('🎤 已在录制语音，跳过重复启动')
      return
    }

    console.log('🎤 语音检测到，开始录制')
    this.currentState = ServiceState.VOICE_ACTIVE
    this.status.isVoiceActive = true
    this.isRecordingVoice = true
    this.audioChunks = []
    this.hasRecordedVoiceChunk = false

    this.emit('voiceDetectionStarted')
    this.emit('voiceInputStarted')
    this.emit('stateChanged', this.currentState)
  }

  // 结束语音捕获并处理
  private async finalizeVoiceCapture(): Promise<void> {
    console.log('🎤 finalizeVoiceCapture - 状态检查', {
      isRecordingVoice: this.isRecordingVoice,
      isProcessing: this.status.isProcessing,
      audioChunks: this.audioChunks.length,
      hasRecordedVoiceChunk: this.hasRecordedVoiceChunk
    })

    if (!this.isRecordingVoice || this.status.isProcessing) {
      console.log('🎤 跳过语音结束处理')
      return
    }

    console.log('🎤 语音结束，开始处理消息')
    this.status.isVoiceActive = false
    this.isRecordingVoice = false

    // 等待一小段时间以获取最后的音频块
    await new Promise(resolve => setTimeout(resolve, 100))

    // 获取最新截图
    const maxScreenshots = this.config.screenshotConfig?.maxScreenshots ?? 1
    const screenshots = this.getLatestScreenshots(maxScreenshots)
    const imageBase64List = screenshots.map(s => s.data)
    const audioBase64 = this.combineAudioChunks()
    
    console.log('📋 准备发送数据', {
      screenshots: screenshots.length,
      imageBase64List: imageBase64List.length,
      audioBase64Length: audioBase64.length,
      hasAudio: audioBase64.length > 0,
      hasImages: imageBase64List.length > 0
    })

    this.emit('voiceDetectionStopped')

    // 检查是否有足够的音频数据
    const MIN_AUDIO_CHUNKS = 3
    const hasUsableAudio = this.hasRecordedVoiceChunk && this.audioChunks.length >= MIN_AUDIO_CHUNKS && audioBase64.length > 0

    if (!hasUsableAudio) {
      console.warn('语音停止但音频数据太短，跳过发送', {
        hasRecordedVoiceChunk: this.hasRecordedVoiceChunk,
        chunkCount: this.audioChunks.length,
        audioBase64Length: audioBase64.length
      })
      this.audioChunks = []
      this.hasRecordedVoiceChunk = false
      this.currentState = ServiceState.LISTENING
      this.emit('stateChanged', this.currentState)
      return
    }

    this.emit('voiceInputCaptured', {
      audioChunks: this.audioChunks.length,
      screenshotCount: screenshots.length,
      audioBase64Length: audioBase64.length,
      images: imageBase64List // 添加图片数据
    })

    await this.processAgentRequest({
      text: '',
      images: imageBase64List,
      audio: audioBase64
    })

    this.audioChunks = []
    this.hasRecordedVoiceChunk = false
  }

  // VAD事件处理
  private onVoiceStart(): void {
    const now = Date.now()
    if (this.listeningStartedAt && now - this.listeningStartedAt < 800) {
      console.log('语音开始被忽略 - 在宽限期内')
      return
    }

    this.startVoiceCapture()
  }

  private async onVoiceStop(): Promise<void> {
    await this.finalizeVoiceCapture()
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
      this.currentState = ServiceState.LISTENING
      this.emit('stateChanged', this.currentState)
      return
    }

    if (this.status.isProcessing) {
      console.warn('服务正在处理请求，忽略新的负载')
      return
    }

    try {
      this.status.isProcessing = true
      this.currentState = ServiceState.PROCESSING
      this.emit('processingStarted')
      this.emit('stateChanged', this.currentState)

      // 暂停监听（AI回复期间停止录音，VAD失效）
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
      this.currentState = ServiceState.LISTENING
      this.emit('stateChanged', this.currentState)
    }
  }

  // 暂停/恢复监听（按照语音交互控制流程规范）
  private pauseListening(): void {
    console.log('⏸️ 暂停语音监听 - AI回复期间')
    this.vadDetector.stopDetection()
    this.emit('listeningPaused')
  }

  private resumeListening(): void {
    console.log('▶️ 恢复语音监听')
    if (this.status.isListening) {
      // 完全重置VAD检测器状态
      this.vadDetector.dispose()

      // 重新创建VAD检测器，确保状态完全重置
      this.vadDetector = new ModernVadDetector({
        threshold: this.config.vadConfig?.threshold ?? 5,
        silenceDuration: this.config.vadConfig?.silenceDuration ?? 800,
        onVoiceStart: () => this.onVoiceStart(),
        onVoiceStop: () => this.onVoiceStop()
      })

      // 重新初始化并连接音频录制器
      this.vadDetector.initialize((volume) => {
        this.vadDetector.processVolume(volume)
      })

      this.attachVadEventListeners()
      // 重新设置音频录制器的音量事件监听
      this.setupAudioRecorderVolumeListener()

      // 启动VAD检测
      this.vadDetector.startDetection()

      // 重置时间和状态
      this.listeningStartedAt = Date.now()
      this.status.isVoiceActive = false
      this.isRecordingVoice = false

      this.emit('listeningResumed')
      console.log('▶️ VAD检测器已完全重置并重新启动')
    }
  }

  // 设置事件监听器
  private setupEventListeners(): void {
    this.setupAudioRecorderEventListeners()
    this.setupAgentEventListeners()
    this.attachVadEventListeners()
  }

  // 设置音频录制器事件监听
  private setupAudioRecorderEventListeners(): void {
    // AudioRecorder事件
    this.audioRecorder.on('data', (base64Data: string) => {
      if (this.isRecordingVoice && !this.status.isProcessing) {
        this.audioChunks.push(base64Data)
        this.hasRecordedVoiceChunk = true
        
        // 调试日志
        if (this.audioChunks.length % 10 === 0) {
          console.log('🎵 音频数据已收集', {
            chunks: this.audioChunks.length,
            isRecordingVoice: this.isRecordingVoice,
            chunkLength: base64Data.length
          })
        }
      } else {
        // console.log('🎵 跳过音频数据', {
        //   isRecordingVoice: this.isRecordingVoice,
        //   isProcessing: this.status.isProcessing,
        //   chunkLength: base64Data.length
        // })
      }
    })

    this.setupAudioRecorderVolumeListener()

    this.audioRecorder.on('stopped', () => {
      console.log('🎙️ 录音器已停止')
    })
  }

  // 设置音频录制器音量监听（独立方法，用于重置时重新连接）
  private setupAudioRecorderVolumeListener(): void {
    // 移除旧的音量监听器
    this.audioRecorder.removeAllListeners('volume')

    // 添加新的音量监听器
    this.audioRecorder.on('volume', (volume: number) => {
      // 传递给VAD检测器
      if (this.vadDetector && this.status.isListening) {
        this.vadDetector.processVolume(volume)
      }
      // 发送可视化数据
      this.emit('microphoneVisualization', { volume })
    })
  }

  // 设置Agent事件监听
  private setupAgentEventListeners(): void {

    this.agent.on('responseStarted', () => {
      console.log('🤖 AI开始回复')
      this.beginStreamingPlayback()
      this.emit('agentResponseStarted')
    })

    this.agent.on('responseChunk', (response) => {
      if (response.audioChunk && this.audioStreamer) {
        try {
          // 将ArrayBuffer转换为Uint8Array
          const uint8Array = new Uint8Array(response.audioChunk)
          this.audioStreamer.addPCM16(uint8Array)
        } catch (error) {
          console.error('处理音频块失败:', error)
        }
      }

      this.emit('agentResponseChunk', response)
    })

    this.agent.on('responseCompleted', (response) => {
      console.log('🤖 AI回复完成')
      this.finishStreamingPlayback()

      // 恢复监听
      this.resumeListening()
      this.status.isProcessing = false
      this.currentState = ServiceState.LISTENING

      this.emit('agentResponseCompleted', response)
      this.emit('processingCompleted')
      this.emit('stateChanged', this.currentState)
    })

    this.agent.on('responseError', (error) => {
      console.error('Agent回复错误:', error)
      this.finishStreamingPlayback()
      this.resumeListening()
      this.status.isProcessing = false
      this.currentState = ServiceState.LISTENING
      this.emit('error', error)
      this.emit('stateChanged', this.currentState)
    })

    this.agent.on('toolCallStarted', (toolCall) => {
      console.log('🛠️ 工具调用开始:', toolCall)
      this.emit('toolCallStarted', toolCall)
    })

    this.agent.on('toolCallCompleted', (payload) => {
      console.log('✅ 工具调用完成:', payload)
      this.emit('toolCallCompleted', payload)
    })

    this.agent.on('toolCallFailed', (payload) => {
      console.log('❌ 工具调用失败:', payload)
      this.emit('toolCallFailed', payload)
    })
  }

  // 设置VAD事件监听
  private attachVadEventListeners(): void {
    this.detachVadListeners?.()

    if (!this.vadDetector) {
      return
    }

    const vad = this.vadDetector
    const handleVoiceStart = () => {
      this.emit('voiceStarted')
    }

    const handleVoiceStop = () => {
      this.emit('voiceStopped')
    }

    vad.on('voiceStart', handleVoiceStart)
    vad.on('voiceStop', handleVoiceStop)

    this.detachVadListeners = () => {
      vad.off('voiceStart', handleVoiceStart)
      vad.off('voiceStop', handleVoiceStop)
      this.detachVadListeners = null
    }
  }

  // 音频流播放管理
  private beginStreamingPlayback(): void {
    if (!this.audioContext) {
      console.warn('音频上下文不可用于流播放')
      return
    }

    try {
      const streamer = new AudioStreamer(this.audioContext)
      streamer.onComplete = () => {
        if (this.audioStreamer === streamer) {
          streamer.dispose()
          this.audioStreamer = null
        } else {
          streamer.dispose()
        }
      }

      this.audioStreamer = streamer
      this.audioStreamer.resume()
    } catch (error) {
      console.error('启动流播放失败:', error)
    }
  }

  private finishStreamingPlayback(): void {
    if (this.audioStreamer) {
      this.audioStreamer.complete()
    }
  }

  // 屏幕截图管理
  private startScreenshotCapture(): void {
    const interval = this.config.screenshotConfig?.captureInterval ?? 2000
    const maxScreenshots = this.config.screenshotConfig?.maxScreenshots ?? 1

    this.captureTimer = window.setInterval(async () => {
      try {
        // 使用同步检查方法检查流状态
        if (!this.screenCapture.getStreamingStatus()) {
          console.warn('📸 截图失败：屏幕流未激活，尝试重新启动...')

          // 尝试重新启动屏幕捕获
          try {
            await this.screenCapture.startScreenCapture()
            // 等待Vue响应性更新
            await new Promise(resolve => setTimeout(resolve, 50))
            if (!this.screenCapture.getStreamingStatus()) {
              console.error('📸 屏幕流重新启动失败')
              return
            }
            console.log('📸 屏幕流重新启动成功')
          } catch (restartError) {
            console.error('📸 重新启动屏幕捕获失败:', restartError)
            return
          }
        }

        const quality = this.config.screenshotConfig?.imageQuality ?? 0.8
        const base64Data = await this.screenCapture.captureFrame(quality)

        if (base64Data && base64Data.length > 0) {
          this.addScreenshot({ data: base64Data, timestamp: Date.now() })
        } else {
          console.warn('📸 截图失败：数据为空')
        }
      } catch (error) {
        console.warn('📸 截图失败:', error)

        // 如果是流被关闭的错误，尝试重新启动
        if (error instanceof Error && error.message.includes('not active')) {
          console.log('📸 检测到流已关闭，尝试重新启动...')
          try {
            await this.screenCapture.startScreenCapture()
            console.log('📸 屏幕捕获已重新启动')
          } catch (restartError) {
            console.error('📸 重新启动屏幕捕获失败:', restartError)
          }
        }
      }
    }, interval)

    console.log(`🖼️ 截图定时器已启动，间隔: ${interval}ms, 最大截图数: ${maxScreenshots}`)
  }

  private addScreenshot(screenshot: Screenshot): void {
    // 添加新截图到数组开头
    this.screenshots.unshift(screenshot)

    // 限制截图数量
    const maxScreenshots = this.config.screenshotConfig?.maxScreenshots ?? 1
    if (this.screenshots.length > maxScreenshots) {
      this.screenshots = this.screenshots.slice(0, maxScreenshots)
    }

    this.emit('screenshotTaken', screenshot)
    console.log(`📸 截图已添加，当前数量: ${this.screenshots.length}/${maxScreenshots}`)
  }

  private getLatestScreenshots(count?: number): Screenshot[] {
    const maxScreenshots = this.config.screenshotConfig?.maxScreenshots ?? 1
    const screenshotCount = count ?? maxScreenshots

    // 返回最新的截图（数组开头是最新的）
    const result = this.screenshots.slice(0, screenshotCount)

    console.log(`📸 获取最新截图: 请求 ${screenshotCount} 张, 实际返回 ${result.length} 张`)
    return result
  }

  // 清空截图
  clearScreenshots(): void {
    this.screenshots = []
    this.emit('screenshotsCleared')
  }

  // 音频数据处理
  private combineAudioChunks(): string {
    if (this.audioChunks.length === 0) {
      return ''
    }
    
    console.log('🎵 合并音频块', {
      chunks: this.audioChunks.length,
      sampleRate: this.config.audioConfig?.sampleRate ?? 16000
    })
    
    try {
      // 将所有base64块解码为PCM16数据
      const pcmBuffers: ArrayBuffer[] = []
      let totalBytes = 0
      
      for (const base64Chunk of this.audioChunks) {
        if (!base64Chunk || base64Chunk.trim() === '') continue
        
        try {
          const binaryString = atob(base64Chunk)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          pcmBuffers.push(bytes.buffer)
          totalBytes += bytes.buffer.byteLength
        } catch (error) {
          console.warn('解码音频块失败:', error)
        }
      }
      
      if (totalBytes === 0) {
        console.warn('没有有效的音频数据')
        return ''
      }
      
      // 合并所有PCM数据
      const mergedBuffer = new ArrayBuffer(totalBytes)
      const mergedView = new Uint8Array(mergedBuffer)
      let offset = 0
      
      for (const buffer of pcmBuffers) {
        mergedView.set(new Uint8Array(buffer), offset)
        offset += buffer.byteLength
      }
      
      // 转换为WAV格式
      const sampleRate = this.config.audioConfig?.sampleRate ?? 16000
      const wavBuffer = this.pcm16ToWavBuffer(mergedBuffer, sampleRate, 1)
      
      // 转换为base64
      const base64 = this.bufferToBase64(wavBuffer)
      
      console.log('🎵 音频合并完成', {
        originalBytes: totalBytes,
        wavBytes: wavBuffer.byteLength,
        base64Length: base64.length
      })
      
      return base64
    } catch (error) {
      console.error('合并音频块失败:', error)
      return ''
    }
  }
  
  // 将PCM16数据转换为WAV格式
  private pcm16ToWavBuffer(pcmBuffer: ArrayBuffer, sampleRate: number, channelCount: number): ArrayBuffer {
    const channels = Math.max(1, channelCount || 1)
    const bytesPerSample = 2
    const blockAlign = channels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataLength = pcmBuffer.byteLength

    const buffer = new ArrayBuffer(44 + dataLength)
    const view = new DataView(buffer)
    let offset = 0

    const writeString = (value: string) => {
      for (let i = 0; i < value.length; i++) {
        view.setUint8(offset++, value.charCodeAt(i))
      }
    }

    const writeUint32 = (value: number) => {
      view.setUint32(offset, value, true)
      offset += 4
    }

    const writeUint16 = (value: number) => {
      view.setUint16(offset, value, true)
      offset += 2
    }

    // WAV文件头
    writeString('RIFF')
    writeUint32(36 + dataLength)
    writeString('WAVE')
    writeString('fmt ')
    writeUint32(16)
    writeUint16(1) // PCM
    writeUint16(channels)
    writeUint32(sampleRate)
    writeUint32(byteRate)
    writeUint16(blockAlign)
    writeUint16(16) // bits per sample
    writeString('data')
    writeUint32(dataLength)

    // 复制PCM数据
    const pcmView = new Uint8Array(pcmBuffer)
    new Uint8Array(buffer, 44).set(pcmView)

    return buffer
  }
  
  // 将ArrayBuffer转换为base64
  private bufferToBase64(buffer: ArrayBuffer): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)

    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }

    return btoa(binary)
  }

  // 配置更新
  updateConfig(newConfig: Partial<MultiModalServiceConfig>): void {
    if (newConfig.agentConfig) {
      // 更新Agent配置
      if (newConfig.agentConfig.systemPrompt) {
        this.agent.updateSystemPrompt(newConfig.agentConfig.systemPrompt)
      }
      if (newConfig.agentConfig.llmConfig) {
        this.agent.updateLLMConfig(newConfig.agentConfig.llmConfig)
      }
      this.config.agentConfig = { ...this.config.agentConfig, ...newConfig.agentConfig }
    }

    if (newConfig.conversationConfig) {
      // 更新对话配置
      this.config.conversationConfig = { ...this.config.conversationConfig, ...newConfig.conversationConfig }
      // 更新Agent的配置
      const agentUpdates: any = {}
      if (newConfig.conversationConfig.sendHistoryImages !== undefined) {
        agentUpdates.sendHistoryImages = newConfig.conversationConfig.sendHistoryImages
      }
      if (newConfig.conversationConfig.sendHistoryAudio !== undefined) {
        agentUpdates.sendHistoryAudio = newConfig.conversationConfig.sendHistoryAudio
      }
      if (Object.keys(agentUpdates).length > 0) {
        this.agent.updateConfig(agentUpdates)
      }
    }

    if (newConfig.vadConfig) {
      this.config.vadConfig = { ...this.config.vadConfig, ...newConfig.vadConfig }
      this.vadDetector.updateConfig(newConfig.vadConfig)
    }

    if (newConfig.audioConfig) {
      this.config.audioConfig = { ...this.config.audioConfig, ...newConfig.audioConfig }
    }

    if (newConfig.screenshotConfig) {
      this.config.screenshotConfig = { ...this.config.screenshotConfig, ...newConfig.screenshotConfig }

      // 如果屏幕捕获正在运行，重新启动截图定时器以应用新的配置
      if (this.status.isCapturing && this.captureTimer) {
        console.log('📸 截图配置已更新，重新启动定时器')
        clearInterval(this.captureTimer)
        this.captureTimer = null
        this.startScreenshotCapture()
      }
    }

    this.emit('configUpdated', this.config)
  }

  setToolsEnabled(enabled: boolean): void {
    this.toolsEnabled = enabled
    this.agent.setToolsEnabled(enabled)
  }

  // 设置会话保存回合数
  setMaxHistoryRounds(rounds: number): void {
    // 每轮包含一个用户消息和一个AI回复，所以最大历史大小 = 轮数 * 2
    const maxHistorySize = Math.max(1, rounds) * 2
    this.agent.setMaxHistorySize(maxHistorySize)
    console.log('📁 MultiModalService maxHistoryRounds set to:', rounds, 'maxHistorySize:', maxHistorySize)
  }

  // 获取会话保存回合数
  getMaxHistoryRounds(): number {
    // 最大历史大小 / 2 = 轮数
    return Math.max(1, Math.floor(this.agent.getMaxHistorySize() / 2))
  }

  // 创建文本回复（兼容性方法）
  async createResponse(text: string): Promise<void> {
    if (!text || !text.trim()) {
      console.warn('空文本消息，跳过发送')
      return
    }

    try {
      console.log('📤 发送文本消息:', text)
      await this.agent.sendTextMessage(text.trim())
    } catch (error) {
      console.error('发送文本消息失败:', error)
      throw error
    }
  }

  // 发送多模态消息（文本 + 图片 + 视频 + 音频）
  async sendMultiModalMessage(options: {
    text: string
    images?: string[]
    videos?: string[]
    audios?: string[]
  }): Promise<void> {
    const { text, images, videos, audios } = options
    
    console.log('📤 MultiModalService.sendMultiModalMessage 调用:', {
      text: text.substring(0, 50),
      images: images?.length || 0,
      videos: videos?.length || 0,
      audios: audios?.length || 0
    })

    try {
      // 将图片、视频、音频一并传递给 Agent（音频以base64发送）
      await this.agent.sendMultiModalMessage({
        text: text.trim(),
        images: images && images.length > 0 ? images : undefined,
        videos: videos && videos.length > 0 ? videos : undefined,
        audios: audios && audios.length > 0 ? audios : undefined
      })
    } catch (error) {
      console.error('发送多模态消息失败:', error)
      throw error
    }
  }

  // 发送多模态消息（文本 + 图片）
  async sendMultiModalTextMessage(text: string, images?: string[]): Promise<void> {
    if (!text || !text.trim()) {
      console.warn('空文本消息，跳过发送')
      return
    }

    try {
      console.log('📤 发送多模态文本消息:', { text, imageCount: images?.length || 0 })
      
      if (images && images.length > 0) {
        // 发送带图片的消息
        await this.agent.sendMultiModalMessage({
          text: text.trim(),
          images: images,
          videos: undefined,
          audio: ''
        })
      } else {
        // 发送纯文本消息
        await this.agent.sendTextMessage(text.trim())
      }
    } catch (error) {
      console.error('发送多模态文本消息失败:', error)
      throw error
    }
  }

  // 获取状态
  getStatus(): ServiceStatus {
    return { ...this.status }
  }

  getCurrentState(): ServiceState {
    return this.currentState
  }

  // 兼容性方法 - 保持向后兼容
  get state() {
    return this.status
  }

  // 工具方法
  private isScreenshotPermissionDenied(error: unknown): boolean {
    if (!error) return false

    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      return error.name === 'NotAllowedError' || error.name === 'NotReadableError'
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return message.includes('permission') || message.includes('denied')
    }

    return false
  }

  // 销毁服务
  dispose(): void {
    console.log('🧹 销毁MultiModalService')

    this.stopListening()
    this.stopScreenCapture()
    this.vadDetector.dispose()

    if (this.audioRecorder.isRecording()) {
      this.audioRecorder.stop()
    }

    if (this.audioStreamer) {
      this.audioStreamer.dispose()
    }

    if (this.captureTimer) {
      clearInterval(this.captureTimer)
    }

    this.removeAllListeners()
  }
}
