<template>
  <div class="screen-preview">
    <div class="preview-header">
      <h3>屏幕预览</h3>
      <div class="capture-status" :class="screenStore.captureState">
        {{ captureStatusText }}
      </div>
    </div>

    <div class="preview-content">
      <div class="screenshot-container" v-if="screenStore.lastScreenshot">
        <img
          :src="screenStore.lastScreenshot"
          alt="屏幕截图"
          class="screenshot-image"
        />
        <div class="screenshot-info">
          <span class="info-item">{{ screenStore.resolution.width }}x{{ screenStore.resolution.height }}</span>
          <span class="info-item">{{ formatFileSize(calculateImageSize(screenStore.lastScreenshot)) }}</span>
          <span class="info-item">{{ formatTime(new Date()) }}</span>
        </div>
      </div>
      <div class="no-screenshot" v-else>
        <div class="no-screenshot-icon">📷</div>
        <p>暂无屏幕截图</p>
        <p class="no-screenshot-hint">点击开始截屏按钮开始捕获屏幕</p>
      </div>
    </div>

    <div class="preview-controls">
      <div class="control-group">
        <label>截屏间隔</label>
        <input
          type="range"
          v-model="captureInterval"
          min="100"
          max="5000"
          step="100"
          @input="updateCaptureInterval"
        />
        <span>{{ captureInterval }}ms</span>
      </div>

      <div class="control-group">
        <label>图像质量</label>
        <input
          type="range"
          v-model="quality"
          min="0.1"
          max="1"
          step="0.1"
          @input="updateQuality"
        />
        <span>{{ Math.round(quality * 100) }}%</span>
      </div>

      <div class="control-group">
        <label>分辨率</label>
        <select v-model="resolution" @change="updateResolution">
          <option value="1920x1080">1920x1080</option>
          <option value="1280x720">1280x720</option>
          <option value="800x600">800x600</option>
          <option value="640x480">640x480</option>
        </select>
      </div>
    </div>

    <div class="capture-actions">
      <button
        v-if="!screenStore.isCapturing"
        class="btn btn-primary"
        :disabled="!hasScreenPermission"
        @click="startCapture"
      >
        开始截屏
      </button>
      <button
        v-else
        class="btn btn-danger"
        @click="stopCapture"
      >
        停止截屏
      </button>

      <button
        v-if="screenStore.isCapturing && !screenStore.isPaused"
        class="btn btn-secondary"
        @click="pauseCapture"
      >
        暂停
      </button>
      <button
        v-if="screenStore.isCapturing && screenStore.isPaused"
        class="btn btn-secondary"
        @click="resumeCapture"
      >
        继续
      </button>

      <button
        class="btn btn-outline"
        @click="takeManualScreenshot"
        :disabled="!screenStore.isCapturing"
      >
        手动截图
      </button>

      <button
        class="btn btn-outline"
        @click="clearHistory"
        :disabled="!screenStore.hasScreenshot"
      >
        清除历史
      </button>
    </div>

    <div class="capture-stats">
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">总截图数:</span>
          <span class="stat-value">{{ screenStore.totalCaptures }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">历史记录:</span>
          <span class="stat-value">{{ screenStore.screenshotCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">截屏速率:</span>
          <span class="stat-value">{{ screenStore.captureRate.toFixed(1) }}/s</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">失败次数:</span>
          <span class="stat-value">{{ screenStore.captureStats.failedCaptures }}</span>
        </div>
      </div>
    </div>

    <div class="permission-warning" v-if="!hasScreenPermission">
      <div class="warning-icon">⚠️</div>
      <p>屏幕捕获权限未授予，请允许浏览器访问屏幕捕获功能</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useScreenStore } from '@/stores'
import type { ScreenManager } from '@/modules/screen'

// 组件属性
const props = defineProps<{
  screenManager?: ScreenManager
  onCaptureStart?: () => void
  onCaptureStop?: () => void
  onScreenshotTaken?: (screenshot: string) => void
}>()

// Store
const screenStore = useScreenStore()

// 响应式数据
const captureInterval = ref(1000)
const quality = ref(0.8)
const resolution = ref('1920x1080')
const checkPermissionTimer = ref<number | null>(null)

// 计算属性
const captureStatusText = computed(() => {
  switch (screenStore.captureState) {
    case 'idle':
      return '空闲'
    case 'capturing':
      return '截屏中'
    case 'paused':
      return '已暂停'
    case 'stopped':
      return '已停止'
    default:
      return '未知'
  }
})

const hasScreenPermission = computed(() => {
  return screenStore.hasScreenPermission
})

// 方法
const updateCaptureInterval = () => {
  screenStore.setCaptureInterval(captureInterval.value)
}

const updateQuality = () => {
  screenStore.setQuality(quality.value)
}

const updateResolution = () => {
  const [width, height] = resolution.value.split('x').map(Number)
  screenStore.setResolution(width, height)
}

const startCapture = async () => {
  if (!props.screenManager) return

  try {
    await props.screenManager.startCapture()
    screenStore.startCapture()
    props.onCaptureStart?.()
  } catch (error) {
    console.error('Failed to start capture:', error)
  }
}

const stopCapture = () => {
  if (!props.screenManager) return

  props.screenManager.stopCapture()
  screenStore.stopCapture()
  props.onCaptureStop?.()
}

const pauseCapture = () => {
  if (!props.screenManager) return

  props.screenManager.pauseCapture()
  screenStore.pauseCapture()
}

const resumeCapture = () => {
  if (!props.screenManager) return

  props.screenManager.resumeCapture()
  screenStore.resumeCapture()
}

const takeManualScreenshot = async () => {
  if (!props.screenManager) return

  try {
    const screenshot = await props.screenManager.takeScreenshot()
    screenStore.setLastScreenshot(screenshot.image)
    props.onScreenshotTaken?.(screenshot.image)
  } catch (error) {
    console.error('Failed to take screenshot:', error)
    screenStore.incrementFailedCaptures()
  }
}

const clearHistory = () => {
  screenStore.clearScreenshotHistory()
}

const calculateImageSize = (base64: string): number => {
  // 移除data:image/jpeg;base64,前缀
  const base64Data = base64.replace(/^data:image\/[a-z]+;base64,/, '')
  // 计算原始字节大小
  return Math.round(base64Data.length * 0.75)
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const checkPermission = async () => {
  if (!props.screenManager) return

  try {
    const permission = await props.screenManager.checkScreenPermission()
    screenStore.setScreenPermission(permission.granted ? 'granted' : 'denied')
  } catch (error) {
    console.error('Failed to check permission:', error)
  }
}

// 监听器
const handleScreenshotTaken = (screenshot: any) => {
  screenStore.setLastScreenshot(screenshot.image)
  props.onScreenshotTaken?.(screenshot.image)
}

// 生命周期
onMounted(() => {
  // 初始化值
  captureInterval.value = screenStore.captureInterval
  quality.value = screenStore.quality
  resolution.value = `${screenStore.resolution.width}x${screenStore.resolution.height}`

  // 检查权限
  checkPermission()

  // 定期检查权限状态
  checkPermissionTimer.value = window.setInterval(checkPermission, 5000)

  // 监听截图事件
  if (props.screenManager) {
    props.screenManager.on('screenshotTaken', handleScreenshotTaken)
  }
})

onUnmounted(() => {
  if (checkPermissionTimer.value) {
    clearInterval(checkPermissionTimer.value)
  }

  if (props.screenManager) {
    props.screenManager.off('screenshotTaken', handleScreenshotTaken)
  }
})
</script>

<style scoped>
.screen-preview {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.preview-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.capture-status {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.capture-status.idle {
  background: #f5f5f5;
  color: #757575;
}

.capture-status.capturing {
  background: #e8f5e8;
  color: #2e7d32;
}

.capture-status.paused {
  background: #fff3e0;
  color: #f57c00;
}

.capture-status.stopped {
  background: #ffebee;
  color: #c62828;
}

.preview-content {
  margin-bottom: 20px;
  min-height: 300px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.screenshot-container {
  position: relative;
  width: 100%;
  max-width: 600px;
}

.screenshot-image {
  width: 100%;
  height: auto;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.screenshot-info {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  gap: 8px;
}

.no-screenshot {
  text-align: center;
  color: #666;
}

.no-screenshot-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.no-screenshot-hint {
  font-size: 14px;
  color: #999;
  margin-top: 8px;
}

.preview-controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-group label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  min-width: 80px;
}

.control-group input[type="range"] {
  flex: 1;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #2196f3;
  border-radius: 50%;
  cursor: pointer;
}

.control-group input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #2196f3;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.control-group select {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
}

.control-group span {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  min-width: 50px;
}

.capture-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #2196f3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1976d2;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #d32f2f;
}

.btn-secondary {
  background: #757575;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #616161;
}

.btn-outline {
  background: white;
  color: #2196f3;
  border: 1px solid #2196f3;
}

.btn-outline:hover:not(:disabled) {
  background: #2196f3;
  color: white;
}

.capture-stats {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.permission-warning {
  background: #fff3e0;
  border: 1px solid #ffb74d;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.warning-icon {
  font-size: 20px;
}

.permission-warning p {
  margin: 0;
  font-size: 14px;
  color: #e65100;
}
</style>