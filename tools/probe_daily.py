# -*- coding: utf-8 -*-
"""线上 daily 往返探针：注册一次性用户 → 推 daily → 读回，验证线上 worker 是否丢 daily。
用法（关沙箱、走代理）：SMOKE_PROXY=http://127.0.0.1:7897 python tools/probe_daily.py
"""
import json, os, sys, time, urllib.request

BASE = "https://cet-words-api.sunfleeting.workers.dev"
PROXY = os.environ.get("SMOKE_PROXY", "")
DAY = time.strftime("%Y-%m-%d")


def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")  # Cloudflare 拦 Python-urllib
    if token:
        r.add_header("Authorization", "Bearer " + token)
    opener = urllib.request.build_opener()
    if PROXY:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({
            "http": PROXY, "https": PROXY}))
    with opener.open(r, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode())


def main():
    email = "dailyprobe-%d@test.local" % int(time.time())
    pwd = "probe12345"
    st, js = req("POST", "/api/register", {"email": email, "password": pwd})
    print("register:", st)
    token = js["token"]

    # 1) 推今天的 daily
    st, js = req("POST", "/api/me/sync", {
        "progress": {}, "srs": {}, "deleted": {"progress": [], "srs": []}, "clear": [],
        "daily": {DAY: {"done": 42, "right": 30}},
    }, token=token)
    print("sync(daily):", st, "响应里 daily =", json.dumps(js.get("daily", {}), ensure_ascii=False)[:200])

    # 2) 只推 progress（模拟练习中的增量同步，不带 daily）
    st, js = req("POST", "/api/me/sync", {
        "progress": {"week1:probe": {"w": 1, "r": 3, "seen": 4, "fav": False, "master": False,
                                     "ts": int(time.time() * 1000), "word": "probe",
                                     "src": "week1", "brief": ""}},
        "srs": {}, "deleted": {"progress": [], "srs": []}, "clear": [],
    }, token=token)
    print("sync(progress):", st, "响应里 daily =", json.dumps(js.get("daily", {}), ensure_ascii=False)[:200])

    # 3) 读全量状态
    st, js = req("GET", "/api/me/state", token=token)
    print("state:", st, "daily =", json.dumps(js.get("daily", {}), ensure_ascii=False)[:200])

    ok = (js.get("daily") or {}).get(DAY, {}).get("done") == 42
    print("\n结论：", "✅ 线上 daily 往返正常" if ok else "❌ 线上 worker 丢 daily —— 这就是统计为零的根因")


if __name__ == "__main__":
    main()
