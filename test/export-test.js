// 收藏與匯出的端對端測試：載入真正的 content/app.js，只把 chrome / DOM / 面板換成 stub。
//
// 存在的理由：這個流程壞過兩次，而且兩次讀程式碼都看不出來——
// 面板的按鈕呼叫 exportCsv('starred')，但 app.js 裡的 exportCsv 根本沒接那個參數，
// 結果是「匯出收藏」永遠匯出空的。只有真的跑起來才會發現。
//
//   node test/export-test.js
const ROOT = require('path').join(__dirname, '..') + '/';

// ---- 最小環境 stub ----
const store = { settings: {
  provider: 'gemini', geminiKey: 'TEST-KEY', geminiModel: 'gemini-3.5-flash-lite',
  segmentSeconds: 30, targetLang: 'fr', nativeLang: '繁體中文', autoPause: true, autoStart: false
} };
let captured = null;          // 匯出的 CSV
globalThis.location = { pathname: '/watch', search: '?v=TESTVIDEO' };
globalThis.document = {
  title: '測試影片',
  querySelector: () => fakeVideo,
  createElement: () => ({ style:{}, setAttribute(){}, appendChild(){}, addEventListener(){}, click(){}, remove(){} }),
  body: { appendChild(){}, removeChild(){} },
  head: { appendChild(){} },
  contains: () => true
};
globalThis.window = { addEventListener(){}, postMessage(){}, removeEventListener(){} };
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL(){} };
globalThis.Blob = class {};
globalThis.alert = (m) => { captured = { alert: m }; };

const listeners = {};
const fakeVideo = {
  duration: 300, currentTime: 0, paused: false, playbackRate: 1,
  addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
  removeEventListener(){}, play: () => Promise.resolve(), pause(){}
};

globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => {
        if (k == null) return { ...store };
        if (typeof k === 'string') return k in store ? { [k]: store[k] } : {};
        if (Array.isArray(k)) { const o={}; for (const x of k) if (x in store) o[x]=store[x]; return o; }
        return { ...k, ...store };
      },
      set: async (o) => { Object.assign(store, o); },
      remove: async () => {}
    },
    onChanged: { addListener(){} }
  },
  runtime: {
    sendMessage: async (msg) => {
      if (!msg || msg.type !== 'analyze') return {};
      return { cached: false, data: {
        sentences: [{ text: 'Bonjour les amis.', translation: '大家好。', start_line: 0, end_line: 0 }],
        vocab: [{ word: 'ligne', lemma: 'ligne', pos: 'n.f.', meaning: '行、線', note: '' }],
        phrases: [{ phrase: 'des mots', meaning: '一些字', note: '' }],
        notes: ['測試用的文法重點']
      } };
    },
    onMessage: { addListener(){} }
  }
};
globalThis.setInterval = () => 0;

// ---- 載入真正的模組 ----
require(ROOT + 'content/lib.js');
require(ROOT + 'shared/anki.js');
require(ROOT + 'content/segmenter.js');

// Panel 用假的，但要攔下 handlers
let handlers = null;
const renders = [];
LY.Panel = {
  mount: (h) => { handlers = h; return {}; },
  unmount(){}, render: (vm) => renders.push(vm), reflow(){}, last: null
};

// 字幕用假的，但切段走真正的 segmenter
LY.loadCues = async () => ({
  cues: Array.from({ length: 20 }, (_, i) => ({
    start: i * 7, end: (i + 1) * 7, text: `ligne ${i} avec des mots français ici` })),
  source: 'panel', title: 'Test Video', langUsed: 'fr', isAuto: true, available: ['fr(自動)']
});

// 攔下匯出的 CSV
const realDownload = LYAnki.download;
LYAnki.download = (text, filename) => { captured = { text, filename }; };

require(ROOT + 'content/app.js');

(async () => {
  await new Promise(r => setTimeout(r, 50));
  console.log('handlers 取得:', !!handlers, handlers ? Object.keys(handlers).join(', ') : '');

  await handlers.start();
  await new Promise(r => setTimeout(r, 50));
  console.log('啟動後的面板狀態:', renders.map(r => r.kind).join(' → '));

  console.log('\n--- 收藏一個單字 ---');
  const item = { type:'word', word:'bonjour', lemma:'bonjour', pos:'interj.', meaning:'你好', note:'' };
  console.log('收藏前 isStarred:', handlers.isStarred('word', 'bonjour'));
  await handlers.toggleStar(item, true);
  console.log('收藏後 isStarred:', handlers.isStarred('word', 'bonjour'));
  console.log('生字本筆數       :', (store.wordbook || []).length);

  console.log('\n--- 匯出收藏 ---');
  captured = null;
  handlers.exportCsv('starred');
  await new Promise(r => setTimeout(r, 20));
  if (!captured) console.log('❌ 完全沒有產生檔案');
  else if (captured.alert) console.log('❌ 跳出提示而不是檔案：', captured.alert);
  else {
    const rows = captured.text.split('\r\n').filter(Boolean);
    console.log('✅ 檔名:', captured.filename);
    console.log('   資料列數:', rows.length - 3);
    console.log('   內容:', rows[3]);
  }

  console.log('\n--- 匯出全部（走 S.collected，來源是分析結果）---');
  captured = null;
  handlers.exportCsv('all');
  await new Promise(r => setTimeout(r, 20));
  if (captured && captured.alert) console.log('❌', captured.alert);
  else if (!captured) console.log('❌ 沒有產生檔案');
  else {
    const rows = captured.text.split('\r\n').filter(Boolean);
    console.log('✅ 檔名:', captured.filename, '／資料列數:', rows.length - 3);
    console.log('   Anki 指示行:', rows[0] === '#separator:Comma' ? '有' : '❌ 沒有');
    console.log('   開頭沒有 BOM:', captured.text.charCodeAt(0) !== 0xFEFF ? '✅' : '❌ 有 BOM');
  }

  console.log('\n--- 取消收藏後再匯出 ---');
  await handlers.toggleStar(item, false);
  console.log('取消後 isStarred:', handlers.isStarred('word', 'bonjour'));
  console.log('生字本筆數      :', (store.wordbook || []).length);
  captured = null;
  handlers.exportCsv('starred');
  console.log(captured && captured.alert ? '✅ 正確提示：' + captured.alert : '❌ 竟然還匯出了東西');
})();
