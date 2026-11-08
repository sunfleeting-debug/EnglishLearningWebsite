# -*- coding: utf-8 -*-
"""核验「AI 配置（含 Key）云端存证」这条链路：加密、鉴权、后写覆盖、密文不可读
   ------------------------------------------------------------
   为什么要单独跑这个：前端单测只能证明「客户端把配置推上去了」，
   但「库里到底存的是明文还是密文」只有真的写一次生产库才能看出来。

   做法：造一个临时账号 → 登录拿 token → PUT/GET 来回 → 直接读 D1 里那一列 →
   确认它不含 sk- 明文、且形如 <ivB64>.<ctB64> → 删掉临时账号。

   用法：
     python tools/verify_ai_cfg_api.py
     BASE=https://api.sunfleeting.website python tools/verify_ai_cfg_api.py

   需要本机有 wrangler（读 D1 原始列）；没有 wrangler 就只跑 HTTP 部分。
"""
import base64
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import uuid

BASE = (os.environ.get("BASE") or "https://api.sunfleeting.website").rstrip("/")
PROXY = os.environ.get("SMOKE_PROXY", "")
def _find_wrangler():
    """wrangler 的 npx 缓存目录名是哈希，每次重装都会变 —— 不能写死。
    依次试：环境变量 WRANGLER > 所有 _npx/*/.../wrangler.cmd > 全局安装。"""
    env = os.environ.get("WRANGLER", "")
    if env and os.path.exists(env):
        return env
    pat = os.path.expanduser("~/AppData/Local/npm-cache/_npx/*/node_modules/.bin/wrangler.cmd")
    hits = sorted(glob.glob(pat), key=os.path.getmtime, reverse=True)
    if hits:
        return hits[0]
    for c in ("wrangler", "wrangler.cmd", "wrangler.exe"):
        p = shutil.which(c)
        if p:
            return p
    return "wrangler"


WRANGLER = _find_wrangler()
DB = os.environ.get("DB", "cet-words")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TOTAL = [0]
fails = []


def check(name, got, want, extra=""):
    TOTAL[0] += 1
    ok = got == want
    if not ok:
        fails.append(name)
    print(("  [OK]   " if ok else "  [FAIL] ") + name
          + ("  " + str(extra) if extra != "" else "")
          + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def opener():
    handlers = []
    if PROXY:
        handlers.append(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
    return urllib.request.build_opener(*handlers)


OP = opener()


def call(method, path, body=None, token=""):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36",
    })
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with OP.open(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def d1(sql):
    """跑一条远程 SQL，返回 wrangler 的 results 数组"""
    env = dict(os.environ)
    for k in list(env):
        if k.upper().endswith("PROXY"):
            env.pop(k, None)
    p = subprocess.run([WRANGLER, "d1", "execute", DB, "--remote", "--json", "--command", sql],
                       cwd=os.path.join(ROOT, "worker"), capture_output=True, text=True,
                       env=env, timeout=180)
    out = p.stdout or ""
    m = re.search(r"\[\s*\{.*\}\s*\]", out, re.S)
    if not m:
        raise RuntimeError("wrangler 输出无法解析：" + (out[-300:] or p.stderr[-300:]))
    data = json.loads(m.group(0))
    return data[0].get("results", [])


def pbkdf2_hash(password):
    salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return "pbkdf2$100000$%s$%s" % (salt.hex(), h.hex())


def main():
    email = "aicfg+%d@example.com" % int(time.time())
    password = "verify-" + uuid.uuid4().hex[:10]
    uid = str(uuid.uuid4())
    now = int(time.time() * 1000)
    print("目标：%s" % BASE)

    created = False
    try:
        d1("INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) "
           "VALUES ('%s','%s','%s','',%d,%d,0)" % (uid, email, pbkdf2_hash(password), now, now))
        created = True
        print("  临时账号：%s" % email)

        st, r = call("POST", "/api/login", {"email": email, "password": password})
        token = r.get("token", "")
        check("临时账号能登录", bool(token), True, "status=%s" % st)
        if not token:
            return 1

        # ---- 未登录拿不到 ----
        st, _ = call("GET", "/api/me/ai")
        check("未登录读云端配置 = 401", st, 401)

        # ---- 空态 ----
        st, r = call("GET", "/api/me/ai", token=token)
        check("新账号云端配置为空", [st, r.get("cfg"), r.get("at")], [200, None, 0])

        # ---- 写一次 ----
        secret = "sk-verify-DO-NOT-USE-%s" % uuid.uuid4().hex[:8]
        cfg = {"provider": "custom", "keys": {"custom": secret},
               "models": {"custom": "gpt-x"}, "baseUrl": "https://apihub.agnes-ai.com/v1",
               "via": "direct", "at": now}
        st, r = call("PUT", "/api/me/ai", {"cfg": cfg, "at": now}, token=token)
        check("写入云端配置 = 200", st, 200)

        st, r = call("GET", "/api/me/ai", token=token)
        check("读回的 Key 与写入一致", (r.get("cfg") or {}).get("keys", {}).get("custom"), secret)
        check("读回的其它字段也在", [(r.get("cfg") or {}).get("models", {}).get("custom"), r.get("at")],
              ["gpt-x", now])

        # ---- 库里的原始值必须是密文 ----
        rows = d1("SELECT ai_cfg, ai_cfg_at FROM users WHERE id = '%s'" % uid)
        blob = (rows[0].get("ai_cfg") if rows else "") or ""
        check("库里确实存了东西", len(blob) > 40, True, "%d 字节" % len(blob))
        check("库里不含明文 Key", secret in blob, False)
        check("库里不含明文接口地址", "agnes-ai" in blob, False)
        check("形如 <ivB64>.<ctB64>", bool(re.match(r"^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$", blob)), True)
        check("IV 是 12 字节", len(base64.b64decode(blob.split(".")[0])), 12)

        # ---- 后写覆盖：旧时间戳不许倒退 ----
        old = {"provider": "custom", "keys": {"custom": "sk-older"}, "models": {}, "baseUrl": "",
               "via": "direct", "at": now - 5000}
        st, r = call("PUT", "/api/me/ai", {"cfg": old, "at": now - 5000}, token=token)
        check("旧时间戳写入被拒（保留服务端）", r.get("kept"), "server", "status=%s" % st)
        st, r = call("GET", "/api/me/ai", token=token)
        check("读回仍是新的那把 Key", (r.get("cfg") or {}).get("keys", {}).get("custom"), secret)

        # ---- 新时间戳可以覆盖 ----
        newer = dict(cfg)
        newer["keys"] = {"custom": "sk-newer"}
        newer["at"] = now + 1000
        call("PUT", "/api/me/ai", {"cfg": newer, "at": now + 1000}, token=token)
        st, r = call("GET", "/api/me/ai", token=token)
        check("新时间戳能覆盖", (r.get("cfg") or {}).get("keys", {}).get("custom"), "sk-newer")

        # ---- 别人的 token 读不到你的 ----
        st, _ = call("GET", "/api/me/ai", token="bogus-token-0000")
        check("伪造 token 读不到 = 401", st, 401)
    finally:
        if created:
            try:
                d1("DELETE FROM users WHERE id = '%s'" % uid)
                d1("DELETE FROM sessions WHERE user_id = '%s'" % uid)
                print("  已清理临时账号")
            except Exception as e:
                print("  清理失败（手动删）：%s" % e)

    print("\n通过 %d / %d 项" % (TOTAL[0] - len(fails), TOTAL[0]))
    if fails:
        print("失败：" + "；".join(fails))
    return 0 if not fails else 1


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    os._exit(code)
