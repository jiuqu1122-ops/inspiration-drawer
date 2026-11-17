# Figma MCP 接入核查（2026-11-17，Asia/Shanghai）

状态：仅核查、公开端点探测和技术方案；没有接通用户 Figma 账号，没有创建/修改 Figma 文件，没有改动产品运行时代码。

## 结论

官方远程 MCP 可以减少可编辑设计的构建/转换工作，但灵感抽屉作为独立客户端能否投入使用，先取决于官方客户端准入、账号/套餐/文件权限和实际提供的工具。不能以本次会话可安装 Figma 连接器，替代灵感抽屉自己的授权和准入。

当前产品已提供 HTML Canvas 沙箱预览与真实 HTML 文件生成；既有 Rhino MCP 是专用本机适配器，不是已完成 OAuth 的通用远程 MCP 客户端。

## 官方文档核查

- 远程入口：`https://mcp.figma.com/mcp`。官方说明只有 MCP catalog 中的客户端可连接，新客户端需要加入 waitlist；首次需用户登录授权。
- `html_to_figma`：将自包含 HTML 转成普通设计图层，不运行应用，不复用现有组件库/变量，不意味着 JavaScript 交互被迁移。
- `generate_figma_design`：将运行中的网页 UI 送入 Figma Design；只对特定客户端开放，不能把静态/状态捕获当作交互逻辑迁移。
- `use_figma`：通过 Plugin API 创建和编辑真实设计结构，适合框架、文字、Auto Layout、组件、变体和变量。是否可用、原型连接 API 在用户账号实际运行中的支持情况仍需验证。
- `send_code_to_figma`：将代码工程导入 Figma Make 或 Design code layer；不是普通设计图层。保留代码交互与导出逐层可编辑设计是不同交付目标，不能混为一谈。
- 官方 Write to canvas 文档列出的套餐为 Professional、Education、Organization、Enterprise，并要求目标文件编辑权限和支持的远程客户端。写入目前为 beta，beta 后计费政策可能变化。
- 写入工具在官方工具表中标记为 Remote only；本机 Figma desktop MCP 不是同等写入能力的绕过方案。

参考（2026-11-17读取）：
- https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/
- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/
- https://developers.figma.com/docs/figma-mcp-server/local-server-installation/

## 本次公开端点探测（未提交凭证）

只发送无账号的协议握手和公开元数据 GET，没有注册 OAuth 客户端，也没有调用工具或修改用户资源。

1. GET `/mcp`：HTTP 405、JSON-RPC Method not allowed。此结果只是该端点不接受此 GET，不能据此判断 MCP 不可用。
2. POST `/mcp`，`initialize`，clientInfo=`inspiration-drawer`/`8.0.27`、protocolVersion=`2025-06-18`：HTTP 401 Unauthorized。
3. 401 的 `WWW-Authenticate` 指向 protected-resource 元数据和 OAuth authorization-server 元数据，并要求 `mcp:connect`。
4. GET `https://mcp.figma.com/.well-known/oauth-protected-resource`：HTTP 200。resource 为远程 MCP 地址，authorization_servers 包含 `https://api.figma.com`，bearer header，scope=`mcp:connect`。
5. GET `https://api.figma.com/.well-known/oauth-authorization-server`：HTTP 200。公开 metadata 包含 authorization_code、refresh_token、PKCE S256、state 必需和客户端注册端点；公布的 token 认证方式为 client_secret_basic/client_secret_post。实际注册模式需以官方准入结果为准；不能将机密 client_secret 打进桌面安装包。

该探测仅证明服务可达且要求 OAuth；不证明灵感抽屉已在允许名单、不证明用户已授权、不证明获得了写入或原型 API 权限。

## 当前代码衔接点与缺口

- `src/features/rhino/rhinoClient.ts`：已有 initialize/tools/call、工具名映射、会话绑定等可参考；绑定 Rhino documentId，不能直接拿来做 Figma 通道。
- `src/features/rhino/rhinoProtocol.ts`：连接被限定为本机 Rhino，不能为了 Figma 放宽这些原有边界。
- `src-tauri/src/rhino_beta.rs`：本机地址、既有 bearer token、JSON 请求，且 no_proxy；没有 Figma OAuth 登录/刷新或通用远程流式传输。应新增独立模块，不复用/松开这个入口。
- `src/features/chat/runtime/useChatRuntime.ts`：已有 additionalTools/executeTool 扩展点；`ChatHost.tsx` 当前专门组合 Rhino 工具。应将 Figma 注册到独立 provider、单独白名单和目标文件绑定。
- `src/features/chat/tools/chatToolRouter.ts`：有固定工具与 Rhino 专用识别。需增加 Figma 命名空间和路由，不把未知远程工具自动视为允许执行。
- `src/features/chat/components/ChatHtmlPreview.tsx`：现有 iframe 继续保持无原生 IPC 权限。导出 Figma 应由可信 UI 发起，不能让模型生成的网页自己获得账号 token、MCP 或任意上传权限。

## 建议推进顺序

### A. 先验证官方账号链路（当前会话）

本次发现 Figma 连接器可供安装，但查询时未安装/连接，已提供连接入口。用户连接后再查看实际工具 schema、权限和套餐；用专用测试文件验证：三个页面、弹窗、Tab、可编辑文字/布局、跳转和状态切换，并检查返回截图和实际原型行为。不要在未经用户指定的生产文件中试写。

连接本次会话只用于验证，不能转借该会话的客户端身份、OAuth 凭证或 token 给灵感抽屉，也不能将用户账号统一用于其他产品用户。

### B. 灵感抽屉正式集成

1. 向 Figma 申请独立客户端准入，确认注册、回调、是否存在客户端专属工具许可。
2. 单独实现远程 MCP transport 与 OAuth 登录/回调，state/PKCE、token 刷新、撤销连接、用户隔离和凭据安全存储；按官方注册模式处理客户端机密。
3. 设置中提供连接/断开、状态/错误、账号权限和能力检查；使用真实 tools/list 判定 HTML 转图层、可编辑写入和 code-layer 入口，不只以登录成功作为可写标志。
4. 可信导出操作选择目标文件；文件链接和生成 nodeId 绑定当前原型/对话，后续修改更新相应节点而不是无限重复创建。
5. 超时、429、401、权限拒绝与部分写入必须可见；写操作不盲目重试，使用可恢复映射和执行回执。
6. 仍保留独立页面/组件/交互定义作为共同来源；HTML 与 Figma 两种渲染后端不能靠将任意 JavaScript 硬猜为原型行为。

若官方客户端准入无法获得，保留 HTML 预览和原型导出包，配套 Figma 插件导入是可控后备路线；不能冒充受支持的 MCP 客户端来规避准入。

## 本次未完成项目

- 未在真实账号上执行 tools/list 或文件写入；未验证原型连接的实际支持范围。
- 未实现产品 OAuth/远程 MCP provider，未更改运行时代码，未打包新安装包。
