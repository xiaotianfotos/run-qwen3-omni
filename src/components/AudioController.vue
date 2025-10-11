<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useAudioStore } from '@/stores'
import { AudioManager } from '@/modules/audio'
import type { AudioDevice } from '@/types/audio'

const props = defineProps<{
  apiKey: string
}>()

const emit = defineEmits<{
  error: [title: string, message: string]
  processingStart: []
  processingEnd: []
}>()

// Store
const audioStore = useAudioStore()

// 服务实例
const audioManager = ref<AudioManager | undefined>(undefined)

// 状态
const hasPermission = ref(false)
const isProcessing = ref(false)
const currentVolume = ref(0)
const isVoiceActive = ref(false)

// 计算属性
const isInCall = computed(() => audioStore.recordingState === 'recording')

// 错误处理方法
const showError = (title: string, message: string) => {
  emit('error', title, message)
}

// 初始化音频管理器
const initializeAudioManager = async () => {
  if (audioManager.value) return

  audioManager.value = new AudioManager()
  await audioManager.value.initialize()

  // 应用初始VAD配置
  audioManager.value.updateVadConfig({
    threshold: audioStore.vadThreshold,
    silenceDuration: audioStore.vadSilenceDuration
  })

  // 设置音频管理器事件监听
  audioManager.value.on('permissionDenied', (error: any) => {
    console.error('Audio permission denied:', error)
    audioStore.setPermissionDenied(true)
    hasPermission.value = false
    showError('麦克风权限被拒绝', '请在浏览器设置中允许麦克风访问权限')
  })

  audioManager.value.on('visualizationData', (data: any) => {
    audioStore.setVisualizationData(data)
    // 实时更新音量显示
    currentVolume.value = data.volume || 0
  })

  audioManager.value.on('audioData', (data: any) => {
    // 暂时存储音频数据，在voiceStopped时发送
  })

  // 监听VAD语音开始和结束事件
  audioManager.value.on('voiceStarted', () => {
    audioStore.setVoiceActive(true)
    isVoiceActive.value = true
  })

  audioManager.value.on('voiceStopped', async () => {
    audioStore.setVoiceActive(false)
    isVoiceActive.value = false
    
    // 检查是否正在处理AI响应，如果是则不处理新的语音输入
    if (isProcessing.value) {
      console.log('AI is processing, ignoring new voice input')
      return
    }
    
    try {
      emit('processingStart')
      isProcessing.value = true
      // 这里应该调用AI服务来处理音频数据
      // 在实际实现中，会将音频数据发送给AI服务
    } catch (error) {
      console.error('Error processing voice input:', error)
      showError('处理语音输入时出错', error instanceof Error ? error.message : '未知错误')
    } finally {
      isProcessing.value = false
      emit('processingEnd')
    }
  })

  audioManager.value.on('recordingStarted', () => {
    audioStore.startRecording()
    // 录音开始后，标记权限已获得
    hasPermission.value = true
  })

  audioManager.value.on('recordingStopped', () => {
    audioStore.stopRecording()
  })

  audioManager.value.on('recordingPaused', () => {
    audioStore.pauseRecording()
  })

  audioManager.value.on('recordingResumed', () => {
    audioStore.resumeRecording()
  })
}

// 监听VAD配置变化并应用到AudioManager
watch([
  () => audioStore.vadThreshold,
  () => audioStore.vadSilenceDuration
], ([threshold, silenceDuration]) => {
  if (audioManager.value) {
    audioManager.value.updateVadConfig({
      threshold,
      silenceDuration
    })
    console.log('🔊 VAD配置已更新:', { threshold, silenceDuration })
  }
})

// 开始录音
const startRecording = async () => {
  if (!audioManager.value) {
    await initializeAudioManager()
  }

  try {
    console.log('🎤 Requesting microphone permissions...')
    await audioManager.value!.startRecording()
  } catch (error) {
    console.error('Failed to start recording:', error)
    showError('启动录音失败', error instanceof Error ? error.message : '未知错误')
  }
}

// 停止录音
const stopRecording = () => {
  if (audioManager.value) {
    audioManager.value.stopRecording()
  }
}

// 暴露方法给父组件
defineExpose({
  startRecording,
  stopRecording,
  isInCall,
  currentVolume,
  isVoiceActive,
  isProcessing,
  hasPermission
})

// 生命周期
onUnmounted(() => {
  if (audioManager.value) {
    audioManager.value.stopRecording()
    audioManager.value.dispose()
  }
})
</script>

<template>
  <div class="audio-controller">
    <div 
      v-if="isInCall" 
      class="voice-visualizer"
      :class="{ 'voice-active': isVoiceActive }"
    >
      <div class="visualizer-bars">
        <div 
          v-for="n in 20" 
          :key="n" 
          class="bar"
          :style="{ height: `${Math.random() * currentVolume + 5}%` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-controller {
  position: relative;
}

.voice-visualizer {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
}

.voice-visualizer.voice-active {
  opacity: 0.8;
}

.visualizer-bars {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  height: 100px;
}

.bar {
  width: 4px;
  background: linear-gradient(to top, #667eea 0%, #764ba2 100%);
  border-radius: 2px;
  transition: height 0.1s ease;
  min-height: 5px;
}
</style>