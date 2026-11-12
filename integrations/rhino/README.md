# Inspiration Drawer Rhino Beta.32

Release date: 2026-11-12  
Desktop: `8.0.27-beta.32`  
Rhino plugin: `0.1.0-beta.32`

## Prompt text is not authorization to render an image

Desktop Chat and Rhino-panel Chat share the same request policy. Requests to write,
improve, translate, or explain an image-generation prompt now remain text tasks.
Recognized prompt-only requests omit image-generation/edit tools. The dispatch
router also blocks erroneous image calls before invoking the executor. A separate
request such as "write the prompt, then generate the image" retains image tools.
The word "generate" alone does not authorize paid image output.

Also included: preserve an omitted server model catalog as omitted rather than
serializing it as an authoritative empty array. An explicitly empty catalog stays
empty; this does not restore deleted server routes or change provider protocols.

## Rhino host layout

Retains the Beta.31 Rhino 8 fix: no fixed WebView Size; Eto expanding host layout;
compact minimum 340 x 420 logical pixels. Rhino 9's direct WebView host-layout path
remains unchanged. Live docking/floating resize acceptance on the user's Rhino
8.0.23 machine is still pending.

## Install / update

1. Save your Rhino files, exit Rhino, and close the older desktop beta.
2. Run `Inspiration Drawer Rhino Beta_8.0.27-beta.32_x64-setup.exe`.
3. In the desktop app, choose Settings > Rhino Plugin > Install / Update.
4. Restart Rhino and open InspirationDrawer. Confirm the badge reads `BETA.32`.
5. Test prompt-only wording and a separate image-output request as distinct tasks.

The installer embeds the matching Rhino 8 and Rhino 9 plugin payloads. Manual ZIP
packages are also supplied for net7.0 (Rhino 8) and net8.0 (Rhino 9). Do not mix the
framework folders; keep the RHP, deps, runtimeconfig, RUI, and SVG files together.
No Yak package is supplied in this build; use the desktop plugin updater or ZIP.

## Verification scope

See TESTS.json, VERIFY.json, and SHA256SUMS.txt beside the release artifacts.
Checks cover automated regressions, both plugin builds, current embedded resources,
installer/portable agreement, and archive integrity. Synthetic model replies do
not prove arbitrary live model behavior. No paid cloud image tasks or target
Rhino 8.0.23 GUI acceptance were performed for this release. This is an unsigned
beta build and does not publish a stable auto-update or change the wallet backend.

---

## Historical notes

## 历史发布说明（以本页最上方版本为准）

# 灵感抽屉 Rhino Beta.24

2026-11-11 · 桌面端 8.0.27-beta.24 · 插件 0.1.0-beta.24

## 这次启动弹窗：重复 ID，而不是面板完全没加载

详情截图明确指向旧 YAK：packages/9.0/inspiration-drawer-rhino/0.1.0-beta.1/net8.0/InspirationDrawer.Rhino.rhp，报“ID 已被使用”。已加载的副本与这个旧包有相同 GUID，所以一个能用、另一个在每次扫描时报错。启动时序加固与这个重复安装的根因分开处理；不能仅隐藏弹窗。

## 推荐更新／修复步骤

1. 保存工程，退出旧版抽屉，完全关闭 Rhino 8 / 9。
2. 安装本目录的 x64-setup.exe，并启动新版抽屉。
3. 打开「设置 → Rhino 插件」，点击「一键安装 / 更新插件」。检测到时会显示“旧包 ID 冲突”。
4. 程序核对旧 YAK 的包名和插件 GUID，先将旧包备份到扫描目录外，再确认规范安装生效。旧包不会永久删除，不触碰 RhinoAI、其他插件、模型或聊天记录。
5. 启动 Rhino，使用灵感抽屉工具栏按钮或 InspirationDrawer 命令。

不要勾选弹窗中的“不再加载此插件”，以免禁用同 GUID 的有效副本。Rhino 未退出时不会迁移冲突包；请按设置提示退出后再更新。

备份位置：%LOCALAPPDATA%/InspirationDrawer/RhinoPluginBackups/主版本/migration-…/。RESTORE.json 记录原路径和备份路径。若无法验证或移动，操作会报错，不强制删除或假装成功。

单独 YAK 包适用于纯 YAK 安装；不要再与设置的一键安装版混装。遇到本次重复 ID 的机器，请使用桌面端的上述修复流程。

## 建模脚本的 System NameError

- 截图中的 Python 使用了 System，却未定义/导入。from System import Guid 也不等于 import System。
- 增加已知 Python/.NET 命名空间的执行前检查，支持 System、Rhino、math 与常见 rg/sc/rs 别名；不为摄像头或其他产品写死建模模板，不擅自插入和执行代码。
- 本地尚未派发的导入错误允许模型按明确回执修正一次。已执行到远端的 NameError 不能证明零写入，仍禁止盲目重放。
- 根据真实 AddBrep、AddMesh 等 API 识别几何写入，避免“帮我建一个摄像头”等没有“建模/模型”关键词的短需求漏掉前后检查。材质/视角等非几何操作不以几何变化判断完成。
- 主回复显示解码后的名称、说明和行号；原始 JSON/Traceback 保留在工具回执，而不是整段刷屏。

## 启动加固与保留功能

插件自身与安装注册统一为随 Rhino 启动；MCP 和 WebView 的初始化延后到文档就绪/Idle。不在 OnLoad 里抢跑外部命令。真实加载错误仍明确显示，并记录到 %LOCALAPPDATA%/InspirationDrawer/RhinoBeta/startup-进程号.log。

保留黄色悬浮方块＋白色灯泡、图片放大预览、Markdown、旧对话模型选择、工具栏入口及全目录 MCP 适配。

## 验证范围

前端类型检查及 2419 项测试通过；95 项 C# 回环协议/启动调度检查通过；6 项 Rust 安装器/旧包迁移测试通过；Rhino 8 与 9 插件分别构建通过。安装包内嵌资源与配套插件一致性见 VERIFY.json，文件哈希见 SHA256SUMS.txt。

测试使用隔离目录或模拟端点；没有修改用户正在运行的 Rhino 文档，没有在截图所在另一台电脑执行安装或迁移。真实机器需更新后验证；不声称任意自然语言指令必定成功。

---

## 历史版本

# 灵感抽屉 Rhino Beta.23

日期：2026-11-11。桌面端：8.0.27-beta.23；Rhino 插件：0.1.0-beta.23。

## 安装

1. 保存工作并退出旧版灵感抽屉和 Rhino，再运行本目录的 x64-setup.exe。
2. 打开新版抽屉，进入「设置 → Rhino 插件」，点击「一键安装 / 更新插件」。会自动为检测到的 Rhino 8 / 9 安装对应插件和工具栏资源。
3. 启动或重启 Rhino，使用灵感抽屉工具栏按钮；也可输入 InspirationDrawer 打开面板。
4. 桌面端必须运行并完成正常登录与模型设置。原生 Rhino MCP 操作仍需要另外安装 RhinoAI / Rhino-MCP-Platform；本包不会替换它。
5. Rhino 8 的原生 MCP 功能请使用 8.19 或更新版本。早期 Rhino 8.0 不应被当作可自动建模的支持环境。

如果不使用设置中的一键安装，可选择对应 Rhino 主版本的插件 ZIP；RHP、deps、runtimeconfig、RUI 和 SVG 必须保留在同一目录。Rhino 8 使用 net7.0 包，Rhino 9 使用 net8.0 包，不要混用。

## 本版改动

- 悬浮方块的默认底色从蓝色改为黄色，搭配白色灯泡。拖入图片时的成功绿色、失败红色保持不变；侧边小条没有改色。
- Rhino Chat 图片可点击放大：先显示现有缩略图，再按需读取较清晰预览（最大边 2048 像素）；支持 Esc／点击空白处关闭。不重新生成图片，不占用建模任务。
- AI 回复按 Markdown 展示标题、粗体、列表、表格和代码块；不会执行模型输出的 HTML。
- 旧对话可以切换模型；修正焦点导致选择器不恢复、旧心跳覆盖选择，以及模型未保存却回报完成的问题。
- 加入 Rhino 工具栏按钮和安装携带的图标资源。
- 对缺少原生写入能力的明确操作请求给出升级／安装／连接提示。
- MCP 检查覆盖完整公开工具目录，不限于建模：修正未来／未知类别工具被误判为无写入能力、可选截图或分件失败阻断其他操作、自动重绑定与执行期间竞争，以及原生工具图片回执处理。

## 验证与边界

- 前端类型检查、全量 2375 项测试通过。
- 90 项 C# 回环协议检查通过，包含材质、相机、选择、保存的精确转发及重绑定竞争场景；这些是模拟 MCP 端点，不是对用户模型的实操。
- Rhino 8 / 9 插件均构建通过；桌面安装包与内嵌插件还会做完整性校验，记录见 VERIFY.json / SHA256SUMS.txt。
- 用户提供的 RhinoAI 附件静态目录包含 42 个公开工具；回归确认完整暴露其元数据，不代表本机或另一台机器实时启用了全部工具。生产仍以实际 tools/list 为准。
- 没有改动或关闭用户的 Rhino 文档，没有替换正在运行的软件。本轮未完成真实 Rhino GUI 的所有能力实测，也没有宣称任意自然语言建模必然成功。

如果图片的原始文件或下载地址已经失效，会保留缩略图并提示无法读取大图，不伪造清晰度。

---

## 历史记录（以本页最上方 Beta.23 为准）

# Inspiration Drawer Rhino Beta 0.1.0-beta.21

Desktop: 8.0.27-beta.21. Windows Rhino 8 (.NET 7) and Rhino 9 (.NET 8).

## Beta.20 contextual Chat, readable conversation titles and general repair feedback

Conversation IDs remain internal. New conversations start as New conversation and are titled from the first sentence of the first user request. The backend derives the earliest user message for legacy automatic titles, without changing stored IDs, bindings, history or custom names. The panel no longer appends UUID suffixes.

Usable attached/restored images keep the real image tools available for semantic choice, not only exact output keywords. Clear image revisions have an execution fallback; supplying a new reference can continue the preceding user task. Explicit analysis-only/no-generation/wait-for-reference instructions take priority. Native geometry tasks are not converted to image generation. No paid calls are replayed on failure.

Geometry preflight repair now exposes exact input paths and readable diagnostics. Unchanged crossing boundaries, minWall-only pseudo-fixes and deleting holes are rejected locally. At most two zero-write corrections are allowed; commit/unknown outcomes are never replayed. The specialized profile builder is not a general 3D modeling engine, and mixed Loft/Sweep/Pipe/SubD/branched workflows are not forced into a plate. See docs/rhino-native-audit-2026-11-10.md (also delivered as verification/NATIVE-AUDIT.md) for static native-plugin findings, real failure attribution, failure matrix and remaining limitations.

## Beta.19 script-type preflight and failure inspection

The reported Python failure passes a BrepFace into Surface.CreateExtrusion(Curve, Vector3d). These are different APIs: trimmed faces (including holes) use face.CreateExtrusion(Curve pathCurve, bool cap), which returns a Brep. A local conservative Python/C# checker now rejects recognizable face/Brep/wrong-overload arguments before the original script is sent. Common Rhino/Geometry aliases are covered; strings, comments and embedded GH code are excluded. Unknown dynamic types are not guessed. This is not a full language type checker.

The existing bounded repair flow corrects the typed local rejection once without user approval, skips dependent calls and reuses completed write receipts. It does not strip holes or rewrite arbitrary code. Planar/perforated modeling still prefers the controlled safe profile builder; curved/3D and explicit GH workflows are not flattened into plates.

For a structured, settled Python traceback returned by MCP, the bridge reads back the bound document once and preserves added/changed/deleted geometry details, even if the script failed. An unchanged geometry snapshot is NOT proof of zero side effects, so dispatched raw scripts are not automatically replayed. Timeout/disconnect/unknown completion does not trigger an additional queued readback. Exceptions in stderr cannot be reported as modeling success. The user-facing message explains the known type mismatch; full diagnostics remain in the tool receipt.

This release retains Beta.18 multi-process and per-document isolation. It does not resume the user's previously failed instruction or claim photo-accurate modeling was verified.

## Multi-window connection fix

A Rhino runtime serial is process-local, not a Chat conversation ID. Two Rhino.exe processes can each start with document 268435457. Beta.17 still used a single connection.json, so the newest Rhino overwrote discovery for the original process. Beta.18 announces one connection-{processId}.json per Rhino process, enumerates all announced instances and routes every request by the exact instanceId. Document sessions, running-task locks and selected conversations use instanceId + documentId + canvasId.

Heartbeats run independently per Rhino instance: a stalled or closed process cannot prevent other windows from refreshing. Original tasks retain their own conversation/messages when another window becomes active. Previously identical legacy conversation titles are displayed with unique short conversation suffixes; new titles use a proper UTF-8 label. The panel displays the process window number separately from the document identity. Rhino's supported RhinoDoc constructor is included for per-document panel creation.

The desktop MCP timeout now permits the native host's execution window instead of giving up after 25 seconds. No write is automatically replayed after a timeout, uncertain outcome or process switch.

## Update both halves

1. Save your Rhino documents. Do not terminate an active modeling call blindly.
2. Close the desktop Beta and all Rhino instances after their active calls finish or are stopped.
3. Install Inspiration Drawer Rhino Beta_8.0.27-beta.21_x64-setup.exe.
4. In desktop Settings > Rhino plugin > Install / Update, install the paired Rhino 8/9 plugin.
5. Reopen both Rhino windows and the InspirationDrawer panel in each. Keep the desktop Beta running.

Both the desktop discovery fix and the plugin's per-process descriptors are required. Updating only the RHP will not fix an old desktop runtime. Completed/uncertain writes from a previously interrupted session are not replayed automatically.

## Verification scope

See the current release VERIFICATION.json for the exact focused frontend, SQL, bridge and Rust test counts. Previous-release checks below describe their original scope. Tests reproduce two independent authenticated loopback servers with the same document serial, progress after a second host connects, isolation after one closes, and stalled-heartbeat isolation. Rhino 8/9 plugins are rebuilt. Live user documents were not changed or closed, and the user's installed running binaries were not replaced. Live two-process Rhino UI verification remains to be done after installation; this release does not claim that a remote modeling task or photo-accurate reconstruction was completed.

Release: release-assets/rhino-beta21-semantic-visual-intent-20261111/

---

## 历史版本说明（以下安装方式、版本号和会话描述以最新发布说明为准）
﻿# 灵感抽屉 Rhino Beta 0.1.0-beta.8

这是配套桌面抽屉的 Rhino 9 插件。Rhino 原生停靠面板作为 Chat 的第二个入口；模型请求、账号、生成、画布和会话存储仍由配套桌面 Beta 执行。

## 使用

1. 解压完整 Beta 包，启动 `desktop/inspiration-drawer.exe`。这是独立数据目录的 Beta，需要在里面完成正常登录/授权和模型设置。原来已安装的正式版不包含本次连接功能。
2. 将包里的 `.yak` 拖入 Rhino 9 安装，按 Rhino 提示重启；也可以通过插件管理器加载 `plugin/net8.0/InspirationDrawer.Rhino.rhp` 做临时测试。
3. 在 Rhino 命令行执行 `InspirationDrawer`，打开“灵感抽屉 Beta”面板。等待显示“已连接灵感抽屉”。
4. If Chat must operate Rhino, run `MCPStart` in the target Rhino document and accept the default port. Read-only queries and viewport capture do not require this step.
5. Open the target canvas in desktop Beta, select the reference image and Rhino object, then send from the Rhino panel.

首次建议只发送：

> 请告诉我当前选中对象的名称、图层和类型，并描述附带的视口图片。先不要生图。

确认图片可见、对象正确后，再发送：

> 参考画布选中的材质图，给 Rhino 中这个外壳生成一张效果图，尽量保持附图视角，放回当前画布。

面板支持新建/切换会话、选择聊天和生图模型、停止任务、查看工具状态及图片预览。两个入口显示同一个桌面 Beta 会话。第一版仅同步最近 30 条消息，最近 8 条消息提供缩略图预览；完整记录以桌面 Chat 为准。

## beta.8: conversation deletion and completion display

The Rhino panel has a Delete button beside its conversation selector. It deletes only the selected current Rhino conversation after explicit inline confirmation, including its stored messages and tool receipts. It does not delete Rhino document objects or canvas content. Running conversations cannot be deleted; stale selections and repeated requests are rejected. The last deleted conversation is replaced with an empty Rhino conversation.

Completed native command summaries no longer display known temporary meshing progress as their final answer. Original tool receipts and failed history remain unchanged; existing successful summaries are normalized when the conversation is loaded.

## Chat mode and history isolation

Desktop Chat and the Rhino native panel now use independent Chat runtimes, conversation lists, active-conversation keys, and history scopes. Rhino-panel conversations are stored with a separate `rhino-chat-conversation-` ID namespace; legacy `Rhino ??` entries are also kept out of desktop history. Both modes still use the same canvas, image generation, rendering, and other desktop services.

## RhinoAI native MCP modeling

beta.7 adds direct execution of native RhinoAI MCP tools from Rhino plugin Chat. After the user sends a request, native read and write tools execute without a second approval card. The bridge only considers listener announcements from the current Rhino process and matches the bound document by selected IDs, the complete object ID set, object/layer counts, and the active camera. Ambiguous or incomplete matches fail closed. Rhino commands and scripts can modify or delete document content; use an undoable document and verify results before keeping them.

Native tools are mapped into Chat as `rhino_native_<name>`, for example `rhino_native_run_command`. Calls are forwarded to the matched official RhinoAI MCP listener and execute directly after the user sends the Chat request; there is no extra approval step. The bridge never substitutes its own command executor for the official MCP tool.

Source integration, plugin compilation, transport checks, type checks, and focused frontend tests pass. Real Rhino GUI modeling execution is still not verified; first manual validation must use an empty or undoable document.
## 本版边界

- 测试平台：Windows、Rhino 9，实际加载测试构建为 `9.0.26300.09401`，使用 .NET 8 插件运行时。
- 桌面 Beta 必须持续运行；可最小化，不要求 Chat 侧栏始终打开。关闭桌面程序后无法启动新请求。
- Beta 使用插件自己的五个只读/捕获 MCP 工具：文档上下文、对象列表、图层列表、所选对象分件清单、当前视口 PNG。分件清单包含稳定对象/面索引、图层路径、Rhino 简单材质及来源、块实例路径和变换；父级材质未能确认时会标为未解析。它没有接管官方 AI 面板，也没有修改官方代理列表。
- Chat 图片设置提供可选 Mask 编辑，默认关闭。只有服务端模型/线路目录明确声明 `supportsMask` 时才允许启用；Rhino 面板可自动导出当前选择或指定图层的 PNG Mask，并与基础视口保持同尺寸。未声明能力、Mask 捕获失败或云端未回执 `maskApplied` 时会拒绝生成结果，不会静默回退为普通生图。
- Rhino 捕获视口时使用打印式捕获以排除选择高亮/Gumball；Mask 捕获期间临时切换到 Shaded 显示模式再恢复。按图层捕获会临时选择该层可见对象并在异常路径恢复原选择；子对象/面选择时拒绝按图层捕获。当前 Mask 是选中几何的栅格轮廓，不是逐部件 ID 色图；不同上游的透明区语义不同，请先用低成本请求验证。
- Native modeling uses the official RhinoAI MCP path only after `MCPStart` and unique document matching. Arbitrary Python/C#, deletion, material edits, and real GUI modeling remain unverified; do not treat beta.6 as a production modeling release.
- 视口图片长边最多 1600 像素；普通视口截图不会带入屏幕选择高亮。启用 Mask 时捕获采用 Shaded 模式，完成后恢复原视图显示模式。
- 原生面板显示当前选择的分件预览；发送 Chat 时附带最多 60 个分件记录。复杂选择可能截断并由结果标记。数据读取只用于提示和材质识别。
- 这是参考图生图/编辑流程。可选 Mask 仅约束明确支持它的编辑渠道；没有深度/法线条件或区域外像素合成保护，不保证严格保持几何。
- 一个会话绑定一个 Rhino 文档、一个画布和一个插件实例。换文档/画布/实例后请新建会话。首版只自动发现最后打开面板的 Rhino 实例。
- Rhino 请求执行期间暂时禁止切换、创建和删除画布，防止已有画布执行器把结果写错位置。关闭文档会使后续 Rhino 查询明确失败。
- Rhino 原生 MCP 工具在用户发送指令后直接执行，不再等待第二次确认；命令与脚本可能修改或删除模型，请在可撤销的文档中使用并核对结果。
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

## One-click installation / Rhino 8 and 9 (beta.10)

In desktop Settings, expand Rhino Plugin and click Install / Update. The desktop executable embeds separate Rhino 8 (.NET 7) and Rhino 9 (.NET 8) builds. Detection uses the local Rhino installation registry, not a hard-coded program path. Registration is per-user and offline. Content-addressed installation directories prevent overwriting an RHP currently loaded in Rhino; restart Rhino to pick up an update. Prior plugin registration paths are backed up next to each installed payload. Models, chats and canvas data are never touched. RhinoAI native MCP is a separate dependency and is not replaced by this installer.

Image settings in the Rhino panel now expose model-supported resolution, aspect ratio, and quality (when supported) via the same desktop Chat generation settings. Unsupported/stale choices are rejected without starting a generation request.

Release builds must run scripts/build-rhino-plugin-payload.ps1 before cargo build. scripts/build-rhino-beta.ps1 does this automatically for both versions. Rhino 8 builds are compiled against the Rhino 8.0 SDK and use .NET 7-compatible JSON clone/equality helpers. Newer display flags are applied only when available. The Rendered raster screenshot and blank-image guard are shared by both builds.


## Beta.21 semantic visual intent

Image tools are exposed based on actual visual context and explicit visual capability intent, not steering-wheel/object/domain keywords. A current attachment or recent generated result lets the model decide whether a request is an artifact/edit task, even when the user never says ?generate/render/image?. Capability visibility is not a dispatch and does not spend credits. Explicit analysis/questions/wait/no-generation instructions are guarded at the router before any image executor call. Unrelated new topics do not inherit old references.

This release does not hard-code a product, industry, shape or object vocabulary. The model receives a generic multimodal policy and the actual reference context.

