// 收藏與匯出：載入真正的 content/app.js，只把 chrome / DOM / 面板換成 stub。
//
// 存在的理由：這個流程壞過兩次，而且兩次讀程式碼都看不出來——
// 面板的按鈕呼叫 exportCsv('starred')，但 app.js 裡的 exportCsv 根本沒接那個參數，
// 結果是「匯出收藏」永遠匯出空的。只有真的跑起來才會發現。
//
//   node test/export-test.js
const t = require('./harness');

function parseRow(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur);
  return out;
}

const WORD = { type: 'word', word: 'bonjour', lemma: 'bonjour', pos: 'interj.', meaning: '你好', note: '' };

(async () => {
  const app = await t.createApp();
  await app.handlers.start();
  await app.settle();

  const grab = async (scope, format) => {
    app.downloads.length = 0;
    app.alerts.length = 0;
    app.handlers.exportCsv(scope, format);
    await app.settle();
    return app.downloads[0];
  };

  // ---------------------------------------------------------------
  t.section('收藏與取消');
  t.eq(app.handlers.isStarred('word', 'bonjour'), false, '一開始沒有收藏');
  await app.handlers.toggleStar(WORD, true);
  t.eq(app.handlers.isStarred('word', 'bonjour'), true, '收藏後查得到');
  t.eq(app.handlers.starredCount(), 1, '計數是 1');
  t.eq((app.store.wordbook || []).length, 1, '也寫進生字本');

  // ---------------------------------------------------------------
  t.section('Anki 檔（預設・精簡兩欄）');
  {
    const f = await grab('starred', 'anki');
    t.ok(!!f, '有產生檔案');
    const lines = f.text.split('\r\n').filter(Boolean);
    const head = lines.filter((l) => l.startsWith('#'));
    const row = parseRow(lines[head.length]);
    t.ok(f.filename.includes('收藏') && f.filename.includes('Anki'), '檔名標示了範圍與格式', f.filename);
    t.eq(row.length, 3, '三欄');
    t.eq(row[0], 'bonjour', '正面是法文');
    t.eq(row[1], '你好', '背面是中文');
    t.ok(head.includes('#separator:Comma') && head.includes('#columns:Front,Back,Tags'), '有 Anki 指示行');
    t.ok(f.text.charCodeAt(0) !== 0xFEFF, '開頭沒有 BOM（有的話 #separator 會失效）');
  }

  // ---------------------------------------------------------------
  t.section('表格（給人看）');
  {
    const f = await grab('starred', 'excel');
    t.ok(f.text.charCodeAt(0) === 0xFEFF, '開頭有 BOM（Excel 中文才不會亂碼）');
    const body = f.text.slice(1);
    const lines = body.split('\r\n').filter(Boolean);
    const header = parseRow(lines[0]);
    const row = parseRow(lines[1]);
    t.ok(!lines[0].startsWith('#'), '沒有 Anki 的指示行');
    t.eq(header.length, 10, '十個欄位');
    t.eq(header[0], '類型', '第一欄是類型');
    t.eq(row[1], 'bonjour', '法文欄正確');
    t.ok(!body.includes('<'), '完全沒有 HTML 標籤');
    t.ok(/^https?:\/\//.test(row[9]), '連結是純網址', row[9]);
  }

  // ---------------------------------------------------------------
  t.section('分欄 Anki（設定頁的進階選項）');
  {
    const csv = LYAnki.toCsv([Object.assign({ example: 'ex', exampleZh: '例', video: 'V', url: 'https://a' }, WORD)],
      { format: 'fields' });
    const lines = csv.split('\r\n').filter(Boolean);
    const head = lines.filter((l) => l.startsWith('#'));
    t.eq(parseRow(lines[head.length]).length, 9, '九個欄位');
    t.ok(head.some((l) => l.startsWith('#notetype:')), '有指定筆記類型');
  }

  // ---------------------------------------------------------------
  t.section('匯出全部表格（來源是分析結果，不是收藏）');
  {
    const f = await grab('all', 'excel');
    t.ok(!!f, '有產生檔案');
    const data = f.text.slice(1).split('\r\n').filter(Boolean).length - 1;
    t.ok(data > 0, '有資料列（預抓的分析結果）', '列數 ' + data);
    t.ok(f.filename.includes('全部'), '檔名標示是全部');
  }

  // ---------------------------------------------------------------
  t.section('CSV 跳脫：含引號、逗號、換行的內容不能破格');
  {
    const csv = LYAnki.toCsv([{ type: 'word', word: 'guillemet "test", virgule',
      meaning: '引號,逗號\n換行', note: '<b>HTML</b> & 符號', video: '影片 有 空白', url: 'https://x' }], {});
    const rows = csv.split('\r\n').filter(Boolean).filter((l) => !l.startsWith('#'));
    t.eq(rows.length, 1, '換行沒有撐出額外的列');
    const cells = parseRow(rows[0]);
    t.eq(cells.length, 3, '欄位數正確');
    t.eq(cells[0], 'guillemet "test", virgule', '引號與逗號正確還原');
    t.ok(!/[^\r]\n/.test(csv), '沒有裸露的換行字元');
    t.ok(!cells[2].includes(':'), '標籤裡沒有冒號（Anki 的 :: 是階層標籤）');
  }

  // ---------------------------------------------------------------
  t.section('取消收藏之後');
  await app.handlers.toggleStar(WORD, false);
  t.eq(app.handlers.isStarred('word', 'bonjour'), false, '查不到了');
  t.eq(app.handlers.starredCount(), 0, '計數歸零');
  t.eq((app.store.wordbook || []).length, 0, '也從生字本移除');
  {
    await grab('starred', 'anki');
    t.eq(app.downloads.length, 0, '沒有東西可匯出就不產生檔案');
    t.ok(app.alerts.length === 1 && app.alerts[0].includes('還沒有收藏'), '給出正確提示');
  }

  t.finish();
})();
