# 原型视觉、动效与通用 SVG 补充

## 当前实现

- 现有 schemaVersion=1 兼容扩展：透明度颜色、线性渐变、多重内外阴影、字距、容器裁切控制及归一化贝塞尔矢量图标。HTML 与 Sketch 均从同一数据生成。
- get_ui_prototype 分页读取当前对话的原型节点；animate_ui_prototype 只合并 motions，不更改 screens/nodes/interactions。原型及节点 ID、布局、图标、进度条和文字保持不变。
- 动效支持入场淡入、平移、缩放、进度增长、数字滚动及按压/悬停反馈，尊重 prefers-reduced-motion；不接受任意代码或不存在的目标。
- Sketch 输出相同的静态终态与可编辑图层，不宣称动画会变成 Figma 原生 Smart Animate；动画保留在 Canvas/保存的 HTML。
- 普通 HTML 的「导出静态稿」在确认后捕获当前页面支持的文字、形状和布局，不让模型重画。隐藏页面/事件/动画不转换；SVG/Canvas 内容可能为独立图片图层，滤镜和复杂渐变可能不保留，会显示说明。
- 通用 Chat 的 create_svg 工具交付真实 SVG 文件，不属于原型功能。支持卡片缩略图、放大预览、复制、打开与另存；不调用付费位图生成，不以嵌入位图冒充矢量。原生 XML 校验拒绝脚本、事件、样式代码、外链、危险标签/实体与循环资源引用。
- GitHub 技能提示区分脚本步骤与 MCP 线索；search_skill_resources 仅检索已安装固定版本的文本/CSV 资料，不执行包内 Python、shell、BM25/design-system 生成或文件持久化。

## 验证与限制

- 前端真实工具路由/执行器测试覆盖原型读取、仅加动效、静态图层一致性、跨会话拒绝、资源安全、通用 SVG 文件交付及按需资料检索。
- 原生 Sketch writer 已生成合成文件，并通过仓库固定的 Sketch 官方 JSON Schema 与 ZIP CRC 校验；添加动效前后静态导出 pages 数据完全一致。
- 已通过类型检查、全量前端测试、lint、前端构建、cargo check、SVG 原生文件落盘测试和技能检索原生测试。原始日志位于 outputs/chat-expansion-*、outputs/prototype-motion-sketch-check.log 等。
- 当前环境浏览器访问后端不可用，备用原生浏览器窗口处于最小化且工具无法恢复，未完成最新代码的实际浏览器逐帧视觉验收。
- 未在实际 Figma 中进行这次新属性的导入保真验收，不能将格式/Schema 验证当作真实 Figma 兼容性保证。
- 当前仅修改客户端源码，没有改服务端、计费、密钥或更新渠道；发布版本与下载入口以 README 和 docs/releases/8.0.32.md 为准。
