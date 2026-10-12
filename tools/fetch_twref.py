# -*- coding: utf-8 -*-
"""抓 TypeWords 的关键实现文件（contents API + base64 解码）到 tools/.cache/twref/。
只读研究用；不进入仓库（tools/.cache 已 gitignore）。"""
import base64
import io
import json
import os
import urllib.request

FILES = [
    "app/core/hooks/fsrs.ts",
    "app/core/hooks/dict.ts",
    "app/core/apis/words.ts",
    "app/pages/(words)/dict-list.vue",
    "app/components/list/DictGroup.vue",
    "app/components/list/DictList.vue",
]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "twref")


def get(path):
    url = "https://api.github.com/repos/zyronon/TypeWords/contents/" + urllib.parse.quote(path)
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    return base64.b64decode(d["content"]).decode("utf-8", "replace")


def main():
    os.makedirs(OUT, exist_ok=True)
    for p in FILES:
        try:
            txt = get(p)
            name = p.replace("/", "_").replace("(", "").replace(")", "")
            io.open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n").write(txt)
            print("OK  %-46s %d bytes" % (p, len(txt)))
        except Exception as e:
            print("ERR %-46s %s" % (p, e))


if __name__ == "__main__":
    import urllib.parse
    main()
