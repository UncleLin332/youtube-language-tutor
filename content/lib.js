// 共用工具與設定
(() => {
  const LY = (globalThis.LY = globalThis.LY || {});

  LY.DEFAULTS = {
    provider: 'anthropic',
    anthropicKey: '',
    anthropicModel: 'claude-opus-5-5',
    geminiKey: '',
    geminiModel: 'gemini-3.5-flash-lite',
    segmentSeconds: 30,
    targetLang: 'fr',
    nativeLang: '繁體中文',
    autoPause: true,
    autoStart: false,    // 預設每支影片都要自己按「開始學習」
    exportFormat: 'simple'   // Anki 檔的格式：'simple' = 法文/中文兩欄；'fields' = 九個欄位
  };

  // 把設定收斂成背景程序要的那幾個欄位
  LY.resolve = (s) => ({
    provider: s.provider === 'gemini' ? 'gemini' : 'anthropic',
    apiKey: s.provider === 'gemini' ? s.geminiKey : s.anthropicKey,
    model: s.provider === 'gemini' ? s.geminiModel : s.anthropicModel,
    nativeLang: s.nativeLang,
    langName: LY.LANGS[s.targetLang] || s.targetLang
  });

  LY.LANGS = {
    fr: '法文', en: '英文', ja: '日文', ko: '韓文', es: '西班牙文',
    de: '德文', it: '義大利文', pt: '葡萄牙文', zh: '中文', ru: '俄文'
  };

  LY.getSettings = async () => {
    const got = await chrome.storage.local.get('settings');
    const s = Object.assign({}, LY.DEFAULTS, got.settings || {});
    // 舊版只有單一 apiKey / model 欄位，沿用過來
    if (got.settings && got.settings.apiKey && !s.anthropicKey) s.anthropicKey = got.settings.apiKey;
    if (got.settings && got.settings.model && /^claude/.test(got.settings.model)) s.anthropicModel = got.settings.model;
    return s;
  };

  LY.saveSettings = async (patch) => {
    const cur = await LY.getSettings();
    const next = Object.assign({}, cur, patch);
    await chrome.storage.local.set({ settings: next });
    return next;
  };

  LY.fmtTime = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(x).padStart(2, '0');
  };

  LY.parseTime = (txt) => {
    const parts = String(txt).trim().split(':').map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  };

  LY.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  LY.waitFor = async (fn, timeout = 8000, step = 200) => {
    const until = Date.now() + timeout;
    for (;;) {
      let v = null;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() > until) return null;
      await LY.sleep(step);
    }
  };

  // 向主世界的 bridge.js 問資料
  LY.askPage = (kind, payload) => new Promise((resolve) => {
    const id = 'ly_' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { window.removeEventListener('message', on); resolve(null); }, 4000);
    function on(e) {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.__ly !== 'res' || d.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', on);
      resolve(d.data);
    }
    window.addEventListener('message', on);
    window.postMessage({ __ly: 'req', id, kind, payload }, '*');
  });

  LY.el = (tag, attrs, children) => {
    const n = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children || [])) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  };

  LY.log = (...a) => console.log('%c[語言助手]', 'color:#7c5cff', ...a);
})();
