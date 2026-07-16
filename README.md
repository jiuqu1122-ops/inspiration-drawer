# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 画布 Agent（v4.2.9）

v4.2.9 在 Agent 输入区增加与官方 Codex 一致的模型和推理强度选择器。模型列表直接读取当前 ChatGPT 账户的 Codex App Server `model/list`，选择结果会应用到新线程和后续回合；同时保留真实节点预设、画布权限切换与节点图片自动引用能力。

设置中的“AGENT 设置”与生图、CMF 接口相互独立，支持两种运行方式：

- OpenAI-compatible API：配置 Base URL、API Key、模型和可选 Header，使用 Chat Completions 流式响应及函数工具控制画布。
- Codex App Server：应用会在首次登录时下载并校验 OpenAI 官方 Codex 运行时，也可以使用用户指定的 `codex` CLI。应用通过 stdio JSON-RPC 连接 App Server，支持 ChatGPT/设备码登录、线程恢复、流式消息和审批事件。

Agent 侧边栏在画布右侧占用独立布局空间，可以收起或拖动左侧边缘调整宽度。节点创建、Prompt 修改、连线、工作流应用和布局整理都通过受控画布工具执行；运行工作流始终需要用户确认。

Codex 侧边栏使用与画布一致的深浅配色，并通过 App Server 的 `account/rateLimits/read` 与更新事件显示 5 小时、每周额度的剩余比例和重置时间。最终回复以 `item/completed` 为准，画布动作使用严格 JSON Schema；失败状态和服务端错误会直接展示，不再伪装成空的成功回复。

Codex 模式默认使用只读沙箱。登录令牌由 Codex 自己管理，前端不会读取 `~/.codex/auth.json`。API 模式的 Key 由 Tauri 后端配置保存，前端只接收“是否已配置”的状态。

## 离线授权

主程序只保留以下客户端职责：

- 生成稳定的本机机器码；
- 导入 `license.json`；
- 使用内置 Ed25519 公钥验证签名、产品、机器与到期日；
- 根据授权状态控制本地功能。

签发私钥、授权生成界面、授权台账和额度运营界面已经移到独立项目 `inspiration-operations-workbench`，不再参与灵感抽屉主程序的前端或 Rust 构建。

主程序内置公钥：

```text
PUBLIC_KEY_B64=AAS4rzI5dxFefYmQCNp1wYpYgKwMXp5+wG1WgF/UoRQ=
```

独立授权器生成的新 License 只包含签名后的产品、客户、机器码、版本、功能与到期日，不包含上游 API 地址或 API Key。AI 渠道与用户额度由 `inspiration-wallet-server` 统一管理。

### 导入和验证

1. 启动应用：`npm run tauri -- dev`。
2. 打开“设置 -> 离线授权”，复制本机 64 位机器码。
3. 在独立授权器中签发并保存 `license.json`。
4. 回到灵感抽屉导入文件；成功后会显示客户、版本、到期时间和功能列表。
5. 修改授权文件、换机器导入或使用过期授权时，主程序必须拒绝。

### 测试

```powershell
cd src-tauri
cargo test
cd ..
npm run build
```

### 安全注意

- 主程序和本仓库中不得出现签发私钥或授权生成命令。
- 更换签发密钥必须同时更新主程序、统一后端和独立授权器的公钥，并制定既有 License 迁移方案。
- 离线授权不能完全阻止二进制逆向，只能提高分发门槛。
- Windows 机器码基于 `MachineGuid`、主板 UUID 和 BIOS 序列号的哈希；更换主板或重装系统可能需要换机流程。
- 过期判断依赖本地系统时间；云端登录后还应由服务器再次检查 License 有效期和账户状态。
