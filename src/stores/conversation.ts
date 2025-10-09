import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: any
  timestamp: Date
  type: 'text' | 'audio' | 'image'
  transcription?: string
  audioData?: string
  imageData?: string
}

export const useConversationStore = defineStore('conversation', () => {
  // 消息列表
  const messages = ref<ConversationMessage[]>([])

  // 处理状态
  const isProcessing = ref(false)
  const currentResponse = ref<string | null>(null)
  const currentTranscription = ref<string | null>(null)

  // 音频数据
  const currentAudioData = ref<string[]>([])
  const currentImageData = ref<string[]>([])

  // 错误状态
  const conversationError = ref<string | null>(null)

  // 统计信息
  const stats = ref({
    totalMessages: 0,
    totalTokens: 0,
    averageResponseTime: 0,
    lastResponseTime: 0,
    failedRequests: 0
  })

  // 计算属性
  const sortedMessages = computed(() => {
    return [...messages.value].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  })

  const userMessages = computed(() => {
    return sortedMessages.value.filter(msg => msg.role === 'user')
  })

  const assistantMessages = computed(() => {
    return sortedMessages.value.filter(msg => msg.role === 'assistant')
  })

  const lastMessage = computed(() => {
    return sortedMessages.value[sortedMessages.value.length - 1] || null
  })

  const lastUserMessage = computed(() => {
    return userMessages.value[userMessages.value.length - 1] || null
  })

  const lastAssistantMessage = computed(() => {
    return assistantMessages.value[assistantMessages.value.length - 1] || null
  })

  const hasMessages = computed(() => messages.value.length > 0)

  const isGeneratingResponse = computed(() => isProcessing.value && currentResponse.value !== null)

  const conversationStats = computed(() => ({
    totalMessages: stats.value.totalMessages,
    totalTokens: stats.value.totalTokens,
    averageResponseTime: stats.value.averageResponseTime,
    lastResponseTime: stats.value.lastResponseTime,
    failedRequests: stats.value.failedRequests,
    messageCount: messages.value.length
  }))

  // 动作
  const addMessage = (message: Omit<ConversationMessage, 'id' | 'timestamp'>) => {
    const newMessage: ConversationMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    }

    // 使用数组重新赋值的方式强制触发Vue响应式更新
    messages.value = [...messages.value, newMessage]
    stats.value.totalMessages++

    console.log('💬 添加新消息:', {
      role: newMessage.role,
      type: newMessage.type,
      contentPreview: typeof newMessage.content === 'string' 
        ? newMessage.content.slice(0, 50) + (newMessage.content.length > 50 ? '...' : '')
        : '非文本内容',
      totalMessages: messages.value.length
    })

    return newMessage
  }

  const addUserMessage = (content: any, type: 'text' | 'audio' | 'image' = 'text', transcription?: string) => {
    return addMessage({
      role: 'user',
      content,
      type,
      transcription
    })
  }

  const addAssistantMessage = (content: any, type: 'text' | 'audio' | 'image' = 'text', transcription?: string) => {
    return addMessage({
      role: 'assistant',
      content,
      type,
      transcription
    })
  }

  const addSystemMessage = (content: any, type: 'text' | 'audio' | 'image' = 'text') => {
    return addMessage({
      role: 'system',
      content,
      type
    })
  }

  const addToolMessage = (
    content: any,
    type: 'text' | 'audio' | 'image' = 'text',
    toolCallId?: string
  ) => {
    // 工具消息应该显示为用户角色，但内容格式化为工具响应
    const formattedContent = typeof content === 'string' && content.startsWith('{') ? 
      (() => {
        try {
          const parsed = JSON.parse(content);
          return `🔧 工具执行结果: ${JSON.stringify(parsed, null, 2)}`;
        } catch {
          return `🔧 工具执行结果: ${content}`;
        }
      })() :
      `🔧 工具执行结果: ${content}`;

    return addMessage({
      role: 'user',
      content: formattedContent,
      type
    })
  }

  const updateMessage = (messageId: string, updates: Partial<ConversationMessage>) => {
    const messageIndex = messages.value.findIndex(msg => msg.id === messageId)
    if (messageIndex !== -1) {
      messages.value[messageIndex] = {
        ...messages.value[messageIndex],
        ...updates
      }
    }
  }

  const removeMessage = (messageId: string) => {
    const messageIndex = messages.value.findIndex(msg => msg.id === messageId)
    if (messageIndex !== -1) {
      messages.value.splice(messageIndex, 1)
    }
  }

  const clearMessages = () => {
    messages.value = []
    currentResponse.value = null
    currentTranscription.value = null
    currentAudioData.value = []
    currentImageData.value = []
    conversationError.value = null
    stats.value.totalMessages = 0
    stats.value.totalTokens = 0
  }

  const startProcessing = () => {
    isProcessing.value = true
    currentResponse.value = null
    currentTranscription.value = null
    currentAudioData.value = []
    currentImageData.value = []
    conversationError.value = null
  }

  const stopProcessing = () => {
    isProcessing.value = false
  }

  const updateCurrentResponse = (response: string) => {
    currentResponse.value = response
  }

  const updateCurrentTranscription = (transcription: string) => {
    currentTranscription.value = transcription
  }

  const addCurrentAudioData = (audioData: string) => {
    currentAudioData.value.push(audioData)
  }

  const addCurrentImageData = (imageData: string) => {
    currentImageData.value.push(imageData)
  }

  const completeResponse = (responseTime?: number) => {
    console.log('🎆 完成响应处理', {
      hasText: !!currentResponse.value,
      textLength: currentResponse.value?.length ?? 0,
      hasAudio: currentAudioData.value.length > 0,
      audioChunks: currentAudioData.value.length,
      hasImage: currentImageData.value.length > 0,
      imageChunks: currentImageData.value.length,
      hasTranscription: !!(currentTranscription.value?.trim())
    })
    
    // 整合所有响应内容到一条消息中
    const hasText = currentResponse.value && currentResponse.value.trim().length > 0
    const hasAudio = currentAudioData.value.length > 0
    const hasImage = currentImageData.value.length > 0
    const hasTranscription = currentTranscription.value && currentTranscription.value.trim().length > 0

    if (hasText || hasAudio || hasImage) {
      // 创建一条综合消息，包含所有类型的内容
      const content: any = {}
      
      if (hasText) {
        content.text = currentResponse.value
      }
      
      if (hasAudio) {
        content.audio = {
          audioChunks: currentAudioData.value,
          totalDuration: currentAudioData.value.length * 0.1 // 假设每个chunk 100ms
        }
      }
      
      if (hasImage) {
        content.images = {
          imageChunks: currentImageData.value
        }
      }

      // 确定主要类型（优先级：文本 > 音频 > 图像）
      const primaryType = hasText ? 'text' : hasAudio ? 'audio' : 'image'
      
      // 对于混合内容，优先显示文本，其他作为附加内容
      const displayContent = hasText ? currentResponse.value : 
                           hasAudio ? '🔊 语音回复' + (hasText ? ': ' + currentResponse.value : '') :
                           hasImage ? '🇺️ 图像回复' : 
                           '🤖 AI回复'
      
      console.log('💬 添加助手消息', {
        primaryType,
        hasTranscription,
        displayContentPreview: displayContent?.slice(0, 50)
      })
      
      // addAssistantMessage(displayContent, primaryType, hasTranscription ? currentTranscription.value! : undefined)
      console.warn('⚠️ 消息添加已被禁用，现在由 App.vue 的 handleResponseCompleted 负责')
    } else {
      console.warn('⚠️ 没有内容需要添加到消息列表')
    }

    // 更新统计信息
    if (responseTime) {
      stats.value.lastResponseTime = responseTime
      if (stats.value.totalMessages > 1) {
        stats.value.averageResponseTime = (stats.value.averageResponseTime + responseTime) / 2
      } else {
        stats.value.averageResponseTime = responseTime
      }
    }

    // 重置当前响应
    currentResponse.value = null
    currentTranscription.value = null
    currentAudioData.value = []
    currentImageData.value = []
    isProcessing.value = false
    
    console.log('🎆 响应处理完成，状态已重置')
  }

  const setConversationError = (error: string | null) => {
    conversationError.value = error
    if (error) {
      stats.value.failedRequests++
    }
  }

  const incrementTokenCount = (tokens: number) => {
    stats.value.totalTokens += tokens
  }

  const getMessagesByType = (type: 'text' | 'audio' | 'image') => {
    return sortedMessages.value.filter(msg => msg.type === type)
  }

  const getMessagesByRole = (role: 'user' | 'assistant' | 'system') => {
    return sortedMessages.value.filter(msg => msg.role === role)
  }

  const searchMessages = (query: string) => {
    const lowerQuery = query.toLowerCase()
    return sortedMessages.value.filter(msg => {
      if (typeof msg.content === 'string') {
        return msg.content.toLowerCase().includes(lowerQuery)
      }
      if (msg.transcription) {
        return msg.transcription.toLowerCase().includes(lowerQuery)
      }
      return false
    })
  }

  const exportConversation = () => {
    return {
      messages: sortedMessages.value.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        type: msg.type,
        transcription: msg.transcription
      })),
      stats: conversationStats.value,
      exportedAt: new Date().toISOString()
    }
  }

  const reset = () => {
    clearMessages()
    stats.value = {
      totalMessages: 0,
      totalTokens: 0,
      averageResponseTime: 0,
      lastResponseTime: 0,
      failedRequests: 0
    }
  }

  return {
    // 状态
    messages,
    isProcessing,
    currentResponse,
    currentTranscription,
    currentAudioData,
    currentImageData,
    conversationError,
    stats,

    // 计算属性
    sortedMessages,
    userMessages,
    assistantMessages,
    lastMessage,
    lastUserMessage,
    lastAssistantMessage,
    hasMessages,
    isGeneratingResponse,
    conversationStats,

    // 动作
    addMessage,
    addUserMessage,
    addAssistantMessage,
    addSystemMessage,
    addToolMessage,
    updateMessage,
    removeMessage,
    clearMessages,
    startProcessing,
    stopProcessing,
    updateCurrentResponse,
    updateCurrentTranscription,
    addCurrentAudioData,
    addCurrentImageData,
    completeResponse,
    setConversationError,
    incrementTokenCount,
    getMessagesByType,
    getMessagesByRole,
    searchMessages,
    exportConversation,
    reset
  }
})
