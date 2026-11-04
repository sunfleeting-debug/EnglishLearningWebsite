# 后端：Cloudflare Workers + D1

网站本身是 GitHub Pages 上的纯静态站，**不能跑服务端**。登录、进度云同步、管理看板
这三个功能需要一台服务器，这里用 Cloudflare Workers（计算）+ D1（SQLite 数据库）实现，
免费额度足够个人/小班级使用，且自带 `*.workers.dev` 域名，国内可直连、无需备案。

---

## 一、准备

```bash
cd worker
npm install -g wrangler        # 或直接用 npx wrangler
wrangler login                 # 浏览器里授权你的 Cloudflare 账号
```

## 二、建库

```bash
wrangler d1 create cet-words
```

命令会打印一段 `database_id`，把它填到 `wrangler.toml` 的 `[[d1_databases]]` 里。

然后建表（`--remote` 操作线上库）：

```bash
wrangler d1 execute cet-words --file=./schema.sql --remote
```

## 三、配置管理员

编辑 `wrangler.toml`：

```toml
[vars]
ADMIN_EMAILS = "你的邮箱@example.com"
ALLOWED_ORIGINS = "https://sunfleeting-debug.github.io"
```

- `ADMIN_EMAILS`：这些邮箱登录后能看到 `/admin` 管理看板（可写多个，逗号分隔）。
- `ALLOWED_ORIGINS`：只允许列出的来源跨域调用；调试期可以先用 `"*"`。

## 四、部署

```bash
wrangler deploy
```

成功后得到形如 `https://cet-words-api.<你的子域>.workers.dev` 的地址。

## 五、把地址告诉前端

两种方式，任选：

1. **改文件**：编辑仓库根目录 `assets/js/config.js`，把地址填进 `apiBase`，然后 commit + push。
2. **页面里填**（不改代码）：打开网站 → 左侧「账号」→ 粘贴地址 → 保存。
   地址会存在浏览器 localStorage（键 `typingcet.apiBase`），优先于 `config.js`。

之后在「账号」页用邮箱 + 密码注册即可，后续每次练习的进度都会自动同步到云端。

## 六、本地调试

```bash
wrangler dev                     # 起一个本地 Worker（默认 http://127.0.0.1:8787）
wrangler d1 execute cet-words --file=./schema.sql --local   # 本地库建表
```

仓库里另有一份**纯 Python 的等价实现** `tools/mock_api.py`，不需要 Node/wrangler 就能跑，
用于前端契约的自动化核验：

```bash
python tools/mock_api.py --port 8791
python tools/verify_backend.py      # 端到端核验（自己拉起 mock）
```

## 七、接口一览

> 直接访问根地址 `https://<worker>.workers.dev/` **不是错误**：后端只提供 `/api/*` 接口，
> 但根地址（以及 `/api`）会返回一个自包含的说明页（HTML，列出接口清单 + 前端站点链接），
> 免得被人当成「服务挂了」。只有**其他**未知路径才返回 404 JSON。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` `/api` | 说明页（HTML），非接口 |
| GET | `/api/health` | 健康检查 |
| POST | `/api/register` | `{email, password, name?}` → `{token, user}` |
| POST | `/api/login` | `{email, password}` → `{token, user}` |
| POST | `/api/logout` | 注销当前 token |
| GET | `/api/me` | 当前用户 |
| GET | `/api/me/state` | 云端全量进度 |
| POST | `/api/me/sync` | 推送增量并取回合并后的全量进度 |
| POST | `/api/ai/chat` | AI 助手转发（用户自带 Key，不落库；`stream:true` 时回 SSE） |
| POST | `/api/ai/models` | 拉该 Key 可用的模型列表（转发上游 `/models`，供前端下拉框用） |
| POST | `/api/ai/search` | 联网检索（服务端抓 Bing RSS / DDG，免费无 Key，返回带域名的摘要） |
| GET | `/api/admin/users` | 用户列表 + 各项统计（仅管理员） |
| GET | `/api/admin/users/:id` | 某用户的完整进度（仅管理员） |
| POST | `/api/admin/users/:id/password` | 重置某用户密码（仅管理员） |
| GET | `/api/admin/users/:id/export` | 导出该用户 CSV（仅管理员） |

除 `register` / `login` / `health` / `ai/chat` 外都需要请求头 `Authorization: Bearer <token>`。

### `/api/ai/chat` 转发

浏览器直连 DeepSeek / 通义 / OpenAI 会被 CORS 拦（对方不给预检响应），所以由 Worker 转发一次：

```
POST /api/ai/chat
{ provider: "deepseek|qwen|openai|claude|custom", apiKey, model, baseUrl?, system?,
  messages: [{role, content}], maxTokens?, temperature?, stream? }
→ { text, model, usage }   或   text/event-stream（stream:true，上游 SSE 原样转发）
```

- **不落库、不记日志、不缓存 key**：key 只在这一次请求的内存里。
- 两种格式归一：OpenAI 兼容走 `POST {base}/chat/completions`，Anthropic 走 `POST {base}/messages`
  （`system` 提到顶层、`x-api-key` + `anthropic-version`）。
- `custom` 的 `baseUrl` 只允许 **https 公网地址**（拒绝环回/内网/`.local`，防被当 SSRF 跳板）；
  本地 Ollama / LM Studio 由前端直接连 `http://127.0.0.1:*`，不经过 Worker。
- 上游非 2xx 时把对方错误原文透传（401 → 401，其余 → 502），前端好据此提示「Key 无效 / 额度用尽」。

### `/api/ai/models` 拉模型列表

AI 助手不让用户手打模型名（打错一个字母就报「模型不存在」），改成从接口拉：

```
POST /api/ai/models
{ provider, apiKey, baseUrl? }
→ { models: ["deepseek-chat", "deepseek-reasoner", ...], provider }
```

- 仍是一次性转发：`GET {base}/models`（OpenAI 兼容 `Authorization: Bearer`，Anthropic `x-api-key` + `anthropic-version`），key 不落库。
- 兼容三种上游返回：`{data:[{id}]}`（OpenAI 系）、`{models:[...]}`（部分国产网关）、纯数组；去重后排序，`embed/tts/whisper/rerank` 这类非对话模型排到最后。
- 前端按 `provider + Key 后 6 位`缓存列表，换 Key 自动失效。
- 少数自建接口没实现 `/models`：前端留「手动填写」兜底。

### `/api/ai/search` 联网检索

模型自己不能上网，而浏览器直连搜索引擎会被 CORS 拦，所以由 Worker 抓一次结果：

```
POST /api/ai/search
{ q, count? }              → { results:[{title,url,snippet,host}], engine, q, dbg }
{ q, probe:1 }             → { probe:[...] }   # 诊断口：各路引擎的 status / 标记计数 / 取样
```

- **顺序**：必应**资讯** RSS → 必应网页 RSS → DuckDuckGo（lite / html）。第一条命中相关结果就返回。
- 🔴 2026-11-04 在 Cloudflare 出口逐个实测过：`cn.bing.com` RSS、Google News RSS、Mojeek、
  SearXNG 各公共实例、百度、搜狗**全部被拦或返回空/验证页**；DuckDuckGo 常被 202 挡；
  Bing 网页 RSS 时好时坏（机房 IP 会拿到「热门话题」那种与查询无关的条目）。
  **唯一稳定的是必应资讯 RSS**（新闻源正好覆盖考试时间/报名/政策这类问题）。
- **相关性闸门**：查询切成英文词 + 中文二元组，标题/摘要里至少命中一个才算数。
  宁可这轮不返回，也不把「热门话题」当检索结果喂给模型 —— 那比不搜更糟。
- 失败返回 **200 + 空数组**（不是 5xx）：前端据此让模型按已有知识照常回答，
  绝不把「检索失败」显示成「AI 坏了」。检索结果只在这一次请求的内存里，不落库。

### `/api/me/sync` 的合并规则

| 数据 | 规则 | 为什么 |
| --- | --- | --- |
| `progress.w / .r / .seen` | 取 `max` | 是累计计数，取大值不丢数据且重复推送幂等 |
| `progress.fav / .master` | 取 `ts` 较新的一条 | 否则「取消收藏」永远同步不出去 |
| `daily.done / .right` | 取 `max` | 取和会在重复同步时翻倍 |
| `srs`（复习排期） | 整条按 `ts` 取新 | 档位与到期日必须自洽，不能逐字段各取各的 |

请求体还支持两个「删除」字段：

- `deleted: { progress: [词id], srs: [单词] }` —— 删除指定条目（单条重置 / 移出复习队列）。
- `clear: ["progress" | "daily" | "srs"]` —— 整表清空（前端「清空学习记录 / 清空复习队列」时用）。

## 八、安全说明

- 口令用 **PBKDF2-SHA256（10 万次迭代 + 每用户随机盐）** 存储，数据库里没有明文。
- token 是 32 字节随机串，有效期 30 天，存 `sessions` 表；注销 / 管理员重置密码会立即失效。
- 邮箱验证 / 找回密码走验证码（`RESEND_API_KEY` 优先，失败降级 QQ SMTP 直连；10 分钟过期、次数限制）。
  邮件服务未配置时自动回退到「免验证码注册」，`/api/register/start` 会明确返回未启用。
- 未接入验证码/限流：公网可被脚本刷注册。若要对外开放，建议加 Cloudflare Turnstile
  或 Rate Limiting 规则。
- 前端 token 存在 localStorage（不用 cookie），因此不受 CSRF 影响；但 XSS 会拿到 token，
  站内所有用户输入都已用 `TW.esc` 转义。
