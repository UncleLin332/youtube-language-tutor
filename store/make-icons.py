#!/usr/bin/env python3
"""從 store/icon-source-2000.png 產生 icons/ 的四個尺寸。

    python3 store/make-icons.py

需要 Pillow（pip install Pillow）。換圖的時候覆蓋原圖再跑一次就好。

手動用預覽程式縮圖很容易漏掉兩件事，所以寫成腳本：

1. 原圖的圓角外面是白的，不是透明的。留著的話在深色工具列上
   會看到圖示四周一圈白。這裡用洪水填充從四個角吃掉那圈白——
   書頁和眼睛裡的白在圖案內部，碰不到。
2. 縮到 16px 要用 LANCZOS，用最近鄰會糊成一團。
"""
from PIL import Image, ImageDraw, ImageFilter
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'store' / 'icon-source-2000.png'
OUT = ROOT / 'icons'
SIZES = (16, 32, 48, 128)

im = Image.open(SRC).convert('RGBA')
w, h = im.size

rgb = im.convert('RGB')
MARK = (255, 0, 255)
for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    ImageDraw.floodfill(rgb, corner, MARK, thresh=70)

alpha = Image.new('L', (w, h), 255)
px, ap = rgb.load(), alpha.load()
for y in range(h):
    for x in range(w):
        if px[x, y] == MARK:
            ap[x, y] = 0

# 填充的邊界是硬的，模糊一點點，縮圖時才不會有鋸齒
im.putalpha(alpha.filter(ImageFilter.GaussianBlur(w / 400)))

# 裁掉圖案外多餘的空白，並補成正方形
im = im.crop(im.getbbox())
side = max(im.size)
square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
square.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))

OUT.mkdir(exist_ok=True)
for n in SIZES:
    path = OUT / f'icon{n}.png'
    square.resize((n, n), Image.LANCZOS).save(path, optimize=True)
    print(f'  {path.relative_to(ROOT)}  {path.stat().st_size} bytes')
