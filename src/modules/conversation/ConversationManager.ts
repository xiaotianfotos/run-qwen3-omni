import { EventEmitter } from 'eventemitter3'
import type { ChatCompletionMessage } from '@/modules/api/types'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  type: 'text' | 'audio'
}

export interface ConversationSession {
  id: string
  title: string
  messages: ConversationMessage[]
  createdAt: number
  updatedAt: number
}

export class ConversationManager extends EventEmitter {
  private currentSession: ConversationSession | null = null
  private sessions: Map<string, ConversationSession> = new Map()
  private maxHistoryRounds: number = 5 // 默认最多5轮历史记录

  constructor() {
    super()
  }

  // 创建新会话
  createSession(title?: string): ConversationSession {
    const sessionId = this.generateId()
    const session: ConversationSession = {
      id: sessionId,
      title: title || `会话 ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.sessions.set(sessionId, session)
    this.currentSession = session
    this.emit('sessionCreated', session)
    
    return session
  }

  // 切换到指定会话
  switchToSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.currentSession = session
      this.emit('sessionSwitched', session)
      return true
    }
    return false
  }

  // 获取当前会话
  getCurrentSession(): ConversationSession | null {
    return this.currentSession
  }

  // 添加消息到当前会话
  addMessage(role: 'user' | 'assistant' | 'system', content: string, type: 'text' | 'audio' = 'text'): ConversationMessage | null {
    if (!this.currentSession) {
      console.warn('No active session, creating new session')
      this.createSession()
    }

    const message: ConversationMessage = {
      id: this.generateId(),
      role,
      content,
      timestamp: Date.now(),
      type
    }

    this.currentSession!.messages.push(message)
    this.currentSession!.updatedAt = Date.now()

    // 应用历史轮次限制
    this.applyHistoryLimit()

    this.emit('messageAdded', message, this.currentSession!)

    return message
  }

  // 添加用户文本消息
  addUserMessage(content: string): ConversationMessage | null {
    return this.addMessage('user', content, 'text')
  }

  // 添加助手文本消息
  addAssistantMessage(content: string): ConversationMessage | null {
    return this.addMessage('assistant', content, 'text')
  }

  // 添加系统消息
  addSystemMessage(content: string): ConversationMessage | null {
    return this.addMessage('system', content, 'text')
  }

  // 播放语音（这里只是标记，实际播放在AudioManager中处理）
  playAudioResponse(audioData: ArrayBuffer): void {
    // 语音不需要保存到聊天历史，直接播放
    this.emit('audioResponseReceived', audioData)
  }

  // 获取会话的聊天消息（用于发送给LLM）
  getChatMessages(sessionId?: string): ChatCompletionMessage[] {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession
    if (!session) return []

    return session.messages
      .filter(msg => msg.type === 'text') // 只包含文本消息
      .map(msg => ({
        role: msg.role,
        content: [{
          type: 'text' as const,
          text: msg.content
        }]
      }))
  }

  // 获取所有会话
  getAllSessions(): ConversationSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // 删除会话
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.sessions.delete(sessionId)
      
      // 如果删除的是当前会话，清空当前会话
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null
      }
      
      this.emit('sessionDeleted', sessionId)
      return true
    }
    return false
  }

  // 更新会话标题
  updateSessionTitle(sessionId: string, title: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.title = title
      session.updatedAt = Date.now()
      this.emit('sessionUpdated', session)
      return true
    }
    return false
  }

  // 清空当前会话
  clearCurrentSession(): void {
    if (this.currentSession) {
      this.currentSession.messages = []
      this.currentSession.updatedAt = Date.now()
      this.emit('sessionCleared', this.currentSession)
    }
  }

  // 设置最大历史轮次
  setMaxHistoryRounds(rounds: number): void {
    this.maxHistoryRounds = Math.max(1, rounds) // 至少保留1轮
    this.emit('maxHistoryRoundsChanged', this.maxHistoryRounds)
  }

  // 获取当前最大历史轮次
  getMaxHistoryRounds(): number {
    return this.maxHistoryRounds
  }

  // 导出会话数据
  exportSession(sessionId: string): string | null {
    const session = this.sessions.get(sessionId)
    if (session) {
      return JSON.stringify(session, null, 2)
    }
    return null
  }

  // 导入会话数据
  importSession(sessionData: string): boolean {
    try {
      const session: ConversationSession = JSON.parse(sessionData)
      
      // 验证数据结构
      if (session.id && session.messages && Array.isArray(session.messages)) {
        this.sessions.set(session.id, session)
        this.emit('sessionImported', session)
        return true
      }
    } catch (error) {
      console.error('Failed to import session:', error)
    }
    return false
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // 应用历史轮次限制
  private applyHistoryLimit(): void {
    if (!this.currentSession) return

    const messages = this.currentSession.messages
    const maxMessages = this.maxHistoryRounds * 2 // 每轮包含用户和助手两条消息

    if (messages.length > maxMessages) {
      // 查找第一条 system 消息
      const systemMessageIndex = messages.findIndex(msg => msg.role === 'system')
      let systemMessage: ConversationMessage | undefined
      
      if (systemMessageIndex !== -1) {
        systemMessage = messages[systemMessageIndex]
      }

      // 计算需要移除的消息数量
      const removedCount = messages.length - maxMessages
      let removedMessages: ConversationMessage[]

      if (systemMessage && systemMessageIndex < removedCount) {
        // 如果 system 消息在要删除的范围内，先保护它
        // 从 system 消息后开始删除，然后删除足够的消息
        removedMessages = messages.splice(systemMessageIndex + 1, removedCount)
        // 如果还需要删除更多消息，从头部删除非 system 消息
        if (messages.length > maxMessages) {
          const additionalToRemove = messages.length - maxMessages
          const additionalRemoved = messages.splice(0, additionalToRemove)
          removedMessages = [...additionalRemoved, ...removedMessages]
        }
      } else {
        // system 消息不在删除范围内，或者没有 system 消息，正常删除
        removedMessages = messages.splice(0, removedCount)
      }

      // 确保 system 消息始终在第一位（如果存在）
      if (systemMessage && messages[0]?.role !== 'system') {
        const currentSystemIndex = messages.findIndex(msg => msg.role === 'system')
        if (currentSystemIndex > 0) {
          const systemMsg = messages.splice(currentSystemIndex, 1)[0]
          messages.unshift(systemMsg)
        }
      }

      this.emit('messagesTrimmed', removedMessages, this.currentSession)
      console.log(`📝 已清理 ${removedMessages.length} 条历史消息，保留最近 ${this.maxHistoryRounds} 轮对话，系统消息已保护`)
    }
  }
}