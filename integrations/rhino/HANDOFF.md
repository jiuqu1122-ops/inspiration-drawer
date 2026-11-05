# Rhino Beta 开发交接（2026-11-05）

## 本分支的目标与现状

用户需要在 Rhino 9 的原生停靠窗口使用灵感抽屉 Chat，同时保留抽屉的画布、生图模型与账号体系。Beta 已实现原生窗口、本机 MCP 传输和桌面 Chat 复用。用户已经在本机实际使用并完成一次生图。

当前插件使用自行实现的 MCP 服务，直接通过 RhinoCommon 读取文档，不是 Rhino 官方 AI router 的完整 MCP 接入。详情见 [MCP 能力核查](MCP-AUDIT.md)。

## 已完成

- Rhino 9 C# / Eto 原生面板，提供聊天、新建/切换会话、模型选择、停止和结果预览。
- 只监听 127.0.0.1 的随机端口，本次实例令牌鉴权；桌面端通过固定用途 Rust 命令直连，绕过系统 HTTP 代理。
- 复用桌面 Chat runtime、生成工具、画布输出和存储。发送时可附带真实视口 PNG 与画布选中图片。
- 三个模型可调用的工具：rhino_get_context、rhino_list_objects、rhino_list_layers；rhino_capture_viewport 由发送前桥接调用。
- 会话绑定 Rhino 实例、文档与画布；任务去重、执行前确认接收、接受后不自动重放；执行期间保护画布切换。
- 桌面 Beta 使用独立应用标识 com.inspirationdrawer.rhino.beta 和数据目录，禁用其更新源及部分会与正式版争用的服务。

## 下一步：按真实图层/材质分件渲染

用户明确要求：选中 Rhino 模型后，以真实图层或者模型的材质分件，给不同部件指定颜色/材质，并交给抽屉生图。当前尚未实现，不要把普通截图生图描述成精准分件渲染。

建议顺序：

1. 添加分件导出：稳定部件 ID、对象集合、图层完整路径、实际生效材质与材质来源。处理块实例的变换和材质继承，明确子物件/面材质的支持边界。
2. 同一相机、同一尺寸导出底图和部件 ID 色彩图/可见区域遮罩。处理遮挡，不通过修改用户文档的图层、材质或选择来冒充只读导出；如必须临时变更，应完整恢复并验证异常路径。
3. 把分件清单和图像区域映射传给 Chat 与生图/编辑工具，并展示实际调用状态。真实读取失败时明确报告，避免静默退化为看图猜测。
4. 按所选渠道实际支持的图像数量、遮罩语义和编辑能力接入局部编辑；需要区域外像素保护时做合成与验证，不能仅凭提示词承诺保形。
5. 再评估官方 Rhino MCP/router 接入。现有实现没有此适配，不要假定官方内部宿主 API 可以直接复用。

选择读取已经正常工作：用户测试会话记录包含 113 个选中对象；截图上的“0 个”是其后取消选择，用户已明确说明，不要作为选择识别故障修复。

## 关键源码入口

- integrations/rhino/InspirationDrawer.Rhino：插件、面板、BetaServer、RhinoTools。
- integrations/rhino/Bridge.Tests：不依赖 Rhino 的真实 TCP/HTTP 集成检查。
- src/features/rhino：协议、MCP 客户端、共享 Chat 适配与绑定。
- src/features/chat/components/ChatHost.tsx：挂载桥接和附加工具。
- src/features/chat/runtime/useChatRuntime.ts：追加模型工具定义、生成结果携带源会话。
- src-tauri/src/rhino_beta.rs：固定端点、鉴权、回环传输。
- src-tauri/tauri.rhino-beta.conf.json：独立 Beta 配置。
- scripts/build-rhino-beta.ps1：统一构建、测试和打包。

## 回家电脑继续

克隆仓库后切换本分支：

```powershell
git fetch origin
git switch --track origin/feat/rhino-beta-20261105
npm ci
```

需要 Windows、Node/npm、.NET 8 SDK、Rust MSVC、Visual Studio C++ Build Tools（含 Windows SDK）和 Rhino 9。在 VS 开发者 PowerShell 中构建；RhinoSystemDir 按实际安装目录填写：

```powershell
npm run typecheck
npm run test -- src/features/chat src/features/rhino --maxWorkers=4
dotnet run -c Release --project integrations/rhino/Bridge.Tests/Bridge.Tests.csproj
powershell -ExecutionPolicy Bypass -File scripts/build-rhino-beta.ps1 -RhinoSystemDir 'C:/Program Files/Rhino 9/System'
```

构建脚本输出到 integrations/rhino/artifacts，目录已被 Git 忽略。桌面输出为便携 EXE，插件输出为 YAK，详见 [使用说明](README.md)。只构建插件时加 -SkipDesktop。

## 已验证与待验证

- Chat/Rhino 回归：50 个测试文件，660 项测试通过。
- 本机传输：20 项 TCP/HTTP 集成检查通过。
- TypeScript/Vite 前端构建与一个桌面 Rust release 构建曾成功；成功的桌面 EXE 早于最后一轮绑定/画布锁改动。最后改动后的桌面 release 尚未确认完成，换电脑请从本分支完整重建。
- 实际 Rhino 9（9.0.26300.09401）加载、原生面板、对象/图层读取和真实 PNG 导出已验证；当前 MCP 查询实测成功。
- 模型记录中已有一次 generate_image 成功，但尚未完成分件/遮罩编辑验收或所有渠道验证。
- 新建/切换会话的最终面板同步仍需回归；此前请求状态 completed，但即时快照尚未反映新会话，不能仅凭请求完成认定界面同步已验收。
- 调试时加入 WebView2 远程调试环境参数曾出现 Rhino 崩溃，去掉后可以运行。避免沿用该参数；插件长期稳定性与完整 GUI 回归仍需验证。

## 不在仓库中的内容

本机连接令牌、API Key、登录/授权、聊天数据库、素材、模型文件、依赖工具链与编译缓存均不随分支上传。Beta 默认不会导入正式版设置，换电脑需要正常配置。原有工作目录中另有未提交的 src/index.css 修改，本分支没有混入该修改。
