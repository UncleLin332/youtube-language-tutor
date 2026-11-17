// 匯出成 Anki 可以直接匯入的 CSV
//
// Anki 2.1.50 以後支援檔案開頭的 # 指示行，所以匯出的檔案不需要使用者手動設定分隔符號
// 或欄位對應，拖進 Anki 就能用。注意：這種檔案開頭不能加 BOM，否則 #separator 那行
// 會被當成一般內容。
(() => {
  const A = (globalThis.LYAnki = globalThis.LYAnki || {});

  const csvEsc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  // html:true 之下換行要用 <br>，直接留著 \n 會讓 CSV 多出一列
  const htmlEsc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');

  // Anki 的標籤不能有空白。YouTube 標題常是「影片名 | 頻道名」，取前半就夠，
  // 並且在底線處截斷，不要留下半個字。
  const tagify = (v) => {
    let t = String(v || '').split('|')[0].trim()
      .replace(/["',]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (t.length > 40) {
      t = t.slice(0, 40);
      const cut = t.lastIndexOf('_');
      if (cut > 12) t = t.slice(0, cut);
    }
    return t.replace(/_$/, '');
  };

  A.TYPE_LABEL = { word: '單字', phrase: '片語', grammar: '文法', sentence: '句子' };

  // 文法重點是一段敘述，不適合整段當正面；拆成「主題 → 說明」
  A.grammarFront = (text) => {
    const t = String(text || '').trim();
    const m = t.match(/^(.{2,28}?)\s*[：:，,。]/);
    if (m) return m[1];
    return t.length > 26 ? t.slice(0, 26) + '…' : t;
  };

  A.toCsv = (items, opts) => {
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
      if (it.url) back.push('<br><a href="' + htmlEsc(it.url) + '">▶ 影片片段</a>');

      const tags = [o.tag || 'YouTube', A.TYPE_LABEL[type] || '單字', tagify(it.video)]
        .filter(Boolean).join(' ');
      rows.push([front, back.join('<br>'), tags].map(csvEsc).join(','));
    }
    return rows.join('\r\n') + '\r\n';
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
