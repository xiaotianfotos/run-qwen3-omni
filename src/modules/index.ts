// API module exports
export { OpenAIClient } from './api/OpenAIClient'
export type { OpenAIConfig, ChatCompletionRequest, ChatCompletionResponse, ChatCompletionMessage } from './api/types'

// VAD module exports
export { VadDetector } from './vad/VadDetector'
export type { VadConfig, VadState } from './vad/VadDetector'

// Context module exports
export { ContextManager } from './context/ContextManager'
export type { ContextItem, ConversationContext } from './context/ContextManager'

// Audio module exports
export { AudioManager } from './audio'
export { ScreenManager } from './screen'
export { LLM, ConversationHistory, AudioPlayer } from './llm'

// Agent module exports
export { Agent } from './agent'
export type { AgentConfig, AgentMessage, AgentResponse } from './agent'

// Conversation module exports
export { ConversationManager } from './conversation'
export type { ConversationMessage, ConversationSession } from './conversation'

// Screenshot module exports
export { ScreenshotManager } from './screenshot'
export type { Screenshot, ScreenshotManagerConfig } from './screenshot'