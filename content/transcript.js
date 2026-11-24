// 取得影片字幕
//
// 主要路徑：向播放器取得字幕（見 fetchViaPlayer）。bridge.js 取得播放器自己發出的
//           timedtext 網址（已帶有 proof-of-origin 權杖），再由此處請求 json3 格式的字幕。
// 備援路徑：YouTube 的「顯示轉錄稿」面板（2026/11 觀察：整份轉錄稿會一次渲染進 DOM，
//           沒有虛擬捲動，可直接讀完）。僅在播放器路徑發生暫時性失敗時使用，且語言無法控制。
// 注意：直接 fetch captionTracks 的 baseUrl，現在多數影片會回傳 HTTP 200 但內容為空
//       （需要 PO token），因此不採用；任何字幕來源都必須檢查內容長度。
(() => {
  const LY = globalThis.LY;

  // 新版 (transcript-segment-view-model) 與舊版 (ytd-transcript-segment-renderer) 都支援
  const ROW_SEL = 'transcript-segment-view-model, ytd-transcript-segment-renderer';
  const TS_SEL = '.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp';
  const TX_SEL = 'span[role="text"], .segment-text';
  const BTN_RE = /show transcript|transcript|顯示轉錄稿|轉錄稿|逐字稿|字幕記錄|文字稿/i;
  const HIDE_RE = /hide|隱藏|关闭|關閉/i;

  function readRows() {
    const rows = document.querySelectorAll(ROW_SEL);
    const cues = [];
    for (const r of rows) {
      const tsEl = r.querySelector(TS_SEL);
      const txEl = r.querySelector(TX_SEL);
      if (!tsEl) continue;
      const start = LY.parseTime(tsEl.textContent);
      let text = txEl ? txEl.textContent : '';
      if (!text) {
        // 最後手段：扣掉時間戳與無障礙標籤後剩下的文字
        text = (r.textContent || '').replace(tsEl.textContent, '');
        const a11y = r.querySelector('.ytwTranscriptSegmentViewModelTimestampA11yLabel');
        if (a11y) text = text.replace(a11y.textContent, '');
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (start == null || !text) continue;
      cues.push({ start, end: start + 3, text });
    }
    for (let i = 0; i < cues.length - 1; i++) {
      if (cues[i + 1].start > cues[i].start) cues[i].end = cues[i + 1].start;
    }
    return cues;
  }

  function findToggleButton() {
    const nodes = document.querySelectorAll('button, ytd-menu-service-item-renderer, tp-yt-paper-item');
    for (const n of nodes) {
      const label = (n.getAttribute && n.getAttribute('aria-label')) || '';
      const text = n.textContent || '';
      const s = label + ' ' + text;
      if (BTN_RE.test(s) && !HIDE_RE.test(s)) return n;
    }
    return null;
  }

  const hasRows = () => (document.querySelectorAll(ROW_SEL).length >= 3 ? true : null);

  async function scrapePanel() {
    // 面板可能原本已開啟，或正在載入中：先稍候再決定是否按按鈕，
    // 否則「顯示轉錄稿」是切換開關，按下去反而會將其關閉。
    if (await LY.waitFor(hasRows, 2500, 300)) return { cues: readRows(), opened: false };

    // 轉錄稿按鈕位於影片說明區，說明區尚未渲染時按鈕可能不存在，需稍候
    const btn = await LY.waitFor(findToggleButton, 6000, 400);
    if (!btn) return { cues: [], opened: false };

    btn.click();
    const ok = await LY.waitFor(hasRows, 10000, 300);
    return { cues: ok ? readRows() : [], opened: true };
  }

  function closePanel() {
    try {
      const row = document.querySelector(ROW_SEL);
      const panel = row && row.closest('ytd-engagement-panel-section-list-renderer');
      const close = panel && panel.querySelector('#visibility-button button');
      if (close) close.click();
    } catch (e) { /* 關不掉就算了，不影響功能 */ }
  }

  // ---- 主要路徑：向播放器取得字幕檔 ----
  //
  // captionTracks 內的 baseUrl 直接 fetch 會回傳 200 但內容為空（缺少 proof-of-origin 權杖）。
  // bridge.js 會讓播放器切換到目標語言，攔截其自行發出的網址後交給我們，該網址帶有權杖。
  // 優點：語言依設定決定、不需開啟 YouTube 的轉錄稿面板、沒有面板的影片也能使用。
  function parseJson3(text) {
    const data = JSON.parse(text);
    const cues = [];
    for (const ev of data.events || []) {
      if (ev.aAppend || !ev.segs) continue;      // 滾動字幕的重複片段
      const t = ev.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const start = (ev.tStartMs || 0) / 1000;
      cues.push({ start, end: start + (ev.dDurationMs || 2000) / 1000, text: t });
    }
    return cues;
  }

  async function fetchViaPlayer(settings) {
    // 切換字幕軌並等待播放器發出請求需要數秒，因此設定較長的等待時間
    const res = await LY.askPage('captionUrl', { lang: settings.targetLang }, 20000);
    if (!res) return { cues: [], reason: 'bridge-timeout' };
    if (res.error) return { cues: [], reason: res.error, available: res.available };
    try {
      const u = new URL(res.url);
      u.searchParams.set('fmt', 'json3');
      const r = await fetch(u.toString(), { credentials: 'include' });
      if (!r.ok) return { cues: [], reason: 'http-' + r.status };
      const txt = await r.text();
      if (!txt.trim()) return { cues: [], reason: 'empty' };
      return { cues: parseJson3(txt), lang: res.lang, isAuto: res.isAuto };
    } catch (e) {
      return { cues: [], reason: String((e && e.message) || e) };
    }
  }

  function cleanup(cues) {
    cues.sort((a, b) => a.start - b.start);
    const out = [];
    for (const c of cues) {
      const prev = out[out.length - 1];
      if (prev && c.text === prev.text && c.start - prev.start < 0.5) continue;
      if (prev && prev.end > c.start) prev.end = c.start;
      out.push(c);
    }
    return out;
  }

  // 取得的字幕究竟是什麼語言？
  //
  // YouTube 的轉錄稿面板會依帳號語言選擇字幕軌，而新版介面沒有切換語言的選項
  // （已試過調整播放器的字幕設定與 hl 參數，皆無法改變面板的語言）。
  // 因此一支「日本人講給中文觀眾看」的影片，面板給的可能是中文字幕。
  // 若不檢查，擴充會把中文當成日文原文送去分析，產出「原文與翻譯皆為中文」的結果，
  // 並徒增 API 費用。
  const SCRIPTS = [
    ['ja', /[\u3040-\u309f\u30a0-\u30ff]/, '日文'],      // 假名
    ['ko', /[\uac00-\ud7af]/, '韓文'],
    ['ru', /[\u0400-\u04ff]/, '俄文'],
    ['ar', /[\u0600-\u06ff]/, '阿拉伯文'],
    ['th', /[\u0e00-\u0e7f]/, '泰文'],
    ['zh', /[\u4e00-\u9fff]/, '中文'],                   // 須排在日文之後：日文也含漢字
    ['latin', /[A-Za-zÀ-ÿ]/, '拉丁字母的語言']
  ];

  // 拉丁字母系的語言彼此無法區分（法文／西班牙文／英文…），一律回傳 'latin'
  const LATIN = new Set(['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'id', 'ms', 'vi', 'fil']);
  const scriptOf = (lang) => (LATIN.has(String(lang).toLowerCase().split('-')[0]) ? 'latin'
    : String(lang).toLowerCase().split('-')[0]);

  LY.detectScript = (text) => {
    const t = String(text || '');
    for (const [code, re, name] of SCRIPTS) if (re.test(t)) return { code, name };
    return null;
  };

  // 回傳 null 代表相符；否則回傳不符的描述
  LY.checkLanguage = (cues, targetLang) => {
    const want = scriptOf(targetLang);
    const sample = cues.slice(0, 20).map((c) => c.text).join(' ');
    if (!sample.trim()) return null;
    const got = LY.detectScript(sample);
    if (!got) return null;                 // 無法辨識時不攔阻
    if (got.code === want) return null;
    // 日文字幕若前 20 行恰好全為漢字，會被誤認為中文——需再多取樣
    if (want === 'ja' && got.code === 'zh') {
      const all = cues.map((c) => c.text).join(' ');
      if (/[\u3040-\u309f\u30a0-\u30ff]/.test(all)) return null;
    }
    return { got: got.code, gotName: got.name, want };
  };

  LY.loadCues = async (settings) => {
    const info = await LY.askPage('captions');
    const tracks = (info && info.tracks) || [];
    let cues = [];
    let source = '';
    let lang = null;
    let isAuto = null;
    let reason = null;

    // 1. 跟播放器要（語言可控）
    const viaPlayer = await fetchViaPlayer(settings);
    if (viaPlayer.cues.length >= 3) {
      cues = viaPlayer.cues;
      source = 'player';
      lang = viaPlayer.lang;
      isAuto = viaPlayer.isAuto;
    } else {
      reason = viaPlayer.reason;
      // 這支影片確實沒有該語言的字幕：退回面板也只會取得其他語言，
      // 不如直接回報原因，也避免操作 YouTube 的面板
      if (reason !== 'no-track' && reason !== 'no-captions') {
        LY.log('跟播放器要字幕失敗（' + reason + '），改抓轉錄稿面板');
        const panel = await scrapePanel();
        if (panel.cues.length >= 3) {
          cues = panel.cues;
          source = 'panel';
          if (panel.opened) closePanel();
        }
      }
    }

    const clean = cleanup(cues);
    return {
      cues: clean,
      mismatch: clean.length ? LY.checkLanguage(clean, settings.targetLang) : null,
      source,
      reason,
      title: (info && info.title) || document.title,
      langUsed: lang || (tracks[0] ? tracks[0].languageCode : null),
      isAuto: isAuto == null ? (tracks[0] ? tracks[0].kind === 'asr' : null) : isAuto,
      available: viaPlayer.available || tracks.map((t) => t.languageCode + (t.kind === 'asr' ? '(自動)' : ''))
    };
  };
})();
