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

  // 將設定整理為背景程序所需的欄位
  LY.resolve = (s) => ({
    provider: s.provider === 'gemini' ? 'gemini' : 'anthropic',
    apiKey: s.provider === 'gemini' ? s.geminiKey : s.anthropicKey,
    model: s.provider === 'gemini' ? s.geminiModel : s.anthropicModel,
    nativeLang: s.nativeLang,
    targetLang: s.targetLang,
    langName: LY.LANGS[s.targetLang] || s.targetLang
  });

  LY.LANGS = {
    fr: '法文', en: '英文', ja: '日文', ko: '韓文', es: '西班牙文',
    de: '德文', it: '義大利文', pt: '葡萄牙文', zh: '中文', ru: '俄文'
  };

  LY.getSettings = async () => {
    const got = await chrome.storage.local.get('settings');
    const s = Object.assign({}, LY.DEFAULTS, got.settings || {});
    // 舊版僅有單一 apiKey / model 欄位，沿用其值
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

  // 向主世界的 bridge.js 查詢資料
  LY.askPage = (kind, payload, timeout) => new Promise((resolve) => {
    const id = 'ly_' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { window.removeEventListener('message', on); resolve(null); },
      timeout == null ? 4000 : timeout);
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

  // ---------- 日文假名標註 ----------
  //
  // 模型只回傳「整個詞的假名讀音」（速すぎて → はやすぎて）。要對齊到各個漢字上方，
  // 必須自行分配：先將表面文字切成「漢字段／非漢字段」，非漢字段（送假名、助詞、標點）
  // 在讀音中必定照抄，以其為錨點，夾在中間的即為漢字段的讀音。
  //
  // 漢字段的長度無法事先得知，因此採回溯：由一個假名開始嘗試，交由後續的段落驗證。
  // 失敗過的 (段, 位置) 會記錄下來不再重試，最壞情況為段數 × 讀音長度。

  const KANJI = /[々〇㐀-䶿一-鿿豈-﫿]/;

  LY.hasKanji = (t) => KANJI.test(String(t || ''));

  // 比對用的正規化：片假名轉平假名，並移除空白與標點
  // （模型回傳讀音時常省略標點，保留只會導致對齊失敗）
  const kana = (t) => String(t || '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　、。，．！？・…「」『』（）〈〉《》,.!?()"':;：；\-—]/g, '');

  function kanjiRuns(text) {
    const out = [];
    for (const ch of String(text)) {
      const k = KANJI.test(ch);
      const last = out[out.length - 1];
      if (last && last.kanji === k) last.t += ch;
      else out.push({ t: ch, kanji: k });
    }
    return out;
  }

  // 回傳 [{ t: 表面文字, r: 假名（非漢字段為空字串） }]；無法對齊時回傳 null
  LY.furigana = (text, reading) => {
    const t = String(text || '');
    const R = kana(reading);
    if (!t || !R || !KANJI.test(t)) return null;

    const segs = kanjiRuns(t);
    // 異常長的輸入不值得花時間回溯
    if (segs.length > 80 || R.length > 400) return null;

    const dead = new Set();
    const acc = [];

    function walk(i, pos) {
      if (i === segs.length) return pos === R.length ? acc.slice() : null;
      const key = i + ':' + pos;
      if (dead.has(key)) return null;
      const seg = segs[i];
      let found = null;

      if (!seg.kanji) {
        const want = kana(seg.t);
        // 純標點的段在讀音中沒有對應，直接跳過
        if (!want) {
          acc.push({ t: seg.t, r: '' });
          found = walk(i + 1, pos);
          acc.pop();
        } else if (R.substr(pos, want.length) === want) {
          acc.push({ t: seg.t, r: '' });
          found = walk(i + 1, pos + want.length);
          acc.pop();
        }
      } else {
        for (let len = 1; pos + len <= R.length; len++) {
          acc.push({ t: seg.t, r: R.slice(pos, pos + len) });
          found = walk(i + 1, pos + len);
          acc.pop();
          if (found) break;
        }
      }

      if (!found) dead.add(key);
      return found;
    }

    return walk(0, 0);
  };

  // ---------- 單字發音（瀏覽器內建語音合成）----------
  //
  // 不需額外權限，也不連外。優先使用本機語音：Chrome 部分語音為雲端合成，
  // 使用時等同將文字送往該供應商的伺服器。

  const SPEECH_LANG = {
    fr: 'fr-FR', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', es: 'es-ES',
    de: 'de-DE', it: 'it-IT', pt: 'pt-PT', zh: 'zh-TW', ru: 'ru-RU'
  };

  LY.speechLang = (lang) => SPEECH_LANG[lang] || lang || '';

  const tag = (v) => String((v && v.lang) || '').toLowerCase().replace('_', '-');

  // macOS 會將趣味語音（Eddy、Grandma、Bubbles 等）一併列入，每個語言都有一份，
  // 且排序在正式語音之前。這類語音不適合用於學習發音，因此排除。
  const NOVELTY = new Set([
    'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Eddy', 'Flo',
    'Fred', 'Good News', 'Grandma', 'Grandpa', 'Jester', 'Junior', 'Kathy', 'Organ',
    'Princess', 'Ralph', 'Reed', 'Rocko', 'Sandy', 'Shelley', 'Superstar', 'Trinoids',
    'Whisper', 'Wobble', 'Zarvox'
  ]);
  const novelty = (v) => NOVELTY.has(String((v && v.name) || '').split(' (')[0].trim());

  LY.pickVoice = (lang, voices) => {
    const want = LY.speechLang(lang).toLowerCase();
    if (!want) return null;
    const base = want.split('-')[0];
    const all = (voices || []).filter((v) => tag(v).split('-')[0] === base);
    if (!all.length) return null;
    // 若清單中只剩趣味語音則仍會使用，以免完全沒有聲音
    const serious = all.filter((v) => !novelty(v));
    const list = serious.length ? serious : all;
    return list.find((v) => v.localService && tag(v) === want)
      || list.find((v) => v.localService)
      || list.find((v) => tag(v) === want)
      || list[0];
  };

  let voiceCache = [];
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  function refreshVoices() {
    try { voiceCache = synth.getVoices() || []; } catch (e) { voiceCache = []; }
  }
  if (synth) {
    refreshVoices();
    // Chrome 的語音清單為非同步載入，第一次 getVoices() 常為空
    if (synth.addEventListener) synth.addEventListener('voiceschanged', refreshVoices);
  }

  LY.canSpeak = () => !!synth;

  // 回傳 false 代表此電腦沒有該語言的語音
  LY.speak = (text, lang, rate) => {
    if (!synth || !text) return false;
    if (!voiceCache.length) refreshVoices();
    const voice = LY.pickVoice(lang, voiceCache);
    try {
      synth.cancel();                       // 連續點選時不排隊，直接改播新的
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = LY.speechLang(lang);
      if (voice) u.voice = voice;
      u.rate = rate == null ? 0.9 : rate;   // 略慢於正常語速，便於跟讀
      synth.speak(u);
    } catch (e) {
      return false;
    }
    return !!voice;
  };

  LY.log = (...a) => console.log('%c[語言助手]', 'color:#7c5cff', ...a);
})();
