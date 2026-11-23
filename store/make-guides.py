#!/usr/bin/env python3
"""產生設定頁「申請 API Key」圖解步驟圖（options/guides/）與動態 WebP（store/）。

    python3 store/make-guides.py

需要 Pillow。輸出：
  options/guides/gemini-1.png .. gemini-4.png
  options/guides/anthropic-1.png .. anthropic-4.png
  store/gemini-walkthrough.webp
  store/anthropic-walkthrough.webp
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'options' / 'guides'
STORE = ROOT / 'store'
ICON_PATH = ROOT / 'icons' / 'icon128.png'

W, H = 920, 480

# Colors
BG = (17, 17, 22)
WIN_BG = (24, 25, 32)
WIN_BAR = (32, 33, 42)
SIDEBAR_BG = (20, 21, 28)
CARD_BG = (31, 33, 43)
CARD_ALT = (38, 40, 52)
LINE = (52, 54, 68)
FG = (241, 242, 248)
DIM = (152, 156, 174)
ACCENT = (124, 92, 255)
ACCENT_SOFT = (46, 38, 82)
BLUE = (66, 133, 244)
BLUE_BG = (30, 52, 92)
GREEN = (42, 180, 106)
GREEN_BG = (24, 62, 42)
AMBER = (245, 180, 0)
AMBER_BG = (66, 52, 18)

FONT_EN = '/System/Library/Fonts/SFNS.ttf'
FONT_MONO = '/System/Library/Fonts/SFNSMono.ttf'
FONT_CJK = '/System/Library/Fonts/STHeiti Medium.ttc'


def f_en(size):
    return ImageFont.truetype(FONT_EN, size)


def f_mono(size):
    return ImageFont.truetype(FONT_MONO, size)


def f_cjk(size):
    return ImageFont.truetype(FONT_CJK, size, index=0)


def draw_cursor(d, x, y, ring_r=22, ring_color=ACCENT):
    """Draw a subtle focus ring + crisp white pointer cursor at (x, y)."""
    d.ellipse((x - ring_r, y - ring_r, x + ring_r, y + ring_r), outline=ring_color, width=3)
    d.ellipse((x - ring_r + 6, y - ring_r + 6, x + ring_r - 6, y + ring_r - 6), outline=ring_color, width=2)
    pts = [(x, y), (x, y + 24), (x + 6, y + 18), (x + 12, y + 29), (x + 16, y + 27), (x + 10, y + 16), (x + 18, y + 16)]
    d.polygon(pts, fill=(255, 255, 255), outline=(18, 18, 24))


def draw_browser(url, step_num, caption):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    # Outer browser window
    wx0, wy0, wx1, wy1 = 36, 20, W - 36, H - 64
    d.rounded_rectangle((wx0, wy0, wx1, wy1), radius=14, fill=WIN_BG, outline=LINE, width=2)

    # Top chrome bar
    d.rounded_rectangle((wx0, wy0, wx1, wy0 + 42), radius=14, fill=WIN_BAR)
    d.rectangle((wx0, wy0 + 26, wx1, wy0 + 42), fill=WIN_BAR)
    d.line([(wx0, wy0 + 42), (wx1, wy0 + 42)], fill=LINE, width=1)

    # Traffic lights
    for i, col in enumerate([(235, 95, 87), (242, 189, 68), (88, 196, 86)]):
        cx = wx0 + 20 + i * 16
        cy = wy0 + 21
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=col)

    # URL pill
    ux0, uy0, ux1, uy1 = wx0 + 82, wy0 + 9, wx1 - 24, wy0 + 33
    d.rounded_rectangle((ux0, uy0, ux1, uy1), radius=12, fill=BG, outline=LINE, width=1)
    d.text((ux0 + 14, uy0 + 4), url, font=f_mono(13), fill=DIM)

    # Bottom caption pill
    badge_x0, badge_y0 = 36, H - 48
    d.rounded_rectangle((badge_x0, badge_y0, badge_x0 + 30, badge_y0 + 30), radius=15, fill=ACCENT)
    d.text((badge_x0 + 10, badge_y0 + 6), str(step_num), font=f_en(15), fill=FG)
    d.text((badge_x0 + 42, badge_y0 + 6), caption, font=f_cjk(16), fill=FG)

    return im, d, (wx0, wy0 + 42, wx1, wy1)


def pill_btn(d, x, y, text, bg, fg=FG, border=None, font=None, pad_x=16, pad_y=9):
    fn = font or f_en(15)
    b = fn.getbbox(text)
    tw, th = b[2] - b[0], b[3] - b[1]
    w = tw + pad_x * 2
    h = th + pad_y * 2
    d.rounded_rectangle((x, y, x + w, y + h), radius=8, fill=bg, outline=border, width=2 if border else 0)
    d.text((x + pad_x, y + pad_y - 2), text, font=fn, fill=fg)
    return (x, y, x + w, y + h)


def build_gemini():
    frames = []

    # Step 1: aistudio.google.com/apikey -> click Create API key
    im, d, (x0, y0, x1, y1) = draw_browser('https://aistudio.google.com/apikey', 1, '登入 Google 帳號後，點擊右上角「Create API key」')
    d.text((x0 + 32, y0 + 26), 'Google AI Studio', font=f_en(14), fill=DIM)
    d.text((x0 + 32, y0 + 52), 'API keys', font=f_en(26), fill=FG)
    d.text((x0 + 32, y0 + 88), 'Manage your Gemini API keys below.', font=f_en(14), fill=DIM)
    bx0, by0, bx1, by1 = pill_btn(d, x1 - 196, y0 + 50, '+ Create API key', BLUE, border=(160, 200, 255))
    # Empty table placeholder
    d.rounded_rectangle((x0 + 32, y0 + 132, x1 - 32, y1 - 26), radius=10, fill=CARD_BG, outline=LINE, width=1)
    d.line([(x0 + 32, y0 + 170), (x1 - 32, y0 + 170)], fill=LINE, width=1)
    d.text((x0 + 52, y0 + 144), 'Project', font=f_en(13), fill=DIM)
    d.text((x0 + 260, y0 + 144), 'API key', font=f_en(13), fill=DIM)
    d.text((x0 + 500, y0 + 144), 'Plan', font=f_en(13), fill=DIM)
    d.text((x0 + 290, y0 + 230), 'No API keys yet', font=f_en(15), fill=DIM)
    draw_cursor(d, bx1 - 18, by1 - 6, ring_color=BLUE)
    frames.append(im)

    # Step 2: Modal -> Create API key in new project
    im, d, (x0, y0, x1, y1) = draw_browser('https://aistudio.google.com/apikey', 2, '選擇「Create API key in new project」，不用手動開 Cloud 專案')
    d.text((x0 + 32, y0 + 26), 'Google AI Studio', font=f_en(14), fill=DIM)
    d.text((x0 + 32, y0 + 52), 'API keys', font=f_en(26), fill=DIM)
    # Modal
    mx0, my0, mx1, my1 = x0 + 170, y0 + 48, x1 - 170, y1 - 34
    d.rounded_rectangle((mx0, my0, mx1, my1), radius=12, fill=CARD_BG, outline=LINE, width=2)
    d.text((mx0 + 26, my0 + 24), 'Create API key', font=f_en(20), fill=FG)
    d.text((mx0 + 26, my0 + 56), 'Select a Google Cloud project or create a new one:', font=f_en(13), fill=DIM)
    # Primary option highlighted
    ox0, oy0, ox1, oy1 = pill_btn(d, mx0 + 26, my0 + 96, 'Create API key in new project', BLUE_BG, fg=(180, 212, 255), border=BLUE, pad_x=20, pad_y=12)
    pill_btn(d, mx0 + 26, oy1 + 16, 'Search existing Google Cloud projects...', CARD_ALT, fg=DIM, border=LINE, pad_x=20, pad_y=11)
    draw_cursor(d, ox1 - 18, oy1 - 6, ring_color=BLUE)
    frames.append(im)

    # Step 3: Copy AIza... key
    im, d, (x0, y0, x1, y1) = draw_browser('https://aistudio.google.com/apikey', 3, '複製「AIza」開頭的金鑰（免費額度即可使用）')
    d.text((x0 + 32, y0 + 26), 'Google AI Studio', font=f_en(14), fill=DIM)
    d.text((x0 + 32, y0 + 52), 'API keys', font=f_en(26), fill=FG)
    d.rounded_rectangle((x0 + 32, y0 + 114, x1 - 32, y1 - 36), radius=10, fill=CARD_BG, outline=LINE, width=1)
    d.line([(x0 + 32, y0 + 152), (x1 - 32, y0 + 152)], fill=LINE, width=1)
    d.text((x0 + 52, y0 + 126), 'Project', font=f_en(13), fill=DIM)
    d.text((x0 + 250, y0 + 126), 'API key', font=f_en(13), fill=DIM)
    d.text((x0 + 490, y0 + 126), 'Plan', font=f_en(13), fill=DIM)
    # Row
    d.text((x0 + 52, y0 + 180), 'Gemini API Project', font=f_en(15), fill=FG)
    d.rounded_rectangle((x0 + 244, y0 + 172, x0 + 462, y0 + 206), radius=6, fill=BG, outline=ACCENT, width=1)
    d.text((x0 + 254, y0 + 180), 'AIzaSyB9xK...7mQp', font=f_mono(14), fill=(200, 186, 255))
    pill_btn(d, x0 + 486, y0 + 174, 'Free tier', GREEN_BG, fg=GREEN, font=f_en(13), pad_x=10, pad_y=6)
    cx0, cy0, cx1, cy1 = pill_btn(d, x1 - 134, y0 + 172, 'Copy', BLUE, border=(160, 200, 255), pad_x=18, pad_y=7)
    d.text((x0 + 52, y0 + 236), '提示：若頻繁收到 429 速率限制，稍候幾秒再試即可。', font=f_cjk(13), fill=DIM)
    draw_cursor(d, cx1 - 16, cy1 - 5, ring_color=BLUE)
    frames.append(im)

    # Step 4: Paste back into Extension Settings
    im, d, (x0, y0, x1, y1) = draw_browser('chrome-extension://.../options.html', 4, '貼回擴充設定頁，按「儲存設定」再按「測試 API key」')
    icon = Image.open(ICON_PATH).convert('RGBA').resize((36, 36), Image.LANCZOS)
    im.paste(icon, (x0 + 36, y0 + 24), icon)
    d.text((x0 + 84, y0 + 28), 'Language Tutor in YouTube · 設定', font=f_cjk(18), fill=FG)
    d.rounded_rectangle((x0 + 36, y0 + 78, x1 - 36, y0 + 230), radius=12, fill=CARD_BG, outline=LINE, width=1)
    d.text((x0 + 58, y0 + 96), 'Gemini API Key', font=f_en(14), fill=FG)
    d.rounded_rectangle((x0 + 58, y0 + 124, x1 - 290, y0 + 164), radius=8, fill=BG, outline=ACCENT, width=2)
    d.text((x0 + 72, y0 + 135), 'AIzaSyB9xK••••••••••••••', font=f_mono(15), fill=FG)
    d.text((x1 - 266, y0 + 96), '模型', font=f_cjk(14), fill=FG)
    d.rounded_rectangle((x1 - 266, y0 + 124, x1 - 58, y0 + 164), radius=8, fill=BG, outline=LINE, width=1)
    d.text((x1 - 252, y0 + 135), 'Gemini 3.5 Flash-Lite', font=f_en(14), fill=DIM)

    sx0, sy0, sx1, sy1 = pill_btn(d, x0 + 36, y0 + 252, '儲存設定', ACCENT, font=f_cjk(15), pad_x=18, pad_y=10)
    tx0, ty0, tx1, ty1 = pill_btn(d, sx1 + 14, y0 + 252, '測試 API key', CARD_BG, border=ACCENT, font=f_cjk(15), pad_x=18, pad_y=10)
    vx = tx1 + 20
    vy = y0 + 271
    d.line([(vx, vy), (vx + 5, vy + 5), (vx + 13, vy - 5)], fill=GREEN, width=3)
    d.text((vx + 20, y0 + 262), 'API key 驗證成功', font=f_cjk(15), fill=GREEN)
    draw_cursor(d, tx1 - 16, ty1 - 5, ring_color=ACCENT)
    frames.append(im)

    return frames


def draw_anthropic_shell(d, x0, y0, x1, y1, active_nav):
    # Sidebar
    sx1 = x0 + 176
    d.rectangle((x0 + 2, y0, sx1, y1 - 2), fill=SIDEBAR_BG)
    d.line([(sx1, y0), (sx1, y1)], fill=LINE, width=1)
    d.text((x0 + 22, y0 + 22), 'Anthropic Console', font=f_en(14), fill=DIM)
    navs = ['Dashboard', 'API keys', 'Billing', 'Limits']
    for i, name in enumerate(navs):
        ny = y0 + 64 + i * 40
        if name == active_nav:
            d.rounded_rectangle((x0 + 14, ny, sx1 - 14, ny + 32), radius=7, fill=ACCENT_SOFT)
        d.text((x0 + 26, ny + 7), name, font=f_en(14), fill=FG if name == active_nav else DIM)
    return sx1 + 28


def build_anthropic():
    frames = []

    # Step 1: Billing -> Buy credits
    im, d, (x0, y0, x1, y1) = draw_browser('https://console.anthropic.com/settings/billing', 1, '先到左側「Billing」點「Buy credits」儲值（與 Claude Pro 分開）')
    cx = draw_anthropic_shell(d, x0, y0, x1, y1, 'Billing')
    d.text((cx, y0 + 26), 'Billing', font=f_en(24), fill=FG)
    d.rounded_rectangle((cx, y0 + 68, x1 - 32, y0 + 106), radius=8, fill=AMBER_BG, outline=AMBER, width=1)
    d.text((cx + 14, y0 + 78), '需先儲值才可使用 API（無免費額度，未儲值會回傳 credit balance is too low）', font=f_cjk(13), fill=(255, 224, 130))
    d.rounded_rectangle((cx, y0 + 124, x1 - 32, y1 - 30), radius=10, fill=CARD_BG, outline=LINE, width=1)
    d.text((cx + 22, y0 + 144), 'Credit balance', font=f_en(14), fill=DIM)
    d.text((cx + 22, y0 + 170), '$0.00', font=f_en(30), fill=FG)
    bx0, by0, bx1, by1 = pill_btn(d, cx + 22, y0 + 226, 'Buy credits', ACCENT, border=(190, 175, 255))
    draw_cursor(d, bx1 - 16, by1 - 5, ring_color=ACCENT)
    frames.append(im)

    # Step 2: API keys -> Create Key
    im, d, (x0, y0, x1, y1) = draw_browser('https://console.anthropic.com/settings/keys', 2, '切到左側「API keys」，點擊右上角「Create Key」')
    cx = draw_anthropic_shell(d, x0, y0, x1, y1, 'API keys')
    d.text((cx, y0 + 26), 'API keys', font=f_en(24), fill=FG)
    bx0, by0, bx1, by1 = pill_btn(d, x1 - 170, y0 + 24, '+ Create Key', ACCENT, border=(190, 175, 255))
    d.rounded_rectangle((cx, y0 + 82, x1 - 32, y1 - 30), radius=10, fill=CARD_BG, outline=LINE, width=1)
    d.text((cx + 22, y0 + 104), 'Name your key (e.g. youtube-tutor)', font=f_en(14), fill=DIM)
    d.rounded_rectangle((cx + 22, y0 + 134, cx + 360, y0 + 174), radius=8, fill=BG, outline=LINE, width=1)
    d.text((cx + 34, y0 + 144), 'youtube-tutor', font=f_mono(15), fill=FG)
    draw_cursor(d, bx1 - 16, by1 - 5, ring_color=ACCENT)
    frames.append(im)

    # Step 3: Copy sk-ant-... once
    im, d, (x0, y0, x1, y1) = draw_browser('https://console.anthropic.com/settings/keys', 3, '金鑰只會完整顯示這一次，當場按「Copy Key」複製保存')
    cx = draw_anthropic_shell(d, x0, y0, x1, y1, 'API keys')
    d.rounded_rectangle((cx, y0 + 36, x1 - 32, y1 - 34), radius=12, fill=CARD_BG, outline=LINE, width=2)
    d.text((cx + 24, y0 + 58), 'Save your key', font=f_en(20), fill=FG)
    d.rounded_rectangle((cx + 24, y0 + 96, x1 - 56, y0 + 132), radius=8, fill=AMBER_BG, outline=AMBER, width=1)
    d.text((cx + 38, y0 + 106), '關閉視窗後將無法再次查看此金鑰，請務必當場複製。', font=f_cjk(13), fill=(255, 224, 130))
    d.rounded_rectangle((cx + 24, y0 + 152, x1 - 190, y0 + 194), radius=8, fill=BG, outline=ACCENT, width=1)
    d.text((cx + 38, y0 + 163), 'sk-ant-api03-xK9mQp7...', font=f_mono(14), fill=(200, 186, 255))
    kx0, ky0, kx1, ky1 = pill_btn(d, x1 - 174, y0 + 152, 'Copy Key', ACCENT, border=(190, 175, 255), pad_x=16, pad_y=9)
    draw_cursor(d, kx1 - 16, ky1 - 5, ring_color=ACCENT)
    frames.append(im)

    # Step 4: Paste back into Extension Settings
    im, d, (x0, y0, x1, y1) = draw_browser('chrome-extension://.../options.html', 4, '貼回擴充設定頁，按「儲存設定」再按「測試 API key」')
    icon = Image.open(ICON_PATH).convert('RGBA').resize((36, 36), Image.LANCZOS)
    im.paste(icon, (x0 + 36, y0 + 24), icon)
    d.text((x0 + 84, y0 + 28), 'Language Tutor in YouTube · 設定', font=f_cjk(18), fill=FG)
    d.rounded_rectangle((x0 + 36, y0 + 78, x1 - 36, y0 + 230), radius=12, fill=CARD_BG, outline=LINE, width=1)
    d.text((x0 + 58, y0 + 96), 'Anthropic API Key', font=f_en(14), fill=FG)
    d.rounded_rectangle((x0 + 58, y0 + 124, x1 - 290, y0 + 164), radius=8, fill=BG, outline=ACCENT, width=2)
    d.text((x0 + 72, y0 + 135), 'sk-ant-api03-••••••••••', font=f_mono(15), fill=FG)
    d.text((x1 - 266, y0 + 96), '模型', font=f_cjk(14), fill=FG)
    d.rounded_rectangle((x1 - 266, y0 + 124, x1 - 58, y0 + 164), radius=8, fill=BG, outline=LINE, width=1)
    d.text((x1 - 252, y0 + 135), 'Claude Sonnet 5.5', font=f_en(14), fill=DIM)

    sx0, sy0, sx1, sy1 = pill_btn(d, x0 + 36, y0 + 252, '儲存設定', ACCENT, font=f_cjk(15), pad_x=18, pad_y=10)
    tx0, ty0, tx1, ty1 = pill_btn(d, sx1 + 14, y0 + 252, '測試 API key', CARD_BG, border=ACCENT, font=f_cjk(15), pad_x=18, pad_y=10)
    vx = tx1 + 20
    vy = y0 + 271
    d.line([(vx, vy), (vx + 5, vy + 5), (vx + 13, vy - 5)], fill=GREEN, width=3)
    d.text((vx + 20, y0 + 262), 'API key 驗證成功', font=f_cjk(15), fill=GREEN)
    draw_cursor(d, tx1 - 16, ty1 - 5, ring_color=ACCENT)
    frames.append(im)

    return frames


OUT.mkdir(parents=True, exist_ok=True)
for name, fn in [('gemini', build_gemini), ('anthropic', build_anthropic)]:
    imgs = fn()
    for i, im in enumerate(imgs, 1):
        p = OUT / f'{name}-{i}.png'
        im.save(p, optimize=True)
        print(f'  {p.relative_to(ROOT)}  {p.stat().st_size // 1024}KB')
    webp_path = STORE / f'{name}-walkthrough.webp'
    imgs[0].save(webp_path, save_all=True, append_images=imgs[1:], duration=2600, loop=0)
    print(f'  {webp_path.relative_to(ROOT)}  {webp_path.stat().st_size // 1024}KB')
