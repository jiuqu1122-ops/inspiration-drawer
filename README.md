# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 画布 Agent（v4.2.0）

设置中的“AGENT 设置”与生图、CMF 接口相互独立，支持两种运行方式：

- OpenAI-compatible API：配置 Base URL、API Key、模型和可选 Header，使用 Chat Completions 流式响应及函数工具控制画布。
- Codex App Server：本机需要可用的 `codex` CLI。应用通过 stdio JSON-RPC 连接 App Server，支持 ChatGPT/设备码登录、线程恢复、流式消息和审批事件。

Agent 侧边栏在画布右侧占用独立布局空间，可以收起或拖动左侧边缘调整宽度。节点创建、Prompt 修改、连线、工作流应用和布局整理都通过受控画布工具执行；运行工作流始终需要用户确认。

Codex 模式默认使用只读沙箱。登录令牌由 Codex 自己管理，前端不会读取 `~/.codex/auth.json`。API 模式的 Key 由 Tauri 后端配置保存，前端只接收“是否已配置”的状态。

## 离线授权

本项目内置了第一版离线机器码授权：Tauri 前端只展示机器码、授权状态和导入入口，签名校验与高级功能拦截在 `src-tauri` Rust 后端完成。主应用只内置 Ed25519 公钥，私钥只通过独立的 `license-generator` 命令行工具使用。

### 签发密钥

主程序只内置 Ed25519 公钥。签发私钥不在前端、源码或主程序安装包中，授权生成器 Rust 后端只从本机密钥文件读取私钥：

```text
%APPDATA%\com.inspirationdrawer.licensegenerator\signing-key.json
```

主程序当前内置公钥：

```text
PUBLIC_KEY_B64=AAS4rzI5dxFefYmQCNp1wYpYgKwMXp5+wG1WgF/UoRQ=
```

新机器首次使用授权生成器时，通过界面的“导入签发密钥”选择备份的 `signing-key.json`。私钥文件和授权生成器都只能自己保管，不能发给客户。

### 生成授权文件

先在应用的“设置 -> 离线授权”里复制客户机器码，然后使用本机密钥文件生成 license：

```powershell
cd src-tauri
cargo run --bin license-generator -- `
  --key-file "$env:APPDATA\com.inspirationdrawer.licensegenerator\signing-key.json" `
  --machine-id "客户机器码" `
  --customer "客户名称" `
  --edition pro `
  --expire-at 2027-06-18 `
  --features "*" `
  --out license.json
```

授权生成器默认生成 `*` 全功能授权。主程序未授权时会整体锁定；导入有效 license 后，整套软件解锁。

### 授权生成器小软件

项目还提供了独立 GUI 生成器，不需要打开主程序。开发调试：

```powershell
npm run license-generator:dev
```

打包一个可直接运行的生成器 exe：

```powershell
npm run license-generator:build
```

生成后的程序在：

```powershell
src-tauri\target\release\license-generator-app.exe
```

构建脚本也会同步一份可运行 exe 到旧路径：

```powershell
src-tauri\target\generator\license-generator-app.exe
```

如果要生成带 WebView2 引导安装器的发布包：

```powershell
npm run license-generator:bundle
```

GUI 确认“签发密钥已配置”后，只需要填写客户机器码、选择版本和到期时间，然后生成或保存全功能 license 文件。主程序和授权器使用不同的 Vite 输出目录，主程序安装包不会包含授权器页面或签发私钥。

### 导入和手动验证

1. 启动应用：`npm run tauri -- dev`。
2. 打开“设置 -> 离线授权”，未导入时应显示“未授权”。
3. 点击“导入授权”，选择生成的 `license.json`，成功后会显示客户、版本、到期时间和功能列表。
4. 修改 `license.json` 中任意字段后再导入，应返回“签名无效”。
5. 使用其他机器码生成的 license 导入，应返回“机器码不匹配”。
6. 将 `--expire-at` 设为过去日期生成 license，应显示“已过期”，高级导出不可用。
7. 导入有效 license 后，主程序整体解锁，授权范围显示为“全部功能”。

### 测试

```powershell
cd src-tauri
cargo test
cd ..
npm run build
```

### 安全注意

- 离线授权不能完全防止二进制被逆向或补丁绕过，只能提高分发门槛。
- 主程序只内置公钥；更换签发密钥后必须更新主程序公钥、重新打包并重新签发已有客户授权。
- 私钥只保存在本机 `signing-key.json`，请制作离线备份；授权生成器和密钥文件都不能发给客户。
- Windows 机器码基于 `MachineGuid`、主板 UUID 和 BIOS 序列号的 hash，不再包含电脑名或磁盘序列号；更换主板、重装系统或厂商返回占位硬件信息时仍可能导致机器码变化，需要后续设计换机流程。
- 过期判断依赖本地系统时间，离线场景下仍可能被回拨时间绕过。
- 后续新增高级 Rust command 时，必须继续调用 `require_feature("功能名")`。
