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

  // ---- 次要路徑：timedtext ----
  function pickTrack(tracks, lang) {
    const base = (c) => String(c || '').toLowerCase().split('-')[0];
    const want = base(lang);
    const manual = tracks.filter((t) => t.kind !== 'asr');
    const asr = tracks.filter((t) => t.kind === 'asr');
    return (
      manual.find((t) => base(t.languageCode) === want) ||
      asr.find((t) => base(t.languageCode) === want) ||
      manual[0] || asr[0] || null
    );
  }

  async function fetchTimedText(baseUrl) {
    const url = new URL(baseUrl, location.origin);
    url.searchParams.set('fmt', 'json3');
    const res = await fetch(url.toString(), { credentials: 'include' });
    if (!res.ok) throw new Error('timedtext ' + res.status);
    const txt = await res.text();
    // YouTube 現在常常回 200 + 空 body（缺 PO token）
    if (!txt.trim()) throw new Error('timedtext 回傳空內容');
    const data = JSON.parse(txt);
    const cues = [];
    for (const ev of data.events || []) {
      if (ev.aAppend || !ev.segs) continue;
      const text = ev.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const start = (ev.tStartMs || 0) / 1000;
      cues.push({ start, end: start + (ev.dDurationMs || 2000) / 1000, text });
    }
    return cues;
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

  LY.loadCues = async (settings) => {
    const info = await LY.askPage('captions');
    const tracks = (info && info.tracks) || [];
    let cues = [];
    let source = '';
    let track = null;

    const panel = await scrapePanel();
    if (panel.cues.length >= 3) {
      cues = panel.cues;
      source = 'panel';
      if (panel.opened) closePanel();
    } else if (tracks.length) {
      track = pickTrack(tracks, settings.targetLang);
      if (track) {
        try {
          cues = await fetchTimedText(track.baseUrl);
          source = 'timedtext';
        } catch (e) {
          LY.log('timedtext 也失敗了：', e.message);
        }
      }
    }

    return {
      cues: cleanup(cues),
      source,
      title: (info && info.title) || document.title,
      langUsed: track ? track.languageCode : (tracks[0] ? tracks[0].languageCode : null),
      isAuto: track ? track.kind === 'asr' : (tracks[0] ? tracks[0].kind === 'asr' : null),
      available: tracks.map((t) => t.languageCode + (t.kind === 'asr' ? '(自動)' : ''))
    };
  };
})();
