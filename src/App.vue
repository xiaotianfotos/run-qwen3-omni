<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useConnectionStore } from '@/stores'
import { useAudioStore } from '@/stores'
import { useScreenStore } from '@/stores'
import { useConversationStore } from '@/stores'
import { MultiModalService } from '@/services/MultiModalService'
import { RunOmniService, RunOmniState } from '@/services/RunOmniService'
import type { AgentResponse } from '@/modules/agent'
import OnboardingGuide from '@/components/ui/OnboardingGuide.vue'
import Settings from '@/components/ui/Settings.vue'
import AudioController from '@/components/AudioController.vue'
import ScreenController from '@/components/ScreenController.vue'
import AIController from '@/components/AIController.vue'
import CanvasOverlay from '@/components/ui/CanvasOverlay.vue'
import { useCanvasStore } from '@/stores/canvas'
import { CANVAS_SYSTEM_PROMPT_SEGMENT } from '@/modules/tools/canvasTools'

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const STORAGE_KEYS = {
  apiKey: 'apiKey',
  baseUrl: 'llmBaseUrl',
  model: 'llmModel',
  onboarding: 'hasSeenOnboarding',
  systemPrompt: 'llmSystemPrompt',
  providerId: 'providerId',
  providers: 'providers',
  maxHistoryRounds: 'maxHistoryRounds'
} as const

// 预设供应商配置
const PRESET_PROVIDERS = {
  aliyun: {
    id: 'aliyun',
    name: '阿里云',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3-omni-flash',
    isCustom: false
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3-Omni-30B-A3B-Instruct',
    isCustom: false
  },
  custom: {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    model: '',
    isCustom: true
  }
} as const

const DEFAULT_LLM_SETTINGS = {
  model: 'qwen3-omni-flash',
  voice: 'Cherry',
  format: 'wav'
}
const DEFAULT_SYSTEM_PROMPT = '你是一个多模态AI助手，能够处理语音和图像输入。请理解和回应用户的需求，并根据屏幕内容提供帮助。'

const safeLocalStorage = (() => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch (error) {
    console.warn('本地存储不可用:', error)
    return null
  }
})()

const getStorageItem = (key: string) => {
  try {
    return safeLocalStorage?.getItem(key) ?? null
  } catch (error) {
    console.warn(`读取本地存储失败: ${key}`, error)
    return null
  }
}

const setStorageItem = (key: string, value: string) => {
  try {
    safeLocalStorage?.setItem(key, value)
  } catch (error) {
    console.warn(`写入本地存储失败: ${key}`, error)
  }
}

const removeStorageItem = (key: string) => {
  try {
    safeLocalStorage?.removeItem(key)
  } catch (error) {
    console.warn(`移除本地存储失败: ${key}`, error)
  }
}

// Store
const connectionStore = useConnectionStore()
const audioStore = useAudioStore()
const screenStore = useScreenStore()
const conversationStore = useConversationStore()
const canvasStore = useCanvasStore()
const { isOverlayVisible } = storeToRefs(canvasStore)
const isCanvasOverlayVisible = isOverlayVisible

// 服务实例 - 使用新的RunOmniService（推荐）
const runOmniService = ref<RunOmniService | undefined>(undefined)
// 向后兼容：旧版MultiModalService
const multiModalService = ref<MultiModalService | undefined>(undefined)

// UI 状态
const showSettings = ref(false)
const apiKeyInput = ref('')
const baseUrl = ref(DEFAULT_BASE_URL)
const modelName = ref(DEFAULT_LLM_SETTINGS.model)
const systemPrompt = ref<string>(DEFAULT_SYSTEM_PROMPT)
const maxHistoryRounds = ref(5) // 会话保存回合数
const isSavingSettings = ref(false)
const toolsEnabled = ref(false)

// 供应商管理状态
const currentProviderId = ref('aliyun')
const providers = ref<Record<string, any>>({ ...PRESET_PROVIDERS })

// 计算属性
const currentProvider = computed(() => providers.value[currentProviderId.value])
const effectiveBaseUrl = computed(() => {
  const providerUrl = currentProvider.value?.baseUrl?.trim()
  const manualUrl = baseUrl.value.trim()
  return providerUrl || manualUrl || DEFAULT_BASE_URL
})
const effectiveModel = computed(() => {
  const providerModel = currentProvider.value?.model?.trim()
  const manualModel = modelName.value.trim()
  return providerModel || manualModel || DEFAULT_LLM_SETTINGS.model
})
const effectiveSystemPrompt = computed(() => systemPrompt.value.trim() || DEFAULT_SYSTEM_PROMPT)
const composeSystemPrompt = (base: string): string => {
  const normalized = base.trim() || DEFAULT_SYSTEM_PROMPT
  return toolsEnabled.value ? `${normalized}\n\n${CANVAS_SYSTEM_PROMPT_SEGMENT}` : normalized
}
const composedSystemPrompt = computed(() => composeSystemPrompt(effectiveSystemPrompt.value))
const toolsToggleTitle = computed(() =>
  toolsEnabled.value ? '工具调用已启用，点击关闭' : '工具调用已禁用，点击开启'
)
const preferredVoice = ref(getStorageItem('preferredVoice') || DEFAULT_LLM_SETTINGS.voice)
const callDuration = ref(0)
const callTimer = ref<any>(null)

// 错误处理状态
const errorMessage = ref<string | null>(null)
const showErrorModal = ref(false)
const retryCount = ref(0)
const maxRetries = 3

// 用户引导状态
const showOnboarding = ref(false)
const hasSeenOnboarding = ref(false)

// 截图配置
const screenshotConfig = ref({
  captureInterval: 2000,
  maxScreenshots: 1,
  showPreview: true,
  imageQuality: 0.8
})

// 从子组件获取的状态
// 图片预览状态
const lastSentImages = ref<string[]>([])
const showImagePreview = ref(false)
const isInCall = ref(false)
const currentVolume = ref(0)
const isVoiceActive = ref(false)
const isProcessing = ref(false)
const isScreenRecording = ref(false)

// 文本输入和文件上传状态
const textInput = ref('')
const uploadedFiles = ref<Array<{
  file: File
  name: string
  type: string
  previewUrl: string
}>>([])
const fileInput = ref<HTMLInputElement | null>(null)
const isProcessingFiles = ref(false) // 文件处理状态指示器

// 全尺寸图片预览
const showFullSizeImage = ref(false)
const currentFullSizeImage = ref<string | null>(null)
const currentImageIndex = ref(0)

type AssistantLaneEntry = {
  type: 'assistant'
  id: string
  fullText: string
  displayedText: string
  pendingChars: string[]
  isStreaming: boolean
  createdAt: number
  hasAudio: boolean
  usage?: any
}

type UserLaneEntry = {
  type: 'user'
  id: string
  label: string
  details?: string
  createdAt: number
}

const TOOL_CALL_CLIENT_ID = Symbol('toolCallClientId')

type ToolCallEntry = {
  type: 'tool_call'
  id: string
  toolCallId: string
  toolName: string
  status: 'executing' | 'completed' | 'failed'
  createdAt: number
  completedAt?: number
  errorMessage?: string
}

type ConversationLaneEntry = AssistantLaneEntry | UserLaneEntry | ToolCallEntry

const laneEntries = ref<ConversationLaneEntry[]>([])
const conversationLaneRef = ref<HTMLElement | null>(null)
const toolEntryByCallId = new Map<string, ToolCallEntry>()

const ensureToolCallClientId = (toolCall: any): string => {
  if (toolCall && typeof toolCall.id === 'string' && toolCall.id.trim()) {
    return toolCall.id.trim()
  }

  if (toolCall && Reflect.has(toolCall, TOOL_CALL_CLIENT_ID)) {
    const existingId = Reflect.get(toolCall, TOOL_CALL_CLIENT_ID)
    if (typeof existingId === 'string') {
      return existingId
    }
  }

  const fallbackId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  if (toolCall) {
    Reflect.set(toolCall, TOOL_CALL_CLIENT_ID, fallbackId)
  }
  return fallbackId
}

const upsertToolCallEntry = (toolCall: any): ToolCallEntry => {
  const toolCallId = ensureToolCallClientId(toolCall)
  let entry = toolEntryByCallId.get(toolCallId)

  if (!entry) {
    entry = {
      type: 'tool_call',
      id: `tool-lane-${toolCallId}`,
      toolCallId,
      toolName: toolCall?.name || '未命名工具',
      status: 'executing',
      createdAt: Date.now()
    }
    toolEntryByCallId.set(toolCallId, entry)
    laneEntries.value.push(entry)
  } else {
    entry.toolName = toolCall?.name || entry.toolName
  }

  laneEntries.value = [...laneEntries.value]
  return entry
}

type SettingsPayload = {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  voice: string
  maxHistoryRounds: number
}

type AgentConfigOverrides = {
  apiKey?: string
  baseURL?: string
  model?: string
  systemPrompt?: string
}

let activeAssistantEntry: AssistantLaneEntry | null = null
let typewriterTimer: ReturnType<typeof setInterval> | null = null
let detachServiceListeners: (() => void) | null = null

const TYPEWRITER_INTERVAL = 24

const createAssistantEntry = (): AssistantLaneEntry => ({
  type: 'assistant',
  id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  fullText: '',
  displayedText: '',
  pendingChars: [],
  isStreaming: true,
  createdAt: Date.now(),
  hasAudio: false,
  usage: undefined
})

const ensureActiveAssistantEntry = () => {
  // console.log('📝 Ensuring active assistant entry, current active:', !!activeAssistantEntry)
  if (activeAssistantEntry && activeAssistantEntry.isStreaming) {
    // console.log('📝 Using existing active entry:', activeAssistantEntry.id)
    return activeAssistantEntry
  }

  const nextMessage = createAssistantEntry()
  // console.log('📝 Created new assistant entry:', nextMessage)
  laneEntries.value.push(nextMessage)
  // 强制触发Vue响应式更新
  laneEntries.value = [...laneEntries.value]
  // console.log('📝 Added to laneEntries, new count:', laneEntries.value.length)
  activeAssistantEntry = nextMessage
  // console.log('🆕 Created new assistant entry:', nextMessage.id)
  runTypewriter()
  scrollConversationToLatest()
  return nextMessage
}

const appendAssistantText = (text: string) => {
  if (!text) {
    return
  }

  // console.log('📝 Appending assistant text:', text.substring(0, 50) + (text.length > 50 ? '...' : ''))
  const target = ensureActiveAssistantEntry()
  target.fullText += text
  target.pendingChars.push(...Array.from(text))
  // console.log('📝 Updated pendingChars length:', target.pendingChars.length, 'fullText length:', target.fullText.length)

  if (typewriterTimer === null) {
    // console.log('📝 Starting typewriter from appendAssistantText')
    runTypewriter()
  } else {
    // console.log('📝 Typewriter already running')
  }
}

const syncAssistantToFullText = (fullText: string) => {
  if (!fullText) {
    return
  }

  // console.log('📝 Syncing assistant to full text:', {
  //   newFullTextLength: fullText.length,
  //   newFullTextPreview: fullText.substring(0, 50) + (fullText.length > 50 ? '...' : '')
  // })

  const target = ensureActiveAssistantEntry()
  const currentText = target.fullText
  const currentDisplayedLength = target.displayedText.length

  // console.log('📝 Current state:', {
  //   currentTextLength: currentText.length,
  //   currentDisplayedLength,
  //   pendingCharsLength: target.pendingChars.length
  // })

  if (!currentText) {
    appendAssistantText(fullText)
    return
  }

  // 增量更新：如果新文本是当前文本的扩展
  if (fullText.startsWith(currentText)) {
    const delta = fullText.slice(currentText.length)
    if (delta) {
      // console.log('📝 Appending delta text:', delta.substring(0, 30) + (delta.length > 30 ? '...' : ''))
      appendAssistantText(delta)
    }
    return
  }

  // 处理非增量更新（如工具调用重新生成）
  // 保持已显示内容的连续性，避免显示中断
  // console.log('📝 Non-incremental update detected, preserving displayed content')
  
  // 找到当前已显示文本在新文本中的最佳匹配位置
  const displayedText = target.displayedText
  let bestMatchIndex = -1
  
  // 尝试在新文本中找到已显示内容的匹配
  if (displayedText.length > 0) {
    // 首先尝试完全匹配
    bestMatchIndex = fullText.indexOf(displayedText)
    
    // 如果完全匹配失败，尝试匹配较长的后缀
    if (bestMatchIndex === -1) {
      for (let i = Math.min(displayedText.length - 1, 50); i >= 10; i--) {
        const suffix = displayedText.slice(-i)
        const index = fullText.indexOf(suffix)
        if (index !== -1) {
          bestMatchIndex = index - (displayedText.length - i)
          break
        }
      }
    }
  }
  
  if (bestMatchIndex >= 0 && bestMatchIndex + displayedText.length <= fullText.length) {
    // 找到匹配，保持连续性
    // console.log('📝 Found content match, preserving continuity')
    target.fullText = fullText
    target.displayedText = fullText.slice(0, bestMatchIndex + displayedText.length)
    target.pendingChars = Array.from(fullText.slice(target.displayedText.length))
  } else {
    // 没有找到匹配，但仍然保持已显示的字符数量
    // console.log('📝 No content match found, preserving displayed length')
    target.fullText = fullText
    const safeDisplayLength = Math.min(currentDisplayedLength, fullText.length)
    target.displayedText = fullText.slice(0, safeDisplayLength)
    target.pendingChars = Array.from(fullText.slice(safeDisplayLength))
  }
  
  laneEntries.value = [...laneEntries.value]

  if (typewriterTimer === null && target.pendingChars.length > 0) {
    // console.log('📝 Starting typewriter for remaining content')
    runTypewriter()
  }
}

const finalizeAssistantMessage = () => {
  if (!activeAssistantEntry) {
    return
  }

  activeAssistantEntry.isStreaming = false

  if (!activeAssistantEntry.fullText.trim()) {
    if (activeAssistantEntry.hasAudio) {
      const audioLabel = '🔊 语音回复（正在播放）'
      activeAssistantEntry.fullText = audioLabel
      activeAssistantEntry.displayedText = audioLabel
    } else {
      const index = laneEntries.value.findIndex(entry => entry.id === activeAssistantEntry?.id)
      if (index !== -1) {
        laneEntries.value.splice(index, 1)
      }
      activeAssistantEntry = null
      stopTypewriter()
      return
    }
  }

  if (activeAssistantEntry) {
    // 确保显示所有内容
    activeAssistantEntry.displayedText = activeAssistantEntry.fullText
    activeAssistantEntry.pendingChars = [] // 清空待显示字符
    scrollConversationToLatest()
  }

  // 停止打字机效果并清空 activeAssistantEntry
  stopTypewriter()
  activeAssistantEntry = null
}

const abortAssistantMessage = () => {
  if (!activeAssistantEntry) {
    return
  }

  activeAssistantEntry.isStreaming = false
  activeAssistantEntry = null
  stopTypewriter()
}

const runTypewriter = () => {
  console.log('⌨️ Starting typewriter, timer exists:', typewriterTimer !== null)
  if (typewriterTimer !== null) {
    return
  }

  typewriterTimer = setInterval(() => {
    if (!activeAssistantEntry) {
      // console.log('⌨️ No active assistant entry, stopping typewriter')
      stopTypewriter()
      return
    }

    const nextChar = activeAssistantEntry.pendingChars.shift()
    // console.log('⌨️ Typewriter tick - pendingChars:', activeAssistantEntry.pendingChars.length, 'nextChar:', nextChar)

    if (nextChar !== undefined) {
      activeAssistantEntry.displayedText += nextChar
      // console.log('⌨️ Updated displayedText length:', activeAssistantEntry.displayedText.length)
      // 强制触发Vue响应式更新
      laneEntries.value = [...laneEntries.value]
      scrollConversationToLatest()
      return
    }

    if (activeAssistantEntry.isStreaming) {
      // console.log('⌨️ Still streaming, stopping typewriter temporarily')
      stopTypewriter()
      return
    }

    // console.log('⌨️ Finished typing, stopping typewriter')
    stopTypewriter()
    activeAssistantEntry = null
  }, TYPEWRITER_INTERVAL)
  // console.log('⌨️ Typewriter timer started with interval:', TYPEWRITER_INTERVAL)
}

const stopTypewriter = () => {
  if (typewriterTimer !== null) {
    clearInterval(typewriterTimer)
    typewriterTimer = null
  }
}

const scrollConversationToLatest = () => {
  void nextTick(() => {
    const lane = conversationLaneRef.value
    if (lane) {
      lane.scrollTop = lane.scrollHeight
    }
  })
}

const getEntryOpacity = (index: number) => {
  const total = laneEntries.value.length
  if (!total) {
    return 1
  }

  const distanceFromLatest = total - 1 - index
  const opacity = 1 - distanceFromLatest * 0.15
  return Number(Math.max(0.25, opacity).toFixed(2))
}

watch(
  laneEntries,
  (newEntries, oldEntries) => {
    // console.log('📋 laneEntries updated, count:', newEntries.length, 'old count:', oldEntries?.length || 0)
    newEntries.forEach((entry, index) => {
      if (entry.type === 'assistant') {
        // console.log(`  [${index}] Assistant entry:`, {
        //   id: entry.id,
        //   displayedText: entry.displayedText.substring(0, 30) + (entry.displayedText.length > 30 ? '...' : ''),
        //   fullText: entry.fullText.substring(0, 30) + (entry.fullText.length > 30 ? '...' : ''),
        //   pendingChars: entry.pendingChars.length,
        //   isStreaming: entry.isStreaming
        // })
      } else if (entry.type === 'user') {
        // console.log(`  [${index}] User entry:`, entry.label)
      } else if (entry.type === 'tool_call') {
        // console.log(`  [${index}] Tool call entry:`, {
        //   id: entry.id,
        //   toolCallId: entry.toolCallId,
        //   toolName: entry.toolName,
        //   status: entry.status
        // })
      }
    })
    scrollConversationToLatest()
  },
  { deep: true, immediate: true }
)

const addUserVoiceEntry = (payload: { durationMs?: number; screenshotCount?: number; audioBase64?: string }) => {
  const durationMs = payload.durationMs ?? 0
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  const screenshots = payload.screenshotCount ?? 0

  const labelParts = [`🎤 发送语音（约${seconds}秒）`]
  if (screenshots > 0) {
    labelParts.push(`📸 ${screenshots} 张截图`)
  }

  // 不再保存录音用于回放

  laneEntries.value.push({
    type: 'user',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    label: labelParts.join(' · '),
    createdAt: Date.now()
  })

  scrollConversationToLatest()
}

const toggleScreenRecording = async () => {
  if (isScreenRecording.value) {
    // 停止录屏
    if (multiModalService.value) {
      await multiModalService.value.stopScreenCapture()
    }
    isScreenRecording.value = false
  } else {
    // 启动录屏
    try {
      if (multiModalService.value) {
        await multiModalService.value.startScreenCapture()
        isScreenRecording.value = true
      }
    } catch (error) {
      console.error('启动录屏失败:', error)
      showError('录屏启动失败', error instanceof Error ? error.message : '未知错误')
    }
  }
}


const attachServiceListeners = (service: MultiModalService) => {
  detachServiceListeners?.()
  console.log('🔌 Attaching service listeners to MultiModalService')

  const handleResponseStarted = () => {
    console.log('📝 Agent response started')
    ensureActiveAssistantEntry()
  }

  const handleResponseChunk = (response: AgentResponse) => {
    // console.log('📝 Agent response chunk received:', { 
    //   hasText: typeof response?.text === 'string' && response.text.length > 0,
    //   hasAccumulated: typeof response?.accumulatedText === 'string' && response.accumulatedText.length > 0,
    //   textLength: response?.text?.length || 0,
    //   hasAudio: !!(response.audioChunk || response.audio)
    // })
    const accumulatedText = typeof response?.accumulatedText === 'string' ? response.accumulatedText : null
    if (accumulatedText && accumulatedText.length > 0) {
      syncAssistantToFullText(accumulatedText)
    } else if (typeof response?.text === 'string' && response.text.length > 0) {
      appendAssistantText(response.text)
    }
    if ((response.audioChunk || response.audio) && activeAssistantEntry) {
      activeAssistantEntry.hasAudio = true
    }
  }

  const handleResponseCompleted = (response: AgentResponse) => {
    // console.log('✅ Agent response completed:', {
    //   hasText: typeof response?.text === 'string' && response.text.length > 0,
    //   hasAccumulated: typeof response?.accumulatedText === 'string' && response.accumulatedText.length > 0,
    //   textLength: response?.text?.length || 0,
    //   hasAudio: !!(response.audioChunk || response.audio),
    //   usage: response.usage
    // })

    // 注意：不再调用 syncAssistantToFullText，因为这会创建新的消息条目
    // 流式数据已经在 handleResponseChunk 中处理完成

    if ((response.audioChunk || response.audio) && activeAssistantEntry) {
      activeAssistantEntry.hasAudio = true
    }

    // 保存usage信息
    if (activeAssistantEntry && response.usage) {
      activeAssistantEntry.usage = response.usage
    }

    finalizeAssistantMessage()
  }

  const handleResponseError = () => {
    abortAssistantMessage()
    isProcessing.value = false
  }

  const handleVoiceCaptured = (payload: { durationMs?: number; screenshotCount?: number; audioBase64?: string; images?: string[] }) => {
    // 保存发送的图片数据
    if (payload.images && payload.images.length > 0) {
      lastSentImages.value = [...payload.images]
      showImagePreview.value = true
      console.log('🖼️ 保存发送的图片:', payload.images.length, '张')
    } else {
      // 没有图片时清空预览
      lastSentImages.value = []
      showImagePreview.value = false
    }

    // 添加到界面显示
    addUserVoiceEntry(payload)
    
    // 添加到 conversation store（只添加一次，避免重复）
    const durationMs = payload.durationMs ?? 0
    const seconds = Math.max(1, Math.round(durationMs / 1000))
    const screenshots = payload.screenshotCount ?? 0
    
    const labelParts = [`🎤 发送语音（约${seconds}秒）`]
    if (screenshots > 0) {
      labelParts.push(`📸 ${screenshots} 张截图`)
    }
    
    conversationStore.addUserMessage(labelParts.join(' · '), 'audio')
  }

  const handleMicrophoneVisualization = (data: { volume?: number }) => {
    // 将0-1范围的音量转换为0-100范围，并放大显示
    const rawVolume = data.volume ?? 0
    const amplifiedVolume = Math.min(100, Math.max(0, rawVolume * 1000)) // 放大1000倍以便观察
    if (amplifiedVolume <= 0) {
      currentVolume.value = 0
    } else {
      currentVolume.value = Math.max(1, Math.ceil(amplifiedVolume))
    }
    // console.log('🔊 音量显示:', { raw: rawVolume, amplified: amplifiedVolume, display: currentVolume.value })
  }

  const handleVoiceDetectionStarted = () => {
    isVoiceActive.value = true
  }

  const handleVoiceDetectionStopped = () => {
    isVoiceActive.value = false
    currentVolume.value = 0
  }

  const handleProcessingStarted = () => {
    isProcessing.value = true
  }

  const handleProcessingCompleted = () => {
    isProcessing.value = false
  }

  const handleToolCallStarted = (toolCall: any) => {
    const toolCallId = ensureToolCallClientId(toolCall)
    const alreadyTracked = toolEntryByCallId.has(toolCallId)
    const entry = upsertToolCallEntry(toolCall)
    entry.status = 'executing'
    entry.errorMessage = undefined
    laneEntries.value = [...laneEntries.value]

    if (!alreadyTracked) {
      const assistantNote = `🛠️ 正在调用工具：${entry.toolName}`
      conversationStore.addAssistantMessage(assistantNote, 'text')
      console.log('🛠️ 工具调用开始:', entry.toolName)
    }

    scrollConversationToLatest()
  }

  const handleToolCallCompleted = (payload: { toolCall: any; response: { content?: string } }) => {
    const entry = upsertToolCallEntry(payload?.toolCall)
    entry.status = 'completed'
    entry.completedAt = Date.now()
    entry.errorMessage = undefined
    laneEntries.value = [...laneEntries.value]

    const responseContent = payload?.response?.content ?? ''
    if (responseContent) {
      conversationStore.addToolMessage(responseContent, 'text')
    } else {
      conversationStore.addToolMessage(
        JSON.stringify({ tool: entry.toolName, status: 'completed' }),
        'text'
      )
    }

    console.log('✅ 工具调用完成:', {
      tool: entry.toolName,
      toolCallId: entry.toolCallId
    })

    scrollConversationToLatest()
  }

  const handleToolCallFailed = (payload: { toolCall: any; error: unknown }) => {
    const entry = upsertToolCallEntry(payload?.toolCall)
    entry.status = 'failed'
    entry.completedAt = Date.now()
    const errorMessage = payload?.error instanceof Error
      ? payload.error.message
      : String(payload?.error ?? '未知错误')
    entry.errorMessage = errorMessage
    laneEntries.value = [...laneEntries.value]

    conversationStore.addToolMessage(
      JSON.stringify({ tool: entry.toolName, status: 'failed', error: errorMessage }),
      'text'
    )

    console.warn('❌ 工具调用失败:', {
      tool: entry.toolName,
      error: errorMessage
    })

    scrollConversationToLatest()
  }

  service.on('agentResponseStarted', handleResponseStarted)
  service.on('agentResponseChunk', handleResponseChunk)
  service.on('agentResponseCompleted', handleResponseCompleted)
  service.on('error', handleResponseError)
  service.on('voiceInputCaptured', handleVoiceCaptured)
  service.on('microphoneVisualization', handleMicrophoneVisualization)
  service.on('voiceDetectionStarted', handleVoiceDetectionStarted)
  service.on('voiceDetectionStopped', handleVoiceDetectionStopped)
  service.on('processingStarted', handleProcessingStarted)
  service.on('processingCompleted', handleProcessingCompleted)
  service.on('toolCallStarted', handleToolCallStarted)
  service.on('toolCallCompleted', handleToolCallCompleted)
  service.on('toolCallFailed', handleToolCallFailed)

  detachServiceListeners = () => {
    service.off('agentResponseStarted', handleResponseStarted)
    service.off('agentResponseChunk', handleResponseChunk)
    service.off('agentResponseCompleted', handleResponseCompleted)
    service.off('error', handleResponseError)
    service.off('voiceInputCaptured', handleVoiceCaptured)
    service.off('microphoneVisualization', handleMicrophoneVisualization)
    service.off('voiceDetectionStarted', handleVoiceDetectionStarted)
    service.off('voiceDetectionStopped', handleVoiceDetectionStopped)
    service.off('processingStarted', handleProcessingStarted)
    service.off('processingCompleted', handleProcessingCompleted)
    service.off('toolCallStarted', handleToolCallStarted)
    service.off('toolCallCompleted', handleToolCallCompleted)
    service.off('toolCallFailed', handleToolCallFailed)
  }
}

// 计算属性
const canStartCall = computed(() => connectionStore.apiKey && !isInCall.value)
const canEndCall = computed(() => connectionStore.apiKey && isInCall.value)

// 本地存储相关方法
const loadSavedSettings = () => {
  // 加载供应商配置
  const savedProviderId = getStorageItem(STORAGE_KEYS.providerId)
  if (savedProviderId && PRESET_PROVIDERS[savedProviderId as keyof typeof PRESET_PROVIDERS]) {
    currentProviderId.value = savedProviderId
  }

  // 按供应商加载对应的 API Key
  const savedApiKey = getStorageItem(`apiKey_${currentProviderId.value}`)
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey
    connectionStore.setApiKey(savedApiKey) // 同步到 store
  }

  // 按供应商加载对应的 Base URL 和 Model
  if (currentProviderId.value === 'custom') {
    // 自定义供应商：从全局配置加载
    const savedBaseUrl = getStorageItem(STORAGE_KEYS.baseUrl)
    baseUrl.value = savedBaseUrl ? savedBaseUrl : DEFAULT_BASE_URL

    const savedModel = getStorageItem(STORAGE_KEYS.model)
    modelName.value = savedModel ? savedModel : DEFAULT_LLM_SETTINGS.model
  } else {
    // 预设供应商：从供应商特定配置加载
    const savedBaseUrl = getStorageItem(`baseUrl_${currentProviderId.value}`)
    const savedModel = getStorageItem(`model_${currentProviderId.value}`)

    // 优先使用保存的配置，否则使用预设值
    baseUrl.value = savedBaseUrl ? savedBaseUrl : PRESET_PROVIDERS[currentProviderId.value as keyof typeof PRESET_PROVIDERS]?.baseUrl || DEFAULT_BASE_URL
    modelName.value = savedModel ? savedModel : PRESET_PROVIDERS[currentProviderId.value as keyof typeof PRESET_PROVIDERS]?.model || DEFAULT_LLM_SETTINGS.model
  }

  const savedSystemPrompt = getStorageItem(STORAGE_KEYS.systemPrompt)
  if (savedSystemPrompt && savedSystemPrompt.trim()) {
    systemPrompt.value = savedSystemPrompt
  } else {
    systemPrompt.value = DEFAULT_SYSTEM_PROMPT
  }

  // 加载音色偏好
  const savedVoice = getStorageItem('preferredVoice')
  if (savedVoice) {
    preferredVoice.value = savedVoice
    // 音色偏好已保存，将在Settings组件中加载
    console.log('🎵 Loaded voice preference:', savedVoice)
  } else {
    preferredVoice.value = DEFAULT_LLM_SETTINGS.voice
  }

  // 加载会话保存回合数
  const savedMaxHistoryRounds = getStorageItem(STORAGE_KEYS.maxHistoryRounds)
  if (savedMaxHistoryRounds) {
    maxHistoryRounds.value = parseInt(savedMaxHistoryRounds, 10)
    console.log('📁 Loaded max history rounds:', maxHistoryRounds.value)
  } else {
    maxHistoryRounds.value = 5 // 默认值
  }

  const savedProviders = getStorageItem(STORAGE_KEYS.providers)
  if (savedProviders) {
    try {
      const parsedProviders = JSON.parse(savedProviders)
      providers.value = { ...PRESET_PROVIDERS, ...parsedProviders }
    } catch (error) {
      console.warn('加载供应商配置失败:', error)
      providers.value = { ...PRESET_PROVIDERS }
    }
  }

  // 检查是否是首次使用
  const seenOnboarding = getStorageItem(STORAGE_KEYS.onboarding)
  hasSeenOnboarding.value = seenOnboarding === 'true'

  // 加载截图配置
  loadScreenshotConfig()
}

// 加载截图配置
const loadScreenshotConfig = () => {
  try {
    const savedConfig = getStorageItem('screenshotConfig')
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig)
      screenshotConfig.value = { ...screenshotConfig.value, ...parsedConfig }
      console.log('📸 截图配置已加载:', screenshotConfig.value)
    }
  } catch (error) {
    console.warn('加载截图配置失败:', error)
  }
}





// 引导相关方法
const showOnboardingGuide = () => {
  showOnboarding.value = true
}

const hideOnboardingGuide = () => {
  showOnboarding.value = false
  setStorageItem(STORAGE_KEYS.onboarding, 'true')
  hasSeenOnboarding.value = true
}

// 显示全尺寸图片
const showFullSizeImageModal = (image: string, index: number) => {
  currentFullSizeImage.value = image
  currentImageIndex.value = index
  showFullSizeImage.value = true
}

// 关闭全尺寸图片
const closeFullSizeImage = () => {
  showFullSizeImage.value = false
  currentFullSizeImage.value = null
  currentImageIndex.value = 0
}

// 导航到下一张图片
const nextImage = () => {
  if (lastSentImages.value.length === 0) return
  currentImageIndex.value = (currentImageIndex.value + 1) % lastSentImages.value.length
  currentFullSizeImage.value = lastSentImages.value[currentImageIndex.value]
}

// 导航到上一张图片
const prevImage = () => {
  if (lastSentImages.value.length === 0) return
  currentImageIndex.value = (currentImageIndex.value - 1 + lastSentImages.value.length) % lastSentImages.value.length
  currentFullSizeImage.value = lastSentImages.value[currentImageIndex.value]
}

const completeOnboarding = () => {
  hideOnboardingGuide()
  // 引导完成后，不再强制显示设置面板
}

const updateAgentConfig = (overrides?: AgentConfigOverrides) => {
  if (!multiModalService.value) {
    return
  }

  const apiKey = (overrides?.apiKey ?? connectionStore.apiKey ?? '').trim()
  if (!apiKey) {
    return
  }

  const baseURL = (overrides?.baseURL ?? effectiveBaseUrl.value).trim()
  const model = (overrides?.model ?? effectiveModel.value).trim()
  const basePrompt = overrides?.systemPrompt ?? effectiveSystemPrompt.value
  const mergedPrompt = composeSystemPrompt(basePrompt)

  // 获取保存的音色偏好
  const savedVoice = preferredVoice.value || getStorageItem('preferredVoice') || DEFAULT_LLM_SETTINGS.voice
  preferredVoice.value = savedVoice

  multiModalService.value.updateConfig({
    agentConfig: {
      systemPrompt: mergedPrompt,
      llmConfig: {
        ...DEFAULT_LLM_SETTINGS,
        model,
        apiKey,
        baseURL,
        voice: savedVoice,
        providerId: currentProviderId.value
      }
    }
  })

  multiModalService.value.setToolsEnabled(toolsEnabled.value)
}

// 更新截图配置
const updateScreenshotConfig = () => {
  if (!multiModalService.value) {
    return
  }

  multiModalService.value.updateConfig({
    screenshotConfig: {
      captureInterval: screenshotConfig.value.captureInterval,
      maxScreenshots: screenshotConfig.value.maxScreenshots,
      showPreview: screenshotConfig.value.showPreview,
      imageQuality: screenshotConfig.value.imageQuality
    }
  })
  console.log('📸 截图配置已更新:', screenshotConfig.value)
}

const persistSettings = async (config: SettingsPayload & { providerId?: string }) => {
  if (isSavingSettings.value) {
    return
  }

  isSavingSettings.value = true

  try {
    const trimmedApiKey = (config.apiKey || '').trim()
    const trimmedBaseUrl = (config.baseUrl || '').trim()
    const trimmedModel = (config.model || '').trim()
    const trimmedSystemPrompt = (config.systemPrompt || '').trim()
    const trimmedVoice = (config.voice || '').trim()
    const newMaxHistoryRounds = config.maxHistoryRounds || 5
    const providerId = config.providerId || currentProviderId.value

    apiKeyInput.value = trimmedApiKey
    baseUrl.value = trimmedBaseUrl || DEFAULT_BASE_URL
    modelName.value = trimmedModel || DEFAULT_LLM_SETTINGS.model
    systemPrompt.value = trimmedSystemPrompt || DEFAULT_SYSTEM_PROMPT
    maxHistoryRounds.value = newMaxHistoryRounds
    currentProviderId.value = providerId

    // 保存音色偏好
    if (trimmedVoice) {
      setStorageItem('preferredVoice', trimmedVoice)
      preferredVoice.value = trimmedVoice
    }

    // 保存会话保存回合数
    setStorageItem(STORAGE_KEYS.maxHistoryRounds, newMaxHistoryRounds.toString())
    console.log('📁 Max history rounds saved:', newMaxHistoryRounds)

    // 如果是自定义供应商，更新自定义供应商的配置
    if (providerId === 'custom') {
      providers.value.custom.baseUrl = trimmedBaseUrl
      providers.value.custom.model = trimmedModel
    }

    if (trimmedApiKey) {
      // 按供应商分别存储 API Key
      setStorageItem(`apiKey_${providerId}`, trimmedApiKey)
      connectionStore.setApiKey(trimmedApiKey) // 同步到 store
    } else {
      removeStorageItem(`apiKey_${providerId}`)
      connectionStore.setApiKey('') // 清空 store
    }

    // 按供应商分别存储 Base URL 和 Model
    if (providerId === 'custom') {
      // 自定义供应商：保存到全局配置
      if (trimmedBaseUrl) {
        setStorageItem(STORAGE_KEYS.baseUrl, trimmedBaseUrl)
      } else {
        removeStorageItem(STORAGE_KEYS.baseUrl)
        baseUrl.value = DEFAULT_BASE_URL
      }

      if (trimmedModel) {
        setStorageItem(STORAGE_KEYS.model, trimmedModel)
      } else {
        removeStorageItem(STORAGE_KEYS.model)
        modelName.value = DEFAULT_LLM_SETTINGS.model
      }
    } else {
      // 预设供应商：保存到供应商特定配置
      if (trimmedBaseUrl) {
        setStorageItem(`baseUrl_${providerId}`, trimmedBaseUrl)
      } else {
        removeStorageItem(`baseUrl_${providerId}`)
      }

      if (trimmedModel) {
        setStorageItem(`model_${providerId}`, trimmedModel)
      } else {
        removeStorageItem(`model_${providerId}`)
      }
    }

    if (trimmedSystemPrompt) {
      setStorageItem(STORAGE_KEYS.systemPrompt, trimmedSystemPrompt)
    } else {
      removeStorageItem(STORAGE_KEYS.systemPrompt)
      systemPrompt.value = DEFAULT_SYSTEM_PROMPT
    }

    // 保存供应商配置
    setStorageItem(STORAGE_KEYS.providerId, providerId)
    setStorageItem(STORAGE_KEYS.providers, JSON.stringify(providers.value))

    if (trimmedApiKey) {
      await initializeMultiModalService()
    }

    connectionStore.setConnectionError(null)
    showSettings.value = false
  } catch (error) {
    console.error('Failed to save settings:', error)
    showError('配置失败', error instanceof Error ? error.message : '未知错误')
    connectionStore.setConnectionError(error instanceof Error ? error.message : '配置失败')
    if (config.apiKey.trim()) {
      connectionStore.setApiKey('')
    }
  } finally {
    isSavingSettings.value = false
  }
}

const handleSettingsSave = async (config: SettingsPayload & { providerId: string }) => {
  await persistSettings(config)
}

// 处理截图设置保存
const handleScreenshotSettingsSave = (config: any) => {
  try {
    screenshotConfig.value = config
    setStorageItem('screenshotConfig', JSON.stringify(config))
    console.log('📸 截图配置已保存:', config)

    // 更新服务配置
    updateScreenshotConfig()
  } catch (error) {
    console.error('保存截图配置失败:', error)
  }
}

watch(
  () => connectionStore.apiKey,
  (newKey, oldKey) => {
    const trimmed = (newKey || '').trim()
    const previous = (oldKey || '').trim()

    if (trimmed === previous) {
      return
    }

    if (trimmed && trimmed !== apiKeyInput.value.trim()) {
      apiKeyInput.value = trimmed
    }

    if (!trimmed) {
      return
    }

    updateAgentConfig({ apiKey: trimmed })
  }
)

watch(
  () => [effectiveBaseUrl.value, effectiveModel.value],
  () => {
    const currentKey = (connectionStore.apiKey ?? '').trim()
    if (!currentKey) {
      return
    }
    updateAgentConfig({ apiKey: currentKey })
  }
)

watch(
  () => effectiveSystemPrompt.value,
  () => {
    const currentKey = (connectionStore.apiKey ?? '').trim()
    if (!currentKey || !multiModalService.value) {
      return
    }
    updateAgentConfig({ apiKey: currentKey })
  }
)

watch(
  () => toolsEnabled.value,
  enabled => {
    if (multiModalService.value) {
      multiModalService.value.setToolsEnabled(enabled)
      updateAgentConfig()
    }
  }
)

// 监听会话保存回合数的变化
watch(
  () => maxHistoryRounds.value,
  (newRounds) => {
    if (multiModalService.value && 'setMaxHistoryRounds' in multiModalService.value) {
      (multiModalService.value as any).setMaxHistoryRounds(newRounds)
      console.log('📁 Updated maxHistoryRounds to:', newRounds)
    }
  }
)

// 监听VAD配置变化并应用到服务
watch([
  () => audioStore.vadThreshold,
  () => audioStore.vadSilenceDuration
], ([threshold, silenceDuration]) => {
  if (runOmniService.value) {
    runOmniService.value.updateVadConfig({
      threshold,
      silenceDuration
    })
    console.log('🔊 VAD配置已更新到RunOmniService:', { threshold, silenceDuration })
  }
})


// 错误处理方法
const showError = (title: string, message: string) => {
  errorMessage.value = `${title}: ${message}`
  showErrorModal.value = true

  // 3秒后自动关闭错误提示
  setTimeout(() => {
    showErrorModal.value = false
    errorMessage.value = null
  }, 3000)
}

const handleRetry = async () => {
  if (retryCount.value >= maxRetries) {
    showError('重试次数已达上限', '请刷新页面重试')
    return
  }

  retryCount.value++

  try {
    // 重新尝试开始通话
    await startCall()
  } catch (error) {
    console.error('Retry failed:', error)
    showError('重试失败', '请稍后重试')
  }
}

const clearError = () => {
  errorMessage.value = null
  showErrorModal.value = false
  retryCount.value = 0
}







// 初始化MultiModalService
const initializeMultiModalService = async () => {
  const apiKey = (apiKeyInput.value || connectionStore.apiKey || '').trim()
  if (!apiKey) {
    console.error('No API key provided for MultiModalService')
    return
  }

  try {
    if (!multiModalService.value) {
      console.log('🔧 Creating new MultiModalService instance')
      const savedVoice = preferredVoice.value || getStorageItem('preferredVoice') || DEFAULT_LLM_SETTINGS.voice
      preferredVoice.value = savedVoice
      const config = {
        agentConfig: {
          systemPrompt: composedSystemPrompt.value,
          llmConfig: {
            ...DEFAULT_LLM_SETTINGS,
            model: effectiveModel.value,
            apiKey,
            baseURL: effectiveBaseUrl.value,
            voice: savedVoice,
            providerId: currentProviderId.value
          }
        },
        conversationConfig: {
          sendHistoryImages: false, // 默认禁用历史图片，可以根据需要启用
          sendHistoryAudio: true     // 默认启用历史音频，解决语音丢失问题
        },
        screenshotConfig: {
          captureInterval: screenshotConfig.value.captureInterval,
          maxScreenshots: screenshotConfig.value.maxScreenshots,
          showPreview: screenshotConfig.value.showPreview,
          imageQuality: screenshotConfig.value.imageQuality
        }
      }

      multiModalService.value = new MultiModalService(config)
      attachServiceListeners(multiModalService.value as MultiModalService)
      await multiModalService.value.initialize()
      multiModalService.value.setToolsEnabled(toolsEnabled.value)
      
      // 设置会话保存回合数
      if ('setMaxHistoryRounds' in multiModalService.value) {
        (multiModalService.value as any).setMaxHistoryRounds(maxHistoryRounds.value)
      }
      
      console.log('✅ MultiModalService initialized successfully')
    } else {
      console.log('🔧 Updating existing MultiModalService config')
      // 重新设置事件监听器，确保它们没有丢失
      if (multiModalService.value) {
        attachServiceListeners(multiModalService.value as MultiModalService)
      }
      updateAgentConfig({ apiKey })
      // 更新截图配置
      updateScreenshotConfig()
      multiModalService.value?.setToolsEnabled(toolsEnabled.value)
    }
  } catch (error) {
    console.error('Failed to initialize MultiModalService:', error)
    throw error
  }
}

// 方法
const handleConnect = async () => {
  if (!apiKeyInput.value.trim() || isSavingSettings.value) return

  // 获取保存的音色偏好
  const savedVoice = preferredVoice.value || getStorageItem('preferredVoice') || DEFAULT_LLM_SETTINGS.voice
  preferredVoice.value = savedVoice

  await persistSettings({
    apiKey: apiKeyInput.value,
    baseUrl: baseUrl.value,
    model: modelName.value,
    systemPrompt: systemPrompt.value,
    voice: savedVoice,
    maxHistoryRounds: maxHistoryRounds.value
  })
}

const startCall = async (): Promise<void> => {
  try {
    console.log('🎤 Requesting permissions...')

    // 直接使用已保存的API Key，不再检查
    const savedApiKey = getStorageItem(STORAGE_KEYS.apiKey)
    if (savedApiKey && !apiKeyInput.value.trim()) {
      apiKeyInput.value = savedApiKey
    }

    await initializeMultiModalService()
    await multiModalService.value!.startListening()

    isInCall.value = true
    startCallTimer()
    retryCount.value = 0
  } catch (error) {
    console.error('Failed to start call:', error)

    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      if (message.includes('permission')) {
        if (message.includes('microphone')) {
          showError('麦克风权限错误', '请在浏览器设置中允许麦克风访问权限')
        } else if (message.includes('screen')) {
          console.warn('Screen capture permission denied, proceeding without screenshots')
        }
      } else {
        showError('启动通话失败', error.message)
      }
    } else {
      showError('启动通话失败', '未知错误')
    }
  }
}

const endCall = async () => {
  if (multiModalService.value) {
    await multiModalService.value.stopListening()
  }

  connectionStore.setConnected(false)
  connectionStore.setApiKey('')

  stopCallTimer()
  callDuration.value = 0

  // 重置UI状态
  isInCall.value = false
  isProcessing.value = false
  currentVolume.value = 0
  isVoiceActive.value = false
  // 停止录屏
  if (isScreenRecording.value && multiModalService.value) {
    await multiModalService.value.stopScreenCapture()
    isScreenRecording.value = false
  }
}

const startCallTimer = () => {
  stopCallTimer()
  callTimer.value = setInterval(() => {
    callDuration.value++
  }, 1000)
}

// 主按钮点击处理
const handleMainButtonClick = async () => {
  if (isInCall.value) {
    await endCall()
  } else {
    await startCall()
  }
}

const stopCallTimer = () => {
  if (callTimer.value) {
    clearInterval(callTimer.value)
    callTimer.value = null
  }
}

// 文本输入处理方法
const handleTextInput = async () => {
  const text = textInput.value.trim()
  if (!text) return

  // console.log('📝 发送文本输入:', text)

  // 添加到对话记录
  laneEntries.value.push({
    type: 'user',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    label: `💬 ${text}`,
    createdAt: Date.now()
  })

  // 处理文件上传
  const filesToSend: File[] = []
  if (uploadedFiles.value.length > 0) {
    const fileTypes = uploadedFiles.value.map(file => {
      if (file.type.startsWith('image/')) return '图片'
      if (file.type.startsWith('video/')) return '视频'
      if (file.type.startsWith('audio/')) return '音频'
      return '文件'
    })

    laneEntries.value.push({
      type: 'user',
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      label: `📎 上传了 ${uploadedFiles.value.length} 个文件 (${fileTypes.join(', ')})`,
      createdAt: Date.now()
    })

    // 收集要发送的文件
    uploadedFiles.value.forEach(fileInfo => {
      filesToSend.push(fileInfo.file)
    })
  }

  // 清空输入和文件
  textInput.value = ''
  clearUploadedFiles()

  scrollConversationToLatest()

  // 发送到服务端
  try {
    // 如果服务未初始化，先初始化服务
    if (!multiModalService.value) {
      await initializeMultiModalService()
    }

    if (multiModalService.value) {
      // console.log('🚀 发送文本消息到服务端:', { text, files: filesToSend.length })

      // 设置处理状态
      isProcessing.value = true

      // 创建助手消息条目
      ensureActiveAssistantEntry()

      // 如果有文件，需要转换为base64格式发送
      if (filesToSend.length > 0) {
        const imageBase64List: string[] = []
        const videoBase64List: string[] = []
        const audioBase64List: string[] = []

        console.log('📦 开始处理文件:', filesToSend.length, '个')
        isProcessingFiles.value = true // 显示处理中状态

        try {
          // 处理文件转换
          for (const file of filesToSend) {
            try {
              if (file.type.startsWith('image/')) {
                console.log('🖼️ 处理图片文件:', file.name, `(${file.type})`)
                const dataUrl = await fileToBase64(file)
                imageBase64List.push(dataUrl)
                const mimeType = dataUrl.split(';')[0].split(':')[1] // 提取MIME类型
                console.log('✅ 图片转换成功:', { 
                  name: file.name, 
                  mimeType,
                  dataUrlSize: `${(dataUrl.length / 1024).toFixed(2)}KB` 
                })
              } else if (file.type.startsWith('video/')) {
                console.log('🎬 处理视频文件:', file.name, `(${file.type})`)
                const dataUrl = await fileToBase64(file)
                videoBase64List.push(dataUrl)
                const mimeType = dataUrl.split(';')[0].split(':')[1] // 提取MIME类型
                console.log('✅ 视频转换成功:', { 
                  name: file.name,
                  mimeType,
                  dataUrlSize: `${(dataUrl.length / 1024).toFixed(2)}KB`,
                  originalSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
                })
              } else if (file.type.startsWith('audio/')) {
                console.log('🔊 处理音频文件:', file.name, `(${file.type})`)
                const dataUrl = await fileToBase64(file)
                audioBase64List.push(dataUrl)
                const mimeType = dataUrl.split(';')[0].split(':')[1] // 提取MIME类型
                console.log('✅ 音频转换成功:', { 
                  name: file.name,
                  mimeType,
                  dataUrlSize: `${(dataUrl.length / 1024).toFixed(2)}KB`,
                  originalSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
                })
              }
            } catch (error) {
              console.error('❌ 文件处理失败:', file.name, error)
              showError('文件处理失败', `无法处理文件 ${file.name}`)
            }
          }

          console.log('📤 准备发送多模态消息:', { 
            text, 
            images: imageBase64List.length,
            videos: videoBase64List.length,
            audios: audioBase64List.length
          })
          
          // 发送所有类型的文件（图片、视频、音频）
          if (imageBase64List.length > 0 || videoBase64List.length > 0 || audioBase64List.length > 0) {
            await (multiModalService.value as any).sendMultiModalMessage({
              text: text,
              images: imageBase64List,
              videos: videoBase64List,
              audios: audioBase64List
            })
            console.log('✅ 多模态消息发送成功')
          } else {
            // 如果没有可发送的内容，只发送文本
            await multiModalService.value.createResponse(text)
            console.log('✅ 纯文本消息发送成功')
          }
        } finally {
          isProcessingFiles.value = false // 隐藏处理中状态
        }
      } else {
        // 发送纯文本消息
        await multiModalService.value.createResponse(text)
        console.log('✅ 纯文本消息发送成功')
      }

    } else {
      console.warn('MultiModalService 初始化失败')
      showError('服务初始化失败', '请检查 API Key 配置')
      // 移除已创建的助手消息条目
      abortAssistantMessage()
    }
  } catch (error) {
    console.error('发送文本消息失败:', error)
    showError('发送失败', error instanceof Error ? error.message : '未知错误')
    abortAssistantMessage()
  } finally {
    isProcessing.value = false
  }
}

// 文件上传处理方法
const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files

  if (!files || files.length === 0) return

  Array.from(files).forEach(file => {
    // 检查文件类型
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
      showError('文件类型错误', `文件 ${file.name} 不支持，只支持图片、视频和音频文件`)
      return
    }

    // 检查文件大小
    if (!validateFileSize(file)) {
      return
    }

    // 如果是视频或音频文件，给出提示
    if (file.type.startsWith('video/')) {
      console.log('🎬 检测到视频文件，将直接上传:', file.name, `${(file.size / 1024 / 1024).toFixed(2)}MB`)
    } else if (file.type.startsWith('audio/')) {
      console.log('🔊 检测到音频文件，将直接上传:', file.name, `${(file.size / 1024 / 1024).toFixed(2)}MB`)
    }

    // 创建预览URL
    const previewUrl = URL.createObjectURL(file)

    uploadedFiles.value.push({
      file,
      name: file.name,
      type: file.type,
      previewUrl
    })
  })

  // 清空文件输入
  target.value = ''
}

// 文件管理方法
const removeFile = (index: number) => {
  // 释放预览URL
  URL.revokeObjectURL(uploadedFiles.value[index].previewUrl)
  uploadedFiles.value.splice(index, 1)
}

const clearUploadedFiles = () => {
  // 释放所有预览URL
  uploadedFiles.value.forEach(file => {
    URL.revokeObjectURL(file.previewUrl)
  })
  uploadedFiles.value = []
}

// 文件转完整data URL（包含MIME类型）
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // 返回完整的 data URL，包含 MIME 类型
      // 例如: data:image/jpeg;base64,xxx 或 data:video/mp4;base64,xxx
      resolve(result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 检查文件大小（限制为500MB）
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB（放宽限制以支持大文件）
const validateFileSize = (file: File): boolean => {
  if (file.size > MAX_FILE_SIZE) {
    showError('文件过大', `文件 ${file.name} 超过500MB限制（当前: ${(file.size / 1024 / 1024).toFixed(2)}MB）`)
    return false
  }
  return true
}

// 清除聊天历史
const clearChatHistory = () => {
  if (laneEntries.value.length === 0) {
    return
  }

  // 清除泳道聊天历史
  laneEntries.value = []
  toolEntryByCallId.clear()

  // 清除活跃的助手消息
  activeAssistantEntry = null
  stopTypewriter()

  // 清除对话存储中的历史记录
  conversationStore.clearMessages()

  console.log('🗑️ 聊天历史已清除')
}

const openCanvasOverlay = () => {
  canvasStore.showOverlay()
}

const toggleTools = () => {
  toolsEnabled.value = !toolsEnabled.value
}

// 工具调用相关方法
const getToolStatusText = (status: 'executing' | 'completed' | 'failed'): string => {
  const statusMap = {
    executing: '执行中',
    completed: '已完成',
    failed: '失败'
  }
  return statusMap[status] || status
}

const getToolStatusIcon = (status: 'executing' | 'completed' | 'failed'): string => {
  const iconMap = {
    executing: '⏳',
    completed: '✅',
    failed: '❌'
  }
  return iconMap[status] || '⏳'
}

// 生命周期
onMounted(async () => {
  loadSavedSettings()

  // 如果是首次使用，显示引导
  if (!hasSeenOnboarding.value) {
    setTimeout(() => {
      showOnboardingGuide()
    }, 1000)
  }

  // 添加键盘事件监听
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!showFullSizeImage.value) return

    switch (event.key) {
      case 'Escape':
        closeFullSizeImage()
        break
      case 'ArrowLeft':
        prevImage()
        break
      case 'ArrowRight':
        nextImage()
        break
    }
  }

  window.addEventListener('keydown', handleKeyDown)

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    // 清理所有预览URL
    clearUploadedFiles()
  })
})

onUnmounted(() => {
  detachServiceListeners?.()
  detachServiceListeners = null
  stopTypewriter()
  activeAssistantEntry = null

  if (multiModalService.value) {
    multiModalService.value.dispose()
  }
  endCall()
})
</script>

<template>
  <div id="app">
    <!-- 设置面板 -->
    <Settings
      v-if="showSettings"
      :initial-api-key="apiKeyInput"
      :initial-base-url="baseUrl"
      :initial-model="modelName"
      :initial-system-prompt="systemPrompt"
      :initial-provider-id="currentProviderId"
      :initial-voice="preferredVoice"
      :initial-max-history-rounds="maxHistoryRounds"
      :providers="providers"
      :is-saving="isSavingSettings"
      @close="showSettings = false"
      @save="handleSettingsSave"
    />

    <!-- AI 控制器 -->
    <AIController 
      v-if="connectionStore.apiKey"
      :api-key="connectionStore.apiKey"
      :voice="preferredVoice"
      @error="showError"
      @processing-start="isProcessing = true"
      @processing-end="isProcessing = false"
    />

    <!-- 音频控制器 -->
    <AudioController 
      v-if="connectionStore.apiKey"
      :api-key="connectionStore.apiKey"
      @error="showError"
      @processing-start="isProcessing = true"
      @processing-end="isProcessing = false"
      ref="audioControllerRef"
    />

    <!-- 屏幕控制器 -->
    <ScreenController 
      v-if="connectionStore.apiKey"
      :api-key="connectionStore.apiKey"
      @error="showError"
    />

    <!-- 主界面 -->
    <div class="phone-container">
      <!-- 右上角设置按钮 -->
      <button
        class="top-right-settings-btn"
        @click="showSettings = true"
      >
        <svg class="btn-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0,0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
        </svg>
      </button>

      <!-- 左侧图片预览区域 -->
      <div v-if="showImagePreview && lastSentImages.length > 0 && !isCanvasOverlayVisible" class="image-preview-panel">
        <div class="image-preview-header">
          <h3>📸 发送的截图 ({{ lastSentImages.length }})</h3>
          <button class="close-preview-btn" @click="showImagePreview = false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="image-preview-grid">
          <div
            v-for="(image, index) in lastSentImages"
            :key="index"
            class="image-preview-item"
            @click="showFullSizeImageModal(image, index)"
          >
            <img
              :src="`data:image/jpeg;base64,${image}`"
              :alt="`截图 ${index + 1}`"
              class="preview-image"
            />
            <div class="image-index">{{ index + 1 }}</div>
          </div>
        </div>
      </div>

      <div class="conversation-lane" :class="{ 'with-canvas': isCanvasOverlayVisible }">
        <button
          class="open-canvas-btn"
          type="button"
          title="打开画板"
          aria-label="打开画板"
          @click="openCanvasOverlay"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v7.75a.75.75 0 0 1-1.5 0V5.5a1 1 0 0 0-1-1h-13a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9.75a.75.75 0 0 1 0 1.5H5.5A2.5 2.5 0 0 1 3 18.5z" />
            <path d="M10.22 14.97 19.1 6.1a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-8.88 8.88a1.5 1.5 0 0 1-.67.39l-3.17.79a.5.5 0 0 1-.6-.6l.79-3.17a1.5 1.5 0 0 1 .42-.85z" />
          </svg>
        </button>

        <div class="conversation-track" ref="conversationLaneRef">
          <div v-if="laneEntries.length === 0" class="conversation-placeholder">
            <span class="placeholder-icon">💬</span>
            <span class="placeholder-text">等待助手回复...</span>
          </div>

          <div
            v-for="(entry, index) in laneEntries"
            :key="entry.id"
            class="lane-entry"
            :class="[
              entry.type,
              entry.type === 'assistant' && entry.isStreaming ? 'streaming' : null
            ]"
            :style="{ opacity: getEntryOpacity(index) }"
          >
            <template v-if="entry.type === 'assistant'">
              <div class="assistant-message-wrapper">
                <div class="assistant-message-content">
                  <span class="assistant-text">{{ entry.displayedText }}</span>
                  <span v-if="entry.isStreaming" class="typing-caret"></span>
                </div>
                <div v-if="entry.usage && !entry.isStreaming" class="usage-info">
                  <div class="usage-details">
                    <span v-if="entry.usage.prompt_tokens" class="usage-item">
                      <span class="usage-label">输入Token:</span>
                      <span class="usage-value">{{ entry.usage.prompt_tokens }}</span>
                    </span>
                    <span v-if="entry.usage.completion_tokens" class="usage-item">
                      <span class="usage-label">输出Token:</span>
                      <span class="usage-value">{{ entry.usage.completion_tokens }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <template v-else-if="entry.type === 'user'">
              <span class="user-text">{{ entry.label }}</span>
            </template>
            <template v-else-if="entry.type === 'tool_call'">
              <div
                class="tool-call-wrapper"
                :title="entry.errorMessage ? `${getToolStatusText(entry.status)}: ${entry.errorMessage}` : getToolStatusText(entry.status)"
              >
                <span class="tool-icon">🛠️</span>
                <span class="tool-name">{{ entry.toolName }}</span>
                <span class="tool-status-icon" :class="entry.status">{{ getToolStatusIcon(entry.status) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 底部输入控制栏 -->
      <div class="bottom-controls" :class="{ 'with-canvas': isCanvasOverlayVisible }">
        <div class="input-container">
          <!-- 文件预览区域 (移到输入框上方) -->
          <div v-if="uploadedFiles.length > 0" class="file-preview-area">
            <div class="file-preview-header">
              <span>已选择 {{ uploadedFiles.length }} 个文件</span>
              <button class="clear-files-btn" @click="clearUploadedFiles" title="清除所有文件">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div class="file-preview-grid">
              <div
                v-for="(file, index) in uploadedFiles"
                :key="index"
                class="file-preview-item"
                :class="{ 'image': file.type.startsWith('image/'), 'video': file.type.startsWith('video/') }"
              >
                <div class="file-preview-content">
                  <img
                    v-if="file.type.startsWith('image/')"
                    :src="file.previewUrl"
                    :alt="file.name"
                    class="preview-thumbnail"
                  />
                  <video
                    v-else-if="file.type.startsWith('video/')"
                    :src="file.previewUrl"
                    class="preview-thumbnail"
                  ></video>
                  <div v-else class="file-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                  </div>
                </div>
                <button
                  class="remove-file-btn"
                  @click="removeFile(index)"
                  title="移除文件"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- 文本输入区域 -->
          <div class="text-input-wrapper">
            <!-- 文件处理中指示器 -->
            <div v-if="isProcessingFiles" class="processing-files-indicator">
              <div class="spinner"></div>
              <span>文件处理中...</span>
            </div>
            
            <textarea
              v-model="textInput"
              class="text-input"
              placeholder="输入文字..."
              rows="1"
              @keydown.enter.prevent="handleTextInput"
              :disabled="isProcessingFiles"
            ></textarea>

            <!-- 文件上传按钮 -->
            <div class="file-upload-wrapper">
              <input
                type="file"
                ref="fileInput"
                class="file-input"
                accept="image/*,video/*,audio/*"
                @change="handleFileUpload"
                multiple
              />
              <button
                class="file-upload-btn"
                @click="triggerFileInput"
                title="上传图片、视频或音频"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 控制按钮区域 -->
          <div class="control-buttons">
            <button
              class="control-btn microphone-btn"
              :class="{
                'recording': isInCall,
                'disabled': isProcessing
              }"
              @click="handleMainButtonClick"
              :disabled="isProcessing"
              :title="isInCall ? '结束对话' : '开始对话'"
            >
              <svg v-if="!isInCall" class="btn-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              <div v-else class="recording-square"></div>
            </button>

            <button
              class="control-btn screen-record-btn"
              :class="{ active: isScreenRecording }"
              @click="toggleScreenRecording"
              :title="isScreenRecording ? '停止截屏' : '开始截屏'"
            >
              <svg
                class="btn-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18 10.48V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4.48l4 3.98v-11l-4 3.98zm-2-.79V18H4V6h12v3.69z"/>
              </svg>
            </button>

            <button
              class="control-btn clear-history-btn"
              @click="clearChatHistory"
              :disabled="laneEntries.length === 0"
              title="清除聊天历史"
            >
              <svg
                class="btn-icon clear-history-icon"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="12" cy="3.6" r="0.9" fill="currentColor" opacity=".9" />
                <path
                  d="M11.2 4.8h1.6a.8.8 0 0 1 .8.8V9a.8.8 0 0 1-.8.8h-1.6A.8.8 0 0 1 10.4 9V5.6a.8.8 0 0 1 .8-.8z"
                  fill="currentColor"
                />
                <path
                  d="M7.4 9.6h9.2l1.5 6.2H5.9l1.5-6.2z"
                  fill="currentColor"
                />
                <path
                  d="M7 13.8h10"
                  stroke="currentColor"
                  stroke-width="1.1"
                  stroke-linecap="round"
                  opacity=".75"
                />
                <path
                  d="M6 16.6h12a.9.9 0 0 1 .9.9v2.1a.9.9 0 0 1-.9.9H6a.9.9 0 0 1-.9-.9v-2.1a.9.9 0 0 1 .9-.9z"
                  fill="currentColor"
                  opacity=".88"
                />
                <path
                  d="M8.8 19.9h6.4c.44 0 .8.36.8.8v1H8v-1c0-.44.36-.8.8-.8z"
                  fill="currentColor"
                  opacity=".68"
                />
              </svg>
            </button>

            <button
              class="control-btn tool-toggle-btn"
              type="button"
              :class="{ active: toolsEnabled }"
              :title="toolsToggleTitle"
              :aria-pressed="toolsEnabled"
              aria-label="切换工具调用"
              @click="toggleTools"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </button>

            <!-- 竖向音量柱状图 -->
            <div
              class="vertical-volume-bar"
              v-if="isInCall"
              :class="{ active: isVoiceActive }"
            >
              <div
                class="volume-bar-fill-vertical"
                :style="{ height: `${currentVolume}%` }"
              ></div>
            </div>
          </div>
        </div>


      </div>
    </div>

    <CanvasOverlay v-if="isCanvasOverlayVisible" />

    <!-- 用户引导模态框 -->
    <OnboardingGuide
      :show="showOnboarding"
      @close="hideOnboardingGuide"
      @complete="completeOnboarding"
    />

    <!-- 错误提示模态框 -->
    <div v-if="showErrorModal" class="error-modal-overlay" @click="clearError">
      <div class="error-modal" @click.stop>
        <div class="error-header">
          <h3>错误提示</h3>
          <button class="close-btn" @click="clearError">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="error-content">
          <div class="error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </div>
          <p class="error-message">{{ errorMessage }}</p>
          <div class="error-actions">
            <button
              v-if="retryCount < maxRetries"
              class="btn btn-primary"
              @click="handleRetry"
            >
              重试 ({{ retryCount }}/{{ maxRetries }})
            </button>
            <button
              class="btn btn-secondary"
              @click="clearError"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 全尺寸图片预览模态框 -->
    <div v-if="showFullSizeImage" class="full-size-image-overlay" @click="closeFullSizeImage">
      <div class="full-size-image-modal" @click.stop>
        <div class="full-size-image-header">
          <span class="image-counter">截图 {{ currentImageIndex + 1 }} / {{ lastSentImages.length }}</span>
          <button class="close-full-size-btn" @click="closeFullSizeImage">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="full-size-image-content">
          <img
            v-if="currentFullSizeImage"
            :src="`data:image/jpeg;base64,${currentFullSizeImage}`"
            :alt="`截图 ${currentImageIndex + 1}`"
            class="full-size-image"
          />
        </div>
        <div class="full-size-image-controls">
          <button
            v-if="lastSentImages.length > 1"
            class="nav-btn prev-btn"
            @click="prevImage"
            :disabled="lastSentImages.length <= 1"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
          <button
            v-if="lastSentImages.length > 1"
            class="nav-btn next-btn"
            @click="nextImage"
            :disabled="lastSentImages.length <= 1"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding: 0;
  margin: 0;
}

/* 设置面板 */
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.settings-panel {
  background: #1a1a2e;
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.settings-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e0e0e0;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  padding: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.3s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
}

.settings-content .form-group {
  margin-bottom: 16px;
}

.settings-content label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #e0e0e0;
}

.settings-content input {
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.05);
  color: #e0e0e0;
}

.settings-content input:focus {
  outline: none;
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.1);
}

.btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 音量显示样式 */
.volume-display {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.volume-bar-container {
  width: 120px;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.volume-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50 0%, #ffeb3b 50%, #ff9800 75%, #f44336 100%);
  transition: width 0.1s ease;
  border-radius: 4px;
}

.volume-value {
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 600;
  min-width: 45px;
  text-align: center;
}

/* 设备选择器样式 */
.audio-device-selector {
  margin-bottom: 12px;
}

.device-select {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  color: #e0e0e0;
  font-size: 14px;
  min-width: 200px;
}

.device-select:focus {
  outline: none;
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.15);
}

.device-select option {
  background: #1a1a2e;
  color: #e0e0e0;
}

.device-loading {
  color: #e0e0e0;
  font-size: 12px;
  opacity: 0.8;
  margin-top: 4px;
}

/* 手机容器 - 移除所有边框和框体 */
.phone-container {
  width: 100%;
  height: 100%;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  border: none;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

/* 音量可视化容器 */
.voice-visualizer-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
}




.conversation-lane {
  position: fixed;
  top: 16px;
  bottom: 160px;
  left: 50%;
  transform: translateX(-50%);
  width: min(80vw, 640px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  gap: 12px;
  pointer-events: auto;
  z-index: 100;
  padding: 44px 16px 0;
  transition: all 0.3s ease;
}

.conversation-lane.with-canvas {
  left: 120px;
  transform: translateX(0);
  width: min(45vw, 480px);
}

.open-canvas-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(15, 23, 42, 0.35);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
  backdrop-filter: blur(6px);
}

.open-canvas-btn:hover {
  background: rgba(79, 70, 229, 0.7);
  transform: translateY(-1px);
}

.open-canvas-btn:active {
  transform: translateY(0);
}


.conversation-track {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 12px;
  overflow-y: auto;
  padding: 20px;
  border-radius: 18px;
  background: linear-gradient(160deg, rgba(26, 32, 60, 0.7), rgba(17, 24, 49, 0.55));
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 18px 48px rgba(8, 12, 32, 0.45);
  backdrop-filter: blur(14px);
  min-height: 200px;
}

.conversation-track::-webkit-scrollbar {
  width: 4px;
}

.conversation-track::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 2px;
}

.conversation-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 14px;
  text-align: center;
  padding: 40px 20px;
}

.placeholder-icon {
  font-size: 24px;
}

.lane-entry {
  max-width: 100%;
  padding: 14px 18px;
  border-radius: 16px;
  font-size: 16px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  word-break: break-word;
  transition: opacity 0.45s ease, transform 0.45s ease;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lane-entry.assistant {
  align-self: flex-end;
  border-radius: 16px 16px 4px 16px;
  background: rgba(110, 135, 255, 0.14);
  border: 1px solid rgba(120, 145, 255, 0.24);
  color: rgba(255, 255, 255, 0.92);
}

.lane-entry.assistant.streaming {
  border-color: rgba(182, 196, 255, 0.35);
  background: rgba(130, 155, 255, 0.18);
  box-shadow: 0 8px 24px rgba(96, 126, 255, 0.2);
}

.lane-entry.user {
  align-self: flex-start;
  border-radius: 4px 16px 16px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(235, 240, 255, 0.75);
  font-size: 14px;
}

.lane-entry.tool_call {
  align-self: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px dashed rgba(255, 255, 255, 0.25);
  color: rgba(240, 244, 255, 0.85);
  font-size: 14px;
  border-radius: 12px;
}

.tool-call-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.tool-icon {
  font-size: 16px;
}

.tool-status-icon {
  font-size: 18px;
  transition: transform 0.3s ease;
}

.tool-status-icon.executing {
  animation: pulse 1.2s ease-in-out infinite;
}

.tool-status-icon.failed {
  color: #ff6b6b;
}

.tool-status-icon.completed {
  color: #6dffca;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
}

.assistant-text,
.user-text {
  display: inline;
  white-space: pre-wrap;
}

.typing-caret {
  display: inline-block;
  width: 8px;
  height: 18px;
  margin-left: 4px;
  background: rgba(228, 233, 255, 0.9);
  border-radius: 2px;
  animation: caret-blink 1s step-end infinite;
}

@keyframes caret-blink {
  0%, 50% {
    opacity: 1;
  }
  50.1%, 100% {
    opacity: 0;
  }
}


/* 底部控制栏 - 仅麦克风图标和设置按钮 */
.bottom-controls {
  background: transparent;
  padding: 16px;
  border-top: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  width: auto;
  max-width: 400px;
}

.control-btn {
  background: transparent;
  border: none;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: none;
}

.control-btn:hover {
  transform: translateY(-1px);
  box-shadow: none;
}

.microphone-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.microphone-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.microphone-btn.recording {
  background: #dc3545;
  border-color: #dc3545;
  animation: pulse 1.5s infinite;
}

.screen-record-btn {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.25);
}

.screen-record-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.35);
}

.screen-record-btn.active {
  background: rgba(244, 67, 54, 0.2);
  border-color: rgba(244, 67, 54, 0.4);
  animation: pulse 1.5s infinite;
}

.control-btn.clear-history-btn {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.25);
}

.control-btn.clear-history-btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.35);
}

.control-btn.clear-history-btn:not(:disabled):active {
  transform: translateY(1px);
}

.control-btn.clear-history-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.15);
}

.control-btn.clear-history-btn:disabled .clear-history-icon {
  opacity: 0.6;
}

.control-btn.tool-toggle-btn {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.25);
  position: relative;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.7);
}

.control-btn.tool-toggle-btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
  transform: scale(1.05);
}

.control-btn.tool-toggle-btn:not(:disabled):active {
  transform: translateY(1px) scale(1.05);
}

.control-btn.tool-toggle-btn.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-color: rgba(16, 185, 129, 0.6);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.4), 0 4px 8px rgba(16, 185, 129, 0.2);
  color: #ffffff;
}

.control-btn.tool-toggle-btn.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

.recording-square {
  width: 24px;
  height: 24px;
  background: white;
  border-radius: 4px;
}

.settings-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  width: 50px;
  height: 50px;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
}

.btn-icon {
  color: #e0e0e0;
}

/* 控制按钮容器 - 保持水平排列 */
.control-buttons {
  display: flex;
  gap: 32px;
  justify-content: center;
  align-items: center;
}

/* 错误模态框样式 */
.error-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.error-modal {
  background: #1a1a2e;
  border-radius: 16px;
  padding: 32px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(244, 67, 54, 0.3);
}

.error-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.error-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #e0e0e0;
}

.error-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}

.error-icon {
  color: #f44336;
  opacity: 0.9;
  filter: drop-shadow(0 0 20px rgba(244, 67, 54, 0.3));
}

.error-message {
  color: #e0e0e0;
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
  padding: 16px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 8px;
  border-left: 3px solid #f44336;
}

.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.error-actions .btn {
  min-width: 100px;
}

/* 麦克风选择下拉框样式 */
.audio-device-selector {
  display: flex;
  justify-content: center;
  width: 100%;
  position: relative;
}

.device-loading {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.8);
  color: #e0e0e0;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
  margin-top: 4px;
  z-index: 10;
}

.device-select {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  color: #e0e0e0;
  font-size: 14px;
  min-width: 200px;
  max-width: 300px;
  cursor: pointer;
  transition: all 0.3s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23e0e0e0' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 12px center;
  background-repeat: no-repeat;
  background-size: 16px;
  padding-right: 40px;
  text-align: center;
}

.device-select:focus {
  outline: none;
  border-color: #667eea;
  background-color: rgba(255, 255, 255, 0.15);
}

.device-select:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
}

.device-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* VAD阈值控制样式 */
.vad-threshold-control {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  max-width: 300px;
}

.control-label {
  font-size: 12px;
  color: #e0e0e0;
  font-weight: 500;
  opacity: 0.8;
  min-width: 50px;
}

.threshold-slider {
  width: 120px;
  height: 6px;
  -webkit-appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  outline: none;
}

.threshold-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #ff9800;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.3);
}

.threshold-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #ff9800;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.3);
}

.threshold-value {
  font-size: 12px;
  color: #e0e0e0;
  font-weight: 500;
  min-width: 40px;
  text-align: center;
}

/* 音量显示样式 */
.volume-display {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  max-width: 200px;
}

.volume-indicator-text {
  font-size: 12px;
  color: #e0e0e0;
  font-weight: 500;
  opacity: 0.8;
  min-width: 35px;
}

.volume-bar-container {
  width: 80px;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.volume-bar-fill {
  height: 100%;
  background: linear-gradient(to right, #4caf50, #8bc34a);
  border-radius: 4px;
  transition: width 0.1s ease;
}

.volume-value {
  font-size: 12px;
  color: #e0e0e0;
  font-weight: 500;
  min-width: 40px;
  text-align: center;
}

/* 竖向音量柱状图样式 */
.vertical-volume-bar {
  width: 8px;
  height: 60px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  margin: 0 10px;
}

.vertical-volume-bar.active {
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 0 12px rgba(103, 126, 255, 0.35);
}

.volume-bar-fill-vertical {
  width: 100%;
  background: linear-gradient(to top, #4caf50, #8bc34a, #ffeb3b, #ff9800, #f44336);
  border-radius: 4px;
  transition: height 0.1s ease;
  position: absolute;
  bottom: 0;
}

/* 右上角设置按钮样式 */
.top-right-settings-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 300;
}

.top-right-settings-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
}

.top-right-settings-btn .btn-icon {
  color: #e0e0e0;
}

/* 响应式设计 */
@media (max-width: 1024px) and (min-width: 769px) {
  .conversation-lane.with-canvas {
    width: min(40vw, 400px);
  }

  .bottom-controls.with-canvas {
    max-width: min(40vw, 400px);
  }
}

@media (max-width: 768px) and (min-width: 481px) {
  .conversation-lane.with-canvas {
    width: calc(50vw - 20px);
  }

  .bottom-controls.with-canvas {
    max-width: calc(50vw - 20px);
  }
}

@media (max-width: 480px) {
  .phone-container {
    max-width: 100%;
    height: 100vh;
    border-radius: 0;
    border: none;
  }

  .settings-panel {
    width: 95%;
    padding: 20px;
  }

  .control-btn {
    width: 44px;
    height: 44px;
  }

  .bottom-controls {
    gap: 8px;
    padding: 12px;
    max-width: 350px;
  }

  .bottom-controls.with-canvas {
    max-width: 90vw;
    left: 15vw;
  }

  .conversation-lane {
    width: calc(100% - 40px);
    top: 12px;
    bottom: 140px;
    padding: 44px 12px 0;
  }

  .conversation-lane.with-canvas {
    width: calc(100% - 20px);
    left: 48px;
  }

  .open-canvas-btn {
    top: 8px;
    right: 10px;
  }

  .tool-toggle-btn {
    top: 8px;
    right: 50px;
  }

  .conversation-track {
    padding: 16px;
  }

  .lane-entry {
    font-size: 15px;
  }

  .audio-device-selector {
    width: 90%;
  }

  .device-select {
    min-width: 180px;
    max-width: 280px;
    padding: 10px 14px;
    font-size: 13px;
  }

  .device-loading {
    font-size: 11px;
    padding: 6px;
  }

  .vad-threshold-control {
    max-width: 250px;
  }

  .threshold-slider {
    width: 100px;
  }

  .volume-display {
    max-width: 160px;
  }

  .volume-bar-container {
    width: 60px;
    height: 6px;
  }

  .error-modal {
    margin: 20px;
    padding: 24px;
  }

  .error-message {
    font-size: 14px;
    padding: 12px;
  }

  .error-actions {
    flex-direction: column;
    gap: 8px;
  }

  .error-actions .btn {
    width: 100%;
  }
}

/* AI处理指示器样式 */
.ai-processing-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  margin-bottom: 15px;
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.processing-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 麦克风按钮禁用状态 */

/* 图片预览面板样式 */
.image-preview-panel {
  position: fixed;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 280px;
  max-height: 80vh;
  background: linear-gradient(160deg, rgba(26, 32, 60, 0.9), rgba(17, 24, 49, 0.85));
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(8, 12, 32, 0.6);
  backdrop-filter: blur(16px);
  z-index: 150;
  overflow: hidden;
  transition: all 0.3s ease;
}

.image-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}

.image-preview-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.close-preview-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  padding: 4px;
  border-radius: 4px;
  transition: all 0.3s;
}

.close-preview-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.image-preview-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-height: calc(80vh - 80px);
  overflow-y: auto;
}

.image-preview-item {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.preview-image:hover {
  transform: scale(1.05);
}

.image-index {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

/* Assistant消息包装器 */
.assistant-message-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* Usage信息样式 */
.assistant-message-content {
  margin-bottom: 8px;
  width: 100%;
}

.usage-info {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.usage-details {
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: center;
}

.usage-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.usage-label {
  font-weight: 500;
}

.usage-value {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

/* 全尺寸图片预览样式 */
.full-size-image-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3000;
}

.full-size-image-modal {
  background: #1a1a2e;
  border-radius: 12px;
  overflow: hidden;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.full-size-image-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.image-counter {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  font-weight: 500;
}

.close-full-size-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  padding: 6px;
  border-radius: 6px;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-full-size-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.full-size-image-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  min-height: 300px;
  max-height: calc(90vh - 120px);
}

.full-size-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.full-size-image-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 20px;
  gap: 20px;
  background: rgba(255, 255, 255, 0.05);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.8);
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 1);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 图片预览项添加悬停效果 */
.image-preview-item {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.image-preview-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* 新的输入控件样式 */
.input-container {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}

.text-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 12px 16px;
  backdrop-filter: blur(10px);
  position: relative;
}

/* 文件处理中指示器 */
.processing-files-indicator {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(103, 126, 234, 0.2);
  border: 1px solid rgba(103, 126, 234, 0.4);
  border-radius: 12px;
  padding: 6px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(103, 126, 234, 0.3);
  animation: fadeInUp 0.3s ease;
}

.processing-files-indicator .spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.text-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e0e0e0;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
  max-height: 120px;
  min-height: 20px;
  padding: 8px 0;
  margin: 0;
}

.text-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.file-upload-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.file-input {
  display: none;
}

.file-upload-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #e0e0e0;
  transition: all 0.3s ease;
}

.file-upload-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
}

/* 文件预览区域样式 (在输入框上方) */
.file-preview-area {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-bottom: 8px;
  padding: 8px;
  backdrop-filter: blur(10px);
}

.file-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
}

.clear-files-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  padding: 3px;
  border-radius: 3px;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-files-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.file-preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.file-preview-item {
  position: relative;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  transition: all 0.2s;
}

.file-preview-item:hover {
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.file-preview-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.preview-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-icon {
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-file-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  background: rgba(220, 53, 69, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
  color: white;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  padding: 0;
}

.file-preview-item:hover .remove-file-btn {
  opacity: 1;
}

.remove-file-btn:hover {
  background: rgba(220, 53, 69, 1);
  transform: scale(1.1);
}

/* 调整底部控制栏样式 */
.bottom-controls {
  background: transparent;
  padding: 16px;
  border-top: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  width: auto;
  max-width: 600px;
  transition: all 0.3s ease;
}

.bottom-controls.with-canvas {
  left: 120px;
  transform: translateX(0);
  max-width: min(45vw, 480px);
}

/* 调整控制按钮容器 */
.control-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
}

/* 调整控制按钮尺寸 */
.control-btn {
  background: transparent;
  border: none;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: none;
}

.microphone-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.screen-record-btn {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.25);
}

/* 响应式调整 */
@media (max-width: 768px) {
  .input-container {
    flex-direction: column;
    gap: 12px;
  }

  .text-input-wrapper {
    width: 100%;
  }

  .control-buttons {
    width: 100%;
    justify-content: space-between;
  }

  .file-preview-grid {
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  }

  .bottom-controls {
    max-width: 90vw;
    padding: 12px;
  }
}
</style>
const isCanvasOverlayVisible = computed(() => canvasStore.isOverlayVisible.value)
