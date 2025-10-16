import { EventEmitter } from 'eventemitter3'
import {
  LLM,
  type LLMConfig,
  type ToolCall,
  type ToolCallLifecycleHooks
} from '../llm/LLM'
import { ConversationHistory } from '../llm/ConversationHistory'
import type { ChatCompletionMessage } from '../api/types'
import { parseToolCalls, hasToolCallTags } from '../tools/toolCallParser'

type MessageContent = ChatCompletionMessage['content']

export interface AgentConfig {
  systemPrompt: string
  llmConfig: LLMConfig
  name?: string
  description?: string
  sendHistoryImages?: boolean
  sendHistoryAudio?: boolean  // 新增：是否发送历史音频
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  images?: string[] // base64 encoded images
  audio?: string    // base64 encoded audio
  timestamp: number
}

export interface AgentResponse {
  text: string
  accumulatedText?: string
  audio?: ArrayBuffer
  audioChunk?: ArrayBuffer
  finished: boolean
  usage?: any
  toolCalls?: any[]
  toolResultsText?: string
}

export class Agent extends EventEmitter {
  private llm: LLM
  private config: AgentConfig
  private conversationHistory: ConversationHistory
  private lastFullResponseText: string = ''
  private lastFullAudio?: ArrayBuffer
  private sendHistoryImages: boolean
  private sendHistoryAudio: boolean  // 新增：历史音频配置
  private currentRoundContent: MessageContent | null = null
  private toolsEnabled = true

  constructor(config: AgentConfig) {
    super()
    this.config = config
    this.llm = new LLM(config.llmConfig)
    this.sendHistoryImages = config.sendHistoryImages ?? false
    this.sendHistoryAudio = config.sendHistoryAudio ?? false  // 初始化历史音频配置
    this.conversationHistory = new ConversationHistory(30)

    this.addSystemMessage(config.systemPrompt)
  }

  setToolsEnabled(enabled: boolean): void {
    this.toolsEnabled = enabled
  }

  async sendTextMessage(content: string): Promise<void> {
    if (!content.trim()) {
      return
    }

    this.conversationHistory.addUserMessage(content)
    await this.consumeResponseStream()
  }

  async sendMultiModalMessage(options: {
    text?: string
    images?: string[]
    videos?: string[]
    audio?: string
    audios?: string[]
  }): Promise<void> {
    const contentParts = this.buildContentParts(options)

    if (contentParts.length === 0) {
      console.warn('Agent.receive called without content')
      return
    }

    // 存储当前轮次的多模态内容
    this.currentRoundContent = contentParts

    // 保存用户消息到历史记录，包含音频和图片数据
    const textContent = options.text || ''
    // 历史仅保存一个音频和一张图片（与现有策略一致）
    const audioData = options.audio ?? (options.audios && options.audios.length > 0 ? options.audios[0] : undefined)
    const imageData = options.images?.[0]
    
    this.conversationHistory.addUserMessage(textContent, audioData, imageData)

    await this.consumeResponseStream()
  }

  async *generate(userInput: string, images?: string[], audioData?: string): AsyncGenerator<AgentResponse> {
    const contentParts = this.buildContentParts({
      text: userInput,
      images,
      audio: audioData
    })

    if (contentParts.length === 0) {
      return
    }

    // 存储当前轮次的多模态内容
    this.currentRoundContent = contentParts

    // 对于多模态消息，我们需要将内容转换为字符串格式存储
    // 图片和音频信息会在发送时通过过滤逻辑处理
    const textContent = userInput || ''
    this.conversationHistory.addUserMessage(textContent)

    for await (const chunk of this.streamResponse()) {
      yield chunk
    }
  }

  private async consumeResponseStream(): Promise<void> {
    try {
      for await (const _ of this.streamResponse()) {
        // Exhaust the generator to keep legacy fire-and-forget behaviour
      }
    } catch (error) {
      console.error('Error consuming agent response:', error)
      throw error
    }
  }

  private async *streamResponse(): AsyncGenerator<AgentResponse> {
    this.emit('responseStarted')
    this.lastFullResponseText = ''
    this.lastFullAudio = undefined

    try {
      // 使用过滤后的消息历史（根据配置决定是否包含历史图片和音频）
      const filteredMessages = this.conversationHistory.getMessagesForLLM(this.sendHistoryImages, this.sendHistoryAudio)

      // 构建完整的消息数组，包含当前轮次的多模态内容
      const messages = [...filteredMessages]

      // 如果当前轮次有多模态内容，替换最后一个用户消息（当前轮次）
      if (this.currentRoundContent) {
        // 找到最后一个用户消息的索引
        const lastUserMessageIndex = messages.map((msg, index) =>
          msg.role === 'user' ? index : -1
        ).filter(index => index !== -1).pop()

        if (lastUserMessageIndex !== undefined) {
          // 替换最后一个用户消息为当前轮次的多模态内容
          messages[lastUserMessageIndex] = {
            role: 'user',
            content: this.currentRoundContent
          }
        } else {
          // 如果没有用户消息，添加当前轮次的内容
          messages.push({
            role: 'user',
            content: this.currentRoundContent
          })
        }
      }

      let encounteredToolCall = false
      let toolResultsRecorded = false

      for await (const result of this.llm.generate(messages, undefined, undefined, this.toolsEnabled)) {
        const nextFullText = this.lastFullResponseText + (result.text || '')
        this.lastFullResponseText = nextFullText

        const response: AgentResponse = {
          text: result.text || '',
          accumulatedText: nextFullText,
          audio: result.audio,
          audioChunk: result.audioChunk,
          finished: result.finished,
          usage: result.usage,
          toolCalls: result.toolCalls,
          toolResultsText: result.toolResultsText
        }

        if (result.audio) {
          this.lastFullAudio = result.audio
        }

        this.emit('responseChunk', response)
        yield response

        // 处理工具调用 - 使用文本解析方式
        if (this.toolsEnabled && result.toolCalls && result.toolCalls.length > 0) {
          console.log('🛠️ 检测到工具调用:', result.toolCalls)
          encounteredToolCall = true

          // 🔥 先保存工具调用的assistant消息到历史记录
          // 注意：保持原始响应内容不变，不要用描述性文本替换
          this.conversationHistory.addAssistantMessage(
            this.lastFullResponseText.trim() || '',
            result.toolCalls.map(tc => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments
            }))
          )

          const lifecycleHooks: ToolCallLifecycleHooks = {
            onStart: (toolCall) => {
              this.emit('toolCallStarted', toolCall)
            },
            onSuccess: (toolCall, response) => {
              // 🔧 不再单独保存每个工具响应到历史记录
              // 因为 LLM.processToolCalls() 已经将所有工具调用结果合并到一条消息中
              this.emit('toolCallCompleted', { toolCall, response })
            },
            onError: (toolCall, error) => {
              // 🔧 不再单独保存错误消息到历史记录
              // 错误会在合并的工具调用结果中体现
              this.emit('toolCallFailed', { toolCall, error })
            }
          }

          // 记录当前累计文本长度，用于提取工具调用完成后的新增回复
          const baselineLength = this.lastFullResponseText.length

          // 处理工具调用并继续对话
          for await (const toolResult of this.llm.processToolCalls(
            result.toolCalls,
            this.convertToLLMMessages(filteredMessages),
            lifecycleHooks,
            this.lastFullResponseText.trim() // 传入原始的assistant响应内容
          )) {
            if (toolResult.toolResultsText && !toolResultsRecorded) {
              const summarized = toolResult.toolResultsText.trim()
              if (summarized) {
                this.conversationHistory.addToolMessage(summarized)
              }
              toolResultsRecorded = true
            }

            // 更新累积的文本内容
            if (toolResult.text) {
              this.lastFullResponseText += toolResult.text
            }

            const toolResponse: AgentResponse = {
              text: toolResult.text || '',
              accumulatedText: this.lastFullResponseText,
              audio: toolResult.audio,
              audioChunk: toolResult.audioChunk,
              finished: toolResult.finished,
              usage: toolResult.usage,
              toolCalls: toolResult.toolCalls,
              toolResultsText: toolResult.toolResultsText
            }

            this.emit('responseChunk', toolResponse)
            yield toolResponse

            if (toolResult.finished) {
              break
            }
          }

          // 🔥 提取工具调用处理后的新增助手回复，确保作为独立消息保存
          const followUpText = this.lastFullResponseText.slice(baselineLength).trim()
          if (followUpText) {
            this.conversationHistory.addAssistantMessage(followUpText)
            console.log('📝 工具调用后的结束语已保存为新的assistant消息:', followUpText.substring(0, 50) + '...')
          }
        }

        if (result.finished) {
          // 🔧 修复：如果没有工具调用，正常保存assistant消息
          // 如果有工具调用，则已经在上面的工具调用处理中保存了
          if (!encounteredToolCall) {
            if (this.lastFullResponseText.trim()) {
              this.conversationHistory.addAssistantMessage(
                this.lastFullResponseText.trim()
              )
            }
          }

          // 重置当前轮次内容
          this.currentRoundContent = null

          this.emit('responseCompleted', {
            text: this.lastFullResponseText,
            audio: this.lastFullAudio,
            finished: true,
            usage: result.usage
          })
          break
        }
      }
    } catch (error) {
      // 重置当前轮次内容
      this.currentRoundContent = null
      this.emit('responseError', error as Error)
      throw error
    }
  }

  private buildContentParts(options: { text?: string; images?: string[]; videos?: string[]; audio?: string; audios?: string[] }): MessageContent {
    const parts: MessageContent = []

    if (options.text && options.text.trim()) {
      parts.push({
        type: 'text',
        text: options.text.trim()
      })
    }

    if (options.images && options.images.length > 0) {
      console.log(`🖼️ Agent: 处理 ${options.images.length} 个图片`)
      options.images.forEach(rawImage => {
        if (!rawImage) return
        const imageSource = rawImage.trim()
        if (!imageSource) return

        const isPrefixedDataUrl = imageSource.startsWith('data:')
        const isHttpUrl = /^https?:\/\//i.test(imageSource)
        const url = isPrefixedDataUrl || isHttpUrl
          ? imageSource
          : `data:image/jpeg;base64,${imageSource}`

        parts.push({
          type: 'image_url',
          image_url: { url }
        })
      })
    }

    // 处理视频文件
    if (options.videos && options.videos.length > 0) {
      console.log(`🎬 Agent: 处理 ${options.videos.length} 个视频，使用 video_url 类型`)
      options.videos.forEach((rawVideo, index) => {
        if (!rawVideo) return
        const videoSource = rawVideo.trim()
        if (!videoSource) return

        // 确保视频数据是完整的 data URL 格式
        const isPrefixedDataUrl = videoSource.startsWith('data:')
        const url = isPrefixedDataUrl ? videoSource : `data:video/mp4;base64,${videoSource}`

        // 提取 MIME 类型用于日志
        const mimeMatch = url.match(/^data:([^;]+)/)
        const mimeType = mimeMatch ? mimeMatch[1] : 'unknown'

        console.log(`  • 视频 ${index + 1}: 类型=${mimeType}, 大小=${(url.length / 1024).toFixed(2)}KB`)

        parts.push({
          type: 'video_url',
          video_url: { url }
        })
      })
    }

    // 处理单个音频（兼容旧参数）
    if (options.audio) {
      const normalized = this.normalizeAudioData(options.audio)
      if (normalized) {
        parts.push({
          type: 'input_audio',
          input_audio: normalized
        })
      }
    }

    // 处理多个音频
    if (options.audios && options.audios.length > 0) {
      console.log(`🎵 Agent: 处理 ${options.audios.length} 个音频`)
      options.audios.forEach((rawAudio, index) => {
        const normalized = this.normalizeAudioData(rawAudio)
        if (!normalized) return
        console.log(`  • 音频 ${index + 1}: format=${normalized.format}, size=${(normalized.data.length/1024).toFixed(2)}KB`)
        parts.push({
          type: 'input_audio',
          input_audio: normalized
        })
      })
    }

    return parts
  }

  // 将 data URL 或纯 base64 的音频归一化为 {data, format}
  private normalizeAudioData(source: string | undefined): { data: string; format: 'wav' | 'mp3' } | null {
    if (!source) return null
    const s = source.trim()
    if (!s) return null

    // data URL: data:audio/<subtype>;base64,<payload>
    const m = s.match(/^data:audio\/([^;]+);base64,(.+)$/i)
    if (m) {
      const subtype = m[1].toLowerCase()
      const payload = m[2]
      const format: 'wav' | 'mp3' = subtype.includes('wav') ? 'wav' : 'mp3' // mp3 常见为 mpeg
      return { data: payload, format }
    }

    // 如果是 data:;base64,<payload>
    const m2 = s.match(/^data:;base64,(.+)$/i)
    if (m2) {
      return { data: m2[1], format: 'wav' }
    }

    // 纯 base64 字符串，默认当作 wav
    if (/^[A-Za-z0-9+/=]+$/.test(s)) {
      return { data: s, format: 'wav' }
    }

    console.warn('无法识别的音频数据格式，已忽略')
    return null
  }

  private addSystemMessage(content: string): void {
    if (!content.trim()) {
      return
    }

    this.conversationHistory.addMessage('system', content.trim(), 'text')
  }

  private addUserMessage(content: string): void {
    if (!content.trim()) {
      return
    }

    this.conversationHistory.addUserMessage(content.trim())
  }

  private addAssistantMessage(content: string): void {
    if (!content.trim()) {
      return
    }

    this.conversationHistory.addAssistantMessage(content.trim())
  }

  getConversationHistory(): ChatCompletionMessage[] {
    // Convert ConversationHistory messages to ChatCompletionMessage format
    const messages = this.conversationHistory.getMessages()
    return messages.map(msg => ({
      role: msg.role,
      content: [{
        type: 'text' as const,
        text: msg.content
      }]
    }))
  }

  clearConversationHistory(): void {
    const messages = this.conversationHistory.getMessages()
    const systemMessage = messages.find(msg => msg.role === 'system')

    // Create new ConversationHistory instance
    this.conversationHistory = new ConversationHistory(30)

    // Re-add system message if it exists
    if (systemMessage) {
      this.conversationHistory.addMessage('system', systemMessage.content, 'text')
    }

    this.emit('historyCleared')
  }

  updateSystemPrompt(newPrompt: string): void {
    this.config.systemPrompt = newPrompt

    // Clear and recreate conversation history with new system prompt
    this.conversationHistory = new ConversationHistory(30)
    this.addSystemMessage(newPrompt)

    this.emit('systemPromptUpdated', newPrompt)
  }

  updateLLMConfig(newConfig: Partial<LLMConfig>): void {
    this.llm.updateConfig(newConfig)
    this.config.llmConfig = { ...this.config.llmConfig, ...newConfig }
    this.emit('llmConfigUpdated', this.config.llmConfig)
  }

  updateConfig(newConfig: Partial<AgentConfig>): void {
    if (newConfig.sendHistoryImages !== undefined) {
      this.sendHistoryImages = newConfig.sendHistoryImages
      console.log(`🖼️ Agent sendHistoryImages 更新为: ${this.sendHistoryImages}`)
    }
    
    if (newConfig.sendHistoryAudio !== undefined) {
      this.sendHistoryAudio = newConfig.sendHistoryAudio
      console.log(`🎵 Agent sendHistoryAudio 更新为: ${this.sendHistoryAudio}`)
    }

    if (newConfig.systemPrompt !== undefined) {
      this.updateSystemPrompt(newConfig.systemPrompt)
    }

    if (newConfig.llmConfig !== undefined) {
      this.updateLLMConfig(newConfig.llmConfig)
    }
  }

  getConfig(): AgentConfig {
    return { ...this.config }
  }

  getInfo(): { name: string; description: string; messageCount: number } {
    return {
      name: this.config.name || 'AI Assistant',
      description: this.config.description || 'A helpful AI assistant',
      messageCount: this.conversationHistory.getLength()
    }
  }

  exportHistory(): string {
    return JSON.stringify(this.conversationHistory.getMessages(), null, 2)
  }

  importHistory(historyJson: string): boolean {
    try {
      const history = JSON.parse(historyJson)
      if (Array.isArray(history)) {
        // Create new ConversationHistory and import messages
        this.conversationHistory = new ConversationHistory(30)
        history.forEach(msg => {
          if (msg.role && msg.content) {
            this.conversationHistory.addMessage(msg.role, msg.content, 'text')
          }
        })
        this.emit('historyImported', history)
        return true
      }
    } catch (error) {
      console.error('Failed to import history:', error)
    }
    return false
  }

  // 设置会话历史大小
  setMaxHistorySize(size: number): void {
    // 获取旧消息
    const oldMessages = this.conversationHistory.getMessages()
    // 查找system消息
    const systemMessage = oldMessages.find(msg => msg.role === 'system')
    
    // 创建新的ConversationHistory实例
    this.conversationHistory = new ConversationHistory(size)
    
    // 首先添加system消息（如果存在）
    if (systemMessage) {
      this.conversationHistory.addMessage(systemMessage.role, systemMessage.content, systemMessage.type, systemMessage.toolCalls, systemMessage.toolCallId)
    }
    
    // 然后按顺序添加其他消息，但跳过已添加的system消息
    oldMessages.forEach(msg => {
      if (msg.role !== 'system') {
        this.conversationHistory.addMessage(msg.role, msg.content, msg.type, msg.toolCalls, msg.toolCallId)
      }
    })
    
    console.log('📁 Agent conversation history size set to:', size, '(system message protected)')
  }

  // 获取当前历史大小限制
  getMaxHistorySize(): number {
    return this.conversationHistory.getMaxHistorySize()
  }

  // 注册工具
  registerTools(tools: any[]): void {
    this.llm.registerTools(tools)
    console.log(`🔧 Agent 注册了 ${tools.length} 个工具`)
  }

  // 将ConversationHistory消息转换为LLM消息格式
  private convertToLLMMessages(messages: any[]): any[] {
    return messages.map(msg => {
      // 如果消息已经是LLM格式（content是数组），直接返回
      if (Array.isArray(msg.content)) {
        return msg;
      }
      
      // 否则转换为LLM格式
      const result: any = {
        role: msg.role,
        content: [{
          type: 'text',
          text: msg.content
        }]
      };
      
      // 保留其他字段（如tool_calls, tool_call_id等）
      if (msg.tool_calls) {
        result.tool_calls = msg.tool_calls;
      }
      if (msg.tool_call_id) {
        result.tool_call_id = msg.tool_call_id;
      }
      
      return result;
    })
  }

  dispose(): void {
    this.clearConversationHistory()
    this.removeAllListeners()
  }
}
