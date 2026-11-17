const DEFAULTS = {
  provider: 'anthropic',
  anthropicKey: '', anthropicModel: 'claude-opus-5-5',
  geminiKey: '', geminiModel: 'gemini-3.5-flash-lite',
  segmentSeconds: 30, targetLang: 'fr', nativeLang: '繁體中文',
  autoPause: true, autoStart: false
};
const LANGS = {
  fr: '法文 (fr)', en: '英文 (en)', ja: '日文 (ja)', ko: '韓文 (ko)', es: '西班牙文 (es)',
  de: '德文 (de)', it: '義大利文 (it)', pt: '葡萄牙文 (pt)', zh: '中文 (zh)', ru: '俄文 (ru)'
};
const $ = (id) => document.getElementById(id);

function say(node, text, cls) {
  node.textContent = text;
  node.className = 'status' + (cls ? ' ' + cls : '');
  if (text) setTimeout(() => { if (node.textContent === text) node.textContent = ''; }, 6000);
}

async function load() {
  const sel = $('targetLang');
  for (const k of Object.keys(LANGS)) sel.add(new Option(LANGS[k], k));
  const got = await chrome.storage.local.get(['settings', 'wordbook']);
  const s = Object.assign({}, DEFAULTS, got.settings || {});
  // 舊版只有單一 apiKey / model 欄位
  if (got.settings && got.settings.apiKey && !s.anthropicKey) s.anthropicKey = got.settings.apiKey;
  if (got.settings && /^claude/.test(got.settings.model || '')) s.anthropicModel = got.settings.model;
  $('provider').value = s.provider;
  $('anthropicKey').value = s.anthropicKey;
  $('anthropicModel').value = s.anthropicModel;
  $('geminiKey').value = s.geminiKey;
  $('geminiModel').value = s.geminiModel;
  syncProvider();
  $('segmentSeconds').value = s.segmentSeconds;
  $('targetLang').value = s.targetLang;
  $('nativeLang').value = s.nativeLang;
  $('autoPause').checked = s.autoPause !== false;
  $('autoStart').checked = s.autoStart === true;
  const book = got.wordbook || [];
  $('bookCount').textContent = book.length ? `已收藏 ${book.length} 個字詞。` : '還沒有收藏任何字詞（在面板上點 ★ 即可加入）。';
}

function syncProvider() {
  const p = $('provider').value;
  for (const b of document.querySelectorAll('.provider-block')) b.hidden = b.dataset.provider !== p;
}

$('provider').addEventListener('change', syncProvider);

function current() {
  return {
    provider: $('provider').value,
    anthropicKey: $('anthropicKey').value.trim(),
    anthropicModel: $('anthropicModel').value,
    geminiKey: $('geminiKey').value.trim(),
    geminiModel: $('geminiModel').value,
    segmentSeconds: Math.min(180, Math.max(10, parseInt($('segmentSeconds').value, 10) || 30)),
    targetLang: $('targetLang').value,
    nativeLang: $('nativeLang').value.trim() || '繁體中文',
    autoPause: $('autoPause').checked,
    autoStart: $('autoStart').checked
  };
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ settings: current() });
  say($('status'), '已儲存，回 YouTube 分頁重新整理即可套用。', 'ok');
});

function resolve(s) {
  return {
    provider: s.provider,
    apiKey: s.provider === 'gemini' ? s.geminiKey : s.anthropicKey,
    model: s.provider === 'gemini' ? s.geminiModel : s.anthropicModel,
    nativeLang: s.nativeLang,
    langName: '法文'
  };
}

$('test').addEventListener('click', async () => {
  const s = current();
  const r0 = resolve(s);
  if (!r0.apiKey) return say($('status'), `請先填 ${s.provider === 'gemini' ? 'Gemini' : 'Anthropic'} API key。`, 'err');
  say($('status'), `測試中…（${r0.model}）`);
  const r = await chrome.runtime.sendMessage({ type: 'testKey', settings: r0 });
  if (r && r.ok) say($('status'), 'API key 可以用 ✓', 'ok');
  else say($('status'), (r && r.error) || '測試失敗', 'err');
});

$('exportBook').addEventListener('click', async () => {
  const got = await chrome.storage.local.get('wordbook');
  const book = got.wordbook || [];
  if (!book.length) return say($('status2'), '生字本是空的。', 'err');
  LYAnki.download(LYAnki.toCsv(book, { tag: 'YouTube' }), 'wordbook.csv');
  say($('status2'), `已匯出 ${book.length} 張卡片。`, 'ok');
});

$('clearBook').addEventListener('click', async () => {
  if (!confirm('確定要清空生字本？這個動作無法復原。')) return;
  await chrome.storage.local.set({ wordbook: [] });
  $('bookCount').textContent = '還沒有收藏任何字詞（在面板上點 ★ 即可加入）。';
  say($('status2'), '已清空。', 'ok');
});

$('clearCache').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ type: 'clearCache' });
  say($('status2'), `已清除 ${(r && r.removed) || 0} 筆快取。`, 'ok');
});

load();
