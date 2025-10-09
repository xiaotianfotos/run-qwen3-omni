<template>
  <div class="audio-visualizer">
    <div class="visualizer-header">
      <h3>音频可视化</h3>
      <div class="volume-indicator">
        <div class="volume-bar" :style="{ width: volumePercentage + '%' }"></div>
        <span class="volume-text">{{ Math.round(audioStore.volumeLevel) }}%</span>
      </div>
    </div>

    <div class="visualizer-content">
      <canvas
        ref="canvasRef"
        class="visualizer-canvas"
        :width="canvasWidth"
        :height="canvasHeight"
      ></canvas>
    </div>

    <div class="visualizer-controls">
      <div class="control-group">
        <label>输入音量</label>
        <input
          type="range"
          v-model="inputVolume"
          min="0"
          max="1"
          step="0.1"
          @input="updateInputVolume"
        />
        <span>{{ Math.round(inputVolume * 100) }}%</span>
      </div>

      <div class="control-group">
        <label>输出音量</label>
        <input
          type="range"
          v-model="outputVolume"
          min="0"
          max="1"
          step="0.1"
          @input="updateOutputVolume"
        />
        <span>{{ Math.round(outputVolume * 100) }}%</span>
      </div>
    </div>

    <div class="audio-status">
      <div class="status-item">
        <span class="status-label">录制状态:</span>
        <span class="status-value" :class="audioStore.recordingState">
          {{ recordingStatusText }}
        </span>
      </div>
      <div class="status-item">
        <span class="status-label">录制时长:</span>
        <span class="status-value">{{ formatDuration(audioStore.recordingDuration) }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">缓冲区大小:</span>
        <span class="status-value">{{ formatFileSize(audioStore.recordingFileSize) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAudioStore } from '@/stores'

// 组件属性
const props = defineProps<{
  width?: number
  height?: number
}>()

// Store
const audioStore = useAudioStore()

// 响应式数据
const canvasRef = ref<HTMLCanvasElement | null>(null)
const animationId = ref<number | null>(null)
const inputVolume = ref(1.0)
const outputVolume = ref(1.0)

// 计算属性
const canvasWidth = computed(() => props.width || 400)
const canvasHeight = computed(() => props.height || 200)

const volumePercentage = computed(() => {
  const volume = audioStore.volumeLevel
  console.log('📊 AudioVisualizer volumePercentage:', volume)
  return Math.min(volume, 100) // 确保不超过100%
})

const recordingStatusText = computed(() => {
  switch (audioStore.recordingState) {
    case 'idle':
      return '空闲'
    case 'recording':
      return '录制中'
    case 'paused':
      return '已暂停'
    case 'stopped':
      return '已停止'
    default:
      return '未知'
  }
})

// 方法
const updateInputVolume = () => {
  audioStore.setInputVolume(inputVolume.value)
}

const updateOutputVolume = () => {
  audioStore.setOutputVolume(outputVolume.value)
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }
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

const drawVisualizer = () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas

  // 清空画布
  ctx.clearRect(0, 0, width, height)

  // 获取可视化数据
  const visualizationData = audioStore.visualizationData
  if (!visualizationData) return

  const { frequency, timeData, volume } = visualizationData

  // 绘制频谱
  if (frequency.length > 0) {
    const barWidth = width / frequency.length
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, '#2196f3')
    gradient.addColorStop(0.5, '#1976d2')
    gradient.addColorStop(1, '#0d47a1')

    ctx.fillStyle = gradient

    for (let i = 0; i < frequency.length; i++) {
      const barHeight = (frequency[i] / 255) * height
      const x = i * barWidth
      const y = height - barHeight

      ctx.fillRect(x, y, barWidth - 1, barHeight)
    }
  }

  // 绘制波形
  if (timeData.length > 0) {
    ctx.beginPath()
    ctx.strokeStyle = '#4caf50'
    ctx.lineWidth = 2

    for (let i = 0; i < timeData.length; i++) {
      const x = (i / timeData.length) * width
      const y = ((timeData[i] - 128) / 128) * (height / 2) + (height / 2)

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()
  }

  // 绘制音量指示器
  if (volume > 0) {
    const volumeHeight = volume * height
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, '#4caf50')
    gradient.addColorStop(0.7, '#ff9800')
    gradient.addColorStop(1, '#f44336')

    ctx.fillStyle = gradient
    ctx.fillRect(width - 20, height - volumeHeight, 20, volumeHeight)
  }

  // 继续动画
  animationId.value = requestAnimationFrame(drawVisualizer)
}

// 监听器
watch(() => audioStore.inputVolume, (newValue) => {
  inputVolume.value = newValue
})

watch(() => audioStore.outputVolume, (newValue) => {
  outputVolume.value = newValue
})

// 生命周期
onMounted(() => {
  // 初始化音量值
  inputVolume.value = audioStore.inputVolume
  outputVolume.value = audioStore.outputVolume

  // 开始绘制
  drawVisualizer()
})

onUnmounted(() => {
  if (animationId.value) {
    cancelAnimationFrame(animationId.value)
  }
})
</script>

<style scoped>
.audio-visualizer {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.visualizer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.visualizer-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.volume-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 200px;
}

.volume-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.volume-bar {
  height: 100%;
  background: linear-gradient(to right, #4caf50, #ff9800, #f44336);
  transition: width 0.3s;
}

.volume-text {
  font-size: 12px;
  font-weight: 500;
  color: #666;
  min-width: 45px;
}

.visualizer-content {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
}

.visualizer-canvas {
  border: 1px solid #eee;
  border-radius: 4px;
  background: #fafafa;
}

.visualizer-controls {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.control-group label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  min-width: 80px;
}

.control-group input[type="range"] {
  flex: 1;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #2196f3;
  border-radius: 50%;
  cursor: pointer;
}

.control-group input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #2196f3;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.control-group span {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  min-width: 40px;
}

.audio-status {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
}

.status-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.status-value.idle {
  color: #757575;
}

.status-value.recording {
  color: #4caf50;
}

.status-value.paused {
  color: #ff9800;
}

.status-value.stopped {
  color: #f44336;
}
</style>