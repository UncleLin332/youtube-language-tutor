"""440x280 小宣傳圖。純排版，不經過生圖模型，所以不會有亂碼。

字級用演算法套出來，不是寫死的——寫死的話改一個字就會爆版，
第一版就是這樣右邊被切掉。
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib, sys

ROOT = pathlib.Path(sys.argv[1])
OUT = ROOT / 'store' / 'promo-440x280.png'
S = 3
W, H = 440 * S, 280 * S

BG, FG, DIM = (13, 42, 56), (255, 255, 255), (138, 196, 212)
EN_PATH = '/System/Library/Fonts/Avenir Next.ttc'
CJK_PATH = '/System/Library/Fonts/Hiragino Sans GB.ttc'

TITLE = ['Language Tutor', 'in YouTube']
TAG = '自動暫停・整理單字・匯出 Anki'

PAD = 22 * S
ICON = 150 * S
GAP = 20 * S
TEXT_X = PAD + ICON + GAP
TEXT_W = W - TEXT_X - PAD


def fit(path, lines, max_w, start, index=0):
    """找出最大的、每一行都塞得下的字級。"""
    size = start
    while size > 8:
        f = ImageFont.truetype(path, size, index=index)
        if all(f.getbbox(t)[2] - f.getbbox(t)[0] <= max_w for t in lines):
            return f, size
        size -= 1
    raise SystemExit('塞不下')


title_f, title_px = fit(EN_PATH, TITLE, TEXT_W, 40 * S, index=2)
tag_f, _ = fit(CJK_PATH, [TAG], TEXT_W, 17 * S)

im = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(im)

icon = Image.open(ROOT / 'store' / 'icon-source-2000.png').convert('RGBA')
rgb = icon.convert('RGB')
MARK = (255, 0, 255)
for c in [(0, 0), (icon.width - 1, 0), (0, icon.height - 1), (icon.width - 1, icon.height - 1)]:
    ImageDraw.floodfill(rgb, c, MARK, thresh=70)
a = Image.new('L', icon.size, 255)
px, ap = rgb.load(), a.load()
for y in range(icon.height):
    for x in range(icon.width):
        if px[x, y] == MARK:
            ap[x, y] = 0
icon.putalpha(a)
icon = icon.resize((ICON, ICON), Image.LANCZOS)
im.paste(icon, (PAD, (H - ICON) // 2), icon)

line_h = int(title_px * 1.18)
rule_gap = int(title_px * 0.45)
tag_h = tag_f.getbbox(TAG)[3]
block = line_h * len(TITLE) + rule_gap + tag_h + rule_gap
y = (H - block) // 2

for t in TITLE:
    d.text((TEXT_X, y), t, font=title_f, fill=FG)
    y += line_h
y += rule_gap
d.line([(TEXT_X, y), (TEXT_X + 34 * S, y)], fill=DIM, width=max(2, S))
y += rule_gap
d.text((TEXT_X, y), TAG, font=tag_f, fill=DIM)

im.resize((440, 280), Image.LANCZOS).save(OUT, optimize=True)
print(f'  {OUT.relative_to(ROOT)}  440x280  標題 {title_px // S}px  {OUT.stat().st_size // 1024}KB')
