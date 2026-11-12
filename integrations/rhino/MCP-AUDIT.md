# Rhino Beta MCP 能力核查
## 2026-11-06 source status

beta.6 adds native MCP forwarding. It reads listener announcements from the current Rhino process, then calls `tools/list` and `tools/call` only after a unique bound-document fingerprint match. The match includes current selection, the complete object ID list, object/layer counts, and camera; more than 10000 objects or duplicate fingerprints disable native tools.

Native read and write calls execute directly in Rhino plugin Chat after the user sends a request. They are forwarded only to the official RhinoAI MCP listener matched to the bound document. The bridge compiles and transport tests cover request routing; real GUI modeling execution remains a separate manual verification requirement.
## 结论

Chat 具有调用 Rhino 工具的通路；beta.1 运行实例提供 4 个工具。当前源码 beta.2 增加第 5 个只读工具 `rhino_list_parts`，并把分件清单附加到 Chat 提示上下文。它是灵感抽屉插件自建的 MCP 服务，并未连接 Rhino 官方 AI router 的完整 MCP 工具集。分件清单不包含可见区域图或遮罩，也不能单独约束图像编辑。

## 实际会话证据

- 用户截图所对应的 Beta 会话使用 gpt-6-1-sol，保存的 Rhino 上下文中包含 113 个选中对象。选择读取已工作，截图上的“0 个”不能据此判为选择识别故障。
- 该会话的工具执行记录只有 generate_image，状态 completed。没有模型主动调用 rhino_get_context、rhino_list_objects 或 rhino_list_layers 的记录。
- generate_image 的参数中有 1 张 referenceImages，没有 mask 参数。当前出图不具备按 Rhino 部件遮罩约束的证据。
- 上下文和视口可以由桌面桥接在发送消息前自动读取。这类预处理不存入模型的 chat_tool_calls，不能因缺少模型工具记录就认定完全没有读取 Rhino。

## 本机 MCP 实测

initialize 返回服务名 inspiration-drawer-rhino-beta，版本 0.1.0-beta.1。

tools/list 返回：

| 工具 | 当前用途 | 模型可主动调用 |
| --- | --- | --- |
| rhino_get_context | 文档、相机、选择 | 是，需从 Rhino 入口发送并建立会话绑定 |
| rhino_list_objects | 对象 ID、名称、图层、类型、隐藏状态 | 是 |
| rhino_list_layers | 图层 ID、完整路径、可见性、显示颜色 | 是 |
| rhino_list_parts | 当前选择对象、块实例展开分件、简单材质/来源、可用面材质和变换 | 是（beta.2 源码；尚未 Rhino GUI 验证） |
| rhino_capture_viewport | 当前视口 PNG | 仅桥接预处理使用，未作为模型工具公开 |
| rhino_list_native_tools | Enumerate matched official native tools | Beta bridge only |
| rhino_call_native_tool | Forward one matched official tool | Chat maps it to `rhino_native_<name>` and executes it directly in Rhino plugin mode |

当前 beta.2 源码还声明 `rhino_list_parts`，读取当前 Rhino 选择并用 `InstanceObject.Explode` 展开块内分件，包含稳定路径 ID、piece 属性、简单材质与来源、Rhino 返回变换以及估算包围盒；父级继承不可确认时会标为未解析。原生面板独立低频读取分件端点。beta.2 的相关行为只有源码/协议测试和 RhinoCommon 编译验证，尚无 Rhino 9 GUI 运行验证。

对正在运行的文档分别实测前三个 tools/call，全部成功。对象返回字段为 id/name/layer/type/hidden；图层字段为 id/path/visible/color。没有对象的实际渲染材质、纹理、材质继承关系，也没有部件对应的屏幕区域或遮罩。

## 源码通路

1. useRhinoBridge 在发送消息前调用 rhino_get_context；勾选视口时调用 rhino_capture_viewport，并保存真实图片附件。
2. 对会话建立绑定后，getRhinoTools 提供三个只读工具定义。
3. ChatHost 把 additionalTools 和 withRhinoTools 传给 useChatRuntime；运行时把额外工具加入模型请求。
4. 模型发出函数调用后，路由器允许只读 Rhino 工具，withRhinoTools 经 rhinoClient 向本机 /mcp 发送 tools/call。
5. Rust 专用传输读取固定连接描述、鉴权并直连本机服务；C# 服务通过 RhinoCommon 执行读取。

“已连接灵感抽屉”只说明桌面心跳连接成立，不代表模型每轮都调用了 Rhino 工具，更不代表官方完整 MCP 已接通。

## 距离目标功能的缺口

要实现“选中模型，按图层或材质指定分件并渲染”，需要补齐：

1. 分件清单：稳定部件 ID、对象集合、完整图层路径、实际生效材质及材质来源；块实例需处理变换与材质继承。
2. 同一相机下的视口底图、部件 ID 色彩图和可见区域遮罩，把场景部件对应到图像区域，并处理遮挡。
3. 渲染指令编译：把用户的分件配色/材质要求、参考图和部件映射一起交给生图/编辑通路；读取失败应明确报错，不默默退回按截图猜测。
4. 区域约束：依据实际模型的遮罩编辑能力或输出合成实现局部保护。只有色彩图加提示词不能保证其他区域像素不变或几何完全保真。

本次只完成能力核查，没有安装新版插件、修改当前 Rhino 文档或宣称上述缺口已实现。
