#!/usr/bin/env python3
"""商店的宣傳圖：440x280 的小圖塊與 1400x560 的跑馬燈圖塊。

    python3 store/make-promo.py

需要 Pillow。輸出 store/promo-440x280.png 與 store/promo-1400x560.png。

結合 Nano Banana 生成的吉祥物背景圖（store/promo-mascot-bg.png）與演算法排版的銳利文字，
避免生圖模型直接寫字產生錯字或糊邊。

跑馬燈那張商店規定 JPEG 或 24 位元 PNG、不能有 alpha 透明層，因此全程以 RGB 模式輸出。
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BG_SRC = ROOT / 'store' / 'promo-mascot-bg.png'

FG = (255, 255, 255)
DIM = (214, 216, 234)
ACCENT = (124, 92, 255)

EN_PATH = '/System/Library/Fonts/Avenir Next.ttc'
EN_INDEX = 2                      # Demi Bold
CJK_PATH = '/System/Library/Fonts/STHeiti Medium.ttc'
CJK_INDEX = 0                     # Heiti TC Medium

TITLE = ['Language Tutor', 'in YouTube']
TAG = '自動暫停 · 整理單字 · 匯出 Anki'

SIZES = [(440, 280), (1400, 560)]
SS = 3                            # 先畫大圖再縮，邊緣更銳利


def fit(path, lines, max_w, start, index=0):
    """找出所有行都放得下的最大字級。"""
    size = start
    while size > 8:
        f = ImageFont.truetype(path, size, index=index)
        if all(f.getbbox(t)[2] - f.getbbox(t)[0] <= max_w for t in lines):
            return f, size
        size -= 1
    raise SystemExit('文字過長，無法放入版面')


def make_canvas(bg_src, W, H):
    """把 16:9 的吉祥物背景圖無縫鋪進目標畫布，右側保留吉祥物，左側延伸純淨深色底。"""
    scale_w = round(H * bg_src.width / bg_src.height)
    bg = bg_src.resize((scale_w, H), Image.LANCZOS)

    im = Image.new('RGB', (W, H), bg.getpixel((0, H // 2)))
    if scale_w >= W:
        # 440x280：從左側裁掉多餘暗部，讓吉祥物落在右側且保留適當呼吸空間
        crop_x = scale_w - W
        im.paste(bg.crop((crop_x, 0, scale_w, H)), (0, 0))
    else:
        # 1400x560：背景貼齊右緣（圖本身右側已有留白），左側用最左欄像素無縫延伸
        paste_x = W - scale_w
        edge_strip = bg.crop((0, 0, 1, H)).resize((paste_x + 1, H), Image.NEAREST)
        im.paste(edge_strip, (0, 0))
        im.paste(bg, (paste_x, 0))
    return im


def render(bg_src, out_w, out_h):
    W, H = out_w * SS, out_h * SS
    im = make_canvas(bg_src, W, H)
    d = ImageDraw.Draw(im)

    wide = (out_w / out_h) >= 2
    tx = round(W * (0.08 if wide else 0.07))
    avail = round(W * (0.45 if wide else 0.37))

    title_f, title_px = fit(EN_PATH, TITLE, avail, round(H * 0.16), index=EN_INDEX)
    tag_f, _ = fit(CJK_PATH, [TAG], avail, round(H * 0.068), index=CJK_INDEX)

    line_h = round(title_px * 1.16)
    gap_top = round(title_px * 0.38)
    bar_h = max(4, round(H * 0.016))
    bar_w = round(H * 0.16)
    gap_bot = round(title_px * 0.36)
    tag_box = tag_f.getbbox(TAG)
    tag_h = tag_box[3] - tag_box[1]

    block = line_h * len(TITLE) + gap_top + bar_h + gap_bot + tag_h
    y = (H - block) // 2 - round(H * 0.02)

    for t in TITLE:
        d.text((tx, y), t, font=title_f, fill=FG)
        y += line_h

    y += gap_top
    d.rounded_rectangle([(tx, y), (tx + bar_w, y + bar_h)], radius=bar_h // 2, fill=ACCENT)
    y += bar_h + gap_bot
    d.text((tx, y), TAG, font=tag_f, fill=DIM)

    return im.resize((out_w, out_h), Image.LANCZOS)


bg_src = Image.open(BG_SRC).convert('RGB')
for w, h in SIZES:
    out = ROOT / 'store' / f'promo-{w}x{h}.png'
    im = render(bg_src, w, h)
    assert im.mode == 'RGB', '不能有 alpha 透明層'
    im.save(out, optimize=True)
    print(f'  {out.relative_to(ROOT)}  {w}x{h}  {im.mode}  {out.stat().st_size // 1024}KB')
