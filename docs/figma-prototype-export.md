# 原型预览与 Figma 直接文件导入（无插件）

状态（2026-11-17）：已按用户要求取消离线导入插件/安装引导，改用真正的 `.sketch` 设计文件。设置中的 Figma 插件安装入口、安装命令、插件构建步骤和插件源码均已移除。旧测试输出仅保留为历史验证证据，不再随产品构建或导出。

## 你怎么用

1. 在 Chat 描述“制作一个可导入 Figma 的 UI 原型”，说明页面、文字、布局和交互需求。
2. 生成后点击文件卡片 **预览**，或在 Canvas 窗口查看页面/弹窗/Tab 交互。
3. 点击 **导出 Figma** 或文件卡片 **另存为**，得到一个 `.sketch` 文件。
4. 打开 Figma 文件列表，直接把这个文件拖进去；也可使用 Figma 的 Import / From your computer。**无需插件、Token、MCP 或安装 Sketch 软件**。不是将 ZIP 改成 .fig。
5. 导入后检查字体、换行、裁切以及交互连接。使用文件内的“导入说明与交互清单”页面核对。

## 明确支持和限制

- 输出包含真实、可编辑的文字、矩形、图片、分组和画板，不将整页 UI 栅格化。
- Canvas 和另存的 HTML 继续支持页面跳转、返回、弹窗、Tab 状态切换。
- `.sketch` 中的 fixed-size 横/纵布局预先计算成静态坐标，**不承诺转换为 Figma 原生 Auto Layout**。
- 主界面呈现初始组件状态；完整的其他状态在“组件状态（静态可编辑）”页面中保留。它们不是 Figma 原生组件变体，不会自动切换。
- 弹窗按独立静态画板导出，不冒充 Figma Overlay。弹窗、Tab 的动作映射在说明页与节点 userInfo 中保留，需用户在 Figma 中重新连接。
- 基础 navigate/back 使用 Sketch FlowConnection 表达，但 **Figma 是否保留及其表现需要实际验收**，UI 和模型指令均要求用户核对，不宣称全部交互无损迁移。
- 字体保留名称与字号/字重，不嵌入字体；缺少字体或 Figma 的字体度量差异会影响换行。PNG/JPEG 为内嵌资源，不请求远程图片或本地路径。
- 尚未在真实 Figma 账号完成导入验收；官方 Schema 校验、真实 ZIP 结构和本地预览测试不是 Figma 宿主兼容性测试，不能混为一谈。

## 结构与安全

同一个 `schemaVersion=1` 原型文档继续驱动 HTML 和 Sketch 两个输出。稳定节点 ID、层级、尺寸、交互引用与素材在执行前校验。Sketch exporter 根据 Sketch 官方公开格式生成 document/meta/user、独立页面 JSON 和图片；后端将其写成真正的 Sketch 文件容器。

文档版本选用公开 Schema 支持的兼容版本 121。官方类型/Schema 固定到 `@sketch-hq/sketch-file-format@6.5.0`、`@sketch-hq/sketch-file-format-ts@6.5.0`，放在 `integrations/sketch/vendor/`，含 MIT 许可、下载来源和 SHA256；构建不联网。

Native writer 只允许 document.json/meta.json/user.json、严格 UUID 页面路径以及 UUID PNG/JPEG 图片路径。拒绝重复对象/页面 ID、越界路径、缺失图片/跳转引用、不匹配的图片类型和超大数据。不接受模型提供插件代码、脚本或磁盘输出路径。输出沿用 Chat generated 目录和正常另存流程；历史旧 ZIP 记录仍可预览，从预览重新导出会创建新 .sketch，不会把旧 ZIP 直接复制成新扩展名。

预览仍由 CSP / 无同源权限 iframe 与原生 ACL 隔离，不让模型页面直接获得本机能力；Rhino MCP 权限不变。

## 关键代码

- `src/features/chat/prototypes/prototypeSchema.ts`：原型数据合同及验证。
- `prototypeHtml.ts`：受控 HTML 交互预览。
- `prototypeSketch.ts`：Sketch 文件内容、静态布局、状态画板和交互说明。
- `prototypePackage.ts`：真实文件创建与另存为（沿用历史内部模块名）。
- `src-tauri/src/commands/chat_prototypes.rs`：Sketch archive writer、路径/资源检查。
- `scripts/verify-sketch-export.py`：对真实 archive 的所有 JSON 使用官方 Draft-7 Schema 完整校验（测试环境需 Python jsonschema），并检查 CRC、引用和二进制图片。

## 验证命令

```powershell
npm run typecheck
npm test
npm run lint
npm run build
node scripts/export-prototype-fixture.mjs
$env:DRAWER_PROTOTYPE_FIXTURE_DIR=(Resolve-Path outputs/sketch-export-verification).Path
cargo +1.98.0 test --manifest-path src-tauri/Cargo.toml --locked --offline --bin inspiration-drawer commands::chat_prototypes::tests -- --nocapture
python scripts/verify-sketch-export.py

# 原生 WebView2 窗口里的真实 Chat/预览/导出按钮回归（使用合成数据）
npx vite --host 127.0.0.1 --port 1468 --strictPort
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-chat-html-preview-probe.ps1 -Prototype -Width 1240
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-chat-html-preview-probe.ps1 -SkipBuild -Prototype -Width 420
```

官方参考：
- https://developer.sketch.com/file-format/
- https://github.com/sketch-hq/sketch-document
- https://help.figma.com/hc/en-us/articles/360040514273-Import-Sketch-files
- https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files
