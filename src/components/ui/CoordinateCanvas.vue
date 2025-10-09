<template>
  <div class="coordinate-canvas">
    <button class="canvas-close-btn" type="button" aria-label="关闭画布" @click="emit('close')">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M12.3 3.7a1 1 0 0 0-1.4-1.4L8 5.17 5.1 2.3a1 1 0 1 0-1.4 1.4L6.83 8l-3.12 3.9a1 1 0 0 0 1.46 1.36L8 10.83l2.9 3.87a1 1 0 0 0 1.46-1.36L9.17 8z" />
      </svg>
    </button>

    <button 
      class="canvas-coordinates-btn" 
      type="button" 
      :aria-label="showCoordinates ? '隐藏坐标' : '显示坐标'" 
      @click="store.toggleCoordinates()"
      :class="{ active: showCoordinates }"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9ZM3.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-9Z" />
        <path d="M8 4a.5.5 0 0 1 .5.5V7H11a.5.5 0 0 1 0 1H8.5V10.5a.5.5 0 0 1-1 0V8H5a.5.5 0 0 1 0-1h2.5V4.5A.5.5 0 0 1 8 4Z" />
      </svg>
    </button>

    <button 
      class="canvas-clear-btn" 
      type="button" 
      aria-label="清空画布" 
      @click="clearCanvas"
      :disabled="shapes.length === 0"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M3.5 2.5A1.5 1.5 0 0 1 5 1h6a1.5 1.5 0 0 1 1.5 1.5v1H14a.5.5 0 0 1 0 1h-.5v9A1.5 1.5 0 0 1 12 14.5H4A1.5 1.5 0 0 1 2.5 13V4H2a.5.5 0 0 1 0-1h1.5v-1ZM3.5 4v9a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V4h-9ZM5 2.5v1h6v-1a.5.5 0 0 0-.5-.5H5.5a.5.5 0 0 0-.5.5Z" />
      </svg>
    </button>

    <svg
      class="canvas-svg"
      viewBox="0 0 100 100"
      role="img"
      aria-label="100x100 的坐标画布"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="0" y="0" width="100" height="100" :fill="backgroundColor" rx="2" ry="2" />

      <g class="canvas-grid">
        <line
          v-for="grid in gridLines"
          :key="grid.id"
          :x1="grid.x1"
          :y1="grid.y1"
          :x2="grid.x2"
          :y2="grid.y2"
          :stroke="grid.type === 'major' ? '#d6deeb' : '#eaeef6'"
          :stroke-width="grid.type === 'major' ? 0.18 : 0.12"
        />
      </g>

      <g class="canvas-axes">
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke="#465066"
          stroke-width="0.25"
          stroke-dasharray="1.2 2.4"
        />
        <line
          x1="50"
          y1="0"
          x2="50"
          y2="100"
          stroke="#465066"
          stroke-width="0.25"
          stroke-dasharray="1.2 2.4"
        />
      </g>

      <g>
        <template v-for="rect in rectangles" :key="rect.id">
          <rect
            :x="rect.x"
            :y="rect.y"
            :width="rect.width"
            :height="rect.height"
            :fill="rect.fill"
            :fill-opacity="rect.opacity"
            :stroke="rect.fill"
            stroke-width="0.3"
            rx="1.2"
          />
          <!-- 显示矩形的左上角和右下角坐标 -->
          <text
            v-if="showCoordinates"
            :x="rect.x + 2"
            :y="rect.y + 3.5"
            font-size="2.2"
            font-family="monospace"
            fill="#1e293b"
            font-weight="600"
          >
            {{ rect.topLeftCoord }}
          </text>
          <text
            v-if="showCoordinates"
            :x="rect.x + rect.width - 18"
            :y="rect.y + rect.height - 1"
            font-size="2.2"
            font-family="monospace"
            fill="#1e293b"
            font-weight="600"
          >
            {{ rect.bottomRightCoord }}
          </text>
        </template>
      </g>

      <g>
        <template v-for="circle in circles" :key="circle.id">
          <circle
            :cx="circle.cx"
            :cy="circle.cy"
            :r="circle.r"
            :fill="circle.fill"
            :fill-opacity="circle.opacity"
            :stroke="circle.fill"
            stroke-width="0.3"
          />
          <!-- 显示圆心坐标 -->
          <text
            v-if="showCoordinates"
            :x="circle.cx"
            :y="circle.cy + 1"
            font-size="2.2"
            font-family="monospace"
            fill="#1e293b"
            font-weight="600"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ circle.centerCoord }}
          </text>
        </template>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasStore, type RectangleShape, type CircleShape } from '@/stores/canvas'

const emit = defineEmits<{ close: [] }>()

const store = useCanvasStore()

const shapes = computed(() => store.shapes)
const backgroundColor = computed(() => store.backgroundColor)
const showCoordinates = computed(() => store.showCoordinates)

const clearCanvas = () => {
  store.clearCanvas()
}

const CANVAS_OFFSET = 50

const toSvgX = (value: number) => value + CANVAS_OFFSET
const toSvgY = (value: number) => CANVAS_OFFSET - value

const rectangles = computed(() =>
  shapes.value
    .filter((shape): shape is RectangleShape => shape.type === 'rectangle')
    .map(shape => {
      const topLeft = { x: toSvgX(shape.topLeft.x), y: toSvgY(shape.topLeft.y) }
      const bottomRight = { x: toSvgX(shape.bottomRight.x), y: toSvgY(shape.bottomRight.y) }
      const width = Math.max(0, bottomRight.x - topLeft.x)
      const height = Math.max(0, bottomRight.y - topLeft.y)

      return {
        id: shape.id,
        x: topLeft.x,
        y: topLeft.y,
        width,
        height,
        fill: shape.color,
        opacity: shape.opacity ?? 1.0,
        topLeftCoord: `(${shape.topLeft.x},${shape.topLeft.y})`,
        bottomRightCoord: `(${shape.bottomRight.x},${shape.bottomRight.y})`
      }
    })
)

const circles = computed(() =>
  shapes.value
    .filter((shape): shape is CircleShape => shape.type === 'circle')
    .map(shape => {
      const centerSvg = { x: toSvgX(shape.center.x), y: toSvgY(shape.center.y) }
      return {
        id: shape.id,
        cx: centerSvg.x,
        cy: centerSvg.y,
        r: shape.radius,
        fill: shape.color,
        opacity: shape.opacity ?? 1.0,
        centerCoord: `(${shape.center.x},${shape.center.y})`
      }
    })
)

const gridLines = computed(() => {
  const lines: Array<{
    id: string
    x1: number
    y1: number
    x2: number
    y2: number
    type: 'major' | 'minor'
  }> = []

  for (let i = -40; i <= 40; i += 10) {
    const svgX = toSvgX(i)
    const svgY = toSvgY(i)
    lines.push({ id: `v-major-${i}`, x1: svgX, y1: 0, x2: svgX, y2: 100, type: 'major' })
    lines.push({ id: `h-major-${i}`, x1: 0, y1: svgY, x2: 100, y2: svgY, type: 'major' })

    if (i === 40) continue

    const nextSvgX = toSvgX(i + 5)
    const nextSvgY = toSvgY(i + 5)
    lines.push({ id: `v-minor-${i}`, x1: nextSvgX, y1: 0, x2: nextSvgX, y2: 100, type: 'minor' })
    lines.push({ id: `h-minor-${i}`, x1: 0, y1: nextSvgY, x2: 100, y2: nextSvgY, type: 'minor' })
  }

  return lines
})
</script>

<style scoped>
.coordinate-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 20px;
  overflow: hidden;
}

.canvas-close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: rgba(15, 23, 42, 0.55);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: background 0.2s ease, transform 0.2s ease;
}

.canvas-close-btn:hover {
  background: rgba(79, 70, 229, 0.85);
  transform: translateY(-1px);
}

.canvas-coordinates-btn {
  position: absolute;
  top: 10px;
  right: 40px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: rgba(15, 23, 42, 0.55);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: background 0.2s ease, transform 0.2s ease;
}

.canvas-coordinates-btn:hover {
  background: rgba(79, 70, 229, 0.85);
  transform: translateY(-1px);
}

.canvas-coordinates-btn.active {
  background: rgba(34, 197, 94, 0.85);
}

.canvas-coordinates-btn.active:hover {
  background: rgba(34, 197, 94, 0.95);
}

.canvas-clear-btn {
  position: absolute;
  top: 10px;
  right: 70px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: rgba(15, 23, 42, 0.55);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: background 0.2s ease, transform 0.2s ease;
}

.canvas-clear-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.85);
  transform: translateY(-1px);
}

.canvas-clear-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.canvas-svg {
  width: 100%;
  height: 100%;
  display: block;
  background: #f8fafc;
}

.canvas-grid line {
  shape-rendering: geometricPrecision;
}

.coordinate-canvas::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 20px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12);
  pointer-events: none;
}
</style>
