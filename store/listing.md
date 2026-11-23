# Chrome Web Store 上架用文案

送審時把這份文件裡的欄位逐一貼進開發者後台。改了程式之後如果資料處理方式有變，
記得回來同步這份文件與 [`../PRIVACY.md`](../PRIVACY.md)。

---

## 1. 商店列表（Store listing 分頁）

**名稱**（45 字元內）

```
Language Tutor in YouTube
```

> 名稱**不能以 YouTube 開頭**。YouTube 的品牌規範寫得很明確：應用程式名稱裡不能含
> YouTube 或其變體（例如不能叫「YouTube for Kids」），但可以在描述文字裡說明
> 「這是給 YouTube 用的工具」。所以 YouTube 放在後面當描述，不放在前面當品牌。
> 以後想改名的話這條還是要遵守。

**簡短說明**（132 字元內，與 `manifest.json` 的 `description` 一致）

```
觀看 YouTube 時自動分段暫停，整理單字與片語並帶你逐句複習。
```

**詳細說明**（已整合新版強效開頭、統一 Anki 匯出、圖文申請教學與精簡設定說明，可直接複製貼入後台「說明 *」）

```
看 YouTube 學外語時，不必再邊聽邊查字典打斷節奏——先完整聽完一段，再一次學完重點。

這個擴充會在影片每播放約 30 秒時自動暫停於句尾，整理出這段的單字、片語、文法重點與逐句翻譯，並帶你一句一句跟讀複習；聽的時候專心輸入，停下來的時候才學。

■ 主要功能

・自動分段暫停：每 30 秒於句尾自動暫停並整理重點，也可隨時一鍵切換「連續播放」。
・逐句複習與聽寫：點任一句立即重播，支援 0.75× 慢速跟讀；開啟聽寫模式可先遮住原文專注練聽力。
・框選即時解說：用滑鼠選取句子裡不懂的片段，直接問 AI「這幾個字在這句裡是什麼意思」。
・一鍵收藏與匯出：單字、片語、句子、文法都能按 ★ 跨影片保存，並匯出成 Excel 詳細表格，或直接匯入 Anki（免設定兩欄格式，內建 Basic 即可匯入）。
・背景預先整理：觀看影片時會在背景預抓下一段，停下來就能馬上開始學，不必空等。

■ 使用前請注意

・需填入自己的 AI API Key（Google Gemini 有免費額度，或選 Anthropic Claude；設定頁內建圖文步驟教學，新手也能輕鬆完成）。本擴充不經手也不加收費用，分析結果亦會快取於本機，重看同一段不會重複付費。
・影片需有字幕（支援 YouTube 自動產生字幕）。
・支援十種語言：法文、英文、日文、韓文、西班牙文、德文、義大利文、葡萄牙文、中文、俄文，會自動匹配你設定的學習語言字幕。
・不會擅自執行：開啟影片預設保持靜止，按下「▶ 開始學習這部影片」或點擊工具列圖示才會開始。

■ 隱私承諾

本擴充沒有後端伺服器，作者收不到你的任何資料。API Key、設定、生字本與快取全數僅存於你的瀏覽器本機；只有在你主動啟動影片學習後，才會由瀏覽器直接將字幕與標題送往你選用的 AI 供應商分析。詳見隱私權政策。

開放原始碼：https://github.com/UncleLin332/youtube-language-tutor

■ 支持開發

本擴充免費、無廣告、不收集資料。如果這個工具曾幫你聽懂一段外語影片，歡迎請河童喝杯咖啡支持我們推進開發：
https://ko-fi.com/kappa46122
```

> 贊助連結放在詳細說明的最後面，不要放在開頭——商店列表只會先顯示前幾行，
> 開頭就要錢會直接影響安裝率。設定頁裡的那顆按鈕同理，放在最底下。

**類別**：教育（Education）
**語言**：繁體中文

**其他欄位**

| 欄位 | 填什麼 |
|---|---|
| 官方網址 | **留空**。這一欄要的是在 Google Search Console 驗證過所有權的網域，不是隨便一個網址。欄位下面寫「找不到已註冊的網址」就是這個意思。GitHub 不是你的網域，驗不了 |
| 首頁網址 | `https://github.com/UncleLin332/youtube-language-tutor` |
| 支援網址 | `https://github.com/UncleLin332/youtube-language-tutor/issues` |
| 成人內容 | 關 |

支援網址指到 issues 而不是 repo 首頁——使用者點「支援」是遇到問題要回報，
直接到開 issue 的地方，比丟到首頁讓他自己找省一步。

---

## 2. 隱私權實務（Privacy practices 分頁）

**單一用途說明**（Single purpose）

```
在 YouTube 影片頁上自動分段暫停，並整理該段字幕中的單字、片語與文法，協助使用者學習外語。
```

**權限理由**（每一項都要填，照抄即可）

| 欄位 | 填什麼 |
|---|---|
| `storage` | 儲存使用者的設定（AI 供應商、API key、學習語言）與收藏的生字本。沒有這個權限，使用者每次開啟瀏覽器都要重新設定，收藏的單字也無法跨影片保存。 |
| `unlimitedStorage` | 每段字幕的分析結果會快取在本機，讓使用者重看同一部影片時不必重複呼叫付費 API。長時間使用後快取會超過 `storage.local` 的預設 10MB 上限，因此需要此權限。擴充內建自動清理機制，只保留最近的快取。 |
| 主機權限 `https://api.anthropic.com/*` | 將字幕內容送往 Anthropic 的 Claude API 進行分析，使用的是使用者自己填入的 API key。內容指令碼受 CORS 限制無法直接呼叫，因此請求由 service worker 發出。 |
| 主機權限 `https://generativelanguage.googleapis.com/*` | 同上，供使用者選擇 Google Gemini 作為分析供應商時使用。兩者擇一，不會同時呼叫。 |
| 內容指令碼 `*://www.youtube.com/*` | 在 YouTube 影片頁插入學習面板、取得使用者所學語言的字幕軌、並控制影片的暫停與單句重播。字幕是透過 YouTube 自己的播放器 API 切換到目標語言後取得的，使用者原本的字幕設定會在讀取完畢後還原。<br><br>比對範圍必須涵蓋整個 `www.youtube.com` 而非只有 `/watch`，因為 YouTube 是單頁應用程式：使用者從首頁點進影片時不會重新載入頁面，若只在 `/watch` 注入，指令碼就不會被載入。擴充只在 `/watch` 頁面上實際動作，其餘頁面不做任何事。 |

> **後台只有一個「要求網站存取權限的理由」欄位**，上面三個主機相關的列要合成一段貼進去
> （上限 1000 字）。下面這段是合併版，449 字：

```
本擴充需要三個網域的存取權，用途各自獨立。

www.youtube.com（內容指令碼）：在影片頁插入學習面板、取得使用者所選學習語言的字幕軌、控制影片的暫停與單句重播。比對範圍涵蓋整個網域而非只有 /watch，是因為 YouTube 是單頁應用程式：使用者從首頁點進影片時不會重新載入頁面，若只在 /watch 注入，指令碼不會被載入。擴充只在 /watch 頁面實際運作，其餘頁面不做任何事；且預設不自動啟動，必須由使用者在該影片上按下「開始學習這部影片」才會開始。

api.anthropic.com 與 generativelanguage.googleapis.com：把該段字幕文字送去分析，產生單字、片語、翻譯與文法說明。使用的是使用者自己在設定頁填入的 API key，兩者擇一，不會同時呼叫。內容指令碼受 CORS 限制無法直接呼叫這兩個端點，因此請求由 service worker 發出。

除上述三者外不存取任何其他網站，不蒐集瀏覽紀錄，也沒有任何屬於開發者的伺服器。
```

**遠端程式碼**：否。所有程式碼都包含在套件內，沒有 `eval`、沒有動態載入的指令碼。

**資料用途申報**（Data usage）

勾選蒐集的類型：

- ☑ **網站內容（Website content）** — 使用者啟動的那支 YouTube 影片的字幕文字、標題與網址，
  傳送給使用者自行選擇並付費的 AI 供應商以產生學習筆記。
- ☑ **驗證資訊（Authentication information）** — 使用者自己的 API key。只存在本機，
  僅作為請求標頭送往該供應商，不會傳送給開發者。
- ☐ 其他所有類型都不勾（個人身分資訊、健康、財務、個人通訊、位置、瀏覽紀錄、使用者活動）

三個必填的聲明全部勾選：

- ☑ 不販售或移轉使用者資料給第三方（上述 AI 供應商為使用者自行選擇的服務，非移轉）
- ☑ 不將使用者資料用於與單一用途無關的目的
- ☑ 不將使用者資料用於判定信用狀況或放貸

**隱私權政策網址**

```
https://github.com/UncleLin332/youtube-language-tutor/blob/main/PRIVACY.md
```

> 送審前先把 repo 設為 public 並確認這個網址用無痕視窗打得開，否則審核會直接卡住。
> 想要更正式的網址的話，開 GitHub Pages 再換成 `https://unclelin332.github.io/...` 也可以。

---

## 3. 圖片素材

| 用途 | 尺寸 | 必要性 | 檔案 |
|---|---|---|---|
| 商店圖示 | 128×128 | 必要 | `icons/icon128.png` ✅ |
| 截圖 | 1280×800 | 至少 1 張，最多 5 張 | `store/screenshots/` ✅ 三張 |
| 小宣傳圖 | 440×280 | 必要 | `store/promo-440x280.png` ✅ |
| 跑馬燈宣傳圖 | 1400×560 | 選填 | `store/promo-1400x560.png` ✅ |
| 通用宣傳影片 | YouTube 網址 | 選填 | 還沒做 |

宣傳影片那格要的是一支 YouTube 影片網址。做了使用教學影片的話就填這裡——
那是商店列表上唯一能展示「自動暫停 → 筆記出現 → 收藏 → 匯出」這個流程的地方，
靜態截圖講不出時間感。等審查通過之後再補，審查期間不要動商店列表。

兩張宣傳圖使用 Nano Banana 生成無雜字的河童插畫底圖（`store/promo-mascot-bg.png`），再由 `store/make-promo.py`
以演算法排版疊加銳利文字（避免生圖模型自己寫錯字）。

跑馬燈與展示截圖皆規定 **JPEG 或 24 位元 PNG、不能有 alpha 透明層**，所有腳本皆以 `RGB` 模式輸出並經過 assert 檢查。

排版遵守官方素材指引：**避免文字過多**（只有名稱與一行核心賣點）、**縮到一半還要看得懂**、**飽和色彩且少白灰底**，
且不放 Chrome、YouTube、Anki 商標或假的「Add to Chrome」按鈕。

圖示四個尺寸已經做好（`icons/`），原圖是 `store/icon-source-2000.png`，商店圖示上傳 `icons/icon128.png`。

**展示版截圖已經做好五張**（商店上限），位於 `store/showcase/`（並同步於 `dist/上傳用/商店展示版截圖/`），按檔名順序上傳：

| 檔名 | 展示什麼 |
|---|---|
| `01-單字與片語整理.png` | 法文。逐句翻譯＋單字卡（讀書河童徽章） |
| `02-框選解說.png` | 日文。框選句子片段後逐詞拆解，展現差異化功能（耳機河童徽章） |
| `03-日文也可以.png` | 日文的逐句對照與單字（讀書河童徽章） |
| `04-逐句複習與翻譯.png` | 逐句重播、`0.75×` 慢速跟讀與聽寫模式（耳機河童徽章） |
| `05-匯出與圖文設定.png` | 新版 `2.0.0` 圖文 API 申請教學＋完成統計與匯出 Anki／Excel（咖啡河童徽章） |

> 💡 `01`～`04` 的原始截圖位於 `store/screenshots/raw/`，為 `1.0.0` 舊版面板樣式。日後若實機用 `2.0.0` 重拍這 4 張放入 `raw/`，依序執行 `python3 store/make-screenshots.py` 與 `python3 store/make-store-cards.py` 即可自動更新整套 `1280×800` 展示圖。

---

## 4. 送審前的最後確認

- [x] `node test/run.js` 全綠（114 項測試＋語法＋manifest 檢查全過）
- [x] 用真實 API key 完整跑過一支影片：啟動 → 暫停 → 筆記出現 → 收藏 → 匯出 ✅ 2026/11
- [ ] 另一家供應商也切過去跑一次（審核員不會知道你平常只用哪一家）
- [x] `icons/` 已換成正式圖
- [ ] repo 已 public，隱私權政策網址無痕可開
- [x] `./package.sh` 已產出 `dist/youtube-language-tutor-2.0.0.zip`（白名單打包，不含 `test/`、`.git/`）
- [ ] 把 `dist/youtube-language-tutor-2.0.0.zip` 解開後以「載入未封裝項目」在 Chrome 實測一次（審核員就是這樣測的）

---

## 5. 英文商店文案（選填 · 若要在 Chrome Web Store 新增 English 語系）

**Name**
```
Language Tutor in YouTube
```

**Summary**（113 字元，符合 132 字元上限）
```
Auto-pause YouTube every 30s to organize vocabulary, phrases, and grammar notes—then review sentence by sentence.
```

**Description**
```
Learning languages on YouTube shouldn't mean pausing every three seconds to look up single words in a dictionary.

Language Tutor in YouTube lets you listen first, then learn: the video automatically pauses at natural sentence endings roughly every 30 seconds, extracts key vocabulary, idioms, and grammar notes, and walks you through sentence-by-sentence review.

■ Key Features

- Auto-Pause by Segment: Automatically pauses every ~30s at sentence boundaries to summarize the clip (toggle Continuous Play anytime).
- Sentence Review & Dictation: Click any sentence to replay it, slow down to 0.75x for shadowing, or blur transcripts for dictation practice.
- Highlight to Explain: Select any phrase in a sentence to ask AI what it means and how it works in that exact context.
- Bookmark & Export: Star words, phrases, sentences, or grammar notes across videos and export to Excel-ready CSV or ready-to-import Anki flashcards.
- Background Prefetch: Prepares the next segment while you watch so review starts immediately when the video pauses.

■ Before You Start

- Bring your own API key (Google Gemini with a free tier, or Anthropic Claude—step-by-step visual setup guide included in Settings). Results are cached locally so rewatching never double-charges.
- Requires videos with subtitles (YouTube auto-generated captions work too).
- Supports 10 target languages: French, English, Japanese, Korean, Spanish, German, Italian, Portuguese, Chinese, and Russian.
- Manual activation: Does nothing until you click "Start Learning" on a video or click the toolbar icon.

■ Privacy

No developer servers, no ads, and no tracking. Your API key, settings, wordbook, and cache stay locally in your browser. Captions are sent directly from your browser to your chosen AI provider only after you start a session.

Open source: https://github.com/UncleLin332/youtube-language-tutor

■ Support Development

Free, open-source, and ad-free. If this tool helps you learn from YouTube videos, consider buying the kappa a coffee:
https://ko-fi.com/kappa46122
```

**2.0.0 更新重點（供 GitHub Release 或備忘用）**
```
- 全新精簡側邊面板與設定頁介面，移除冗餘選項，保留最直覺的學習流程
- 設定頁內建 Gemini 與 Claude API Key 互動式圖文申請教學
- Anki 匯出統一為免設定兩欄格式，支援內建 Basic 牌組直接匯入
- 新增可愛河童咖啡贊助卡片與摺疊式隱私說明
```
