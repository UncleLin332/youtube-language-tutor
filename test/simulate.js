// 整合測試用的模擬器
//
// 在真實 YouTube 頁面上載入「真正的」content script，只把兩樣東西換掉：
//   chrome.storage   → 記憶體裡的假 storage
//   chrome.runtime   → 假的 analyze，回傳結構正確的模擬資料（不呼叫真實 API）
// 其餘（抓字幕、切段、暫停、面板、單句播放）跑的都是擴充本身的程式碼。
(async () => {
  const BASE = 'http://127.0.0.1:8731';
  if (window.__lySim) { console.log('[模擬器] 已載入過'); return; }
  window.__lySim = true;

  const store = {
    settings: {
      provider: 'gemini', geminiKey: 'SIMULATED', geminiModel: 'gemini-3.5-flash-lite',
      anthropicKey: '', anthropicModel: 'claude-opus-5-5',
      segmentSeconds: 30, targetLang: 'fr', nativeLang: '繁體中文', autoPause: true
    }
  };

  window.chrome = window.chrome || {};
  chrome.storage = {
    local: {
      get: async (k) => {
        if (k == null) return Object.assign({}, store);
        if (typeof k === 'string') return k in store ? { [k]: store[k] } : {};
        if (Array.isArray(k)) { const o = {}; for (const x of k) if (x in store) o[x] = store[x]; return o; }
        const o = Object.assign({}, k); for (const x of Object.keys(k)) if (x in store) o[x] = store[x]; return o;
      },
      set: async (obj) => { Object.assign(store, obj); },
      remove: async () => {}
    },
    onChanged: { addListener: () => {} }
  };

  // 將一行字幕切成兩句，使「一行多句」的時間分配邏輯確實被執行到
  function splitLine(text) {
    const w = text.split(' ');
    if (w.length < 4) return [text];
    const mid = Math.ceil(w.length / 2);
    return [w.slice(0, mid).join(' '), w.slice(mid).join(' ')];
  }

  function fakeAnalysis(lines) {
    const sentences = [];
    lines.forEach((l, i) => {
      for (const part of splitLine(l.text)) {
        sentences.push({
          text: part.charAt(0).toUpperCase() + part.slice(1) + '.',
          translation: '（模擬翻譯）' + part.slice(0, 18) + '…',
          start_line: i, end_line: i
        });
      }
    });
    const words = [...new Set(lines.join(' ').split ? [] : [])];
    const pool = lines.map((l) => l.text).join(' ').split(' ').filter((w) => w.length > 4);
    const vocab = [...new Set(pool)].slice(0, 5).map((w) => ({
      word: w, lemma: w, pos: 'n.', meaning: '（模擬解釋）' + w, note: ''
    }));
    return {
      sentences,
      vocab,
      phrases: [{ phrase: 'être de garde', meaning: '（模擬）值班', note: '測試用' }],
      notes: ['這是模擬回應，沒有呼叫真實 API。']
    };
  }

  chrome.runtime = {
    sendMessage: async (msg) => {
      if (!msg || msg.type !== 'analyze') return {};
      window.__lyCalls = (window.__lyCalls || 0) + 1;
      await new Promise((r) => setTimeout(r, 500));   // 模擬 API 延遲
      return { data: fakeAnalysis(msg.segment.lines), cached: false };
    },
    openOptionsPage: () => console.log('[模擬器] 開啟設定頁')
  };

  const files = ['content/lib.js', 'content/transcript.js', 'content/segmenter.js',
                 'content/panel.js', 'content/app.js'];
  for (const f of files) {
    const res = await fetch(BASE + '/' + f);
    if (!res.ok) throw new Error('載入失敗 ' + f + ' → ' + res.status);
    (0, eval)(await res.text());
  }

  // content script 的 CSS 是由 manifest 注入的，模擬時須自行補上
  const css = await (await fetch(BASE + '/content/panel.css')).text();
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  console.log('[模擬器] 載入完成');
})();
