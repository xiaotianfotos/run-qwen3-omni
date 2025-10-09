<template>
  <div class="conversation-display">
    <div class="conversation-header">
      <h3>对话记录</h3>
      <div class="header-actions">
        <button class="btn btn-sm btn-outline" @click="exportConversation">
          导出
        </button>
        <button class="btn btn-sm btn-danger" @click="clearConversation">
          清除
        </button>
      </div>
    </div>

    <div class="conversation-content" ref="messagesContainer">
      <div v-if="!conversationStore.hasMessages" class="empty-conversation">
        <div class="empty-icon">💬</div>
        <p>暂无对话记录</p>
        <p class="empty-hint">开始对话后，消息将显示在这里</p>
      </div>

      <div v-else class="messages-list">
        <div
          v-for="message in conversationStore.sortedMessages"
          :key="message.id"
          class="message-item"
          :class="message.role"
        >
          <div class="message-header">
            <div class="message-role">{{ getRoleLabel(message.role) }}</div>
            <div class="message-time">{{ formatTime(message.timestamp) }}</div>
          </div>

          <div class="message-content">
            <div v-if="message.type === 'text'" class="text-content">
              {{ message.content }}
            </div>

            <div v-if="message.type === 'audio'" class="audio-content">
              <div class="audio-info">
                <div class="audio-icon">🎵</div>
                <div class="audio-details">
                  <div class="audio-label">音频消息</div>
                  <div v-if="message.transcription" class="audio-transcription">
                    {{ message.transcription }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="message.type === 'image'" class="image-content">
              <img
                v-if="message.content.imageData"
                :src="message.content.imageData"
                alt="用户截图"
                class="message-image"
              />
              <div v-else class="image-placeholder">
                <div class="image-icon">🖼️</div>
                <p>图像消息</p>
              </div>
            </div>
          </div>

          <div v-if="message.transcription" class="message-transcription">
            <div class="transcription-label">转录:</div>
            <div class="transcription-text">{{ message.transcription }}</div>
          </div>
        </div>
      </div>

      <div v-if="conversationStore.isProcessing" class="processing-indicator">
        <div class="processing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="processing-text">正在处理中...</div>
      </div>
    </div>

    <div class="conversation-footer">
      <div class="conversation-stats">
        <div class="stat-item">
          <span class="stat-label">消息总数:</span>
          <span class="stat-value">{{ conversationStore.conversationStats.totalMessages }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">用户消息:</span>
          <span class="stat-value">{{ conversationStore.userMessages.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">助手消息:</span>
          <span class="stat-value">{{ conversationStore.assistantMessages.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">总Token数:</span>
          <span class="stat-value">{{ conversationStore.conversationStats.totalTokens }}</span>
        </div>
      </div>

      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索消息..."
          @input="searchMessages"
        />
      </div>
    </div>

    <div v-if="conversationStore.conversationError" class="error-message">
      {{ conversationStore.conversationError }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useConversationStore } from '@/stores'

// Store
const conversationStore = useConversationStore()

// 响应式数据
const messagesContainer = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const autoScrollTimer = ref<number | null>(null)

// 计算属性
const shouldAutoScroll = computed(() => {
  return !searchQuery.value && conversationStore.isProcessing
})

// 方法
const getRoleLabel = (role: string): string => {
  switch (role) {
    case 'user':
      return '用户'
    case 'assistant':
      return '助手'
    case 'system':
      return '系统'
    default:
      return role
  }
}

const formatTime = (timestamp: Date): string => {
  return timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const exportConversation = () => {
  const data = conversationStore.exportConversation()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `conversation_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const clearConversation = () => {
  if (confirm('确定要清除所有对话记录吗？')) {
    conversationStore.clearMessages()
  }
}

const searchMessages = () => {
  // 搜索功能已通过conversationStore.searchMessages提供
  // 这里可以添加前端搜索逻辑
}

const scrollToBottom = () => {
  if (messagesContainer.value && shouldAutoScroll.value) {
    nextTick(() => {
      messagesContainer.value!.scrollTop = messagesContainer.value!.scrollHeight
    })
  }
}

// 监听消息变化
const watchMessages = () => {
  scrollToBottom()
}

// 生命周期
onMounted(() => {
  // 开始自动滚动
  autoScrollTimer.value = window.setInterval(() => {
    scrollToBottom()
  }, 1000)
})

onUnmounted(() => {
  if (autoScrollTimer.value) {
    clearInterval(autoScrollTimer.value)
  }
})
</script>

<style scoped>
.conversation-display {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 600px;
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.conversation-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 11px;
}

.btn-outline {
  background: white;
  color: #2196f3;
  border: 1px solid #2196f3;
}

.btn-outline:hover {
  background: #2196f3;
  color: white;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

.conversation-content {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 20px;
  padding: 10px;
  background: #fafafa;
  border-radius: 4px;
}

.empty-conversation {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-hint {
  font-size: 14px;
  color: #999;
  margin-top: 8px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 6px;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.message-item.user {
  border-left: 4px solid #2196f3;
}

.message-item.assistant {
  border-left: 4px solid #4caf50;
}

.message-item.system {
  border-left: 4px solid #ff9800;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.message-role {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  text-transform: uppercase;
}

.message-time {
  font-size: 12px;
  color: #666;
}

.message-content {
  font-size: 14px;
  line-height: 1.5;
  color: #333;
}

.text-content {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.audio-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.audio-icon {
  font-size: 20px;
}

.audio-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.audio-label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.audio-transcription {
  font-size: 14px;
  color: #333;
  font-style: italic;
}

.image-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-image {
  max-width: 100%;
  max-height: 200px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.image-placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
}

.image-icon {
  font-size: 20px;
}

.message-transcription {
  margin-top: 8px;
  padding: 8px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 12px;
}

.transcription-label {
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}

.transcription-text {
  color: #333;
  font-style: italic;
}

.processing-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #e3f2fd;
  border-radius: 6px;
  margin-top: 16px;
}

.processing-dots {
  display: flex;
  gap: 4px;
}

.processing-dots span {
  width: 8px;
  height: 8px;
  background: #2196f3;
  border-radius: 50%;
  animation: pulse 1.4s infinite ease-in-out;
}

.processing-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.processing-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes pulse {
  0%, 80%, 100% {
    transform: scale(0);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.processing-text {
  font-size: 14px;
  color: #1976d2;
  font-weight: 500;
}

.conversation-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.conversation-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 12px;
  color: #333;
  font-weight: 600;
}

.search-box {
  min-width: 200px;
}

.search-box input {
  width: 100%;
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
}

.search-box input:focus {
  outline: none;
  border-color: #2196f3;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  margin-top: 16px;
}
</style>