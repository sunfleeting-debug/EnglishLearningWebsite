#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""本地 mock 后端 —— 与 worker/index.js 实现**同一套接口与同一套合并规则**。

用途：真后端跑在 Cloudflare 上，本机没法自动化核验；这份纯 Python（标准库）的等价实现
让 `tools/verify_backend.py` 能在本地把「注册 → 练习 → 同步 → 换设备登录恢复 → 管理看板」
整条链路跑通。它不依赖 Node / wrangler。

用法：
    python tools/mock_api.py --port 8791 --admin admin@test.local
    python tools/mock_api.py --port 8791 --db tools/.cache/mock.sqlite   # 落盘，便于排查
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import secrets
import sqlite3
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "worker" / "schema.sql"

PBKDF2_ITER = 100000
TOKEN_TTL_MS = 30 * 24 * 3600 * 1000
MAX_BODY = 6 * 1024 * 1024

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


# --------------------------------------------------------------------------- 库
class DB:
    def __init__(self, path=":memory:"):
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        # 旧库文件升级：补 note/note_ts 列（列已存在会报错，忽略）
        for alt in ("ALTER TABLE progress ADD COLUMN note TEXT",
                    "ALTER TABLE progress ADD COLUMN note_ts INTEGER"):
            try:
                self.conn.execute(alt)
            except sqlite3.OperationalError:
                pass
        self.conn.commit()

    def q(self, sql, args=()):
        with self.lock:
            cur = self.conn.execute(sql, args)
            rows = [dict(r) for r in cur.fetchall()]
            self.conn.commit()
            return rows

    def one(self, sql, args=()):
        r = self.q(sql, args)
        return r[0] if r else None

    def run(self, sql, args=()):
        with self.lock:
            self.conn.execute(sql, args)
            self.conn.commit()


# --------------------------------------------------------------------- 口令
def hash_password(password):
    salt = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITER)
    return "pbkdf2$%d$%s$%s" % (PBKDF2_ITER, salt.hex(), h.hex())


def verify_password(password, stored):
    parts = str(stored or "").split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2":
        return False
    it = int(parts[1])
    salt = bytes.fromhex(parts[2])
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, it)
    return secrets.compare_digest(h.hex(), parts[3])


# ------------------------------------------------------------------- 合并规则
def merge_progress(a, b):
    # 🔴 任何一边可能缺字段（首条插入时 cur 为 None、老客户端不带 note），
    #    输出必须永远是全字段记录，否则 INSERT 取键直接 KeyError。
    a = a or {}
    b = b or {}
    # 平局（两边 ts 相同，典型如首条插入时 b 为空对象）偏向 a = 客户端刚推来的记录
    newer, older = (a, b) if (a.get("ts") or 0) >= (b.get("ts") or 0) else (b, a)
    note_from_a = (a.get("noteTs") or 0) >= (b.get("noteTs") or 0)
    return {
        "w": max(a.get("w") or 0, b.get("w") or 0),
        "r": max(a.get("r") or 0, b.get("r") or 0),
        "seen": max(a.get("seen") or 0, b.get("seen") or 0),
        "fav": bool(newer.get("fav")),
        "master": bool(newer.get("master")),
        "ts": max(a.get("ts") or 0, b.get("ts") or 0),
        "word": newer.get("word") or older.get("word") or "",
        "src": newer.get("src") or older.get("src") or "",
        "brief": newer.get("brief") or older.get("brief") or "",
        # 笔记取 note_ts 较新的一方（与 worker/index.js mergeProgress 保持一致）
        "note": (a.get("note") or "") if note_from_a else (b.get("note") or ""),
        "noteTs": max(a.get("noteTs") or 0, b.get("noteTs") or 0),
    }


def merge_daily(a, b):
    a = a or {}
    b = b or {}
    return {"done": max(a.get("done") or 0, b.get("done") or 0),
            "right": max(a.get("right") or 0, b.get("right") or 0)}


def merge_srs(a, b):
    if not a:
        return b
    if not b:
        return a
    return a if (a.get("ts") or 0) >= (b.get("ts") or 0) else b


# --------------------------------------------------------------------- 服务
class App:
    def __init__(self, db, admin_emails):
        self.db = db
        self.admin_emails = {e.strip().lower() for e in admin_emails if e.strip()}

    # ---- 辅助 ----
    def is_admin(self, user):
        return (user or {}).get("email", "").lower() in self.admin_emails

    def public_user(self, u):
        return {"id": u["id"], "email": u["email"], "name": u["name"] or "",
                "createdAt": u["created_at"], "admin": self.is_admin(u)}

    def user_by_token(self, token):
        if not token:
            return None
        s = self.db.one("SELECT * FROM sessions WHERE token=?", (token,))
        if not s:
            return None
        if s["expires_at"] < int(time.time() * 1000):
            self.db.run("DELETE FROM sessions WHERE token=?", (token,))
            return None
        u = self.db.one("SELECT * FROM users WHERE id=?", (s["user_id"],))
        return {"user": u, "token": token} if u else None

    def read_all(self, uid):
        progress, daily, srs = {}, {}, {}
        for r in self.db.q("SELECT * FROM progress WHERE user_id=?", (uid,)):
            progress[r["word_id"]] = {"w": r["w"], "r": r["r"], "seen": r["seen"],
                                      "fav": bool(r["fav"]), "master": bool(r["master"]),
                                      "ts": r["ts"], "word": r["word"] or "",
                                      "src": r["src"] or "", "brief": r["brief"] or "",
                                      "note": r["note"] or "", "noteTs": r["note_ts"] or 0}
        for r in self.db.q("SELECT * FROM daily WHERE user_id=?", (uid,)):
            daily[r["day"]] = {"done": r["done"], "right": r["right"]}
        for r in self.db.q("SELECT * FROM srs WHERE user_id=?", (uid,)):
            srs[r["skey"]] = {"w": r["w"] or "", "s": r["s"] or "", "m": r["m"] or "",
                              "b": r["b"], "d": r["d"] or "", "ts": r["ts"],
                              "ok": r["ok"], "bad": r["bad"], "lapses": r["lapses"]}
        return {"progress": progress, "daily": daily, "srs": srs}

    def apply_sync(self, uid, body):
        for scope in (body.get("clear") or []):
            if scope == "progress":
                self.db.run("DELETE FROM progress WHERE user_id=?", (uid,))
            elif scope == "daily":
                self.db.run("DELETE FROM daily WHERE user_id=?", (uid,))
            elif scope == "srs":
                self.db.run("DELETE FROM srs WHERE user_id=?", (uid,))

        deleted = body.get("deleted") or {}
        for wid in (deleted.get("progress") or []):
            self.db.run("DELETE FROM progress WHERE user_id=? AND word_id=?", (uid, str(wid)))
        for k in (deleted.get("srs") or []):
            self.db.run("DELETE FROM srs WHERE user_id=? AND skey=?", (uid, str(k)))

        for wid, rec in (body.get("progress") or {}).items():
            cur = self.db.one("SELECT * FROM progress WHERE user_id=? AND word_id=?", (uid, wid))
            cur = None if not cur else {"w": cur["w"], "r": cur["r"], "seen": cur["seen"],
                                        "fav": bool(cur["fav"]), "master": bool(cur["master"]),
                                        "ts": cur["ts"], "word": cur["word"] or "",
                                        "src": cur["src"] or "", "brief": cur["brief"] or "",
                                        "note": cur["note"] or "", "noteTs": cur["note_ts"] or 0}
            m = merge_progress(rec, cur)
            self.db.run(
                "INSERT INTO progress (user_id,word_id,w,r,seen,fav,master,ts,word,src,brief,note,note_ts) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,word_id) DO UPDATE SET "
                "w=excluded.w, r=excluded.r, seen=excluded.seen, fav=excluded.fav, master=excluded.master, "
                "ts=excluded.ts, word=excluded.word, src=excluded.src, brief=excluded.brief, "
                "note=excluded.note, note_ts=excluded.note_ts",
                (uid, wid, m["w"], m["r"], m["seen"], 1 if m["fav"] else 0, 1 if m["master"] else 0,
                 m["ts"], m["word"], m["src"], m["brief"], m["note"], m["noteTs"]))

        for day, rec in (body.get("daily") or {}).items():
            cur = self.db.one("SELECT * FROM daily WHERE user_id=? AND day=?", (uid, day))
            m = merge_daily(rec, dict(cur) if cur else None)
            self.db.run(
                "INSERT INTO daily (user_id,day,done,right) VALUES (?,?,?,?) "
                "ON CONFLICT(user_id,day) DO UPDATE SET done=excluded.done, right=excluded.right",
                (uid, day, m["done"], m["right"]))

        for k, rec in (body.get("srs") or {}).items():
            cur = self.db.one("SELECT * FROM srs WHERE user_id=? AND skey=?", (uid, k))
            cur = None if not cur else {"w": cur["w"] or "", "s": cur["s"] or "", "m": cur["m"] or "",
                                        "b": cur["b"], "d": cur["d"] or "", "ts": cur["ts"],
                                        "ok": cur["ok"], "bad": cur["bad"], "lapses": cur["lapses"]}
            m = merge_srs(rec, cur)
            self.db.run(
                "INSERT INTO srs (user_id,skey,w,s,m,b,d,ts,ok,bad,lapses) VALUES (?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(user_id,skey) DO UPDATE SET w=excluded.w, s=excluded.s, m=excluded.m, "
                "b=excluded.b, d=excluded.d, ts=excluded.ts, ok=excluded.ok, bad=excluded.bad, lapses=excluded.lapses",
                (uid, k, m.get("w") or "", m.get("s") or "", m.get("m") or "",
                 m.get("b") or 0, m.get("d") or "", m.get("ts") or 0,
                 m.get("ok") or 0, m.get("bad") or 0, m.get("lapses") or 0))

        now = int(time.time() * 1000)
        self.db.run("UPDATE users SET synced_at=?, last_seen=? WHERE id=?", (now, now, uid))
        return now


def csv_cell(v):
    s = "" if v is None else str(v)
    return '"' + s.replace('"', '""') + '"' if re.search(r'[",\n\r]', s) else s


# --------------------------------------------------------------------- HTTP
def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "cet-mock/1.0"

        def log_message(self, *a):
            pass

        # ---- 输出 ----
        def _send(self, body_bytes, status, ctype):
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
            self.send_header("Access-Control-Max-Age", "86400")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body_bytes)

        def js(self, obj, status=200):
            self._send(json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                       status, "application/json; charset=utf-8")

        def fail(self, msg, status=400):
            self.js({"error": msg}, status)

        def body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                raise ValueError("请求体过大")
            raw = self.rfile.read(n) if n else b""
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))

        def token(self, query):
            auth = self.headers.get("Authorization") or ""
            t = re.sub(r"^Bearer\s+", "", auth, flags=re.I).strip()
            if not t:
                t = (query.get("token") or [""])[0]
            return t

        # ---- 方法 ----
        def do_OPTIONS(self):
            self._send(b"", 204, "text/plain")

        def do_GET(self):
            self.route("GET")

        def do_POST(self):
            self.route("POST")

        def route(self, method):
            u = urlparse(self.path)
            path = u.path.rstrip("/") or "/"
            query = parse_qs(u.query)
            try:
                if path == "/api/health":
                    return self.js({"ok": True, "service": "cet-words-api", "time": int(time.time() * 1000)})

                if path == "/api/register" and method == "POST":
                    return self.register()
                if path == "/api/login" and method == "POST":
                    return self.login()
                if path == "/api/register/start" and method == "POST":
                    return self.register_start()
                if path == "/api/register/verify" and method == "POST":
                    return self.register_verify()
                if path == "/api/reset/start" and method == "POST":
                    return self.reset_start()
                if path == "/api/reset/verify" and method == "POST":
                    return self.reset_verify()

                need_auth = path.startswith("/api/me") or path.startswith("/api/admin")
                auth = app.user_by_token(self.token(query)) if need_auth else None
                if need_auth and not auth:
                    return self.fail("未登录或登录已过期", 401)

                if path == "/api/logout" and method == "POST":
                    app.db.run("DELETE FROM sessions WHERE token=?", (auth["token"],))
                    return self.js({"ok": True})

                if path == "/api/me" and method == "GET":
                    return self.js({"user": app.public_user(auth["user"])})

                if path == "/api/me/state" and method == "GET":
                    all_ = app.read_all(auth["user"]["id"])
                    return self.js({**all_, "syncedAt": auth["user"]["synced_at"]})

                if path == "/api/me/sync" and method == "POST":
                    body = self.body()
                    synced = app.apply_sync(auth["user"]["id"], body)
                    all_ = app.read_all(auth["user"]["id"])
                    return self.js({**all_, "syncedAt": synced})

                if path.startswith("/api/admin"):
                    if not app.is_admin(auth["user"]):
                        return self.fail("需要管理员权限", 403)
                    if path == "/api/admin/users" and method == "GET":
                        return self.admin_users()
                    m = re.match(r"^/api/admin/users/([^/]+)(?:/(password|export))?$", path)
                    if m:
                        uid = unquote(m.group(1))
                        if not m.group(2) and method == "GET":
                            return self.admin_user(uid)
                        if m.group(2) == "export" and method == "GET":
                            return self.admin_export(uid)
                        if m.group(2) == "password" and method == "POST":
                            pw = str(self.body().get("password") or "")
                            if len(pw) < 6:
                                return self.fail("密码至少 6 位")
                            app.db.run("UPDATE users SET pass_hash=? WHERE id=?", (hash_password(pw), uid))
                            app.db.run("DELETE FROM sessions WHERE user_id=?", (uid,))
                            return self.js({"ok": True})
                    return self.fail("方法不允许", 405)

                return self.fail("接口不存在：%s" % path, 404)
            except Exception as e:  # noqa: BLE001
                return self.fail(str(e) or "服务器内部错误", 500)

        # ---- 业务 ----
        def register(self):
            body = self.body()
            email = str(body.get("email") or "").strip().lower()
            pw = str(body.get("password") or "")
            if not EMAIL_RE.match(email or ""):
                return self.fail("邮箱格式不正确")
            if len(pw) < 6:
                return self.fail("密码至少 6 位")
            if app.db.one("SELECT id FROM users WHERE email=?", (email,)):
                return self.fail("该邮箱已注册，请直接登录", 409)
            now = int(time.time() * 1000)
            uid = str(uuid.uuid4())
            app.db.run("INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) "
                       "VALUES (?,?,?,?,?,?,0)",
                       (uid, email, hash_password(pw), str(body.get("name") or "")[:40], now, now))
            tok = secrets.token_hex(32)
            app.db.run("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)",
                       (tok, uid, now, now + TOKEN_TTL_MS))
            user = app.db.one("SELECT * FROM users WHERE id=?", (uid,))
            return self.js({"token": tok, "user": app.public_user(user)})

        def login(self):
            body = self.body()
            email = str(body.get("email") or "").strip().lower()
            pw = str(body.get("password") or "")
            user = app.db.one("SELECT * FROM users WHERE email=?", (email,))
            if not user or not verify_password(pw, user["pass_hash"]):
                return self.fail("邮箱或密码不正确", 401)
            now = int(time.time() * 1000)
            tok = secrets.token_hex(32)
            app.db.run("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)",
                       (tok, user["id"], now, now + TOKEN_TTL_MS))
            app.db.run("UPDATE users SET last_seen=? WHERE id=?", (now, user["id"]))
            return self.js({"token": tok, "user": app.public_user(user)})

        # ---- 邮箱验证码（与 worker/index.js 同一套规则；mock 不发邮件，devCode 仅供测试） ----
        CODE_TTL_MS = 10 * 60 * 1000
        CODE_RESEND_MS = 60 * 1000
        CODE_MAX_ATTEMPTS = 5

        def issue_code(self, email, purpose):
            now = int(time.time() * 1000)
            row = app.db.one("SELECT * FROM email_codes WHERE email=? AND purpose=?", (email, purpose))
            if row and now - row["created_at"] < self.CODE_RESEND_MS:
                return "发送太频繁，请稍后再试"
            code = "".join(secrets.choice("0123456789") for _ in range(6))
            code_hash = hashlib.sha256(f"{code}|{email}|{purpose}".encode()).hexdigest()
            app.db.run(
                "INSERT INTO email_codes (email,purpose,code_hash,expires_at,attempts,created_at) "
                "VALUES (?,?,?,?,0,?) ON CONFLICT(email,purpose) DO UPDATE SET "
                "code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, created_at=excluded.created_at",
                (email, purpose, code_hash, now + self.CODE_TTL_MS, now))
            return code

        def consume_code(self, email, purpose, code):
            now = int(time.time() * 1000)
            row = app.db.one("SELECT * FROM email_codes WHERE email=? AND purpose=?", (email, purpose))
            if not row:
                return "请先获取验证码"
            if now > row["expires_at"]:
                app.db.run("DELETE FROM email_codes WHERE email=? AND purpose=?", (email, purpose))
                return "验证码已过期，请重新获取"
            if row["attempts"] >= self.CODE_MAX_ATTEMPTS:
                return "错误次数过多，请重新获取验证码"
            if hashlib.sha256(f"{code}|{email}|{purpose}".encode()).hexdigest() != row["code_hash"]:
                app.db.run("UPDATE email_codes SET attempts=attempts+1 WHERE email=? AND purpose=?", (email, purpose))
                return "验证码不正确"
            app.db.run("DELETE FROM email_codes WHERE email=? AND purpose=?", (email, purpose))
            return None

        def register_start(self):
            body = self.body()
            email = str(body.get("email") or "").strip().lower()
            if not EMAIL_RE.match(email or ""):
                return self.fail("邮箱格式不正确")
            if app.db.one("SELECT id FROM users WHERE email=?", (email,)):
                return self.fail("该邮箱已注册，请直接登录", 409)
            code = self.issue_code(email, "register")
            if isinstance(code, str) and code in ("发送太频繁，请稍后再试",):
                return self.fail(code)
            # 🔴 仅 mock 返回 devCode（真后端发邮件、无此字段）；verify_backend 用它走通注册链
            return self.js({"ok": True, "ttl": self.CODE_TTL_MS // 1000, "devCode": code})

        def register_verify(self):
            body = self.body()
            email = str(body.get("email") or "").strip().lower()
            pw = str(body.get("password") or "")
            if not EMAIL_RE.match(email or ""):
                return self.fail("邮箱格式不正确")
            if len(pw) < 6:
                return self.fail("密码至少 6 位")
            if app.db.one("SELECT id FROM users WHERE email=?", (email,)):
                return self.fail("该邮箱已注册，请直接登录", 409)
            err = self.consume_code(email, "register", str(body.get("code") or ""))
            if err:
                return self.fail(err)
            now = int(time.time() * 1000)
            uid = str(uuid.uuid4())
            app.db.run("INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) "
                       "VALUES (?,?,?,?,?,?,0)",
                       (uid, email, hash_password(pw), str(body.get("name") or "")[:40], now, now))
            tok = secrets.token_hex(32)
            app.db.run("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)",
                       (tok, uid, now, now + TOKEN_TTL_MS))
            user = app.db.one("SELECT * FROM users WHERE id=?", (uid,))
            return self.js({"token": tok, "user": app.public_user(user)})

        def reset_start(self):
            body = self.body()
            email = str(body.get("email") or "").strip().lower()
            if not EMAIL_RE.match(email or ""):
                return self.fail("邮箱格式不正确")
            dev_code = None
            if app.db.one("SELECT id FROM users WHERE email=?", (email,)):
                code = self.issue_code(email, "reset")
                if isinstance(code, str) and code.startswith("发送太频繁"):
                    return self.fail(code)
                dev_code = code  # 🔴 仅 mock：真后端发邮件不带码，verify_backend 靠它走通找回链路
            return self.js({"ok": True, "devCode": dev_code})

        def reset_verify(self):
            body = self.body()
            email = str(body.get("email") or "").strip().lower()
            pw = str(body.get("password") or "")
            if not EMAIL_RE.match(email or ""):
                return self.fail("邮箱格式不正确")
            if len(pw) < 6:
                return self.fail("密码至少 6 位")
            user = app.db.one("SELECT * FROM users WHERE email=?", (email,))
            if not user:
                return self.fail("邮箱或密码不正确", 401)
            err = self.consume_code(email, "reset", str(body.get("code") or ""))
            if err:
                return self.fail(err)
            app.db.run("UPDATE users SET pass_hash=? WHERE id=?", (hash_password(pw), user["id"]))
            app.db.run("DELETE FROM sessions WHERE user_id=?", (user["id"],))
            return self.js({"ok": True})

        def admin_users(self):
            today = time.strftime("%Y-%m-%d")
            rows = app.db.q("""
                SELECT u.id, u.email, u.name, u.created_at, u.last_seen, u.synced_at,
                  (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.seen>0)             AS touched,
                  (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.w>0 AND p.master=0) AS wrong,
                  (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.master=1)           AS mastered,
                  (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id AND p.fav=1)              AS fav,
                  (SELECT COUNT(*) FROM srs s WHERE s.user_id=u.id)                               AS srs_total,
                  (SELECT COUNT(*) FROM srs s WHERE s.user_id=u.id AND s.d<=?)                    AS srs_due
                FROM users u ORDER BY u.last_seen DESC LIMIT 1000""", (today,))
            return self.js({"users": rows})

        def admin_user(self, uid):
            user = app.db.one("SELECT * FROM users WHERE id=?", (uid,))
            if not user:
                return self.fail("用户不存在", 404)
            all_ = app.read_all(uid)
            return self.js({
                "user": {"id": user["id"], "email": user["email"], "name": user["name"] or "",
                         "createdAt": user["created_at"], "lastSeen": user["last_seen"],
                         "syncedAt": user["synced_at"]},
                **all_})

        def admin_export(self, uid):
            user = app.db.one("SELECT * FROM users WHERE id=?", (uid,))
            if not user:
                return self.fail("用户不存在", 404)
            all_ = app.read_all(uid)
            lines = ["type,word_id,word,src,brief,wrong,right,seen,fav,master,srs_bucket,srs_due,ts"]
            for wid, p in all_["progress"].items():
                s = all_["srs"].get(str(p.get("word") or "").lower())
                lines.append(",".join(csv_cell(x) for x in [
                    "progress", wid, p["word"], p["src"], p["brief"], p["w"], p["r"], p["seen"],
                    1 if p["fav"] else 0, 1 if p["master"] else 0,
                    s["b"] if s else "", s["d"] if s else "", p["ts"]]))
            for k, s in all_["srs"].items():
                if k in all_["progress"] or s["w"] in all_["progress"]:
                    continue
                lines.append(",".join(csv_cell(x) for x in [
                    "srs", "", s["w"], s["s"], s["m"], "", "", "", "", "", s["b"], s["d"], s["ts"]]))
            data = ("\ufeff" + "\r\n".join(lines)).encode("utf-8")
            self._send(data, 200, "text/csv; charset=utf-8")

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8791)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--db", default=":memory:")
    ap.add_argument("--admin", default="admin@test.local",
                    help="管理员邮箱（逗号分隔），对应后端的 ADMIN_EMAILS")
    args = ap.parse_args()

    db = DB(args.db)
    app = App(db, args.admin.split(","))
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(app))
    print("mock api on http://%s:%d  (admin=%s)" % (args.host, args.port, args.admin), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
