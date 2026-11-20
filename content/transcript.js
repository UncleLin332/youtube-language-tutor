// 取得影片字幕
//
// 主要路徑：YouTube 自己的「顯示轉錄稿」面板（2026/11 實測：整份轉錄稿會一次渲染進 DOM，
//           沒有虛擬捲動，可以直接讀完）。
// 次要路徑：timedtext baseUrl。注意現在多數影片會回 HTTP 200 但 body 是空的
//           （需要 PO token），所以只能當退路，而且必須檢查 body 長度。
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
    // 面板可能本來就開著，或正在載入中：先等一下再決定要不要按按鈕，
    // 否則「顯示轉錄稿」是 toggle，按下去反而會把它關掉。
    if (await LY.waitFor(hasRows, 2500, 300)) return { cues: readRows(), opened: false };

    // 轉錄稿按鈕藏在影片說明區，說明區還沒渲染時按鈕可能不存在，先等一下
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

  // ---- 主要路徑：跟播放器要字幕檔 ----
  //
  // captionTracks 裡的 baseUrl 直接 fetch 會回 200 空 body（缺 proof-of-origin 權杖）。
  // bridge.js 會叫播放器切到目標語言、攔下它自己發的網址再交給我們，那個網址帶著權杖。
  // 好處是：語言跟著設定走、不用打開 YouTube 的轉錄稿面板、沒有面板的影片也能用。
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
    // 切軌加上等播放器發請求，會花幾秒，所以等久一點
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

  // 抓到的字幕到底是什麼語言？
  //
  // YouTube 的轉錄稿面板會依帳號語言挑字幕軌，而新版介面沒有切換語言的選項
  // （播放器的字幕設定、hl 參數都試過，都改不了面板的語言）。
  // 所以一支「日本人講給中文觀眾看」的影片，面板給的可能是中文字幕。
  // 不檢查的話，擴充會把中文當成日文原文送去分析，產出「原文和翻譯都是中文」的結果，
  // 而且白花 API 的錢。
  const SCRIPTS = [
    ['ja', /[\u3040-\u309f\u30a0-\u30ff]/, '日文'],      // 假名
    ['ko', /[\uac00-\ud7af]/, '韓文'],
    ['ru', /[\u0400-\u04ff]/, '俄文'],
    ['ar', /[\u0600-\u06ff]/, '阿拉伯文'],
    ['th', /[\u0e00-\u0e7f]/, '泰文'],
    ['zh', /[\u4e00-\u9fff]/, '中文'],                   // 要排在日文後面：日文也有漢字
    ['latin', /[A-Za-zÀ-ÿ]/, '拉丁字母的語言']
  ];

  // 拉丁字母系的語言彼此分不出來（法文／西班牙文／英文…），一律回 'latin'
  const LATIN = new Set(['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'id', 'ms', 'vi', 'fil']);
  const scriptOf = (lang) => (LATIN.has(String(lang).toLowerCase().split('-')[0]) ? 'latin'
    : String(lang).toLowerCase().split('-')[0]);

  LY.detectScript = (text) => {
    const t = String(text || '');
    for (const [code, re, name] of SCRIPTS) if (re.test(t)) return { code, name };
    return null;
  };

  // 回傳 null 代表沒問題；否則回傳不符的描述
  LY.checkLanguage = (cues, targetLang) => {
    const want = scriptOf(targetLang);
    const sample = cues.slice(0, 20).map((c) => c.text).join(' ');
    if (!sample.trim()) return null;
    const got = LY.detectScript(sample);
    if (!got) return null;                 // 認不出來就不要擋
    if (got.code === want) return null;
    // 日文字幕如果剛好這 20 行全是漢字，會被認成中文——再多看一點
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
      // 這支影片就是沒有這個語言的字幕：退回去抓面板也只會拿到別的語言，
      // 不如直接講清楚，也省得去動 YouTube 的面板
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
