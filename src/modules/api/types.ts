// OpenAI兼容API请求和响应类型
export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  format: string;
}

export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image_url' | 'input_audio' | 'video_url';
    text?: string;
    image_url?: {
      url: string;
    };
    input_audio?: {
      data: string; // base64 encoded audio payload (e.g. WAV data)
      format: string; // audio encoding, typically 'wav' or 'mp3'
    };
    video_url?: {
      url: string; // base64 encoded video data URL (e.g. data:video/mp4;base64,...)
    };
  }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  stream?: boolean;
  stream_options?: {
    include_usage: boolean;
  };
  modalities?: ('text' | 'audio')[];
  audio?: {
    voice: string;
    format: string;
  };
  temperature?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      audio?: {
        data: string; // base64 encoded audio
        format: string;
      };
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
