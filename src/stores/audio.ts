import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AudioRecordingState, AudioPlaybackState, AudioVisualizationData } from '@/types/audio'

export const useAudioStore = defineStore('audio', () => {
  // 录制状态
  const isRecording = ref(false)
  const isPaused = ref(false)
  const recordingDuration = ref(0)
  const recordingFileSize = ref(0)
  const audioBuffer = ref<ArrayBuffer[]>([])
  const recordingState = ref<'idle' | 'recording' | 'paused' | 'stopped'>('idle')

  // 播放状态
  const isPlaying = ref(false)
  const isPlaybackPaused = ref(false)
  const playbackCurrentTime = ref(0)
  const playbackDuration = ref(0)
  const playbackRate = ref(1.0)
  const playbackState = ref<'idle' | 'playing' | 'paused' | 'stopped'>('idle')

  // 音频设置
  const volumeLevel = ref(0)
  const inputVolume = ref(1.0)
  const outputVolume = ref(1.0)
  const sampleRate = ref(16000)
  const channelCount = ref(1)
  const bufferSize = ref(4096)

  // 设备信息
  const selectedInputDevice = ref<string>('')
  const selectedOutputDevice = ref<string>('')
  const audioDevices = ref<Array<{
    deviceId: string
    label: string
    kind: 'audioinput' | 'audiooutput'
    groupId: string
    isDefault: boolean
  }>>([])

  // 可视化数据
  const visualizationData = ref<AudioVisualizationData | null>(null)

  // VAD状态
  const isVoiceActive = ref(false)
  const vadThreshold = ref(18)
  const vadSilenceDuration = ref(1500) // 默认1500毫秒

  // 错误状态
  const audioError = ref<string | null>(null)
  const permissionDenied = ref(false)

  // 计算属性
  const isAudioActive = computed(() => isRecording.value || isPlaying.value)

  const recordingInfo = computed(() => ({
    isRecording: isRecording.value,
    isPaused: isPaused.value,
    duration: recordingDuration.value,
    fileSize: recordingFileSize.value,
    bufferSize: audioBuffer.value.length,
    state: recordingState.value
  }))

  const playbackInfo = computed(() => ({
    isPlaying: isPlaying.value,
    isPaused: isPlaybackPaused.value,
    currentTime: playbackCurrentTime.value,
    duration: playbackDuration.value,
    playbackRate: playbackRate.value,
    state: playbackState.value
  }))

  const audioSettings = computed(() => ({
    inputVolume: inputVolume.value,
    outputVolume: outputVolume.value,
    sampleRate: sampleRate.value,
    channelCount: channelCount.value,
    bufferSize: bufferSize.value,
    selectedInputDevice: selectedInputDevice.value,
    selectedOutputDevice: selectedOutputDevice.value
  }))

  const hasAudioPermission = computed(() => !permissionDenied.value)

  // VAD 计算属性
  const vadStatus = computed(() => ({
    isVoiceActive: isVoiceActive.value,
    threshold: vadThreshold.value,
    silenceDuration: vadSilenceDuration.value
  }))

  // 动作
  const startRecording = () => {
    isRecording.value = true
    isPaused.value = false
    recordingDuration.value = 0
    recordingFileSize.value = 0
    audioBuffer.value = []
    recordingState.value = 'recording'
    audioError.value = null
  }

  const stopRecording = () => {
    isRecording.value = false
    isPaused.value = false
    recordingState.value = 'stopped'
  }

  const pauseRecording = () => {
    isPaused.value = true
    recordingState.value = 'paused'
  }

  const resumeRecording = () => {
    isPaused.value = false
    recordingState.value = 'recording'
  }

  const startPlayback = () => {
    isPlaying.value = true
    isPlaybackPaused.value = false
    playbackState.value = 'playing'
  }

  const stopPlayback = () => {
    isPlaying.value = false
    isPlaybackPaused.value = false
    playbackCurrentTime.value = 0
    playbackState.value = 'stopped'
  }

  const pausePlayback = () => {
    isPlaybackPaused.value = true
    playbackState.value = 'paused'
  }

  const resumePlayback = () => {
    isPlaybackPaused.value = false
    playbackState.value = 'playing'
  }

  const setVolumeLevel = (level: number) => {
    // 现在音量是0-100范围，不需要限制到0-1
    volumeLevel.value = Math.max(0, Math.min(100, level))
  }

  const setInputVolume = (volume: number) => {
    inputVolume.value = Math.max(0, Math.min(1, volume))
  }

  const setOutputVolume = (volume: number) => {
    outputVolume.value = Math.max(0, Math.min(1, volume))
  }

  const setPlaybackCurrentTime = (time: number) => {
    playbackCurrentTime.value = Math.max(0, time)
  }

  const setPlaybackDuration = (duration: number) => {
    playbackDuration.value = Math.max(0, duration)
  }

  const setPlaybackRate = (rate: number) => {
    playbackRate.value = Math.max(0.5, Math.min(2, rate))
  }

  const addAudioBuffer = (buffer: ArrayBuffer) => {
    audioBuffer.value.push(buffer)
    recordingFileSize.value += buffer.byteLength
  }

  const clearAudioBuffer = () => {
    audioBuffer.value = []
    recordingFileSize.value = 0
  }

  const updateRecordingDuration = (duration: number) => {
    recordingDuration.value = duration
  }

  const setVisualizationData = (data: AudioVisualizationData) => {
    visualizationData.value = data
    setVolumeLevel(data.volume)
  }

  const setAudioDevices = (devices: typeof audioDevices.value) => {
    audioDevices.value = devices
  }

  const setSelectedInputDevice = (deviceId: string) => {
    selectedInputDevice.value = deviceId
  }

  const setSelectedOutputDevice = (deviceId: string) => {
    selectedOutputDevice.value = deviceId
  }

  const setAudioError = (error: string | null) => {
    audioError.value = error
  }

  const setPermissionDenied = (denied: boolean) => {
    permissionDenied.value = denied
  }

  // VAD 动作
  const setVoiceActive = (active: boolean) => {
    isVoiceActive.value = active
  }

  const updateVadThreshold = (threshold: number) => {
    vadThreshold.value = Math.max(0, Math.min(100, threshold))
  }

  const updateVadSilenceDuration = (duration: number) => {
    vadSilenceDuration.value = Math.max(500, Math.min(4000, duration))
  }

  const reset = () => {
    // 重置录制状态
    isRecording.value = false
    isPaused.value = false
    recordingDuration.value = 0
    recordingFileSize.value = 0
    audioBuffer.value = []
    recordingState.value = 'idle'

    // 重置播放状态
    isPlaying.value = false
    isPlaybackPaused.value = false
    playbackCurrentTime.value = 0
    playbackDuration.value = 0
    playbackRate.value = 1.0
    playbackState.value = 'idle'

    // 重置VAD状态
    isVoiceActive.value = false
    vadThreshold.value = 18
    vadSilenceDuration.value = 1500

    // 重置其他状态
    volumeLevel.value = 0
    inputVolume.value = 1.0
    outputVolume.value = 1.0
    visualizationData.value = null
    audioError.value = null
    permissionDenied.value = false
  }

  return {
    // 状态
    isRecording,
    isPaused,
    recordingDuration,
    recordingFileSize,
    audioBuffer,
    recordingState,
    isPlaying,
    isPlaybackPaused,
    playbackCurrentTime,
    playbackDuration,
    playbackRate,
    playbackState,
    volumeLevel,
    inputVolume,
    outputVolume,
    sampleRate,
    channelCount,
    bufferSize,
    selectedInputDevice,
    selectedOutputDevice,
    audioDevices,
    visualizationData,
    isVoiceActive,
    vadThreshold,
    vadSilenceDuration,
    audioError,
    permissionDenied,

    // 计算属性
    isAudioActive,
    recordingInfo,
    playbackInfo,
    audioSettings,
    hasAudioPermission,
    vadStatus,

    // 动作
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    startPlayback,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    setVolumeLevel,
    setInputVolume,
    setOutputVolume,
    setPlaybackCurrentTime,
    setPlaybackDuration,
    setPlaybackRate,
    addAudioBuffer,
    clearAudioBuffer,
    updateRecordingDuration,
    setVisualizationData,
    setAudioDevices,
    setSelectedInputDevice,
    setSelectedOutputDevice,
    setAudioError,
    setPermissionDenied,
    setVoiceActive,
    updateVadThreshold,
    updateVadSilenceDuration,
    reset
  }
})
