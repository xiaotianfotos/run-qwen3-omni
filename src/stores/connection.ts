import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SessionConfig } from '@/types/websocket'

export const useConnectionStore = defineStore('connection', () => {
  // 状态
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const apiKey = ref('')
  const websocketUrl = ref('ws://localhost:3000')
  const sessionConfig = ref<SessionConfig | undefined>(undefined)
  const connectionError = ref<string | null>(null)
  const reconnectAttempts = ref(0)
  const lastConnectedAt = ref<Date | null>(null)
  const lastDisconnectedAt = ref<Date | null>(null)

  // 计算属性
  const connectionStatus = computed(() => {
    if (isConnected.value) return 'connected'
    if (isConnecting.value) return 'connecting'
    return 'disconnected'
  })

  const connectionStatusText = computed(() => {
    switch (connectionStatus.value) {
      case 'connected':
        return '已连接'
      case 'connecting':
        return '连接中...'
      case 'disconnected':
        return '未连接'
      default:
        return '未知状态'
    }
  })

  const hasValidApiKey = computed(() => {
    return apiKey.value.trim().length > 0
  })

  const connectionInfo = computed(() => ({
    status: connectionStatus.value,
    statusText: connectionStatusText.value,
    hasValidApiKey: hasValidApiKey.value,
    reconnectAttempts: reconnectAttempts.value,
    lastConnectedAt: lastConnectedAt.value,
    lastDisconnectedAt: lastDisconnectedAt.value,
    error: connectionError.value
  }))

  // 动作
  const setConnected = (connected: boolean) => {
    isConnected.value = connected
    if (connected) {
      lastConnectedAt.value = new Date()
      connectionError.value = null
    } else {
      lastDisconnectedAt.value = new Date()
    }
  }

  const setConnecting = (connecting: boolean) => {
    isConnecting.value = connecting
  }

  const setApiKey = (key: string) => {
    apiKey.value = key.trim()
  }

  const setWebsocketUrl = (url: string) => {
    websocketUrl.value = url
  }

  const setSessionConfig = (config: SessionConfig | undefined) => {
    sessionConfig.value = config
  }

  const setConnectionError = (error: string | null) => {
    connectionError.value = error
  }

  const incrementReconnectAttempts = () => {
    reconnectAttempts.value++
  }

  const resetReconnectAttempts = () => {
    reconnectAttempts.value = 0
  }

  const reset = () => {
    isConnected.value = false
    isConnecting.value = false
    sessionConfig.value = undefined
    connectionError.value = null
    reconnectAttempts.value = 0
    lastConnectedAt.value = null
    lastDisconnectedAt.value = null
  }

  return {
    // 状态
    isConnected,
    isConnecting,
    apiKey,
    websocketUrl,
    sessionConfig,
    connectionError,
    reconnectAttempts,
    lastConnectedAt,
    lastDisconnectedAt,

    // 计算属性
    connectionStatus,
    connectionStatusText,
    hasValidApiKey,
    connectionInfo,

    // 动作
    setConnected,
    setConnecting,
    setApiKey,
    setWebsocketUrl,
    setSessionConfig,
    setConnectionError,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    reset
  }
})