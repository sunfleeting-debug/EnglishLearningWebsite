# -*- coding: utf-8 -*-
"""
从「六级词汇周计划音频」目录下的 lrc 字幕文件解析单词，抓取音标与中文释义，
生成网站所需的 data/words.json 与 data/books.json。

- 单词来源：lrc 的 [mm:ss.xx]word 行，保留时间轴（用于音频同步高亮）
- 释义来源：有道词典 jsonapi（含美/英音标 + 带词性的中文释义）
- 抓取结果按单词缓存到 tools/.cache/youdao/，重跑时直接复用，不重复请求
用法：
    python tools/build_data.py            # 正常构建（有缓存则复用）
    python tools/build_data.py --refresh  # 忽略缓存，全部重新抓取
    python tools/build_data.py --workers 8
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "六级词汇周计划音频")
OUT_DIR = os.path.join(ROOT, "data")
CACHE_DIR = os.path.join(ROOT, "tools", ".cache", "youdao")

LINE_RE = re.compile(r"^\[(\d{2}):(\d{2})\.(\d{2})\](.+?)\s*$")
# 认知词汇 lrc 用圈码 ①② 标记同形异义词，需从查询词中剥离
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"
CIRCLED_RE = re.compile("[" + CIRCLED + "]+$")


def clean_word(raw: str) -> str:
    """把字幕里的显示词规整成可查询的基础词形，并给出变体说明。

    处理三类写法：
      - 同形异义标记：bass① / bass②       -> bass
      - 拼写变体：specialize,-ise / cozy/cosy -> specialize / cozy
      - 编号：utter1 / utter2              -> utter
    """
    w = CIRCLED_RE.sub("", raw).strip()
    # 拼写变体：取第一个 token（, 或 / 分隔）
    w = re.split(r"[,/]", w)[0].strip()
    # 末尾编号
    w = re.sub(r"\d+$", "", w).strip()
    return w


def read_text(path: str) -> str:
    """读取文本，UTF-8 优先，失败回落 GB18030（部分 lrc 为 GBK 编码）。"""
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("gb18030", errors="replace")

# 书籍展示顺序与元信息
BOOK_META = {
    "week1": ("Week 1", "六级词汇周计划 · 第 1 周", "week"),
    "week2": ("Week 2", "六级词汇周计划 · 第 2 周", "week"),
    "week3": ("Week 3", "六级词汇周计划 · 第 3 周", "week"),
    "week4": ("Week 4", "六级词汇周计划 · 第 4 周", "week"),
    "week5": ("Week 5", "六级词汇周计划 · 第 5 周", "week"),
    "week6": ("Week 6", "六级词汇周计划 · 第 6 周", "week"),
    "week7": ("Week 7", "六级词汇周计划 · 第 7 周", "week"),
    "cog1": ("认知词汇 1", "六级认知词汇 · 上册", "cog"),
    "cog2": ("认知词汇 2", "六级认知词汇 · 下册", "cog"),
}

FILE_TO_BOOK = {
    "Week 1": "week1", "Week 2": "week2", "Week 3": "week3", "Week 4": "week4",
    "Week 5": "week5", "Week 6": "week6", "Week 7": "week7",
    "认知词汇1": "cog1", "认知词汇2": "cog2",
}


def parse_lrc(path: str):
    """解析单个 lrc，返回 [(seconds, raw_word, clean_word), ...]"""
    items = []
    for line in read_text(path).splitlines():
        line = line.rstrip()
        m = LINE_RE.match(line)
        if not m:
            continue
        mm, ss, cs, word = m.groups()
        sec = int(mm) * 60 + int(ss) + int(cs) / 100.0
        raw_word = word.strip()
        clean = clean_word(raw_word)
        items.append((round(sec, 2), raw_word, clean))
    return items


def collect_words():
    """扫描目录，按书籍汇总单词。"""
    books = []
    for fname, book_id in FILE_TO_BOOK.items():
        lrc = os.path.join(SRC_DIR, fname + ".lrc")
        mp3 = os.path.join(SRC_DIR, fname + ".mp3")
        if not os.path.exists(lrc):
            print(f"[warn] 缺少 {lrc}", file=sys.stderr)
            continue
        items = parse_lrc(lrc)
        name, desc, kind = BOOK_META[book_id]
        books.append({
            "id": book_id,
            "name": name,
            "desc": desc,
            "kind": kind,
            "count": len(items),
            "audio": f"audio/{fname}.mp3" if os.path.exists(mp3) else None,
            "lrc": f"audio/{fname}.lrc",
            "items": items,
        })
        print(f"[parse] {fname}: {len(items)} words")
    return books


def norm_candidates(word: str):
    """生成查询候选：基础词形 + 去括号变体。"""
    word = clean_word(word)
    c = [word]
    if "(" in word or ")" in word:
        c.append(re.sub(r"[()]", "", word))
        c.append(re.sub(r"\(([^)]*)\)", r"\1", word))
        c.append(re.sub(r"\([^)]*\)", "", word))
    # 保留顺序去重
    seen, out = set(), []
    for x in c:
        x = x.strip()
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def youdao_fetch(query: str, retries: int = 3):
    """请求有道 jsonapi，返回原始 dict（失败返回 None）。"""
    url = "https://dict.youdao.com/jsonapi?q=" + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://dict.youdao.com/",
    })
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            time.sleep(1.2 * (i + 1))
    return None


def extract(raw: dict):
    """从有道原始响应提取 音标 + 释义列表。"""
    if not raw:
        return None
    ec = raw.get("ec") or {}
    words = ec.get("word") or []
    pronunciation = None
    trans = []
    if words:
        w = words[0]
        us = (w.get("usphone") or "").strip()
        uk = (w.get("ukphone") or "").strip()
        pronunciation = {"us": us, "uk": uk}
        for t in w.get("trs") or []:
            for tr in t.get("tr") or []:
                for i in (tr.get("l") or {}).get("i") or []:
                    s = re.sub(r"\s+", " ", str(i)).strip()
                    if s and s not in trans:
                        trans.append(s)
    if not trans and not pronunciation:
        return None
    return {"pronunciation": pronunciation, "trans": trans}


def cache_path(word: str) -> str:
    safe = re.sub(r"[^0-9A-Za-z_\-]", "_", word)
    return os.path.join(CACHE_DIR, safe + ".json")


def get_word_data(word: str, refresh: bool):
    """按单词取数据，带磁盘缓存。"""
    cp = cache_path(word)
    if not refresh and os.path.exists(cp):
        try:
            with open(cp, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    result = None
    for q in norm_candidates(word):
        data = extract(youdao_fetch(q))
        if data:
            result = data
            result["matched"] = q
            break
    with open(cp, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="忽略缓存重新抓取")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", default=OUT_DIR)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)

    books = collect_words()

    # 收集去重后的待抓取单词
    uniq = []
    seen = set()
    for b in books:
        for _, _raw, clean in b["items"]:
            if clean not in seen:
                seen.add(clean)
                uniq.append(clean)
    print(f"[info] 去重后待抓取 {len(uniq)} 个单词")

    # 并发抓取
    cache = {}
    todo = [w for w in uniq if args.refresh or not os.path.exists(cache_path(w))]
    print(f"[info] 命中缓存 {len(uniq) - len(todo)}，需网络抓取 {len(todo)}")

    if todo:
        done = 0
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(get_word_data, w, False): w for w in todo}
            for fut in as_completed(futs):
                w = futs[fut]
                done += 1
                if done % 50 == 0 or done == len(todo):
                    el = time.time() - t0
                    print(f"  [{done}/{len(todo)}] {el:.0f}s  {el / done:.2f}s/词")
                try:
                    fut.result()
                except Exception as e:
                    print(f"[warn] {w}: {e}", file=sys.stderr)

    # 汇总
    for w in uniq:
        cache[w] = get_word_data(w, False)

    words = []
    wid = 1
    for b in books:
        for idx, (sec, raw_word, clean) in enumerate(b["items"]):
            d = cache.get(clean) or {}
            words.append({
                "id": wid,
                "word": clean,
                "raw": raw_word,
                "note": raw_word if raw_word != clean else "",
                "book": b["id"],
                "idx": idx,
                "time": sec,
                "us": (d.get("pronunciation") or {}).get("us", ""),
                "uk": (d.get("pronunciation") or {}).get("uk", ""),
                "trans": d.get("trans", []),
            })
            wid += 1

    for b in books:
        b.pop("items", None)

    # 统计覆盖率
    miss = [x["word"] for x in words if not x["trans"]]
    print(f"[info] 词条 {len(words)}，缺释义 {len(miss)}")

    with open(os.path.join(args.out, "words.json"), "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(args.out, "books.json"), "w", encoding="utf-8") as f:
        json.dump(books, f, ensure_ascii=False, indent=2)

    if miss:
        with open(os.path.join(ROOT, "tools", ".cache", "missing.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(miss))
    print("[done] 已写出 data/words.json + data/books.json")


if __name__ == "__main__":
    main()
