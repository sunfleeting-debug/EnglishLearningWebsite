# -*- coding: utf-8 -*-
"""线上后端冒烟测试：对**已部署的 Cloudflare Worker** 打真接口（纯标准库，无依赖）。

与 tools/verify_backend.py 的分工：
  · verify_backend.py —— 用本地 mock 后端跑完整浏览器流程（不碰线上，可天天跑）
  · smoke_api.py      —— 直接给线上 Worker 发 HTTP，确认「真的部署好了、数据真的落了库」

覆盖：健康检查 · 注册/登录 · 进度同步 · 合并取 max（幂等不回退）·
      删除与清空 · 会话持久 · 非管理员 403 · CORS 白名单 · 错误路径

用法：
    python tools/smoke_api.py                     # 地址取 assets/js/config.js 的 apiBase
    python tools/smoke_api.py https://xxx.workers.dev
    API_BASE=https://xxx.workers.dev python tools/smoke_api.py

注意：会在线上库里建一个一次性账号（smoke+<时间戳>@example.com）。
      跑完会打印清理用的 SQL，需要时手动执行：
      npx wrangler d1 execute cet-words --remote --command "DELETE FROM users WHERE email LIKE 'smoke+%'"
"""
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

checks = []


def log(msg):
    print(msg, flush=True)


def check(name, got, want=True, extra=""):
    ok = got == want
    checks.append((ok, name))
    log(("  [OK]   " if ok else "  [FAIL] ") + name
        + (("  " + str(extra)) if extra else "")
        + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def default_base():
    """从 assets/js/config.js 里读 apiBase，保证冒烟测试与站点用的是同一个地址"""
    p = ROOT / "assets" / "js" / "config.js"
    try:
        m = re.search(r"apiBase\s*:\s*['\"]([^'\"]*)['\"]", p.read_text(encoding="utf-8"))
        return (m.group(1).rstrip("/") if m else "")
    except Exception:
        return ""


# 🔴 代理策略：本机环境下 `*.workers.dev` **只有走代理才通**（直连 curl 返回 000/超时），
# 而 api.cloudflare.com 反而要 --noproxy 直连。这里默认沿用系统代理，
# 需要强制直连时设 SMOKE_DIRECT=1。
if os.environ.get("SMOKE_DIRECT"):
    OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    log("[i] SMOKE_DIRECT=1：已强制绕过代理直连")
else:
    OPENER = urllib.request.build_opener()


# 🔴 必须伪装 UA：Cloudflare 对 `Python-urllib/...` 直接回 403 `error code: 1010`
# （Browser Integrity Check），不是我们 Worker 的问题 —— 排查时别被这个 403 带偏。
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def _once(base, method, path, body, token, origin):
    url = base + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", UA)
    r.add_header("Accept", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    if origin:
        r.add_header("Origin", origin)
    try:
        with OPENER.open(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}"), resp.headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw or "{}"), e.headers
        except Exception:
            return e.code, {"raw": raw[:300]}, e.headers
    except Exception as e:
        return 0, {"error": str(e)}, {}


def req(base, method, path, body=None, token=None, origin=None, tries=4):
    """返回 (status, json_dict, headers)。HTTP 错误也返回状态码与响应体，不抛异常。

    🔴 传输层重试：本机到 *.workers.dev 的链路会间歇性断（同一请求 200/000 交替），
    status=0 一律当成网络抖动重试，别把它误判成后端故障。"""
    status, js, hd = 0, {}, {}
    for i in range(tries):
        status, js, hd = _once(base, method, path, body, token, origin)
        if status != 0:
            return status, js, hd
        time.sleep(0.8 * (i + 1))
    return status, js, hd


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("API_BASE") or default_base()).rstrip("/")
    if not base:
        log("没有后端地址：请传参，或先在 assets/js/config.js 里填 apiBase")
        return 3
    log("目标后端：%s\n" % base)

    email = "smoke+%d@example.com" % int(time.time())
    pwd = "smoke-pass-123"

    # ---------- 1) 健康检查 ----------
    log("--- 1) 健康检查与 CORS ---")
    PAGE_ORIGIN = "https://sunfleeting-debug.github.io"
    st, js, hd = req(base, "GET", "/api/health")
    check("GET /api/health = 200", st, 200)
    check("健康检查返回 ok:true", (js or {}).get("ok"), True)
    # 配了白名单后：只在 Origin 命中时回显，其它情况（含不带 Origin）一律不给 CORS 头
    st, _, hd_ok = req(base, "GET", "/api/health", origin=PAGE_ORIGIN)
    check("白名单来源回显自己的 Origin", hd_ok.get("Access-Control-Allow-Origin"), PAGE_ORIGIN)
    st2, _, hd2 = req(base, "GET", "/api/health", origin="https://evil.example.com")
    check("非白名单来源不给 CORS 头", hd2.get("Access-Control-Allow-Origin"), None)
    check("非白名单来源仍能拿到响应（浏览器侧才会拦）", st2, 200)
    st3, _, hd3 = req(base, "GET", "/api/health")
    check("不带 Origin 的请求（脚本/同源）不给 CORS 头",
          hd3.get("Access-Control-Allow-Origin"), None)

    # ---------- 2) 注册 / 登录 ----------
    log("\n--- 2) 注册与登录 ---")
    st, js, _ = req(base, "POST", "/api/register", {"email": email, "password": pwd})
    check("POST /api/register = 200", st, 200)
    token = (js or {}).get("token")
    check("注册返回登录令牌", bool(token), True)
    check("注册返回用户邮箱（小写存储）", ((js or {}).get("user") or {}).get("email"), email)
    # 字段名是 admin（不是 isAdmin）：前端 api.js 的 isAdmin() 也是读 u.admin
    check("普通邮箱 admin=false", ((js or {}).get("user") or {}).get("admin"), False)

    st, js, _ = req(base, "POST", "/api/register", {"email": email, "password": pwd})
    check("重复注册被拒绝", st >= 400, True, extra="status=%s" % st)

    st, js, _ = req(base, "POST", "/api/login", {"email": email, "password": "wrong-pass"})
    check("密码错误登录失败", st >= 400, True, extra="status=%s" % st)

    st, js, _ = req(base, "POST", "/api/login", {"email": email, "password": pwd})
    token2 = (js or {}).get("token")
    check("正确密码登录成功", bool(token2), True)

    st, js, _ = req(base, "GET", "/api/me", token=token2)
    check("GET /api/me 拿到自己的资料", ((js or {}).get("user") or {}).get("email"), email)

    st, js, _ = req(base, "GET", "/api/me", token="bogus-token")
    check("伪造令牌被拒（401）", st, 401)

    st, js, _ = req(base, "GET", "/api/admin/users", token=token2)
    check("普通用户访问管理接口 = 403", st, 403)

    # ---------- 3) 同步与合并 ----------
    log("\n--- 3) 进度同步与合并规则（取 max，不回退）---")
    wid = "week1:rare"
    day = time.strftime("%Y-%m-%d")
    st, js, _ = req(base, "POST", "/api/me/sync", {
        "progress": {wid: {"w": 2, "r": 5, "seen": 7, "fav": True, "master": False,
                           "ts": int(time.time() * 1000), "word": "rare", "src": "week1", "brief": "稀有的"}},
        "daily": {day: {"done": 7, "right": 5}},
        "srs": {"rare": {"w": "rare", "s": "week1", "m": "稀有的", "b": 1, "d": day,
                         "ts": int(time.time() * 1000), "ok": 5, "bad": 2}},
    }, token=token2)
    check("POST /api/me/sync = 200", st, 200)

    st, js, _ = req(base, "GET", "/api/me/state", token=token2)
    st_prog = (js or {}).get("progress") or {}
    check("同步后能读回该词", wid in st_prog, True)
    check("读回 w=2", (st_prog.get(wid) or {}).get("w"), 2)
    check("词面快照一起存下来（列表页不用回查词库）", (st_prog.get(wid) or {}).get("word"), "rare")
    check("收藏标记保留", (st_prog.get(wid) or {}).get("fav"), True)

    # 推一个更小的 w（模拟另一台设备只对了 1 次）：服务端应保持 max=2
    st, js, _ = req(base, "POST", "/api/me/sync", {
        "progress": {wid: {"w": 1, "r": 1, "seen": 1, "fav": False, "master": False,
                           "ts": int(time.time() * 1000), "word": "rare", "src": "week1", "brief": "稀有的"}},
    }, token=token2)
    check("再次同步（数值更小）= 200", st, 200)
    st, js, _ = req(base, "GET", "/api/me/state", token=token2)
    p = ((js or {}).get("progress") or {}).get(wid) or {}
    check("合并取 max：w 没有被小的覆盖", p.get("w"), 2)
    check("合并取 max：seen 没有被小的覆盖", p.get("seen"), 7)
    check("fav：时间戳更新者胜出（本次为 false）", p.get("fav"), False)

    # ---------- 4) 删除与清空 ----------
    log("\n--- 4) 删除 / 清空（避免全量上传复活已删记录）---")
    wid2 = "week1:assign"
    req(base, "POST", "/api/me/sync", {
        "progress": {wid2: {"w": 0, "r": 1, "seen": 1, "fav": False, "master": False,
                            "ts": int(time.time() * 1000), "word": "assign", "src": "week1", "brief": ""}},
    }, token=token2)
    st, js, _ = req(base, "GET", "/api/me/state", token=token2)
    check("第二个词已入库", wid2 in ((js or {}).get("progress") or {}), True)

    def short(js):
        """失败时把响应体带出来，避免只看到 status=0 无从下手"""
        return json.dumps(js, ensure_ascii=False)[:220]

    st, js, _ = req(base, "POST", "/api/me/sync", {"deleted": {"progress": [wid2]}}, token=token2)
    check("带 deleted 的同步 = 200", st, 200, extra=short(js) if st != 200 else "")
    st, js, _ = req(base, "GET", "/api/me/state", token=token2)
    check("删除生效：该词不在进度里", wid2 in ((js or {}).get("progress") or {}), False)

    st, js, _ = req(base, "POST", "/api/me/sync", {"clear": ["daily"]}, token=token2)
    check("带 clear 的同步 = 200", st, 200, extra=("resp=" + short(js)) if st != 200 else "")
    st, js, _ = req(base, "GET", "/api/me/state", token=token2)
    check("清空生效：daily 为空", len((js or {}).get("daily") or {}), 0)

    # ---------- 5) 数据真的落了库（换令牌重登也能读回）----------
    log("\n--- 5) 换一次登录也能读回同一份数据（确实落库了）---")
    st, js, _ = req(base, "POST", "/api/login", {"email": email, "password": pwd})
    t3 = (js or {}).get("token")
    st, js, _ = req(base, "GET", "/api/me/state", token=t3)
    check("重新登录后仍能读回进度", wid in ((js or {}).get("progress") or {}), True)

    st, js, _ = req(base, "POST", "/api/logout", token=t3)
    check("登出 = 200", st, 200)
    st, js, _ = req(base, "GET", "/api/me", token=t3)
    check("登出后旧令牌失效（401）", st, 401)

    # ---------- 6) 错误路径 ----------
    log("\n--- 6) 错误路径 ---")
    st, js, _ = req(base, "GET", "/api/nope")
    check("未知接口 = 404", st, 404)
    st, js, _ = req(base, "POST", "/api/register", {"email": "not-an-email", "password": pwd})
    check("非法邮箱被拒", st >= 400, True, extra="status=%s" % st)
    st, js, _ = req(base, "POST", "/api/register", {"email": "short@example.com", "password": "123"})
    check("密码过短被拒", st >= 400, True, extra="status=%s" % st)

    log("")
    failed = [n for ok, n in checks if not ok]
    log("失败 %d / 共 %d 项断言" % (len(failed), len(checks)))
    for n in failed:
        log("  - " + n)
    log("")
    log("清理（可选）：")
    log('  cd worker && npx wrangler d1 execute cet-words --remote \\')
    log("    --command \"DELETE FROM users WHERE email LIKE 'smoke+%'; DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users);\"")
    sys.stdout.flush()
    return 0 if not failed else 3


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
