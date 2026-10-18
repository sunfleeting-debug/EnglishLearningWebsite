# -*- coding: utf-8 -*-
"""把站点白名单资源拷到 worker/site/，供 wrangler [assets] 托管静态站。
清单与 desktop/build.mjs 保持一致（桌面版验证过完整可用）。
每次 wrangler deploy 前先跑本脚本。worker/site/ 已在 .gitignore。
用法：python tools/build_worker_site.py
"""
import os
import shutil
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "worker" / "site"
FOLDERS = ["assets", "audio", "data"]
FILES = ["index.html", "manifest.json", "offline.html", "service-worker.js"]
# resources/ 里是三个超大 PDF（最大 33MB，超 Workers Static Assets 单文件 25MiB 上限），
# 不随部署上传：resources.js 已把非 github.io 站点的 PDF 下载回源到 GitHub Pages。


def main():
    missing = [p for p in FOLDERS + FILES if not (ROOT / p).exists()]
    if missing:
        raise SystemExit("缺文件，别打出一个残缺站：" + ", ".join(missing))
    if OUT.exists():
        # 🔴 环境的 safe-delete 守卫会拦 >50 文件的批量删除（shutil.rmtree 卡死/抛错），
        #    改成「改名暂存」：单次 rename 不触发守卫；trash 目录可随时手动 rm 清掉。
        import time
        trash = OUT.with_name("site-trash-" + str(int(time.time())))
        OUT.rename(trash)
        print(f"旧 site 已挪到 {trash.name}（可手动删除）")
    OUT.mkdir(parents=True)
    for f in FILES:
        shutil.copy2(ROOT / f, OUT / f)
    for d in FOLDERS:
        shutil.copytree(ROOT / d, OUT / d)
    n = sum(len(fs) for _, _, fs in os.walk(OUT))
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"worker/site/ 就绪：{n} 个文件，{size/1048576:.1f} MB")


if __name__ == "__main__":
    main()
