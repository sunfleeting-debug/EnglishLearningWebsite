# 第三方数据与许可（Third-party data & licenses）

本项目自身的代码以 **Apache-2.0** 发布（见 `LICENSE`）。但站点里打包了若干**第三方数据**，
它们各有自己的来源与许可，逐项列在下面。

---

## 1. 六级词汇周计划（字幕整理）

- **来源**：本站作者自己整理的《六级词汇周计划》音频字幕（`.lrc`），音频与 PDF 来自公开教材
- **位置**：`data/words.*`、`audio/`、`resources/`
- **说明**：仅供个人学习使用；仓库为 public，因此音频与教材扫描件属于公开传播，作者自担风险

## 2. 有道词典 jsonapi

- **来源**：`https://dict.youdao.com/jsonapi?q=<word>`（免费公开接口）
- **用途**：音标、带词性的中文释义、搭配（`phrs`）、派生（`rel_word`）、辨析（`discriminate`）、
  近义（`syno`）、例句（`blng_sents_part`）、词源（`etym`）、考频
- **位置**：`data/dict.*`、`data/dict-ext.*`（扩展词条）
- **说明**：抓取后离线打包，仅用于个人学习；版权归有道及其上游词典方所有

## 3. Datamuse API

- **来源**：`https://api.datamuse.com/words?rel_ant=<word>`
- **用途**：反义词（有道没有该字段）
- **位置**：`data/dict.*` 中的 `ant` 字段
- **许可**：Datamuse 提供免费无 key 接口，数据本身来自公开词库

## 4. qwerty-learner（常用词典词表）

- **来源**：<https://github.com/RealKai42/qwerty-learner>，`public/dicts/` 目录
- **许可**：**GPL-3.0**
- **本仓库用到的部分**：只取 12 本词典的**纯词表数据**（单词 + 美/英音标 + 中文释义），
  见 `tools/build_qwerty_dicts.py` 里的 `DECKS` 清单；转换后落在 `data/dicts/<id>.js`
- **对应上游文件**：

  | 本站 id | 显示名 | 上游文件 |
  | --- | --- | --- |
  | `gk3500` | 高考 3500 | `GaoKao_3500.json` |
  | `cet4` | 大学英语四级 | `CET4_T.json` |
  | `cet6` | 大学英语六级 | `CET6_T.json` |
  | `kaoyan` | 考研英语 | `KaoYan_3_T.json` |
  | `tem4` | 英语专业四级 | `Level4luan_2_T.json` |
  | `ielts` | 雅思 IELTS | `IELTS_3_T.json` |
  | `toefl` | 托福 TOEFL | `TOEFL_3_T.json` |
  | `gre` | GRE | `GRE_3_T.json` |
  | `bec` | 商务英语 BEC | `BEC_3_T.json` |
  | `oxford3000` | 牛津核心词 | `Oxford3000.json` |
  | `longman3000` | 朗文交际 3000 | `Longman_Communication_3000.json` |
  | `nce2` | 新概念英语 2 | `NCE_2.json` |

- **说明**：`data/dicts/` 下的词表数据以 **GPL-3.0** 分发；
  站点其余部分（代码、六级词书数据）仍按各自条款。若上游作者有异议，可提 issue，会立即移除。

## 5. 后端（自建代码，非第三方数据）

- **位置**：`worker/`（Cloudflare Workers + D1，`index.js` / `schema.sql` / `wrangler.toml`）
- **许可**：与本项目一致，**Apache-2.0**，全部为自己编写，未引入第三方代码或数据
- **运行时**：Cloudflare 只是托管基础设施；**默认不部署**，站点不配后端地址时完全不联网上传学习数据
- **收集范围**：仅邮箱（小写）、PBKDF2-SHA256 加盐密码哈希、单词 id / 词面 / 对错计数 /
  收藏与掌握标记 / 复习档位 / 每日练习量。不含姓名、手机号等其它个人信息
- 站点内嵌词库数据（本节之外，第 1–4 项）**不会**上传到后端

## 6. TypeWords（交互与视觉参考）

- **来源**：<https://github.com/zyronon/TypeWords>（GPL-3.0）
- **本仓库用到的部分**：**仅参考交互与视觉风格**（卡片化布局、等宽单词字体、练习模式、
  复习调度思路）。**没有复制其任何代码或数据文件**。
  Node 依赖与其私有 CDN 上的词库**均未引入**。
- **说明**：本站的复习调度是自己的实现（艾宾浩斯固定间隔 1/2/4/7/15/30/60 天），
  与 TypeWords 使用的 FSRS（ts-fsrs）算法无关。

## 7. Earthworm（句子练习交互参考）

- **来源**：<https://github.com/cuixueshe/earthworm>（AGPL-3.0）
- **参考内容**：从短语递进到完整句的练习方式、中文题面、英文输入、逐词纠错和键盘推进。
- **本项目实现**：`assets/js/sentences.js`、`assets/js/views/sentences.js`、`assets/css/sentences.css` 和 `data/sentences.js` 为独立编写；6 门内置课程为本站原创，没有复制上游源码、品牌素材或课程数据。
- **句子复习**：由本站独立新增，使用 1 / 2 / 4 / 7 / 15 / 30 / 60 天固定间隔；不宣称复用了 Earthworm 的复习算法。
