import { type Message } from './LLM';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type: 'text' | 'audio' | 'image' | 'tool';
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  toolCallId?: string;
  audioData?: string; // base64 音频数据
  imageData?: string; // base64 图片数据
}

export class ConversationHistory {
  private messages: ChatMessage[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 50) {
    this.maxHistorySize = maxHistorySize;
  }

  addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    type: 'text' | 'audio' | 'image' | 'tool' = 'text',
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;
    }>,
    toolCallId?: string,
    audioData?: string, // base64 音频数据
    imageData?: string  // base64 图片数据
  ): void {
    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      type,
      toolCalls,
      toolCallId,
      audioData,
      imageData
    };

    this.messages.push(message);

    // 限制历史记录大小，但保护第一条 system 消息
    if (this.messages.length > this.maxHistorySize) {
      // 查找第一条 system 消息
      const systemMessageIndex = this.messages.findIndex(msg => msg.role === 'system');
      let systemMessage: ChatMessage | undefined;
      
      if (systemMessageIndex !== -1) {
        systemMessage = this.messages[systemMessageIndex];
      }

      // 计算需要保留的消息数量
      const messagesToKeep = this.maxHistorySize;
      
      if (systemMessage) {
        // 如果有 system 消息，确保它始终被保留
        // 移除 system 消息，然后保留最后的 N-1 条消息，最后重新添加 system 消息到开头
        this.messages.splice(systemMessageIndex, 1);
        this.messages = this.messages.slice(-(messagesToKeep - 1));
        this.messages.unshift(systemMessage);
      } else {
        // 如果没有 system 消息，直接保留最后的 N 条消息
        this.messages = this.messages.slice(-messagesToKeep);
      }
    }
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getRecentMessages(limit: number = 10): ChatMessage[] {
    return this.messages.slice(-limit);
  }

  getMessagesForLLM(sendHistoryImages: boolean = false, sendHistoryAudio: boolean = false): Message[] {
    return this.messages.map(msg => {
      const content: Message['content'] = [{
        type: 'text',
        text: msg.content
      }];

      // 如果是用户消息且包含图片，并且允许发送历史图片，则添加图片
      if (msg.role === 'user' && msg.type === 'image' && sendHistoryImages && msg.imageData) {
        content.push({
          type: 'image_url',
          image_url: { url: msg.imageData }
        });
      }

      // 如果是用户消息且包含音频，并且允许发送历史音频，则添加音频
      if (msg.role === 'user' && msg.type === 'audio' && sendHistoryAudio && msg.audioData) {
        const normalized = this.normalizeAudioForLLM(msg.audioData)
        if (normalized) {
          content.push({
            type: 'input_audio',
            input_audio: normalized
          });
        }
      }

      const result: Message = {
        role: msg.role,
        content
      };

      // 如果是包含工具调用的assistant消息，添加tool_calls
      if (msg.role === 'assistant' && msg.toolCalls) {
        result.tool_calls = msg.toolCalls.map(toolCall => ({
          id: toolCall.id,
          type: 'function' as const,
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments
          }
        }));
      }

      // 如果是工具响应消息，添加tool_call_id
      if (msg.toolCallId) {
        result.tool_call_id = msg.toolCallId;
      }

      return result;
    });
  }

  // 将历史中的音频字符串（可能为 data URL 或纯 base64）转换为 LLM 可用的 {data, format}
  private normalizeAudioForLLM(source: string): { data: string; format: 'wav' | 'mp3' } | null {
    const s = (source || '').trim()
    if (!s) return null

    // data:audio/<subtype>;base64,<payload>
    const m = s.match(/^data:audio\/([^;]+);base64,(.+)$/i)
    if (m) {
      const subtype = m[1].toLowerCase()
      const payload = m[2]
      const format: 'wav' | 'mp3' = subtype.includes('wav') ? 'wav' : 'mp3'
      return { data: payload, format }
    }

    // data:;base64,<payload>
    const m2 = s.match(/^data:;base64,(.+)$/i)
    if (m2) {
      return { data: m2[1], format: 'wav' }
    }

    // 纯 base64，默认 wav
    if (/^[A-Za-z0-9+/=]+$/.test(s)) {
      return { data: s, format: 'wav' }
    }
    return null
  }

  clear(): void {
    this.messages = [];
  }

  getLength(): number {
    return this.messages.length;
  }

  getMaxHistorySize(): number {
    return this.maxHistorySize;
  }

  removeMessage(id: string): boolean {
    const initialLength = this.messages.length;
    this.messages = this.messages.filter(msg => msg.id !== id);
    return this.messages.length < initialLength;
  }

  getLastMessage(): ChatMessage | undefined {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : undefined;
  }

  addAssistantMessage(content: string, toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>): void {
    this.addMessage('assistant', content, 'text', toolCalls);
  }

  addUserMessage(content: string, audioData?: string, imageData?: string): void {
    const type = audioData ? 'audio' : (imageData ? 'image' : 'text');
    this.addMessage('user', content, type, undefined, undefined, audioData, imageData);
  }

  addToolMessage(content: string, toolCallId?: string): void {
    this.addMessage('user', content, 'tool', undefined, toolCallId);
  }
}
