# 8.0.30 快捷键点击失效修复

## 根因

- 已在用户安装的 8.0.29 画布界面复现：点击设置中的快捷键按钮，未能保持“请按键…”录制状态。
- runCanvasInteractionsEffect04 在 window pointerup 捕获阶段对全部 button/a/role=button 安排 requestAnimationFrame -> blur。该回调晚于 React click 开始录制，随后触发录制按钮 onBlur 并立即取消。
- 上次只验证了组合键解析和原生注册异步交接，遗漏 pointerup -> click -> RAF -> blur 这一跨模块事件顺序。

## 修复

- 设置面板及具有 data-shortcut-recording 标记（包括 false）的控件不参加画布操作按钮自动失焦，普通画布按钮仍保持原行为。
- 七项录制按钮明确使用 type=button、激活时聚焦，补充“新组合键 / Esc 取消 / 失败保留原值”提示。
- 原生快捷键命令原样移到 shortcut_config.rs，正式应用和隔离原生探针共享同一份保存、冲突检查和系统可用性检测实现。正式数据路径、命令名称和文件格式不变。

## 验证及范围

- 先加焦点回归测试，在修复前确实有 3 项失败；修复后 5 项焦点新测试全部通过，覆盖设置、录制未启动标记、普通按钮及焦点切换。
- 隔离 WebView2 加载真实 DrawerHeaderAndSettings、录制处理器、画布焦点清理和快捷键注册 effect；真实原生命令保存全部七项组合键。随后单独启动第二进程，验证全部配置重载；抽屉模式另起隔离配置运行同一套检查。
- 自动后台 WebView2 的取消检查显式派发标准 focusout（隐藏 WebView 不派发原生 blur）；另用可见原生窗口和系统鼠标键盘验证真实点击进入录制、组合键保存、再次按键触发系统回调计数 0 -> 1，以及第二项录制和 Esc 取消。再次退出并启动该隔离进程，保存组合键仍能从系统触发回调 0 -> 1。
- 所有探针配置在 outputs/shortcut-verification 下；未改动用户运行中正式应用的快捷键或数据。测试快捷键不会写回正式用户目录。
- 8.0.30 保持 com.inspirationdrawer.app、用户数据目录、更新公钥及更新地址不变；Rhino BETA.33 内容未变，不重编或替换插件。

- 全量前端回归：258 个测试文件 / 2647 项测试通过；typecheck、前端构建、正式 Rust 二进制 cargo check 通过。ESLint 为 0 错误 / 48 个既有警告。
