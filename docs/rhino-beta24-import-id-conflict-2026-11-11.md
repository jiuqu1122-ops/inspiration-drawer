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
