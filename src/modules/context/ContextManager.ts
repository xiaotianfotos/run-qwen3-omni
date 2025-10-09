import type { ChatCompletionMessage } from '../api/types';

export interface ContextItem {
  id: string;
  type: 'audio' | 'image' | 'text';
  data: any;
  timestamp: number;
}

export interface MessageWithTimestamp {
  message: ChatCompletionMessage;
  timestamp: number;
}

export interface ConversationContext {
  messages: MessageWithTimestamp[];
  contextItems: ContextItem[];
  startTime: number;
}

export class ContextManager {
  private context: ConversationContext;
  private maxContextDuration: number; // 30秒上下文窗口

  constructor(maxContextDuration: number = 30000) { // 30秒
    this.maxContextDuration = maxContextDuration;
    this.context = {
      messages: [],
      contextItems: [],
      startTime: Date.now()
    };
  }

  addAudioChunk(audioData: string, timestamp: number = Date.now()): void {
    // 清理过期数据
    this.cleanupOldItems(timestamp);
    
    // 添加新的音频数据
    this.context.contextItems.push({
      id: `audio_${timestamp}`,
      type: 'audio',
      data: audioData,
      timestamp
    });
  }

  addImageChunk(imageData: string, timestamp: number = Date.now()): void {
    // 清理过期数据
    this.cleanupOldItems(timestamp);
    
    // 添加新的图像数据
    this.context.contextItems.push({
      id: `image_${timestamp}`,
      type: 'image',
      data: imageData,
      timestamp
    });
  }

  addUserMessage(content: string, timestamp: number = Date.now()): void {
    // 清理过期数据
    this.cleanupOldItems(timestamp);
    
    // 添加用户消息
    this.context.messages.push({
      message: {
        role: 'user',
        content: [{
          type: 'text',
          text: content
        }]
      },
      timestamp
    });
  }

  addAssistantMessage(content: string, timestamp: number = Date.now()): void {
    // 清理过期数据
    this.cleanupOldItems(timestamp);
    
    // 添加助手消息
    this.context.messages.push({
      message: {
        role: 'assistant',
        content: [{
          type: 'text',
          text: content
        }]
      },
      timestamp
    });
  }

  getRecentContext(windowMs: number = 30000): ConversationContext {
    const now = Date.now();
    const cutoffTime = now - windowMs;

    // 过滤出最近windowMs时间内的项目
    const recentItems = this.context.contextItems.filter(item => 
      item.timestamp >= cutoffTime
    );

    // 过滤出最近的对话消息
    const recentMessages = this.context.messages.filter(msg => 
      msg.timestamp >= cutoffTime
    );

    // 返回带时间戳的消息结构
    return {
      messages: recentMessages,
      contextItems: recentItems,
      startTime: cutoffTime
    };
  }

  getFullContext(): ConversationContext {
    return { 
      messages: this.context.messages,
      contextItems: this.context.contextItems,
      startTime: this.context.startTime
    };
  }

  getContextSize(): number {
    return this.context.contextItems.length + this.context.messages.length;
  }

  getContextDuration(): number {
    const now = Date.now();
    return now - this.context.startTime;
  }

  clearContext(): void {
    this.context = {
      messages: [],
      contextItems: [],
      startTime: Date.now()
    };
  }

  private cleanupOldItems(currentTime: number = Date.now()): void {
    const cutoffTime = currentTime - this.maxContextDuration;
    
    // 清理过期的上下文项目
    this.context.contextItems = this.context.contextItems.filter(item => 
      item.timestamp >= cutoffTime
    );
    
    // 清理过期的消息
    this.context.messages = this.context.messages.filter(msg => 
      msg.timestamp >= cutoffTime
    );
  }
}