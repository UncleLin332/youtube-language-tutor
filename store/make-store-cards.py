#!/usr/bin/env python3
"""將實機截圖與新版介面排版成 Chrome Web Store 專用 1280x800 展示圖（store/showcase/）。

    python3 store/make-store-cards.py

需要 Pillow。所有輸出皆為 1280x800 24 位元 RGB PNG（無 alpha 透明層），符合商店規範。
右上角加入不同造型的可愛河童徽章，讓整套商店截圖更有品牌一致性與親和力。
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'store' / 'screenshots'
OUT = ROOT / 'store' / 'showcase'
ICON = ROOT / 'icons' / 'icon128.png'
PROMO_MASCOT = ROOT / 'store' / 'promo-mascot-bg.png'
COFFEE_MASCOT = ROOT / 'options' / 'kappa-coffee.png'

W, H = 1280, 800
BG_TOP = (16, 16, 24)
BG_BOT = (26, 22, 46)
CARD_BORDER = (62, 60, 88)
ACCENT = (124, 92, 255)
AMBER = (245, 180, 0)
FG = (248, 248, 252)
DIM = (182, 184, 206)

FONT_CJK = '/System/Library/Fonts/STHeiti Medium.ttc'
FONT_EN = '/System/Library/Fonts/SFNS.ttf'


def f_cjk(size):
    return ImageFont.truetype(FONT_CJK, size, index=0)


def f_en(size):
    return ImageFont.truetype(FONT_EN, size)


def gradient_bg():
    im = Image.new('RGB', (W, H), BG_TOP)
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1)
        r = round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        d.line([(0, y), (W, y)], fill=(r, g, b))
    return im


def round_mask(w, h, radius):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    return m


def make_badge(kind, size=74):
    """建立 2x 超取樣圓形／圖示河童徽章（RGBA）。"""
    ss = size * 2
    if kind == 'book':
        return Image.open(ICON).convert('RGBA').resize((size, size), Image.LANCZOS)

    if kind == 'headphones':
        raw = Image.open(PROMO_MASCOT).convert('RGBA').crop((665, 25, 1365, 725)).resize((ss, ss), Image.LANCZOS)
        ring = ACCENT
    else:  # coffee
        raw = Image.open(COFFEE_MASCOT).convert('RGBA').resize((ss, ss), Image.LANCZOS)
        ring = AMBER

    mask = Image.new('L', (ss, ss), 0)
    ImageDraw.Draw(mask).ellipse((4, 4, ss - 5, ss - 5), fill=255)
    badge = Image.new('RGBA', (ss, ss), (0, 0, 0, 0))
    badge.paste(raw, (0, 0), mask)
    ImageDraw.Draw(badge).ellipse((3, 3, ss - 4, ss - 4), outline=ring + (220,), width=4)
    return badge.resize((size, size), Image.LANCZOS)


def make_card(idx, title, subtitle, crop_img, badge_kind):
    im = gradient_bg()
    d = ImageDraw.Draw(im)

    # Top header (compact so screenshot fills more of 1280x800)
    pad_x = 28
    d.rounded_rectangle((pad_x, 22, pad_x + 6, 82), radius=3, fill=ACCENT)
    d.text((pad_x + 20, 18), title, font=f_cjk(33), fill=FG)
    d.text((pad_x + 20, 62), subtitle, font=f_cjk(17), fill=DIM)

    # Right cute kappa mascot badge + index pill
    badge = make_badge(badge_kind, 68)
    bx = W - pad_x - badge.width
    by = 18
    im.paste(badge, (bx, by), badge)

    pill_txt = f'0{idx} / 05'
    pf = f_en(14)
    pb = pf.getbbox(pill_txt)
    pw = (pb[2] - pb[0]) + 24
    px = bx - 12 - pw
    d.rounded_rectangle((px, 36, px + pw, 68), radius=16, fill=(36, 32, 62), outline=ACCENT, width=1)
    d.text((px + 12, 43), pill_txt, font=pf, fill=FG)

    # Framed content area (near full-bleed for crisp readability)
    box_x, box_y = 20, 102
    box_w, box_h = W - 40, H - 118
    scale = min(box_w / crop_img.width, box_h / crop_img.height)
    nw, nh = round(crop_img.width * scale), round(crop_img.height * scale)
    resized = crop_img.resize((nw, nh), Image.LANCZOS)

    fx = box_x + (box_w - nw) // 2
    fy = box_y + (box_h - nh) // 2

    d.rounded_rectangle((fx - 2, fy - 2, fx + nw + 2, fy + nh + 2), radius=8, fill=(10, 10, 15), outline=CARD_BORDER, width=2)
    mask = round_mask(nw, nh, 6)
    im.paste(resized, (fx, fy), mask)
    return im


def build_feature_5():
    """第 5 張：結合新版「完成學習＋匯出 Anki」與「圖文申請教學」雙卡片預覽。"""
    canvas = Image.new('RGB', (1200, 650), (20, 21, 28))
    d = ImageDraw.Draw(canvas)

    # Left: Options Gemini guide preview
    guide = Image.open(ROOT / 'options' / 'guides' / 'gemini-4.png').convert('RGB')
    gw = 680
    gh = round(gw * guide.height / guide.width)
    guide_s = guide.resize((gw, gh), Image.LANCZOS)
    canvas.paste(guide_s, (28, 126))
    d.text((28, 36), '支援 Claude 與 Gemini · 內建圖文申請教學', font=f_cjk(22), fill=FG)
    d.text((28, 70), 'API Key 僅存於本機瀏覽器，不經過任何第三方伺服器', font=f_cjk(15), fill=DIM)

    # Cute coffee kappa banner under guide on the left
    coffee = make_badge('coffee', 64)
    d.rounded_rectangle((28, 504, 708, 608), radius=12, fill=(32, 28, 24), outline=(120, 92, 32), width=1)
    canvas.paste(coffee, (48, 524), coffee)
    d.text((130, 528), '免費、無廣告、不收你的任何資料', font=f_cjk(17), fill=FG)
    d.text((130, 560), '如果覺得這個工具有幫助，歡迎請河童喝杯咖啡支持開發！', font=f_cjk(14), fill=DIM)

    # Right: Completion & Export card mockup
    rx0, ry0, rx1, ry1 = 740, 28, 1172, 622
    d.rounded_rectangle((rx0, ry0, rx1, ry1), radius=14, fill=(18, 18, 22), outline=CARD_BORDER, width=2)
    icon = Image.open(ICON).convert('RGBA').resize((26, 26), Image.LANCZOS)
    canvas.paste(icon, (rx0 + 20, ry0 + 18), icon)
    d.text((rx0 + 54, ry0 + 20), '語言助手 · 學習完成', font=f_cjk(16), fill=FG)
    d.line([(rx0, ry0 + 56), (rx1, ry0 + 56)], fill=(44, 44, 53), width=1)

    d.text((rx0 + 132, ry0 + 82), '這部影片學習完成！', font=f_cjk(19), fill=FG)
    d.text((rx0 + 74, ry0 + 112), 'Everyday Conversation In Slow French', font=f_en(13), fill=DIM)

    stats = [
        ('已複習段落', '15 / 15 段'),
        ('影片長度', '7:22'),
        ('整理單字', '84 個'),
        ('整理片語', '23 個'),
        ('已收藏項目', '12 項'),
    ]
    sy = ry0 + 150
    d.rounded_rectangle((rx0 + 24, sy, rx1 - 24, sy + len(stats) * 44), radius=10, fill=(28, 28, 34), outline=(44, 44, 53), width=1)
    for i, (k, v) in enumerate(stats):
        row_y = sy + i * 44
        if i > 0:
            d.line([(rx0 + 24, row_y), (rx1 - 24, row_y)], fill=(44, 44, 53), width=1)
        d.text((rx0 + 40, row_y + 13), k, font=f_cjk(14), fill=DIM)
        d.text((rx1 - 115, row_y + 13), v, font=f_cjk(14), fill=FG)

    # Export buttons
    by = sy + len(stats) * 44 + 34
    d.rounded_rectangle((rx0 + 24, by, rx1 - 24, by + 44), radius=9, fill=ACCENT)
    d.text((rx0 + 110, by + 13), '匯出收藏到 Anki（12 項）', font=f_cjk(15), fill=FG)
    d.rounded_rectangle((rx0 + 24, by + 56, rx0 + 206, by + 98), radius=9, fill=(28, 28, 34), outline=(52, 54, 68), width=1)
    d.text((rx0 + 76, by + 68), '收藏表格', font=f_cjk(14), fill=FG)
    d.rounded_rectangle((rx0 + 220, by + 56, rx1 - 24, by + 98), radius=9, fill=(28, 28, 34), outline=(52, 54, 68), width=1)
    d.text((rx0 + 276, by + 68), '全部表格', font=f_cjk(14), fill=FG)

    return canvas


CARDS = [
    (1, '01-單字與片語整理.png', '每段自動暫停 · 整理單字與片語', '不打斷聽力節奏，停下來一次看懂句意、詞性與道地用法', (10, 146, 1268, 676), 'book'),
    (2, '02-框選解說.png', '框選不懂的片段 · AI 即時拆解', '不必離開影片查字典，針對句中語境直接解釋結構與語氣', (10, 146, 1268, 676), 'headphones'),
    (3, '03-日文也可以.png', '支援 10 種語言 · 逐句對照學習', '英、日、韓、法、西、德…多語字幕自動匹配，跨語言都好用', (10, 146, 1268, 676), 'book'),
    (4, '04-逐句複習與翻譯.png', '逐句重播 · 0.75× 慢速跟讀與聽寫', '點擊任一句立即重播；開啟聽寫模式先遮住原文專注練聽力', (10, 146, 1268, 676), 'headphones'),
]

OUT.mkdir(parents=True, exist_ok=True)
for idx, fname, title, sub, box, badge_kind in CARDS:
    src = Image.open(SHOTS / fname).convert('RGB').crop(box)
    card = make_card(idx, title, sub, src, badge_kind)
    assert card.mode == 'RGB'
    dest = OUT / fname
    card.save(dest, optimize=True)
    print(f'  {dest.relative_to(ROOT)}  {card.size}  {dest.stat().st_size // 1024}KB')

card5 = make_card(5, '一鍵匯出 Anki · 內建圖文申請教學', '支援匯出 Anki／Excel 表格，新手也能按步驟輕鬆完成 API 設定', build_feature_5(), 'coffee')
assert card5.mode == 'RGB'
dest5 = OUT / '05-匯出與圖文設定.png'
card5.save(dest5, optimize=True)
print(f'  {dest5.relative_to(ROOT)}  {card5.size}  {dest5.stat().st_size // 1024}KB')
