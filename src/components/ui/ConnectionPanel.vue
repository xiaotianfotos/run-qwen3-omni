<template>
  <div class="connection-panel">
    <div class="panel-header">
      <h3>连接设置</h3>
      <div class="connection-status" :class="connectionStore.connectionStatus">
        {{ connectionStore.connectionStatusText }}
      </div>
    </div>

    <div class="panel-content">
      <div class="form-group">
        <label for="apiKey">API Key</label>
        <input
          id="apiKey"
          v-model="apiKeyInput"
          type="password"
          placeholder="请输入阿里云API Key"
          :disabled="isConnecting"
          @keyup.enter="handleConnect"
        />
      </div>

      <div class="form-group">
        <label for="websocketUrl">WebSocket URL</label>
        <input
          id="websocketUrl"
          v-model="websocketUrlInput"
          type="text"
          placeholder="WebSocket服务器地址"
          :disabled="isConnecting"
        />
      </div>

      <div class="error-message" v-if="connectionStore.connectionError">
        {{ connectionStore.connectionError }}
      </div>

      <div class="actions">
        <button
          v-if="!connectionStore.isConnected"
          class="btn btn-primary"
          :disabled="!hasValidApiKey || isConnecting"
          @click="handleConnect"
        >
          <span v-if="isConnecting">连接中...</span>
          <span v-else>连接</span>
        </button>

        <button
          v-else
          class="btn btn-danger"
          @click="handleDisconnect"
        >
          断开连接
        </button>

        <button
          class="btn btn-secondary"
          @click="handleClear"
        >
          清除
        </button>
      </div>
    </div>

    <div class="panel-footer" v-if="connectionStore.isConnected">
      <div class="connection-info">
        <div class="info-item">
          <span class="label">连接时间:</span>
          <span class="value">{{ formattedConnectionTime }}</span>
        </div>
        <div class="info-item">
          <span class="label">重连次数:</span>
          <span class="value">{{ connectionStore.reconnectAttempts }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores'
import { MultiModalService } from '@/services/MultiModalService'
import type { MultiModalServiceConfig } from '@/services/MultiModalService'

// 组件属性
const props = defineProps<{
  onConnect?: (service: MultiModalService) => void
  onDisconnect?: () => void
}>()

// Store
const connectionStore = useConnectionStore()

// 响应式数据
const apiKeyInput = ref('')
const websocketUrlInput = ref('')
const isConnecting = ref(false)
const connectionTimer = ref<number | null>(null)

// 计算属性
const hasValidApiKey = computed(() => {
  return apiKeyInput.value.trim().length > 0
})

const formattedConnectionTime = computed(() => {
  if (!connectionStore.lastConnectedAt) {
    return '未连接'
  }

  const now = new Date()
  const connectedAt = connectionStore.lastConnectedAt
  const diffMs = now.getTime() - connectedAt.getTime()

  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }
})

// 方法
const handleConnect = async () => {
  if (!hasValidApiKey.value || isConnecting.value) {
    return
  }

  isConnecting.value = true
  connectionStore.setConnecting(true)
  connectionStore.setConnectionError(null)

  try {
    // 更新配置
    connectionStore.setApiKey(apiKeyInput.value)
    connectionStore.setWebsocketUrl(websocketUrlInput.value)

    // 创建MultiModalService实例
    const config: MultiModalServiceConfig = {
      agentConfig: {
        systemPrompt: '你是一个多模态AI助手，能够处理语音和图像输入。请理解和回应用户的需求，并根据屏幕内容提供帮助。',
        llmConfig: {
          apiKey: apiKeyInput.value,
          baseURL: websocketUrlInput.value,
          model: 'qwen3-omni-flash',
          voice: 'Cherry',
          format: 'wav',
          providerId: 'custom' // ConnectionPanel 默认使用自定义供应商
        }
      }
    }

    const multiModalService = new MultiModalService(config)

    // 初始化服务
    await multiModalService.initialize()

    // 更新状态
    connectionStore.setConnected(true)
    connectionStore.setConnecting(false)
    isConnecting.value = false

    // 触发回调
    props.onConnect?.(multiModalService)

    // 开始连接时间更新
    startConnectionTimer()
  } catch (error) {
    console.error('Connection failed:', error)
    connectionStore.setConnectionError(error instanceof Error ? error.message : '连接失败')
    connectionStore.setConnecting(false)
    isConnecting.value = false
  }
}

const handleDisconnect = () => {
  connectionStore.setConnected(false)
  connectionStore.setApiKey('')
  connectionStore.setSessionConfig(undefined)
  connectionStore.resetReconnectAttempts()

  // 停止连接时间更新
  stopConnectionTimer()

  // 触发回调
  props.onDisconnect?.()
}

const handleClear = () => {
  apiKeyInput.value = ''
  websocketUrlInput.value = ''
  connectionStore.setConnectionError(null)
}

const startConnectionTimer = () => {
  stopConnectionTimer()
  connectionTimer.value = window.setInterval(() => {
    // 触发重新计算formattedConnectionTime
  }, 1000)
}

const stopConnectionTimer = () => {
  if (connectionTimer.value) {
    clearInterval(connectionTimer.value)
    connectionTimer.value = null
  }
}

// 生命周期
onMounted(() => {
  // 初始化默认值
  websocketUrlInput.value = connectionStore.websocketUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  apiKeyInput.value = connectionStore.apiKey
})

onUnmounted(() => {
  stopConnectionTimer()
})
</script>

<style scoped>
.connection-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
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

.connection-status {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.connection-status.connected {
  background: #e8f5e8;
  color: #2e7d32;
}

.connection-status.connecting {
  background: #fff3e0;
  color: #f57c00;
}

.connection-status.disconnected {
  background: #ffebee;
  color: #c62828;
}

.panel-content {
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
  color: #333;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #2196f3;
}

.form-group input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.error-message {
  color: #c62828;
  font-size: 14px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: #ffebee;
  border-radius: 4px;
}

.actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
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

.panel-footer {
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.connection-info {
  display: flex;
  gap: 24px;
  font-size: 14px;
}

.info-item {
  display: flex;
  gap: 8px;
}

.info-item .label {
  color: #666;
  font-weight: 500;
}

.info-item .value {
  color: #333;
  font-weight: 600;
}
</style>