# -*- coding: utf-8 -*-
"""生成站点图标（PWA / 添加到主屏幕用），输出到 assets/img/。

图标样式与站点 favicon 一致：蓝色圆角方块 + 白色等宽字母 A。
用法：python tools/make_icons.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img")

BLUE = (75, 139, 255, 255)      # #4b8bff
WHITE = (255, 255, 255, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\consolab.ttf",   # Consolas Bold
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\msyhbd.ttc",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_icon(size, radius_ratio=0.22, padding_ratio=0.0):
    """画一个 size×size 的图标；padding_ratio>0 时四周留白（maskable 用）。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    inner = size - pad * 2
    box = [pad, pad, pad + inner, pad + inner]
    radius = int(inner * radius_ratio)
    # maskable 时把底色铺满整张图，避免裁切后出现透明角
    if padding_ratio > 0:
        d.rectangle([0, 0, size, size], fill=BLUE)
    d.rounded_rectangle(box, radius=radius, fill=BLUE)

    font = load_font(int(inner * 0.62))
    text = "A"
    tb = d.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text((pad + (inner - tw) / 2 - tb[0], pad + (inner - th) / 2 - tb[1]),
           text, font=font, fill=WHITE)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 0.0),
        ("icon-512.png", 512, 0.0),
        ("icon-maskable-512.png", 512, 0.14),   # maskable：留安全边
        ("icon-180.png", 180, 0.0),             # iOS apple-touch-icon
    ]
    for name, size, pr in targets:
        img = draw_icon(size, padding_ratio=pr)
        path = os.path.join(OUT, name)
        img.save(path)
        print(f"[icon] {name}  {size}x{size}  {os.path.getsize(path)} bytes")


if __name__ == "__main__":
    main()
