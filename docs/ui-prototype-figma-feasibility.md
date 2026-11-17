# 历史方案：UI 原型与 Figma 导出

状态：用户已于 2026-11-17 明确取消插件方案，当前采用 .sketch 直接文件导入。请看 docs/figma-prototype-export.md。以下是早期可行性记录，不代表当前交付路线。

## 结论

技术上可以实现“Chat 生成结构化交互原型 → 画布展开操作 → 导出可编辑设计”。但这不是图片生成，也不是给普通文件工具增加一个 HTML 后缀。

推荐一份版本化原型定义，分别驱动受控预览与 Figma 导出。定义页面、稳定组件 ID、布局、文字、样式、资源和白名单交互。截图仅用作封面，不用整页栅格化冒充可编辑 UI。

## 当前项目基础

- Chat 工具注册、权限路由、执行进度和产物卡片可以扩展，目前没有专用原型工具。
- 画布可以参考独立 3D 节点的结构与“激活后交互”模式，但尚无原型文档、版本和资源包。
- 当前没有通用 AI HTML 执行沙箱，不能在有原生文件／剪贴板等能力的主窗口直接执行模型任意脚本。
- 收起时显示封面，激活后才运行预览，避免大量活动页面加重画布负担。

## Figma 路线

推荐首版以配套 Figma 插件导入结构化资源包，生成真实文字、图像、容器、Auto Layout 及可支持的原型连接。必须明确这不是无需插件的直接 Ctrl+V。

Figma 官方 Plugin API 可创建相应设计节点；Reaction／Action 可表达页面跳转、覆盖层、组件状态切换等，但不表示任意网页 JavaScript 可无损转换。

官方远程 MCP 已有代码转设计图层和写入能力，但支持客户端与权限存在准入条件，不能假设灵感抽屉自建 Chat 可直接接入。首版不应只依赖它。

## 最小验证建议

三个页面、一个弹窗、一个 Tab：生成后在画布中交互，可用 Chat 局部修改；导入 Figma 后文字可编辑、图层清楚、素材完整、基础跳转可用。缺失字体和不支持效果应明确报告。

不承诺任意 React 工程无损转换、真实登录支付／后端业务、复杂 JavaScript／WebGL 行为、所有动画完全一致或 Figma 反向同步。

## 官方参考

- Plugin API：`https://developers.figma.com/docs/plugins/api/figma/`
- Frame：`https://developers.figma.com/docs/plugins/api/FrameNode/`
- Reaction：`https://developers.figma.com/docs/plugins/api/Reaction/`
- Action：`https://developers.figma.com/docs/plugins/api/Action/`
- Code to canvas：`https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/`
- MCP 客户端接入：`https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/`

后续实施需重新确认当时的官方能力与准入政策。本次工作优先完成基础修复与设计记忆，不实现 UI 原型／Figma 功能。
