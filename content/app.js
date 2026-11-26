// 主流程：抓字幕 → 切段 → 到段落結尾自動暫停 → 分析 → 逐句複習 → 繼續
(() => {
  const LY = globalThis.LY;
  const Panel = LY.Panel;

  const S = {
    settings: null,
    token: null,
    videoId: null,
    title: '',
    video: null,
    cues: null,
    segments: null,
    sourceLabel: '',
    armed: -1,
    mode: 'idle',        // idle | watching | review
    range: null,         // 單句播放中
    enabled: true,
    analyses: new Map(), // segIndex -> {data, cached}
    inflight: new Map(), // segIndex -> Promise（進行中的請求）
    active: false,       // 使用者是否已按下「開始學習」
    routed: false,        // 這支影片的面板是否已掛載
    forceLang: false,    // 使用者確認過要用不同語言的字幕
    pendingCues: null,   // 語言不符時暫存的字幕
    waitingFor: -1,      // 已播過邊界、但筆記尚未就緒的段落
    waitUntil: 0,        // 寬限期的截止秒數
    collected: [],
    starred: [],         // 這部影片已收藏（★）的項目
    times: null,         // 目前這段的「句子 → 時間」對應表
    counted: false,      // 這部影片的「看完」是否已計入
    finished: 0          // 累計看完的影片數（跨影片，存於 storage）
  };

  // 累計看完幾部影片後，才在完成畫面顯示贊助連結；
  // 過早出現會在使用者尚未評估工具價值時造成打擾。
  const SUPPORT_AFTER = 3;

  // 筆記尚未就緒時，最多讓影片多播幾秒；逾時仍會暫停，並先顯示這段的字幕原文
  const PAUSE_GRACE_SECONDS = 20;

  // ---------- 播放控制 ----------
  function clampIdx(t) {
    if (!S.segments || !S.segments.length) return -1;
    for (let i = 0; i < S.segments.length; i++) if (t < S.segments[i].end - 0.05) return i;
    return -1;
  }

  function arm(t) {
    const before = S.armed;
    S.armed = clampIdx(t);
    if (S.armed !== before) {
      S.waitingFor = -1;
      scheduleAhead();
    }
  }

  function onTimeUpdate() {
    if (!S.video || !S.segments) return;
    const t = S.video.currentTime;

    if (S.range) {
      if (t >= S.range.end - 0.03) endRange();
      return;
    }
    if (!S.enabled || S.mode === 'review' || S.armed < 0) return;

    const seg = S.segments[S.armed];
    if (!seg) return;
    if (t < seg.end - 0.05) return;

    // 已到段落邊界但筆記尚未整理完成：讓影片繼續播放，不停下來等待。
    // 筆記就緒後（最遲於下一個 timeupdate，約 0.25 秒內）才暫停，因此暫停時必定能立即開始複習。
    if (!S.analyses.has(S.armed)) {
      if (S.waitingFor !== S.armed) {
        S.waitingFor = S.armed;
        S.waitUntil = t + PAUSE_GRACE_SECONDS;
        prefetch(S.armed);          // 保險：確保這一段確實在處理中
        renderWatching();
      }
      if (t < S.waitUntil) return;  // 還在寬限期內，繼續播
    }
    S.waitingFor = -1;
    enterReview(S.armed);
  }

  function onSeeked() {
    if (S.range) return;
    if (S.mode === 'review' || S.mode === 'done') S.mode = 'watching';
    arm(S.video.currentTime);
    if (S.mode === 'watching') renderWatching();
  }

  function onPlay() {
    if (S.mode === 'done') { S.mode = 'watching'; arm(S.video.currentTime); }
    else if (S.mode === 'review' && !S.range) continueNext();
  }

  function playRange(start, end, rate) {
    if (!S.video) return;
    endRange();
    S.range = { end, restoreRate: S.video.playbackRate };
    S.video.playbackRate = rate || 1;
    S.video.currentTime = Math.max(0, start - 0.15);
    const p = S.video.play();
    if (p && p.catch) p.catch(() => {});
  }

  function endRange() {
    if (!S.range) return;
    const r = S.range;
    S.range = null;
    S.video.pause();
    S.video.playbackRate = r.restoreRate || 1;
  }

  // ---------- 複習流程 ----------
  async function enterReview(i) {
    // 字幕尚未載入（或載入失敗）時，不存在可複習的「第 i 段」。
    // 載入階段的錯誤面板也會進入此處，缺少此檢查會拋出未被處理的 TypeError。
    if (!S.segments || i < 0 || i >= S.segments.length) return;
    S.mode = 'review';
    S.video.pause();
    const seg = S.segments[i];
    S.current = i;

    const cached = S.analyses.get(i);
    if (cached) { renderResult(i, cached); prefetch(i + 1); return; }

    Panel.render({
      kind: 'loading',
      msg: '正在整理這段的單字與句子…',
      lines: seg.lines.map((l) => l.text),   // 筆記尚未就緒，先提供原文供閱讀與重聽
      segment: seg,
      total: S.segments.length,
      enabled: S.enabled
    });
    try {
      const r = await requestAnalysis(i);
      if (S.mode !== 'review' || S.current !== i) return;
      renderResult(i, r);
      prefetch(i + 1);
    } catch (e) {
      Panel.render({ kind: 'error', msg: String(e.message || e), segment: seg, total: S.segments.length, enabled: S.enabled });
    }
  }

  // 同一段可能同時被「預先整理」與「暫停時的即時需求」請求。
  // 未去重會送出兩次請求，造成重複計費，且後送出的請求反而較慢。
  function requestAnalysis(i) {
    if (S.analyses.has(i)) return Promise.resolve(S.analyses.get(i));
    const running = S.inflight.get(i);
    if (running) return running;

    const p = sendAnalysis(i).then(
      (res) => { S.inflight.delete(i); return res; },
      (err) => { S.inflight.delete(i); throw err; }
    );
    S.inflight.set(i, p);
    return p;
  }

  async function sendAnalysis(i) {
    // 預先整理的請求可能在使用者切換到下一支影片之後才回傳；
    // 此時 S.analyses / S.collected 已屬於新影片，不可寫入。
    const token = S.token;
    const seg = S.segments[i];
    const res = await chrome.runtime.sendMessage({
      type: 'analyze',
      videoId: S.videoId,
      settings: LY.resolve(S.settings),
      segment: { start: seg.start, end: seg.end, lines: seg.lines.map((l) => ({ i: l.i, text: l.text })) }
    });
    if (S.token !== token) throw new Error('已經切換到別的影片');
    if (!res) throw new Error('背景程序沒有回應，請重新整理頁面。');
    if (res.error) throw new Error(res.error);
    S.analyses.set(i, res);
    collect(i, res.data);
    if (S.mode === 'watching' && i === S.armed) renderWatching();
    return res;
  }

  function prefetch(i) {
    if (!S.segments || i < 0 || i >= S.segments.length) return;
    if (S.analyses.has(i) || S.inflight.has(i)) return;
    if (!LY.resolve(S.settings).apiKey) return;
    requestAnalysis(i).catch(() => {});
  }

  // 使用者觀看第 N 段時，背景先整理第 N 段，時間到即可直接開始複習；
  // 同時預先整理第 N+1 段，複習完按下繼續時同樣不需等待。
  function ensureAhead() {
    if (!S.enabled || !S.segments || S.armed < 0) return;
    prefetch(S.armed);
    prefetch(S.armed + 1);
  }

  // 拖動進度條時 arm() 會連續觸發，故延遲後才請求，避免整理大量用不到的段落
  let aheadTimer = null;
  function scheduleAhead(delay) {
    clearTimeout(aheadTimer);
    aheadTimer = setTimeout(ensureAhead, delay == null ? 1200 : delay);
  }

  // 尋找包含該詞的例句，作為卡片的例句
  function findExample(data, word) {
    if (!word) return null;
    const w = String(word).toLowerCase();
    const hit = (data.sentences || []).find((s) => (s.text || '').toLowerCase().includes(w));
    return hit ? { example: hit.text, exampleZh: hit.translation || '' } : null;
  }

  function entry(data, at, o) {
    // 句子本身即為例句，再尋找會造成重複；文法重點也不需要例句
    const ex = (o.type === 'grammar' || o.type === 'sentence') ? null : findExample(data, o.word);
    return Object.assign({
      lemma: '', pos: '', meaning: '', note: '',
      example: ex ? ex.example : '', exampleZh: ex ? ex.exampleZh : '',
      video: S.title, at,
      url: `https://youtu.be/${S.videoId}?t=${Math.floor(at)}`
    }, o);
  }

  function collect(i, data) {
    const seg = S.segments[i];
    const add = (o) => {
      if (S.collected.some((c) => c.word === o.word && c.type === o.type)) return;
      S.collected.push(o);
    };
    (data.vocab || []).forEach((v) => add(entry(data, seg.start, {
      type: 'word', word: v.word, lemma: v.lemma, pos: v.pos, meaning: v.meaning, note: v.note })));
    (data.phrases || []).forEach((p) => add(entry(data, seg.start, {
      type: 'phrase', word: p.phrase, meaning: p.meaning, note: p.note })));
  }

  function sentenceTime(seg, s) {
    const n = seg.lines.length;
    const a = Math.min(Math.max(Number(s.start_line) || 0, 0), n - 1);
    const b = Math.min(Math.max(Number(s.end_line) != null ? Number(s.end_line) : a, a), n - 1);
    return { start: seg.lines[a].start, end: seg.lines[b].end };
  }

  function renderResult(i, r) {
    // 句子 → 時間的對應表，供點選句子播放時使用
    S.times = LY.sentenceTimes(S.segments[i], r.data.sentences || []);
    Panel.render({
      kind: 'result',
      data: r.data,
      cached: r.cached,
      segment: S.segments[i],
      total: S.segments.length,
      enabled: S.enabled
    });
  }

  function renderWatching() {
    const next = S.armed >= 0 ? S.segments[S.armed] : null;
    Panel.render({
      kind: 'watching',
      nextStop: next ? next.end : null,
      ready: S.armed >= 0 && S.analyses.has(S.armed),
      pending: S.armed >= 0 && S.inflight.has(S.armed),
      waitingNotes: S.waitingFor >= 0 && S.waitingFor === S.armed,
      segment: null,
      total: S.segments ? S.segments.length : 0,
      enabled: S.enabled
    });
  }

  // 同一部影片重新看完時不重複計數。
  // 儲存空間存取失敗時視為尚未看完過：寧可不顯示贊助連結，也不讓畫面出錯。
  async function bumpFinished() {
    if (S.counted) return S.finished;
    S.counted = true;
    try {
      const got = await chrome.storage.local.get('finished');
      S.finished = (got.finished || 0) + 1;
      await chrome.storage.local.set({ finished: S.finished });
    } catch (e) {
      S.finished = 0;
    }
    return S.finished;
  }

  async function showDone() {
    S.mode = 'done';
    S.range = null;
    const finished = await bumpFinished();
    const count = (t) => S.collected.filter((c) => c.type === t).length;
    Panel.render({
      kind: 'done',
      enabled: S.enabled,
      total: S.segments ? S.segments.length : 0,
      segment: null,
      support: finished >= SUPPORT_AFTER,
      stats: {
        title: S.title,
        total: S.segments ? S.segments.length : 0,
        reviewed: S.analyses.size,
        duration: (S.video && S.video.duration) || 0,
        words: count('word'),
        phrases: count('phrase'),
        starred: S.starred.length
      }
    });
  }

  function onEnded() { if (S.segments) showDone(); }

  function restart() {
    if (!S.video) return;
    S.mode = 'watching';
    S.video.currentTime = 0;
    arm(0);
    renderWatching();
    const p = S.video.play();
    if (p && p.catch) p.catch(() => {});
  }

  function continueNext() {
    if (!S.segments || S.current < 0 || S.current >= S.segments.length) return;
    S.mode = 'watching';
    endRange();
    const seg = S.segments[S.current];
    // 若已是最後一段則直接收尾：影片播至結尾後再呼叫 play()，部分瀏覽器會從頭開始播放
    const dur = S.video.duration || 0;
    if (S.current >= S.segments.length - 1 || (dur && seg && seg.end >= dur - 0.3)) {
      showDone();
      return;
    }
    // 僅向前對齊：單句播放會讓播放位置停在段落中間，需移至段尾；
    // 但寬限期內播放超出邊界時不可倒帶，否則剛看過的內容會重播
    if (seg && S.video.currentTime < seg.end - 1.5) S.video.currentTime = seg.end;
    arm(S.video.currentTime);
    renderWatching();
    const p = S.video.play();
    if (p && p.catch) p.catch(() => {});
  }

  // ---------- 匯出 ----------
  // scope : 'starred' = 已收藏（★）的項目；其餘 = 這部影片整理過的全部
  // format: 'excel' = 詳細表格（供閱讀）；其餘 = Anki 匯入檔
  function exportCsv(scope, format) {
    const starred = scope === 'starred';
    const items = starred ? S.starred : S.collected;
    if (!items.length) {
      alert(starred
        ? '還沒有收藏任何項目。點單字或句子旁邊的 ★ 就能收藏。'
        : '這部影片還沒有整理到單字。');
      return;
    }
    const excel = format === 'excel';
    LYAnki.download(
      LYAnki.toCsv(items, {
        tag: 'YouTube',
        format: excel ? 'excel' : (S.settings.exportFormat || 'simple')
      }),
      `${LYAnki.safeName(S.title)}-${starred ? '收藏' : '全部'}-${excel ? '表格' : 'Anki'}.csv`
    );
  }

  // ---------- 框選一小段：解說與收藏 ----------
  const explains = new Map();   // 片段 -> 解說結果

  async function requestExplain(info) {
    const key = info.text + '\u0000' + info.sentence;
    if (explains.has(key)) return explains.get(key);
    const res = await chrome.runtime.sendMessage({
      type: 'explain',
      settings: LY.resolve(S.settings),
      fragment: info.text,
      sentence: info.sentence,
      sentenceZh: info.sentenceZh
    });
    if (!res) throw new Error('背景程序沒有回應，請重新整理頁面。');
    if (res.error) throw new Error(res.error);
    explains.set(key, res.data);
    return res.data;
  }

  async function explainFragment(info) {
    Panel.showExplain(info, { loading: true });
    try {
      Panel.showExplain(info, { data: await requestExplain(info) });
    } catch (e) {
      Panel.showExplain(info, { error: String((e && e.message) || e) });
    }
  }

  async function starFragment(info) {
    // 先取得解說再儲存，否則卡片背面會是空白
    Panel.showExplain(info, { loading: true });
    try {
      const data = await requestExplain(info);
      Panel.showExplain(info, { data });
      await toggleStar({
        type: 'fragment', word: info.text, meaning: data.meaning || '',
        lemma: '', pos: '', note: data.note || ''
      }, true);
      if (Panel.syncExportBtn) Panel.syncExportBtn();
    } catch (e) {
      Panel.showExplain(info, { error: String((e && e.message) || e) });
    }
  }

  // 同一個字可能在不同影片都被收藏，故以「類型＋內容」為鍵，取消收藏時再限定影片範圍
  function starKey(type, word) { return (type || 'word') + '\u0000' + String(word || ''); }

  function isStarred(type, word) {
    const k = starKey(type, word);
    return S.starred.some((x) => starKey(x.type, x.word) === k);
  }

  async function toggleStar(v, on) {
    // 收藏鈕是綁在 DOM 上的事件，可能在狀態被清除後才觸發
    const seg = S.segments ? S.segments[S.current] : null;
    const got = S.analyses.get(S.current);
    const item = Object.assign(
      entry((got && got.data) || {}, seg ? seg.start : 0, v),
      { savedAt: Date.now() }
    );
    const k = starKey(item.type, item.word);

    // 這部影片的收藏清單（完成畫面的數字與「匯出收藏」皆以此為準）
    S.starred = S.starred.filter((x) => starKey(x.type, x.word) !== k);
    if (on) S.starred.push(item);

    try {
      const book = (await chrome.storage.local.get('wordbook')).wordbook || [];
      // 僅更動這部影片的該項目，不影響其他影片收藏的同一個字
      const next = book.filter((b) => !(starKey(b.type, b.word) === k && b.video === item.video));
      if (on) next.push(item);
      await chrome.storage.local.set({ wordbook: next });
    } catch (e) {
      LY.log('生字本寫入失敗', e);
    }
  }

  const handlers = {
    continue: continueNext,
    retry: () => { S.analyses.delete(S.current); enterReview(S.current); },
    replaySegment: () => { const s = S.segments && S.segments[S.current]; if (s) playRange(s.start, s.end, 1); },
    playSentence: (sent, rate, idx) => {
      const seg = S.segments && S.segments[S.current];
      if (!seg) return;
      // 優先使用依字數比例計算的時間；無法計算時退回整行的時間
      const t = (S.times && S.times[idx]) || sentenceTime(seg, sent);
      playRange(t.start, t.end, rate);
    },
    // 單字／片語的語音合成。瀏覽器內建，不需額外權限，也不會送出任何文字。
    // 回傳 false 代表此電腦未安裝該語言的語音，面板會改寫按鈕的提示文字。
    speak: LY.canSpeak() ? (text) => LY.speak(text, S.settings.targetLang) : null,
    toggleEnabled: () => {
      S.enabled = !S.enabled;
      if (S.enabled) ensureAhead();
      if (S.mode === 'review' && !S.enabled) continueNext();
      else if (Panel.last) Panel.render(Object.assign({}, Panel.last, { enabled: S.enabled }));
      else renderWatching();
    },
    start,
    stop,
    // 字幕根本未載入的錯誤，可行的處理是整體重新啟動，而非重試某一段
    reload: () => { stop(); start(); },
    continueAnyway,
    openOptions: () => chrome.runtime.sendMessage({ type: 'openOptions' }),
    exportCsv,
    restart,
    isStarred,
    toggleStar,
    explainFragment,
    starFragment,
    starredCount: () => S.starred.length
  };

  // ---------- 啟動／換頁 ----------
  function detach() {
    if (S.video) {
      S.video.removeEventListener('timeupdate', onTimeUpdate);
      S.video.removeEventListener('seeked', onSeeked);
      S.video.removeEventListener('play', onPlay);
      S.video.removeEventListener('ended', onEnded);
    }
    S.video = null; S.cues = null; S.segments = null; S.armed = -1; S.current = -1;
    S.mode = 'idle'; S.range = null; S.analyses = new Map(); S.inflight = new Map();
    if (S.active) setBadge(false);
    S.active = false; S.routed = false; S.waitingFor = -1;
    S.forceLang = false; S.pendingCues = null;
    S.collected = []; S.starred = []; S.times = null; S.counted = false;
    explains.clear();
    S.token = Symbol('detached');   // 使進行中的預先整理失效，回傳時不會再寫入狀態
    clearTimeout(aheadTimer);
    Panel.unmount();
  }

  async function route() {
    const v = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (!v) { if (S.videoId) { S.videoId = null; detach(); } return; }
    if (v === S.videoId && S.routed) return;

    detach();
    S.videoId = v;
    S.routed = true;
    S.token = Symbol('route');
    S.settings = await LY.getSettings();
    S.enabled = S.settings.autoPause !== false;

    // 並非每支影片都用於語言學習，因此預設不執行任何動作：不取得字幕、不操作轉錄稿面板、
    // 不呼叫 API，只顯示一個啟動按鈕，等待使用者按下。
    Panel.mount(handlers);
    renderLauncher();
    if (S.settings.autoStart) start();
  }

  function renderLauncher() {
    const r = S.settings ? LY.resolve(S.settings) : { apiKey: '', langName: '', provider: 'anthropic' };
    Panel.render({
      kind: 'launcher',
      active: false,
      enabled: S.enabled,
      total: 0,
      hasKey: !!r.apiKey,
      langLabel: r.langName || '',
      providerLabel: r.provider === 'gemini' ? 'Gemini' : 'Claude'
    });
  }

  async function start() {
    if (S.active || !S.videoId) return;
    S.active = true;
    setBadge(true);
    const token = S.token;

    const video = await LY.waitFor(() => document.querySelector('video.html5-main-video') || document.querySelector('video'), 15000);
    if (!video || S.token !== token) { S.active = false; setBadge(false); return; }
    S.video = video;

    Panel.render({ kind: 'loading', msg: '正在取得字幕…', total: 0, enabled: S.enabled, active: true });

    try {
      const r = await LY.loadCues(S.settings);
      if (S.token !== token) return;
      if (!r.cues.length) {
        const want = LY.LANGS[S.settings.targetLang] || S.settings.targetLang;
        const list = (r.available || []).join('、');
        const hint =
          r.reason === 'no-track' ? `這部影片沒有${want}字幕。${list ? '可用的語言：' + list : ''}`
          : r.reason === 'no-captions' ? '這部影片沒有任何字幕，無法分析。'
          : list ? `這部影片有字幕（${list}），但抓不到內容，試著重新整理頁面。`
          : '這部影片沒有可用的字幕，無法分析。';
        S.active = false;
        setBadge(false);
        Panel.render({ kind: 'error', msg: hint, total: 0, enabled: S.enabled, active: true });
        return;
      }
      if (r.mismatch && !S.forceLang) {
        S.pendingCues = r;
        Panel.render({
          kind: 'mismatch',
          got: r.mismatch.gotName,
          want: LY.LANGS[S.settings.targetLang] || S.settings.targetLang,
          sample: r.cues.slice(0, 2).map((c) => c.text).join(' ').slice(0, 60),
          total: 0, enabled: S.enabled, active: true
        });
        return;
      }
      await applyCues(r, token);
    } catch (e) {
      S.active = false;
      setBadge(false);
      Panel.render({ kind: 'error', msg: String((e && e.message) || e), total: 0, enabled: S.enabled, active: true });
    }
  }

  // 使用者在語言不符的提示上按「仍要繼續」
  function continueAnyway() {
    const r = S.pendingCues;
    if (!r) return;
    S.forceLang = true;
    S.pendingCues = null;
    applyCues(r, S.token);
  }

  async function applyCues(r, token) {
    try {
      S.cues = r.cues;
      S.title = r.title || document.title;
      // 先前觀看這部影片時收藏的項目也納入，完成畫面的數字與匯出才不會遺漏
      try {
        const book = (await chrome.storage.local.get('wordbook')).wordbook || [];
        S.starred = book.filter((b) => typeof b.url === 'string' && b.url.includes(S.videoId));
      } catch (e) { S.starred = []; }
      S.segments = LY.buildSegments(r.cues, S.settings.segmentSeconds);
      S.sourceLabel = (r.source === 'player' ? '字幕軌' : r.source === 'panel' ? '轉錄稿面板' : '字幕') +
        (r.langUsed ? ' · ' + r.langUsed + (r.isAuto ? ' 自動產生' : '') : '');

      // 注意：此處已不在 start() 的作用域內，video 須從 S 取得
      S.video.addEventListener('timeupdate', onTimeUpdate);
      S.video.addEventListener('seeked', onSeeked);
      S.video.addEventListener('play', onPlay);
      S.video.addEventListener('ended', onEnded);
      arm(S.video.currentTime);
      S.mode = 'watching';
      ensureAhead();          // 不等待 1.2 秒，載入後立即開始整理第一段

      Panel.render({
        kind: 'ready', total: S.segments.length, sourceLabel: S.sourceLabel, enabled: S.enabled, segment: null
      });
      LY.log('字幕', r.cues.length, '行 →', S.segments.length, '段（來源：' + r.source + '）');
    } catch (e) {
      S.active = false;
      setBadge(false);
      Panel.render({ kind: 'error', msg: String(e.message || e), total: 0, enabled: S.enabled, active: true });
    }
  }

  // 結束：回到只剩啟動按鈕的狀態，之後不會自行動作
  function stop() {
    const v = S.videoId;
    detach();
    S.videoId = v;
    S.routed = true;
    Panel.mount(handlers);
    renderLauncher();
  }

  function setBadge(on) {
    try { chrome.runtime.sendMessage({ type: 'setBadge', on: !!on }); } catch (e) { /* 背景沒反應也無所謂 */ }
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const old = S.settings;
    S.settings = await LY.getSettings();
    if (!S.active && !S.cues && S.routed) {
      S.enabled = S.settings.autoPause !== false;
      renderLauncher();
      return;
    }
    if (!S.cues) return;
    if (old && old.segmentSeconds !== S.settings.segmentSeconds) {
      S.segments = LY.buildSegments(S.cues, S.settings.segmentSeconds);
      S.analyses = new Map();
      arm(S.video.currentTime);
      Panel.render({ kind: 'ready', total: S.segments.length, sourceLabel: S.sourceLabel, enabled: S.enabled });
    }
  });

  // 工具列圖示：觀看中可隨時切換啟用狀態
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'toggle') return;
    if (!S.videoId) { sendResponse({ ok: false, reason: 'not-watch-page' }); return; }
    if (S.active) stop(); else start();
    sendResponse({ ok: true, active: S.active });
  });

  window.addEventListener('yt-navigate-finish', () => setTimeout(route, 500));
  setInterval(() => {
    const v = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (v !== S.videoId) route();
  }, 1500);
  route();
})();
