import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ScreenCaptureState, ScreenshotData, DisplayInfo } from '@/types/screen'

export const useScreenStore = defineStore('screen', () => {
  // 捕获状态
  const isCapturing = ref(false)
  const isPaused = ref(false)
  const captureState = ref<'idle' | 'capturing' | 'paused' | 'stopped'>('idle')

  // 截图数据
  const lastScreenshot = ref<string | null>(null)
  const screenshotHistory = ref<string[]>([])
  const totalCaptures = ref(0)

  // 捕获设置
  const captureInterval = ref(1000)
  const resolution = ref({ width: 1920, height: 1080 })
  const quality = ref(0.8)
  const format = ref<'jpeg' | 'png'>('jpeg')
  const compression = ref(0.8)

  // 设备信息
  const displays = ref<DisplayInfo[]>([])
  const selectedDisplay = ref<string>('')
  const screenPermission = ref<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')

  // 错误状态
  const screenError = ref<string | null>(null)
  const permissionError = ref<string | null>(null)

  // 统计信息
  const captureStats = ref({
    totalSize: 0,
    averageSize: 0,
    captureRate: 0,
    lastCaptureTime: 0,
    failedCaptures: 0
  })

  // 计算属性
  const captureInfo = computed(() => ({
    isCapturing: isCapturing.value,
    isPaused: isPaused.value,
    state: captureState.value,
    interval: captureInterval.value,
    resolution: resolution.value,
    quality: quality.value,
    format: format.value,
    compression: compression.value
  }))

  const hasScreenshot = computed(() => lastScreenshot.value !== null)

  const screenshotCount = computed(() => screenshotHistory.value.length)

  const isScreenActive = computed(() => isCapturing.value)

  const hasScreenPermission = computed(() => screenPermission.value === 'granted')

  const selectedDisplayInfo = computed(() => {
    return displays.value.find(display => display.displayId === selectedDisplay.value) || null
  })

  const captureRate = computed(() => {
    if (captureStats.value.lastCaptureTime === 0) return 0
    const timeDiff = Date.now() - captureStats.value.lastCaptureTime
    return timeDiff > 0 ? (1000 / timeDiff) : 0
  })

  // 动作
  const startCapture = () => {
    isCapturing.value = true
    isPaused.value = false
    captureState.value = 'capturing'
    screenError.value = null
  }

  const stopCapture = () => {
    isCapturing.value = false
    isPaused.value = false
    captureState.value = 'stopped'
  }

  const pauseCapture = () => {
    isPaused.value = true
    captureState.value = 'paused'
  }

  const resumeCapture = () => {
    isPaused.value = false
    captureState.value = 'capturing'
  }

  const setLastScreenshot = (screenshot: string) => {
    lastScreenshot.value = screenshot
    screenshotHistory.value.push(screenshot)

    // 限制历史记录数量
    if (screenshotHistory.value.length > 100) {
      screenshotHistory.value = screenshotHistory.value.slice(-100)
    }

    totalCaptures.value++

    // 更新统计信息
    updateCaptureStats(screenshot.length)
  }

  const clearScreenshotHistory = () => {
    screenshotHistory.value = []
    totalCaptures.value = 0
    captureStats.value.totalSize = 0
    captureStats.value.averageSize = 0
  }

  const setCaptureInterval = (interval: number) => {
    captureInterval.value = Math.max(100, Math.min(10000, interval))
  }

  const setResolution = (width: number, height: number) => {
    resolution.value = { width, height }
  }

  const setQuality = (qualityValue: number) => {
    quality.value = Math.max(0.1, Math.min(1, qualityValue))
  }

  const setFormat = (formatValue: 'jpeg' | 'png') => {
    format.value = formatValue
  }

  const setCompression = (compressionValue: number) => {
    compression.value = Math.max(0.1, Math.min(1, compressionValue))
  }

  const setDisplays = (displaysList: DisplayInfo[]) => {
    displays.value = displaysList

    // 如果没有选中的显示器，选择第一个
    if (!selectedDisplay.value && displaysList.length > 0) {
      selectedDisplay.value = displaysList[0].displayId
    }
  }

  const setSelectedDisplay = (displayId: string) => {
    selectedDisplay.value = displayId
  }

  const setScreenPermission = (permission: 'granted' | 'denied' | 'prompt' | 'unknown') => {
    screenPermission.value = permission
  }

  const setScreenError = (error: string | null) => {
    screenError.value = error
  }

  const setPermissionError = (error: string | null) => {
    permissionError.value = error
  }

  const incrementFailedCaptures = () => {
    captureStats.value.failedCaptures++
  }

  const updateCaptureStats = (screenshotSize: number) => {
    captureStats.value.totalSize += screenshotSize
    captureStats.value.averageSize = captureStats.value.totalSize / totalCaptures.value
    captureStats.value.lastCaptureTime = Date.now()
  }

  const resetStats = () => {
    captureStats.value = {
      totalSize: 0,
      averageSize: 0,
      captureRate: 0,
      lastCaptureTime: 0,
      failedCaptures: 0
    }
  }

  const reset = () => {
    // 重置捕获状态
    isCapturing.value = false
    isPaused.value = false
    captureState.value = 'idle'

    // 重置截图数据
    lastScreenshot.value = null
    screenshotHistory.value = []
    totalCaptures.value = 0

    // 重置设置
    captureInterval.value = 1000
    resolution.value = { width: 1920, height: 1080 }
    quality.value = 0.8
    format.value = 'jpeg'
    compression.value = 0.8

    // 重置设备信息
    displays.value = []
    selectedDisplay.value = ''
    screenPermission.value = 'unknown'

    // 重置错误状态
    screenError.value = null
    permissionError.value = null

    // 重置统计信息
    resetStats()
  }

  return {
    // 状态
    isCapturing,
    isPaused,
    captureState,
    lastScreenshot,
    screenshotHistory,
    totalCaptures,
    captureInterval,
    resolution,
    quality,
    format,
    compression,
    displays,
    selectedDisplay,
    screenPermission,
    screenError,
    permissionError,
    captureStats,

    // 计算属性
    captureInfo,
    hasScreenshot,
    screenshotCount,
    isScreenActive,
    hasScreenPermission,
    selectedDisplayInfo,
    captureRate,

    // 动作
    startCapture,
    stopCapture,
    pauseCapture,
    resumeCapture,
    setLastScreenshot,
    clearScreenshotHistory,
    setCaptureInterval,
    setResolution,
    setQuality,
    setFormat,
    setCompression,
    setDisplays,
    setSelectedDisplay,
    setScreenPermission,
    setScreenError,
    setPermissionError,
    incrementFailedCaptures,
    updateCaptureStats,
    resetStats,
    reset
  }
})