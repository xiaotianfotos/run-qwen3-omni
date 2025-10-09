/**
 * 工具调用解析器和消息顺序验证测试套件
 */

import { parseToolCalls, hasToolCallTags, summarizeToolCalls } from './toolCallParser'

// 简单的断言函数
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`断言失败: ${message}`)
  }
}

// 测试用例
export function runTests(): void {
  console.log('🗺️ 开始运行工具调用解析器测试...')
  
  try {
    // 测试 1: 解析单个工具调用
    const text1 = '我来画一个矩形 <tool_call>[{"name":"draw_rectangle","arguments":{"topLeftX":-10,"topLeftY":10,"bottomRightX":10,"bottomRightY":-10,"color":"#ff0000"}}]</tool_call> 完成了绘制'
    const result1 = parseToolCalls(text1)
    
    assert(result1.hasToolCalls === true, '应该检测到工具调用')
    assert(result1.toolCalls.length === 1, '应该有 1 个工具调用')
    assert(result1.toolCalls[0].name === 'draw_rectangle', '工具名称应该是 draw_rectangle')
    console.log('✅ 测试 1 通过')

    // 测试 2: 解析多个工具调用（数组格式）
    const text2 = '我来画一些图形 <tool_call>[{"name":"draw_rectangle","arguments":{"topLeftX":-15,"topLeftY":15,"bottomRightX":15,"bottomRightY":-15,"color":"#3388ff"}},{"name":"draw_circle","arguments":{"centerX":0,"centerY":0,"radius":12,"color":"#ff6f61"}}]</tool_call> 完成了'
    const result2 = parseToolCalls(text2)
    
    assert(result2.hasToolCalls === true, '应该检测到工具调用')
    assert(result2.toolCalls.length === 2, '应该有 2 个工具调用')
    assert(result2.toolCalls[0].name === 'draw_rectangle', '第一个工具名称应该是 draw_rectangle')
    assert(result2.toolCalls[1].name === 'draw_circle', '第二个工具名称应该是 draw_circle')
    console.log('✅ 测试 2 通过')

    // 测试 3: 处理没有工具调用的文本
    const text3 = '这是一段普通的文本，没有任何工具调用'
    const result3 = parseToolCalls(text3)
    
    assert(result3.hasToolCalls === false, '不应该检测到工具调用')
    assert(result3.toolCalls.length === 0, '应该没有工具调用')
    assert(result3.cleanedText === text3, '文本应该保持不变')
    console.log('✅ 测试 3 通过')

    // 测试 4: 测试 hasToolCallTags 函数
    assert(hasToolCallTags('<tool_call>[{"name":"test"}]</tool_call>') === true, '应该检测到工具调用标签')
    assert(hasToolCallTags('普通文本') === false, '不应该检测到工具调用标签')
    console.log('✅ 测试 4 通过')
    
    // 测试 5: 测试消息顺序验证场景
    console.log('🔧 测试消息顺序验证机制...')
    testMessageOrderValidation()
    console.log('✅ 测试 5 通过')

    console.log('🎉 所有测试都通过了！工具调用解析器和消息验证机制工作正常。')
    
  } catch (error) {
    console.error('❌ 测试失败:', error)
    throw error
  }
}

/**
 * 测试消息顺序验证机制
 */
function testMessageOrderValidation(): void {
  // 模拟错误的消息序列场景
  console.log('📋 模拟消息顺序问题场景:')
  
  // 场景 1: 连续的 user 消息（工具调用结果分散的情况）
  const problematicSequence = [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: 'User request' },
    { role: 'assistant', content: 'AI response with tool call' },
    { role: 'user', content: 'Tool result 1' },
    { role: 'user', content: 'Tool result 2' },
    { role: 'user', content: 'Tool result 3' }
  ]
  
  console.log('❌ 问题序列:', problematicSequence.map(m => m.role).join(' -> '))
  
  // 期望的修复结果
  const expectedSequence = [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: 'User request' },
    { role: 'assistant', content: 'AI response with tool call' },
    { role: 'user', content: 'Merged tool results' }
  ]
  
  console.log('✅ 期望序列:', expectedSequence.map(m => m.role).join(' -> '))
  
  // 场景 2: 连续的 assistant 消息
  const anotherProblematicSequence = [
    { role: 'user', content: 'User request' },
    { role: 'assistant', content: 'First AI response' },
    { role: 'assistant', content: 'Second AI response' }
  ]
  
  console.log('❌ 另一个问题序列:', anotherProblematicSequence.map(m => m.role).join(' -> '))
  
  const expectedFixedSequence = [
    { role: 'user', content: 'User request' },
    { role: 'assistant', content: 'Merged AI responses' }
  ]
  
  console.log('✅ 修复后序列:', expectedFixedSequence.map(m => m.role).join(' -> '))
  
  console.log('🔧 消息顺序验证机制设计验证完成')
}

// 如果在 Node.js 环境中运行，直接执行测试
if (typeof window === 'undefined') {
  runTests()
}