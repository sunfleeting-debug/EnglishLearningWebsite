# 六级单词速记（TypingCET）

一个**打字背单词**的静态网站，风格与交互参考开源项目
[TypeWords](https://github.com/zyronon/TypeWords)，词库来自自己整理的
「六级词汇周计划音频」字幕文件。

零依赖、零构建：**双击 `index.html` 就能用**，也可以直接托管到 GitHub Pages。

🌐 **在线地址**：<https://sunfleeting-debug.github.io/EnglishLearningWebsite/>

📱 **手机上一句话搞定**：用手机浏览器打开上面的网址 → 分享菜单 → 「添加到主屏幕」，
之后就像 App 一样全屏打开（已配 PWA 图标与 manifest）。
移动端做了针对性优化：底部导航栏、单列布局、**词典数据按需加载**（首屏 JS 从 ~5.7MB 降到 ~0.8MB）。

![预览](docs/preview-home.png)

![选择词典](docs/preview-decks.png)

![复习（艾宾浩斯）](docs/preview-srs.png)

![词典详解](docs/preview-word.png)

## 功能

**词库（选择词典）**
- **六级词汇周计划**：Week 1–7（各 250 词）+ 认知词汇 1/2（474 / 490 词），共 2714 词
- **常用词典 12 本**：高考 3500 / 大学英语四级 / 大学英语六级 / 考研英语 / 英语专业四级 /
  雅思 IELTS / 托福 TOEFL / GRE / 商务英语 BEC / 牛津核心词 / 朗文交际 3000 / 新概念英语 2
  —— 共 **39087 个词条**，整站合计 **41801 词**
- 「词库」页就是**词典选择页**：按类别（六级周计划 / 考试核心 / 留学考试 / 职业英语 / 通用权威）
  分组展示词典卡，每张卡带词数、已学数、掌握进度，可「浏览词表」或直接「练习」
- 词典数据**按需加载**：只有打开某本词典时才注入 `data/dicts/<id>.js`（100~450KB/本），
  目录本身只有 1.7KB，首屏不受影响
- 每个词条带美/英音标与中文释义；搜索（单词 / 释义）、按学习状态筛选（未学 / 错词 / 收藏 / 已掌握）、分页浏览

**复习（艾宾浩斯遗忘曲线）**
- 练习中**答错的词自动进入复习队列**（可在设置里关闭）
- 答对一次升一档，下次复习时间 = 今天 + **1 / 2 / 4 / 7 / 15 / 30 / 60** 天；
  答错则归零档、**当天重新回到队列**，直到答对为止
- 独立「复习」页：今日待复习数、队列规模、滚动中 / 已满档、**未来 8 天排期条**、到期单词清单
  （含档位与逾期天数，可单个移出）
- 侧边导航「复习」带**待复习角标**，首页也有一张「今日复习」提醒卡
- 可直接用「开始复习」进入练习（四种模式随便挑），会话结束显示队列还剩多少词

**生词本（跨词库）**
- 错词 / 收藏 / 已掌握三个分组，**统计口径覆盖所有词库**（周计划 + 各本词典）
- 词典词靠进度里的「词面快照」显示，**不需要先把词典加载进来**
- 错词行上直接显示该词在复习队列里的档位与到期时间，「练习这组」可按分组开一轮练习

**词典详解（一词一卡）**
- 点词表右侧 💡 或任意链接，进入单词详情页：**搭配 / 派生词 / 辨析 / 近义词 / 反义词 / 经典例句 / 词源**
- **近义词、反义词、例句中的每个单词都可点击**：在本词书里的直接跳词条；不在本词书里的近义/反义词，
  也补了「扩展词条」（音标+释义）可以点开；自动做词形还原（`measures → measure`、`drastically → drastic`、`regulations → regulation`）
- 数据来自有道词典 jsonapi（搭配、派生、辨析、近义、例句、词源）+ Datamuse（反义词），全部离线打包

**练习（四种模式）**
| 模式 | 说明 |
| --- | --- |
| 看词打字 | 看着单词把它打出来，练拼写肌肉记忆 |
| 看中文拼写 | 只看中文释义，凭记忆写出英文单词 |
| 听音写词 | 听发音写出单词，练听力与拼写 |
| 翻卡记忆 | 先回忆再翻面，认识 / 不认识快速过词 |

**练习：键盘操作（尽量不用鼠标）**

| 按键 | 作用 |
| --- | --- |
| `Enter` | 打字类：提交答案；反馈页：继续下一词。翻卡：未翻面时翻面、已翻面时＝**认识** |
| `空格` | 翻卡翻面 |
| `Backspace` / `←` | 翻卡：**不认识** |
| `→` | 翻卡：认识 |
| `Esc` | 跳过本词（记为答错） |
| `S` | 重听发音（焦点不在输入框时） |
| `1` `2` `3` `4` | 切换练习模式（同上，**打字时让路**，不会把数字吃掉） |
| 完成页 `Enter` | 触发主按钮：还有没学的词就「学习下一组」，否则「再来一轮」 |

**练习：学完一组接着学下一组**
- 进入练习时**从第一个还没学的词开始**（顺序模式：从该词往后切；随机模式：在未学词里随机抽），
  所以学完 20 个再进来，接着练第 21~40 个，而不是又从第 1 个重来
- 一轮做完的完成页会显示**还剩多少个词没学**，并给出「**学习下一组**」；「再来一轮」则是**同一批词**重练一遍
- 整本都学完后不再显示「学习下一组」，改为提示「已经全部学完啦」

**音频跟读**
- 播放课程 mp3，按 `.lrc` 时间轴**自动高亮当前单词**
- 点击任意单词跳转到对应音频位置，支持「逐词暂停」听写模式

**生词本与统计**
- 答错的词自动进入错词本，并同时进入复习队列；收藏、已掌握集中管理
- 首页与统计页展示掌握进度、近 14 天练习量、连续学习天数、错得最多的词（跨所有词库）

**其它**
- 浅色 / 深色主题，键盘音效与提示音
- 学习数据存于浏览器 localStorage，支持导出 / 导入 JSON 备份（含复习队列）
- 发音走「在线真人音频优先 + 系统语音兜底」双通道，可在设置页切换（见下方「关于发音」）

**账号与云同步（可选，默认关闭）**
- **不登录也能用**：站点本身是纯静态的，全部功能照常工作，数据存本机
- 在「账号」页填一次后端地址即可启用：邮箱 + 密码注册 / 登录，换设备登录后**自动合并**两边进度
- 同步内容：每个词的错/对/已学/收藏/已掌握、每日练习量、复习队列档位
- **只传增量**：本地有脏标记，默认 3.5 秒防抖后只上传变动部分；登录、切页、关页面（beacon）会强制补一次全量
- 导航栏底部显示同步状态点（灰=离线 / 蓝=同步中 / 红=失败）
- 管理员进了 `ADMIN_EMAILS` 名单后能看到**管理看板**：用户列表、逐人下钻（错词/已掌握/收藏/复习队列）、
  近 14 天练习曲线、CSV 导出、重置他人密码

**移动端**
- 自适应布局：窄屏改为底部导航栏 + 单列卡片，已断言「无横向溢出」（390×844 实测）
- PWA：`manifest.json` + 图标（192 / 512 / maskable / apple-touch），可「添加到主屏幕」全屏打开
- 词典卡与扩展词条按需加载，首屏 JS 约 0.8MB（详情页才加载余下的约 4.9MB）

## 快速开始

方式一：直接双击 `index.html`（推荐，无需任何环境）。

方式二：用仓库自带的本地服务器（**推荐**，音频才能拖动进度 / 点击字幕跳转）：

```bash
python tools/serve.py          # 默认 http://127.0.0.1:5173
python tools/serve.py -p 8080  # 换端口
```

> ⚠️ 别用 `python -m http.server`：它不支持 Range 请求，浏览器无法对 mp3 做时间跳转，
> 「音频跟读」页点击单词会跳转失败。`tools/serve.py` 补上了 Range（HTTP 206）支持。

也可以用 Node：`npx --yes serve . -l 5173`。

## 部署到 GitHub Pages（已启用）

线上地址：<https://sunfleeting-debug.github.io/EnglishLearningWebsite/>

这个站**零构建**，所以部署就是「推 main」——Pages 已配成 `main` 分支 `/ (root)`，
`git push` 之后一两分钟自动重新发布，无需任何构建步骤。

```bash
git push origin main    # 推完等 1~2 分钟即可
```

- 根目录放了 `.nojekyll`，让 Pages 跳过 Jekyll 处理，所有文件按原样提供
- 页面内全部使用相对路径 ⇒ 放在任意子路径（如 `/EnglishLearningWebsite/`）都能正常工作
- 首次开启 Pages（换仓库时）：Settings → Pages → Source 选 `Deploy from a branch`，
  Branch 选 `main`、目录 `/ (root)`；或用 API：
  `gh api --method POST repos/<owner>/<repo>/pages -f "source[branch]=main" -f "source[path]=/"`

## 后端与云同步（可选）

站点本身不需要后端。**只有想让进度跨设备保存时**，才需要额外部署一个 Cloudflare Worker。

选它的原因：免费额度足够（D1 5GB / 每天 10 万次请求）、不用管服务器、和 GitHub Pages 的静态站天然分开。

```bash
cd worker
npm i -g wrangler            # 或 npx wrangler
wrangler login

wrangler d1 create cet-words-db          # 建库，把输出的 database_id 填进 wrangler.toml
wrangler d1 execute cet-words-db --file=schema.sql --remote   # 建表

# 管理员邮箱（逗号分隔；在名单里的人登录后才看得到「管理看板」）
# 以及允许访问的前端来源（逗号分隔，防止别人拿你的接口地址乱调）
# 都写在 wrangler.toml 的 [vars] 里

wrangler deploy              # 拿到 https://cet-words-api.<你的账号>.workers.dev
```

> 本仓库的后端**已经部署好了**：<https://cet-words-api.sunfleeting.workers.dev>
> 地址写在 `assets/js/config.js` 的 `apiBase` 里，所以打开站点就能直接注册/登录。
> 但**不登录 = 纯离线模式**：不发任何请求，数据只在本机，全部功能照常。

部署好之后（换账号/换库时才需要重来一遍）：

1. 打开站点的「**账号**」页 → 「后端地址」里填 `https://...workers.dev` → 保存并测试
   （地址存在 localStorage 的 `typingcet.apiBase`，优先级高于 `config.js` 里的默认值）
2. 用邮箱 + 密码注册 / 登录；登录后本地进度会**整包上传并与云端合并**，之后只传增量
3. 在「管理看板」里能看到所有用户（仅 `ADMIN_EMAILS` 名单内的邮箱能看到这个入口）

### 线上后端冒烟测试

改完后端代码后，除了跑本地 mock，还可以直接打线上接口确认真的部署好了：

```bash
python tools/smoke_api.py        # 36 项断言：健康检查 / 注册登录 / 同步合并 / 删除清空 / CORS / 权限 / 错误路径
```

> ⚠️ 两个环境坑（脚本里都处理了，但排查时要知道）：
> ① 本机到 `*.workers.dev` **必须走系统代理**（直连超时），而 `api.cloudflare.com` 相反要直连；
> ② Cloudflare 会对 `Python-urllib` 这类 UA 直接回 `403 error code: 1010`，脚本因此伪装了浏览器 UA。
> ③ 链路会间歇性断（同一请求 200/000 交替），脚本对传输错误做了重试 —— 别把 `status=0` 当成后端故障。

### 同步的合并规则

服务端以「谁更多 / 谁更新」为准，不做简单覆盖：

| 字段 | 规则 |
| --- | --- |
| `w`（错）/`r`（对）/`seen`（已学） | 取 **max** |
| `fav`（收藏）/`master`（已掌握） | 取 **时间戳更新**的那条 |
| `daily.done` / `daily.right` | 取 **max** |
| 复习队列 `srs` | 整条按 **ts** 取新（间隔与到期日必须自洽，不能逐字段合并） |

删除走显式名单（`deleted`），清空走 `clear`，所以「本机删掉某个词」不会被下一次全量上传复活。

### 隐私与安全

- **只存邮箱（小写）和 PBKDF2-SHA256 加盐哈希**（10 万轮），不存明文密码；登录令牌是 32 字节随机数、30 天过期
- 同步的内容只有：单词 id、词面快照、对错计数、收藏/掌握标记、复习档位、每日练习量 —— 没有其它个人信息
- **没有邮箱验证、也没有找回密码**（刻意不做，避免引入邮件服务）；管理员可在看板里给任何人重置密码
- 不登录不会产生任何云端数据；登录后数据归该账户，管理员只能查看统计与重置密码
- `ALLOWED_ORIGINS` 建议填上你的 Pages 地址，避免接口被别的站点盗用

## 目录结构

```
.
├── index.html              # 入口（单页应用）
├── manifest.json           # PWA 清单（添加到主屏幕）
├── .nojekyll               # 让 GitHub Pages 跳过 Jekyll
├── assets/
│   ├── css/style.css       # 全部样式
│   ├── img/                # PWA 图标（192 / 512 / maskable / apple-touch）
│   └── js/
│       ├── util.js         # 工具函数、SVG 图标、Toast
│       ├── store.js        # 学习状态（localStorage 持久化 + 脏标记）
config.js       # 后端地址（留空即纯离线）
api.js          # 后端接口客户端（Bearer token）
sync.js         # 增量同步调度（防抖 / 强制全量 / 页面隐藏 beacon）
│       ├── speech.js       # 发音双通道（在线音频 / 系统语音）+ WebAudio 音效
│       ├── data.js         # 词库访问层
│       ├── components.js   # 共享 UI 片段（含单词链接 / 例句分词）
│       ├── app.js          # 侧边导航 + hash 路由
│       └── views/          # 各页面（首页/词库/详情/练习/复习/生词本/音频/统计/阅读/资料/设置/账号/管理）
├── data/
│   ├── words.json/js       # 2714 个词条（含音标、释义、音频时间轴）
│   ├── dict.json/js        # 词典卡（搭配/派生/辨析/近义/反义/例句/词源）
│   ├── dict-ext.json/js    # 扩展词条（近义/反义词中非本词书者，音标+释义）
│   ├── books.json/js       # 词书元信息
│   └── dicts/              # 12 本常用词典（index.js 目录 + 每本一个按需加载的 js）
├── THIRD-PARTY.md          # 第三方数据来源与许可
├── audio/                  # 压缩后的课程音频 + 原始字幕
├── resources/              # 六级阅读 PDF
├── worker/                 # 后端（Cloudflare Workers + D1）
│   ├── index.js            # 注册/登录/同步/管理接口
│   ├── schema.sql          # D1 建表
│   └── wrangler.toml       # 部署配置（ADMIN_EMAILS / ALLOWED_ORIGINS）
└── tools/                  # 数据构建与核验脚本（见下）
```

## 数据是怎么来的

```
六级词汇周计划音频/*.lrc   ──┐
                            ├──► tools/build_data.py ──► data/words.json
有道词典 jsonapi（音标+释义）─┘                             │
                                                          ▼
                                        tools/make_js_data.py ──► data/words.js

有道 jsonapi（搭配/派生/辨析/近义/例句/词源）─┐
Datamuse api（反义词）──────────────────────┴──► tools/enrich_dict.py ──► data/dict.json/js
```

```bash
# 1) 解析字幕 + 抓取音标/释义（结果缓存在 tools/.cache，可重复运行）
python tools/build_data.py

# 2) 把 JSON 包装成可直接 <script> 引入的 JS
python tools/make_js_data.py

# 3) 构建词典卡（一词一卡：搭配/派生/辨析/近义/反义/例句/词源）
python tools/enrich_dict.py

# 4) 为词典卡里那些不在本地词书的近义/反义词补轻量词条（让链接真正跳得动）
python tools/build_dict_ext.py

# 5) 抓取并转换 12 本常用词典（qwerty-learner，GPL-3.0）→ data/dicts/
python tools/build_qwerty_dicts.py            # 带 tools/.cache/qwerty 磁盘缓存，可重跑
python tools/build_qwerty_dicts.py --refresh  # 忽略缓存重新抓取
```

- `build_data.py` 会自动处理三类特殊写法：同形异义标记 `bass①`、拼写变体
  `specialize,-ise`、编号 `utter1`
- 抓取结果按单词缓存到 `tools/.cache/youdao/`（词典卡为 `tools/.cache/raw/` 与
  `tools/.cache/datamuse/`，词典为 `tools/.cache/qwerty/`），重跑不会重复请求
- 有道没有「反义词」字段，`enrich_dict.py` 用 Datamuse 的 `rel_ant` 补充；
  有道没有「搭配」的词，则从例句中挖掘与该词高频共现的短语（标注为「语料搭配」）
- `build_qwerty_dicts.py` 抓的是 qwerty-learner 的 `public/dicts/*.json`（`{name, usphone, ukphone, trans}`），
  转成本站紧凑格式 `[单词, 美音, 英音, "释义\n释义"]` 并按小写词形去重；第三方来源与许可见 `THIRD-PARTY.md`

### 各板块数据覆盖率（全量 2702 词）

| 板块 | 来源 | 覆盖 |
| --- | --- | --- |
| 释义 / 音标 | 有道 jsonapi | 100% |
| 经典例句 | 有道 jsonapi | 99% |
| 考频标签 | 有道 jsonapi | 99% |
| 近义词 | 有道 syno | 94% |
| 词源 | 有道 etym | 91% |
| 派生词 | 有道 rel_word | 81% |
| 搭配 | 有道 phrs（不足则语料挖掘） | 67% + 30% |
| 辨析 | 有道 discriminate | 43% |
| 反义词 | Datamuse rel_ant | 25% |
| 扩展词条 | 有道 jsonapi | 5653 条（近义/反义词里非本词书者） |

> 没有数据的板块会自动隐藏，不会出现空标题。

## 本地核验

```bash
bash tools/verify.sh          # 起服务 + 跑 Playwright，共 96 项断言 + 33 张截图
```

核验通过的标准：`失败 0 / 共 96 项断言`，且控制台错误数 = 0。截图落在 `docs/shots/`。
断言覆盖：数据层（词条数 / 词典目录 / id 唯一 / 字节级原样下发）· 各页面渲染 ·
练习四模式与「答错先给重做机会」· 翻卡跨会话覆盖回归 · 词典按需加载与词典词详情页 ·
生词本跨词库统计 · 复习队列（自动入队 → 到期 → 答对升档推到明天 → 待复习清零）·
移动端无横向溢出 · 控制台 0 错误。

> 脚本会先自检端口是否被占用（Windows 下 `SO_REUSEADDR` 允许多进程绑同一端口，
> 一旦叠加，请求会随机落到旧进程，造成「时好时坏」的假失败）。
> 若提示端口被占，按输出里的 `taskkill /PID <pid> /F` 结束残留进程再跑。

发音双通道单独核验（13 项断言：音频请求 / 缓存 / 失败回退 / 模式切换）：

```bash
python tools/verify_speech.py
```

练习页键盘操作与「学下一组」核验（36 项断言）：

```bash
python tools/verify_practice.py
```

覆盖：翻卡 空格/Enter 翻面 → Enter 认识 / Backspace 不认识 / Esc 跳过 · 空格翻面 ·
打字模式反馈页 Enter 继续（旧实现这里按 Enter 没反应）· 1~4 换模式（且打字时不抢键）·
完成页「学习下一组」与剩余词数 · 「再来一轮」重练同一批词 ·
**重进练习页从第一个没学的词开始** · 全部学完后不再提示下一组 · 控制台 0 错误。

后端与同步端到端核验（47 项断言，用 **Python 标准库写的假后端**跑真实浏览器流程，
不需要真的 Cloudflare 账号）：

```bash
python tools/verify_backend.py
```

线上后端冒烟（打真实接口，见上方「后端与云同步」）：

```bash
python tools/smoke_api.py
```

覆盖：不登录也能用 · 注册并被识别为管理员 · 答题后自动同步 · 合并取 max 不回退 ·
换设备登录恢复进度 · 管理看板下钻（且不被后台同步重渲染关掉）· 非管理员 403 ·
管理员重置密码 · 退出登录后本机数据仍在 · 控制台 0 错误。

> `tools/mock_api.py` 是 Worker 接口与合并规则的**逐条等价实现**（纯 stdlib），
> 改 `worker/index.js` 时两边要同步改，否则本地绿、线上错。

线上验收（真开一次已部署的站点）：

```bash
NODE_OPTIONS= python -u tools/verify_live.py
```

26 项断言：标题 / 首页渲染 / 词库列表 / 详情页与按需加载 / 近义词跳转 / 发音通道 /
真题阅读页与答题卡 / 答错给重做机会 / 词典目录与按需加载 / 复习队列自动入队与角标 /
移动端无横向溢出 / 控制台错误 0 / 资源失败 0。
> 启动 Chromium 需要真实环境（用沙箱 Bash 跑 Playwright 时需关闭沙箱，否则浏览器进程会被拦截）；
> 另外 Playwright 版本必须与已下载的 `chromium_headless_shell` 版本一致，
> 不匹配时先执行 `python -m playwright install chromium-headless-shell`。

## 说明

- 中文释义来自在线词典，抓取后离线打包，仅供个人学习使用
- 12 本常用词典的词表取自开源项目 [qwerty-learner](https://github.com/RealKai42/qwerty-learner)（GPL-3.0）；
  **第三方数据来源与许可逐项列在 [`THIRD-PARTY.md`](THIRD-PARTY.md)**
- 复习调度为自研实现：固定间隔 1/2/4/7/15/30/60 天，答对升档、答错归零（不是 FSRS）
- 不登录时学习记录只存在本机浏览器，换设备或清理浏览器数据会丢失（可先导出备份，或登录做云同步）
- 云同步是**可选**的：不配后端地址就完全不联网上传任何学习数据

### 关于发音（没声音怎么排查）
发音有两条通道，可在「设置 → 发音与音效 → 发音方式」切换：

| 方式 | 行为 |
| --- | --- |
| 自动（默认） | 优先播在线真人音频；加载失败或 2.5 秒起不来则自动退回系统语音 |
| 在线音频 | 只用真人音频（有道 `dictvoice` mp3），音质最好，需要联网 |
| 系统语音 | 只用浏览器语音合成（Web Speech API），可离线 |

**为什么默认走音频**：系统语音合成在移动端有两个 JS 根本检测不到的静默失败 ——
iOS 物理静音键打开时事件照常触发却不出声；Android 未装英文语音包时直接哑掉。
而 `<audio>` 播放不受 iOS 静音键影响，所以更稳。

两路都听不到时，按顺序检查：

1. 手机侧边**静音键**是否打开（iOS 上会静音系统语音，切到「在线音频」可绕过）
2. 是否联网（在线音频需要）
3. 系统是否安装了英文语音引擎（Android 部分国产 ROM 未预装）
4. 页面音量与系统媒体音量

> 排查本机浏览器到底有没有可用的英文语音包：
> `python tools/diag_speech.py`（打印 voice 列表 + 实际 speak 事件 + 音频直链可用性）

## 致谢

交互与视觉风格参考 [zyronon/TypeWords](https://github.com/zyronon/TypeWords)（GPL-3.0）。
本项目为独立实现的静态版本，未复用其源码。
