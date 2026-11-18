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

  console.log('\n--- 匯出全部表格（走 S.collected，來源是分析結果）---');
  captured = null;
  handlers.exportCsv('all', 'excel');
  await new Promise(r => setTimeout(r, 20));
  if (captured && captured.alert) console.log('❌', captured.alert);
  else if (!captured) console.log('❌ 沒有產生檔案');
  else {
    const rows = captured.text.split('\r\n').filter(Boolean);
    // 表格只有一行標題，不像 Anki 檔有三到五行 # 指示行
    const data = rows.filter((r) => !r.startsWith('#')).length - 1;
    console.log('✅ 檔名:', captured.filename, '／資料列數:', data, data > 0 ? '' : '❌ 應該要有資料');
    console.log('   有 BOM（Excel 用）:', captured.text.charCodeAt(0) === 0xFEFF ? '✅' : '❌');
    console.log('   沒有 Anki 指示行  :', rows[0].startsWith('#') ? '❌' : '✅');
    console.log('   標題列            :', rows[0].replace(/\uFEFF/, '').slice(0, 60));
  }

  const parse = (line) => { const o=[];let c='',q=false;
    for (let i=0;i<line.length;i++){const ch=line[i];
      if(q){if(ch==='"'){if(line[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}
      else{if(ch==='"')q=true;else if(ch===','){o.push(c);c='';}else c+=ch;}}
    o.push(c); return o; };

  async function grab(scope, format) {
    captured = null;
    handlers.exportCsv(scope, format);
    await new Promise(r => setTimeout(r, 20));
    return captured;
  }

  console.log('\n--- Anki 檔（預設・精簡兩欄）---');
  {
    const c = await grab('starred', 'anki');
    const lines = c.text.split('\r\n').filter(Boolean);
    const head = lines.filter(l => l.startsWith('#'));
    const row = parse(lines[head.length]);
    console.log('檔名      :', c.filename);
    console.log('指示行    :', head.join(' | '));
    console.log('欄位數    :', row.length, row.length === 3 ? '✅' : '❌ 應為 3');
    console.log('正面/背面 :', JSON.stringify(row[0]), '/', JSON.stringify(row[1]));
    console.log('無 BOM    :', c.text.charCodeAt(0) !== 0xFEFF ? '✅' : '❌ Anki 會讀不到 #separator');
  }

  console.log('\n--- 表格（給人看）---');
  {
    const c = await grab('starred', 'excel');
    const body = c.text.charCodeAt(0) === 0xFEFF ? c.text.slice(1) : c.text;
    const lines = body.split('\r\n').filter(Boolean);
    const header = parse(lines[0]);
    const row = parse(lines[1]);
    console.log('檔名      :', c.filename);
    console.log('有 BOM    :', c.text.charCodeAt(0) === 0xFEFF ? '✅ Excel 中文才不會亂碼' : '❌');
    console.log('沒有指示行:', lines[0].startsWith('#') ? '❌' : '✅');
    console.log('欄位      :', header.join(' / '));
    console.log('第一列    :', row.slice(0, 3).join(' / '), '…');
    console.log('連結是純網址:', /^https?:\/\//.test(row[9]) ? '✅' : '❌ ' + row[9]);
    console.log('沒有 HTML :', body.includes('<') ? '❌ 還有標籤' : '✅');
  }

  console.log('\n--- 分欄 Anki（設定頁可選）---');
  {
    const csv = LYAnki.toCsv([{ type:'word', word:'x', meaning:'測試', example:'ex', exampleZh:'例',
                                note:'n', pos:'v.', lemma:'y', video:'V', url:'https://a' }], { format:'fields' });
    const lines = csv.split('\r\n').filter(Boolean);
    const head = lines.filter(l => l.startsWith('#'));
    console.log('欄位數    :', parse(lines[head.length]).length, '（應為 9）');
    console.log('notetype  :', head.find(l => l.startsWith('#notetype')));
  }

  console.log('\n--- 取消收藏後再匯出 ---');
  await handlers.toggleStar(item, false);
  console.log('取消後 isStarred:', handlers.isStarred('word', 'bonjour'));
  console.log('生字本筆數      :', (store.wordbook || []).length);
  captured = null;
  handlers.exportCsv('starred');
  console.log(captured && captured.alert ? '✅ 正確提示：' + captured.alert : '❌ 竟然還匯出了東西');
})();
