<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useScreenStore } from '@/stores'
import { ScreenManager } from '@/modules/screen'
import { ScreenshotManager } from '@/modules/llm'

const props = defineProps<{
  apiKey: string
}>()

const emit = defineEmits<{
  error: [title: string, message: string]
}>()

// Store
const screenStore = useScreenStore()

// 服务实例
const screenManager = ref<ScreenManager | undefined>(undefined)
const screenshotManager = ref<ScreenshotManager | undefined>(undefined)

// 状态
const hasPermission = ref(false)

// 计算属性
const isCapturing = computed(() => screenStore.isCapturing)

// 错误处理方法
const showError = (title: string, message: string) => {
  emit('error', title, message)
}

// 初始化屏幕管理器
const initializeScreenManager = async () => {
  if (screenManager.value) return

  screenManager.value = new ScreenManager({
    width: 1920,
    height: 1080,
    frameRate: 1, // 每秒截屏一次
    quality: 0.8,
    format: 'jpeg',
    compression: 0.8,
    captureInterval: 1000
  })

  await screenManager.value.initialize()

  // 设置屏幕管理器事件监听
  screenManager.value.on('permissionDenied', (error: any) => {
    console.error('Screen permission denied:', error)
    screenStore.setScreenPermission('denied')
    showError('屏幕权限被拒绝', '请在浏览器设置中允许屏幕捕获权限')
  })

  screenManager.value.on('captureStarted', () => {
    screenStore.startCapture()
  })

  screenManager.value.on('captureStopped', () => {
    screenStore.stopCapture()
  })

  screenManager.value.on('capturePaused', () => {
    screenStore.pauseCapture()
  })

  screenManager.value.on('captureResumed', () => {
    screenStore.resumeCapture()
  })

  screenManager.value.on('screenshotTaken', (screenshot: any) => {
    screenStore.setLastScreenshot(screenshot.image)
    // 将截图添加到截图管理器
    if (screenshotManager.value) {
      screenshotManager.value.addScreenshot(screenshot.image, screenshot.width, screenshot.height)
    }
    console.log('🖼️ Screenshot captured')
  })
}

// 初始化截图管理器
const initializeScreenshotManager = () => {
  if (screenshotManager.value) return

  screenshotManager.value = new ScreenshotManager(10, 1920, 1080)
}

// 开始屏幕捕获
const startCapture = async () => {
  if (!screenManager.value) {
    await initializeScreenManager()
  }

  if (!screenshotManager.value) {
    initializeScreenshotManager()
  }

  try {
    console.log('🖼️ Requesting screen capture permissions...')
    await screenManager.value!.startCapture()
  } catch (error) {
    console.error('Failed to start capture:', error)
    showError('启动屏幕捕获失败', error instanceof Error ? error.message : '未知错误')
  }
}

// 停止屏幕捕获
const stopCapture = () => {
  if (screenManager.value) {
    screenManager.value.stopCapture()
  }
}

// 暴露方法给父组件
defineExpose({
  startCapture,
  stopCapture,
  isCapturing,
  hasPermission
})

// 生命周期
onUnmounted(() => {
  if (screenManager.value) {
    screenManager.value.stopCapture()
    screenManager.value.dispose()
  }
})
</script>

<template>
  <div class="screen-controller">
    <div v-if="isCapturing" class="capture-indicator">
      <div class="recording-dot"></div>
      <span>正在截取屏幕</span>
    </div>
  </div>
</template>

<style scoped>
.screen-controller {
  position: relative;
}

.capture-indicator {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(220, 53, 69, 0.9);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  z-index: 200;
}

.recording-dot {
  width: 10px;
  height: 10px;
  background: white;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}
</style>