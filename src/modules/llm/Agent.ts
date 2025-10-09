import { LLM, type LLMConfig, type GenerationResult } from './LLM';
import { ConversationHistory } from './ConversationHistory';

export interface AgentConfig extends LLMConfig {
  systemPrompt?: string;
  sendHistoryImages?: boolean;
}

export class Agent {
  private llm: LLM;
  private conversationHistory: ConversationHistory;
  private systemPrompt: string;
  private sendHistoryImages: boolean;

  constructor(config: AgentConfig) {
    const { systemPrompt = '', sendHistoryImages = false, ...llmConfig } = config;
    this.systemPrompt = systemPrompt;
    this.sendHistoryImages = sendHistoryImages;
    this.conversationHistory = new ConversationHistory(30); // 限制最近30条消息
    this.llm = new LLM(llmConfig);

    // 如果提供了系统提示词，添加到历史记录中
    if (this.systemPrompt) {
      this.conversationHistory.addMessage('system', this.systemPrompt, 'text');
    }
  }

  async *generate(userInput: string, images?: string[], audioData?: string): AsyncGenerator<GenerationResult> {
    // 将用户输入添加到历史记录
    this.conversationHistory.addUserMessage(userInput);

    // 构建完整的消息上下文，根据配置决定是否发送历史图片
    const messages = this.conversationHistory.getMessagesForLLM(this.sendHistoryImages);

    // 调用LLM生成回复
    for await (const result of this.llm.generate(messages, images, audioData)) {
      if (result.finished) {
        // 生成完成时，将完整的助手回复添加到历史记录
        if (result.text) {
          this.conversationHistory.addAssistantMessage(result.text);
        }
      }
      yield result;
    }
  }

  async *generateWithLatestScreenshots(userInput: string, screenshotManager: any): AsyncGenerator<GenerationResult> {
    // 获取最新的截图
    const latestScreenshots = screenshotManager.getLatestScreenshots(10); // 获取最新的10张截图
    const screenshotUrls = latestScreenshots.map((screenshot: { image: string }) => screenshot.image);

    // 调用生成方法
    for await (const result of this.generate(userInput, screenshotUrls)) {
      yield result;
    }
  }

  getConversationHistory(): any[] {
    return this.conversationHistory.getMessages();
  }

  clearHistory(): void {
    this.conversationHistory.clear();
    
    // 如果有系统提示词，重新添加
    if (this.systemPrompt) {
      this.conversationHistory.addMessage('system', this.systemPrompt, 'text');
    }
  }

  updateSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
    this.conversationHistory.clear();
    
    // 重新添加系统提示词
    if (this.systemPrompt) {
      this.conversationHistory.addMessage('system', this.systemPrompt, 'text');
    }
  }

  updateConfig(config: Partial<AgentConfig>): void {
    if (config.systemPrompt !== undefined) {
      this.updateSystemPrompt(config.systemPrompt);
    }

    if (config.sendHistoryImages !== undefined) {
      this.sendHistoryImages = config.sendHistoryImages;
    }

    // 为LLM更新配置（排除systemPrompt和sendHistoryImages）
    const { systemPrompt, sendHistoryImages, ...llmConfig } = config;
    this.llm.updateConfig(llmConfig);
  }
}