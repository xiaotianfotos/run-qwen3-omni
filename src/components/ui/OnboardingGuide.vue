<template>
  <div v-if="show" class="onboarding-overlay">
    <div class="onboarding-container">
      <div class="onboarding-header">
        <h3>欢迎使用 RunOmni</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div class="onboarding-content">
        <div class="step-indicator">
          <div
            v-for="step in steps"
            :key="step.id"
            class="step-dot"
            :class="{ 'active': currentStep === step.id, 'completed': currentStep > step.id }"
          ></div>
        </div>

        <div class="step-content">
          <div class="step-icon">
            <svg v-if="currentStep === 1" width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            <svg v-else-if="currentStep === 2" width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
              <path d="M6 8h12v2H6zm0 4h12v2H6zm0 4h6v2H6z"/>
            </svg>
            <svg v-else-if="currentStep === 3" width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
          </div>

          <h4>{{ currentStepData.title }}</h4>
          <p>{{ currentStepData.description }}</p>

          <div v-if="currentStepData.tips" class="step-tips">
            <div
              v-for="(tip, index) in currentStepData.tips"
              :key="index"
              class="tip-item"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span>{{ tip }}</span>
            </div>
          </div>
        </div>

        <div class="onboarding-actions">
          <button
            v-if="currentStep > 1"
            class="btn btn-secondary"
            @click="previousStep"
          >
            上一步
          </button>
          <button
            v-if="currentStep < steps.length"
            class="btn btn-primary"
            @click="nextStep"
          >
            下一步
          </button>
          <button
            v-else
            class="btn btn-primary"
            @click="$emit('complete')"
          >
            开始使用
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  show: boolean
}

const props = defineProps<Props>()

defineEmits<{
  close: []
  complete: []
}>()

const currentStep = ref(1)

const steps = [
  {
    id: 1,
    icon: 'MicrophoneIcon',
    title: '麦克风权限',
    description: 'RunOmni 需要访问您的麦克风来录制语音。',
    tips: [
      '请在浏览器弹出的权限请求中点击"允许"',
      '如果浏览器没有弹出权限请求，请检查地址栏左侧的权限图标',
      '建议使用 Chrome、Firefox 或 Edge 浏览器'
    ]
  },
  {
    id: 2,
    icon: 'ScreenIcon',
    title: '屏幕捕获权限',
    description: 'RunOmni 需要捕获您的屏幕内容来共享显示。',
    tips: [
      '请在浏览器弹出的选择框中选择要共享的屏幕或窗口',
      '您可以选择整个屏幕、特定窗口或浏览器标签页',
      '捕获过程中可以随时停止共享'
    ]
  },
  {
    id: 3,
    icon: 'CallIcon',
    title: '开始通话',
    description: '一切准备就绪，现在可以开始使用 RunOmni 了！',
    tips: [
      '点击底部的麦克风按钮开始通话',
      '通话过程中可以看到实时的语音波形',
      '通话过程中可以随时暂停或结束'
    ]
  }
]

const currentStepData = computed(() => {
  return steps.find(step => step.id === currentStep.value) || steps[0]
})

const nextStep = () => {
  if (currentStep.value < steps.length) {
    currentStep.value++
  }
}

const previousStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}
</script>

<style scoped>
.onboarding-overlay {
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

.onboarding-container {
  background: #1a1a2e;
  border-radius: 20px;
  padding: 40px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(102, 126, 234, 0.3);
}

.onboarding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.onboarding-header h3 {
  margin: 0;
  font-size: 28px;
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

.onboarding-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.step-indicator {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.step-dot.active {
  background: #667eea;
  box-shadow: 0 0 8px rgba(102, 126, 234, 0.5);
}

.step-dot.completed {
  background: #4caf50;
}

.step-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  text-align: center;
}

.step-icon {
  color: #667eea;
  opacity: 0.9;
  filter: drop-shadow(0 0 20px rgba(102, 126, 234, 0.3));
}

.step-content h4 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #e0e0e0;
}

.step-content p {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: #ccc;
  max-width: 400px;
}

.step-tips {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 400px;
}

.tip-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 8px;
  border-left: 3px solid #667eea;
  text-align: left;
}

.tip-item svg {
  color: #667eea;
  flex-shrink: 0;
  margin-top: 2px;
}

.tip-item span {
  color: #e0e0e0;
  font-size: 14px;
  line-height: 1.5;
}

.onboarding-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.onboarding-actions .btn {
  min-width: 120px;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .onboarding-container {
    margin: 20px;
    padding: 24px;
  }

  .onboarding-header h3 {
    font-size: 24px;
  }

  .step-content h4 {
    font-size: 20px;
  }

  .step-content p {
    font-size: 14px;
  }

  .tip-item {
    padding: 12px;
  }

  .tip-item span {
    font-size: 13px;
  }

  .onboarding-actions {
    flex-direction: column;
    gap: 8px;
  }

  .onboarding-actions .btn {
    width: 100%;
  }
}
</style>