import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type CanvasPoint = {
  x: number
  y: number
}

export type CanvasShape = RectangleShape | CircleShape

export interface RectangleShape {
  id: string
  type: 'rectangle'
  topLeft: CanvasPoint
  bottomRight: CanvasPoint
  color: string
  opacity?: number
}

export interface CircleShape {
  id: string
  type: 'circle'
  center: CanvasPoint
  radius: number
  color: string
  opacity?: number
}

export interface CanvasSnapshot {
  backgroundColor: string
  shapes: Array<{
    id: string
    type: CanvasShape['type']
    color: string
    opacity?: number
    topLeft?: CanvasPoint
    bottomRight?: CanvasPoint
    center?: CanvasPoint
    radius?: number
  }>
}

const CANVAS_MIN = -50
const CANVAS_MAX = 50

const DEFAULT_RECT_COLOR = '#2563eb'
const DEFAULT_CIRCLE_COLOR = '#dc2626'
const DEFAULT_BACKGROUND = '#ffffff'

interface OverlayPosition {
  top: number
  left: number
}

function ensureNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${name} 必须是一个有效的数字`)
  }
  return value
}

function ensureWithinBounds(point: CanvasPoint, label: string): void {
  if (point.x < CANVAS_MIN || point.x > CANVAS_MAX || point.y < CANVAS_MIN || point.y > CANVAS_MAX) {
    throw new Error(`${label} 坐标 (${point.x}, ${point.y}) 超出了画布范围（${CANVAS_MIN} 到 ${CANVAS_MAX}）`)
  }
}

function createShapeId(prefix: string): string {
  const randomNumber = Math.floor(Math.random() * 1000)
  return `${prefix}_${randomNumber}`
}

// 本地存储工具函数
const safeLocalStorage = (() => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch (error) {
    console.warn('本地存储不可用:', error)
    return null
  }
})()

const getStoredPosition = (): OverlayPosition | null => {
  try {
    const stored = safeLocalStorage?.getItem('canvasOverlayPosition')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed.top === 'number' && typeof parsed.left === 'number') {
        return { top: parsed.top, left: parsed.left }
      }
    }
  } catch (error) {
    console.warn('读取Canvas位置失败:', error)
  }
  return null
}

const storePosition = (position: OverlayPosition) => {
  try {
    safeLocalStorage?.setItem('canvasOverlayPosition', JSON.stringify(position))
  } catch (error) {
    console.warn('保存Canvas位置失败:', error)
  }
}

export const useCanvasStore = defineStore('coordinateCanvas', () => {
  const backgroundColor = ref<string>(DEFAULT_BACKGROUND)
  const shapes = ref<CanvasShape[]>([])
  const overlayVisible = ref(false)

  // 从本地存储加载位置，如果没有则使用默认右侧位置
  const defaultPosition = (() => {
    const stored = getStoredPosition()
    if (stored) return stored

    // 默认位置：屏幕右侧
    if (typeof window !== 'undefined') {
      const canvasWidth = 720
      const margin = 96
      return {
        top: 96,
        left: Math.max(margin, window.innerWidth - canvasWidth - margin)
      }
    }
    return { top: 96, left: 96 }
  })()

  const overlayPosition = ref<OverlayPosition>(defaultPosition)
  const showCoordinates = ref(false)

  const shapeCount = computed(() => shapes.value.length)

  const getSnapshot = (): CanvasSnapshot => ({
    backgroundColor: backgroundColor.value,
    shapes: shapes.value.map(shape => {
      if (shape.type === 'rectangle') {
        return {
          id: shape.id,
          type: shape.type,
          color: shape.color,
          opacity: shape.opacity,
          topLeft: { ...shape.topLeft },
          bottomRight: { ...shape.bottomRight }
        }
      }

      return {
        id: shape.id,
        type: shape.type,
        color: shape.color,
        opacity: shape.opacity,
        center: { ...shape.center },
        radius: shape.radius
      }
    })
  })

  const addRectangle = (args: {
    topLeft: CanvasPoint
    bottomRight: CanvasPoint
    color?: string
    opacity?: number
  }): RectangleShape => {
    const topLeft = {
      x: ensureNumber(args.topLeft?.x, 'topLeft.x'),
      y: ensureNumber(args.topLeft?.y, 'topLeft.y')
    }
    const bottomRight = {
      x: ensureNumber(args.bottomRight?.x, 'bottomRight.x'),
      y: ensureNumber(args.bottomRight?.y, 'bottomRight.y')
    }

    if (topLeft.x >= bottomRight.x || topLeft.y <= bottomRight.y) {
      throw new Error('矩形坐标无效：需要 topLeft.x < bottomRight.x 且 topLeft.y > bottomRight.y')
    }

    ensureWithinBounds(topLeft, '左上角')
    ensureWithinBounds(bottomRight, '右下角')

    const rectangle: RectangleShape = {
      id: createShapeId('rect'),
      type: 'rectangle',
      topLeft,
      bottomRight,
      color: args.color || DEFAULT_RECT_COLOR,
      opacity: args.opacity
    }

    shapes.value = [...shapes.value, rectangle]
    return rectangle
  }

  const addCircle = (args: { center: CanvasPoint; radius: number; color?: string; opacity?: number }): CircleShape => {
    const center = {
      x: ensureNumber(args.center?.x, 'center.x'),
      y: ensureNumber(args.center?.y, 'center.y')
    }
    const radius = ensureNumber(args.radius, 'radius')

    if (radius <= 0) {
      throw new Error('圆形半径必须大于 0')
    }

    ensureWithinBounds(center, '圆心')

    if (center.x - radius < CANVAS_MIN || center.x + radius > CANVAS_MAX || center.y - radius < CANVAS_MIN || center.y + radius > CANVAS_MAX) {
      throw new Error('圆形超出了画布边界，请调整中心坐标或半径')
    }

    const circle: CircleShape = {
      id: createShapeId('circle'),
      type: 'circle',
      center,
      radius,
      color: args.color || DEFAULT_CIRCLE_COLOR,
      opacity: args.opacity
    }

    shapes.value = [...shapes.value, circle]
    return circle
  }

  const updateShapeColor = (id: string, color: string): CanvasShape => {
    if (!color || typeof color !== 'string') {
      throw new Error('颜色必须是有效的字符串')
    }

    const index = shapes.value.findIndex(shape => shape.id === id)
    if (index === -1) {
      throw new Error(`未找到ID为 ${id} 的图形`)
    }

    const updatedShape = { ...shapes.value[index], color } as CanvasShape
    shapes.value = [
      ...shapes.value.slice(0, index),
      updatedShape,
      ...shapes.value.slice(index + 1)
    ]

    return updatedShape
  }

  const updateShapeStyle = (id: string, updates: { color?: string; opacity?: number }): CanvasShape => {
    if (!updates.color && updates.opacity === undefined) {
      throw new Error('必须提供颜色或透明度参数')
    }

    if (updates.color && (typeof updates.color !== 'string' || !updates.color.trim())) {
      throw new Error('颜色必须是有效的字符串')
    }

    if (updates.opacity !== undefined && (typeof updates.opacity !== 'number' || updates.opacity < 0 || updates.opacity > 1)) {
      throw new Error('透明度必须是0到1之间的数字')
    }

    const index = shapes.value.findIndex(shape => shape.id === id)
    if (index === -1) {
      throw new Error(`未找到ID为 ${id} 的图形`)
    }

    const updatedShape = { 
      ...shapes.value[index], 
      ...(updates.color && { color: updates.color.trim() }),
      ...(updates.opacity !== undefined && { opacity: updates.opacity })
    } as CanvasShape

    shapes.value = [
      ...shapes.value.slice(0, index),
      updatedShape,
      ...shapes.value.slice(index + 1)
    ]

    return updatedShape
  }

  const updateRectangle = (id: string, updates: { topLeft?: CanvasPoint; bottomRight?: CanvasPoint }): RectangleShape => {
    const index = shapes.value.findIndex(shape => shape.id === id)
    if (index === -1) {
      throw new Error(`未找到ID为 ${id} 的图形`)
    }

    const shape = shapes.value[index]
    if (shape.type !== 'rectangle') {
      throw new Error(`图形 ${id} 不是矩形类型`)
    }

    const currentRect = shape as RectangleShape
    const topLeft = updates.topLeft || currentRect.topLeft
    const bottomRight = updates.bottomRight || currentRect.bottomRight

    const validatedTopLeft = {
      x: ensureNumber(topLeft.x, 'topLeft.x'),
      y: ensureNumber(topLeft.y, 'topLeft.y')
    }
    const validatedBottomRight = {
      x: ensureNumber(bottomRight.x, 'bottomRight.x'),
      y: ensureNumber(bottomRight.y, 'bottomRight.y')
    }

    if (validatedTopLeft.x >= validatedBottomRight.x || validatedTopLeft.y <= validatedBottomRight.y) {
      throw new Error('矩形坐标无效：需要 topLeft.x < bottomRight.x 且 topLeft.y > bottomRight.y')
    }

    ensureWithinBounds(validatedTopLeft, '左上角')
    ensureWithinBounds(validatedBottomRight, '右下角')

    const updatedRectangle: RectangleShape = {
      ...currentRect,
      topLeft: validatedTopLeft,
      bottomRight: validatedBottomRight
    }

    shapes.value = [
      ...shapes.value.slice(0, index),
      updatedRectangle,
      ...shapes.value.slice(index + 1)
    ]

    return updatedRectangle
  }

  const updateCircle = (id: string, updates: { center?: CanvasPoint; radius?: number }): CircleShape => {
    const index = shapes.value.findIndex(shape => shape.id === id)
    if (index === -1) {
      throw new Error(`未找到ID为 ${id} 的图形`)
    }

    const shape = shapes.value[index]
    if (shape.type !== 'circle') {
      throw new Error(`图形 ${id} 不是圆形类型`)
    }

    const currentCircle = shape as CircleShape
    const center = updates.center || currentCircle.center
    const radius = updates.radius !== undefined ? updates.radius : currentCircle.radius

    const validatedCenter = {
      x: ensureNumber(center.x, 'center.x'),
      y: ensureNumber(center.y, 'center.y')
    }
    const validatedRadius = ensureNumber(radius, 'radius')

    if (validatedRadius <= 0) {
      throw new Error('圆形半径必须大于 0')
    }

    ensureWithinBounds(validatedCenter, '圆心')

    if (validatedCenter.x - validatedRadius < CANVAS_MIN || validatedCenter.x + validatedRadius > CANVAS_MAX || 
        validatedCenter.y - validatedRadius < CANVAS_MIN || validatedCenter.y + validatedRadius > CANVAS_MAX) {
      throw new Error('圆形超出了画布边界，请调整中心坐标或半径')
    }

    const updatedCircle: CircleShape = {
      ...currentCircle,
      center: validatedCenter,
      radius: validatedRadius
    }

    shapes.value = [
      ...shapes.value.slice(0, index),
      updatedCircle,
      ...shapes.value.slice(index + 1)
    ]

    return updatedCircle
  }

  const removeShape = (id: string): void => {
    const exists = shapes.value.some(shape => shape.id === id)
    if (!exists) {
      throw new Error(`未找到ID为 ${id} 的图形`)
    }

    shapes.value = shapes.value.filter(shape => shape.id !== id)
  }

  const setBackgroundColor = (color: string): string => {
    if (!color || typeof color !== 'string') {
      throw new Error('背景色必须是有效的字符串')
    }

    backgroundColor.value = color
    return backgroundColor.value
  }

  const clearCanvas = (): void => {
    shapes.value = []
  }

  const showOverlay = (): void => {
    overlayVisible.value = true
  }

  const hideOverlay = (): void => {
    overlayVisible.value = false
  }

  const toggleOverlay = (): void => {
    overlayVisible.value = !overlayVisible.value
  }

  const setOverlayPosition = (position: Partial<OverlayPosition>): void => {
    const nextTop = position.top !== undefined ? ensureNumber(position.top, 'overlayPosition.top') : overlayPosition.value.top
    const nextLeft = position.left !== undefined ? ensureNumber(position.left, 'overlayPosition.left') : overlayPosition.value.left

    const newPosition = {
      top: nextTop,
      left: nextLeft
    }

    overlayPosition.value = newPosition
    // 保存到本地存储
    storePosition(newPosition)
  }

  // 窗口大小变化时调整位置，确保canvas在可见区域内
  if (typeof window !== 'undefined') {
    const adjustPositionForWindowResize = () => {
      const canvasWidth = 720
      const margin = 16
      const maxLeft = Math.max(margin, window.innerWidth - canvasWidth - margin)
      const maxTop = Math.max(margin, window.innerHeight - canvasWidth - margin)

      const currentPos = overlayPosition.value
      const adjustedPos = {
        top: Math.min(Math.max(margin, currentPos.top), maxTop),
        left: Math.min(Math.max(margin, currentPos.left), maxLeft)
      }

      if (currentPos.top !== adjustedPos.top || currentPos.left !== adjustedPos.left) {
        overlayPosition.value = adjustedPos
        storePosition(adjustedPos)
      }
    }

    window.addEventListener('resize', adjustPositionForWindowResize)
  }

  const toggleCoordinates = (): void => {
    showCoordinates.value = !showCoordinates.value
  }

  const setShowCoordinates = (show: boolean): void => {
    showCoordinates.value = show
  }

  return {
    shapes,
    backgroundColor,
    shapeCount,
    addRectangle,
    addCircle,
    updateShapeColor,
    updateShapeStyle,
    updateRectangle,
    updateCircle,
    removeShape,
    setBackgroundColor,
    clearCanvas,
    getSnapshot,
    // Overlay controls
    isOverlayVisible: overlayVisible,
    overlayPosition,
    showOverlay,
    hideOverlay,
    toggleOverlay,
    setOverlayPosition,
    // Coordinate display controls
    showCoordinates,
    toggleCoordinates,
    setShowCoordinates
  }
})
