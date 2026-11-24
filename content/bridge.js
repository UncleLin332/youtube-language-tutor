// 在頁面主世界 (MAIN world) 執行。
// content script 讀不到 YouTube 自己的 JS 物件，播放器的 API 也只有這裡碰得到。
(() => {
  if (window.__lyBridgeReady) return;
  window.__lyBridgeReady = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = (c) => String(c || '').toLowerCase().split('-')[0];

  function playerTracks(pr) {
    const list = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;
    return (list && list.captionTracks) || [];
  }

  function readPlayerResponse() {
    const player = document.querySelector('#movie_player');
    try {
      if (player && typeof player.getPlayerResponse === 'function') return player.getPlayerResponse();
    } catch (e) { /* ignore */ }
    return window.ytInitialPlayerResponse || null;
  }

  function readCaptions() {
    const pr = readPlayerResponse();
    if (!pr) return null;
    return {
      videoId: (pr.videoDetails && pr.videoDetails.videoId) || null,
      title: (pr.videoDetails && pr.videoDetails.title) || '',
      tracks: playerTracks(pr).map((t) => ({
        baseUrl: t.baseUrl || '',
        languageCode: t.languageCode || '',
        kind: t.kind || '',
        vssId: t.vssId || '',
        name: (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || ''
      }))
    };
  }

  // 取得某個語言的字幕檔網址。
  //
  // 直接 fetch captionTracks 裡的 baseUrl 會回 200 但空 body——YouTube 現在要求
  // proof-of-origin 權杖（網址裡的 pot 參數）。但播放器本身可以取得，而它發出的請求
  // 會留在標準的 Resource Timing 裡，所以：先裝觀察器 → 叫播放器切到目標語言 →
  // 攔下它發的網址 → 自行再請求一次。此做法只重用播放器已發出的網址，不偽造任何請求。
  async function captionUrl(payload) {
    const want = base(payload && payload.lang);
    const player = document.querySelector('#movie_player');
    if (!player || typeof player.setOption !== 'function') return { error: 'no-player' };

    const tracks = playerTracks(readPlayerResponse());
    if (!tracks.length) return { error: 'no-captions' };

    const manual = tracks.filter((t) => t.kind !== 'asr');
    const asr = tracks.filter((t) => t.kind === 'asr');
    const hit = manual.find((t) => base(t.languageCode) === want) ||
                asr.find((t) => base(t.languageCode) === want);
    if (!hit) {
      return { error: 'no-track',
        available: tracks.map((t) => t.languageCode + (t.kind === 'asr' ? '(自動)' : '')) };
    }

    const seen = [];
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name.indexOf('/api/timedtext') !== -1) seen.push(e.name);
    });
    // 不可請求自動翻譯（tlang）：它會將法文機器翻譯成日文等其他語言，
    // 內容看似正常，但語言並非原文。
    const pick = () => seen.filter((u) => {
      try {
        const q = new URL(u).searchParams;
        return base(q.get('lang')) === want && !q.get('tlang') && q.get('pot');
      } catch (e) { return false; }
    }).pop();

    const asTrack = (t) => ({
      languageCode: t.languageCode, kind: t.kind || '', vss_id: t.vssId || '',
      name: '', is_servable: true, is_translateable: true
    });

    let previous = null;
    try { previous = player.getOption('captions', 'track'); } catch (e) { /* ignore */ }

    try {
      obs.observe({ type: 'resource', buffered: true });
      player.setOption('captions', 'track', asTrack(hit));

      let url = null;
      for (let i = 0; i < 40 && !url; i++) { await sleep(150); url = pick(); }

      // 未攔截到請求，通常是因為該字幕軌本來就已選取，播放器不會重新請求：先切換到其他軌再切回，以觸發請求
      if (!url) {
        const other = tracks.find((t) => base(t.languageCode) !== want);
        if (other) {
          player.setOption('captions', 'track', asTrack(other));
          await sleep(700);
          player.setOption('captions', 'track', asTrack(hit));
          for (let i = 0; i < 40 && !url; i++) { await sleep(150); url = pick(); }
        }
      }

      if (!url) return { error: 'no-url' };
      return { url, lang: hit.languageCode, isAuto: hit.kind === 'asr' };
    } catch (e) {
      return { error: 'failed', message: String(e && e.message) };
    } finally {
      try { obs.disconnect(); } catch (e) { /* ignore */ }
      // 務必還原使用者原本的字幕設定，不可擅自保持字幕開啟
      try { player.setOption('captions', 'track', previous || {}); } catch (e) { /* ignore */ }
    }
  }

  const HANDLERS = {
    captions: async () => readCaptions(),
    captionUrl: (payload) => captionUrl(payload)
  };

  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__ly !== 'req') return;
    let data = null;
    try {
      const fn = HANDLERS[d.kind];
      if (fn) data = await fn(d.payload);
    } catch (err) {
      data = { error: 'exception', message: String(err && err.message) };
    }
    window.postMessage({ __ly: 'res', id: d.id, data }, '*');
  });
})();
