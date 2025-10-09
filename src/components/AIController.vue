<script setup lang="ts">
import { ref, watch } from 'vue'
import { Agent } from '@/modules/agent'
import { AudioPlayer } from '@/modules/llm'

const DASH_SCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

const props = defineProps<{
  apiKey: string
  voice?: string
}>()

const emit = defineEmits<{
  error: [title: string, message: string]
  processingStart: []
  processingEnd: []
}>()

// 服务实例
const agent = ref<Agent | undefined>(undefined)
const audioPlayer = ref<AudioPlayer | undefined>(undefined)

// 状态
const isProcessing = ref(false)

// 错误处理方法
const showError = (title: string, message: string) => {
  emit('error', title, message)
}

const resetAgent = () => {
  if (agent.value) {
    agent.value.removeAllListeners()
    agent.value = undefined
  }
}

// 初始化Agent
const initializeAgent = async (force = false) => {
  if (force) {
    resetAgent()
  }

  if (agent.value) return

  if (!props.apiKey.trim()) {
    console.error('No API key provided')
    return
  }

  try {
    // 初始化音频播放器
    audioPlayer.value = new AudioPlayer({ volume: 0.8 })
    await audioPlayer.value.initialize()

    // 创建Agent配置
    const agentConfig = {
      systemPrompt: '你是一个多模态AI助手，能够处理语音和图像输入。请理解和回应用户的需求，并根据屏幕内容提供帮助。',
      llmConfig: {
        apiKey: props.apiKey.trim(),
        baseURL: DASH_SCOPE_BASE_URL,
        model: 'qwen3-omni-flash',
        voice: (props.voice ?? 'Cherry').trim() || 'Cherry',
        format: 'wav',
        providerId: 'aliyun' // AIController 默认使用阿里云
      }
    }

    agent.value = new Agent(agentConfig)
    agent.value.on('responseError', (error) => {
      showError('生成回复失败', error instanceof Error ? error.message : '未知错误')
    })

    console.log('✅ Agent initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Agent:', error)
    throw error
  }
}

// 处理语音输入
const processVoiceInput = async (audioData: string, screenshots: any[]) => {
  if (isProcessing.value) {
    console.log('AI is already processing, ignoring new input')
    return
  }

  try {
    emit('processingStart')
    isProcessing.value = true

    if (!agent.value) {
      await initializeAgent()
    }

    if (agent.value) {
      for await (const result of agent.value.generate(
        '',
        screenshots,
        audioData
      )) {
        if (result.audio && audioPlayer.value) {
          await audioPlayer.value.play(result.audio)
        }
        if (result.text) {
          console.log('AI Text Response:', result.text)
        }
      }
    }
  } catch (error) {
    console.error('Error processing voice input:', error)
    showError('处理语音输入时出错', error instanceof Error ? error.message : '未知错误')
  } finally {
    isProcessing.value = false
    emit('processingEnd')
  }
}

// 暴露方法给父组件
defineExpose({
  processVoiceInput,
  isProcessing
})

watch(
  () => props.apiKey,
  (newKey, oldKey) => {
    const trimmed = newKey.trim()
    const previous = (oldKey ?? '').trim()

    if (!trimmed) {
      resetAgent()
      return
    }

    if (!agent.value) {
      void initializeAgent()
      return
    }

    if (trimmed !== previous) {
      agent.value.updateLLMConfig({
        apiKey: trimmed,
        baseURL: DASH_SCOPE_BASE_URL
      })
    }
  },
  { immediate: true }
)

watch(
  () => props.voice,
  (newVoice, oldVoice) => {
    const trimmedVoice = (newVoice ?? '').trim()
    const previousVoice = (oldVoice ?? '').trim()

    if (!agent.value) {
      return
    }

    if (!trimmedVoice || trimmedVoice === previousVoice) {
      return
    }

    agent.value.updateLLMConfig({ voice: trimmedVoice })
  }
)
</script>

<template>
  <div class="ai-controller">
    <div v-if="isProcessing" class="ai-processing-indicator">
      <div class="processing-spinner"></div>
      <span>AI正在思考...</span>
    </div>
  </div>
</template>

<style scoped>
.ai-controller {
  position: relative;
}

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
</style>
