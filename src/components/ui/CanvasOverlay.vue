<template>
  <teleport to="body">
    <transition name="canvas-overlay-fade">
      <div
        v-if="isVisible"
        class="canvas-overlay"
        :style="overlayStyle"
        @pointerdown="startDrag"
      >
        <CoordinateCanvas @close="closeOverlay" />
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import CoordinateCanvas from './CoordinateCanvas.vue'
import { useCanvasStore } from '@/stores/canvas'

const canvasStore = useCanvasStore()
const { isOverlayVisible, overlayPosition } = storeToRefs(canvasStore)

const isVisible = isOverlayVisible

const dragOffset = ref({ x: 0, y: 0 })
const isDragging = ref(false)

const overlayStyle = computed(() => ({
  top: `${overlayPosition.value.top}px`,
  left: `${overlayPosition.value.left}px`
}))

const stopDragging = () => {
  if (!isDragging.value) return
  isDragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopDragging)
}

const clampPosition = (top: number, left: number) => {
  if (typeof window === 'undefined') {
    return { top, left }
  }

  const overlayWidth = 720
  const overlayHeight = 720
  const minOffset = 16

  const maxLeft = Math.max(minOffset, window.innerWidth - overlayWidth)
  const maxTop = Math.max(minOffset, window.innerHeight - overlayHeight)

  return {
    top: Math.min(Math.max(minOffset, top), maxTop),
    left: Math.min(Math.max(minOffset, left), maxLeft)
  }
}

const handlePointerMove = (event: PointerEvent) => {
  if (!isDragging.value) return

  const top = event.clientY - dragOffset.value.y
  const left = event.clientX - dragOffset.value.x
  const clamped = clampPosition(top, left)

  canvasStore.setOverlayPosition(clamped)
}

const startDrag = (event: PointerEvent) => {
  if (event.button !== 0) return
  const target = event.target as HTMLElement | null
  if (target && (target.closest('.canvas-close-btn') || target.closest('.canvas-coordinates-btn') || target.closest('.canvas-clear-btn'))) return
  event.preventDefault()

  const { top, left } = overlayPosition.value
  dragOffset.value = {
    x: event.clientX - left,
    y: event.clientY - top
  }

  isDragging.value = true
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopDragging)
}

const closeOverlay = () => {
  stopDragging()
  canvasStore.hideOverlay()
}

onBeforeUnmount(() => {
  stopDragging()
})

watch(isVisible, visible => {
  if (!visible) {
    stopDragging()
  }
})
</script>

<style scoped>
.canvas-overlay {
  position: fixed;
  z-index: 1200;
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  background: rgba(248, 250, 252, 0.95);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
  border: 1px solid rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(10px);
  padding: 0;
  cursor: grab;
}

.canvas-overlay:active {
  cursor: grabbing;
}

.canvas-overlay :deep(.coordinate-canvas) {
  margin: 0 auto;
}

.canvas-overlay-fade-enter-active,
.canvas-overlay-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.canvas-overlay-fade-enter-from,
.canvas-overlay-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
