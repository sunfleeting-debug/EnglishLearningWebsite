/**
 * 英语学习站 · 后端 API
 * 运行环境：Cloudflare Workers + D1（SQLite）
 *
 * 设计要点
 *  - 前端是 GitHub Pages 上的纯静态站，不能跑服务端 ⇒ 单独部署这个 Worker 当数据后端。
 *  - 登录用「邮箱 + 密码」，不发验证邮件（用户明确要求）；口令用 PBKDF2-SHA256 加盐哈希，
 *    绝不存明文；登录成功后返回一个随机 token，前端放 localStorage，请求带 Authorization 头。
 *  - 数据是「离线优先」的：未登录时前端只用 localStorage；登录后把本地增量推上来，
 *    服务端做一次合并再把权威结果回给前端。合并规则见 mergeProgress / mergeDaily / mergeSrs。
 *  - 管理员由环境变量 ADMIN_EMAILS 指定（逗号分隔），无需额外的表。
 *
 * 路由
 *   GET  /api/health
 *   POST /api/register          {email, password, name?}      -> {token, user}   （未配邮件服务时的免码注册）
 *   POST /api/register/start    {email}                       -> {ok, ttl}       （发注册验证码，需 MAILJET_API_KEY/MAILJET_SECRET_KEY）
 *   POST /api/register/verify   {email, code, password, name?}-> {token, user}
 *   POST /api/reset/start       {email}                       -> {ok}            （找回密码验证码）
 *   POST /api/reset/verify      {email, code, password}       -> {ok}
 *   POST /api/login             {email, password}             -> {token, user}
 *   POST /api/logout                                           -> {ok}
 *   GET  /api/me                                               -> {user}
 *   GET  /api/me/state                                         -> {progress, daily, srs, syncedAt}
 *   POST /api/me/sync           {progress,daily,srs,deleted,mode} -> {progress,daily,srs,syncedAt}
 *   GET  /api/admin/users                                      -> {users:[...]}
 *   GET  /api/admin/users/:id                                  -> {user, progress, daily, srs}
 *   POST /api/admin/users/:id/password  {password}              -> {ok}
 *   GET  /api/admin/users/:id/export                           -> text/csv
 */

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;   // 会话有效期 30 天
const PBKDF2_ITER = 100000;                  // PBKDF2 迭代次数
const MAX_BODY = 6 * 1024 * 1024;            // 请求体上限（防误传大文件）
const IN_CHUNK = 60;                         // 拼 IN (?,?,...) 时每批的占位符个数
const UP_CHUNK = 40;                         // 批量 upsert 时每批的语句条数

/* ------------------------------------------------------------------ 工具 */

function jsonBody(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extraHeaders || {})
  });
}

function fail(message, status) {
  return jsonBody({ error: message }, status || 400);
}

function corsHeaders(env, req) {
  const allow = String(env.ALLOWED_ORIGINS == null ? '*' : env.ALLOWED_ORIGINS).trim();
  const origin = req.headers.get('Origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (!allow || allow === '*') {
    h['Access-Control-Allow-Origin'] = '*';
  } else {
    /* 配了白名单就只回显命中项，**没命中干脆不给 CORS 头**（浏览器侧自然会拦）。
       不要在没命中时回显 list[0]：那等于对外宣称「我允许的是 github.io」，
       虽然浏览器不会放行，但语义是错的，也容易误导后来的人。 */
    const list = allow.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (list.indexOf(origin) >= 0) h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error('请求体过大');
  if (!text) return {};
  try { return JSON.parse(text); } catch (e) { throw new Error('请求体不是合法 JSON'); }
}

/* ------------------------------------------------------------- 口令 / 令牌 */

function toHex(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' }, key, 256);
  return toHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITER);
  return 'pbkdf2$' + PBKDF2_ITER + '$' + toHex(salt) + '$' + hash;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10) || PBKDF2_ITER;
  const salt = fromHex(parts[2]);
  const hash = await pbkdf2(password, salt, iter);
  // 定长比较，避免时序侧信道
  if (hash.length !== parts[3].length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0;
}

function newToken() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  const b = crypto.getRandomValues(new Uint8Array(16));
  return toHex(a) + toHex(b);
}

/* --------------------------------------------------------------- 校验 */

function normEmail(email) { return String(email || '').trim().toLowerCase(); }

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;
}

function publicUser(user, env) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    createdAt: user.created_at,
    admin: isAdmin(env, user)
  };
}

function isAdmin(env, user) {
  const list = String(env.ADMIN_EMAILS || '').split(',')
    .map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  return list.indexOf(String(user.email || '').toLowerCase()) >= 0;
}

/* --------------------------------------------------------------- 身份 */

async function currentUser(req, env) {
  const auth = req.headers.get('Authorization') || '';
  let token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) token = new URL(req.url).searchParams.get('token') || '';
  if (!token) return null;
  const row = await env.DB.prepare('SELECT * FROM sessions WHERE token = ?').bind(token).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
  if (!user) return null;
  return { user: user, token: token };
}

/* ---------------------------------------------------------- 合并规则 */

/**
 * 单条进度合并
 *  - 计数类（w/r/seen）取 max：两个设备各自累加过，取大值不会丢数据，且重复推送幂等。
 *  - 布尔类（fav/master）取 ts 较新的那一条：否则「取消收藏」永远同步不出去。
 *  - 词面快照取非空的一方。
 *  - 笔记（note）取 noteTs 较新的一方：笔记有自己的时间戳，**不参与 ts**——
 *    ts 只归 fav/master 用，笔记保存不能反过来影响收藏判定。
 */
function mergeProgress(a, b) {
  // 🔴 任何一边可能缺字段（首条插入 cur 为 null、老客户端不带 note），
  //    输出必须是全字段记录，否则写回 SQL 绑定 undefined 直接报错。
  a = a || {}; b = b || {};
  // 平局（两边 ts 相同，典型如首条插入时 b 为空对象）偏向 a = 客户端刚推来的记录
  const aNew = (a.ts || 0) >= (b.ts || 0);
  const newer = aNew ? a : b;
  const older = aNew ? b : a;
  const noteFromA = (a.noteTs || 0) >= (b.noteTs || 0);
  return {
    w: Math.max(a.w || 0, b.w || 0),
    r: Math.max(a.r || 0, b.r || 0),
    seen: Math.max(a.seen || 0, b.seen || 0),
    fav: !!newer.fav,
    master: !!newer.master,
    ts: Math.max(a.ts || 0, b.ts || 0),
    word: newer.word || older.word || '',
    src: newer.src || older.src || '',
    brief: newer.brief || older.brief || '',
    note: (noteFromA ? (a.note || '') : (b.note || '')),
    noteTs: Math.max(a.noteTs || 0, b.noteTs || 0)
  };
}

/** 每日练习量取 max（取和会在重复同步时翻倍） */
function mergeDaily(a, b) {
  a = a || {}; b = b || {};
  return { done: Math.max(a.done || 0, b.done || 0), right: Math.max(a.right || 0, b.right || 0) };
}

/** 复习队列是「排期决策」，整条按 ts 取新 —— 档位/到期日必须自洽，不能逐字段各取各的 */
function mergeSrs(a, b) {
  if (!a) return b;
  if (!b) return a;
  return ((a.ts || 0) >= (b.ts || 0)) ? a : b;
}

/* --------------------------------------------------------- 读写数据库 */

async function readAll(env, userId) {
  const p = await env.DB.prepare('SELECT * FROM progress WHERE user_id = ?').bind(userId).all();
  const d = await env.DB.prepare('SELECT * FROM daily WHERE user_id = ?').bind(userId).all();
  const s = await env.DB.prepare('SELECT * FROM srs WHERE user_id = ?').bind(userId).all();
  const progress = {}, daily = {}, srs = {};
  (p.results || []).forEach(function (r) {
    progress[r.word_id] = {
      w: r.w, r: r.r, seen: r.seen, fav: !!r.fav, master: !!r.master, ts: r.ts,
      word: r.word || '', src: r.src || '', brief: r.brief || '',
      note: r.note || '', noteTs: r.note_ts || 0
    };
  });
  (d.results || []).forEach(function (r) { daily[r.day] = { done: r.done, right: r.right }; });
  (s.results || []).forEach(function (r) {
    srs[r.skey] = { w: r.w || '', s: r.s || '', m: r.m || '', b: r.b, d: r.d || '', ts: r.ts,
                    ok: r.ok, bad: r.bad, lapses: r.lapses };
  });
  return { progress: progress, daily: daily, srs: srs };
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function applySync(env, userId, body) {
  // 显式清空（前端「清空学习记录 / 清空复习队列」触发）
  const clear = Array.isArray(body.clear) ? body.clear : [];
  const clearStmts = [];
  if (clear.indexOf('progress') >= 0) clearStmts.push(env.DB.prepare('DELETE FROM progress WHERE user_id = ?').bind(userId));
  if (clear.indexOf('daily') >= 0) clearStmts.push(env.DB.prepare('DELETE FROM daily WHERE user_id = ?').bind(userId));
  if (clear.indexOf('srs') >= 0) clearStmts.push(env.DB.prepare('DELETE FROM srs WHERE user_id = ?').bind(userId));
  if (clearStmts.length) await env.DB.batch(clearStmts);

  // 显式删除（单条重置 / 从复习队列移除）
  const del = body.deleted || {};
  const delP = (del.progress || []).map(String).filter(Boolean);
  const delS = (del.srs || []).map(String).filter(Boolean);
  for (const part of chunks(delP, IN_CHUNK)) {
    await env.DB.prepare('DELETE FROM progress WHERE user_id = ? AND word_id IN (' +
      part.map(function () { return '?'; }).join(',') + ')').bind(userId, ...part).run();
  }
  for (const part of chunks(delS, IN_CHUNK)) {
    await env.DB.prepare('DELETE FROM srs WHERE user_id = ? AND skey IN (' +
      part.map(function () { return '?'; }).join(',') + ')').bind(userId, ...part).run();
  }

  const inP = body.progress || {};
  const inD = body.daily || {};
  const inS = body.srs || {};
  const ids = Object.keys(inP);

  // 1) 先读回同 id 的现有行，算出合并结果
  const merged = {};
  for (const part of chunks(ids, IN_CHUNK)) {
    const cur = await env.DB.prepare('SELECT * FROM progress WHERE user_id = ? AND word_id IN (' +
      part.map(function () { return '?'; }).join(',') + ')').bind(userId, ...part).all();
    (cur.results || []).forEach(function (r) {
      merged[r.word_id] = {
        w: r.w, r: r.r, seen: r.seen, fav: !!r.fav, master: !!r.master, ts: r.ts,
        word: r.word || '', src: r.src || '', brief: r.brief || '',
        note: r.note || '', noteTs: r.note_ts || 0
      };
    });
  }
  ids.forEach(function (id) {
    merged[id] = mergeProgress(inP[id], merged[id] || null);
  });

  // 2) 写回（分段 batch，避免单条 SQL 变量过多 / 语句过多）
  const upRows = Object.keys(merged).map(function (id) { return { id: id, rec: merged[id] }; });
  for (const part of chunks(upRows, UP_CHUNK)) {
    await env.DB.batch(part.map(function (row) {
      const r = row.rec;
      return env.DB.prepare(
        'INSERT INTO progress (user_id,word_id,w,r,seen,fav,master,ts,word,src,brief,note,note_ts) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ' +
        'ON CONFLICT(user_id,word_id) DO UPDATE SET ' +
        'w=excluded.w, r=excluded.r, seen=excluded.seen, fav=excluded.fav, master=excluded.master, ' +
        'ts=excluded.ts, word=excluded.word, src=excluded.src, brief=excluded.brief, ' +
        'note=excluded.note, note_ts=excluded.note_ts')
        .bind(userId, row.id, r.w || 0, r.r || 0, r.seen || 0, r.fav ? 1 : 0, r.master ? 1 : 0,
              r.ts || 0, r.word || '', r.src || '', r.brief || '', r.note || '', r.noteTs || 0);
    }));
  }

  const days = Object.keys(inD);
  const mergedDaily = {};
  for (const part of chunks(days, IN_CHUNK)) {
    const cur = await env.DB.prepare('SELECT * FROM daily WHERE user_id = ? AND day IN (' +
      part.map(function () { return '?'; }).join(',') + ')').bind(userId, ...part).all();
    (cur.results || []).forEach(function (r) { mergedDaily[r.day] = { done: r.done, right: r.right }; });
  }
  days.forEach(function (day) { mergedDaily[day] = mergeDaily(inD[day], mergedDaily[day] || null); });
  const dRows = Object.keys(mergedDaily);
  for (const part of chunks(dRows, UP_CHUNK)) {
    await env.DB.batch(part.map(function (day) {
      const r = mergedDaily[day];
      return env.DB.prepare(
        'INSERT INTO daily (user_id,day,done,right) VALUES (?,?,?,?) ' +
        'ON CONFLICT(user_id,day) DO UPDATE SET done=excluded.done, right=excluded.right')
        .bind(userId, day, r.done || 0, r.right || 0);
    }));
  }

  const keys = Object.keys(inS);
  const mergedSrs = {};
  for (const part of chunks(keys, IN_CHUNK)) {
    const cur = await env.DB.prepare('SELECT * FROM srs WHERE user_id = ? AND skey IN (' +
      part.map(function () { return '?'; }).join(',') + ')').bind(userId, ...part).all();
    (cur.results || []).forEach(function (r) {
      mergedSrs[r.skey] = { w: r.w || '', s: r.s || '', m: r.m || '', b: r.b, d: r.d || '', ts: r.ts,
                            ok: r.ok, bad: r.bad, lapses: r.lapses };
    });
  }
  keys.forEach(function (k) { mergedSrs[k] = mergeSrs(inS[k], mergedSrs[k] || null); });
  const sRows = Object.keys(mergedSrs);
  for (const part of chunks(sRows, UP_CHUNK)) {
    await env.DB.batch(part.map(function (k) {
      const r = mergedSrs[k];
      return env.DB.prepare(
        'INSERT INTO srs (user_id,skey,w,s,m,b,d,ts,ok,bad,lapses) VALUES (?,?,?,?,?,?,?,?,?,?,?) ' +
        'ON CONFLICT(user_id,skey) DO UPDATE SET w=excluded.w, s=excluded.s, m=excluded.m, ' +
        'b=excluded.b, d=excluded.d, ts=excluded.ts, ok=excluded.ok, bad=excluded.bad, lapses=excluded.lapses')
        .bind(userId, k, r.w || '', r.s || '', r.m || '', r.b || 0, r.d || '', r.ts || 0,
              r.ok || 0, r.bad || 0, r.lapses || 0);
    }));
  }

  const syncedAt = Date.now();
  await env.DB.prepare('UPDATE users SET synced_at = ?, last_seen = ? WHERE id = ?')
    .bind(syncedAt, syncedAt, userId).run();
  return syncedAt;
}

/* ------------------------------------------------------------- 路由处理 */

async function handleRegister(req, env) {
  const body = await readJson(req);
  // 配了邮件服务就强制走验证码注册，防止裸接口绕过邮箱验证
  if (env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY) {
    return fail('该后端已开启邮箱验证，请先获取验证码再注册', 400);
  }
  const email = normEmail(body.email);
  const password = String(body.password || '');
  if (!validEmail(email)) return fail('邮箱格式不正确');
  if (password.length < 6) return fail('密码至少 6 位');
  if (password.length > 200) return fail('密码过长');

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return fail('该邮箱已注册，请直接登录', 409);

  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    email: email,
    pass_hash: await hashPassword(password),
    name: String(body.name || '').slice(0, 40),
    created_at: now,
    last_seen: now,
    synced_at: 0
  };
  await env.DB.prepare(
    'INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) VALUES (?,?,?,?,?,?,?)')
    .bind(user.id, user.email, user.pass_hash, user.name, user.created_at, user.last_seen, 0).run();

  const token = newToken();
  await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(token, user.id, now, now + TOKEN_TTL_MS).run();

  return jsonBody({ token: token, user: publicUser(user, env) });
}

async function handleLogin(req, env) {
  const body = await readJson(req);
  const email = normEmail(body.email);
  const password = String(body.password || '');
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  // 用户不存在与密码错误返回同一句话，避免暴露邮箱是否已注册
  if (!user) return fail('邮箱或密码不正确', 401);
  const ok = await verifyPassword(password, user.pass_hash);
  if (!ok) return fail('邮箱或密码不正确', 401);

  const now = Date.now();
  const token = newToken();
  await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(token, user.id, now, now + TOKEN_TTL_MS).run();
  await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, user.id).run();
  return jsonBody({ token: token, user: publicUser(user, env) });
}

/* ------------------------------------------------------------- 邮箱验证码
 * 注册验证码流程（Mailjet 邮件 API 发信，免费 6000 封/月、注册无电话认证、
 * 单发件人地址验证不需要域名）。设计：
 *  - 验证码不落明文：存 sha256(code + email)，泄露库也推不回码
 *  - 10 分钟有效、同一邮箱 60 秒一次、最多校验 5 次（防爆破）
 *  - env.MAILJET_API_KEY/MAILJET_SECRET_KEY 未配置时此流程关闭，/api/register（免码注册）
 *    照常可用，/api/register/start 明确报「未启用」——前端据此回退到免码注册。
 *  - purpose: 'register' 注册 / 'reset' 找回密码（同一张表，互不混用）
 */
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;

async function sha256Hex(text) {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(bits);
}

function genCode() {
  // 6 位数字码：crypto 随机、固定 6 位输出
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

async function sendMail(env, toEmail, subject, text) {
  // Mailjet v3.1：Basic 认证（API Key : Secret Key），一次一发，按 Messages[0].Status 判成败
  const auth = btoa(env.MAILJET_API_KEY + ':' + env.MAILJET_SECRET_KEY);
  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: env.MAIL_FROM, Name: env.MAIL_FROM_NAME || '英语学习站' },
        To: [{ Email: toEmail }],
        Subject: subject,
        TextPart: text
      }]
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(function () { return ''; });
    throw new Error('mailjet ' + res.status + ' ' + detail.slice(0, 200));
  }
  const out = await res.json().catch(function () { return null; });
  const st = out && out.Messages && out.Messages[0] && out.Messages[0].Status;
  if (st && st !== 'success') {
    throw new Error('mailjet 发送失败 ' + JSON.stringify(out.Messages[0]).slice(0, 200));
  }
}

/* 发码公共体：限流 + 存哈希 + 发信。返回 null=成功，string=错误文案 */
async function issueCode(env, email, purpose) {
  if (!env.MAILJET_API_KEY || !env.MAILJET_SECRET_KEY || !env.MAIL_FROM) return '邮箱验证未启用';
  const now = Date.now();
  const row = await env.DB.prepare('SELECT * FROM email_codes WHERE email = ? AND purpose = ?')
    .bind(email, purpose).first();
  if (row && now - row.created_at < CODE_RESEND_MS) return '发送太频繁，请稍后再试';

  const code = genCode();
  const codeHash = await sha256Hex(code + '|' + email + '|' + purpose);
  await env.DB.prepare(
    'INSERT INTO email_codes (email,purpose,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,0,?) ' +
    'ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, ' +
    'attempts=0, created_at=excluded.created_at')
    .bind(email, purpose, codeHash, now + CODE_TTL_MS, now).run();

  const label = purpose === 'reset' ? '找回密码' : '注册';
  await sendMail(env, email,
    '【英语学习站】' + label + '验证码：' + code,
    '你的' + label + '验证码是：' + code + '\n\n10 分钟内有效。如果不是你本人操作，请忽略本邮件。\n\n— 英语学习站');
  return null;
}

/* 校验公共体：返回 null=通过，string=错误文案。通过后立即删码（一次性）。 */
async function consumeCode(env, email, purpose, code) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT * FROM email_codes WHERE email = ? AND purpose = ?')
    .bind(email, purpose).first();
  if (!row) return '请先获取验证码';
  if (now > row.expires_at) {
    await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).run();
    return '验证码已过期，请重新获取';
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) return '错误次数过多，请重新获取验证码';
  const ok = (await sha256Hex(String(code || '') + '|' + email + '|' + purpose)) === row.code_hash;
  if (!ok) {
    await env.DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?')
      .bind(email, purpose).run();
    return '验证码不正确';
  }
  await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).run();
  return null;
}

/* POST /api/register/start  {email} -> {ok}；开启验证码后注册必须走这个流程 */
async function handleRegisterStart(req, env) {
  const body = await readJson(req);
  const email = normEmail(body.email);
  if (!validEmail(email)) return fail('邮箱格式不正确');
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return fail('该邮箱已注册，请直接登录', 409);
  const err = await issueCode(env, email, 'register');
  if (err) return fail(err, 400);
  return jsonBody({ ok: true, ttl: CODE_TTL_MS / 1000 });
}

/* POST /api/register/verify  {email, code, password, name?} -> {token, user} */
async function handleRegisterVerify(req, env) {
  const body = await readJson(req);
  const email = normEmail(body.email);
  const password = String(body.password || '');
  if (!validEmail(email)) return fail('邮箱格式不正确');
  if (password.length < 6) return fail('密码至少 6 位');
  if (password.length > 200) return fail('密码过长');

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return fail('该邮箱已注册，请直接登录', 409);
  const err = await consumeCode(env, email, 'register', body.code);
  if (err) return fail(err, 400);

  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    email: email,
    pass_hash: await hashPassword(password),
    name: String(body.name || '').slice(0, 40),
    created_at: now,
    last_seen: now,
    synced_at: 0
  };
  await env.DB.prepare(
    'INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) VALUES (?,?,?,?,?,?,?)')
    .bind(user.id, user.email, user.pass_hash, user.name, user.created_at, user.last_seen, 0).run();

  const token = newToken();
  await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(token, user.id, now, now + TOKEN_TTL_MS).run();

  return jsonBody({ token: token, user: publicUser(user, env) });
}

/* POST /api/reset/start  {email} -> {ok}（无论邮箱是否存在都返回 ok，避免枚举） */
async function handleResetStart(req, env) {
  const body = await readJson(req);
  const email = normEmail(body.email);
  if (!validEmail(email)) return fail('邮箱格式不正确');
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (user) {
    const err = await issueCode(env, email, 'reset');
    if (err) return fail(err, 400);
  }
  return jsonBody({ ok: true });
}

/* POST /api/reset/verify  {email, code, password} -> {ok} */
async function handleResetVerify(req, env) {
  const body = await readJson(req);
  const email = normEmail(body.email);
  const password = String(body.password || '');
  if (!validEmail(email)) return fail('邮箱格式不正确');
  if (password.length < 6) return fail('密码至少 6 位');
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return fail('邮箱或密码不正确', 401);
  const err = await consumeCode(env, email, 'reset', body.code);
  if (err) return fail(err, 400);

  await env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?')
    .bind(await hashPassword(password), user.id).run();
  // 密码改了，全部旧会话作废（防凭据被盗后继续用）
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  return jsonBody({ ok: true });
}

async function handleSync(req, env, auth) {
  const body = await readJson(req);
  const syncedAt = await applySync(env, auth.user.id, body);
  const all = await readAll(env, auth.user.id);
  return jsonBody({
    progress: all.progress, daily: all.daily, srs: all.srs, syncedAt: syncedAt
  });
}

async function handleAdminUsers(env) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.created_at, u.last_seen, u.synced_at, ' +
    ' (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.seen>0)               AS touched, ' +
    ' (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.w>0 AND p.master=0)   AS wrong, ' +
    ' (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.master=1)             AS mastered, ' +
    ' (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.fav=1)                AS fav, ' +
    ' (SELECT COUNT(*) FROM srs s WHERE s.user_id=u.id)                                 AS srs_total, ' +
    ' (SELECT COUNT(*) FROM srs s WHERE s.user_id=u.id AND s.d <= ?)                    AS srs_due ' +
    'FROM users u ORDER BY u.last_seen DESC LIMIT 1000').bind(today).all();
  return jsonBody({ users: rows.results || [] });
}

async function handleAdminUser(env, id) {
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!user) return fail('用户不存在', 404);
  const all = await readAll(env, id);
  return jsonBody({
    user: {
      id: user.id, email: user.email, name: user.name || '',
      createdAt: user.created_at, lastSeen: user.last_seen, syncedAt: user.synced_at
    },
    progress: all.progress, daily: all.daily, srs: all.srs
  });
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function handleAdminExport(env, id) {
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!user) return fail('用户不存在', 404);
  const all = await readAll(env, id);
  const lines = ['type,word_id,word,src,brief,wrong,right,seen,fav,master,srs_bucket,srs_due,ts'];
  Object.keys(all.progress).forEach(function (wid) {
    const p = all.progress[wid];
    const s = all.srs[String(p.word || '').toLowerCase()] || null;
    lines.push([
      'progress', wid, p.word, p.src, p.brief, p.w, p.r, p.seen,
      p.fav ? 1 : 0, p.master ? 1 : 0,
      s ? s.b : '', s ? s.d : '', p.ts
    ].map(csvCell).join(','));
  });
  Object.keys(all.srs).forEach(function (k) {
    const s = all.srs[k];
    if (all.progress[k] || all.progress[s.w]) return;   // 已在上面输出
    lines.push(['srs', '', s.w, s.s, s.m, '', '', '', '', '', s.b, s.d, s.ts].map(csvCell).join(','));
  });
  const csv = '\ufeff' + lines.join('\r\n');   // BOM：Excel 打开中文不乱码
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="progress-' + user.email.replace(/[^\w.-]/g, '_') + '.csv"'
    }
  });
}

/* ----------------------------------------------------------- 根地址落地页 */

// 后端只提供 /api/* 接口，直接访问根地址原本会返回 404 JSON，容易被误认为服务挂了。
// 这里给一个纯静态说明页（自包含、不引外部资源），顺便说明前端站点在哪。
function landingPage(host) {
  const site = 'https://sunfleeting-debug.github.io/EnglishLearningWebsite/';
  const html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<title>英语学习站 · 后端 API</title>\n'
    + '<style>\n'
    + ':root{--bg:#f6f7f9;--fg:#1f2328;--mut:#656d76;--card:#fff;--bd:#d8dee4;--ac:#0969da}\n'
    + 'html.dark{--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--card:#161b22;--bd:#30363d;--ac:#58a6ff}\n'
    + 'body{margin:0;padding:32px 20px;background:var(--bg);color:var(--fg);'
    + 'font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}\n'
    + 'main{max-width:720px;margin:0 auto}\n'
    + '.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:24px 26px}\n'
    + 'h1{margin:0 0 6px;font-size:22px}\n'
    + '.ok{color:#1a7f37;margin:0 0 18px;font-weight:600}\n'
    + 'p{margin:10px 0}\n'
    + 'a{color:var(--ac)}\n'
    + 'code{background:rgba(127,127,127,.14);border-radius:5px;padding:1px 6px;font-size:13px}\n'
    + 'table{width:100%;border-collapse:collapse;margin:12px 0 4px;font-size:14px}\n'
    + 'td{padding:7px 8px;border-top:1px solid var(--bd);vertical-align:top}\n'
    + 'td:first-child{white-space:nowrap;color:var(--mut)}\n'
    + '.mut{color:var(--mut);font-size:13px}\n'
    + '</style>\n</head>\n<body>\n<main>\n'
    + '<div class="card">\n'
    + '<h1>英语学习站 · 后端 API</h1>\n'
    + '<p class="ok">服务正常运行中 ✅</p>\n'
    + '<p>这里<b>只有接口</b>，没有网页界面。请打开前端站点使用：</p>\n'
    + '<p><a href="' + site + '">' + site + '</a></p>\n'
    + '<p>所有接口路径都以 <code>/api/</code> 开头，请求与响应均为 JSON。</p>\n'
    + '<hr style="border:0;border-top:1px solid var(--bd);margin:20px 0">\n'
    + '<h2 style="font-size:16px;margin:0 0 4px">接口一览</h2>\n'
    + '<table>\n'
    + '<tr><td><code>GET /api/health</code></td><td>健康检查，无需登录</td></tr>\n'
    + '<tr><td><code>POST /api/register</code></td><td>注册（未配置邮件服务时的免码通道）</td></tr>\n'
    + '<tr><td><code>POST /api/register/start</code></td><td>发注册验证码（需配置 MAILJET_API_KEY / MAILJET_SECRET_KEY）</td></tr>\n'
    + '<tr><td><code>POST /api/register/verify</code></td><td>校验验证码并完成注册</td></tr>\n'
    + '<tr><td><code>POST /api/reset/start</code></td><td>发找回密码验证码</td></tr>\n'
    + '<tr><td><code>POST /api/reset/verify</code></td><td>校验验证码并重置密码</td></tr>\n'
    + '<tr><td><code>POST /api/login</code></td><td>登录，返回 token</td></tr>\n'
    + '<tr><td><code>POST /api/logout</code></td><td>登出，作废当前 token</td></tr>\n'
    + '<tr><td><code>GET /api/me</code></td><td>当前登录用户</td></tr>\n'
    + '<tr><td><code>GET /api/me/state</code></td><td>拉取全部进度（首次全量）</td></tr>\n'
    + '<tr><td><code>POST /api/me/sync</code></td><td>增量同步（含删除标记）</td></tr>\n'
    + '<tr><td><code>/api/admin/*</code></td><td>管理看板，仅管理员</td></tr>\n'
    + '</table>\n'
    + '<p class="mut">其他路径返回 404 JSON，属正常现象。</p>\n'
    + '</div>\n'
    + '<p class="mut" style="margin-top:14px">Host: <code>' + host + '</code></p>\n'
    + '</main>\n'
    + '<script>if(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)'
    + 'document.documentElement.className="dark";</script>\n'
    + '</body>\n</html>\n';

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

/* --------------------------------------------------------------- 入口 */

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    const withCors = function (res) {
      const h = new Headers(res.headers);
      Object.keys(cors).forEach(function (k) { h.set(k, cors[k]); });
      return new Response(res.body, { status: res.status, headers: h });
    };

    try {
      // 根地址 / /api：给说明页，不落到下面 404 的「接口不存在」
      if ((path === '/' || path === '/api') && method === 'GET') return withCors(landingPage(url.host));

      if (!env.DB) return withCors(fail('后端未绑定 D1 数据库（检查 wrangler.toml 的 d1_databases）', 500));

      if (path === '/api/health' && method === 'GET') {
        return withCors(jsonBody({ ok: true, service: 'cet-words-api', time: Date.now() }));
      }

      if (path === '/api/register' && method === 'POST') return withCors(await handleRegister(request, env));
      if (path === '/api/login' && method === 'POST') return withCors(await handleLogin(request, env));
      if (path === '/api/register/start' && method === 'POST') return withCors(await handleRegisterStart(request, env));
      if (path === '/api/register/verify' && method === 'POST') return withCors(await handleRegisterVerify(request, env));
      if (path === '/api/reset/start' && method === 'POST') return withCors(await handleResetStart(request, env));
      if (path === '/api/reset/verify' && method === 'POST') return withCors(await handleResetVerify(request, env));

      // ---- 以下接口均需登录 ----
      const auth = await currentUser(request, env);
      const needAuth = path.indexOf('/api/me') === 0 || path.indexOf('/api/admin') === 0;
      if (needAuth && !auth) return withCors(fail('未登录或登录已过期', 401));

      if (path === '/api/logout' && method === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(auth.token).run();
        return withCors(jsonBody({ ok: true }));
      }

      if (path === '/api/me' && method === 'GET') {
        return withCors(jsonBody({ user: publicUser(auth.user, env) }));
      }

      if (path === '/api/me/state' && method === 'GET') {
        const all = await readAll(env, auth.user.id);
        return withCors(jsonBody({
          progress: all.progress, daily: all.daily, srs: all.srs, syncedAt: auth.user.synced_at
        }));
      }

      if (path === '/api/me/sync' && method === 'POST') return withCors(await handleSync(request, env, auth));

      // ---- 管理接口 ----
      if (path.indexOf('/api/admin') === 0) {
        if (!isAdmin(env, auth.user)) return withCors(fail('需要管理员权限', 403));

        if (path === '/api/admin/users' && method === 'GET') return withCors(await handleAdminUsers(env));

        const m = /^\/api\/admin\/users\/([^/]+)(?:\/(password|export))?$/.exec(path);
        if (m) {
          const uid = decodeURIComponent(m[1]);
          if (!m[2] && method === 'GET') return withCors(await handleAdminUser(env, uid));
          if (m[2] === 'export' && method === 'GET') return withCors(await handleAdminExport(env, uid));
          if (m[2] === 'password' && method === 'POST') {
            const body = await readJson(request);
            const pw = String(body.password || '');
            if (pw.length < 6) return withCors(fail('密码至少 6 位'));
            const hash = await hashPassword(pw);
            await env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(hash, uid).run();
            await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();  // 让旧会话失效
            return withCors(jsonBody({ ok: true }));
          }
          return withCors(fail('方法不允许', 405));
        }
      }

      return withCors(fail('接口不存在：' + path, 404));
    } catch (e) {
      return withCors(fail((e && e.message) || '服务器内部错误', 500));
    }
  }
};
