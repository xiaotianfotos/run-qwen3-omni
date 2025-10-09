import type { Tool, ToolSchemaProperty } from '@/modules/llm/LLM'
import { useCanvasStore } from '@/stores/canvas'

type DrawRectangleArgs = {
  topLeftX?: number | string
  topLeftY?: number | string
  bottomRightX?: number | string
  bottomRightY?: number | string
  color?: string
  opacity?: number | string
}

type DrawCircleArgs = {
  centerX?: number | string
  centerY?: number | string
  radius?: number | string
  color?: string
  opacity?: number | string
}

const DEFAULT_RECTANGLE = {
  topLeft: { x: -10, y: 10 },
  bottomRight: { x: 10, y: -10 },
  color: '#3388ff',
  opacity: 1.0
} as const

const DEFAULT_CIRCLE = {
  centerX: 0,
  centerY: 0,
  radius: 12,
  color: '#ff6f61',
  opacity: 1.0
} as const

const DEFAULT_SHAPE_COLOR = '#ff9800'

const DEFAULT_BACKGROUND_COLOR = '#ffffff'

function normalizeOpacity(value: unknown, label: string): number {
  console.log(`🔍 normalizeOpacity - ${label}:`, { value, type: typeof value })

  if (value === undefined || value === null || value === '') {
    console.log(`✅ 使用默认透明度 ${label}: 1.0`)
    return 1.0
  }

  if (typeof value === 'number') {
    if (value >= 0 && value <= 1) {
      console.log(`✅ 直接使用透明度 ${label}: ${value}`)
      return value
    }
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      console.log(`✅ 字符串转透明度 ${label}: ${value} -> ${parsed}`)
      return parsed
    }
  }

  const errorMsg = `${label} 必须是 0 到 1 之间的数字，当前值: ${JSON.stringify(value)}`
  console.log(`❌ normalizeOpacity 失败: ${errorMsg}`)
  throw new Error(errorMsg)
}

function normalizeNumber(value: unknown, label: string): number {
  console.log(`🔍 normalizeNumber - ${label}:`, { value, type: typeof value })

  const isEmptyString = typeof value === 'string' && value.trim() === ''
  if (value === undefined || value === null || value === '' || isEmptyString) {
    const errorMsg = `${label} 必须提供有效的数值，不能为空`
    console.log(`❌ normalizeNumber 失败: ${errorMsg}`)
    throw new Error(errorMsg)
  }

  if (typeof value === 'number') {
    console.log(`✅ 直接使用数字 ${label}: ${value}`)
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      console.log(`✅ 字符串转数字 ${label}: ${value} -> ${parsed}`)
      return parsed
    }
  }

  const errorMsg = `${label} 必须是一个有效的数字，当前值: ${JSON.stringify(value)}`
  console.log(`❌ normalizeNumber 失败: ${errorMsg}`)
  throw new Error(errorMsg)
}

function resolveRectangleCoordinates(args: DrawRectangleArgs): {
  topLeft: { x: number; y: number },
  bottomRight: { x: number; y: number }
} {
  console.log(`📍 resolveRectangleCoordinates:`, { args })

  const topLeft = {
    x: normalizeNumber(args.topLeftX, 'topLeftX'),
    y: normalizeNumber(args.topLeftY, 'topLeftY')
  }
  
  const bottomRight = {
    x: normalizeNumber(args.bottomRightX, 'bottomRightX'),
    y: normalizeNumber(args.bottomRightY, 'bottomRightY')
  }
  
  console.log(`✅ 坐标解析完成: topLeft=${JSON.stringify(topLeft)}, bottomRight=${JSON.stringify(bottomRight)}`)
  return { topLeft, bottomRight }
}

function createSuccessResponse(data: Record<string, unknown>) {
  const response = {
    isSuccess: true,
    error: null,
    data
  }
  console.log(`✅ 工具调用成功:`, JSON.stringify(response, null, 2))
  return response
}

function createErrorResponse(error: string) {
  const response = {
    isSuccess: false,
    error,
    data: null
  }
  console.log(`❌ 工具调用失败:`, JSON.stringify(response, null, 2))
  return response
}

export const drawRectangleTool: Tool = {
  name: 'draw_rectangle',
  description:
    '在 100×100 坐标画布上绘制矩形。坐标范围 -50 到 50。示例：<tool_calls>[{"name":"draw_rectangle","arguments":{"topLeftX":-15,"topLeftY":20,"bottomRightX":15,"bottomRightY":-10,"color":"#3388ff","opacity":1.0}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {
      topLeftX: {
        type: ['number', 'string'],
        description: '左上角的 x 坐标（范围 -50 到 50），默认 -10',
        default: DEFAULT_RECTANGLE.topLeft.x
      },
      topLeftY: {
        type: ['number', 'string'],
        description: '左上角的 y 坐标（范围 -50 到 50），默认 10',
        default: DEFAULT_RECTANGLE.topLeft.y
      },
      bottomRightX: {
        type: ['number', 'string'],
        description: '右下角的 x 坐标（范围 -50 到 50），默认 10',
        default: DEFAULT_RECTANGLE.bottomRight.x
      },
      bottomRightY: {
        type: ['number', 'string'],
        description: '右下角的 y 坐标（范围 -50 到 50），默认 -10',
        default: DEFAULT_RECTANGLE.bottomRight.y
      },
      color: {
        type: 'string',
        description: '矩形颜色（CSS 颜色字符串），默认 #3388ff',
        default: DEFAULT_RECTANGLE.color
      },
      opacity: {
        type: ['number', 'string'],
        description: '透明度（0-1），1.0 为完全不透明，默认 1.0',
        default: DEFAULT_RECTANGLE.opacity
      }
    },
    required: ['topLeftX', 'topLeftY', 'bottomRightX', 'bottomRightY', 'color']
  },
  handler: async (args: DrawRectangleArgs) => {
    console.log('🟦 ==========================================')
    console.log(`🟦 工具调用: draw_rectangle`)
    console.log(`🟦 调用参数:`, JSON.stringify(args, null, 2))

    try {
      const store = useCanvasStore()
      console.log(`🟦 解析坐标...`)
      const { topLeft, bottomRight } = resolveRectangleCoordinates(args)

      if (topLeft.x >= bottomRight.x || topLeft.y <= bottomRight.y) {
        const errorMsg = '矩形坐标无效：左上角必须位于右下角的左上方'
        console.log(`🟦 坐标验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      if (!args.color?.trim()) {
        const errorMsg = '必须提供颜色参数'
        console.log(`🟦 颜色验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }
      const color = args.color.trim()
      const opacity = normalizeOpacity(args.opacity, 'opacity')
      console.log(`🟦 使用颜色: ${color}, 透明度: ${opacity}`)

      console.log(`🟦 创建矩形...`)
      const rectangle = store.addRectangle({
        topLeft,
        bottomRight,
        color,
        opacity
      })
      console.log(`🟦 矩形创建成功: id=${rectangle.id}`)

      console.log(`🟦 显示画布...`)
      store.showOverlay()

      const result = {
        id: rectangle.id,
        type: 'rectangle',
        topLeft: rectangle.topLeft,
        bottomRight: rectangle.bottomRight,
        color: rectangle.color
      }
      console.log(`🟦 工具执行完成`)
      console.log('🟦 ==========================================')
      return createSuccessResponse(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '绘制矩形失败'
      console.log(`🟦 工具执行异常: ${errorMsg}`)
      console.log('🟦 ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const drawCircleTool: Tool = {
  name: 'draw_circle',
  description:
    '在坐标画布上绘制圆形。坐标范围 -50 到 50。示例：<tool_calls>[{"name":"draw_circle","arguments":{"centerX":15,"centerY":-8,"radius":12,"color":"#ff6f61","opacity":1.0}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {
      centerX: {
        type: ['number', 'string'],
        description: '圆心的 x 坐标（范围 -50 到 50），默认 0',
        default: DEFAULT_CIRCLE.centerX
      },
      centerY: {
        type: ['number', 'string'],
        description: '圆心的 y 坐标（范围 -50 到 50），默认 0',
        default: DEFAULT_CIRCLE.centerY
      },
      radius: {
        type: ['number', 'string'],
        description: '圆的半径（必须大于 0），默认 12',
        default: DEFAULT_CIRCLE.radius
      },
      color: {
        type: 'string',
        description: '圆形颜色（CSS 颜色字符串），默认 #ff6f61',
        default: DEFAULT_CIRCLE.color
      },
      opacity: {
        type: ['number', 'string'],
        description: '透明度（0-1），1.0 为完全不透明，默认 1.0',
        default: DEFAULT_CIRCLE.opacity
      }
    },
    required: ['centerX', 'centerY', 'radius', 'color']
  },
  handler: async (args: DrawCircleArgs) => {
    console.log('🟡 ==========================================')
    console.log(`🟡 工具调用: draw_circle`)
    console.log(`🟡 调用参数:`, JSON.stringify(args, null, 2))

    try {
      const store = useCanvasStore()
      console.log(`🟡 解析参数...`)
      const centerX = normalizeNumber(args.centerX, 'centerX')
      const centerY = normalizeNumber(args.centerY, 'centerY')
      const radius = normalizeNumber(args.radius, 'radius')
      console.log(`🟡 参数解析完成: centerX=${centerX}, centerY=${centerY}, radius=${radius}`)

      if (radius <= 0) {
        const errorMsg = '圆的半径必须大于 0'
        console.log(`🟡 半径验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      if (!args.color?.trim()) {
        const errorMsg = '必须提供颜色参数'
        console.log(`🟡 颜色验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }
      const color = args.color.trim()
      const opacity = normalizeOpacity(args.opacity, 'opacity')
      console.log(`🟡 使用颜色: ${color}, 透明度: ${opacity}`)

      console.log(`🟡 创建圆形...`)
      const circle = store.addCircle({
        center: { x: centerX, y: centerY },
        radius,
        color,
        opacity
      })
      console.log(`🟡 圆形创建成功: id=${circle.id}`)

      console.log(`🟡 显示画布...`)
      store.showOverlay()

      const result = {
        id: circle.id,
        type: 'circle',
        center: circle.center,
        radius: circle.radius,
        color: circle.color
      }
      console.log(`🟡 工具执行完成`)
      console.log('🟡 ==========================================')
      return createSuccessResponse(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '绘制圆形失败'
      console.log(`🟡 工具执行异常: ${errorMsg}`)
      console.log('🟡 ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const updateShapeColorTool: Tool = {
  name: 'update_shape_color',
  description:
    '更新指定图形的颜色和透明度。示例：<tool_calls>[{"name":"update_shape_color","arguments":{"id":"rect_123","color":"#673ab7","opacity":0.8}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '目标图形的唯一ID'
      },
      color: {
        type: 'string',
        description: '新的颜色值（CSS 颜色字符串），默认 #ff9800',
        default: DEFAULT_SHAPE_COLOR
      },
      opacity: {
        type: ['number', 'string'],
        description: '透明度（0-1），1.0 为完全不透明，默认保持原值'
      }
    },
    required: ['id']
  },
  handler: async (args: { id: string; color?: string; opacity?: number | string }) => {
    console.log('🟣 ==========================================')
    console.log(`🟣 工具调用: update_shape_color`)
    console.log(`🟣 调用参数:`, JSON.stringify(args, null, 2))

    try {
      const store = useCanvasStore()

      // 验证至少提供一个更新参数
      if (!args.color && args.opacity === undefined) {
        const errorMsg = '必须提供颜色或透明度参数中的至少一个'
        console.log(`🟣 参数验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      const updates: { color?: string; opacity?: number } = {}

      // 处理颜色参数
      if (args.color) {
        if (!args.color.trim()) {
          const errorMsg = '颜色参数不能为空'
          console.log(`🟣 颜色验证失败: ${errorMsg}`)
          return createErrorResponse(errorMsg)
        }
        updates.color = args.color.trim()
        console.log(`🟣 使用新颜色: ${updates.color}`)
      }

      // 处理透明度参数
      if (args.opacity !== undefined) {
        updates.opacity = normalizeOpacity(args.opacity, 'opacity')
        console.log(`🟣 使用新透明度: ${updates.opacity}`)
      }

      console.log(`🟣 更新图形样式: id=${args.id}`, updates)

      console.log(`🟣 执行样式更新...`)
      const updatedShape = store.updateShapeStyle(args.id, updates)
      console.log(`🟣 样式更新成功: shape=${JSON.stringify(updatedShape)}`)

      console.log(`🟣 显示画布...`)
      store.showOverlay()

      const shapeData: any = {
        id: updatedShape.id,
        type: updatedShape.type,
        color: updatedShape.color,
        opacity: updatedShape.opacity
      }

      if (updatedShape.type === 'rectangle') {
        shapeData.topLeft = updatedShape.topLeft
        shapeData.bottomRight = updatedShape.bottomRight
      } else if (updatedShape.type === 'circle') {
        shapeData.center = updatedShape.center
        shapeData.radius = updatedShape.radius
      }

      console.log(`🟣 工具执行完成`)
      console.log('🟣 ==========================================')
      return createSuccessResponse(shapeData)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '更新图形样式失败'
      console.log(`🟣 工具执行异常: ${errorMsg}`)
      console.log('🟣 ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const deleteShapeTool: Tool = {
  name: 'delete_shape',
  description: '删除指定图形。示例：<tool_calls>[{"name":"delete_shape","arguments":{"id":"shape-123"}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '目标图形的唯一ID'
      }
    },
    required: ['id']
  },
  handler: async (args: { id: string }) => {
    console.log('🔴 ==========================================')
    console.log(`🔴 工具调用: delete_shape`)
    console.log(`🔴 调用参数:`, JSON.stringify(args, null, 2))

    try {
      const store = useCanvasStore()
      console.log(`🔴 删除图形: id=${args.id}`)

      console.log(`🔴 执行删除操作...`)
      store.removeShape(args.id)
      console.log(`🔴 删除成功`)

      console.log(`🔴 显示画布...`)
      store.showOverlay()

      const result = {
        id: args.id,
        deleted: true
      }
      console.log(`🔴 工具执行完成`)
      console.log('🔴 ==========================================')
      return createSuccessResponse(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '删除图形失败'
      console.log(`🔴 工具执行异常: ${errorMsg}`)
      console.log('🔴 ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const updateBackgroundColorTool: Tool = {
  name: 'update_canvas_background',
  description:
    '更新画布背景颜色。示例：<tool_calls>[{"name":"update_canvas_background","arguments":{"color":"#212121"}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {
      color: {
        type: 'string',
        description: '新的背景颜色（CSS 颜色字符串），默认 #ffffff',
        default: DEFAULT_BACKGROUND_COLOR
      }
    },
    required: ['color']
  },
  handler: async (args: { color?: string }) => {
    console.log('⚪ ==========================================')
    console.log(`⚪ 工具调用: update_canvas_background`)
    console.log(`⚪ 调用参数:`, JSON.stringify(args, null, 2))

    try {
      const store = useCanvasStore()

      if (!args.color?.trim()) {
        const errorMsg = '必须提供颜色参数'
        console.log(`⚪ 颜色验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }
      const color = args.color.trim()
      console.log(`⚪ 更新背景颜色: ${color}`)

      console.log(`⚪ 执行背景颜色更新...`)
      store.setBackgroundColor(color)
      console.log(`⚪ 背景颜色更新成功`)

      console.log(`⚪ 显示画布...`)
      store.showOverlay()

      const result = {
        backgroundColor: color
      }
      console.log(`⚪ 工具执行完成`)
      console.log('⚪ ==========================================')
      return createSuccessResponse(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '更新背景色失败'
      console.log(`⚪ 工具执行异常: ${errorMsg}`)
      console.log('⚪ ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const updateRectangleTool: Tool = {
  name: 'update_rectangle',
  description:
    '更新指定矩形的位置和大小。可以只更新部分坐标。示例：<tool_calls>[{"name":"update_rectangle","arguments":{"id":"rect_123","topLeftX":-20,"bottomRightX":20}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '目标矩形的唯一ID'
      },
      topLeftX: {
        type: ['number', 'string'],
        description: '新的左上角 x 坐标（范围 -50 到 50），不提供则保持原值'
      },
      topLeftY: {
        type: ['number', 'string'],
        description: '新的左上角 y 坐标（范围 -50 到 50），不提供则保持原值'
      },
      bottomRightX: {
        type: ['number', 'string'],
        description: '新的右下角 x 坐标（范围 -50 到 50），不提供则保持原值'
      },
      bottomRightY: {
        type: ['number', 'string'],
        description: '新的右下角 y 坐标（范围 -50 到 50），不提供则保持原值'
      }
    },
    required: ['id']
  },
  handler: async (args: { id: string; topLeftX?: number | string; topLeftY?: number | string; bottomRightX?: number | string; bottomRightY?: number | string }) => {
    console.log('🔷 ==========================================')
    console.log(`🔷 工具调用: update_rectangle`)
    console.log(`🔷 调用参数:`, JSON.stringify(args, null, 2))

    try {
      const store = useCanvasStore()
      
      // 获取原矩形信息
      const originalShape = store.shapes.find(shape => shape.id === args.id)
      if (!originalShape) {
        const errorMsg = `未找到ID为 ${args.id} 的图形`
        console.log(`🔷 图形查找失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }
      
      if (originalShape.type !== 'rectangle') {
        const errorMsg = `图形 ${args.id} 不是矩形类型`
        console.log(`🔷 类型验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      // 检查是否至少提供了一个坐标参数
      const hasAnyCoordinate = args.topLeftX !== undefined || args.topLeftY !== undefined || 
                              args.bottomRightX !== undefined || args.bottomRightY !== undefined
      
      if (!hasAnyCoordinate) {
        const errorMsg = '必须至少提供一个坐标参数进行更新'
        console.log(`🔷 参数验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      // 获取当前矩形坐标，用作默认值
      const currentRect = originalShape as any
      console.log(`🔷 当前矩形坐标:`, currentRect.topLeft, currentRect.bottomRight)

      console.log(`🔷 合并坐标参数...`)
      // 合并新旧坐标，未提供的坐标保持原值
      const topLeftX = args.topLeftX !== undefined ? normalizeNumber(args.topLeftX, 'topLeftX') : currentRect.topLeft.x
      const topLeftY = args.topLeftY !== undefined ? normalizeNumber(args.topLeftY, 'topLeftY') : currentRect.topLeft.y
      const bottomRightX = args.bottomRightX !== undefined ? normalizeNumber(args.bottomRightX, 'bottomRightX') : currentRect.bottomRight.x
      const bottomRightY = args.bottomRightY !== undefined ? normalizeNumber(args.bottomRightY, 'bottomRightY') : currentRect.bottomRight.y

      const topLeft = { x: topLeftX, y: topLeftY }
      const bottomRight = { x: bottomRightX, y: bottomRightY }
      
      console.log(`🔷 最终坐标: topLeft=${JSON.stringify(topLeft)}, bottomRight=${JSON.stringify(bottomRight)}`)

      if (topLeft.x >= bottomRight.x || topLeft.y <= bottomRight.y) {
        const errorMsg = '矩形坐标无效：左上角必须位于右下角的左上方'
        console.log(`🔷 坐标验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      console.log(`🔷 更新矩形位置和大小...`)
      const updatedRectangle = store.updateRectangle(args.id, {
        topLeft,
        bottomRight
      })
      console.log(`🔷 矩形更新成功: id=${updatedRectangle.id}`)

      console.log(`🔷 显示画布...`)
      store.showOverlay()

      const result = {
        id: updatedRectangle.id,
        type: 'rectangle',
        topLeft: updatedRectangle.topLeft,
        bottomRight: updatedRectangle.bottomRight,
        color: updatedRectangle.color,
        opacity: updatedRectangle.opacity
      }
      console.log(`🔷 工具执行完成`)
      console.log('🔷 ==========================================')
      return createSuccessResponse(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '更新矩形失败'
      console.log(`🔷 工具执行异常: ${errorMsg}`)
      console.log('🔷 ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const updateCircleTool: Tool = {
  name: 'update_circle',
  description:
    '更新指定圆形的位置和大小。可以只更新部分参数。示例：<tool_calls>[{"name":"update_circle","arguments":{"id":"circle_123","centerX":10}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '目标圆形的唯一ID'
      },
      centerX: {
        type: ['number', 'string'],
        description: '新的圆心 x 坐标（范围 -50 到 50），不提供则保持原值'
      },
      centerY: {
        type: ['number', 'string'],
        description: '新的圆心 y 坐标（范围 -50 到 50），不提供则保持原值'
      },
      radius: {
        type: ['number', 'string'],
        description: '新的圆半径（必须大于 0），不提供则保持原值'
      }
    },
    required: ['id']
  },
  handler: async (args: { id: string; centerX?: number | string; centerY?: number | string; radius?: number | string }) => {
    console.log('🔶 ==========================================')
    console.log(`🔶 工具调用: update_circle`)
    console.log(`🔶 调用参数:`, JSON.stringify(args, null, 2))

    try {
      const store = useCanvasStore()
      
      // 获取原圆形信息
      const originalShape = store.shapes.find(shape => shape.id === args.id)
      if (!originalShape) {
        const errorMsg = `未找到ID为 ${args.id} 的图形`
        console.log(`🔶 图形查找失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }
      
      if (originalShape.type !== 'circle') {
        const errorMsg = `图形 ${args.id} 不是圆形类型`
        console.log(`🔶 类型验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      // 检查是否至少提供了一个参数
      const hasAnyParameter = args.centerX !== undefined || args.centerY !== undefined || args.radius !== undefined
      
      if (!hasAnyParameter) {
        const errorMsg = '必须至少提供一个参数进行更新（centerX、centerY 或 radius）'
        console.log(`🔶 参数验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      // 获取当前圆形参数，用作默认值
      const currentCircle = originalShape as any
      console.log(`🔶 当前圆形参数:`, { center: currentCircle.center, radius: currentCircle.radius })

      console.log(`🔶 合并参数...`)
      // 合并新旧参数，未提供的参数保持原值
      const centerX = args.centerX !== undefined ? normalizeNumber(args.centerX, 'centerX') : currentCircle.center.x
      const centerY = args.centerY !== undefined ? normalizeNumber(args.centerY, 'centerY') : currentCircle.center.y
      const radius = args.radius !== undefined ? normalizeNumber(args.radius, 'radius') : currentCircle.radius
      
      console.log(`🔶 最终参数: centerX=${centerX}, centerY=${centerY}, radius=${radius}`)

      if (radius <= 0) {
        const errorMsg = '圆的半径必须大于 0'
        console.log(`🔶 半径验证失败: ${errorMsg}`)
        return createErrorResponse(errorMsg)
      }

      console.log(`🔶 更新圆形位置和大小...`)
      const updatedCircle = store.updateCircle(args.id, {
        center: { x: centerX, y: centerY },
        radius
      })
      console.log(`🔶 圆形更新成功: id=${updatedCircle.id}`)

      console.log(`🔶 显示画布...`)
      store.showOverlay()

      const result = {
        id: updatedCircle.id,
        type: 'circle',
        center: updatedCircle.center,
        radius: updatedCircle.radius,
        color: updatedCircle.color,
        opacity: updatedCircle.opacity
      }
      console.log(`🔶 工具执行完成`)
      console.log('🔶 ==========================================')
      return createSuccessResponse(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '更新圆形失败'
      console.log(`🔶 工具执行异常: ${errorMsg}`)
      console.log('🔶 ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const clearCanvasTool: Tool = {
  name: 'clear_canvas',
  description:
    '清空画布上的所有图形，保留背景颜色。示例：<tool_calls>[{"name":"clear_canvas","arguments":{}}]</tool_calls>',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  handler: async () => {
    console.log('🧹 ==========================================')
    console.log(`🧹 工具调用: clear_canvas`)

    try {
      const store = useCanvasStore()
      console.log(`🧹 清空画布中的所有图形...`)
      
      const shapesBeforeClear = store.shapes.length
      store.clearCanvas()
      console.log(`🧹 清空完成，共清除了 ${shapesBeforeClear} 个图形`)

      console.log(`🧹 显示画布...`)
      store.showOverlay()

      const result = {
        cleared: true,
        removedShapes: shapesBeforeClear,
        message: `成功清空画布，移除了 ${shapesBeforeClear} 个图形`
      }
      console.log(`🧹 工具执行完成`)
      console.log('🧹 ==========================================')
      return createSuccessResponse(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '清空画布失败'
      console.log(`🧹 工具执行异常: ${errorMsg}`)
      console.log('🧹 ==========================================')
      return createErrorResponse(errorMsg)
    }
  }
}

export const canvasTools: Tool[] = [
  drawRectangleTool,
  drawCircleTool,
  updateRectangleTool,
  updateCircleTool,
  updateShapeColorTool,
  deleteShapeTool,
  updateBackgroundColorTool,
  clearCanvasTool
]

const CANVAS_SPACE_DESCRIPTION = `你可以使用一个 100×100 的笛卡尔坐标画布：原点位于画布中心 (0,0)，x 轴向右为正，y 轴向上为正。所有坐标的有效范围为 -50 到 50。`

function formatDefaultValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatNestedProperties(schema: ToolSchemaProperty): string {
  if (!schema.properties) {
    return ''
  }

  const nested = Object.entries(schema.properties)
    .map(([key, value]) => {
      const typeText = Array.isArray(value.type) ? value.type.join(' | ') : value.type
      const defaultText = value.default !== undefined ? `，默认值：${formatDefaultValue(value.default)}` : ''
      return `${key}:${typeText}${defaultText}`
    })
    .join(', ')

  return nested ? `（对象字段：${nested}）` : ''
}

function formatParameterSummary(tool: Tool, name: string, schema: ToolSchemaProperty): string {
  const types = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type
  const requiredMark = tool.parameters.required?.includes(name) ? '（必填）' : '（可选）'
  const nested = formatNestedProperties(schema)
  const defaultText = schema.default !== undefined ? `，默认值：${formatDefaultValue(schema.default)}` : ''
  return `  - ${name}${requiredMark}：${schema.description} 类型：${types}${nested}${defaultText}`
}

function describeTool(tool: Tool): string {
  const lines = [`- ${tool.name}：${tool.description}`]
  const parameterEntries = Object.entries(tool.parameters.properties || {})
  if (parameterEntries.length > 0) {
    lines.push('  参数说明：')
    for (const [name, schema] of parameterEntries) {
      lines.push(formatParameterSummary(tool, name, schema as ToolSchemaProperty))
    }
  }

  if (tool.parameters.anyOf && tool.parameters.anyOf.length > 0) {
    const combos = tool.parameters.anyOf
      .map((combo, index) => `    • 方案 ${index + 1}：${combo.required?.join('、') || ''}`)
      .join('\n')
    if (combos) {
      lines.push('  参数组合要求：')
      lines.push(combos)
    }
  }

  return lines.join('\n')
}

const TOOL_SUMMARY = canvasTools.map(describeTool).join('\n\n')

export const CANVAS_SYSTEM_PROMPT_SEGMENT = `${CANVAS_SPACE_DESCRIPTION}

可用工具：
${TOOL_SUMMARY}

# 工具调用方式
<tool_calls>[{...}]</tool_calls>
## 工具调用例子1
<tool_calls>
[{
  "name": "draw_rectangle",
  "arguments": {
    "topLeftX": -10,
    "topLeftY": 10,
    "bottomRightX": 10,
    "bottomRightY": -10,
    "color": "#ff0000",
    "opacity": 1.0
  }
}]
  </tool_calls>
## 多组工具调用
<tool_calls>[{
  "name": "draw_circle",
  "arguments": {
    "centerX": 0,
    "centerY": 0,
    "radius": 15,
    "color": "#0000ff",
    "opacity": 0.7
  }
}, {
  "name": "draw_rectangle",
  "arguments": {
    "topLeftX": -10,
    "topLeftY": 10,
    "bottomRightX": 10,
    "bottomRightY": -10,
    "color": "#ff0000",
    "opacity": 1.0
  }
}]
  </tool_calls>
## 更新图形样式例子
<tool_calls>
[{
  "name": "update_shape_color",
  "arguments": {
    "id": "rect_123",
    "color": "#9c27b0",
    "opacity": 0.6
  }
}]
</tool_calls>
## 更新矩形位置和大小例子
<tool_calls>
[{
  "name": "update_rectangle",
  "arguments": {
    "id": "rect_123",
    "topLeftX": -20,
    "bottomRightX": 20
  }
}]
</tool_calls>
## 更新圆形位置和大小例子
<tool_calls>
[{
  "name": "update_circle",
  "arguments": {
    "id": "circle_456",
    "centerX": 10
  }
}]
</tool_calls>
## 清屏例子
<tool_calls>
[{
  "name": "clear_canvas",
  "arguments": {}
}]
</tool_calls>

# 结束循环
当你收到工具调用结果后，如果有错误可以根据反馈重新生成<tool_calls>标签，修正工具调用。
如果没有错误，生成一句结束语总结。
## 结束语示例
成功完成绘制！

⚠️ **关键约束**：
1. **矩形绘制**：使用平铺坐标参数 {"name":"draw_rectangle","arguments":{"topLeftX":-10,"topLeftY":10,"bottomRightX":10,"bottomRightY":-10,"color":"#ff0000","opacity":1.0}}
2. **圆形绘制**：使用 {"name":"draw_circle","arguments":{"centerX":0,"centerY":0,"radius":15,"color":"#0000ff","opacity":1.0}}
3. **坐标范围**：所有 x、y 坐标必须在 -50 到 50 之间
4. **透明度范围**：opacity 参数范围为 0-1，1.0 表示完全不透明（实心），0.5 表示半透明
5. **必须提供所有参数**：包括坐标、尺寸、颜色和透明度信息
6. **坐标显示**：矩形会自动显示左上角和右下角坐标，圆形会显示圆心坐标
7. **样式更新**：使用 update_shape_color 工具可以同时更新颜色和透明度，至少提供其中一个参数
8. **位置和大小更新**：使用 update_rectangle 和 update_circle 工具可以更新图形的位置和大小，支持部分参数更新（如只更新 x 坐标而保持 y 坐标不变）
9. **清屏操作**：使用 clear_canvas 工具可以清空所有图形，保留背景颜色
10.**调用标记**：所有工具调用必须以 <tool_calls> 开始，以 </tool_calls> 结束

`



