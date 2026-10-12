# 六级单词速记（TypingCET）

一个**打字背单词**的静态网站，风格与交互参考开源项目
[TypeWords](https://github.com/zyronon/TypeWords)，词库来自自己整理的
「六级词汇周计划音频」字幕文件。

零依赖、零构建：**双击 `index.html` 就能用**，也可以直接托管到 GitHub Pages。

![预览](docs/preview-home.png)

## 功能

**词库**
- 9 本词书：Week 1–7（各 250 词）+ 认知词汇 1/2（474 / 490 词），共 **2714 个词条**
- 每个词条带美/英音标与中文释义（含词性），释义离线打包，断网可用
- 搜索（单词 / 释义）、按学习状态筛选（未学 / 错词 / 收藏 / 已掌握）、分页浏览

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

## 部署到 GitHub Pages

1. 打开仓库 Settings → Pages
2. Source 选择 `Deploy from a branch`，Branch 选 `main`、目录选 `/ (root)`
3. 稍等片刻即可通过 `https://<用户名>.github.io/<仓库名>/` 访问

页面内全部使用相对路径，放在任意子路径下都能正常工作。

## 目录结构

```
.
├── index.html              # 入口（单页应用）
├── assets/
│   ├── css/style.css       # 全部样式
│   └── js/
│       ├── util.js         # 工具函数、SVG 图标、Toast
│       ├── store.js        # 学习状态（localStorage 持久化）
│       ├── speech.js       # 语音合成 + WebAudio 音效
│       ├── data.js         # 词库访问层
│       ├── components.js   # 共享 UI 片段
│       ├── app.js          # 侧边导航 + hash 路由
│       └── views/          # 各页面（首页/词库/练习/生词本/音频/统计/资料/设置）
├── data/
│   ├── words.json/js       # 2714 个词条（含音标、释义、音频时间轴）
│   └── books.json/js       # 词书元信息
├── audio/                  # 压缩后的课程音频 + 原始字幕
├── resources/              # 六级阅读 PDF
└── tools/                  # 数据构建脚本（见下）
```

## 数据是怎么来的

```
六级词汇周计划音频/*.lrc   ──┐
                            ├──► tools/build_data.py ──► data/words.json
有道词典 jsonapi（音标+释义）─┘                             │
                                                          ▼
                                        tools/make_js_data.py ──► data/words.js
```

```bash
# 1) 解析字幕 + 抓取音标/释义（结果缓存在 tools/.cache，可重复运行）
python tools/build_data.py

# 2) 把 JSON 包装成可直接 <script> 引入的 JS
python tools/make_js_data.py
```

- `build_data.py` 会自动处理三类特殊写法：同形异义标记 `bass①`、拼写变体
  `specialize,-ise`、编号 `utter1`
- 抓取结果按单词缓存到 `tools/.cache/youdao/`，重跑不会重复请求

## 说明

- 中文释义来自在线词典，抓取后离线打包，仅供个人学习使用
- 发音依赖浏览器语音合成，Chrome / Edge 效果最好
- 学习记录只存在本机浏览器，换设备或清理浏览器数据会丢失（可先导出备份）

## 致谢

交互与视觉风格参考 [zyronon/TypeWords](https://github.com/zyronon/TypeWords)（GPL-3.0）。
本项目为独立实现的静态版本，未复用其源码。
