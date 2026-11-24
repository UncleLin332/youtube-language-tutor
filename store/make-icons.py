#!/usr/bin/env python3
"""從 store/icon-source-2000.png 產生 icons/ 的四個尺寸。

    python3 store/make-icons.py

需要 Pillow（pip install Pillow）。換圖的時候覆蓋原圖再跑一次就好。

以預覽程式手動縮圖容易遺漏兩件事，因此寫成腳本：

1. 原圖的圓角外側為白色而非透明。保留的話，在深色工具列上
   會看到圖示四周的白邊。這裡以洪水填充（flood fill）自四個角移除該白色區域——
   書頁與眼睛內的白色位於圖案內部，不會被填充到。
2. 縮至 16px 須使用 LANCZOS；最近鄰插值會使圖像模糊成一團。
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

# 填充的邊界是硬邊，略加模糊，縮圖時才不會出現鋸齒
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
