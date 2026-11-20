#!/usr/bin/env python3
"""把 store/screenshots/raw/ 的全視窗截圖處理成商店要的 1280x800。

    python3 store/make-screenshots.py

需要 Pillow。要加截圖的話，把原圖丟進 raw/，檔名開頭編號決定商店上的順序，
副檔名 .webp 或 .png 都可以，然後重跑。輸出同名的 .png。

原圖之所以也收進版控，是因為處理過程會不可逆地裁切和縮放。沒有原圖的話，
哪天商店改規格、或想重新裁一次，就只能重拍。

做兩件事：

1. 裁成 1.6 比例。商店只吃 1280x800 或 640x400，而全視窗截圖是 1.544，
   不是縮一下就好，直接縮會變形。從底部裁，因為下面是留言區沒資訊。
2. 模糊兩個帳號頭像。不是隱私問題（都是卡通圖不是本人照片），是其中一個
   是瑪利歐，放進商業商店列表沒必要。
"""
from PIL import Image, ImageFilter, ImageDraw
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / 'store' / 'screenshots' / 'raw'
OUT = ROOT / 'store' / 'screenshots'
TARGET = (1280, 800)
RATIO = TARGET[0] / TARGET[1]

# 兩個帳號頭像的位置（原圖 2000px 寬的座標）
AVATARS = [(1931, 113, 15), (1952, 174, 22)]

sources = sorted(p for p in RAW.iterdir() if p.suffix.lower() in ('.webp', '.png', '.jpg'))
if not sources:
    raise SystemExit(f'{RAW} 裡沒有原圖')

for src in sources:
    im = Image.open(src).convert('RGB')
    w, h = im.size

    for cx, cy, r in AVATARS:
        box = (cx - r, cy - r, cx + r, cy + r)
        patch = im.crop(box).filter(ImageFilter.GaussianBlur(r / 2))
        mask = Image.new('L', (2 * r, 2 * r), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
        im.paste(patch, box, mask)

    keep = round(w / RATIO)
    if keep > h:
        raise SystemExit(f'{src.name} 太矮，裁不出 {RATIO:.3f} 的比例')
    im = im.crop((0, 0, w, keep)).resize(TARGET, Image.LANCZOS)

    dest = OUT / (src.stem + '.png')
    im.save(dest, optimize=True)
    print(f'  {dest.relative_to(ROOT)}  {TARGET[0]}x{TARGET[1]}  {dest.stat().st_size // 1024}KB')
