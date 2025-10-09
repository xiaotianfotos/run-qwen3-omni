<template>
  <div v-if="show" class="permission-modal-overlay">
    <div class="permission-modal">
      <div class="permission-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div class="permission-content">
        <div class="permission-icon">
          <svg v-if="type === 'microphone'" width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
          <svg v-else-if="type === 'screen'" width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
            <path d="M6 8h12v2H6zm0 4h12v2H6zm0 4h6v2H6z"/>
          </svg>
        </div>

        <div class="permission-description">
          <p>{{ description }}</p>
          <div v-if="showHint" class="permission-hint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <span>{{ hint }}</span>
          </div>
        </div>
      </div>

      <div class="permission-actions">
        <button
          class="btn btn-secondary"
          @click="$emit('cancel')"
        >
          {{ cancelButtonText }}
        </button>
        <button
          class="btn btn-primary"
          @click="$emit('confirm')"
          :disabled="loading"
        >
          {{ loading ? '请求中...' : confirmButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  show: boolean
  type: 'microphone' | 'screen'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

defineEmits<{
  close: []
  cancel: []
  confirm: []
}>()

const title = computed(() => {
  return props.type === 'microphone' ? '麦克风权限' : '屏幕捕获权限'
})

const description = computed(() => {
  return props.type === 'microphone'
    ? '需要访问您的麦克风来录制语音。请在浏览器弹出的权限请求中点击"允许"。'
    : '需要捕获您的屏幕内容来共享显示。请在浏览器弹出的权限请求中选择要共享的屏幕或窗口。'
})

const hint = computed(() => {
  return props.type === 'microphone'
    ? '如果浏览器没有弹出权限请求，请检查地址栏左侧的权限图标。'
    : '如果浏览器没有弹出选择框，请检查地址栏左侧的权限图标。'
})

const cancelButtonText = computed(() => {
  return props.type === 'microphone' ? '取消' : '不共享'
})

const confirmButtonText = computed(() => {
  return props.type === 'microphone' ? '允许' : '共享屏幕'
})

const showHint = computed(() => {
  return props.type === 'microphone' || props.type === 'screen'
})
</script>

<style scoped>
.permission-modal-overlay {
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

.permission-modal {
  background: #1a1a2e;
  border-radius: 16px;
  padding: 32px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.permission-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.permission-header h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #e0e0e0;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  padding: 8px;
  width: 36px;
  height: 36px;
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

.permission-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-bottom: 32px;
}

.permission-icon {
  color: #667eea;
  opacity: 0.9;
  filter: drop-shadow(0 0 20px rgba(102, 126, 234, 0.3));
}

.permission-description {
  text-align: center;
  color: #e0e0e0;
  font-size: 16px;
  line-height: 1.6;
}

.permission-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #888;
  font-size: 14px;
  margin-top: 12px;
  padding: 12px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 8px;
  border-left: 3px solid #667eea;
}

.permission-hint svg {
  color: #667eea;
  flex-shrink: 0;
}

.permission-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  min-width: 100px;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
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
</style>