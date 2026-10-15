# -*- coding: utf-8 -*-
"""统计页柱状图探针：注入 daily 数据 → 打开 #/stats → 量柱子的真实渲染高度。
用法：NODE_OPTIONS= python -u tools/probe_stats_chart.py
"""
import os, pathlib, sys, time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")


def main():
    with sync_playwright() as p:
        pg = p.chromium.launch(executable_path=str(EXE), headless=True).new_page()
        pg.goto(BASE + "#/home", wait_until="domcontentloaded")
        pg.wait_for_timeout(1200)

        # 注入近 3 天的 daily 数据（模拟真实练习计数）
        pg.evaluate("""() => {
            const t = TW.store.today();
            const d = TW.store.state.daily;
            const mk = (n) => {
                const x = new Date(); x.setDate(x.getDate() - n);
                const m = x.getMonth() + 1, day = x.getDate();
                return x.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
            };
            d[mk(0)] = { done: 80, right: 60 };
            d[mk(1)] = { done: 40, right: 30 };
            d[mk(2)] = { done: 20, right: 15 };
            TW.store.save();
        }""")
        pg.goto(BASE + "#/stats", wait_until="domcontentloaded")
        pg.wait_for_timeout(900)

        info = pg.evaluate("""() => {
            const fills = [...document.querySelectorAll('.bar-fill')];
            return fills.slice(-3).map(el => ({
                height: el.getBoundingClientRect().height,
                style: el.style.height,
                title: el.parentElement.title,
            }));
        }""")
        for r in info:
            print(r)
        flat = all(r["height"] < 8 for r in info)
        print("\n结论：", "❌ 柱子塌了（数据在、渲染是 3px 矮桩）——CSS 百分比高度失效" if flat
              else "✅ 柱子渲染正常")


if __name__ == "__main__":
    os._exit(main() or 0)
