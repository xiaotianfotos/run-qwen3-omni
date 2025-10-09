// 主要的新版多模态服务（推荐使用）
export { RunOmniService } from './RunOmniService'
export { RunOmniState } from './RunOmniService'

// 向后兼容：旧版MultiModalService（建议迁移到RunOmniService）
export { MultiModalService } from './MultiModalService'
export type { MultiModalServiceConfig, ServiceState, ServiceStatus } from './MultiModalService'