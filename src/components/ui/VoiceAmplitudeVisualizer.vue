<template>
  <div class="voice-amplitude-visualizer">
    <!-- 中心动画图标 -->
    <div class="center-icon">
      <div class="icon-container" :class="{ 'active': isRecording, 'speaking': isSpeaking }">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>

        <!-- 音波动画环 -->
        <div v-if="isRecording" class="wave-rings">
          <div
            v-for="i in 3"
            :key="i"
            class="wave-ring"
            :class="{ 'active': volumeLevel > 10 }"
            :style="{
              animationDelay: `${(i - 1) * 0.5}s`,
              transform: `scale(${1 + volumeLevel * 0.003})`,
              opacity: 0.6 - (volumeLevel * 0.004)
            }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 音量条 -->
    <div class="volume-bars">
      <div
        v-for="i in 12"
        :key="i"
        class="volume-bar"
        :style="{
          height: `${Math.max(5, volumeLevel * (1 - Math.abs(i - 6.5) / 6.5))}%`,
          background: getBarColor(volumeLevel * (1 - Math.abs(i - 6.5) / 6.5) / 100)
        }"
      ></div>
    </div>

    <!-- 状态指示器 -->
    <div class="status-indicator">
      <div class="status-dot" :class="{ 'active': isRecording }"></div>
      <span class="status-text">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAudioStore } from '@/stores'

interface Props {
  isRecording?: boolean
  volumeLevel?: number
}

const props = withDefaults(defineProps<Props>(), {
  isRecording: false,
  volumeLevel: 0
})

// Debug logging
console.log('VoiceAmplitudeVisualizer props:', props.isRecording, props.volumeLevel)

const audioStore = useAudioStore()

// Watch for volume level changes
watch(() => props.volumeLevel, (newLevel) => {
  console.log('Volume level changed:', newLevel)
}, { immediate: true })

const isSpeaking = computed(() => props.volumeLevel > 10)

const statusText = computed(() => {
  if (!props.isRecording) return '准备中'
  if (props.volumeLevel > 50) return '正在说话'
  if (props.volumeLevel > 10) return '检测到声音'
  return '正在聆听'
})

const getBarColor = (intensity: number) => {
  if (intensity > 0.7) {
    return `linear-gradient(to top, #f44336, #ff9800)`
  } else if (intensity > 0.4) {
    return `linear-gradient(to top, #ff9800, #ffeb3b)`
  } else if (intensity > 0.1) {
    return `linear-gradient(to top, #4caf50, #8bc34a)`
  } else {
    return `linear-gradient(to top, #2196f3, #64b5f6)`
  }
}
</script>

<style scoped>
.voice-amplitude-visualizer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 32px;
  background: rgba(26, 26, 46, 0.8);
  border-radius: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(102, 126, 234, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.center-icon {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.icon-container {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  background: rgba(102, 126, 234, 0.1);
  transition: all 0.3s ease;
}

.icon-container.active {
  background: rgba(102, 126, 234, 0.2);
  box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
}

.icon-container.speaking {
  background: rgba(76, 175, 80, 0.2);
  box-shadow: 0 0 30px rgba(76, 175, 80, 0.4);
}

.icon-container svg {
  color: #667eea;
  transition: all 0.3s ease;
}

.icon-container.active svg {
  color: #764ba2;
}

.icon-container.speaking svg {
  color: #4caf50;
}

.wave-rings {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.wave-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border: 2px solid #667eea;
  border-radius: 50%;
  opacity: 0;
  animation: wave-pulse 2s ease-out infinite;
}

.wave-ring.active {
  border-color: #4caf50;
}

@keyframes wave-pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.8;
  }
  100% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
}

.volume-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 60px;
  width: 180px;
}

.volume-bar {
  flex: 1;
  background: linear-gradient(to top, #2196f3, #64b5f6);
  border-radius: 2px;
  min-height: 3px;
  transition: height 0.1s ease, background 0.3s ease;
  box-shadow: 0 0 8px rgba(33, 150, 243, 0.3);
}

.volume-bar:hover {
  transform: scaleY(1.1);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
  transition: all 0.3s ease;
}

.status-dot.active {
  background: #4caf50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
}

.status-text {
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 500;
  min-width: 80px;
  text-align: center;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .voice-amplitude-visualizer {
    padding: 24px;
    gap: 16px;
  }

  .icon-container {
    width: 60px;
    height: 60px;
  }

  .volume-bars {
    height: 40px;
    width: 120px;
  }
}
</style>