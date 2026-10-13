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

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/register` | `{email, password, name?}` → `{token, user}` |
| POST | `/api/login` | `{email, password}` → `{token, user}` |
| POST | `/api/logout` | 注销当前 token |
| GET | `/api/me` | 当前用户 |
| GET | `/api/me/state` | 云端全量进度 |
| POST | `/api/me/sync` | 推送增量并取回合并后的全量进度 |
| GET | `/api/admin/users` | 用户列表 + 各项统计（仅管理员） |
| GET | `/api/admin/users/:id` | 某用户的完整进度（仅管理员） |
| POST | `/api/admin/users/:id/password` | 重置某用户密码（仅管理员） |
| GET | `/api/admin/users/:id/export` | 导出该用户 CSV（仅管理员） |

除 `register` / `login` / `health` 外都需要请求头 `Authorization: Bearer <token>`。

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
- 未做「邮箱验证」和「找回密码」——这是刻意简化（用户要求邮箱注册即可）。
  忘记密码只能由管理员在 `/admin` 里重置。
- 未接入验证码/限流：公网可被脚本刷注册。若要对外开放，建议加 Cloudflare Turnstile
  或 Rate Limiting 规则。
- 前端 token 存在 localStorage（不用 cookie），因此不受 CSRF 影响；但 XSS 会拿到 token，
  站内所有用户输入都已用 `TW.esc` 转义。
