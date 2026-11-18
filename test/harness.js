// 測試用的共用工具：斷言，以及把真正的 content script 載進 node 跑的環境。
//
// 重點是「載入真正的程式碼」而不是複製一份來測——這個專案已經兩次因為
// 複製品測過了但真正的程式碼沒接上而出事。
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- 斷言 ----------
let pass = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { failures.push(name); console.log('  ❌ ' + name + (detail ? '　→ ' + detail : '')); }
}

function eq(actual, expected, name) {
  ok(actual === expected, name, `得到 ${JSON.stringify(actual)}，預期 ${JSON.stringify(expected)}`);
}

function near(actual, expected, tol, name) {
  ok(Math.abs(actual - expected) <= tol, name, `得到 ${actual}，預期 ${expected}±${tol}`);
}

function section(title) { console.log('\n【' + title + '】'); }

function finish() {
  console.log(`\n${failures.length ? '❌' : '✅'} ${pass} 項通過，${failures.length} 項失敗`);
  if (failures.length) failures.forEach((f) => console.log('   - ' + f));
  process.exit(failures.length ? 1 : 0);
}

// ---------- 載入真正的 app.js ----------
const DEFAULT_SETTINGS = {
  provider: 'gemini', geminiKey: 'TEST-KEY', geminiModel: 'gemini-3.5-flash-lite',
  segmentSeconds: 30, targetLang: 'fr', nativeLang: '繁體中文',
  autoPause: true, autoStart: false, exportFormat: 'simple'
};

const DEMO_ANALYSIS = {
  sentences: [{ text: 'Bonjour les amis.', translation: '大家好。', start_line: 0, end_line: 0 }],
  vocab: [{ word: 'ligne', lemma: 'ligne', pos: 'n.f.', meaning: '行、線', note: '' }],
  phrases: [{ phrase: 'des mots', meaning: '一些字', note: '' }],
  notes: ['測試用的文法重點']
};

async function createApp(opts) {
  const o = opts || {};
  const store = { settings: Object.assign({}, DEFAULT_SETTINGS, o.settings) };
  const downloads = [];
  const renders = [];
  const alerts = [];
  const listeners = {};

  const video = {
    duration: o.duration || 300, currentTime: 0, paused: false, playbackRate: 1,
    addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
    removeEventListener: (k, fn) => { listeners[k] = (listeners[k] || []).filter((f) => f !== fn); },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; }
  };

  globalThis.location = { pathname: '/watch', search: '?v=TESTVIDEO' };
  globalThis.document = {
    title: '測試影片',
    querySelector: () => video,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, click() {}, remove() {} }),
    body: { appendChild() {}, removeChild() {} },
    head: { appendChild() {} },
    contains: () => true
  };
  globalThis.window = { addEventListener() {}, postMessage() {}, removeEventListener() {} };
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  globalThis.Blob = class {};
  globalThis.alert = (m) => alerts.push(m);
  globalThis.setInterval = () => 0;

  globalThis.chrome = {
    storage: {
      local: {
        get: async (k) => {
          if (k == null) return Object.assign({}, store);
          if (typeof k === 'string') return k in store ? { [k]: store[k] } : {};
          if (Array.isArray(k)) { const r = {}; for (const x of k) if (x in store) r[x] = store[x]; return r; }
          return Object.assign({}, k, store);
        },
        set: async (obj) => { Object.assign(store, obj); },
        remove: async () => {}
      },
      onChanged: { addListener() {} }
    },
    runtime: {
      sendMessage: async (msg) => {
        if (!msg || msg.type !== 'analyze') return {};
        if (o.analyze) return o.analyze(msg);
        return { cached: false, data: JSON.parse(JSON.stringify(DEMO_ANALYSIS)) };
      },
      onMessage: { addListener() {} }
    }
  };

  // 允許一個 process 裡建立多個實例：content script 是 IIFE，要清掉 require 快取
  for (const f of ['/content/lib.js', '/shared/anki.js', '/content/segmenter.js', '/content/app.js']) {
    delete require.cache[require.resolve(ROOT + f)];
  }
  globalThis.LY = undefined;

  require(ROOT + '/content/lib.js');
  require(ROOT + '/shared/anki.js');
  require(ROOT + '/content/segmenter.js');

  let handlers = null;
  LY.Panel = {
    mount: (h) => { handlers = h; return {}; },
    unmount() {}, reflow() {}, last: null,
    render: (vm) => { renders.push(vm); LY.Panel.last = vm; }
  };

  const lineCount = o.lines || 20;
  const lineSeconds = o.lineSeconds || 7;
  LY.loadCues = async () => ({
    cues: Array.from({ length: lineCount }, (_, i) => ({
      start: i * lineSeconds, end: (i + 1) * lineSeconds,
      text: `ligne ${i} avec des mots français ici` })),
    source: 'panel', title: 'Test Video', langUsed: 'fr', isAuto: true, available: ['fr(自動)']
  });

  LYAnki.download = (text, filename) => downloads.push({ text, filename });

  require(ROOT + '/content/app.js');

  // route() 是非同步的，handlers 要等它呼叫 Panel.mount 才會有
  for (let i = 0; i < 50 && !handlers; i++) await new Promise((r) => setTimeout(r, 10));
  if (!handlers) throw new Error('app.js 沒有掛上面板，handlers 取不到');

  // 讓測試可以手動推進影片時間
  const fire = (event, t) => {
    if (t != null) video.currentTime = t;
    for (const fn of listeners[event] || []) fn();
  };
  const tick = async (t) => { fire('timeupdate', t); await new Promise((r) => setTimeout(r, 0)); };

  return {
    get handlers() { return handlers; },
    video, store, renders, downloads, alerts, fire, tick,
    lastRender: () => renders[renders.length - 1],
    settle: (ms) => new Promise((r) => setTimeout(r, ms == null ? 30 : ms))
  };
}

module.exports = { ok, eq, near, section, finish, createApp, ROOT, DEMO_ANALYSIS };
