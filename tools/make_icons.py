# -*- coding: utf-8 -*-
"""从 AI 生成的 logo 母版铺位全端图标（2026-10-16，英语学习站）。

母版：generated-images/ 下的打字机键帽 Aa + 书本 logo（与站点 Lenval 配色同源）。
母版四角有生成器水印残留，统一先裁边再取中心方形。

产出：
  assets/img/icon-512.png / icon-192.png / icon-180.png / icon-maskable-512.png / favicon.png
  desktop/icon.ico（16~256 多尺寸）
  android/app/src/main/res/mipmap-*/ic_launcher.png、ic_launcher_round.png、ic_launcher_foreground.png
  android .../values/ic_launcher_background.xml 改为品牌米白
用法：python tools/make_icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'generated-images', 'Flat_minimalist_app_icon__roun_2026-10-16T09-00-10.png')
IMG = os.path.join(ROOT, 'assets', 'img')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
CREAM = (249, 244, 238)          # 品牌米白（style.css --bg）

# 1) 裁掉水印边缘 -> 正方形母版
im = Image.open(SRC).convert('RGB')
w, h = im.size
crop = int(min(w, h) * 0.045)    # 每边裁 4.5%，去水印
im = im.crop((crop, crop, w - crop, h - crop))
side = min(im.size)
im = im.crop((0, 0, side, side)).resize((1024, 1024), Image.LANCZOS)

# 2) 四角填米白（母版圆角外是灰白，填成品牌米白后边缘连续）
full_bleed = Image.new('RGB', (1024, 1024), CREAM)
full_bleed.paste(im, (0, 0))

def save(img, path, size=None):
    if size:
        img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
    print('write', os.path.relpath(path, ROOT), img.size)

# 3) Web 图标
save(full_bleed, os.path.join(IMG, 'icon-512.png'), 512)
save(full_bleed, os.path.join(IMG, 'icon-192.png'), 192)
save(full_bleed, os.path.join(IMG, 'icon-180.png'), 180)
save(full_bleed, os.path.join(IMG, 'favicon.png'), 64)

# maskable：内容缩到 76% 居中（安全区），底为米白
m = Image.new('RGB', (1024, 1024), CREAM)
inner = full_bleed.resize((780, 780), Image.LANCZOS)
m.paste(inner, ((1024 - 780) // 2, (1024 - 780) // 2))
save(m, os.path.join(IMG, 'icon-maskable-512.png'), 512)

# 4) 桌面 exe 图标（多尺寸 ico）
ico_path = os.path.join(ROOT, 'desktop', 'icon.ico')
full_bleed.resize((256, 256), Image.LANCZOS).save(
    ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('write', os.path.relpath(ico_path, ROOT))

# 5) 安卓 mipmap（全密度）
DENS = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for d, px in DENS.items():
    folder = os.path.join(RES, 'mipmap-' + d)
    if not os.path.isdir(folder):
        continue
    save(full_bleed, os.path.join(folder, 'ic_launcher.png'), px)
    # 圆形：圆形蒙版裁切
    big = full_bleed.resize((px, px), Image.LANCZOS).convert('RGB')
    mask = Image.new('L', (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px, px), fill=255)
    circ = Image.new('RGB', (px, px), CREAM)
    circ.paste(big, (0, 0), mask)
    save(circ, os.path.join(folder, 'ic_launcher_round.png'), px)
    # 自适应前景：内容缩到 66% 居中、四周透明（安全区），底色交给 ic_launcher_background
    fg = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    inner_px = int(px * 0.66)
    fg.paste(full_bleed.resize((inner_px, inner_px), Image.LANCZOS),
             ((px - inner_px) // 2, (px - inner_px) // 2))
    save(fg, os.path.join(folder, 'ic_launcher_foreground.png'), px)

# 6) 自适应图标底色：白 -> 品牌米白
bg_xml = os.path.join(RES, 'values', 'ic_launcher_background.xml')
with open(bg_xml, 'r', encoding='utf-8') as f:
    xml = f.read()
xml = xml.replace('#FFFFFF', '#F9F4EE')
with open(bg_xml, 'w', encoding='utf-8', newline='\n') as f:
    f.write(xml)
print('write', os.path.relpath(bg_xml, ROOT), '-> #F9F4EE')
print('done')
