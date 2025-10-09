<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>控制面板</h3>
      <div class="system-status">
        <div class="status-indicator" :class="systemStatus">
          {{ systemStatusText }}
        </div>
      </div>
    </div>

    <div class="panel-content">
      <!-- 主控制按钮 -->
      <div class="main-controls">
        <button
          class="btn btn-large btn-primary"
          :disabled="!canStartSession"
          @click="startSession"
        >
          <span class="btn-icon">▶️</span>
          <span>开始会话</span>
        </button>

        <button
          class="btn btn-large btn-danger"
          :disabled="!isSessionActive"
          @click="stopSession"
        >
          <span class="btn-icon">⏹️</span>
          <span>结束会话</span>
        </button>

        <button
          class="btn btn-large btn-secondary"
          :disabled="!isSessionActive"
          @click="pauseSession"
        >
          <span class="btn-icon">⏸️</span>
          <span>暂停</span>
        </button>
      </div>

      <!-- 音频控制 -->
      <div class="control-section">
        <h4>音频控制</h4>
        <div class="control-buttons">
          <button
            class="btn"
            :class="audioStore.recordingState === 'recording' ? 'btn-danger' : 'btn-success'"
            :disabled="!isSessionActive"
            @click="toggleRecording"
          >
            <span class="btn-icon">🎤</span>
            <span>{{ audioStore.recordingState === 'recording' ? '停止录音' : '开始录音' }}</span>
          </button>

          <button
            class="btn btn-secondary"
            :disabled="!audioStore.isRecording"
            @click="pauseRecording"
          >
            <span class="btn-icon">⏸️</span>
            <span>暂停录音</span>
          </button>

          <button
            class="btn btn-secondary"
            :disabled="!audioStore.isRecording"
            @click="clearAudioBuffer"
          >
            <span class="btn-icon">🗑️</span>
            <span>清除缓冲</span>
          </button>
        </div>
      </div>

      <!-- 屏幕控制 -->
      <div class="control-section">
        <h4>屏幕控制</h4>
        <div class="control-buttons">
          <button
            class="btn"
            :class="screenStore.captureState === 'capturing' ? 'btn-danger' : 'btn-success'"
            :disabled="!isSessionActive"
            @click="toggleScreenCapture"
          >
            <span class="btn-icon">📷</span>
            <span>{{ screenStore.captureState === 'capturing' ? '停止截屏' : '开始截屏' }}</span>
          </button>

          <button
            class="btn btn-secondary"
            :disabled="!screenStore.isCapturing"
            @click="pauseScreenCapture"
          >
            <span class="btn-icon">⏸️</span>
            <span>暂停截屏</span>
          </button>

          <button
            class="btn btn-secondary"
            :disabled="!screenStore.isCapturing"
            @click="takeManualScreenshot"
          >
            <span class="btn-icon">📸</span>
            <span>手动截图</span>
          </button>
        </div>
      </div>

      <!-- 会话控制 -->
      <div class="control-section">
        <h4>会话控制</h4>
        <div class="control-buttons">
          <button
            class="btn btn-warning"
            :disabled="!isSessionActive"
            @click="sendTestMessage"
          >
            <span class="btn-icon">📝</span>
            <span>发送测试</span>
          </button>

          <button
            class="btn btn-secondary"
            :disabled="!conversationStore.hasMessages"
            @click="clearConversation"
          >
            <span class="btn-icon">🗑️</span>
            <span>清除对话</span>
          </button>

          <button
            class="btn btn-secondary"
            @click="exportData"
          >
            <span class="btn-icon">💾</span>
            <span>导出数据</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 会话统计 -->
    <div class="panel-footer">
      <div class="session-stats">
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">会话时长:</span>
            <span class="stat-value">{{ formattedSessionDuration }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">消息数量:</span>
            <span class="stat-value">{{ conversationStore.conversationStats.totalMessages }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">音频大小:</span>
            <span class="stat-value">{{ formatFileSize(audioStore.recordingFileSize) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">截图数量:</span>
            <span class="stat-value">{{ screenStore.totalCaptures }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useAudioStore } from '@/stores/audio'
import { useScreenStore } from '@/stores/screen'
import { useConversationStore } from '@/stores/conversation'
import type { OmniService } from '@/modules/omni'
import type { AudioManager } from '@/modules/audio'
import type { ScreenManager } from '@/modules/screen'

// 组件属性
const props = defineProps<{
  omniService?: OmniService
  audioManager?: AudioManager
  screenManager?: ScreenManager
}>()

// Store
const connectionStore = useConnectionStore()
const audioStore = useAudioStore()
const screenStore = useScreenStore()
const conversationStore = useConversationStore()

// 响应式数据
const isSessionActive = ref(false)
const isSessionPaused = ref(false)
const sessionStartTime = ref<Date | null>(null)
const sessionTimer = ref<number | null>(null)

// 计算属性
const systemStatus = computed(() => {
  if (isSessionActive.value && !isSessionPaused.value) return 'active'
  if (isSessionActive.value && isSessionPaused.value) return 'paused'
  return 'inactive'
})

const systemStatusText = computed(() => {
  switch (systemStatus.value) {
    case 'active':
      return '会话进行中'
    case 'paused':
      return '会话已暂停'
    case 'inactive':
      return '会话未开始'
    default:
      return '未知状态'
  }
})

const canStartSession = computed(() => {
  return connectionStore.isConnected && !isSessionActive.value
})

const formattedSessionDuration = computed(() => {
  if (!sessionStartTime.value) return '00:00'

  const now = new Date()
  const diffMs = now.getTime() - sessionStartTime.value.getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

// 方法
const startSession = async () => {
  if (!props.omniService || !props.audioManager || !props.screenManager) {
    return
  }

  try {
    // 初始化管理器
    await props.audioManager.initialize()
    await props.screenManager.initialize()

    // 开始录音和截屏
    await props.audioManager.startRecording()
    await props.screenManager.startCapture()

    // 更新状态
    isSessionActive.value = true
    isSessionPaused.value = false
    sessionStartTime.value = new Date()

    // 启动计时器
    startSessionTimer()

    // 添加系统消息
    conversationStore.addSystemMessage('会话已开始', 'text')
  } catch (error) {
    console.error('Failed to start session:', error)
    conversationStore.addSystemMessage(`会话启动失败: ${error}`, 'text')
  }
}

const stopSession = () => {
  if (!props.audioManager || !props.screenManager) {
    return
  }

  try {
    // 停止录音和截屏
    props.audioManager.stopRecording()
    props.screenManager.stopCapture()

    // 更新状态
    isSessionActive.value = false
    isSessionPaused.value = false
    sessionStartTime.value = null

    // 停止计时器
    stopSessionTimer()

    // 添加系统消息
    conversationStore.addSystemMessage('会话已结束', 'text')
  } catch (error) {
    console.error('Failed to stop session:', error)
  }
}

const pauseSession = () => {
  isSessionPaused.value = !isSessionPaused.value

  if (isSessionPaused.value) {
    props.audioManager?.pauseRecording()
    props.screenManager?.pauseCapture()
    conversationStore.addSystemMessage('会话已暂停', 'text')
  } else {
    props.audioManager?.resumeRecording()
    props.screenManager?.resumeCapture()
    conversationStore.addSystemMessage('会话已恢复', 'text')
  }
}

const toggleRecording = async () => {
  if (!props.audioManager) return

  try {
    if (audioStore.recordingState === 'recording') {
      props.audioManager.stopRecording()
      conversationStore.addSystemMessage('录音已停止', 'text')
    } else {
      await props.audioManager.startRecording()
      conversationStore.addSystemMessage('录音已开始', 'text')
    }
  } catch (error) {
    console.error('Failed to toggle recording:', error)
  }
}

const pauseRecording = () => {
  if (!props.audioManager) return

  if (audioStore.recordingState === 'recording') {
    props.audioManager.pauseRecording()
    conversationStore.addSystemMessage('录音已暂停', 'text')
  } else if (audioStore.recordingState === 'paused') {
    props.audioManager.resumeRecording()
    conversationStore.addSystemMessage('录音已恢复', 'text')
  }
}

const clearAudioBuffer = () => {
  if (!props.audioManager) return

  props.audioManager.clearAudioBuffer()
  conversationStore.addSystemMessage('音频缓冲已清除', 'text')
}

const toggleScreenCapture = async () => {
  if (!props.screenManager) return

  try {
    if (screenStore.captureState === 'capturing') {
      props.screenManager.stopCapture()
      conversationStore.addSystemMessage('截屏已停止', 'text')
    } else {
      await props.screenManager.startCapture()
      conversationStore.addSystemMessage('截屏已开始', 'text')
    }
  } catch (error) {
    console.error('Failed to toggle screen capture:', error)
  }
}

const pauseScreenCapture = () => {
  if (!props.screenManager) return

  if (screenStore.captureState === 'capturing') {
    props.screenManager.pauseCapture()
    conversationStore.addSystemMessage('截屏已暂停', 'text')
  } else if (screenStore.captureState === 'paused') {
    props.screenManager.resumeCapture()
    conversationStore.addSystemMessage('截屏已恢复', 'text')
  }
}

const takeManualScreenshot = async () => {
  if (!props.screenManager) return

  try {
    const screenshot = await props.screenManager.takeScreenshot()
    conversationStore.addSystemMessage('手动截图完成', 'text')
  } catch (error) {
    console.error('Failed to take manual screenshot:', error)
  }
}

const sendTestMessage = () => {
  if (!props.omniService) return

  try {
    props.omniService.createResponse('这是一条测试消息')
    conversationStore.addUserMessage('这是一条测试消息', 'text')
  } catch (error) {
    console.error('Failed to send test message:', error)
  }
}

const clearConversation = () => {
  if (confirm('确定要清除所有对话记录吗？')) {
    conversationStore.clearMessages()
    conversationStore.addSystemMessage('对话记录已清除', 'text')
  }
}

const exportData = () => {
  const data = {
    conversation: conversationStore.exportConversation(),
    sessionStats: {
      duration: formattedSessionDuration.value,
      audioSize: audioStore.recordingFileSize,
      screenshotCount: screenStore.totalCaptures,
      messageCount: conversationStore.conversationStats.totalMessages,
      exportedAt: new Date().toISOString()
    }
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `session_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
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

const startSessionTimer = () => {
  stopSessionTimer()
  sessionTimer.value = window.setInterval(() => {
    // 触发重新计算formattedSessionDuration
  }, 1000)
}

const stopSessionTimer = () => {
  if (sessionTimer.value) {
    clearInterval(sessionTimer.value)
    sessionTimer.value = null
  }
}

// 生命周期
onUnmounted(() => {
  stopSessionTimer()
})
</script>

<style scoped>
.control-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.system-status {
  display: flex;
  align-items: center;
}

.status-indicator {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-indicator.active {
  background: #e8f5e8;
  color: #2e7d32;
}

.status-indicator.paused {
  background: #fff3e0;
  color: #f57c00;
}

.status-indicator.inactive {
  background: #f5f5f5;
  color: #757575;
}

.panel-content {
  margin-bottom: 20px;
}

.main-controls {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.control-section {
  margin-bottom: 24px;
}

.control-section h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.control-buttons {
  display: flex;
  gap: 12px;
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-large {
  padding: 12px 24px;
  font-size: 16px;
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

.btn-success {
  background: #4caf50;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #388e3c;
}

.btn-secondary {
  background: #757575;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #616161;
}

.btn-warning {
  background: #ff9800;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #f57c00;
}

.btn-icon {
  font-size: 16px;
}

.panel-footer {
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.session-stats {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 16px;
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

@media (max-width: 768px) {
  .main-controls {
    flex-direction: column;
  }

  .btn-large {
    width: 100%;
    justify-content: center;
  }

  .control-buttons {
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>