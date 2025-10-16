import OpenAI from 'openai';
import { markRaw } from 'vue';
import { parseToolCalls, hasToolCallTags, type ParsedToolCall } from '../tools/toolCallParser';

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  voice?: string;
  format?: string;
  temperature?: number;
  maxTokens?: number;
  providerId?: string; // 供应商标识，用于特定格式处理
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image_url' | 'input_audio' | 'video_url' | 'audio_url';
    text?: string;
    image_url?: { url: string };
    input_audio?: { data: string; format: string };
    audio_url?: { url: string };
    video_url?: { url: string }; // base64 encoded video data URL
  }>;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

export interface GenerationResult {
  text: string;
  audio?: ArrayBuffer;
  audioChunk?: ArrayBuffer;
  finished: boolean;
  usage?: any;
  toolCalls?: ToolCall[];
  toolResultsText?: string;
}

export interface ToolSchemaProperty {
  type: string | string[];
  description: string;
  enum?: string[];
  properties?: Record<string, ToolSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, ToolSchemaProperty>;
  required?: string[];
  anyOf?: Array<{ required: string[] }>;
  [key: string]: unknown;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolSchema;
  handler: (args: any) => Promise<any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface ToolResponse {
  tool_call_id: string;
  name: string;
  content: string;
}

export interface ToolCallLifecycleHooks {
  onStart?: (toolCall: ToolCall) => void;
  onSuccess?: (toolCall: ToolCall, response: ToolResponse) => void;
  onError?: (toolCall: ToolCall, error: unknown) => void;
}

export class LLM {
  private openai: OpenAI;
  private config: LLMConfig;
  private tools: Map<string, Tool> = new Map();

  constructor(config: LLMConfig) {
    this.config = {
      voice: 'Cherry', // 默认音色
      format: 'wav', // 默认音频格式
      temperature: 0.9, // 默认温度
      maxTokens: undefined, // 默认无限制
      ...config
    };

    try {
      this.openai = markRaw(new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        dangerouslyAllowBrowser: true
      }));
    } catch (error) {
      console.error('❌ OpenAI客户端初始化失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI客户端初始化失败: ${errorMessage}`);
    }
  }

  async *generate(messages: Message[], images?: string[], audioData?: string, enableTools: boolean = false): AsyncGenerator<GenerationResult> {
    // 构建消息数组
    const processedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(msg => {
      const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [];

      for (const item of msg.content) {
        if (item.type === 'text' && item.text) {
          contentParts.push({ type: 'text', text: item.text });
          continue;
        }

        if (item.type === 'image_url' && item.image_url) {
          contentParts.push({ type: 'image_url', image_url: { url: item.image_url.url } });
          continue;
        }

        // 处理输入音频，进行规范化（支持 wav/mp3，数据为base64）
        if (item.type === 'input_audio' && (item as any).input_audio) {
          const src = (item as any).input_audio as { data: string; format?: string };
          const normalized = this.normalizeInputAudio(src.data, (src.format || 'wav'));
          if (normalized) {
            contentParts.push({
              type: 'input_audio',
              input_audio: normalized
            } as unknown as OpenAI.Chat.ChatCompletionContentPartInputAudio);
          }
          continue;
        }

        if (item.type === 'input_audio' && item.input_audio) {
          // 检查是否为硅基流动供应商，如果是则转换为 audio_url 格式
          if (this.isSiliconFlowProvider()) {
            console.log('🎵 LLM: 硅基流动供应商，转换 input_audio 为 audio_url 格式')
            const audioUrl = `data:audio/mpeg;base64,${item.input_audio.data}`
            contentParts.push({
              type: 'audio_url',
              audio_url: { url: audioUrl }
            } as any);
          } else {
            // 其他供应商使用原有的 input_audio 格式
            const normalizedAudio = this.normalizeInputAudio(item.input_audio.data, item.input_audio.format);
            if (normalizedAudio) {
              contentParts.push({
                type: 'input_audio',
                input_audio: normalizedAudio
              } as unknown as OpenAI.Chat.ChatCompletionContentPartInputAudio);
            }
          }
        }

        if (item.type === 'audio_url' && item.audio_url) {
          console.log('🎵 LLM: 检测到 audio_url 类型，直接转发给 OpenAI')
          contentParts.push({
            type: 'audio_url',
            audio_url: { url: item.audio_url.url }
          } as any);
          continue;
        }

        // 处理视频类型，直接转发 video_url
        if (item.type === 'video_url' && item.video_url) {
          console.log('🎬 LLM: 检测到 video_url 类型，直接转发给 OpenAI')
          contentParts.push({
            type: 'video_url',
            video_url: { url: item.video_url.url }
          } as any);
          continue;
        }
      }

      if (contentParts.length === 0) {
        contentParts.push({ type: 'text', text: '' });
      }

      return {
        role: msg.role,
        content: contentParts
      } as OpenAI.Chat.ChatCompletionMessageParam;
    });

    // 如果提供了图像，添加到用户消息中
    if (images && images.length > 0) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage.role === 'user') {
        for (const imageUrl of images) {
          (lastMessage.content as OpenAI.Chat.ChatCompletionContentPart[]).push({
            type: 'image_url',
            image_url: { url: imageUrl }
          });
        }
      }
    }

    // 如果提供了音频数据，添加到用户消息中
    if (audioData) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage.role === 'user') {
        const normalizedAudio = this.normalizeInputAudio(audioData, 'wav');
        if (normalizedAudio) {
          (lastMessage.content as OpenAI.Chat.ChatCompletionContentPart[]).push({
            type: 'input_audio',
            input_audio: normalizedAudio
          } as unknown as OpenAI.Chat.ChatCompletionContentPartInputAudio);
        }
      }
    }

    // 创建请求参数
    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
        model: this.config.model,
        messages: processedMessages,
        stream: true,
        stream_options: { include_usage: true },
        modalities: ['text', 'audio'],
        audio: {
          voice: this.config.voice || 'Cherry',
          format: (this.config.format || 'wav') as 'wav' | 'mp3'
        },
        temperature: this.config.temperature
      };

    // 注意：不再注入 OpenAI 工具定义，改用文本解析方式

    // 发送请求并处理流
    let response;
    try {
      response = await this.openai.chat.completions.create(params);
    } catch (error) {
      console.error('❌ OpenAI API调用失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Cannot read private member') || errorMessage.includes('__classPrivateFieldGet')) {
        throw new Error('OpenAI客户端库兼容性问题，请检查浏览器环境或更新依赖版本');
      }
      throw error;
    }

    let aggregatedText = '';
    const audioChunks: string[] = [];
    let usageStats: any = null;
    // 注意：不再使用流式工具调用解析，改用文本解析

    for await (const chunk of response) {
      // 增加调试日志
      // console.log('🔍 LLM chunk received:', {
      //   hasChoices: chunk.choices && chunk.choices.length > 0,
      //   chunkKeys: Object.keys(chunk),
      //   choice0Keys: chunk.choices?.[0] ? Object.keys(chunk.choices[0]) : 'no choice',
      //   deltaKeys: chunk.choices?.[0]?.delta ? Object.keys(chunk.choices[0].delta) : 'no delta',
      //   deltaContent: chunk.choices?.[0]?.delta?.content
      // })

      if (chunk.choices && chunk.choices.length > 0) {
        const choice = chunk.choices[0];

        let textDelta = '';
        const chunkAudioParts: string[] = [];

        // 注意：移除流式工具调用检测，改用文本解析方式

        // 直接处理 delta.content（对于标准 OpenAI Chat Completion 格式）
        let processedDelta = false;
        if (choice.delta && choice.delta.content !== undefined && choice.delta.content !== null) {
          // 即使 content 为空字符串也要处理，因为这可能是第一个 chunk
          textDelta = choice.delta.content;
          processedDelta = true;
          // console.log('📝 Text delta extracted:', { content: textDelta, length: textDelta.length, isEmpty: textDelta === '' });
        }

        const processContent = (content: any) => {
          if (!content) return;

          if (typeof content === 'string') {
            textDelta += content;
            return;
          }

          if (Array.isArray(content)) {
            for (const contentItem of content) {
              const contentType = contentItem?.type;

              // 处理嵌套的text字段
              let contentText: string | undefined;
              if (contentItem?.text) {
                if (typeof contentItem.text === 'string') {
                  contentText = contentItem.text;
                } else if (Array.isArray(contentItem.text)) {
                  // 处理嵌套的text数组结构
                  for (const nestedItem of contentItem.text) {
                    if (typeof nestedItem === 'string') {
                      contentText = (contentText || '') + nestedItem;
                    } else if (nestedItem?.type === 'text' && typeof nestedItem.text === 'string') {
                      contentText = (contentText || '') + nestedItem.text;
                    }
                  }
                }
              } else {
                contentText = typeof contentItem?.output_text === 'string'
                  ? contentItem.output_text
                  : undefined;
              }

              if ((contentType === 'text' || contentType === 'output_text') && typeof contentText === 'string') {
                textDelta += contentText;
              }

              const audioPayload = contentItem?.input_audio ?? contentItem?.audio ?? contentItem?.output_audio;
              if ((contentType === 'input_audio' || contentType === 'audio' || contentType === 'output_audio') && audioPayload?.data) {
                const audioData = audioPayload.data as string;
                audioChunks.push(audioData);
                chunkAudioParts.push(audioData);
              }
            }
          }
        };

        // 如果没有处理过 delta.content，尝试其他方式（用于非标准格式）
        if (!processedDelta) {
          processContent(choice.delta?.content as any);
          if (!textDelta && !chunkAudioParts.length) {
            const messageContent = (choice as any)?.message?.content;
            if (messageContent) {
              processContent(messageContent as any);
            }
          }
        }

        const deltaAudio = (choice.delta as any)?.audio;
        if (deltaAudio?.data) {
          audioChunks.push(deltaAudio.data);
          chunkAudioParts.push(deltaAudio.data);
        }

        const audioChunkBuffer = chunkAudioParts.length > 0
          ? this.base64ToArrayBuffer(chunkAudioParts.join(''))
          : undefined;

        // 输出结果：即使 textDelta 是空字符串也要输出（第一个 chunk）
        if (textDelta !== undefined || audioChunkBuffer) {
          if (textDelta && textDelta !== '') {
            aggregatedText += textDelta;
          }

          // console.log('📤 LLM yielding result:', {
          //   textDelta,
          //   textDeltaLength: textDelta?.length || 0,
          //   aggregatedTextLength: aggregatedText.length,
          //   hasAudioChunk: !!audioChunkBuffer,
          //   toolCallsCount: toolCalls.length,
          //   isEmpty: textDelta === '',
          //   isUndefined: textDelta === undefined
          // });

          yield {
            text: textDelta || '',
            audioChunk: audioChunkBuffer,
            finished: false
          };
        }
      }

      if (chunk.usage) {
        usageStats = chunk.usage;
      }
    }

    const audioBuffer = audioChunks.length > 0 ? this.base64ToArrayBuffer(audioChunks.join('')) : undefined;

    // 使用文本解析方式检测工具调用
    let toolCallsToProcess: ParsedToolCall[] = [];
    if (enableTools && this.tools.size > 0 && hasToolCallTags(aggregatedText)) {
      console.log('🔧 检测到工具调用标签，开始解析文本:', aggregatedText.substring(0, 200) + '...');
      const parseResult = parseToolCalls(aggregatedText);
      toolCallsToProcess = parseResult.toolCalls;
      
      console.log('🔧 文本解析结果:', {
        toolCallsCount: toolCallsToProcess.length,
        toolNames: toolCallsToProcess.map(tc => tc.name),
        cleanedTextLength: parseResult.cleanedText.length
      });
    }

    // 如果有工具调用，处理工具调用
    if (toolCallsToProcess.length > 0) {
      // 转换为兼容的 ToolCall 格式
      const compatibleToolCalls: ToolCall[] = toolCallsToProcess.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments)
      }));
      
      console.log('🔧 发送工具调用结果:', {
        toolCallsCount: compatibleToolCalls.length,
        toolCallsDetail: compatibleToolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          argumentsPreview: tc.arguments.substring(0, 100) + (tc.arguments.length > 100 ? '...' : '')
        }))
      });
      
      yield {
        text: '',
        audio: audioBuffer,
        finished: false,
        toolCalls: compatibleToolCalls,
        usage: usageStats ?? undefined
      };
    } else {
      console.log('🔧 未检测到有效的工具调用');
      console.log('完整文本:', aggregatedText)
    }

    yield {
      text: '',
      audio: audioBuffer,
      finished: true,
      usage: usageStats ?? undefined
    };
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private normalizeInputAudio(rawAudio: string | undefined, declaredFormat?: string): { data: string; format: string } | null {
    if (!rawAudio) {
      return null;
    }

    let trimmed = rawAudio.trim();
    if (!trimmed) {
      return null;
    }

    let format = declaredFormat?.trim().toLowerCase();

    // 处理各种可能的音频数据格式
    const dataUrlMatch = trimmed.match(/^data:(?:audio\/([a-z0-9+.-]+)|;base64),(.+)$/i);
    if (dataUrlMatch) {
      if (dataUrlMatch[1]) {
        // 格式: data:audio/wav;base64,...
        format = dataUrlMatch[1].toLowerCase();
      } else {
        // 格式: data:;base64,...
        format = declaredFormat?.trim().toLowerCase() || 'wav';
      }
      trimmed = dataUrlMatch[2];
    } else if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      // 格式: 纯base64字符串（没有data:前缀）
      format = declaredFormat?.trim().toLowerCase() || 'wav';
      // trimmed 保持不变，已经是base64数据
    }

    const normalizedFormat = this.normalizeAudioFormat(format)

    if (!trimmed) {
      return null;
    }

    if (!normalizedFormat) {
      return null;
    }

    const payloadData = trimmed.startsWith('data:')
      ? trimmed
      : this.shouldAddAudioDataPrefix()
        ? `data:;base64,${trimmed}`
        : trimmed; // 本地供应商或其他供应商直接使用 base64 数据

    return {
      data: payloadData,
      format: normalizedFormat
    };
  }

  private normalizeAudioFormat(format?: string): 'wav' | 'mp3' | null {
    if (!format) {
      return 'wav'
    }

    const normalized = format.trim().toLowerCase()

    if (normalized === 'wav' || normalized === 'audio/wav' || normalized === 'x-wav' || normalized === 'wave') {
      return 'wav'
    }

    if (normalized === 'mp3' || normalized === 'audio/mp3' || normalized === 'mpeg') {
      return 'mp3'
    }

    return null
  }

  // 检查是否为硅基流动供应商
  private isSiliconFlowProvider(): boolean {
    const baseURL = this.config.baseURL?.toLowerCase() || '';
    const providerId = this.config.providerId?.toLowerCase();

    // 硅基流动相关的 URL 模式
    const siliconFlowPatterns = [
      'api.siliconflow.cn',
      'siliconflow.cn',
      'api.siliconflow.com',
      'siliconflow.com'
    ];

    // 通过 providerId 检测
    if (providerId === 'siliconflow' || providerId === 'silicon-flow') {
      return true;
    }

    // 通过 baseURL 检测
    return siliconFlowPatterns.some(pattern => baseURL.includes(pattern));
  }

  // 检查是否需要为音频数据添加 data: 前缀
  private shouldAddAudioDataPrefix(): boolean {
    // 检查是否为阿里云 DashScope
    const baseURL = this.config.baseURL?.toLowerCase() || '';
    const providerId = this.config.providerId?.toLowerCase();

    // 阿里云相关的 URL 模式
    const aliyunPatterns = [
      'dashscope.aliyuncs.com',
      'dashscope-intl.aliyuncs.com'
    ];

    // 通过 providerId 检测
    if (providerId === 'aliyun') {
      return true;
    }

    // 通过 baseURL 检测
    return aliyunPatterns.some(pattern => baseURL.includes(pattern));
  }

  // 注册工具
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    console.log(`🔧 工具注册成功: ${tool.name}`);
  }

  // 批量注册工具
  registerTools(tools: Tool[]): void {
    tools.forEach(tool => this.registerTool(tool));
  }

  // 执行工具调用
  private async executeToolCall(toolCall: ToolCall): Promise<ToolResponse> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      throw new Error(`工具未找到: ${toolCall.name}`);
    }

    try {
      // 解析参数
      let args;
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        args = {};
      }

      console.log(`🔧 执行工具调用: ${toolCall.name}`, args);
      const result = await tool.handler(args);

      return {
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify(result)
      };
    } catch (error) {
      console.error(`❌ 工具调用失败: ${toolCall.name}`, error);
      return {
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      };
    }
  }

  // 处理工具调用并继续对话
  async *processToolCalls(
    toolCalls: ToolCall[],
    originalMessages: Message[],
    hooks?: ToolCallLifecycleHooks,
    originalAssistantContent?: string
  ): AsyncGenerator<GenerationResult> {
    if (!toolCalls || toolCalls.length === 0) {
      return;
    }

    // 执行所有工具调用
    const toolResponses: ToolResponse[] = [];
    for (const toolCall of toolCalls) {
      hooks?.onStart?.(toolCall);
      try {
        const response = await this.executeToolCall(toolCall);
        toolResponses.push(response);
        hooks?.onSuccess?.(toolCall, response);
      } catch (error) {
        console.error(`❌ 工具调用执行失败: ${toolCall.name}`, error);
        const fallbackResponse: ToolResponse = {
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify({
            error: error instanceof Error ? error.message : String(error)
          })
        };
        toolResponses.push(fallbackResponse);
        hooks?.onError?.(toolCall, error);
      }
    }

    // 添加包含工具调用的assistant消息
    // 使用原始的assistant响应内容，而不是描述性文本
    const assistantMessage: Message = {
      role: 'assistant',
      content: [{
        type: 'text',
        text: originalAssistantContent || '' // 使用原始内容
      }],
      tool_calls: toolCalls.map(toolCall => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      }))
    };

    // 🔧 合并所有工具调用结果到单条 user 消息
    const aggregatedToolResults = toolResponses.map(response => {
      return `工具调用结果 [${response.name}]: ${response.content}`;
    }).join('\n\n如果没问题，请以一句简单结束语总结。(下次调用请依然使用<tool_calls></tool_calls>标签，并确保标签内内容正确。');

    const aggregatedToolMessage: Message = {
      role: 'user',
      content: [{
        type: 'text',
        text: aggregatedToolResults
      }]
    };

    // 🔧 确保消息顺序正确：验证并修复消息流
    const validatedMessages = this.validateAndFixMessageOrder(
      [...originalMessages, assistantMessage, aggregatedToolMessage]
    );

    console.log('🔧 工具调用处理完成', {
      toolCallsCount: toolCalls.length,
      toolResponsesCount: toolResponses.length,
      originalMessagesCount: originalMessages.length,
      validatedMessagesCount: validatedMessages.length,
      lastTwoRoles: validatedMessages.slice(-2).map(m => m.role),
      aggregatedToolResults // 添加这个日志俥助调试
    });

    // 先向上游发送一次工具结果汇总，便于保存到历史记录
    if (aggregatedToolResults.trim()) {
      yield {
        text: '',
        finished: false,
        toolResultsText: aggregatedToolResults
      };
    }

    // 🔥 关键修复：工具调用完成后，LLM生成的后续内容应该作为新的assistant消息
    // 而不是与之前的消息合并，以确保消息顺序的正确性
    let hasYieldedFirstResult = false;
    
    // 继续对话，保持工具调用支持以实现 ReAct 循环
    for await (const result of this.generate(validatedMessages, undefined, undefined, true)) {
      // 📝 如果这是第一个结果且包含文本内容，标记为新的assistant消息开始
      if (!hasYieldedFirstResult && result.text && result.text.trim()) {
        hasYieldedFirstResult = true;
        console.log('🔧 开始新的assistant消息（工具调用后的结束语）:', result.text.substring(0, 50) + '...');
      }
      
      yield result;
      
      if (result.finished) {
        break;
      }
    }
  }

  /**
   * 验证并修复消息顺序，确保符合 user-assistant 交替模式
   * @param messages 原始消息数组
   * @returns 修复后的消息数组
   */
  private validateAndFixMessageOrder(messages: Message[]): Message[] {
    const fixedMessages: Message[] = [];
    let lastRole: string | null = null;

    for (const message of messages) {
      // 跳过系统消息的顺序检查
      if (message.role === 'system') {
        fixedMessages.push(message);
        continue;
      }

      // 检查是否违反交替规则
      if (lastRole === message.role) {
        console.warn(`🔧 检测到连续的 ${message.role} 消息，进行合并处理`);
        
        if (message.role === 'user') {
          // 合并连续的 user 消息
          const lastMessage = fixedMessages[fixedMessages.length - 1];
          if (lastMessage && lastMessage.role === 'user') {
            // 合并内容
            const combinedContent = [
              ...lastMessage.content,
              { type: 'text' as const, text: '\n\n' }, // 添加分隔符
              ...message.content
            ];
            lastMessage.content = combinedContent;
            continue; // 跳过添加当前消息
          }
        } else if (message.role === 'assistant') {
          // 合并连续的 assistant 消息
          const lastMessage = fixedMessages[fixedMessages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            // 合并内容
            const combinedContent = [
              ...lastMessage.content,
              { type: 'text' as const, text: '\n\n' }, // 添加分隔符
              ...message.content
            ];
            lastMessage.content = combinedContent;
            
            // 合并工具调用（如果有的话）
            if (message.tool_calls) {
              lastMessage.tool_calls = [
                ...(lastMessage.tool_calls || []),
                ...message.tool_calls
              ];
            }
            continue; // 跳过添加当前消息
          }
        }
      }

      fixedMessages.push(message);
      lastRole = message.role;
    }

    // 验证最终结果
    this.logMessageOrderValidation(fixedMessages);
    
    return fixedMessages;
  }

  /**
   * 记录消息顺序验证结果
   */
  private logMessageOrderValidation(messages: Message[]): void {
    const roleSequence = messages
      .filter(m => m.role !== 'system')
      .map(m => m.role)
      .join(' -> ');
    
    console.log('🔧 消息顺序验证:', {
      totalMessages: messages.length,
      roleSequence,
      isValidSequence: this.isValidRoleSequence(messages)
    });
    
    // 检查是否还有连续的相同角色
    const issues = [];
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      if (prev.role === curr.role && curr.role !== 'system') {
        issues.push(`位置 ${i}: 连续的 ${curr.role} 消息`);
      }
    }
    
    if (issues.length > 0) {
      console.warn('⚠️ 消息顺序仍有问题:', issues);
    } else {
      console.log('✅ 消息顺序验证通过');
    }
  }

  /**
   * 检查角色序列是否有效
   */
  private isValidRoleSequence(messages: Message[]): boolean {
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      // 系统消息可以出现在任何位置
      if (curr.role === 'system' || prev.role === 'system') {
        continue;
      }
      // 检查是否有连续的相同角色
      if (prev.role === curr.role) {
        return false;
      }
    }
    return true;
  }

  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };

    // 如果API Key或BaseURL有变化，重新创建OpenAI实例
    if (config.apiKey || config.baseURL) {
      try {
        this.openai = markRaw(new OpenAI({
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
          dangerouslyAllowBrowser: true
        }));
      } catch (error) {
        console.error('❌ OpenAI客户端重新初始化失败:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`OpenAI客户端重新初始化失败: ${errorMessage}`);
      }
    }
  }
}
