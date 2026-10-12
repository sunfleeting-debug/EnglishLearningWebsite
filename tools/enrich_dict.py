# -*- coding: utf-8 -*-
"""
【词典卡数据构建】为每个单词生成「一词一卡」的富词典数据，产出 data/dict.json 与 data/dict.js。

数据来源（全部免费、无需 key）：
  - 有道词典 jsonapi（主）：搭配 phrs、派生词 rel_word、辨析 discriminate、
    近义词 syno、例句 blng_sents_part、词源 etym、考频 ec.exam_type
  - Datamuse api（补）：反义词 rel_ant（有道无该字段）

设计要点：
  - 原始响应按词缓存到 tools/.cache/raw/<word>.json，重跑复用；
  - 搭配不足时，从例句/柯林斯例句里「就地挖掘」与词共现的常见搭配（无中文，标注为语料搭配）；
  - 例句统一取「带中文翻译」的前 3 条；
  - 只保留结构化字段，空的板块一律省略，前端据此自动隐藏。

用法：
    python tools/enrich_dict.py               # 增量（有缓存则复用）
    python tools/enrich_dict.py --limit 30    # 只处理前 30 个词（自测）
    python tools/enrich_dict.py --refresh     # 忽略缓存全部重抓
    python tools/enrich_dict.py --workers 8
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
DATA_DIR = os.path.join(ROOT, "data")
RAW_DIR = os.path.join(ROOT, "tools", ".cache", "raw")
DM_DIR = os.path.join(ROOT, "tools", ".cache", "datamuse")

TAG_RE = re.compile(r"<[^>]+>")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")

# 搭配挖掘时剔除的功能词 / 无信息词
STOP = set("""a an the and or but of to in on at by for with from as is are was were be been
being am do does did done have has had will would shall should can could may might must
this that these those it its he she they them his her their you your i we our me my us
not no nor so if then than too very more most much many some any all both each few less
least own same such only just also even still yet about into over under again further
once here there when where why how what which who whom whose out off up down""".split())


def safe_name(word: str) -> str:
    return re.sub(r"[^0-9A-Za-z_\-]", "_", word)


def http_json(url: str, retries: int = 3):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://dict.youdao.com/",
    })
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.0 * (i + 1))
    raise last


def cached_json(path: str, fetch_fn, refresh: bool):
    if not refresh and os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    data = fetch_fn()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)
    return data


def get_raw(word: str, refresh: bool):
    """有道 jsonapi 原始响应。"""
    url = "https://dict.youdao.com/jsonapi?q=" + urllib.parse.quote(word)
    return cached_json(os.path.join(RAW_DIR, safe_name(word) + ".json"),
                       lambda: http_json(url), refresh)


def get_antonyms(word: str, refresh: bool):
    """Datamuse 反义词。无结果返回 []。"""
    url = "https://api.datamuse.com/words?max=6&rel_ant=" + urllib.parse.quote(word)
    try:
        data = cached_json(os.path.join(DM_DIR, safe_name(word) + ".json"),
                           lambda: http_json(url), refresh)
    except Exception:
        return []
    out = []
    for it in data or []:
        w = (it.get("word") or "").strip().lower()
        # 只保留单个英文词/连字符词，去掉含空格的条目
        if w and " " not in w and re.fullmatch(r"[a-z][a-z'\-]+", w):
            out.append(w)
    return out


# ---------- 各板块抽取 ----------

def take_phrs(raw: dict):
    """词组短语：{"phrs":{"phrs":[{"phr":{"headword":{"l":{"i":..}},"trs":[{"tr":{"l":{"i":..}}}]}}]}}"""
    out = []
    node = (raw.get("phrs") or {}).get("phrs") or []
    for item in node:
        phr = item.get("phr") or {}
        en = (((phr.get("headword") or {}).get("l") or {}).get("i") or "").strip()
        zh = ""
        trs = phr.get("trs") or []
        if trs:
            zh = (((trs[0].get("tr") or {}).get("l") or {}).get("i") or "").strip()
        en = re.sub(r"\s+", " ", en)
        zh = re.sub(r"\s+", " ", TAG_RE.sub("", zh))
        if en and en.lower() != "more":
            out.append({"en": en, "zh": zh})
    return out[:8]


def take_derived(raw: dict):
    """派生词：{"rel_word":{"rels":[{"rel":{"pos":..,"words":[{"word":..,"tran":..}]}}]}}"""
    out = []
    node = (raw.get("rel_word") or {}).get("rels") or []
    for item in node:
        rel = item.get("rel") or {}
        pos = (rel.get("pos") or "").strip()
        for w in rel.get("words") or []:
            word = (w.get("word") or "").strip()
            tran = re.sub(r"\s+", " ", (w.get("tran") or "").strip())
            if word:
                out.append({"pos": pos, "word": word, "zh": tran})
    # 去重（同词只留首个）
    seen, res = set(), []
    for d in out:
        k = d["word"].lower()
        if k not in seen:
            seen.add(k)
            res.append(d)
    return res[:10]


def take_discriminate(raw: dict):
    """词语辨析：{"discriminate":{"data":[{"tran":..,"headwords":[..],"usages":[{"headword":..,"usage":..}]}]}}"""
    node = (raw.get("discriminate") or {}).get("data") or []
    if not node:
        return None
    d = node[0]
    usages = []
    for u in d.get("usages") or []:
        hw = (u.get("headword") or "").strip()
        us = re.sub(r"\s+", " ", (u.get("usage") or "").strip())
        if hw and us:
            usages.append({"word": hw, "zh": us})
    if not usages:
        return None
    return {"tran": (d.get("tran") or "").strip(), "items": usages[:8]}


def take_synonyms(raw: dict):
    """近义词：{"syno":{"synos":[{"syno":{"pos":..,"ws":[{"w":..}],"tran":..}}]}}"""
    out = []
    node = (raw.get("syno") or {}).get("synos") or []
    for item in node:
        s = item.get("syno") or {}
        words = [ (w.get("w") or "").strip() for w in (s.get("ws") or []) ]
        words = [w for w in words if w]
        if not words:
            continue
        out.append({
            "pos": (s.get("pos") or "").strip(),
            "words": words[:8],
            "zh": re.sub(r"\s+", " ", (s.get("tran") or "").strip()),
        })
    return out[:4]


def take_etym(raw: dict):
    node = ((raw.get("etym") or {}).get("etyms") or {}).get("zh") or []
    for e in node:
        v = re.sub(r"\s+", " ", (e.get("value") or "").strip())
        if v:
            return v
    return ""


def take_exam_types(raw: dict):
    types = (raw.get("ec") or {}).get("exam_type") or []
    return [t for t in types if t][:8]


def collect_sentences(raw: dict, word: str):
    """汇总各处例句，返回 [(en, zh)]，优先带翻译。"""
    pairs = []
    # 1) 双语例句（最优先，均带翻译）
    node = (raw.get("blng_sents_part") or {}).get("sentence-pair") or []
    for it in node:
        en = TAG_RE.sub("", it.get("sentence-eng") or it.get("sentence") or "").strip()
        zh = (it.get("sentence-translation") or "").strip()
        if en:
            pairs.append((re.sub(r"\s+", " ", en), re.sub(r"\s+", " ", zh)))
    # 2) 柯林斯例句（带翻译）
    cnode = (raw.get("collins") or {}).get("collins_entries") or []
    for ce in cnode:
        for entry in (((ce.get("entries") or {}).get("entry")) or []):
            for te in entry.get("tran_entry") or []:
                for s in ((te.get("exam_sents") or {}).get("sent")) or []:
                    en = re.sub(r"\s+", " ", TAG_RE.sub("", s.get("eng_sent") or "")).strip()
                    zh = re.sub(r"\s+", " ", s.get("chn_sent") or "").strip()
                    if en:
                        pairs.append((en, zh))
    # 3) 扩展释义例句（可能带翻译）
    enode = (raw.get("expand_ec") or {}).get("word") or []
    for w in enode:
        for tl in w.get("transList") or []:
            content = tl.get("content") or {}
            for s in content.get("sents") or []:
                en = re.sub(r"\s+", " ", TAG_RE.sub("", s.get("sentOrig") or "")).strip()
                zh = re.sub(r"\s+", " ", s.get("sentTrans") or s.get("sentTrans1") or "").strip()
                if en:
                    pairs.append((en, zh))
    # 4) WordNet 英文释义里的例句（无翻译）
    ee = raw.get("ee") or {}
    for tr in ((ee.get("word") or {}).get("trs")) or []:
        for t in tr.get("tr") or []:
            ex = t.get("exam") or {}
            for it in (((ex.get("i") or {}).get("f") or {}).get("l")) or []:
                en = re.sub(r"\s+", " ", TAG_RE.sub("", it.get("i") or "")).strip()
                if en:
                    pairs.append((en, ""))
    # 去重（按英文）
    seen, res = set(), []
    for en, zh in pairs:
        k = en.lower()
        if k not in seen and len(en) > 4:
            seen.add(k)
            res.append((en, zh))
    # 排序：带翻译的优先，且尽量包含原词
    lw = word.lower()
    res.sort(key=lambda p: (0 if p[1] else 1, 0 if lw in p[0].lower() else 1))
    return res


def mind_collocations(pairs, word: str, limit: int = 6):
    """从例句里挖掘与词共现的搭配（英文短语，无中文）。

    优先「词在前」的右搭配（drastic measures/action），其次「词在后」的左搭配
    （take drastic）；同权重按出现次数排序，噪声词已剔除。
    """
    lw = word.lower()
    counter = {}   # key -> [right?, count]
    for en, _zh in pairs:
        tokens = WORD_RE.findall(en)
        low = [t.lower() for t in tokens]
        for i, t in enumerate(low):
            if t != lw:
                continue
            if i + 1 < len(tokens):
                nxt = tokens[i + 1]
                if nxt.lower() not in STOP and len(nxt) >= 3:
                    key = (word + " " + nxt).lower()
                    c = counter.setdefault(key, [1, 0])
                    c[1] += 1
            if i - 1 >= 0:
                prv = tokens[i - 1]
                if prv.lower() not in STOP and len(prv) >= 3:
                    key = (prv + " " + word).lower()
                    c = counter.setdefault(key, [0, 0])
                    c[1] += 1
    # 右搭配优先，再按次数
    ranked = sorted(counter.items(), key=lambda kv: (-kv[1][0], -kv[1][1], kv[0]))
    return [k for k, _ in ranked[:limit]]


def build_card(word: str, raw: dict, ants):
    if not raw:
        return None
    card = {}
    syn = take_synonyms(raw)
    if syn:
        card["syn"] = syn
    derv = take_derived(raw)
    if derv:
        card["deriv"] = derv
    dis = take_discriminate(raw)
    if dis:
        card["discrim"] = dis
    phrs = take_phrs(raw)
    pairs = collect_sentences(raw, word)
    mined = []
    if not phrs:
        mined = mind_collocations(pairs, word)
    if phrs:
        card["colloc"] = phrs
    if mined:
        card["colloc_raw"] = mined
    if ants:
        card["ant"] = ants
    ex = [{"en": en, "zh": zh} for en, zh in pairs[:3]]
    if ex:
        card["ex"] = ex
    et = take_etym(raw)
    if et:
        card["etym"] = et
    exams = take_exam_types(raw)
    if exams:
        card["exam"] = exams
    return card or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 个词（自测）")
    args = ap.parse_args()

    with open(os.path.join(DATA_DIR, "words.json"), "r", encoding="utf-8") as f:
        words = json.load(f)

    uniq = []
    seen = set()
    for w in words:
        k = w["word"].lower()
        if k not in seen:
            seen.add(k)
            uniq.append((w["word"], k))
    if args.limit:
        uniq = uniq[:args.limit]
    print(f"[info] 去重后 {len(uniq)} 个词，开始抓取（workers={args.workers}）", flush=True)

    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(DM_DIR, exist_ok=True)

    raw_map = {}
    ant_map = {}

    def job(word, lower):
        try:
            raw = get_raw(word, args.refresh)
        except Exception as e:  # noqa: BLE001
            raw = None
            print(f"[warn] youdao {word}: {e}", file=sys.stderr, flush=True)
        try:
            ants = get_antonyms(lower, args.refresh)
        except Exception:  # noqa: BLE001
            ants = []
        return word, lower, raw, ants

    t0 = time.time()
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(job, w, l) for w, l in uniq]
        for fut in as_completed(futs):
            word, lower, raw, ants = fut.result()
            raw_map[lower] = raw
            ant_map[lower] = ants
            done += 1
            if done % 100 == 0 or done == len(uniq):
                el = time.time() - t0
                print(f"  [{done}/{len(uniq)}] {el:.0f}s  {el / done:.3f}s/词", flush=True)

    # 汇总成 {word: card}
    cards = {}
    stat = {"syn": 0, "deriv": 0, "discrim": 0, "colloc": 0, "colloc_raw": 0,
            "ant": 0, "ex": 0, "etym": 0, "exam": 0}
    for word, lower in uniq:
        card = build_card(word, raw_map.get(lower), ant_map.get(lower))
        if not card:
            continue
        cards[lower] = card
        for k in stat:
            if card.get(k):
                stat[k] += 1

    print(f"[stat] 共 {len(cards)}/{len(uniq)} 词有卡；各板块覆盖：", flush=True)
    for k, v in stat.items():
        print(f"   {k:12s} {v:5d}  ({v * 100.0 / max(1, len(uniq)):.0f}%)", flush=True)

    with open(os.path.join(DATA_DIR, "dict.json"), "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, separators=(",", ":"))

    js = ("/* 自动生成，请勿手动修改；来源 dict.json（有道词典 + Datamuse） */\n"
          "window.TW=window.TW||{};window.TW.DICT=" +
          json.dumps(cards, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(DATA_DIR, "dict.js"), "w", encoding="utf-8") as f:
        f.write(js)

    size = os.path.getsize(os.path.join(DATA_DIR, "dict.js")) / 1024.0 / 1024.0
    print(f"[done] data/dict.json + data/dict.js  ({size:.2f} MB)", flush=True)


if __name__ == "__main__":
    main()
