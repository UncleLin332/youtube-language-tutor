# Language Tutor in YouTube

一個 Chrome 擴充：看 YouTube 影片時，每播放約 30 秒就自動暫停，整理這一段的單字與片語，
再帶你一句一句複習（可單句重播、0.75 倍速跟讀、聽寫模式），複習完按「繼續」接著下一段。

分析可以用 **Claude（Anthropic）** 或 **Gemini（Google）**，在設定頁切換，需要你自己的 API key。

## 安裝

1. 打開 `chrome://extensions`
2. 右上角開啟「開發人員模式」
3. 點「載入未封裝項目」，選擇這個資料夾
4. 點一下工具列的擴充圖示開啟設定頁：選 AI 供應商（Claude 或 Gemini）、填對應的 API key
   （console.anthropic.com 或 aistudio.google.com 申請），選好學習語言（預設法文）與每段長度，按「儲存」
5. 打開任何一支有字幕的 YouTube 影片，面板會出現在右邊欄最上方

## 用法

- **要自己啟動**：不是每支影片都是拿來學語言的，所以預設什麼都不做——不抓字幕、不碰轉錄稿面板、
  不呼叫 API。按面板上的「開始學習這部影片」或**點工具列的擴充圖示**才會開始，啟動中的分頁
  圖示會顯示 `ON`。按標頭的 ⏹ 或再點一次圖示就結束。想每支影片都自動啟動的話，設定頁有開關。
- **自動暫停**：播到段落結尾會自動停下並整理這段內容。面板右上角的「⏸ 自動 / ▷ 連續」可以隨時切換。
- **逐句複習**：點任何一句就會重播那一句；`0.75×` 是放慢跟讀。
- **顯示翻譯 / 聽寫模式**：兩個開關。聽寫模式會先把原文模糊起來，只靠聽力，點該句才揭曉。
- **框選句子的一小段**：用滑鼠在法文那一行拉出一段，會跳出「💡 解說」和「★ 收藏這段」。
  句子太長只想記住其中一個子句、或只有某個結構看不懂時用。
- **★**：句子、單字、片語、文法重點都可以收藏，**再點一下取消**，跨影片保存在生字本裡。
  句子會變成 Anki 的句子卡（正面原文、背面翻譯），是最接近實際使用情境的卡型。
- **匯出**：每段複習畫面底部的「★ 匯出收藏 (N)」隨時可按，不必等影片看完。
- **影片播完**：出現完成畫面，列出這部影片的統計，也可以匯出收藏或全部。

## 架構

| 檔案 | 作用 |
|---|---|
| `content/bridge.js` | 跑在頁面主世界，讀 YouTube 的 `getPlayerResponse()` 拿字幕軌清單 |
| `content/transcript.js` | 主要抓「轉錄稿面板」的 DOM；timedtext 當退路 |
| `content/segmenter.js` | 切段（句尾優先，其次最接近設定秒數）＋ 句子時間對應 |
| `content/app.js` | 監聽 `timeupdate`、暫停／單句播放、串起整個流程 |
| `content/panel.js` / `panel.css` | 右側面板 UI（側欄被隱藏時自動改成浮動面板） |
| `background/providers.js` | Claude／Gemini 的請求與解析（測試台共用同一份） |
| `background/service-worker.js` | 呼叫 API（content script 受 CORS 限制不能直接打）＋ 結果快取 |
| `shared/anki.js` | 匯出成 Anki 可直接匯入的 CSV（面板與設定頁共用） |
| `options/` | 設定頁與生字本 |
| `icons/` | 工具列與商店圖示（**目前是佔位圖**，見下方「上架」） |

## 開發用的測試

```bash
node test/run.js      # 語法、manifest、三支測試一次跑完，有問題就回傳非 0
```

| 檔案 | 測什麼 | 項目 |
|---|---|---|
| `test/segment-test.js` | 切段與句子時間（純函式） | 25 |
| `test/pause-test.js` | 暫停時機與寬限期（載入真正的 app.js） | 16 |
| `test/export-test.js` | 收藏、取消、三種匯出格式（載入真正的 app.js） | 33 |

`test/harness.js` 把 chrome、DOM 與面板換成 stub，讓真正的 content script
可以在 node 裡跑，並提供假的 `<video>` 讓測試手動推進時間。

**重點是載入真正的程式碼，不是複製一份來測。** 這個專案已經兩次因為
「複製品測過了，但真正的程式碼沒接上」而出事——面板呼叫
`exportCsv('starred')`，而 `exportCsv` 根本沒宣告那個參數，兩邊各自都沒錯，
`node --check` 也一路綠燈。

瀏覽器端的東西（面板外觀、YouTube 的 DOM、真實 API 呼叫）沒辦法用 node 測，
那部分靠這兩個手動工具：

```bash
python3 -m http.server 8731
# test/panel-preview.html  看面板各種狀態的外觀
# test/api-test.html       貼上 key 打一次真實 API，看輸出品質
```

## 關於 API 與費用

兩家都支援，在設定頁切換；兩邊的 key 和模型各自記住，隨時可以換回來。

| 供應商 | 端點 | 可選模型 |
|---|---|---|
| Claude | `api.anthropic.com/v1/messages` | Opus 5.5（預設）／Sonnet 5.5／Haiku 5.5 |
| Gemini | `generativelanguage.googleapis.com/v1beta/interactions` | 3.5 Flash-Lite（預設）／3.8 Flash／4 Hydrogen |

- 兩邊共用同一份 JSON Schema 來約束輸出：Claude 走 `output_config.format`，
  Gemini 走 `response_format`。兩家的 schema 格式剛好都是標準 JSON Schema，不用各寫一份。
- Gemini 在 2026/05 換成了 **Interactions API**（舊的 `generateContent` 已列為 legacy，
  舊的 `outputs[]` 回應格式在 2026/06/08 移除）。這裡打的是新端點，並送
  `Api-Revision: 2026-05-20` 釘住 `steps[].content[].text` 這個回應格式；解析時兩種格式都認。
- Gemini 預設用最便宜的 3.5 Flash-Lite；Claude 預設是 Opus 5.5，想省錢可以往下選到 Haiku 5.5（約 1/40 價）。
  以「抽單字、翻句子」這種任務來說，便宜的模型多半就夠用了。
- 每段分析結果都會以 `videoId + 供應商 + 模型 + 段落時間` 為鍵快取在本機，
  重看同一部影片不會重複付費。切換供應商、模型或改段落長度會產生新的快取。
- API key 只存在 `chrome.storage.local`，請求直接從你的瀏覽器送出。如果你不想讓 key 進瀏覽器，
  可以把 `background/service-worker.js` 裡的 `ANTHROPIC_URL` / `GEMINI_URL` 指向自己跑的一支小 proxy。
- 兩邊都有「逐步降級」：萬一你的帳號或模型不吃結構化輸出的參數，會自動拿掉重試、
  改用提示詞要求純 JSON，而不是整個壞掉。
- 這裡用 `fetch` 直接打 REST 而不是官方 SDK，是為了讓擴充不需要任何 build step，
  解壓即可「載入未封裝項目」。

## 字幕是怎麼抓的

跟播放器要。`captionTracks` 裡的 `baseUrl` 直接 fetch 會回 **HTTP 200 但 body 是空的**
——YouTube 現在要求 proof-of-origin 權杖（網址裡的 `pot` 參數）。但播放器自己抓得到，
而它發出的請求會留在瀏覽器標準的 Resource Timing 裡：

1. 裝 `PerformanceObserver` 監看 `/api/timedtext`
2. 用播放器 API 把字幕軌切到設定的語言（人工字幕優先，其次自動產生）
3. 攔下播放器發的網址——它帶著權杖
4. 自己用 `fmt=json3` 再抓一次，拿到整份字幕與時間戳
5. 還原使用者原本的字幕設定

不需要偽造任何東西，只是重用播放器剛剛發過的網址。

**必須擋掉帶 `tlang` 的網址**：那是 YouTube 的自動翻譯，會把法文機器翻成日文之類的，
看起來正常但語言是錯的。切軌時也要自己組一個不帶 `translationLanguage` 的軌物件。

實測：

| 影片 | 結果 | 耗時 |
|---|---|---|
| 日文教學（24 條字幕軌，中文排第一）| 276 行日文 | 161 ms |
| 法文（只有自動字幕）| 59 行法文 | 165 ms |
| 跟它要沒有的韓文 | 明確回報並列出可用語言 | 0 ms |

這條路取代了舊的做法（抓 YouTube 轉錄稿面板的 DOM），好處是：
**語言跟著設定走**、不用打開 YouTube 的面板、沒有轉錄稿的影片也能用、
時間戳比面板更細（面板一行 5～8 秒，字幕檔一行 3～4 秒）。

轉錄稿面板留著當退路，只在暫時性失敗時才用；那條路的語言不可控，
所以後面的語言檢查更重要。

## 字幕語言對不上時

擴充會檢查抓到的字幕是不是你設定的語言（看文字用的是假名、諺文、西里爾、
漢字還是拉丁字母）。對不上就停下來，告訴你抓到的是什麼語言，**不會送去分析**
——否則會得到「原文和翻譯都是中文」的結果，而且白花錢。

這種情況在「給中文觀眾看的日文教學影片」特別常見：創作者上傳了多國字幕，
中文排在前面，YouTube 就依你的帳號語言挑了中文。

能做的：換一支沒有中文字幕的影片、把學習語言改成偵測到的語言、
或按「仍要用這份字幕」強制繼續。

拉丁字母的語言（法文／西班牙文／英文…）彼此分不出來，所以不會互相誤擋。

## 面板出現在哪裡

正常寬度的視窗：掛在右側欄最上方（`#secondary-inner`）。

視窗變窄、劇院模式或全螢幕時，YouTube 會把右側欄設成 `display:none`
（元素還留在 DOM 裡，只是不顯示），這時面板會自動改成右上角的浮動視窗。
版面變動時會自動搬家——監聽 resize，並每 2 秒檢查一次（切劇院模式不一定會觸發 resize）。

在真實影片頁上驗證過：視窗 268px 時走浮動、1440px 時掛進側欄並渲染在 (1028, 68)、寬 396px。

## 上架

```bash
./package.sh     # 先跑完整測試，再打包成 dist/youtube-language-tutor-<版本>.zip
```

打包用**白名單**：只收 `manifest.json`、`icons/`、`content/`、`background/`、`options/`、`shared/`。
用排除法的話，哪天多一個資料夾就會默默被包進去。目前 17 個檔案、44KB。

| 檔案 | 作用 |
|---|---|
| `PRIVACY.md` | 隱私權政策。商店的「隱私權政策網址」就填這個檔在 GitHub 上的連結 |
| `store/listing.md` | 商店列表文案、單一用途說明、每個權限的理由、資料用途申報怎麼勾 |
| `package.sh` | 打包 |

```bash
python3 store/make-icons.py    # 從 store/icon-source-2000.png 產生 icons/ 的四個尺寸
```

要換圖的話覆蓋 `store/icon-source-2000.png` 再跑一次，`manifest.json` 不用改。
寫成腳本是因為手動縮圖容易漏掉兩件事：**四角要去背**（原圖的圓角外面是白的，
留著的話在深色工具列上會看到一圈白），以及**用 LANCZOS 縮小**。

```bash
python3 store/make-screenshots.py <原圖資料夾> store/screenshots
```

商店截圖在 `store/screenshots/`，三張 1280×800。腳本做兩件事：把全視窗截圖裁成
商店只接受的 1.6 比例，並把兩個帳號頭像模糊掉。

```bash
python3 store/make-promo.py .    # 440×280 小宣傳圖
```

小宣傳圖是排版排出來的，不是生圖模型畫的——生成的圖會在畫面裡寫出不存在的單字。
字級是演算法套出來的而不是寫死的，所以改了字也不會爆版（第一版寫死，右邊直接被切掉）。

商店要的素材到這裡就齊了：圖示、三張截圖、小宣傳圖。

`test/run.js` 會檢查 manifest 裡的圖示路徑真的有檔案——指到不存在的圖，
Chrome 是**整包載入失敗**，不是只少一張圖。

### 為什麼 content script 的比對範圍不能收窄成 `/watch`

送審時這一條要寫清楚，否則會被問。YouTube 是單頁應用程式：從首頁點進影片不會重新載入頁面，
所以如果只在 `*://www.youtube.com/watch*` 注入，使用者從首頁點進去時指令碼根本不會被載入。
`app.js` 是靠監聽 `yt-navigate-finish` 來換頁的，前提是它已經活著。
比對範圍涵蓋整站、但只在 `/watch` 上實際動作。

## 已知限制

- **影片必須有字幕**（自動字幕可以）。沒有字幕的影片無法分析。
- 自動字幕沒有標點、偶爾有辨識錯誤；模型會重新斷句與修正明顯錯誤，但不保證完全正確。
- 轉錄稿的時間戳是整行的（常常 5～8 秒一行），所以段落長度只能逼近設定值而不是剛好 30 秒。
  單句播放用字數流動模型把一行的時長分給句子（見下），是逼近值不是精確值——
  語速有快慢，起點可能差個一兩秒。
- **轉錄稿的語言不受設定控制。** YouTube 依你的帳號語言挑字幕軌，而新版的轉錄稿面板
  沒有切換語言的選項。實測一支有 24 條字幕軌的日文影片（中文排第一），面板給的是中文：
  改播放器的字幕軌、關掉面板重開、加 `hl` 參數都改不了它。
  現在擴充會偵測並擋下來（見下），不會把中文當成日文拿去分析。
- YouTube 會改 DOM，面板的元件名稱換過不只一次（舊的 `ytd-transcript-segment-renderer`
  在新版已經完全不存在）。哪天失效的話主要修 `content/transcript.js` 最上面那幾個選擇器。
- 只處理 `www.youtube.com` 的 `/watch` 頁面，不支援嵌入播放器與 YouTube Music。
- 整個流程已用真實 API key 在真實 YouTube 頁面上端對端跑過多次（2026/11）：字幕抓取、切段、
  分析、複習、匯出都正常。
- Google 的模型淘汰得很快，Gemini 那邊哪天出現 404 的話，到設定頁換一個模型即可。
