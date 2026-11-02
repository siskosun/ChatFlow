# Provider Adapter Contract

## 0.1 支持范围

当前只有 `chatgpt` 注册为 production adapter。`claude.ai`、Gemini 及其他页面均返回 unsupported；没有通过真实验收的平台不得被列为 supported。

## Interface

`ChatFlowProviders` 提供：

- `get(providerId)`：按稳定 ID 返回 adapter 或 null。
- `forUrl(url)`：按精确 hostname 匹配已注册 provider；未知域名返回 null。
- `identify(url, options)`：执行 provider 自己的页面身份校验，并返回 provider ID、adapter 和身份信息。
- `capabilityMatrix()`：返回明确能力声明，不推断未实现的能力。

Adapter 至少声明：

- `id`、`label`、精确 `hosts`。
- `identify(url, options)`：对话页/普通新聊天目标页校验。
- `readEndpoint(path, source)`：限制同源、选定 conversation 路径和只读 GET。
- `mediaUrl(url)`：校验允许的外部媒体主机。
- `capabilities`：会话读取、可见分支、附件字节、档案恢复、新聊天预填、人工发送、上传确认级别、模型读取确认。

## ChatGPT adapter

- 支持 `chatgpt.com` 和旧域名 `chat.openai.com`。
- 对话页必须是 HTTPS 且含合法 `/c/<conversation_id>`；新聊天目标必须是普通根路径，拒绝 Project、Temporary、旧对话和未知查询参数。
- 授权请求只允许 `/api/auth/session`、当前对话 `/backend-api/conversation/<id>` 及其子路径、`/backend-api/files/`；强制 GET/HEAD 只读校验，拒绝跨源。
- 外部文件请求走单独媒体 URL 白名单；不携带 ChatGPT Cookie、Authorization 或 Referer。
- 新聊天只预填和注入 File/DataTransfer；不点击 Send。
- 上传确认级别为页面状态观察；模型是否读取附件无法从扩展侧证明，始终为 false。

## Change policy

新增 provider 前必须提供独立适配器、精确主机/路径规则、权限最小化、正反向测试、合成浏览器测试和真实账号验收。不能通过扩大 `<all_urls>`、复用 ChatGPT Cookie 或绕过页面安全限制实现。