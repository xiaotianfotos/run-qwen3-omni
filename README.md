# RunOmni - Qwen3-Omni 多模态AI客户端

这是个为了研究Qwen3 Omni系列模型能力做的客户端

目前接入了阿里云DashScope和硅基流动的API服务，以及本地部署的API服务。

代码纯Vibe的，有很多冗余，不适合用于生产环境，也不应用于学习参考。

## 🚀 功能特色


### 多供应商支持
- **阿里云 DashScope**: 官方Qwen3-Omni服务
- **硅基流动**: 第三方API服务
- **自定义API**: 支持本地部署或其他兼容OpenAI的API

### 基本功能
- **工具调用**: 画板支持了画圆形和矩形，有简单的改颜色改大小的操作，用于验证语音工具调用。
- **VAD检测**: 简单的实时语音，带VAD检测。
- **会话管理**: 可配置的历史对话轮数
- **多音色选择**: 支持了Qwen3 Omni的多音色，
- **实时录屏**: 用录屏截图的方式实现图片+语音的实时对谈。



## 📦 安装与运行

### 环境要求
- Node.js 
- 现代浏览器（支持WebRTC、Screen Capture API）

### 快速开始

1. **安装依赖**
   ```bash
   npm install
   ```

2. **开发模式运行**
   ```bash
   npm run dev
   ```

3. **生产构建**
   ```bash
   npm run build
   ```

### 生产环境部署

1. **构建前端**
   ```bash
   npm run build
   ```

2. **访问应用**
   ```
   http://localhost:5173
   ```

