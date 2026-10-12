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

![词典详解](docs/preview-word.png)

## 功能

**词库**
- 9 本词书：Week 1–7（各 250 词）+ 认知词汇 1/2（474 / 490 词），共 **2714 个词条**
- 每个词条带美/英音标与中文释义（含词性），释义离线打包，断网可用
- 搜索（单词 / 释义）、按学习状态筛选（未学 / 错词 / 收藏 / 已掌握）、分页浏览

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

**音频跟读**
- 播放课程 mp3，按 `.lrc` 时间轴**自动高亮当前单词**
- 点击任意单词跳转到对应音频位置，支持「逐词暂停」听写模式

**生词本与统计**
- 答错的词自动进入错词本；收藏、已掌握集中管理
- 首页与统计页展示掌握进度、近 14 天练习量、连续学习天数、错得最多的词

**其它**
- 浅色 / 深色主题，键盘音效与提示音
- 学习数据存于浏览器 localStorage，支持导出 / 导入 JSON 备份
- 发音使用浏览器内置语音合成（Web Speech API），无需联网音频

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
│       ├── store.js        # 学习状态（localStorage 持久化）
│       ├── speech.js       # 语音合成 + WebAudio 音效
│       ├── data.js         # 词库访问层
│       ├── components.js   # 共享 UI 片段（含单词链接 / 例句分词）
│       ├── app.js          # 侧边导航 + hash 路由
│       └── views/          # 各页面（首页/词库/详情/练习/生词本/音频/统计/资料/设置）
├── data/
│   ├── words.json/js       # 2714 个词条（含音标、释义、音频时间轴）
│   ├── dict.json/js        # 词典卡（搭配/派生/辨析/近义/反义/例句/词源）
│   ├── dict-ext.json/js    # 扩展词条（近义/反义词中非本词书者，音标+释义）
│   └── books.json/js       # 词书元信息
├── audio/                  # 压缩后的课程音频 + 原始字幕
├── resources/              # 六级阅读 PDF
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
```

- `build_data.py` 会自动处理三类特殊写法：同形异义标记 `bass①`、拼写变体
  `specialize,-ise`、编号 `utter1`
- 抓取结果按单词缓存到 `tools/.cache/youdao/`（词典卡为 `tools/.cache/raw/` 与
  `tools/.cache/datamuse/`），重跑不会重复请求
- 有道没有「反义词」字段，`enrich_dict.py` 用 Datamuse 的 `rel_ant` 补充；
  有道没有「搭配」的词，则从例句中挖掘与该词高频共现的短语（标注为「语料搭配」）

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
bash tools/verify.sh          # 起服务 + 跑 Playwright，共 38 项断言 + 截图
```

核验通过的标准：`失败 0 / 共 38 项断言`，且控制台错误数 = 0。截图落在 `docs/shots/`。

线上验收（真开一次已部署的站点）：

```bash
NODE_OPTIONS= python -u tools/verify_live.py
```

10 项断言：标题 / 首页渲染 / 词库列表 / 详情页与按需加载 / 近义词跳转 /
移动端无横向溢出 / 控制台错误 0 / 资源失败 0。

> 启动 Chromium 需要真实环境（用沙箱 Bash 跑 Playwright 时需关闭沙箱，否则浏览器进程会被拦截）；
> 另外 Playwright 版本必须与已下载的 `chromium_headless_shell` 版本一致，
> 不匹配时先执行 `python -m playwright install chromium-headless-shell`。

## 说明

- 中文释义来自在线词典，抓取后离线打包，仅供个人学习使用
- 发音依赖浏览器语音合成，Chrome / Edge 效果最好
- 学习记录只存在本机浏览器，换设备或清理浏览器数据会丢失（可先导出备份）

## 致谢

交互与视觉风格参考 [zyronon/TypeWords](https://github.com/zyronon/TypeWords)（GPL-3.0）。
本项目为独立实现的静态版本，未复用其源码。
