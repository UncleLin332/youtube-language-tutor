const DEFAULTS = {
  provider: 'anthropic',
  anthropicKey: '', anthropicModel: 'claude-opus-5-5',
  geminiKey: '', geminiModel: 'gemini-3.5-flash-lite',
  segmentSeconds: 30, targetLang: 'fr', nativeLang: '繁體中文',
  autoPause: true, autoStart: false, exportFormat: 'simple'
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

function renderBookState(count) {
  $('bookCount').textContent = count ? `已收藏 ${count} 個字詞` : '尚未收藏字詞（複習時點 ★ 即可加入）';
  $('bookActions').hidden = !count;
}

async function load() {
  const sel = $('targetLang');
  for (const k of Object.keys(LANGS)) sel.add(new Option(LANGS[k], k));
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const got = hasStorage ? await chrome.storage.local.get(['settings', 'wordbook']) : {};
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
  $('targetLang').value = s.targetLang;
  renderBookState((got.wordbook || []).length);
}

function syncProvider() {
  const p = $('provider').value;
  for (const b of document.querySelectorAll('.provider-block')) b.hidden = b.dataset.provider !== p;
}

$('provider').addEventListener('change', syncProvider);

for (const btn of document.querySelectorAll('.key-toggle')) {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.target);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? '隱藏' : '顯示';
  });
}

function current() {
  return {
    provider: $('provider').value,
    anthropicKey: $('anthropicKey').value.trim(),
    anthropicModel: $('anthropicModel').value,
    geminiKey: $('geminiKey').value.trim(),
    geminiModel: $('geminiModel').value,
    segmentSeconds: 30,
    targetLang: $('targetLang').value,
    nativeLang: '繁體中文',
    autoPause: true,
    autoStart: false,
    exportFormat: 'simple'
  };
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ settings: current() });
  say($('status'), '✓ 已儲存設定', 'ok');
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
  if (!r0.apiKey) return say($('status'), `請先輸入 ${s.provider === 'gemini' ? 'Gemini' : 'Anthropic'} API key`, 'err');
  say($('status'), `連線測試中…（${r0.model}）`);
  const r = await chrome.runtime.sendMessage({ type: 'testKey', settings: r0 });
  if (r && r.ok) say($('status'), '✓ API key 驗證成功', 'ok');
  else say($('status'), (r && r.error) || '測試失敗', 'err');
});

$('exportBook').addEventListener('click', async () => {
  const got = await chrome.storage.local.get('wordbook');
  const book = got.wordbook || [];
  if (!book.length) return say($('status2'), '生字本目前是空的，請先在影片中點 ★ 收藏。', 'err');
  LYAnki.download(LYAnki.toCsv(book, { tag: 'YouTube', format: 'simple' }), 'wordbook.csv');
  say($('status2'), `✓ 已匯出 ${book.length} 張 Anki 卡片。`, 'ok');
});

$('exportBookExcel').addEventListener('click', async () => {
  const got = await chrome.storage.local.get('wordbook');
  const book = got.wordbook || [];
  if (!book.length) return say($('status2'), '生字本目前是空的，請先在影片中點 ★ 收藏。', 'err');
  LYAnki.download(LYAnki.toCsv(book, { tag: 'YouTube', format: 'excel' }), 'wordbook-table.csv');
  say($('status2'), `✓ 已匯出 ${book.length} 筆詳細表格。`, 'ok');
});

$('clearBook').addEventListener('click', async () => {
  if (!confirm('確定要清空整個生字本？此動作無法復原。')) return;
  await chrome.storage.local.set({ wordbook: [] });
  renderBookState(0);
  say($('status2'), '✓ 已清空生字本。', 'ok');
});

$('clearCache').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ type: 'clearCache' });
  say($('status2'), `✓ 已清除 ${(r && r.removed) || 0} 筆快取。`, 'ok');
});

function initGuidePlayers() {
  const STEP_MS = 2800;
  for (const details of document.querySelectorAll('details.howto')) {
    const player = details.querySelector('.guide-player');
    if (!player) continue;
    const provider = player.dataset.guide;
    const img = player.querySelector('img');
    const fill = player.querySelector('.guide-fill');
    const playBtn = player.querySelector('.guide-play');
    const countEl = player.querySelector('.guide-count');
    const btns = Array.from(player.querySelectorAll('.guide-step'));
    const listItems = Array.from(details.querySelectorAll('ol li'));
    let idx = 0;
    let playing = false;
    let timer = null;
    let tick = null;
    let elapsed = 0;

    function show(n) {
      idx = (n + 4) % 4;
      img.src = `guides/${provider}-${idx + 1}.png`;
      countEl.textContent = `步驟 ${idx + 1} / 4`;
      btns.forEach((b, i) => b.classList.toggle('active', i === idx));
      listItems.forEach((li, i) => li.classList.toggle('step-active', i === idx));
      elapsed = 0;
      fill.style.width = playing ? '0%' : `${((idx + 1) / 4) * 100}%`;
    }

    function stop() {
      playing = false;
      clearInterval(timer);
      clearInterval(tick);
      playBtn.textContent = '▶ 播放示範';
      fill.style.width = `${((idx + 1) / 4) * 100}%`;
    }

    function start() {
      stop();
      playing = true;
      playBtn.textContent = '⏸ 暫停';
      elapsed = 0;
      fill.style.width = '0%';
      tick = setInterval(() => {
        elapsed += 100;
        fill.style.width = Math.min(100, (elapsed / STEP_MS) * 100) + '%';
      }, 100);
      timer = setInterval(() => show(idx + 1), STEP_MS);
    }

    playBtn.addEventListener('click', () => (playing ? stop() : start()));
    btns.forEach((b, i) => b.addEventListener('click', () => { stop(); show(i); }));
    listItems.forEach((li, i) => {
      li.style.cursor = 'pointer';
      li.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        stop();
        show(i);
      });
    });
    details.addEventListener('toggle', () => {
      if (details.open) { show(0); start(); }
      else stop();
    });
  }
}

initGuidePlayers();
load();
