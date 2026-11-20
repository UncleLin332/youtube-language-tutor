from PIL import Image, ImageFilter, ImageDraw
import sys, os, pathlib

SRC = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)

# 商店只吃 1280x800 或 640x400，比例必須剛好 1.6
TARGET = (1280, 800)
# 兩個帳號頭像的位置（原圖 2000px 寬的座標），模糊掉
AVATARS = [(1931, 113, 15), (1952, 174, 22)]

JOBS = [
    ('3.webp', '02-逐句複習與翻譯.png'),
    ('4.webp', '01-單字與片語整理.png'),
    ('5.webp', '03-自動暫停的時刻.png'),
]

for name, out in JOBS:
    im = Image.open(SRC / name).convert('RGB')
    w, h = im.size

    for cx, cy, r in AVATARS:
        box = (cx - r, cy - r, cx + r, cy + r)
        patch = im.crop(box).filter(ImageFilter.GaussianBlur(r / 2))
        mask = Image.new('L', (2 * r, 2 * r), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
        im.paste(patch, box, mask)

    # 裁成 1.6，從底部切（下面是留言區，沒資訊）
    keep = int(w / 1.6)
    im = im.crop((0, 0, w, keep)) if keep <= h else im
    im = im.resize(TARGET, Image.LANCZOS)
    im.save(OUT / out, optimize=True)
    print(f'  {out}  {im.size[0]}x{im.size[1]}  {(OUT/out).stat().st_size//1024}KB')
