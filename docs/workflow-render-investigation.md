# 工作流运行与画布缩放排查记录

日期：2026-10-09。基于工作区 8.0.21（HEAD `30b6794`）本地修改；未推送、发布或部署。

## 已确认的问题与修复

- 原只读链路 `getCanvasItemRenderedBox → getCanvasAiNodeDesignSizeForItem → getCanvasAiOutputPreviewSlots → getCanvasWorkflowAllRuntimeOutputSlots → normalizeCanvasWorkflowRuntimeSnapshots` 会深复制运行快照。这是实际存在的开销风险，不能据此认定故障用户发生了内存不足或 WebView 崩溃。
- 只读预览现在只投影输出的显示字段；不读取快照中的素材、提示词和槽位绑定，也不使用执行草稿来生成显示占位。兼容旧快照数组和新 `nodeSnapshots` 格式。
- 预览先按 AI 对象检查，工作流投影另外按模板和运行快照/输出数组的实际引用缓存；只更新计时字段、替换外层 AI 对象也能复用。尺寸按预览引用和实际尺寸参数（比例、数量、文本、错误、展开状态、槽位数等）缓存，显示边界和预览图库也缓存。槽位数按模板引用缓存。现有编辑路径通过替换对象/数组更新数据，计时和缩放本身不会失效这些缓存。共享投影中每组数据最多保存32个模块条目，其余缓存使用 WeakMap。
- 恢复、编辑、撤销、保存路径的副本隔离保留。显式复制输出到画布时才读取单个输出的提示词等来源信息，避免预览裁剪丢掉复制操作所需的元数据。
- 缩放暂停升级队列，保持已显示的原图/预览来源；结束后缓存仍有效，不再每个缩放段都强制降级再升级。输出图片使用稳定的槽位元素，实际来源变化时更新 `src`。
- 未发现尺寸、预览和节点 ViewModel 在渲染中写回工作流状态；这些缓存不修改用户数据。已有缩略图补全仍在 effect/任务队列中进行。
- 工作流仍由控制器持有执行实例和运行保护。缩放只更新视图；节点卸载不取消或重新提交任务，返回结果不依赖节点挂载。

## 画布层回退开关

只调整整个画布层的缩放提示，不禁用 GPU，也不为所有节点添加 `translateZ(0)`。

默认不强制设置整个画布的 `will-change: transform`。开发控制台中可恢复原策略，下一段缩放生效：

```js
localStorage.setItem('inspiration.canvas.promoteZoomLayer', 'true');
```

恢复本次默认值：

```js
localStorage.removeItem('inspiration.canvas.promoteZoomLayer');
```

同一单工作流场景的可见 WebView2 测试中，两种策略均通过。该结果没有证明此提示是用户崩溃的根因，也没有测量显存峰值或证明某种 GPU 驱动行为。

## 本地原生诊断

主 WebView 接入 Windows `ProcessFailed`，记录 kind、reason、exitCode、分类、窗口标签、软件版本、当前/最近工作流 runId、最近缩放时间和宿主 PID。扩展接口不可用时字段允许为 null，不猜测退出原因。

前端记录 error/unhandledrejection 的错误类别与行列、支持环境中的长任务计数和最长时长；不记录错误原文或堆栈中的路径。心跳每 5 秒发送，正常心跳约每 30 秒落盘，长任务和异常会额外落盘。缩放记录最多约每秒一次，并在缩放结束补发最近时间。

原生独立监测窗口可见/最小化状态。隐藏、最小化或前端页面隐藏时不依据心跳缺失判定卡死；重新显示有宽限期。`heartbeat_gap` 表示疑似停滞，`ProcessFailed` 的分类提供明确进程故障证据，二者不混为一谈。没有自动 reload、重建执行实例或重新生成。

应用的隐藏、显示、最小化、关闭、销毁调用记录静态调用原因和成功与否；额外记录原生销毁/关闭事件、观察到的窗口状态以及主窗口丢失。没有应用调用记录的外部窗口变化只作为观察结果，不冒充主动隐藏原因。

日志：`%LOCALAPPDATA%\com.inspirationdrawer.app\logs\renderer-diagnostics.jsonl`，最多 2 MiB/文件、当前文件和两份轮转文件，总计最多约 6 MiB。原生进程负责写入，渲染进程退出后仍保留。只在本机保存，不自动上传 dump、图片、提示词、密钥或完整用户路径。

API 依据：[Microsoft 的 ProcessFailed 扩展参数说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2processfailedeventargs2)。

## 复现工具

`scripts/run-workflow-render-probe.ps1` 配合 `src-tauri/examples/workflow_render_probe.rs` 和独立前端 fixture。使用单独应用标识和 WebView 数据目录；不运行生产 App，不读取用户数据库，不向供应商发请求或计费。仅供应商返回边界被替换为可手动注入的 Promise，其余使用真实工作流控制器、尺寸/缩放控制器及 CanvasNode。

```powershell
# 一次请求，真实等待100秒，连续缩放，卸载节点时注入结果，重新挂载再缩放
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workflow-render-probe.ps1 -Promote
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workflow-render-probe.ps1 -Diagnostics

# 已验证长等待场景后，仅快速重复故障诊断部分
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workflow-render-probe.ps1 -DiagnosticsOnly
```

诊断部分主动隐藏测试窗口 40 秒，恢复后注入 42 秒主线程长任务，再对**独立测试渲染器**执行 `chrome://crash`。宿主保持存活以写日志，随后结束测试；不自动重新载入。测试窗口会在缩放前显示，使用独立端口 1461；不停止既有开发服务。测试程序的日志保存在对应 `com.inspirationdrawer.workflow-probe-*` 本地目录。

## 已执行验证

Windows + WebView2 **154.0.4258.62** 实机，独立 fixture：

| 场景 | 开启整层提示 | 关闭整层提示 |
| --- | --- | --- |
| 100秒等待 + 返回前后各90次缩放 | 通过（约103.3秒） | 通过（约103.3秒） |
| 提交次数 / 执行实例数 | 1 / 1 | 1 / 1 |
| 未变化预览 / 尺寸缓存失效次数 | 0 / 0 | 0 / 0 |
| 节点卸载期间返回结果 | 保留，success | 保留，success |
| 结果后的图片元素、来源 | 保持相同 | 保持相同 |
| 工作流和普通生图缩略图解码 | 正常 | 正常 |
| 缩放验收时原生窗口 | 可见、未最小化 | 可见、未最小化 |

原生注入诊断已确认落盘：

- 前端 TypeError 和未处理 RangeError rejection；未记录原文。
- 主动隐藏/显示的调用原因及状态；隐藏期间未误报心跳停滞。
- 42,000 ms 长任务，心跳中断约 34.9 秒时报告、约 44.3 秒时恢复。
- 实际 `ProcessFailed` 无响应事件：kind=2、reason=1、exitCode=259。
- 人工渲染进程退出：kind=1、reason=3、exitCode=-1073741819；记录宿主仍存活及窗口最终销毁。
- 原生日志中保留最近工作流 runId 和缩放时间。

自动回归：相关 7 个前端测试文件、49 个用例通过；模拟 100 秒等待和前后各 200 次缩放，检查深复制调用次数不增加，并用不可读取的快照 payload 验证只读路径不访问它。原生日志轮转、隐藏/最小化/页面隐藏及显示宽限期、退出状态保留和多屏窗口交集共四个测试通过。TypeScript/Vite 生产构建与 Rust 编译检查通过。

## 补充：工作流运行后界面消失，宿主仍在后台且无法重新打开

用户进一步报告部分机器在运行工作流时也会出现此现象，不将缩放视为必需触发条件。

已确认并修复一个独立的窗口恢复缺口：托盘菜单、托盘左键和再次启动的原生 `request_force_rescue` 原先只走 `open_drawer/show`，没有原生取消最小化、聚焦或检查屏幕外窗口。这三种显式打开操作现在都额外执行原生恢复，恢复鼠标输入，并仅在窗口完全不与任一当前工作区相交时调整位置；正常位置和工作流执行状态保持不变。恢复不依赖前端事件回调，不自动重新加载或重建 WebView。

新增诊断记录打开来源、恢复前后可见/最小化/聚焦/屏幕内状态和几何信息、各操作成功与否。`ProcessFailed` 后保留故障类别、原因、退出码及观测时间；过期 IPC 心跳不能将已退出的渲染器误报为恢复。只有新渲染器初始化才清除退出状态。恢复原生窗口成功与渲染器存活是分开的证据，窗口显示成功不会把进程故障标成已修复。

```powershell
# 快速场景：最小化、隐藏/屏幕外、前端阻塞时的原生恢复，再注入渲染器退出
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workflow-render-probe.ps1 -Reopen

# 完全不缩放，一次请求真实等待100秒后注入结果
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-workflow-render-probe.ps1 -NoZoom
```

本机 Windows/WebView2 的隔离测试已通过：

- 最小化后只执行原 `show` 的对照测试仍为 `minimized=true`，实际复现恢复缺口。
- 新恢复路径使最小化窗口重新可见；隐藏在 `(-32000, -32000)` 的窗口回到可见工作区。
- 前端15秒主线程长任务期间，原生恢复约35 ms完成，窗口可见且未最小化；随后读取仍为一次提交、一个执行实例、success，结果保留。
- 人工退出渲染器后再次执行打开操作，宿主仍在，日志保留 `renderer_or_browser_exited`，不误判为正常；无自动 reload 或重新生成。
- 不缩放场景约100.2秒完成，提交/实例均为1，状态success，工作流/普通节点图片解码正常，原生窗口可见且未最小化，最近缩放时间为null。

以上复现了窗口恢复缺口和人工渲染器退出，**仍未复现故障用户自然运行工作流时的界面消失**。不能据此认定该用户只是最小化，也不能认定是渲染器崩溃。工作区中的诊断尚未进入用户已安装的正式版本，需在包含本次诊断的版本上获取该机器的本地日志进一步确定。

## 仍未验证

- **没有复现故障用户自然发生的“约100秒后缩放导致界面消失”**，尚不能定论是无响应、渲染进程退出、GPU 故障还是主动隐藏。
- 实机验证使用独立 fixture，并非完整生产客户端安装包端到端验收；没有在故障用户机器、其实际工作流、显卡/驱动组合上复测。
- 返回内容是本地测试图，未验证供应商真实长时间请求、超大原图、异常返回体或显存峰值；普通生图验证覆盖渲染和布局，没有发起真实收费生成。
- 普通缩放期间图片元素/来源稳定已验证；浏览器在内存压力下内部如何回收或重新解码纹理，未做底层图形分析。

本轮保留原有未跟踪目录与用户数据。未调整生成并发、网络重试、模型映射、请求超时或计费；未推送或部署。
