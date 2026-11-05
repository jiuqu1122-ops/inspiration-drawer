# 灵感抽屉 Rhino Beta 0.1.0-beta.1

这是配套桌面抽屉的 Rhino 9 插件。Rhino 原生停靠面板作为 Chat 的第二个入口；模型请求、账号、生成、画布和会话存储仍由配套桌面 Beta 执行。

## 使用

1. 解压完整 Beta 包，启动 `desktop/inspiration-drawer.exe`。这是独立数据目录的 Beta，需要在里面完成正常登录/授权和模型设置。原来已安装的正式版不包含本次连接功能。
2. 将包里的 `.yak` 拖入 Rhino 9 安装，按 Rhino 提示重启；也可以通过插件管理器加载 `plugin/net8.0/InspirationDrawer.Rhino.rhp` 做临时测试。
3. 在 Rhino 命令行执行 `InspirationDrawer`，打开“灵感抽屉 Beta”面板。等待显示“已连接灵感抽屉”。
4. 在桌面 Beta 打开目标画布，放入并选中参考图片；在 Rhino 选中目标对象，切到想要的视口和显示模式。
5. 从 Rhino 面板发送消息。默认附带当前视口与画布选中图片，可以取消勾选。生图使用抽屉原有模型/渠道，按原有规则计费。

首次建议只发送：

> 请告诉我当前选中对象的名称、图层和类型，并描述附带的视口图片。先不要生图。

确认图片可见、对象正确后，再发送：

> 参考画布选中的材质图，给 Rhino 中这个外壳生成一张效果图，尽量保持附图视角，放回当前画布。

面板支持新建/切换会话、选择聊天和生图模型、停止任务、查看工具状态及图片预览。两个入口显示同一个桌面 Beta 会话。第一版仅同步最近 30 条消息，最近 8 条消息提供缩略图预览；完整记录以桌面 Chat 为准。

## 本版边界

- 测试平台：Windows、Rhino 9，实际加载测试构建为 `9.0.26300.09401`，使用 .NET 8 插件运行时。
- 桌面 Beta 必须持续运行；可最小化，不要求 Chat 侧栏始终打开。关闭桌面程序后无法启动新请求。
- Beta 使用插件自己的四个只读/捕获 MCP 工具：文档上下文、对象列表、图层列表、当前视口 PNG。它没有接管官方 AI 面板，也没有修改官方代理列表。
- 尚未连接官方 router 的完整建模工具集；首版不执行任意 Python/C#、删除对象、建模或修改材质。
- 视口图片保留当前 Rhino 显示模式，长边最多 1600 像素，不自动切换渲染器。需要实体表面参考时，请先在 Rhino 选择合适的着色/渲染显示模式。
- 这是参考图生图/编辑流程。没有对象遮罩、深度/法线条件、区域外像素合成保护，不保证严格保持几何。
- 一个会话绑定一个 Rhino 文档、一个画布和一个插件实例。换文档/画布/实例后请新建会话。首版只自动发现最后打开面板的 Rhino 实例。
- Rhino 请求执行期间暂时禁止切换、创建和删除画布，防止已有画布执行器把结果写错位置。关闭文档会使后续 Rhino 查询明确失败。
- 有些工具需要在桌面 Chat 确认；面板显示“等待确认”时请回桌面处理。本版不在原生面板新增独立的权限配置。
- 取消等待不等于云端任务或计费一定能撤销。已完成结果保留在桌面会话中；连接中断时先检查已有任务，不要直接重复付费生成。
- 执行连接中断后，已接受的命令不会自动重放。若任务状态不确定，请在桌面核对；确认没有任务在执行后再重启 Beta/插件并新建会话。
- 当前包用于开发内测，未做代码签名、长期稳定性和全模型验证。真实收费渠道的完整出图仍需使用者正常登录配置后验收。

## 与正式版隔离

桌面构建标识为 `com.inspirationdrawer.rhino.beta`，数据默认位于 `%APPDATA%/com.inspirationdrawer.rhino.beta`，不会自动导入或写入正式版素材和会话。

Beta 禁用自身的自动更新来源、开机启动修改、浏览器采集桥接的启动和手机连接服务。首次测试建议先退出正式版，避免两套程序争用全局快捷键。

插件使用独立插件/面板 GUID 和本机随机端口。连接描述保存在 `%LOCALAPPDATA%/InspirationDrawer/RhinoBeta/connection.json`，不应发送给别人。只有回环地址能接入，请求需要本次插件实例的令牌。

桌面端通过专用 Rust 命令直接连接本机服务，并绕过系统 HTTP 代理；网页不能传入任意目标 URL。原生面板不保存模型 API Key。

## 工程与构建

- `InspirationDrawer.Rhino/`：C# 原生插件、静态聊天客户端、本机桥接及只读工具。
- `Bridge.Tests/`：无需 Rhino 的真实 TCP/HTTP 集成检查。
- `src/features/rhino/`：桌面共享 Chat 适配、会话绑定和请求去重。
- `src-tauri/src/rhino_beta.rs`：固定范围的本机传输。
- `scripts/build-rhino-beta.ps1`：构建桌面和 Rhino 插件的统一脚本。

标准构建机需要 Windows、Node/npm、Rust MSVC、Visual Studio C++ Build Tools 与 Windows SDK、.NET 8 SDK、已安装的 Rhino 9。建议在 VS 开发者 PowerShell 中执行：

```powershell
npm ci
powershell -ExecutionPolicy Bypass -File scripts/build-rhino-beta.ps1 -RhinoSystemDir 'D:/Program Files/Rhino 9/System'
```

只验证源代码和传输：

```powershell
npm run typecheck
npm run test -- src/features/rhino src/features/chat/tools/chatToolRouter.test.ts
dotnet run -c Release --project integrations/rhino/Bridge.Tests/Bridge.Tests.csproj
```

插件与桌面连接协议为内部版本 1；MCP 工具使用无会话的 JSON 请求/响应，协商版本为 `2025-06-18`，不提供远程公开服务或 SSE 推送。Beta 使用轮询更新，后续版本再优化推送和持久化恢复。

## 继续开发

下一阶段先验证稳定的高分辨率/可见区域遮罩导出与所选渠道编辑能力，再做 M2；之后扩充官方 MCP 工具、原生工具审批、多实例选择、任务事件推送及脱离桌面程序运行。

开发接续请先阅读 [开发交接](HANDOFF.md) 与 [MCP 能力核查](MCP-AUDIT.md)。
