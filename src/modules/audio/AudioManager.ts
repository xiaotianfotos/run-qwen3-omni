import { EventEmitter } from 'eventemitter3'
import type {
  AudioConfig,
  AudioStream,
  AudioBuffer,
  AudioVisualizationData,
  AudioRecordingState,
  AudioPlaybackState,
  AudioDevice,
  AudioConstraints
} from '@/types/audio'
import { VadDetector } from '@/modules/vad/VadDetector'

export class AudioManager extends EventEmitter {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private analyserNode: AnalyserNode | null = null
  private gainNode: GainNode | null = null
  private monitorGainNode: GainNode | null = null
  private audioElement: HTMLAudioElement | null = null
  private currentPlaybackUrl: string | null = null
  private playbackGainNode: GainNode | null = null
  private streamingSources: AudioBufferSourceNode[] = []
  private streamingState: { isActive: boolean; nextStartTime: number; hasChunks: boolean } = {
    isActive: false,
    nextStartTime: 0,
    hasChunks: false
  }
  private streamingStopTimeout: number | null = null
  private config: AudioConfig
  private recordingState: AudioRecordingState = {
    isRecording: false,
    isPaused: false,
    duration: 0,
    fileSize: 0,
    audioBuffer: [],
    currentBuffer: null
  }
  private connectionReady: boolean = false
  private playbackState: AudioPlaybackState = {
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    playbackRate: 1.0
  }
  private recordingTimer: number | null = null
  private animationFrame: number | null = null
  private devices: AudioDevice[] = []
  private vadDetector: VadDetector | null = null
  private lastVolume: number = 0  // 用于音量平滑处理

  constructor(config: Partial<AudioConfig> = {}) {
    super()

    this.config = {
      sampleRate: 16000,
      channelCount: 1,
      bufferSize: 4096,
      inputVolume: 1.0,
      outputVolume: 1.0,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...config
    }
  }

  async initialize(): Promise<void> {
    try {
      // 创建AudioContext
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate
      })

      // 创建播放增益节点，控制TTS输出音量
      this.playbackGainNode = this.audioContext.createGain()
      this.playbackGainNode.gain.value = this.config.outputVolume
      this.playbackGainNode.connect(this.audioContext.destination)

      // 创建音频元素
      this.audioElement = new Audio()
      this.audioElement.volume = this.config.outputVolume

      // 初始化VAD检测器
      this.vadDetector = new VadDetector({
        threshold: 5,
        silenceDuration: 1500, // 默认1500毫秒
        voiceStartCallback: () => {
          this.emit('voiceStarted');
        },
        voiceStopCallback: () => {
          this.emit('voiceStopped');
        }
      });

      // 获取设备列表
      await this.updateDeviceList()

      this.emit('initialized')
    } catch (error) {
      console.error('Audio initialization failed:', error)
      throw error
    }
  }

  async checkMicrophonePermission(): Promise<PermissionState> {
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      return permission.state
    } catch (error) {
      console.warn('Permission API not available, trying getUserMedia to check permission')
      return 'prompt'
    }
  }

  async requestMicrophonePermission(constraints?: AudioConstraints): Promise<boolean> {
    try {
      const mediaConstraints: MediaStreamConstraints = {
        audio: {
          sampleRate: { ideal: this.config.sampleRate },
          channelCount: { ideal: this.config.channelCount },
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          deviceId: constraints?.deviceId
        }
      }

      const testStream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
      testStream.getTracks().forEach(track => track.stop())
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      return false
    }
  }

  async startRecording(constraints?: AudioConstraints): Promise<void> {
    if (this.recordingState.isRecording) {
      return
    }

    try {
      // 检查权限
      const permission = await this.checkMicrophonePermission()
      if (permission === 'denied') {
        throw new Error('Microphone permission denied')
      }

      // 请求权限
      const hasPermission = await this.requestMicrophonePermission(constraints)
      if (!hasPermission) {
        throw new Error('Failed to get microphone permission')
      }

      // 获取媒体流
      const mediaConstraints: MediaStreamConstraints = {
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          deviceId: constraints?.deviceId
        }
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia(mediaConstraints)

      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume()
      }

      // 权限获取成功后，更新设备列表
      await this.updateDeviceList()

      // 添加流设置
      if (this.mediaStream.getAudioTracks().length > 0) {
        const settings = this.mediaStream.getAudioTracks()[0].getSettings()
      }

      // 检查音频轨道
      const audioTracks = this.mediaStream.getAudioTracks()

      // 创建音频处理节点
      this.setupAudioProcessing()
      console.log('🎤 Audio processing setup completed')

      // 测试麦克风输入
      this.testMicrophoneInput()

      // 开始录制
      this.recordingState.isRecording = true
      this.recordingState.isPaused = false
      this.recordingState.duration = 0
      this.recordingState.fileSize = 0
      this.recordingState.audioBuffer = []

      // 开始计时
      this.startRecordingTimer()

      // 开始音频处理
      this.startAudioProcessing()
      console.log('�️ Audio recording started successfully')

      this.emit('recordingStarted')
    } catch (error) {
      console.error('Failed to start recording:', error)
      this.emit('permissionDenied', error)
      throw error
    }
  }

  stopRecording(): void {
    if (!this.recordingState.isRecording) {
      return
    }

    // 停止录制
    this.recordingState.isRecording = false
    this.recordingState.isPaused = false

    // 清理资源
    this.cleanupAudioProcessing()
    this.cleanupMediaStream()

    // 停止计时
    this.stopRecordingTimer()

    this.emit('recordingStopped', {
      duration: this.recordingState.duration,
      bufferSize: this.recordingState.audioBuffer.length
    })
  }

  pauseRecording(): void {
    if (!this.recordingState.isRecording || this.recordingState.isPaused) {
      return
    }

    this.recordingState.isPaused = true
    this.stopRecordingTimer()
    this.emit('recordingPaused')
  }

  resumeRecording(): void {
    if (!this.recordingState.isRecording || !this.recordingState.isPaused) {
      return
    }

    this.recordingState.isPaused = false
    this.startRecordingTimer()
    this.emit('recordingResumed')
  }

  async playAudio(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioContext || !this.audioElement) {
      throw new Error('Audio not initialized')
    }

    try {
      // 停止当前播放
      this.stopPlayback()

      this.ensurePlaybackGainNode()

      // 创建Blob URL
      const blob = new Blob([audioData], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      this.currentPlaybackUrl = url

      // 设置音频源
      this.audioElement.src = url

      // 设置音量
      this.audioElement.volume = this.config.outputVolume

      // 播放音频
      await this.audioElement.play()

      this.playbackState.isPlaying = true
      this.playbackState.isPaused = false
      this.playbackState.currentTime = 0

      // 监听播放结束
      this.audioElement.onended = () => {
        this.stopPlayback()
        URL.revokeObjectURL(url)
        this.currentPlaybackUrl = null
      }

      // 更新播放进度
      this.updatePlaybackProgress()

      this.emit('playbackStarted')
    } catch (error) {
      console.error('Failed to play audio:', error)
      throw error
    }
  }

  beginStreamingPlayback(): void {
    if (!this.audioContext) {
      throw new Error('Audio not initialized')
    }

    this.clearStreamingStopTimeout()
    this.stopStreamingSources()
    this.streamingSources = []

    this.streamingState.isActive = true
    this.streamingState.nextStartTime = this.audioContext.currentTime + 0.05
    this.streamingState.hasChunks = false

    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.currentTime = 0
    }

    if (this.playbackState.isPlaying) {
      this.playbackState.isPlaying = false
      this.playbackState.isPaused = false
      this.playbackState.currentTime = 0
      this.playbackState.duration = 0
      this.emit('playbackStopped')
    }
  }

  hasStreamedAudio(): boolean {
    return this.streamingState.hasChunks
  }

  async enqueueAudioChunk(chunk: ArrayBuffer, sampleRate?: number): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio not initialized')
    }

    if (!this.streamingState.isActive) {
      try {
        this.beginStreamingPlayback()
      } catch (error) {
        console.error('Failed to auto-start streaming playback:', error)
      }
    }

    this.ensurePlaybackGainNode()

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => undefined)
      }

      const extracted = this.extractPcmData(chunk, sampleRate)
      if (!extracted) {
        return
      }

      const targetRate = this.audioContext.sampleRate
      const samples = extracted.sampleRate && extracted.sampleRate !== targetRate
        ? this.resampleFloat32(extracted.samples, extracted.sampleRate, targetRate)
        : extracted.samples

      if (samples.length === 0) {
        return
      }

      const buffer = this.audioContext.createBuffer(1, samples.length, targetRate)
      buffer.copyToChannel(samples, 0)

      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.playbackGainNode ?? this.audioContext.destination)

      const startTime = Math.max(this.streamingState.nextStartTime, this.audioContext.currentTime + 0.01)
      source.start(startTime)

      this.streamingState.nextStartTime = startTime + buffer.duration
      this.streamingState.hasChunks = true
      this.streamingSources.push(source)

      source.onended = () => {
        this.streamingSources = this.streamingSources.filter(active => active !== source)

        if (!this.streamingState.isActive && this.streamingSources.length === 0) {
          this.completeStreamingPlayback()
        }
      }

      if (!this.playbackState.isPlaying) {
        this.playbackState.isPlaying = true
        this.playbackState.isPaused = false
        this.emit('playbackStarted')
      }
    } catch (error) {
      console.error('Failed to enqueue audio chunk:', error)
    }
  }

  finishStreamingPlayback(): void {
    this.streamingState.isActive = false

    if (!this.audioContext) {
      this.completeStreamingPlayback()
      return
    }

    if (this.streamingSources.length === 0) {
      this.completeStreamingPlayback()
      return
    }

    const remainingMs = Math.max(100, (this.streamingState.nextStartTime - this.audioContext.currentTime) * 1000 + 100)
    this.clearStreamingStopTimeout()
    this.streamingStopTimeout = window.setTimeout(() => this.completeStreamingPlayback(), remainingMs)
  }

  private ensurePlaybackGainNode(): void {
    if (!this.audioContext) {
      return
    }

    if (!this.playbackGainNode) {
      this.playbackGainNode = this.audioContext.createGain()
      this.playbackGainNode.connect(this.audioContext.destination)
    }

    this.playbackGainNode.gain.value = this.config.outputVolume
  }

  private extractPcmData(buffer: ArrayBuffer, providedSampleRate?: number): { samples: Float32Array; sampleRate: number } | null {
    if (!buffer || buffer.byteLength < 2) {
      return null
    }

    const view = new DataView(buffer)
    const RIFF = 0x52494646
    const WAVE = 0x57415645
    const DATA = 0x64617461
    const FMT = 0x666d7420

    const isRiff = view.byteLength >= 12 && view.getUint32(0, false) === RIFF && view.getUint32(8, false) === WAVE

    if (isRiff) {
      let offset = 12
      let sampleRate = providedSampleRate ?? 24000
      let bitsPerSample = 16

      while (offset + 8 <= view.byteLength) {
        const chunkId = view.getUint32(offset, false)
        const chunkSize = view.getUint32(offset + 4, true)
        const dataOffset = offset + 8

        if (chunkId === FMT && chunkSize >= 16) {
          const fmtSampleRate = view.getUint32(dataOffset + 4, true)
          const fmtBitsPerSample = view.getUint16(dataOffset + 14, true)
          sampleRate = fmtSampleRate || sampleRate
          bitsPerSample = fmtBitsPerSample || bitsPerSample
        }

        if (chunkId === DATA) {
          const slice = buffer.slice(dataOffset, dataOffset + chunkSize)
          if (bitsPerSample !== 16) {
            console.warn('Unsupported bitsPerSample for streaming audio chunk:', bitsPerSample)
            return null
          }
          const pcm = new Int16Array(slice)
          if (pcm.length === 0) {
            return null
          }
          return {
            samples: this.pcm16ToFloat32(pcm),
            sampleRate
          }
        }

        offset += 8 + chunkSize
      }
    }

    const pcmSamples = new Int16Array(buffer)
    if (pcmSamples.length === 0) {
      return null
    }

    return {
      samples: this.pcm16ToFloat32(pcmSamples),
      sampleRate: providedSampleRate ?? 24000
    }
  }

  private pcm16ToFloat32(samples: Int16Array): Float32Array {
    const float32 = new Float32Array(samples.length)
    const divisor = 32768
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i] / divisor
      float32[i] = Math.max(-1, Math.min(1, value))
    }
    return float32
  }

  private resampleFloat32(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
    if (inputRate === targetRate || input.length === 0) {
      return input
    }

    const ratio = inputRate / targetRate
    if (ratio <= 0) {
      return input
    }

    const outputLength = Math.max(1, Math.round(input.length / ratio))
    const output = new Float32Array(outputLength)

    let position = 0
    for (let i = 0; i < outputLength; i++) {
      const index = Math.floor(position)
      const nextIndex = Math.min(index + 1, input.length - 1)
      const weight = position - index
      output[i] = input[index] * (1 - weight) + input[nextIndex] * weight
      position += ratio
    }

    return output
  }

  private completeStreamingPlayback(): void {
    this.clearStreamingStopTimeout()

    this.stopStreamingSources()
    this.streamingSources = []
    this.streamingState.nextStartTime = 0
    this.streamingState.isActive = false

    if (this.playbackState.isPlaying) {
      this.playbackState.isPlaying = false
      this.playbackState.isPaused = false
      this.playbackState.currentTime = 0
      this.playbackState.duration = 0
      this.emit('playbackStopped')
    }
  }

  private stopStreamingSources(): void {
    if (this.streamingSources.length === 0) {
      return
    }

    for (const source of this.streamingSources) {
      try {
        source.onended = null
        source.stop()
      } catch (error) {
        console.warn('Failed to stop streaming source:', error)
      }
    }
  }

  private clearStreamingStopTimeout(): void {
    if (this.streamingStopTimeout) {
      window.clearTimeout(this.streamingStopTimeout)
      this.streamingStopTimeout = null
    }
  }

  stopPlayback(): void {
    this.clearStreamingStopTimeout()
    this.stopStreamingSources()
    this.streamingSources = []
    this.streamingState.isActive = false
    this.streamingState.nextStartTime = 0
    this.streamingState.hasChunks = false

    if (this.audioElement) {
      this.audioElement.onended = null
      this.audioElement.pause()
      this.audioElement.currentTime = 0
      this.audioElement.src = ''
    }

    if (this.currentPlaybackUrl) {
      URL.revokeObjectURL(this.currentPlaybackUrl)
      this.currentPlaybackUrl = null
    }

    if (this.playbackState.isPlaying) {
      this.playbackState.isPlaying = false
      this.playbackState.isPaused = false
      this.playbackState.currentTime = 0
      this.playbackState.duration = 0
      this.emit('playbackStopped')
    }
  }

  pausePlayback(): void {
    if (!this.playbackState.isPlaying || this.playbackState.isPaused) {
      return
    }

    if (this.audioElement) {
      this.audioElement.pause()
    }

    this.playbackState.isPaused = true
    this.emit('playbackPaused')
  }

  resumePlayback(): void {
    if (!this.playbackState.isPlaying || !this.playbackState.isPaused) {
      return
    }

    if (this.audioElement) {
      this.audioElement.play()
    }

    this.playbackState.isPaused = false
    this.emit('playbackResumed')
  }

  setVolume(level: number): void {
    this.config.outputVolume = Math.max(0, Math.min(1, level))

    if (this.audioElement) {
      this.audioElement.volume = this.config.outputVolume
    }

    if (this.playbackGainNode) {
      this.playbackGainNode.gain.value = this.config.outputVolume
    }

    this.emit('volumeChanged', this.config.outputVolume)
  }

  getVolumeLevel(): number {
    if (!this.analyserNode) {
      return 0
    }

    const timeData = new Float32Array(this.analyserNode.fftSize)
    this.analyserNode.getFloatTimeDomainData(timeData)

    let sumOfSquares = 0
    let peak = 0
    for (let i = 0; i < timeData.length; i++) {
      const sample = timeData[i]
      sumOfSquares += sample * sample
      peak = Math.max(peak, Math.abs(sample))
    }
    const rms = Math.sqrt(sumOfSquares / timeData.length)
    let magnitude = Math.max(rms, peak)

    if (magnitude < 0.01) {
      const freqData = new Uint8Array(this.analyserNode.frequencyBinCount)
      this.analyserNode.getByteFrequencyData(freqData)
      let sum = 0
      for (let i = 0; i < freqData.length; i++) {
        sum += freqData[i]
      }
      const avgFrequency = (sum / freqData.length) / 255
      magnitude = Math.max(magnitude, avgFrequency)
    }

    let volume = Math.min(100, Math.max(0, Math.sqrt(magnitude) * 100))

    const smoothFactor = 0.2 // 使音量变化更平滑
    volume = this.lastVolume * (1 - smoothFactor) + volume * smoothFactor
    this.lastVolume = volume

    const volumePercent = Math.round(volume)
    
    if (volumePercent > 0) {
      console.log('🔊 Volume detected:', {
        rawRms: rms.toFixed(4),
        peak: peak.toFixed(4),
        final: volumePercent
      })
    }
    
    return volumePercent
  }

  getVisualizationData(): AudioVisualizationData {
    if (!this.analyserNode) {
      return {
        volume: 0,
        frequency: new Uint8Array(0),
        timeData: new Uint8Array(0),
        timestamp: Date.now()
      }
    }

    const frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount)
    const timeData = new Uint8Array(this.analyserNode.fftSize)

    this.analyserNode.getByteFrequencyData(frequencyData)
    this.analyserNode.getByteTimeDomainData(timeData)

    return {
      volume: this.getVolumeLevel(), // 现在返回0-100范围
      frequency: frequencyData,
      timeData,
      timestamp: Date.now()
    }
  }

  getRecordingState(): AudioRecordingState {
    return { ...this.recordingState }
  }

  getPlaybackState(): AudioPlaybackState {
    return { ...this.playbackState }
  }

  clearAudioBuffer(): void {
    this.recordingState.audioBuffer = []
    this.recordingState.currentBuffer = null
    this.recordingState.duration = 0
    this.recordingState.fileSize = 0
    this.emit('audioBufferCleared')
  }

  async getDevices(): Promise<AudioDevice[]> {
    try {
      // 强制更新设备列表
      await this.updateDeviceList()
      return [...this.devices]
    } catch (error) {
      console.error('Failed to get devices:', error)
      return []
    }
  }

  setConnectionReady(ready: boolean): void {
    this.connectionReady = ready
  }

  isVoiceActive(): boolean {
    return this.vadDetector?.isVoiceActive() || false;
  }

  getVadVolumeLevel(): number {
    return this.vadDetector?.getVolume() ?? 0;
  }

  getAudioBuffer(): AudioBuffer | null {
    return this.recordingState.currentBuffer;
  }

  updateVadConfig(config: Partial<{ threshold: number; silenceDuration: number }>): void {
    const normalized = { ...config }
    if (typeof normalized.threshold === 'number' && normalized.threshold <= 1) {
      normalized.threshold = normalized.threshold * 100
    }
    this.vadDetector?.updateConfig(normalized)
  }

  // 获取音频上下文（供VAD使用）
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  // 获取分析器节点（供VAD使用）
  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  private setupAudioProcessing(): void {
    if (!this.audioContext || !this.mediaStream) {
      return
    }

    // 创建源节点
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)

    // 创建增益节点 (用于提高输入音量敏感度)
    this.gainNode = this.audioContext.createGain()
    this.gainNode.gain.value = 20.0 // 增加增益以提高敏感度

    // 创建分析器节点 (用于音量可视化和VAD)
    this.analyserNode = this.audioContext.createAnalyser()
    this.analyserNode.fftSize = 2048
    
    // 连接节点：源 -> 增益 -> 分析器 (用于音量检测)
    this.sourceNode.connect(this.gainNode)
    this.gainNode.connect(this.analyserNode)
    // 将分析器输出连接到静音增益节点，防止音频被听到的同时保持处理链路激活
    this.monitorGainNode = this.audioContext.createGain()
    this.monitorGainNode.gain.value = 0
    this.analyserNode.connect(this.monitorGainNode)
    this.monitorGainNode.connect(this.audioContext.destination)

    // 初始化VAD检测器 (需要在分析器设置完成后)
    if (this.vadDetector && this.audioContext && this.analyserNode) {
      this.vadDetector.initialize(this.audioContext, this.analyserNode);
    }
  }

  private startAudioProcessing(): void {
    if (!this.analyserNode) {
      console.log('🎤 No analyser node available')
      return
    }

    let audioFrameCount = 0
    let lastAudioSendTime = 0
    let lastVisualizationTime = 0
    const audioSendInterval = 50 // 每50ms发送一次音频数据
    const visualizationInterval = 16 // 每16ms更新一次可视化数据（60fps）

    const processAudio = () => {
      if (this.recordingState.isRecording && !this.recordingState.isPaused) {
        audioFrameCount++
        const currentTime = Date.now()

        // 获取音频数据
        const bufferLength = this.analyserNode?.fftSize || 2048
        const dataArray = new Float32Array(bufferLength)
        this.analyserNode?.getFloatTimeDomainData(dataArray)

        // 转换为PCM16格式
        const pcmData = this.convertToPCM16(dataArray)

        // 创建音频缓冲区
        const dataBuffer = pcmData.buffer.slice(0)
        const audioBuffer: AudioBuffer = {
          data: dataBuffer,
          format: 'pcm16',
          sampleRate: this.config.sampleRate,
          duration: pcmData.length / this.config.sampleRate,
          timestamp: currentTime
        }

        // 添加到缓冲区
        this.recordingState.audioBuffer.push(audioBuffer)
        this.recordingState.fileSize += pcmData.buffer.byteLength

        // 更新当前缓冲区
        this.recordingState.currentBuffer = audioBuffer

        // 控制音频数据发送频率
        if (currentTime - lastAudioSendTime >= audioSendInterval) {
          lastAudioSendTime = currentTime

          // 持续发送所有音频数据，让服务器处理VAD
          const audioData = {
            buffer: audioBuffer,
            base64: this.arrayBufferToBase64(pcmData.buffer)
          }

          // 调试：每20次发送打印一次音频数据信息
          if (audioFrameCount % 20 === 0) {
            console.log('🎵 Audio frame sent:', {
              frame: audioFrameCount,
              bufferSize: pcmData.buffer.byteLength,
              sampleRate: this.config.sampleRate,
              base64Length: audioData.base64.length
            })
          }

          this.emit('audioData', audioData)
        }

        // 发送可视化数据事件（更频繁）
        if (currentTime - lastVisualizationTime >= visualizationInterval) {
          lastVisualizationTime = currentTime
          const vizData = this.getVisualizationData()
          this.emit('visualizationData', vizData)
          
          // 调试：每30次打印一次音量信息
          if (audioFrameCount % 30 === 0) {
            console.log('🔊 Visualization data:', {
              volume: vizData.volume,
              timestamp: vizData.timestamp
            })
          }
        }
      } else {
        // 如果不在录音状态，停止音频处理循环
        if (this.animationFrame) {
          cancelAnimationFrame(this.animationFrame)
          this.animationFrame = null
        }
      }

      if (this.recordingState.isRecording) {
        this.animationFrame = requestAnimationFrame(processAudio)
      }
    }

    this.animationFrame = requestAnimationFrame(processAudio)
    
    // 启动VAD检测
    if (this.vadDetector) {
      this.vadDetector.startDetection();
    }
  }

  private testMicrophoneInput(): void {
    // 增加延迟等待音频流稳定
    setTimeout(() => {
      if (!this.analyserNode || !this.mediaStream) {
        return
      }

      // 检查轨道状态
      const tracks = this.mediaStream.getTracks()
    }, 2000) // 增加到2秒延迟
  }

  private convertToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16Array = new Int16Array(float32Array.length)

    for (let i = 0; i < float32Array.length; i++) {
      // 将浮点数转换为16位整数
      const sample = Math.max(-1, Math.min(1, float32Array[i]))
      pcm16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    }

    return pcm16Array
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength

    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }

    return btoa(binary)
  }

  private startRecordingTimer(): void {
    this.recordingTimer = window.setInterval(() => {
      if (this.recordingState.isRecording && !this.recordingState.isPaused) {
        this.recordingState.duration += 1
      }
    }, 1000)
  }

  private stopRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer)
      this.recordingTimer = null
    }
  }

  private updatePlaybackProgress(): void {
    if (!this.audioElement || !this.playbackState.isPlaying) {
      return
    }

    this.playbackState.currentTime = this.audioElement.currentTime
    this.playbackState.duration = this.audioElement.duration || 0

    if (this.playbackState.isPlaying) {
      requestAnimationFrame(() => this.updatePlaybackProgress())
    }
  }

  private cleanupAudioProcessing(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }

    // 停止VAD检测
    if (this.vadDetector) {
      this.vadDetector.stopDetection();
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect()
      this.analyserNode = null
    }

    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }

    if (this.monitorGainNode) {
      this.monitorGainNode.disconnect()
      this.monitorGainNode = null
    }
  }

  private cleanupMediaStream(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
  }

  private async updateDeviceList(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      
      this.devices = devices
        .filter(device => device.kind === 'audioinput' || device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `${device.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${device.deviceId.slice(0, 8)}`,
          kind: device.kind as 'audioinput' | 'audiooutput',
          groupId: device.groupId,
          isDefault: device.deviceId === 'default' || device.label.toLowerCase().includes('default')
        }))
      
    } catch (error) {
      console.error('Failed to update device list:', error)
      this.devices = []
    }
  }

  async validateDevice(deviceId: string): Promise<boolean> {
    try {
      const constraints = {
        audio: {
          deviceId: { exact: deviceId },
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const track = stream.getAudioTracks()[0]

      // 创建一个临时的AudioContext来测试音频输入
      const tempContext = new AudioContext({ sampleRate: this.config.sampleRate })
      const source = tempContext.createMediaStreamSource(stream)
      const analyser = tempContext.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)

      // 检测是否有音频活动
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let hasAudio = false

      // 检测3秒内的音频活动
      for (let i = 0; i < 30; i++) { // 每100ms检查一次
        await new Promise(resolve => setTimeout(resolve, 100))
        analyser.getByteFrequencyData(dataArray)
        
        // 检查是否检测到音频活动
        for (let j = 0; j < dataArray.length; j++) {
          if (dataArray[j] > 10) { // 检查是否有明显的音频活动
            hasAudio = true
            break
          }
        }
        
        if (hasAudio) break
      }

      // 清理资源
      stream.getTracks().forEach(track => track.stop())
      await tempContext.close()

      return hasAudio
    } catch (error) {
      console.error(`Error validating device ${deviceId}:`, error)
      return false
    }
  }

  async findBestAudioInputDevice(): Promise<string | null> {
    try {
      // 首先获取最新的设备列表
      await this.updateDeviceList()
      
      // 获取所有音频输入设备
      const audioInputs = this.devices.filter(device => device.kind === 'audioinput')
      
      if (audioInputs.length === 0) {
        console.log('No audio input devices found')
        return null
      }

      // 首先检查默认设备是否有声音
      const defaultDevice = audioInputs.find(device => device.isDefault)
      if (defaultDevice) {
        console.log('Testing default device:', defaultDevice.label)
        const isValid = await this.validateDevice(defaultDevice.deviceId)
        if (isValid) {
          console.log('Default device is working:', defaultDevice.label)
          return defaultDevice.deviceId
        } else {
          console.log('Default device is not working:', defaultDevice.label)
        }
      }

      // 如果默认设备不可用，测试其他设备
      for (const device of audioInputs) {
        if (device.isDefault) continue // 已测试默认设备
        
        console.log('Testing device:', device.label)
        const isValid = await this.validateDevice(device.deviceId)
        if (isValid) {
          console.log('Found working device:', device.label)
          return device.deviceId
        } else {
          console.log('Device is not working:', device.label)
        }
      }

      // 如果没有找到可用的设备，使用第一个设备
      console.log('No working devices found, using first available device')
      return audioInputs[0].deviceId
    } catch (error) {
      console.error('Error finding best audio input device:', error)
      return null
    }
  }

  dispose(): void {
    this.stopRecording()
    this.stopPlayback()
    this.cleanupAudioProcessing()
    this.cleanupMediaStream()
    this.connectionReady = false

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    if (this.audioElement) {
      this.audioElement = null
    }

    // 清理VAD检测器
    if (this.vadDetector) {
      this.vadDetector.stopDetection();
      this.vadDetector = null;
    }

    this.removeAllListeners()
  }
}

export default AudioManager
