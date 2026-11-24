// 匯出成 Anki 可以直接匯入的 CSV
//
// Anki 2.1.50 起支援檔案開頭的 # 指示行，因此匯出的檔案不需使用者手動設定分隔符號
// 或欄位對應，匯入即可使用。注意：此類檔案開頭不可加 BOM，否則 #separator 那一行
// 會被當作一般內容。
(() => {
  const A = (globalThis.LYAnki = globalThis.LYAnki || {});

  const csvEsc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  // html:true 時換行須用 <br>，直接保留 \n 會使 CSV 多出一列
  const htmlEsc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');

  // Anki 的標籤不可含空白。YouTube 標題常為「影片名 | 頻道名」，取前半即可，
  // 並於底線處截斷，避免留下不完整的字。
  const tagify = (v) => {
    let t = String(v || '').split('|')[0].trim()
      .replace(/["',:]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (t.length > 40) {
      t = t.slice(0, 40);
      const cut = t.lastIndexOf('_');
      if (cut > 12) t = t.slice(0, cut);
    }
    return t.replace(/_$/, '');
  };

  A.TYPE_LABEL = { word: '單字', phrase: '片語', grammar: '文法', sentence: '句子', fragment: '片段' };

  // 文法重點是一段敘述，不適合整段作為正面；拆成「主題 → 說明」
  A.grammarFront = (text) => {
    const t = String(text || '').trim();
    const m = t.match(/^(.{2,28}?)\s*[：:，,。]/);
    if (m) return m[1];
    return t.length > 26 ? t.slice(0, 26) + '…' : t;
  };

  A.NOTETYPE = 'YouTube 語言學習';
  A.FIELDS = ['法文', '中文', '例句', '例句翻譯', '筆記', '詞性', '原形', '影片連結'];

  function tagsOf(it, o) {
    return [o.tag || 'YouTube', A.TYPE_LABEL[it.type || 'word'] || '單字', tagify(it.video)]
      .filter(Boolean).join(' ');
  }

  function linkOf(it) {
    return it.url ? '<a href="' + htmlEsc(it.url) + '">▶ 影片片段</a>' : '';
  }

  // 分欄格式：每項資料各佔一欄，可在 Anki 自行排版
  // （例如以例句製作填空卡，或製作「看中文想法文」的反向卡）。
  // 須先在 Anki 建立同名的筆記類型，欄位順序依 A.FIELDS。
  A.toFieldsCsv = (items, opts) => {
    const o = opts || {};
    const rows = [
      '#separator:Comma',
      '#html:true',
      '#notetype:' + (o.notetype || A.NOTETYPE),
      '#columns:' + A.FIELDS.join(',') + ',Tags',
      '#tags column:' + (A.FIELDS.length + 1)
    ];
    for (const it of items) {
      const type = it.type || 'word';
      const isGrammar = type === 'grammar';
      rows.push([
        htmlEsc(isGrammar ? A.grammarFront(it.word) : it.word),
        htmlEsc(it.meaning),
        htmlEsc(it.example),
        htmlEsc(it.exampleZh),
        // 文法重點：標題放法文欄，完整敘述放筆記欄；若標題未被截短則不重複
        htmlEsc(isGrammar
          ? [A.grammarFront(it.word) === it.word ? '' : it.word, it.note].filter(Boolean).join('　')
          : it.note),
        htmlEsc(isGrammar ? '' : it.pos),
        htmlEsc(it.lemma && it.lemma !== it.word ? it.lemma : ''),
        linkOf(it),
        tagsOf(it, o)
      ].map(csvEsc).join(','));
    }
    return rows.join('\r\n') + '\r\n';
  };

  // 簡易格式：可直接匯入 Anki 內建的 Basic 筆記類型，無須事先設定
  A.toBasicCsv = (items, opts) => {
    const o = opts || {};
    const rows = ['#separator:Comma', '#html:true', '#columns:Front,Back,Tags'];

    for (const it of items) {
      const type = it.type || 'word';
      const front = htmlEsc(type === 'grammar' ? A.grammarFront(it.word) : it.word);

      const back = [];
      if (type === 'grammar') {
        back.push(htmlEsc(it.word));
      } else {
        if (it.pos) back.push('<i>' + htmlEsc(it.pos) + '</i>');
        back.push('<b>' + htmlEsc(it.meaning) + '</b>');
        if (it.lemma && it.lemma !== it.word) back.push('<small>原形：' + htmlEsc(it.lemma) + '</small>');
      }
      if (it.note) back.push('<small>' + htmlEsc(it.note) + '</small>');
      if (it.example) {
        back.push('<br><i>' + htmlEsc(it.example) + '</i>');
        if (it.exampleZh) back.push('<small>' + htmlEsc(it.exampleZh) + '</small>');
      }
      if (it.url) back.push('<br>' + linkOf(it));

      rows.push([front, back.join('<br>'), tagsOf(it, o)].map(csvEsc).join(','));
    }
    return rows.join('\r\n') + '\r\n';
  };

  // 精簡 Anki 格式：正面為原文、背面為翻譯，共兩欄。
  // Anki 內建的 Basic 筆記類型即為 Front/Back，因此不需建立筆記類型或撰寫範本。
  A.toSimpleAnkiCsv = (items, opts) => {
    const o = opts || {};
    const rows = ['#separator:Comma', '#html:true', '#columns:Front,Back,Tags', '#tags column:3'];
    for (const it of items) {
      const type = it.type || 'word';
      rows.push([
        htmlEsc(type === 'grammar' ? A.grammarFront(it.word) : it.word),
        htmlEsc(type === 'grammar' ? (it.note || it.word) : it.meaning),
        tagsOf(it, o)
      ].map(csvEsc).join(','));
    }
    return rows.join('\r\n') + '\r\n';
  };

  // 供閱讀的表格：純文字，不含 HTML 與 Anki 指示行。
  // 開頭須加 BOM，否則 Excel 開啟時中文會變成亂碼——這點與 Anki 檔相反。
  A.EXCEL_COLUMNS = ['類型', '法文', '中文', '例句', '例句翻譯', '筆記', '詞性', '原形', '影片', '連結'];

  A.toExcelCsv = (items) => {
    const rows = [A.EXCEL_COLUMNS.map(csvEsc).join(',')];
    for (const it of items) {
      const type = it.type || 'word';
      rows.push([
        A.TYPE_LABEL[type] || '單字',
        it.word, it.meaning, it.example, it.exampleZh, it.note,
        type === 'grammar' ? '' : it.pos,
        it.lemma && it.lemma !== it.word ? it.lemma : '',
        it.video, it.url
      ].map(csvEsc).join(','));
    }
    return '\uFEFF' + rows.join('\r\n') + '\r\n';
  };

  // format: 'excel' 供閱讀、'fields' 分欄格式（Anki）、其餘為精簡 Anki 格式
  A.toCsv = (items, opts) => {
    const o = opts || {};
    if (o.format === 'excel') return A.toExcelCsv(items, o);
    if (o.format === 'fields') return A.toFieldsCsv(items, o);
    if (o.format === 'basic') return A.toBasicCsv(items, o);
    return A.toSimpleAnkiCsv(items, o);
  };

  A.download = (text, filename) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  A.safeName = (s) => String(s || 'export').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 60);
})();
