# Inspiration Drawer / 灵感抽屉

灵感抽屉是一款面向设计与创意工作的 Windows 桌面工具，将素材收集、AI 自动标签、无限画布、生成式工作流和桌面便签整合在一个本地工作台中。

## 下载

当前版本：**5.0.14**

- [GitHub 下载 Windows x64 安装包](https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/v5.0.14/Inspiration.Drawer_5.0.14_x64-setup.exe)
- [GitHub Release](https://github.com/jiuqu1122-ops/inspiration-drawer/releases/tag/v5.0.14)
- [Gitee Release](https://gitee.com/zibinyou/inspiration-drawer/releases/tag/v5.0.14)

应用支持签名自动更新。Windows 可能在首次运行时显示 SmartScreen 提示，请确认下载来源后继续。

## 5.0.14 更新

- 修复工作流单张结果重试请求 ID 过长的问题，单独重试失败时继续显示并保留原图。
- 修复节点缩放框与节点本体错位、拖动后尺寸跳变的问题。
- 单选和多选整体缩放统一使用实际显示尺寸，后台结果更新、提示词展开和规则折叠不再重置用户设置的比例。

## 主要功能

- **灵感抽屉**：收集和管理图片、视频、文本与文件，支持文件夹、多选、批量下载及全库搜索。
- **AI 自动标签**：后台分析图片并将结构化标签写入原有标签体系，可按标签搜索和整理素材。
- **无限画布**：自由组织素材、图片生成节点、文字 Agent 节点和可复用工作流。
- **生成工作流**：支持多参考图、节点/工作流预设 JSON、结果列表与批量下载。
- **画布 Agent**：支持 OpenAI-compatible API 与 Codex App Server，通过受控工具操作画布和工作流。
- **桌面工具**：提供截图、桌面便签、快捷记录、全局快捷键及手机局域网传输。
- **本地优先**：画布和素材保存在本机；AI 结果与参考图只在需要公网访问时使用临时桥接。

## 开发

环境要求：Node.js、Rust stable、Windows WebView2 和 Tauri 2 构建依赖。

```powershell
npm install
npm run tauri -- dev
```

验证：

```powershell
npm test
npm run build
cd src-tauri
cargo test
cargo check
```

签名发布需要本机配置 Tauri updater 私钥；私钥、API Key、数据库密码和任何生产环境凭据都不应提交到仓库。

## 技术栈

- Tauri 2 + Rust
- React 19 + TypeScript + Vite
- SQLite 本地数据层
- Codex App Server / OpenAI-compatible API

## 说明

本软件是本地工作流与 API 接入工具，不直接提供第三方 AI 模型服务。使用自有 API 或外部模型渠道时，请遵守对应服务商的协议与当地法律法规。
