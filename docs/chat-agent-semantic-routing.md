# Chat：已有智能体背景与本轮交付需求的区分

## 复现

用户：我做了个玄学事务所的智能体，帮我做一个封面。

旧行为：把“做了个……智能体”误判为新建，强制选择 create_agent。执行成功后清空本轮工具并指示模型不再调用工具，导致封面请求收到“没有图片生成工具”的错误回答。

## 修复边界

- 不按行业或项目名称写特殊路由；区分已经完成、已有对象、对象的封面/介绍、否定创建与真正新建。
- 删除 create_agent 的强制 toolChoice，让模型结合完整上下文选择交付工具。
- 为持久化创建增加执行前检查，误发调用不写入新智能体。
- 创建完成只禁止重复创建，不再撤走图片、文件等其他工具。
- 原有创建用途追问仍可继续；用户取消或转向封面/文件需求时不再把新任务当作智能体用途。
- 不自动删除之前误创建的智能体，不修改聊天、画布、服务端、模型配置或计费。

## 验证

单元测试覆盖中英文的背景描述、已有对象、封面/介绍、否定句、真正新建及混合任务。
真实 useChatRuntime 的本地 IPC 模拟覆盖截图原句、误发创建被拦截后出图、创建后接着制作封面、仅创建不附加出图，以及下一轮出图。
模型回复、图片结果均为明确的测试 fixture；没有付费生成或真实模型网络请求。

命令与原始结果记录：

- npm run typecheck → outputs/chat-agent-semantics-typecheck.log
- npm test → outputs/chat-agent-semantics-all-tests.log
- npm run lint → outputs/chat-agent-semantics-lint.log
- npm run build → outputs/chat-agent-semantics-build.log

发布记录与安装包以 docs/releases 和 GitHub Release 为准；现有安装版不会因为源码修改而自动更新。
