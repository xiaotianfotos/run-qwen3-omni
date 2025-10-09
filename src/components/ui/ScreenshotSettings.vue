<template>
  <div class="screenshot-settings">
    <div class="settings-header">
      <h3>📸 截图设置</h3>
      <p class="settings-description">配置屏幕截图参数</p>
    </div>

    <div class="settings-content">
      <!-- 截图间隔设置 -->
      <div class="form-group">
        <label for="capture-interval">
          <span class="label-text">截图间隔</span>
          <span class="label-description">设置截图的时间间隔</span>
        </label>
        <div class="input-with-unit">
          <input
            id="capture-interval"
            v-model.number="localConfig.captureInterval"
            type="number"
            min="500"
            max="10000"
            step="500"
            @change="validateInterval"
          >
          <span class="unit">毫秒</span>
        </div>
        <div class="hint">
          当前间隔：{{ formatInterval(localConfig.captureInterval) }}
        </div>
      </div>

      <!-- 截图数量设置 -->
      <div class="form-group">
        <label for="max-screenshots">
          <span class="label-text">截图数量</span>
          <span class="label-description">每次发送时发送的截图数量</span>
        </label>
        <div class="input-with-unit">
          <input
            id="max-screenshots"
            v-model.number="localConfig.maxScreenshots"
            type="number"
            min="1"
            max="10"
            step="1"
            @change="validateScreenshotCount"
          >
          <span class="unit">张</span>
        </div>
        <div class="hint">
          发送时包含最近 {{ localConfig.maxScreenshots }} 张截图
        </div>
      </div>

      <!-- 预览设置 -->
      <div class="form-group">
        <label>
          <span class="label-text">实时预览</span>
          <span class="label-description">显示截图预览面板</span>
        </label>
        <div class="toggle-switch">
          <input
            id="show-preview"
            v-model="localConfig.showPreview"
            type="checkbox"
          >
          <label for="show-preview" class="toggle-label">
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
            <span class="toggle-text">
              {{ localConfig.showPreview ? '开启' : '关闭' }}
            </span>
          </label>
        </div>
      </div>

      <!-- 截图质量设置 -->
      <div class="form-group">
        <label for="image-quality">
          <span class="label-text">截图质量</span>
          <span class="label-description">设置JPEG压缩质量</span>
        </label>
        <div class="slider-container">
          <input
            id="image-quality"
            v-model.number="localConfig.imageQuality"
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            class="quality-slider"
          >
          <div class="slider-labels">
            <span>低</span>
            <span>中</span>
            <span>高</span>
          </div>
          <div class="quality-value">
            {{ Math.round(localConfig.imageQuality * 100) }}%
          </div>
        </div>
      </div>

      <!-- 状态信息 -->
      <div class="status-info">
        <div class="status-item">
          <span class="status-label">当前配置：</span>
          <span class="status-value">
            每 {{ formatInterval(localConfig.captureInterval) }} 截图一次
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">发送数量：</span>
          <span class="status-value">
            每次发送 {{ localConfig.maxScreenshots }} 张截图
          </span>
        </div>
      </div>
    </div>

    <div class="settings-actions">
      <button
        class="btn btn-secondary"
        @click="resetToDefaults"
      >
        恢复默认
      </button>
      <button
        class="btn btn-primary"
        @click="saveSettings"
        :disabled="!hasChanges"
      >
        保存设置
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface ScreenshotConfig {
  captureInterval: number
  maxScreenshots: number
  showPreview: boolean
  imageQuality: number
}

interface Props {
  config: ScreenshotConfig
}

interface Emits {
  (e: 'update:config', config: ScreenshotConfig): void
  (e: 'save', config: ScreenshotConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 默认配置
const DEFAULT_CONFIG: ScreenshotConfig = {
  captureInterval: 2000,
  maxScreenshots: 1,
  showPreview: true,
  imageQuality: 0.8
}

// 本地配置副本
const localConfig = ref<ScreenshotConfig>({ ...props.config })

// 检查是否有更改
const hasChanges = computed(() => {
  return JSON.stringify(localConfig.value) !== JSON.stringify(props.config)
})

// 格式化间隔时间为可读格式
const formatInterval = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}毫秒`
  } else {
    return `${(ms / 1000).toFixed(1)}秒`
  }
}

// 验证间隔时间
const validateInterval = () => {
  if (localConfig.value.captureInterval < 500) {
    localConfig.value.captureInterval = 500
  } else if (localConfig.value.captureInterval > 10000) {
    localConfig.value.captureInterval = 10000
  }
}

// 验证截图数量
const validateScreenshotCount = () => {
  if (localConfig.value.maxScreenshots < 1) {
    localConfig.value.maxScreenshots = 1
  } else if (localConfig.value.maxScreenshots > 10) {
    localConfig.value.maxScreenshots = 10
  }
}

// 重置为默认值
const resetToDefaults = () => {
  localConfig.value = { ...DEFAULT_CONFIG }
}

// 保存设置
const saveSettings = () => {
  emit('save', localConfig.value)
}

// 监听props变化
watch(
  () => props.config,
  (newConfig) => {
    localConfig.value = { ...newConfig }
  },
  { deep: true }
)
</script>

<style scoped>
.screenshot-settings {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-header {
  margin-bottom: 24px;
}

.settings-header h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #e0e0e0;
}

.settings-description {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.settings-content {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
}

.label-text {
  display: block;
  font-weight: 500;
  color: #e0e0e0;
  margin-bottom: 4px;
}

.label-description {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-unit input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
  font-size: 14px;
}

.input-with-unit input:focus {
  outline: none;
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.15);
}

.unit {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  min-width: 30px;
}

.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}

/* 开关样式 */
.toggle-switch {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-track {
  position: relative;
  width: 44px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  transition: all 0.3s ease;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: #e0e0e0;
  border-radius: 50%;
  transition: all 0.3s ease;
}

input[type="checkbox"] {
  display: none;
}

input[type="checkbox"]:checked + .toggle-label .toggle-track {
  background: #667eea;
}

input[type="checkbox"]:checked + .toggle-label .toggle-thumb {
  left: 22px;
  background: white;
}

.toggle-text {
  font-size: 14px;
  color: #e0e0e0;
}

/* 滑块样式 */
.slider-container {
  margin-top: 8px;
}

.quality-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  outline: none;
  -webkit-appearance: none;
}

.quality-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.quality-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.quality-value {
  text-align: center;
  margin-top: 4px;
  font-size: 12px;
  color: #e0e0e0;
  font-weight: 500;
}

/* 状态信息 */
.status-info {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
  margin-top: 16px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.status-item:last-child {
  margin-bottom: 0;
}

.status-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.status-value {
  font-size: 12px;
  color: #e0e0e0;
  font-weight: 500;
}

/* 操作按钮 */
.settings-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5a67d8;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}
</style>