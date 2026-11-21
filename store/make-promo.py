#!/usr/bin/env python3
"""商店的宣傳圖：440x560 的小圖塊與 1400x560 的跑馬燈圖塊。

    python3 store/make-promo.py

需要 Pillow。輸出 store/promo-440x280.png 與 store/promo-1400x560.png。

純排版，不經過生圖模型——生成的圖會在畫面裡寫出不存在的單字。
（試過一次，字幕那行變成「I active subtitles n active suitoos.」）

兩個刻意的設計：

1. **字級用演算法套出來，不是寫死的。** 第一版寫死 34px，標題右邊直接被切掉。
   現在是從大往小試到塞得下為止，所以改字、換尺寸都不會爆版。
2. **所有尺寸都按畫面高度換算**，所以同一份程式碼能出兩種比例，
   而且兩張看起來是同一套東西。

跑馬燈那張商店要求 JPEG 或 24 位元 PNG、不能有 alpha 透明層。底圖用 RGB 模式建，
河童貼上去時用它自己的 alpha 當遮罩，貼完就沒有透明層了。
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICON_SRC = ROOT / 'store' / 'icon-source-2000.png'

BG, FG, DIM = (13, 42, 56), (255, 255, 255), (138, 196, 212)
EN_PATH = '/System/Library/Fonts/Avenir Next.ttc'
EN_INDEX = 2                      # Demi Bold
CJK_PATH = '/System/Library/Fonts/Hiragino Sans GB.ttc'

TITLE = ['Language Tutor', 'in YouTube']
TAG = '自動暫停・整理單字・匯出 Anki'

SIZES = [(440, 280), (1400, 560)]
SS = 3                            # 先畫大的再縮，邊緣才銳利


def load_icon():
    """河童，四角去背。原圖的圓角外面是白的，不是透明的。"""
    im = Image.open(ICON_SRC).convert('RGBA')
    w, h = im.size
    rgb = im.convert('RGB')
    MARK = (255, 0, 255)
    for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(rgb, c, MARK, thresh=70)
    a = Image.new('L', (w, h), 255)
    px, ap = rgb.load(), a.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == MARK:
                ap[x, y] = 0
    im.putalpha(a)
    return im


def fit(path, lines, max_w, start, index=0):
    """最大的、每一行都塞得下的字級。"""
    size = start
    while size > 8:
        f = ImageFont.truetype(path, size, index=index)
        if all(f.getbbox(t)[2] - f.getbbox(t)[0] <= max_w for t in lines):
            return f, size
        size -= 1
    raise SystemExit('塞不下')


def width_of(font, text):
    b = font.getbbox(text)
    return b[2] - b[0]


def render(icon, out_w, out_h):
    W, H = out_w * SS, out_h * SS
    pad = round(H * 0.08)
    side = round(H * 0.54)
    gap = round(H * 0.07)

    # 先用最寬的可能空間量字，再回頭把整組置中
    avail = W - pad * 2 - side - gap
    title_f, title_px = fit(EN_PATH, TITLE, avail, round(H * 0.143), index=EN_INDEX)
    tag_f, _ = fit(CJK_PATH, [TAG], avail, round(H * 0.061))

    text_w = max(max(width_of(title_f, t) for t in TITLE), width_of(tag_f, TAG))
    group_w = side + gap + text_w
    x0 = (W - group_w) // 2

    im = Image.new('RGB', (W, H), BG)          # RGB，不是 RGBA：輸出不能有 alpha
    d = ImageDraw.Draw(im)

    ic = icon.resize((side, side), Image.LANCZOS)
    im.paste(ic, (x0, (H - side) // 2), ic)    # 用 icon 自己的 alpha 當遮罩

    tx = x0 + side + gap
    line_h = round(title_px * 1.18)
    rule = round(title_px * 0.45)
    tag_h = tag_f.getbbox(TAG)[3]
    block = line_h * len(TITLE) + rule * 2 + tag_h
    y = (H - block) // 2

    for t in TITLE:
        d.text((tx, y), t, font=title_f, fill=FG)
        y += line_h
    y += rule
    d.line([(tx, y), (tx + round(H * 0.12), y)], fill=DIM, width=max(2, SS))
    y += rule
    d.text((tx, y), TAG, font=tag_f, fill=DIM)

    return im.resize((out_w, out_h), Image.LANCZOS)


icon = load_icon()
for w, h in SIZES:
    out = ROOT / 'store' / f'promo-{w}x{h}.png'
    im = render(icon, w, h)
    assert im.mode == 'RGB', '不能有 alpha 透明層'
    im.save(out, optimize=True)
    print(f'  {out.relative_to(ROOT)}  {w}x{h}  {im.mode}  {out.stat().st_size // 1024}KB')
