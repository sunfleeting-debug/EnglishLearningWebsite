# -*- coding: utf-8 -*-
"""【扩展词条构建】为「近义词 / 反义词」里那些不在本地 CET 词库中的单词
生成轻量词条（音标 + 中文释义），产出 data/dict-ext.json 与 data/dict-ext.js。

为什么需要它：
    词典卡里的近义词/反义词来自通用词典，很多（如 fierce、violent）并不在
    本地 2714 个六级词里。若只按本地词库判断是否可点击，绝大多数链接会「点不动」。
    本脚本先算出这些「外部词」，再抓取它们的音标+释义，前端即可让步进链接真正跳转。

用法：
    python tools/build_dict_ext.py               # 增量（复用 tools/.cache/raw）
    python tools/build_dict_ext.py --workers 8
    python tools/build_dict_ext.py --refresh     # 忽略缓存重抓
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enrich_dict as E  # noqa: E402

ROOT = E.ROOT
DATA_DIR = E.DATA_DIR


def collect_external(words, cards):
    """算出词典卡近义/反义词里不在本地词库的词。"""
    local = {w["word"].lower() for w in words}
    ext = set()
    for card in cards.values():
        for s in card.get("syn") or []:
            for x in s.get("words") or []:
                x = x.strip().lower()
                if x and x not in local:
                    ext.add(x)
        for x in card.get("ant") or []:
            x = x.strip().lower()
            if x and x not in local:
                ext.add(x)
    return local, sorted(ext)


def light_card(raw):
    """抽取轻量词条：{u: 美音, k: 英音, t: [释义...]}"""
    if not raw:
        return None
    ec = raw.get("ec") or {}
    ws = ec.get("word") or []
    if not ws:
        return None
    w0 = ws[0]
    us = (w0.get("usphone") or "").strip()
    uk = (w0.get("ukphone") or "").strip()
    trans = []
    for t in w0.get("trs") or []:
        for tr in t.get("tr") or []:
            for i in (tr.get("l") or {}).get("i") or []:
                s = re.sub(r"\s+", " ", str(i)).strip()
                if s and s not in trans:
                    trans.append(s)
    if not trans and not us:
        return None
    # 控制体积：最多 3 条、每条截断
    trans = [t[:80] for t in trans[:3]]
    return {"u": us, "k": uk, "t": trans}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    with open(os.path.join(DATA_DIR, "words.json"), encoding="utf-8") as f:
        words = json.load(f)
    with open(os.path.join(DATA_DIR, "dict.json"), encoding="utf-8") as f:
        cards = json.load(f)

    local, ext = collect_external(words, cards)
    print(f"[info] 本地词 {len(local)}，外部近义/反义词 {len(ext)}", flush=True)

    os.makedirs(E.RAW_DIR, exist_ok=True)
    out = {}
    t0 = time.time()
    done = 0

    def job(word):
        try:
            raw = E.get_raw(word, args.refresh)
        except Exception as e:  # noqa: BLE001
            print(f"[warn] {word}: {e}", file=sys.stderr, flush=True)
            raw = None
        return word, light_card(raw)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(job, w) for w in ext]
        for fut in as_completed(futs):
            word, card = fut.result()
            if card:
                out[word] = card
            done += 1
            if done % 200 == 0 or done == len(ext):
                el = time.time() - t0
                print(f"  [{done}/{len(ext)}] {el:.0f}s  {el / done:.3f}s/词", flush=True)

    with open(os.path.join(DATA_DIR, "dict-ext.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    js = ("/* 自动生成，请勿手动修改；来源 dict-ext.json（有道词典，扩展词条） */\n"
          "window.TW=window.TW||{};window.TW.DICT_EXT=" +
          json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(DATA_DIR, "dict-ext.js"), "w", encoding="utf-8") as f:
        f.write(js)

    size = os.path.getsize(os.path.join(DATA_DIR, "dict-ext.js")) / 1024.0 / 1024.0
    print(f"[done] 扩展词条 {len(out)}/{len(ext)}  →  data/dict-ext.json + dict-ext.js  ({size:.2f} MB)", flush=True)


if __name__ == "__main__":
    main()
