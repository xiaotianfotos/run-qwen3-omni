/**
 * 工具调用解析器
 * 
 * 解析 LLM 输出文本中的工具调用格式，支持多种格式：
 * 
 * 支持的格式：
 * 1. 标准工具调用：<tool_call>[{"name": "tool_name", "arguments": {...}}]</tool_call>
 * 2. 多个工具调用：<tool_call>[{"name": "tool1", ...}, {"name": "tool2", ...}]</tool_call>
 * 3. 分离的工具调用：<tool_call>[{...}]</tool_call> ... <tool_call>[{...}]</tool_call>
 * 4. Markdown 代码块格式：```tool_calls\n[{"name": "tool_name", ...}]\n```
 * 5. 裸露 JSON 格式：{"name": "tool_name", "arguments": {...}}
 * 
 * 提供完整的错误处理机制和格式兼容性
 */

export interface ParsedToolCall {
  id: string
  name: string
  arguments: any
}

export interface ToolCallParseResult {
  toolCalls: ParsedToolCall[]
  cleanedText: string  // 移除工具调用标签后的文本
  hasToolCalls: boolean
}

/**
 * 生成唯一的工具调用 ID
 */
function generateToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
}

/**
 * 尝试修复常见的 JSON 格式问题
 * 根据经验记忆，LLM 可能输出格式略有问题的 JSON
 */
function repairJsonString(jsonStr: string): string {
  let cleaned = jsonStr.trim()
  
  // 移除可能的多余逗号
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')
  
  // 确保对象被正确包装
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    cleaned = `{${cleaned}}`
  }
  
  return cleaned
}

/**
 * 安全解析 JSON，支持容错处理
 */
function safeParseJson(jsonStr: string): any {
  try {
    return JSON.parse(jsonStr)
  } catch (error) {
    console.warn('🔧 标准 JSON 解析失败，尝试修复:', jsonStr)
    
    // 尝试修复常见问题
    const repairedJson = repairJsonString(jsonStr)
    try {
      const result = JSON.parse(repairedJson)
      console.log('✅ JSON 修复成功:', result)
      return result
    } catch (repairError) {
      console.error('❌ JSON 修复失败:', { original: jsonStr, repaired: repairedJson, error: repairError })
      throw new Error(`JSON 解析失败: ${repairError instanceof Error ? repairError.message : String(repairError)}`)
    }
  }
}

/**
 * 验证工具调用对象的有效性
 */
function validateToolCall(obj: any): obj is { name: string; arguments?: any } {
  return obj && 
         typeof obj === 'object' && 
         typeof obj.name === 'string' && 
         obj.name.trim().length > 0
}

/**
 * 标准化工具调用对象为 ParsedToolCall 格式
 */
function normalizeToolCall(obj: any): ParsedToolCall {
  if (!validateToolCall(obj)) {
    throw new Error(`无效的工具调用对象: ${JSON.stringify(obj)}`)
  }
  
  return {
    id: generateToolCallId(),
    name: obj.name.trim(),
    arguments: obj.arguments || {}
  }
}

/**
 * 解析单个工具调用块的内容
 */
function parseToolCallBlock(content: string): ParsedToolCall[] {
  console.log('🔍 解析工具调用块:', content)
  
  const parsed = safeParseJson(content)
  const toolCalls: ParsedToolCall[] = []
  
  if (Array.isArray(parsed)) {
    // 处理数组格式：[{tool1}, {tool2}, ...]
    for (const item of parsed) {
      try {
        const normalizedCall = normalizeToolCall(item)
        toolCalls.push(normalizedCall)
        console.log('✅ 解析工具调用:', normalizedCall.name)
      } catch (error) {
        console.warn('⚠️ 跳过无效的工具调用项:', item, error)
      }
    }
  } else if (typeof parsed === 'object') {
    // 处理单个对象格式：{tool}
    try {
      const normalizedCall = normalizeToolCall(parsed)
      toolCalls.push(normalizedCall)
      console.log('✅ 解析单个工具调用:', normalizedCall.name)
    } catch (error) {
      console.warn('⚠️ 无效的工具调用对象:', parsed, error)
    }
  } else {
    console.warn('⚠️ 无法识别的工具调用格式:', parsed)
  }
  
  return toolCalls
}

/**
 * 检测并解析 Markdown 代码块格式的工具调用
 * 支持 ```tool_calls 或其他代码块标识符包裹的 JSON 格式
 */
function parseMarkdownCodeBlockToolCall(text: string): { toolCalls: ParsedToolCall[], cleanedText: string } {
  // 匹配 Markdown 代码块：```identifier\n...\n```
  const codeBlockRegex = /```\w*\s*\n([\s\S]*?)\n```/g
  const toolCalls: ParsedToolCall[] = []
  let cleanedText = text
  let match: RegExpExecArray | null
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const fullMatch = match[0]
    const jsonContent = match[1].trim()
    
    console.log('🎯 发现 Markdown 代码块:', { fullMatch, jsonContent })
    
    try {
      // 尝试解析 JSON 内容
      const parsed = safeParseJson(jsonContent)
      
      if (Array.isArray(parsed)) {
        // 处理数组格式：[{tool1}, {tool2}, ...]
        for (const item of parsed) {
          if (validateToolCall(item)) {
            const normalizedCall = normalizeToolCall(item)
            toolCalls.push(normalizedCall)
            console.log('✅ 解析 Markdown 代码块工具调用:', normalizedCall.name)
          }
        }
      } else if (validateToolCall(parsed)) {
        // 处理单个对象格式：{tool}
        const normalizedCall = normalizeToolCall(parsed)
        toolCalls.push(normalizedCall)
        console.log('✅ 解析 Markdown 代码块单个工具调用:', normalizedCall.name)
      }
      
      // 移除已解析的代码块
      if (toolCalls.length > 0) {
        cleanedText = cleanedText.replace(fullMatch, '')
      }
    } catch (error) {
      console.log('🔍 Markdown 代码块 JSON 解析失败，当作普通文本:', jsonContent)
    }
  }
  
  return {
    toolCalls,
    cleanedText
  }
}

/**
 * 检测并解析裸露的 JSON 工具调用格式
 * 支持直接的 JSON 对象格式，如：{"name": "tool_name", "arguments": {...}}
 */
function parseRawJsonToolCall(text: string): { toolCalls: ParsedToolCall[], cleanedText: string } {
  const lines = text.split('\n')
  const toolCalls: ParsedToolCall[] = []
  const remainingLines: string[] = []
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    
    // 检查是否是以 { 开头，} 结尾的完整 JSON 行
    if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
      try {
        const parsed = safeParseJson(trimmedLine)
        
        // 检查是否是有效的工具调用格式
        if (validateToolCall(parsed)) {
          const normalizedCall = normalizeToolCall(parsed)
          toolCalls.push(normalizedCall)
          console.log('✅ 解析裸露 JSON 工具调用:', normalizedCall.name)
          continue // 跳过这行，不加入剩余文本
        }
      } catch (error) {
        // 如果解析失败，当作普通文本处理
        console.log('🔍 JSON 解析失败，当作普通文本:', trimmedLine)
      }
    }
    
    // 不是工具调用格式，保留原文本
    remainingLines.push(line)
  }
  
  return {
    toolCalls,
    cleanedText: remainingLines.join('\n')
  }
}

/**
 * 主要的工具调用解析函数
 * 
 * @param text LLM 输出的文本
 * @returns 解析结果，包含工具调用列表和清理后的文本
 */
export function parseToolCalls(text: string): ToolCallParseResult {
  if (!text || typeof text !== 'string') {
    return {
      toolCalls: [],
      cleanedText: text || '',
      hasToolCalls: false
    }
  }
  
  console.log('🔍 开始解析工具调用，文本长度:', text.length)
  
  // 工具调用标签的正则表达式
  const toolCallRegex = /<tool_calls>\s*(\[.*?\])\s*<\/tool_calls>/gs
  const allToolCalls: ParsedToolCall[] = []
  let cleanedText = text
  let match: RegExpExecArray | null
  
  // 查找所有工具调用块
  while ((match = toolCallRegex.exec(text)) !== null) {
    const fullMatch = match[0]
    const jsonContent = match[1]
    
    console.log('🎯 发现工具调用块:', { fullMatch, jsonContent })
    
    try {
      // 解析当前块中的工具调用
      const blockToolCalls = parseToolCallBlock(jsonContent)
      allToolCalls.push(...blockToolCalls)
      
      // 从文本中移除工具调用标签
      cleanedText = cleanedText.replace(fullMatch, '')
      
      console.log(`✅ 成功解析 ${blockToolCalls.length} 个工具调用`)
    } catch (error) {
      console.error('❌ 解析工具调用块失败:', { jsonContent, error })
      // 即使解析失败，也要移除标签，避免文本污染
      cleanedText = cleanedText.replace(fullMatch, '')
    }
  }
  
  // 如果没有找到标准格式的工具调用，尝试解析其他格式
  if (allToolCalls.length === 0) {
    console.log('🔍 未找到标准工具调用标签，尝试解析其他格式')
    
    // 首先尝试解析 Markdown 代码块格式
    const markdownResult = parseMarkdownCodeBlockToolCall(cleanedText)
    allToolCalls.push(...markdownResult.toolCalls)
    cleanedText = markdownResult.cleanedText
    
    if (markdownResult.toolCalls.length > 0) {
      console.log(`✅ 成功解析 ${markdownResult.toolCalls.length} 个 Markdown 代码块工具调用`)
    } else {
      // 如果 Markdown 格式也没找到，再尝试裸露的 JSON 格式
      console.log('🔍 未找到 Markdown 代码块格式，尝试解析裸露 JSON 格式')
      const rawJsonResult = parseRawJsonToolCall(cleanedText)
      allToolCalls.push(...rawJsonResult.toolCalls)
      cleanedText = rawJsonResult.cleanedText
      
      if (rawJsonResult.toolCalls.length > 0) {
        console.log(`✅ 成功解析 ${rawJsonResult.toolCalls.length} 个裸露 JSON 工具调用`)
      }
    }
  }
  
  // 清理多余的空白字符
  cleanedText = cleanedText.replace(/\n\s*\n/g, '\n').trim()
  
  const result: ToolCallParseResult = {
    toolCalls: allToolCalls,
    cleanedText,
    hasToolCalls: allToolCalls.length > 0
  }
  
  console.log('🏁 工具调用解析完成:', {
    toolCallsCount: result.toolCalls.length,
    toolNames: result.toolCalls.map(tc => tc.name),
    cleanedTextLength: result.cleanedText.length
  })
  
  return result
}

/**
 * 检查文本是否包含工具调用标签或裸露 JSON 格式（快速检查，无需完整解析）
 */
export function hasToolCallTags(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false
  }
  
  // 检查标准格式
  if (/<tool_calls>.*?<\/tool_calls>/s.test(text)) {
    return true
  }
  
  // 检查 Markdown 代码块格式
  if (/```\w*\s*\n[\s\S]*?\n```/g.test(text)) {
    return true
  }
  
  // 检查是否有可能的裸露 JSON 工具调用格式
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedLine)
        if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
          return true
        }
      } catch {
        // 忽略解析错误，继续检查其他行
      }
    }
  }
  
  return false
}

/**
 * 获取工具调用的摘要信息（用于日志和调试）
 */
export function summarizeToolCalls(toolCalls: ParsedToolCall[]): string {
  if (toolCalls.length === 0) {
    return '无工具调用'
  }
  
  const summary = toolCalls.map(tc => {
    const argsPreview = typeof tc.arguments === 'object' 
      ? JSON.stringify(tc.arguments).substring(0, 50) + (JSON.stringify(tc.arguments).length > 50 ? '...' : '')
      : String(tc.arguments)
    return `${tc.name}(${argsPreview})`
  }).join(', ')
  
  return `${toolCalls.length} 个工具调用: ${summary}`
}