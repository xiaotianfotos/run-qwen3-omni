// 为了向后兼容，重新导出新的多模态服务
export { MultiModalService as OmniService } from '@/services/MultiModalService'
export { OpenAIClient as OmniClient } from '@/modules/api/OpenAIClient'

// 重新导出类型
export type { MultiModalServiceConfig as OmniServiceConfig } from '@/services/MultiModalService'
export type { OpenAIConfig as OmniClientConfig } from '@/modules/api/types'