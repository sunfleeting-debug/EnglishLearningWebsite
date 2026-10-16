# -*- coding: utf-8 -*-
"""观察打包 exe 启动全过程：定时 dump CDP targets + 主进程日志落盘。"""
import json
import os
import pathlib
import subprocess
import time
import urllib.request

DESKTOP = pathlib.Path(r"F:\MyProject\EnglishLearningWebsite\desktop")
EXE = DESKTOP / "dist" / "EnglishLearningStation-1.1.0-portable.exe"
LOG = pathlib.Path(r"F:\MyProject\EnglishLearningWebsite\tools\.probe-el.log")
os.environ.pop("ELECTRON_RUN_AS_NODE", None)
os.environ["NODE_OPTIONS"] = ""

proc = subprocess.Popen([str(EXE), "--remote-debugging-port=9337"],
                        stdout=open(LOG, "w"), stderr=subprocess.STDOUT)
try:
    for i in range(40):
        time.sleep(1)
        try:
            targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9337/json/list", timeout=2).read())
            info = [(t.get("type"), t.get("url")[:70], t.get("title", "")[:20]) for t in targets
                    if t.get("type") == "page"]
            print(i, info)
        except Exception as e:
            print(i, "cdp: no")
finally:
    proc.terminate()
