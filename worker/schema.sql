-- ============================================================================
-- 六级单词速记 · 云端进度库（Cloudflare D1 / SQLite）
-- 用法：wrangler d1 execute cet-words --file=./schema.sql --remote
--      （本地调试用 --local）
-- ============================================================================

-- 用户 ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,        -- uuid
  email      TEXT NOT NULL UNIQUE,    -- 统一小写存储
  pass_hash  TEXT NOT NULL,           -- pbkdf2$<迭代次数>$<salt hex>$<hash hex>
  name       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,        -- 毫秒时间戳
  last_seen  INTEGER NOT NULL,
  synced_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 登录会话（不记 cookie，前端拿 token 放 Authorization 头） -------------------
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 邮箱验证码（注册 / 找回密码，SMTP2GO 发信） ---------------------------------
-- 只存 sha256(code|email|purpose)，不落明文；10 分钟有效、60 秒重发、5 次错误作废。
CREATE TABLE IF NOT EXISTS email_codes (
  email     TEXT NOT NULL,
  purpose   TEXT NOT NULL,              -- 'register' | 'reset'
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);

-- 单词学习进度（每个用户每个词一行） -----------------------------------------
-- w/r/seen 是「累计计数」，跨设备合并取最大值（不会因为晚同步而回退）；
-- fav/master 取「最后修改那一条」的值（这样才能把取消收藏/取消掌握同步出去）；
-- note/note_ts 是学习笔记，合并取 note_ts 较新的一方（不参与 ts，见 worker/index.js mergeProgress）。
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL,
  word_id TEXT NOT NULL,              -- 数字 id（周计划）或 "<词典id>:<单词>"
  w       INTEGER NOT NULL DEFAULT 0, -- 累计答错
  r       INTEGER NOT NULL DEFAULT 0, -- 累计答对
  seen    INTEGER NOT NULL DEFAULT 0,
  fav     INTEGER NOT NULL DEFAULT 0,
  master  INTEGER NOT NULL DEFAULT 0,
  ts      INTEGER NOT NULL DEFAULT 0, -- 该记录最后修改时间（毫秒）
  word    TEXT,                       -- 词面快照（词典懒加载，列表要靠它显示）
  src     TEXT,
  brief   TEXT,
  note    TEXT,                       -- 学习笔记（详解页随记）
  note_ts INTEGER,                    -- 笔记最后修改时间（毫秒）
  PRIMARY KEY (user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);

-- 旧库升级（已建过表的 D1 实例执行一次；列已存在会报错，忽略即可）：
--   ALTER TABLE progress ADD COLUMN note TEXT;
--   ALTER TABLE progress ADD COLUMN note_ts INTEGER;

-- 每日练习量（首页/统计页的柱状图） ------------------------------------------
CREATE TABLE IF NOT EXISTS daily (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,              -- YYYY-MM-DD
  done    INTEGER NOT NULL DEFAULT 0, -- 当日练习题数
  right   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- 艾宾浩斯复习队列 -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS srs (
  user_id TEXT NOT NULL,
  skey    TEXT NOT NULL,              -- 小写单词（跨词典共用一条）
  w       TEXT,                       -- 词面
  s       TEXT,                       -- 来源词书
  m       TEXT,                       -- 简释快照
  b       INTEGER NOT NULL DEFAULT 0, -- 当前档位 0..7
  d       TEXT,                       -- 下次到期日 YYYY-MM-DD
  ts      INTEGER NOT NULL DEFAULT 0,
  ok      INTEGER NOT NULL DEFAULT 0,
  bad     INTEGER NOT NULL DEFAULT 0,
  lapses  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, skey)
);
CREATE INDEX IF NOT EXISTS idx_srs_user ON srs(user_id);
