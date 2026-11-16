// 在頁面主世界 (MAIN world) 執行：content script 讀不到 YouTube 自己的 JS 變數，
// 這支腳本負責把 player response（內含字幕軌清單）postMessage 回隔離世界。
(() => {
  if (window.__lyBridgeReady) return;
  window.__lyBridgeReady = true;

  function readCaptions() {
    const player = document.querySelector('#movie_player');
    let pr = null;
    try {
      if (player && typeof player.getPlayerResponse === 'function') pr = player.getPlayerResponse();
    } catch (e) { /* ignore */ }
    if (!pr) pr = window.ytInitialPlayerResponse || null;
    if (!pr) return null;
    const list = pr.captions && pr.captions.playerCaptionsTracklistRenderer;
    const tracks = (list && list.captionTracks) || [];
    return {
      videoId: (pr.videoDetails && pr.videoDetails.videoId) || null,
      title: (pr.videoDetails && pr.videoDetails.title) || '',
      tracks: tracks.map((t) => ({
        baseUrl: t.baseUrl || '',
        languageCode: t.languageCode || '',
        kind: t.kind || '',
        vssId: t.vssId || '',
        name: (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || ''
      })).filter((t) => t.baseUrl)
    };
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__ly !== 'req') return;
    let data = null;
    try {
      if (d.kind === 'captions') data = readCaptions();
    } catch (err) {
      data = { error: String(err) };
    }
    window.postMessage({ __ly: 'res', id: d.id, data }, '*');
  });
})();
