<template>
  <div class="settings-overlay">
    <div class="settings-panel">
      <div class="settings-header">
        <h3>设置</h3>
        <button class="close-btn" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.7,1.3c-0.4-0.4-1-0.4-1.4,0L8,6.6L2.7,1.3c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4L6.6,8l-5.3,5.3c-0.4,0.4-0.4,1,0,1.4c0.4,0.4,1,0.4,1.4,0L8,9.4l5.3,5.3c0.4,0.4,1,0.4,1.4,0c0.4-0.4,0.4-1,0-1.4L9.4,8l5.3-5.3C15.1,2.3,15.1,1.7,14.7,1.3z"/>
          </svg>
        </button>
      </div>
      <div class="settings-tabs">
        <button
          class="tab-button"
          :class="{ active: activeTab === 'general' }"
          type="button"
          @click="activeTab = 'general'"
        >
          基础配置
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'voice' }"
          type="button"
          @click="activeTab = 'voice'"
        >
          语音设置
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'systemPrompt' }"
          type="button"
          @click="activeTab = 'systemPrompt'"
        >
          系统提示词
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'screenshot' }"
          type="button"
          @click="activeTab = 'screenshot'"
        >
          截图设置
        </button>
      </div>

      <div class="settings-content">
        <div v-if="activeTab === 'general'" class="tab-panel">
          <!-- 供应商选择 -->
          <div class="form-group">
            <label for="providerSelect">模型供应商</label>
            <select
              id="providerSelect"
              v-model="providerId"
              class="device-select"
              :disabled="isSaving"
            >
              <option
                v-for="provider in Object.values(props.providers)"
                :key="provider.id"
                :value="provider.id"
              >
                {{ provider.name }}
              </option>
            </select>
          </div>

          <!-- API Key配置 -->
          <div class="form-group">
            <label for="apiKey">API Key</label>
            <input
              id="apiKey"
              v-model="apiKeyInput"
              type="password"
              placeholder="请输入API Key"
              :disabled="isSaving"
            />
            <div class="api-key-actions">
              <button
                class="btn btn-secondary"
                @click="clearApiKey"
                type="button"
                :disabled="isSaving"
              >
                清除本地Key
              </button>
            </div>
          </div>

          <!-- 通用模型配置 - 仅自定义供应商显示 -->
          <div v-if="isCustomProvider" class="form-group">
            <label for="baseUrl">Base URL</label>
            <input
              id="baseUrl"
              v-model="baseUrlInput"
              type="text"
              placeholder="例如：https://api.openai.com/v1"
              :disabled="isSaving"
            />
          </div>

          <div v-if="isCustomProvider" class="form-group">
            <label for="modelName">模型名称</label>
            <input
              id="modelName"
              v-model="modelInput"
              type="text"
              placeholder="请输入模型名称"
              :disabled="isSaving"
            />
          </div>


          <!-- 会话保存回合数设置 -->
          <div class="form-group">
            <div class="vad-threshold-control">
              <label class="control-label">会话保存回合数</label>
              <input
                type="range"
                v-model.number="maxHistoryRounds"
                min="1"
                max="20"
                step="1"
                @input="updateMaxHistoryRounds"
                class="threshold-slider"
              />
              <div class="threshold-value">{{ maxHistoryRounds }}轮</div>
            </div>
            <p class="field-hint">控制系统保留多少轮对话历史，每轮包含一个用户消息和一个AI回复。</p>
          </div>
        </div>

        <div v-else-if="activeTab === 'voice'" class="tab-panel">
          <!-- 麦克风选择 -->
          <div v-if="showDeviceSelector" class="form-group">
            <label for="audioDevice">麦克风选择</label>
            <div class="audio-device-selector">
              <select
                id="audioDevice"
                v-model="selectedAudioDeviceId"
                :disabled="isDeviceListLoading"
                @change="handleDeviceChange"
                class="device-select"
              >
                <option value="">选择麦克风</option>
                <option
                  v-for="device in audioDevices"
                  :key="device.deviceId"
                  :value="device.deviceId"
                >
                  {{ device.label || `麦克风 ${device.deviceId.slice(0, 8)}...` }}
                </option>
              </select>
              <div v-if="isDeviceListLoading" class="device-loading">
                正在加载设备...
              </div>
            </div>
          </div>

          <!-- 音色选择 -->
          <div class="form-group">
            <label for="voiceSelect">音色选择</label>
            <select
              id="voiceSelect"
              v-model="selectedVoice"
              class="device-select"
              :disabled="isSaving"
            >
              <option value="">选择音色</option>
              <option
                v-for="voice in voiceOptions"
                :key="voice.value"
                :value="voice.value"
              >
                {{ voice.label }} ({{ voice.name }})
              </option>
            </select>
          </div>

          <!-- VAD阈值设置 -->
          <div class="form-group">
            <div class="vad-threshold-control">
              <label class="control-label">VAD阈值</label>
              <input
                type="range"
                v-model.number="vadThreshold"
                min="0"
                max="60"
                step="1"
                @input="updateVadThreshold"
                class="threshold-slider"
              />
              <div class="threshold-value">{{ Math.round(vadThreshold) }}%</div>
            </div>
          </div>

          <!-- 静音持续时间设置 -->
          <div class="form-group">
            <div class="vad-threshold-control">
              <label class="control-label">静音持续时间</label>
              <input
                type="range"
                v-model.number="vadSilenceDuration"
                min="500"
                max="4000"
                step="100"
                @input="updateVadSilenceDuration"
                class="threshold-slider"
              />
              <div class="threshold-value">{{ Math.round(vadSilenceDuration) }}ms</div>
            </div>
            <p class="field-hint">检测到语音后，持续静音超过此时间认为语音结束。建议1500-2000ms。</p>
          </div>
        </div>

        <div v-else-if="activeTab === 'systemPrompt'" class="tab-panel">
          <div class="form-group">
            <label for="systemPrompt">系统提示词</label>
            <textarea
              id="systemPrompt"
              v-model="systemPromptInput"
              class="system-prompt-textarea"
              rows="6"
              placeholder="为助手设置一个角色或行为指引，例如：你是一名多模态AI助手，根据用户语音和屏幕内容提供帮助。"
              :disabled="isSaving"
            ></textarea>
            <div class="system-prompt-actions">
              <button
                class="btn btn-secondary"
                @click="restoreDefaultSystemPrompt"
                type="button"
                :disabled="isSaving"
              >
                恢复默认
              </button>
            </div>
            <p class="field-hint">提示词将作为 system role 发送给模型，留空则使用默认值。</p>
          </div>
        </div>

        <div v-else-if="activeTab === 'screenshot'" class="tab-panel">
          <ScreenshotSettings
            :config="screenshotConfig"
            @save="handleScreenshotSettingsSave"
          />
        </div>

        <div class="form-group form-actions">
          <button
            class="btn btn-primary"
            :disabled="!canSave"
            @click="handleSave"
            type="button"
          >
            {{ isSaving ? '保存中...' : activeTab === 'systemPrompt' ? '保存提示词' : '保存配置' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useAudioStore } from '@/stores'
import { AudioManager } from '@/modules/audio'
import type { AudioDevice } from '@/types/audio'
import ScreenshotSettings from './ScreenshotSettings.vue'

const props = withDefaults(defineProps<{
  initialApiKey?: string
  initialBaseUrl?: string
  initialModel?: string
  initialSystemPrompt?: string
  initialProviderId?: string
  initialVoice?: string
  initialMaxHistoryRounds?: number
  providers?: Record<string, any>
  isSaving?: boolean
}>(), {
  initialApiKey: '',
  initialBaseUrl: '',
  initialModel: '',
  initialSystemPrompt: '',
  initialProviderId: 'aliyun',
  initialVoice: 'Cherry',
  initialMaxHistoryRounds: 5,
  providers: () => ({}),
  isSaving: false
})

// Define emits
const emit = defineEmits<{
  close: []
  save: [config: {
    apiKey: string;
    baseUrl: string;
    model: string;
    systemPrompt: string;
    providerId: string;
    voice: string;
    maxHistoryRounds: number;
  }]
}>()

// Store
const audioStore = useAudioStore()

// UI 状态
const apiKeyInput = ref(props.initialApiKey)
const baseUrlInput = ref(props.initialBaseUrl)
const modelInput = ref(props.initialModel)
const vadThreshold = ref(18) // VAD阈值，范围0-100
const vadSilenceDuration = ref(1500) // 静音持续时间，范围500-4000毫秒
const systemPromptInput = ref(props.initialSystemPrompt)
const providerId = ref(props.initialProviderId)
const selectedVoice = ref('Cherry') // 默认音色
const maxHistoryRounds = ref(props.initialMaxHistoryRounds) // 会话保存回合数
const activeTab = ref<'general' | 'voice' | 'systemPrompt' | 'screenshot'>('general')

// 默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `You are Qwen-Omni, a smart voice assistant created by Alibaba Qwen. You are a virtual voice assistant with no gender or age. You are communicating with the user. In user messages, "I/me/my/we/our" refer to the user and "you/your" refer to the assistant. In your replies, address the user as "you/your" and yourself as "I/me/my"; never mirror the user's pronouns—always shift perspective. Keep original pronouns only in direct quotes; if a reference is unclear, ask a brief clarifying question. Interact with users using short (no more than 50 words), brief, straightforward language, maintaining a natural tone. Never use formal phrasing, mechanical expressions, bullet points, or overly structured language. Your output must consist only of the spoken content you want the user to hear. Do not include any descriptions of actions, emotions, sounds, or voice changes. Do not use asterisks, brackets, parentheses, or any other symbols to indicate tone or actions. You must answer users' audio or text questions; do not directly describe video content. Communicate in the same language strictly as the user unless they request otherwise. When uncertain (e.g., you can't see/hear clearly, don't understand, or the user makes a comment rather than asking a question), use appropriate questions to guide the user to continue the conversation. Keep replies concise and conversational, as if talking face-to-face.`

// 音色选项
const voiceOptions = ref([
  { value: 'Cherry', label: '芊悦', name: 'Cherry' },
  { value: 'Ethan', label: '晨煦', name: 'Ethan' },
  { value: 'Nofish', label: '不吃鱼', name: 'Nofish' },
  { value: 'Jennifer', label: '詹妮弗', name: 'Jennifer' },
  { value: 'Ryan', label: '甜茶', name: 'Ryan' },
  { value: 'Katerina', label: '卡捷琳娜', name: 'Katerina' },
  { value: 'Elias', label: '墨讲师', name: 'Elias' },
  { value: 'Jada', label: '上海-阿珍', name: 'Jada' },
  { value: 'Dylan', label: '北京-晓东', name: 'Dylan' },
  { value: 'Sunny', label: '四川-晴儿', name: 'Sunny' },
  { value: 'Li', label: '南京-老李', name: 'Li' },
  { value: 'Marcus', label: '陕西-秦川', name: 'Marcus' },
  { value: 'Roy', label: '闽南-阿杰', name: 'Roy' },
  { value: 'Peter', label: '天津-李彼得', name: 'Peter' },
  { value: 'Rocky', label: '粤语-阿强', name: 'Rocky' },
  { value: 'Kiki', label: '粤语-阿清', name: 'Kiki' },
  { value: 'Eric', label: '四川-程川', name: 'Eric' },

])

// 截图配置
const screenshotConfig = ref({
  captureInterval: 2000,
  maxScreenshots: 1,
  showPreview: true,
  imageQuality: 0.8
})

// 音频设备状态
const audioDevices = ref<AudioDevice[]>([])
const selectedAudioDeviceId = ref<string>('')
const isDeviceListLoading = ref(false)
const showDeviceSelector = ref(false)

const isSaving = computed(() => props.isSaving)
const currentProvider = computed(() => props.providers[providerId.value])
const isCustomProvider = computed(() => currentProvider.value?.isCustom)
const canSave = computed(() => {
  const hasApiKey = apiKeyInput.value.trim().length > 0
  const hasBaseUrl = isCustomProvider.value ? baseUrlInput.value.trim().length > 0 : true
  const hasModel = isCustomProvider.value ? modelInput.value.trim().length > 0 : true

  return hasApiKey && hasBaseUrl && hasModel && !isSaving.value
})

// 加载初始值
onMounted(() => {
  // 加载VAD阈值
  vadThreshold.value = audioStore.vadThreshold

  // 加载静音持续时间
  vadSilenceDuration.value = audioStore.vadSilenceDuration

  // 加载会话保存回合数
  const savedMaxHistoryRounds = localStorage.getItem('maxHistoryRounds')
  if (savedMaxHistoryRounds) {
    maxHistoryRounds.value = parseInt(savedMaxHistoryRounds, 10)
  } else {
    maxHistoryRounds.value = props.initialMaxHistoryRounds
  }

  // 加载音频设备
  loadAudioDevices()

  // 加载音频设备偏好
  const savedDeviceId = localStorage.getItem('preferredAudioDevice')
  if (savedDeviceId) {
    selectedAudioDeviceId.value = savedDeviceId
  }

  // 加载音色偏好
  const savedVoice = localStorage.getItem('preferredVoice')
  if (savedVoice) {
    selectedVoice.value = savedVoice
  } else {
    selectedVoice.value = props.initialVoice
  }

  // 加载截图配置
  loadScreenshotConfig()
})

watch(() => props.initialApiKey, (value) => {
  apiKeyInput.value = value ?? ''
})

watch(() => props.initialBaseUrl, (value) => {
  baseUrlInput.value = value ?? ''
})

watch(() => props.initialModel, (value) => {
  modelInput.value = value ?? ''
})

watch(() => props.initialSystemPrompt, (value) => {
  systemPromptInput.value = value ?? ''
})

watch(() => props.initialProviderId, (value) => {
  providerId.value = value ?? 'aliyun'
})

watch(() => props.initialVoice, (value) => {
  selectedVoice.value = value ?? 'Cherry'
})

watch(() => props.initialMaxHistoryRounds, (value) => {
  maxHistoryRounds.value = value ?? 5
})

// 监听供应商切换
watch(providerId, (newProviderId) => {
  const provider = props.providers[newProviderId]

  // 首先清空所有输入框
  baseUrlInput.value = ''
  modelInput.value = ''
  apiKeyInput.value = ''

  if (provider && !provider.isCustom) {
    // 预设供应商：从本地存储加载配置，如果没有则使用预设值
    const savedBaseUrl = localStorage.getItem(`baseUrl_${newProviderId}`)
    const savedModel = localStorage.getItem(`model_${newProviderId}`)
    const savedApiKey = localStorage.getItem(`apiKey_${newProviderId}`)

    // 优先使用保存的配置，否则使用预设值
    baseUrlInput.value = savedBaseUrl && savedBaseUrl.trim() ? savedBaseUrl : provider.baseUrl
    modelInput.value = savedModel && savedModel.trim() ? savedModel : provider.model

    if (savedApiKey && savedApiKey.trim()) {
      apiKeyInput.value = savedApiKey
    }
  } else if (provider && provider.isCustom) {
    // 自定义供应商：从本地存储加载自定义配置
    const savedBaseUrl = localStorage.getItem('llmBaseUrl')
    const savedModel = localStorage.getItem('llmModel')
    const savedApiKey = localStorage.getItem('apiKey_custom')

    // 只有在有保存数据时才填充
    if (savedBaseUrl && savedBaseUrl.trim()) {
      baseUrlInput.value = savedBaseUrl
    }

    if (savedModel && savedModel.trim()) {
      modelInput.value = savedModel
    }

    if (savedApiKey && savedApiKey.trim()) {
      apiKeyInput.value = savedApiKey
    }
  }
})

// 监听store中的VAD阈值变化
watch(() => audioStore.vadThreshold, (newValue) => {
  vadThreshold.value = newValue
})

// 监听store中的静音持续时间变化
watch(() => audioStore.vadSilenceDuration, (newValue) => {
  vadSilenceDuration.value = newValue
})

// 监听音色变化
watch(selectedVoice, (newVoice) => {
  if (newVoice) {
    localStorage.setItem('preferredVoice', newVoice)
    console.log('🎵 Voice preference saved:', newVoice)
  }
})

// 加载音频设备
const loadAudioDevices = async () => {
  try {
    isDeviceListLoading.value = true
    console.log('📱 Loading audio devices...')

    // 获取所有音频输入设备
    const audioManager = new AudioManager()
    await audioManager.initialize()
    const devices = await audioManager.getDevices()
    audioDevices.value = devices.filter((device: AudioDevice) => device.kind === 'audioinput')

    console.log('📱 Found audio devices:', audioDevices.value.map(d => ({ id: d.deviceId, label: d.label })))

    // 设置选中项：优先使用用户保存的偏好，然后是默认设备
    if (audioDevices.value.length > 0) {
      let targetDevice = null

      // 首先检查用户偏好的设备是否存在
      if (selectedAudioDeviceId.value) {
        targetDevice = audioDevices.value.find((device: AudioDevice) => device.deviceId === selectedAudioDeviceId.value)
        if (targetDevice) {
          console.log('📱 Using preferred device:', targetDevice.label)
        } else {
          console.log('📱 Preferred device not found, falling back to default')
        }
      }

      // 如果没有偏好设备或偏好设备不存在，选择默认设备
      if (!targetDevice) {
        targetDevice = audioDevices.value.find((device: AudioDevice) => device.isDefault)
        if (!targetDevice) {
          targetDevice = audioDevices.value[0]
        }
        selectedAudioDeviceId.value = targetDevice.deviceId
        console.log('📱 Using fallback device:', targetDevice.label)
      }
    }

    // 显示设备选择器
    showDeviceSelector.value = true

  } catch (error) {
    console.error('Failed to load audio devices:', error)
  } finally {
    isDeviceListLoading.value = false
  }
}

// 处理设备选择变更
const handleDeviceChange = async () => {
  if (!selectedAudioDeviceId.value) return

  console.log('📱 Device changed to:', selectedAudioDeviceId.value)

  // 保存用户偏好
  localStorage.setItem('preferredAudioDevice', selectedAudioDeviceId.value)
}

// 更新VAD阈值
const updateVadThreshold = () => {
  console.log('🔊 VAD threshold updated:', vadThreshold.value)
  // 更新store中的值
  audioStore.updateVadThreshold(vadThreshold.value)
}

// 更新静音持续时间
const updateVadSilenceDuration = () => {
  console.log('🔊 VAD silence duration updated:', vadSilenceDuration.value)
  // 更新store中的值
  audioStore.updateVadSilenceDuration(vadSilenceDuration.value)
}

// 更新会话保存回合数
const updateMaxHistoryRounds = () => {
  console.log('📁 Max history rounds updated:', maxHistoryRounds.value)
  // 保存到本地存储
  localStorage.setItem('maxHistoryRounds', maxHistoryRounds.value.toString())
}

// 加载截图配置
const loadScreenshotConfig = () => {
  try {
    const savedConfig = localStorage.getItem('screenshotConfig')
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig)
      screenshotConfig.value = { ...screenshotConfig.value, ...parsedConfig }
    }
  } catch (error) {
    console.warn('加载截图配置失败:', error)
  }
}

// 保存截图配置
const handleScreenshotSettingsSave = (config: any) => {
  try {
    screenshotConfig.value = config
    localStorage.setItem('screenshotConfig', JSON.stringify(config))
    console.log('截图配置已保存:', config)
  } catch (error) {
    console.error('保存截图配置失败:', error)
  }
}

// 恢复默认系统提示词
const restoreDefaultSystemPrompt = () => {
  systemPromptInput.value = DEFAULT_SYSTEM_PROMPT
  console.log('📝 System prompt restored to default')
}

// 清除API Key
const clearApiKey = () => {
  // 清除当前供应商的API Key
  const provider = props.providers[providerId.value]
  if (provider && !provider.isCustom) {
    localStorage.removeItem(`apiKey_${providerId.value}`)
  } else if (provider && provider.isCustom) {
    localStorage.removeItem('apiKey_custom')
  }

  // 清除输入框中的值
  apiKeyInput.value = ''

  console.log('🗑️ API Key cleared from local storage')
}

// 处理连接
const handleSave = () => {
  if (!canSave.value) return

  emit('save', {
    apiKey: apiKeyInput.value,
    baseUrl: baseUrlInput.value,
    model: modelInput.value,
    systemPrompt: systemPromptInput.value,
    providerId: providerId.value,
    voice: selectedVoice.value,
    maxHistoryRounds: maxHistoryRounds.value
  })
}
</script>

<style scoped>
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
  z-index: 1600;
}

.settings-panel {
  background: #1a1a2e;
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
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

.settings-content input,
.settings-content select,
.settings-content textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.05);
  color: #e0e0e0;
  box-sizing: border-box;
}

.settings-content input:focus,
.settings-content select:focus,
.settings-content textarea:focus {
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

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 麦克风选择下拉框样式 */
.audio-device-selector {
  position: relative;
}

.device-select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23e0e0e0' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 12px center;
  background-repeat: no-repeat;
  background-size: 16px;
  padding-right: 40px;
  cursor: pointer;
}

.device-select:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
}

.device-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* VAD阈值控制样式 */
.vad-threshold-control {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding-top: 4px;
}

.control-label {
  font-size: 14px;
  color: #e0e0e0;
  font-weight: 500;
  min-width: 70px;
}

.threshold-slider {
  flex-grow: 1;
  height: 6px;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
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

.settings-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.tab-button {
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.tab-button:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.35);
}

.tab-button.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: transparent;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.system-prompt-textarea {
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #e0e0e0;
  font-size: 14px;
  resize: vertical;
  min-height: 140px;
  font-family: inherit;
  line-height: 1.5;
}

.system-prompt-textarea:focus {
  outline: none;
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.1);
}

.system-prompt-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.system-prompt-actions .btn {
  width: auto;
  padding: 8px 16px;
  font-size: 13px;
}

.field-hint {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(224, 224, 224, 0.75);
  line-height: 1.4;
}

.form-actions {
  margin-top: 8px;
}

.threshold-value {
  font-size: 14px;
  color: #e0e0e0;
  font-weight: 500;
  min-width: 40px;
  text-align: center;
}

.api-key-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.api-key-actions .btn {
  width: auto;
  padding: 8px 16px;
  font-size: 13px;
}
</style>
