# New API 接入参考与 Inspiration Drawer 集成规范

> **用途**：提供给 Codex / Claude 作为 New API Adapter 的协议参考，并指导其接入 Inspiration Drawer 现有授权、Agent、Canvas、余额查询和 XAIS 兼容链路。  
> **官方文档入口**：https://docs.newapi.pro/zh/docs  
> **整理日期**：2026-07-14  
> **资料性质**：二次整理，不替代目标 New API 实例对应版本的 OpenAPI 文档与实际联调结果。

---

## 0. 使用优先级

Codex / Claude 实施时，按以下顺序判断：

1. **当前仓库真实代码与已有运行行为**
2. **本次产品需求**
3. **本文档整理的 New API 协议**
4. **目标 New API 实例实际返回结果**

本文档只用于补充 New API Adapter，不得据此删除或覆盖已有 XAIS 支持。

必须保留：

- XAIS Provider 标识；
- `/xais/userProfile`；
- XAIS 特殊 Headers；
- XAIS 已有连接测试和余额解析；
- 旧专业版自定义 OpenAI Compatible 配置；
- 旧高级版 `LicenseManaged` 授权兼容。

---

## 1. New API 是什么

New API 是一个统一 AI API 网关，主要提供两类 REST 接口：

1. **AI 模型接口**
   - 模型列表
   - Chat Completions
   - Responses
   - 图像生成与编辑
   - 补全、嵌入、重排序、审查
   - 音频、实时语音、视频等

2. **管理接口**
   - 用户与认证
   - 渠道和模型管理
   - Token 管理
   - 额度、日志、统计、任务等

AI 模型接口主要兼容 OpenAI API 格式，但不同渠道、模型和 New API 版本可能只支持其中一部分参数。

官方 API 目录：

- https://docs.newapi.pro/zh/docs/api

---

## 2. 核心术语

### 2.1 Root URL

用户或授权文件保存的服务根地址，例如：

```text
https://api.example.com
```

不要保存完整业务接口：

```text
https://api.example.com/v1/chat/completions
```

### 2.2 V1 Base URL

OpenAI Compatible SDK 常使用：

```text
https://api.example.com/v1
```

### 2.3 模型 Token

形式通常为：

```text
sk-xxxxxxxxxxxxxxxx
```

用于：

- `/v1/models`
- `/v1/chat/completions`
- `/v1/responses`
- `/v1/images/generations`
- `/v1/images/edits`
- `/api/usage/token/`

标准鉴权：

```http
Authorization: Bearer sk-xxxxxxxxxxxxxxxx
```

### 2.4 管理 Access Token

用于 New API 后台管理接口，不等于模型 Token。

管理接口一般支持：

```http
Authorization: Bearer <management-access-token>
New-Api-User: <user-id>
```

`New-Api-User` 仅在对应接口或部署版本要求时发送，并且必须匹配当前登录用户。

**管理 Access Token 不得写进用户授权文件、主程序、日志或前端状态。**

官方鉴权说明：

- https://docs.newapi.pro/zh/docs/api/management/auth

---

## 3. Inspiration Drawer 产品模式

### 3.1 专业版

专业版允许用户自行配置：

- Gateway 类型；
- Base URL；
- API Key / Token；
- Agent 模型；
- Canvas 图像模型；
- 自定义 Headers。

可选择：

- New API；
- XAIS；
- OpenAI Compatible；
- Custom。

专业版配置可编辑，继续使用当前用户设置存储和 Resolver。

### 3.2 高级版

高级版由授权器写入：

- Gateway 类型；
- Base URL；
- API Key / Token；
- Agent 模型；
- Canvas 模型；
- Headers。

导入一机一码授权后自动使用，用户不可修改。

高级版授权无效、过期、机器码错误或签名错误时：

- 禁止回退到旧 BYOK；
- 禁止回退到专业版 Token；
- 禁止回退到历史缓存配置。

### 3.3 New API 和 XAIS 的定位

New API 与 XAIS 都是 Gateway Adapter，不是产品版本。

```text
专业版用户配置 / 高级版授权配置
                ↓
      Existing Credential Resolver
                ↓
       EffectiveApiProfile
                ↓
          Gateway Router
       ↙          ↓           ↘
   New API       XAIS      OpenAI Compatible
                ↓
 Agent / Workflow / Canvas / Balance
```

---

## 4. Base URL 规范化

必须建立统一的 URL 工具，不允许各业务模块自行拼接。

建议接口：

```rust
fn normalize_api_root_url(input: &str) -> Result<Url, ApiConfigError>;
fn normalize_openai_v1_base_url(input: &str) -> Result<Url, ApiConfigError>;
fn join_api_endpoint(root: &Url, path: &str) -> Result<Url, ApiConfigError>;
```

### 4.1 接受的输入

```text
https://api.example.com
https://api.example.com/
https://api.example.com/v1
https://api.example.com/v1/
```

### 4.2 必须避免

```text
/v1/v1/models
/v1/v1/chat/completions
/chat/completions/chat/completions
//api/usage/token/
```

### 4.3 建议保存方式

配置中保存用户原始根地址或规范化 Root URL：

```text
https://api.example.com
```

Adapter 根据能力拼接路径。

### 4.4 尾斜杠注意事项

官方文档中部分路径带尾斜杠，部分不带：

```text
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses
POST /v1/images/generations/
POST /v1/images/edits/
GET  /api/usage/token/
```

不同部署版本可能对尾斜杠处理不同。

实现规则：

- 使用目标部署版本 OpenAPI 中的精确路径；
- 不要对非幂等 POST 在 404 后自动换斜杠重试，避免重复生成或重复扣费；
- GET 接口若需要兼容，可在 Adapter 内做一次安全的路径兼容，但必须记录最终命中的路径；
- URL 工具只负责正确拼接，不应随意改变业务路径。

---

## 5. 鉴权规则

### 5.1 AI 模型接口

```http
Authorization: Bearer <model-token>
Content-Type: application/json
```

图像编辑使用：

```http
Content-Type: multipart/form-data
```

不要手动设置 multipart boundary，交给 HTTP 客户端生成。

### 5.2 Token 用量查询

```http
GET /api/usage/token/
Authorization: Bearer <model-token>
```

这是用户模型 Token 自查，不需要管理 Access Token。

### 5.3 管理接口

一般使用 Session 或管理 Access Token。

Access Token 方式：

```http
Authorization: Bearer <management-access-token>
New-Api-User: <user-id>
```

`New-Api-User` 是否必需取决于接口和部署版本。

---

## 6. 核心接口矩阵

| 能力 | 方法 | 官方路径 | 鉴权 | Inspiration Drawer 用途 |
|---|---:|---|---|---|
| 模型列表 | GET | `/v1/models` | Bearer 模型 Token | 模型下拉、连接测试 |
| Chat Completions | POST | `/v1/chat/completions` | Bearer 模型 Token | Agent、工作流规划 |
| Responses | POST | `/v1/responses` | Bearer 模型 Token | Agent、Codex/API Runtime |
| 图像生成 | POST | `/v1/images/generations/` | Bearer 模型 Token | Canvas 图像生成 |
| 图像编辑 | POST | `/v1/images/edits/` | Bearer 模型 Token | Canvas 图像编辑 |
| Token 用量 | GET | `/api/usage/token/` | Bearer 模型 Token | 余额/额度查询 |
| 创建 Token | POST | `/api/token/` | 用户/管理认证 | 授权器未来自动签发 |
| 获取 Token | GET | `/api/token/{id}` | 用户/管理认证 | 授权器管理 |
| 删除 Token | DELETE | `/api/token/{id}` | 用户/管理认证 | 撤销设备 Token |

---

## 7. 模型列表

### 7.1 接口

```http
GET /v1/models
Authorization: Bearer <token>
```

官方文档：

- https://docs.newapi.pro/zh/docs/api/ai-model/models/list/listmodels

### 7.2 OpenAI 格式响应

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "created": 0,
      "owned_by": "openai"
    }
  ]
}
```

### 7.3 格式识别

官方文档说明，`/v1/models` 会根据请求头识别返回格式：

- 带 `x-api-key` 与 `anthropic-version`：可能返回 Anthropic 格式；
- 带 `x-goog-api-key` 或 `key` 查询参数：可能返回 Gemini 格式；
- 其他情况：OpenAI 格式。

New API Adapter 默认应使用：

```http
Authorization: Bearer <token>
```

并解析 OpenAI 模型列表。

### 7.4 实现要求

- 模型列表成功不代表模型推理一定成功；
- 连接测试至少分三层：
  1. Token 用量查询；
  2. 模型列表；
  3. 最小聊天请求；
- 模型 ID 按原字符串保存，不要擅自大小写转换；
- 模型列表为空时，不要把 Token 直接判定为无效，可能是分组或模型限制配置问题。

---

## 8. Chat Completions

### 8.1 接口

```http
POST /v1/chat/completions
Authorization: Bearer <token>
Content-Type: application/json
```

官方文档：

- https://docs.newapi.pro/zh/docs/api/ai-model/chat/openai/createchatcompletion

### 8.2 最小请求

```json
{
  "model": "your-model-id",
  "messages": [
    {
      "role": "user",
      "content": "请只回复：测试成功"
    }
  ],
  "stream": false
}
```

### 8.3 常见字段

```json
{
  "model": "string",
  "messages": [],
  "temperature": 1,
  "top_p": 1,
  "n": 1,
  "stream": false,
  "stream_options": {},
  "stop": null,
  "max_tokens": 1024,
  "max_completion_tokens": 1024,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "tools": [],
  "tool_choice": "auto",
  "response_format": {},
  "seed": 1,
  "reasoning_effort": "medium",
  "modalities": ["text"]
}
```

不要给所有上游无条件发送全部字段。应按实际请求和模型能力发送最小字段集合。

### 8.4 非流式响应骨架

```json
{
  "id": "string",
  "object": "chat.completion",
  "created": 0,
  "model": "string",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "string",
        "tool_calls": [],
        "reasoning_content": "string"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

### 8.5 实现要求

- 支持 `content` 为字符串，也为可能出现的结构化数组预留兼容解析；
- `reasoning_content` 为可选字段；
- `tool_calls`、`finish_reason`、`usage` 均应防御性解析；
- 流式响应必须可取消；
- 网络错误、网关错误和上游模型错误必须区分；
- 不在日志中记录 Authorization Header。

---

## 9. Responses API

### 9.1 接口

```http
POST /v1/responses
Authorization: Bearer <token>
Content-Type: application/json
```

官方文档：

- https://docs.newapi.pro/zh/docs/api/ai-model/chat/openai/createresponse

### 9.2 最小请求

```json
{
  "model": "your-model-id",
  "input": "请只回复：测试成功"
}
```

### 9.3 常见字段

```json
{
  "model": "string",
  "input": "string or input array",
  "instructions": "string",
  "max_output_tokens": 1024,
  "temperature": 1,
  "top_p": 1,
  "stream": false,
  "tools": [],
  "tool_choice": "auto",
  "reasoning": {},
  "previous_response_id": "string",
  "truncation": "auto"
}
```

### 9.4 响应骨架

```json
{
  "id": "string",
  "object": "response",
  "created_at": 0,
  "status": "completed",
  "model": "string",
  "output": [
    {
      "type": "message",
      "id": "string",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "string"
        }
      ]
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

### 9.5 实现要求

- 不要假设 `output[0].content[0]` 永远存在；
- 输出可能包含工具调用、推理项或其他内容类型；
- 建立统一 `extract_response_text`；
- Codex/API Runtime 若使用 Responses，应继续经由现有 Credential Resolver；
- 若目标部署不支持 Responses，可回退 Chat Completions，但回退必须由能力探测或明确错误触发，不能无条件重复请求。

---

## 10. 图像生成

### 10.1 接口

```http
POST /v1/images/generations/
Authorization: Bearer <token>
Content-Type: application/json
```

官方文档：

- https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-generations

### 10.2 最小请求

```json
{
  "model": "your-image-model",
  "prompt": "A clean industrial-design product rendering",
  "n": 1,
  "size": "1024x1024"
}
```

### 10.3 常见字段

```json
{
  "model": "string",
  "prompt": "string",
  "n": 1,
  "size": "1024x1024",
  "quality": "string",
  "style": "string",
  "background": "string",
  "moderation": "string",
  "user": "string"
}
```

参数是否生效取决于上游模型和渠道。Adapter 不应假设所有图像模型都支持相同枚举。

### 10.4 响应骨架

```json
{
  "created": 0,
  "data": [
    {
      "b64_json": "string",
      "url": "https://example.com/image.png"
    }
  ],
  "usage": {
    "total_tokens": 0,
    "input_tokens": 0,
    "output_tokens": 0
  }
}
```

### 10.5 实现要求

同时支持：

- `data[].url`
- `data[].b64_json`

处理规则：

1. 优先按请求期望的返回类型处理；
2. URL 结果进入受控下载队列；
3. Base64 结果流式或分块解码到临时文件；
4. 验证 MIME、大小和魔数；
5. 成功后原子提交；
6. 不将完整 Base64 写入日志、节点 JSON 或工作流文件；
7. 图像规则胶囊的最终 Prompt 必须在调用前统一合并。

---

## 11. 图像编辑

### 11.1 接口

```http
POST /v1/images/edits/
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

官方文档：

- https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-edits

### 11.2 字段

| 字段 | 类型 | 必需 | 说明 |
|---|---|---:|---|
| `image` | file | 是 | 原始图像 |
| `mask` | file | 否 | 遮罩 |
| `prompt` | string | 是 | 编辑要求 |
| `model` | string | 否 | 图像模型 |
| `n` | string/integer | 否 | 生成数量 |
| `size` | string | 否 | 输出尺寸 |
| `response_format` | string | 否 | `url` 或 `b64_json` |
| `user` | string | 否 | 最终用户标识 |

官方页面当前描述了 PNG、小于 4MB、方形等限制。这类限制可能来自特定上游或旧版 OpenAI 图像接口；实际实现应以目标模型和目标 New API 部署版本为准。

### 11.3 实现要求

- 使用 Rust `reqwest::multipart`；
- 不手工构造 multipart boundary；
- 大图先在后台进行格式转换和尺寸校验；
- 用户取消后应中止上传；
- 响应同时兼容 URL 与 Base64；
- 不因某个模型不支持遮罩就影响普通图像生成。

---

## 12. Token 用量与“余额”

### 12.1 接口

官方当前页面：

```http
GET /api/usage/token/
Authorization: Bearer <model-token>
```

官方文档：

- https://docs.newapi.pro/zh/docs/api/management/token-management/usage-token-get

官方仓库的补充说明：

- https://github.com/QuantumNous/new-api-docs/blob/main/docs/api/token-usage.md

### 12.2 成功响应示例

```json
{
  "code": true,
  "message": "ok",
  "data": {
    "object": "token_usage",
    "name": "Default Token",
    "total_granted": 1000000,
    "total_used": 12345,
    "total_available": 987655,
    "unlimited_quota": false,
    "model_limits": {
      "gpt-4o-mini": true
    },
    "model_limits_enabled": false,
    "expires_at": 0
  }
}
```

### 12.3 字段

| 字段 | 说明 |
|---|---|
| `object` | 通常为 `token_usage` |
| `name` | Token 名称 |
| `total_granted` | 授予总额度 |
| `total_used` | 已使用额度 |
| `total_available` | 剩余额度 |
| `unlimited_quota` | 是否无限额度 |
| `model_limits` | 模型限制映射 |
| `model_limits_enabled` | 是否启用模型限制 |
| `expires_at` | Unix 秒；`0` 常表示不过期 |

### 12.4 额度单位

这些数字是 New API 内部 quota 单位，不应自动标成：

- 人民币；
- 美元；
- Token 数量。

除非目标部署明确提供换算规则，否则 UI 使用：

```text
总额度
已使用
剩余额度
```

不要显示货币符号。

### 12.5 错误响应可能形态

```json
{
  "success": false,
  "message": "No Authorization header"
}
```

```json
{
  "success": false,
  "message": "Invalid Bearer token"
}
```

```json
{
  "success": false,
  "message": "token not found"
}
```

### 12.6 Inspiration Drawer 路由

```rust
match profile.gateway_kind {
    AiGatewayKind::NewApi => query_new_api_token_usage(profile),
    AiGatewayKind::Xais => query_xais_balance(profile),
    AiGatewayKind::OpenAiCompatible | AiGatewayKind::Custom => {
        query_legacy_or_custom_balance(profile)
    }
}
```

**不得用 New API 余额逻辑覆盖 XAIS。**

### 12.7 CORS

历史上 `/api/usage/token/` 在浏览器直接请求时出现过 CORS 问题。

因此 Tauri 应从 Rust `reqwest` 发起余额查询，不从 WebView `fetch` 直接请求。

---

## 13. 管理接口与自动签发 Token

### 13.1 管理认证

管理接口通常需要：

```http
Authorization: Bearer <management-access-token>
New-Api-User: <user-id>
```

### 13.2 Token 管理路径

```text
POST   /api/token/
GET    /api/token/{id}
DELETE /api/token/{id}
```

相关文档：

- 创建：https://docs.newapi.pro/zh/docs/api/management/token-management/token-post
- 获取：https://docs.newapi.pro/zh/docs/api/management/token-management/token-id-get
- 删除：https://docs.newapi.pro/zh/docs/api/management/token-management/token-id-delete

### 13.3 当前文档的限制

官方页面目前未完整展示创建 Token 的请求 Body 和响应 Schema。

因此：

- 第一阶段授权器可继续手动粘贴已创建的用户模型 Token；
- 自动签发前必须读取目标部署版本的 OpenAPI；
- 不要凭空猜测 `remain_quota`、`expired_time`、`model_limits` 等字段；
- 不要假定创建响应一定返回完整 Token；
- 自动签发功能必须针对固定 New API 版本做集成测试。

### 13.4 自动签发的安全边界

授权器本机可以保存管理 Access Token，但必须：

- 使用 OS 凭证库或 Stronghold；
- 不进入 Git；
- 不进入用户授权文件；
- 不进入授权台账；
- 不出现在普通日志；
- 不返回给前端公共状态；
- 每台设备创建独立模型 Token；
- 签发失败时清理孤儿 Token，或记录为待清理项。

---

## 14. Gateway 类型

建议在现有结构上增加兼容字段：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiGatewayKind {
    NewApi,
    Xais,
    OpenAiCompatible,
    Custom,
}
```

旧配置没有 `gateway_kind` 时：

1. 根据已有 Provider、Base URL、Headers 和已用余额路径推断；
2. 命中 XAIS 特征时保留 XAIS；
3. 命中 New API 特征时标记 New API；
4. 无法判断时用 OpenAI Compatible 或 Custom；
5. 不得让旧数据反序列化失败。

---

## 15. 复用现有授权结构

不要重建平行授权系统。

继续使用现有概念：

```text
LicensePayload.ai_access
AiCredentialMode::Byok
AiCredentialMode::LicenseManaged
LicenseAiAccess.managed_profile
LicenseAiAccess.canvas_profile
ManagedApiProfile
ai_credentials.rs
resolve_effective_api_profile
resolve_effective_canvas_api_profile
```

建议给 `ManagedApiProfile` 增加可选字段：

```rust
#[serde(default)]
pub gateway_kind: Option<AiGatewayKind>;
```

高级版可保存：

```json
{
  "gateway_kind": "new_api",
  "provider": "openai-compatible",
  "base_url": "https://api.example.com/v1",
  "api_key": "sk-device-specific-token",
  "model": "chat-model-id",
  "headers": {}
}
```

Canvas 可使用同一 Token，不同模型：

```json
{
  "gateway_kind": "new_api",
  "provider": "openai-compatible",
  "base_url": "https://api.example.com/v1",
  "api_key": "sk-device-specific-token",
  "model": "image-model-id",
  "headers": {}
}
```

这些字段必须进入现有签名 Payload。

---

## 16. EffectiveApiProfile

在现有 Resolver 上扩展，不新建平行 Resolver：

```rust
pub struct EffectiveApiProfile {
    pub source: EffectiveApiSource,
    pub gateway_kind: AiGatewayKind,
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub headers: BTreeMap<String, String>,
    pub editable: bool,
}
```

### 16.1 专业版

来源：

```text
AgentSettingsStored / Canvas settings
```

行为：

- `editable = true`
- Base URL 可修改
- Gateway 可修改
- Token 可修改
- 模型可修改

### 16.2 高级版

来源：

```text
Verified LicenseManaged profile
```

行为：

- `editable = false`
- 配置缺失即报错
- 授权无效即报错
- 禁止回退用户设置

---

## 17. Gateway Router 与 Adapter

建议目录：

```text
src-tauri/src/ai_gateway/
  mod.rs
  types.rs
  endpoint.rs
  router.rs
  new_api_adapter.rs
  xais_adapter.rs
  openai_compatible_adapter.rs
  balance.rs
  error.rs
```

Router：

```rust
match profile.gateway_kind {
    AiGatewayKind::NewApi => new_api_adapter,
    AiGatewayKind::Xais => xais_adapter,
    AiGatewayKind::OpenAiCompatible => openai_compatible_adapter,
    AiGatewayKind::Custom => custom_adapter,
}
```

Adapter 只能接收 `EffectiveApiProfile`，不能自行读取：

- 授权文件；
- `AgentSettingsStored`；
- localStorage；
- 节点 metadata；
- 工作流 JSON。

---

## 18. New API Adapter 接口建议

```rust
#[async_trait]
pub trait AiGatewayAdapter {
    async fn test_connection(
        &self,
        profile: &EffectiveApiProfile,
    ) -> Result<ConnectionReport, GatewayError>;

    async fn list_models(
        &self,
        profile: &EffectiveApiProfile,
    ) -> Result<Vec<ModelInfo>, GatewayError>;

    async fn chat_completions(
        &self,
        profile: &EffectiveApiProfile,
        request: ChatRequest,
    ) -> Result<ChatResponse, GatewayError>;

    async fn responses(
        &self,
        profile: &EffectiveApiProfile,
        request: ResponsesRequest,
    ) -> Result<ResponsesResult, GatewayError>;

    async fn generate_image(
        &self,
        profile: &EffectiveApiProfile,
        request: ImageGenerationRequest,
    ) -> Result<Vec<GeneratedImage>, GatewayError>;

    async fn edit_image(
        &self,
        profile: &EffectiveApiProfile,
        request: ImageEditRequest,
    ) -> Result<Vec<GeneratedImage>, GatewayError>;

    async fn query_balance(
        &self,
        profile: &EffectiveApiProfile,
    ) -> Result<ApiBalanceResult, GatewayError>;
}
```

---

## 19. 连接测试策略

不要只调用一个接口后显示“连接成功”。

建议分层：

### A. Token 检查

```http
GET /api/usage/token/
```

验证 New API 能识别用户 Token。

### B. 模型可见性

```http
GET /v1/models
```

验证模型列表与模型限制。

### C. 最小推理

```http
POST /v1/chat/completions
```

发送极小请求验证实际渠道和上游可用。

### D. 图像模型

仅在用户主动测试图像模型时调用，避免测试即扣除较多额度。

### 报告示例

```text
Token：有效
模型列表：成功，共 17 个模型
Agent 模型：可见
聊天推理：失败，上游渠道鉴权错误
余额：剩余 987655 quota
```

Token 用量成功不代表上游渠道一定可用。聊天接口返回 `401 Invalid API key` 时，也可能是被选中的上游渠道 Key 无效，而不一定是用户模型 Token 无效。

---

## 20. 错误归一化

建议统一错误：

```rust
pub enum GatewayErrorKind {
    InvalidConfiguration,
    InvalidUserToken,
    UpstreamAuthentication,
    ModelNotAvailable,
    ModelNotAllowed,
    QuotaExhausted,
    RateLimited,
    UnsupportedEndpoint,
    InvalidRequest,
    Timeout,
    Cancelled,
    Network,
    Server,
    Parse,
}
```

统一错误对象：

```rust
pub struct GatewayError {
    pub kind: GatewayErrorKind,
    pub message: String,
    pub http_status: Option<u16>,
    pub provider_code: Option<String>,
    pub retryable: bool,
    pub safe_response_excerpt: Option<String>,
}
```

要求：

- 不输出完整 Token；
- 不输出 Authorization；
- 响应正文限制长度；
- 对 `401` 结合请求阶段判断：
  - `/api/usage/token/` 401：更可能是用户 Token；
  - `/v1/chat/completions` 401 且 usage 成功：可能是上游渠道鉴权；
- `429` 区分额度不足与速率限制；
- `404/405` 记录实际 URL，用于发现路径或尾斜杠问题；
- 余额接口不支持不能使 Agent 配置整体失效。

---

## 21. XAIS 必须保留

本文档没有定义 XAIS 协议。

当前仓库已有的以下内容必须保留并集中整理：

- `/xais/userProfile`
- `X-Linggan-NewAPI-Access-Token`
- `X-Linggan-NewAPI-User`
- XAIS Provider 标识
- XAIS 连接测试
- XAIS 余额字段解析
- XAIS 其他现有 fallback

不得：

- 把 XAIS 强制改成 Bearer Token；
- 把 XAIS 余额改为 `/api/usage/token/`；
- 删除特殊 Header；
- 自动迁移旧 XAIS 配置；
- 因 New API 文档未提及 XAIS 就判定其废弃。

---

## 22. 真实调用链验收

以下功能不得直接读取 `settings.api_key`、`api_base_url`、`api_model`：

1. App Agent；
2. AI 深度工作流规划；
3. Codex API Runtime；
4. 模型列表；
5. 连接测试；
6. 余额查询；
7. Canvas 图像生成；
8. Canvas 图像编辑；
9. Vision；
10. Video（如已实现）；
11. Workflow 生成节点；
12. 图像规则胶囊最终 Prompt 请求。

统一链路：

```text
专业版用户设置 / 高级版授权文件
                ↓
resolve_effective_api_profile
resolve_effective_canvas_api_profile
                ↓
EffectiveApiProfile
                ↓
Gateway Router
                ↓
New API / XAIS / OpenAI Compatible Adapter
                ↓
Agent / Workflow / Canvas / Balance
```

---

## 23. 安全要求

### 23.1 禁止完整 Key 出现在

- `console.log`
- Rust 普通日志
- Agent trace
- 错误弹窗
- 节点 metadata
- workflow JSON
- 授权台账
- 前端 Public Settings
- 崩溃报告的普通字段

### 23.2 前端只可获得

```text
configured
source
gatewayKind
editable
provider
baseUrl 的域名或脱敏值
model
keyLast4
connectionStatus
balance summary
```

### 23.3 高级版授权

允许把每个用户独立 Token 放进签名授权 Payload，但：

- Token 必须是一机一码的独立 Token；
- 不得复用管理 Access Token；
- 不得在授权台账保存完整 Token；
- 修改 Token、Base URL、模型或 Gateway 后签名必须失效。

### 23.4 专业版存储

专业版用户填写的 Token 建议保存到：

- Tauri Stronghold；
- Windows Credential Manager；
- macOS Keychain；
- Linux Secret Service。

普通 JSON 只保存非敏感配置和凭证引用。

---

## 24. 请求超时与取消

建议：

```text
连接超时：10 秒
普通请求总超时：60–120 秒
图像请求总超时：按模型配置，通常更长
流式请求：使用空闲超时而非固定总超时
```

要求：

- 所有请求可取消；
- 应用退出时不无限等待网络任务；
- 重试只用于明确可重试的网络错误和幂等 GET；
- Chat/Responses/图像生成 POST 默认不自动重试；
- 若确需重试，必须使用幂等键或业务去重机制；
- UI 显示当前阶段：连接、排队、生成、下载、保存。

---

## 25. 测试清单

### 25.1 New API 专业版

- [ ] 用户可选择 New API；
- [ ] 用户可填写 Base URL；
- [ ] 用户可填写模型 Token；
- [ ] `/v1/models` 成功；
- [ ] Chat Completions 成功；
- [ ] Responses 成功或明确显示不支持；
- [ ] 图像生成支持 URL；
- [ ] 图像生成支持 Base64；
- [ ] 图像编辑 multipart 正常；
- [ ] `/api/usage/token/` 正常；
- [ ] 修改 Base URL 后真实请求使用新地址；
- [ ] 余额失败不影响 Agent 调用。

### 25.2 XAIS 回归

- [ ] `/xais/userProfile` 保留；
- [ ] 特殊 Headers 保留；
- [ ] 旧 XAIS 配置无需迁移；
- [ ] XAIS 连接测试正常；
- [ ] XAIS 余额正常；
- [ ] New API Adapter 不覆盖 XAIS。

### 25.3 高级版授权

- [ ] 授权器可选择 New API；
- [ ] Gateway、Base URL、Token、模型进入签名；
- [ ] Agent 与 Canvas 可使用同 Token、不同模型；
- [ ] 导入授权后自动使用；
- [ ] 用户不能修改托管配置；
- [ ] 后端拒绝托管字段写入；
- [ ] 授权过期不回退；
- [ ] 机器码不匹配不回退；
- [ ] 修改授权配置后签名无效；
- [ ] 授权台账无完整 Token。

### 25.4 Runtime

- [ ] App Agent 使用 Resolver；
- [ ] AI 工作流规划使用 Resolver；
- [ ] “快速规划”不调用 API；
- [ ] Canvas 使用 Canvas Resolver；
- [ ] 图像规则胶囊最终 Prompt 真实进入请求；
- [ ] 日志无完整 Token；
- [ ] Rust 发起余额请求，避免 WebView CORS。

### 25.5 构建

```bash
cargo fmt --check
cargo test
npm test
npm run build
```

---

## 26. 未确认项与版本差异

下列内容必须在目标 New API 实例上验证：

1. 图像接口是否要求尾斜杠；
2. Responses 是否在所有渠道可用；
3. 图像模型实际支持哪些字段；
4. 图像编辑的文件大小与格式限制；
5. `/api/usage/token/` 是否带尾斜杠；
6. Token 创建请求 Body；
7. 创建 Token 是否一次性返回完整 Key；
8. 管理接口是否要求 `New-Api-User`；
9. quota 的货币换算；
10. 视频接口的具体路径和异步任务格式；
11. 流式 SSE 的事件细节；
12. 当前部署版本对 `sk-` 前缀的兼容行为。

禁止在未确认时写死猜测。

---

## 27. 官方资料索引

### 文档首页

- https://docs.newapi.pro/zh/docs

### API 目录

- https://docs.newapi.pro/zh/docs/api

### 鉴权

- https://docs.newapi.pro/zh/docs/api/management/auth

### 模型

- https://docs.newapi.pro/zh/docs/api/ai-model/models/list/listmodels

### Chat Completions

- https://docs.newapi.pro/zh/docs/api/ai-model/chat/openai/createchatcompletion

### Responses

- https://docs.newapi.pro/zh/docs/api/ai-model/chat/openai/createresponse

### 图像生成

- https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-generations

### 图像编辑

- https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-edits

### Token 用量

- https://docs.newapi.pro/zh/docs/api/management/token-management/usage-token-get
- https://github.com/QuantumNous/new-api-docs/blob/main/docs/api/token-usage.md

### Token 管理

- https://docs.newapi.pro/zh/docs/api/management/token-management/token-post
- https://docs.newapi.pro/zh/docs/api/management/token-management/token-id-get
- https://docs.newapi.pro/zh/docs/api/management/token-management/token-id-delete

### 在线调试

- https://apifox.newapi.ai/

### 官方项目

- https://github.com/QuantumNous/new-api

---

## 28. 给 Codex 的文档使用声明

可将以下内容附在任务指令开头：

```text
请先审计当前仓库中的授权、ai_credentials、Agent、Canvas、New API、
XAIS、余额查询和 Gateway 相关代码，再阅读：

docs/vendor/newapi-integration-reference.md

该文档只用于补充 New API Adapter 的协议和实现约束。

优先级：
1. 当前仓库真实代码与兼容行为
2. 本次产品需求
3. New API 集成参考
4. 目标网关实际联调结果

不得因为文档只描述 New API 而删除、替换或弱化 XAIS。
不得重新创建平行的授权系统或 Credential Resolver。
必须验证真实运行链路，而不是只增加类型、Schema 和 UI。
```
