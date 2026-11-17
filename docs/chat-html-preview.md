# Chat HTML / Canvas 交互预览

## 使用方式

- Chat 标题栏的 **Canvas** 打开可拖动、缩放、展开的预览面板，不影响聊天输入。
- HTML/HTM 围栏代码块、完整 HTML 回复和真实 HTML 文件卡片提供 **预览**。
- 预览支持内联 CSS、原生 JavaScript、SVG、data 图片；提供手机宽度、代码查看、复制与保存 HTML。
- 默认跟随最新版本。生成中的源代码按约 1 秒节流刷新，不因每个 token 重载；内容未变时保留页面内交互状态。可暂停自动刷新或手动刷新。
- 手动选择旧版本会取消跟随最新。切换对话或关闭 Chat 不展示原对话预览。
- 尚未完成的流式工具参数仅供临时预览，不是完成的文件，也不持久化；取消/失败/完成时清理临时副本。

## 文件和模型接入

`create_file` 新增 `format=html`，沿用原有文件目录、文件卡片、另存流程、2MB 源内容限制和文件名规范化。导出的文件保留原始 HTML，不插入预览的安全包装。

HTML/UI 上下文和已有 HTML 作品会提供文件工具。是否实际创建由模型结合用户语义判断，工具可见不等于执行授权；讨论、讲解或仅要代码不强制交付文件。后续修改交付完整新版本。原有图片、PPT 和 Rhino MCP 工具权限不变。

## 安全边界

生成页面不进入应用 DOM。预览 iframe 只启用 `allow-scripts`，不启用同源、弹窗、表单或顶层导航权限；在任何生成内容之前插入 CSP，禁用 fetch/联网 API、外部脚本、远程图片、本地/asset 文件、嵌套页面和 worker。

**不能仅依赖 iframe 沙箱**：当前 Tauri/WebView2 会向子框架注入 IPC 对象。因此 build.rs 从真实命令注册表生成应用 ACL manifest，本地应用窗口维持原有原生命令能力，但 sandbox/remote 来源不授予应用命令权限。调试构建同时保留已有隔离测试宿主的本地测试命令；这些命令没有发布版处理器。

预览不是任意 npm/React/JSX 构建环境，不支持外部 CDN、联网后端、本地存储和本地资源路径。模型需要交付自包含单文件，不能用 JSX 源码冒充可运行 HTML。UI 预览不触发 MCP、付费生图或真实文件上传。

## 验证

```powershell
npm run typecheck
npm test
npm run lint
npm run build
cargo +1.98.0 test --manifest-path src-tauri/Cargo.toml --locked --offline --bin inspiration-drawer commands::chat_files::tests

# 两个终端：先启动合成页面，再启动原生 WebView2 宿主。
npx vite --host 127.0.0.1 --port 1468 --strictPort
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-chat-html-preview-probe.ps1 -Width 1240
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-chat-html-preview-probe.ps1 -SkipBuild -Width 420
```

探针使用真实 ChatView、消息/文件卡片和预览组件，但仅注入合成会话/文件元数据，不导入生产 App/setup/数据库，也不调用模型、生产命令处理器或付费服务。原生端仅暴露两个同名的无副作用测试桩；先确认本地顶层调用可用，再确认 iframe 的相同调用不能到达桩。测试覆盖交互、流式限频、暂停/刷新、版本更新/锁定、会话隔离和窄屏布局。输出结果和原生 CapturePreview 截图位于 `outputs/html-preview-verification`。
