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
    collected: [],
    starred: [],         // 這部影片打過星號的項目
    times: null          // 目前這段的「句子 → 時間」對應表
  };

  // ---------- 播放控制 ----------
  function clampIdx(t) {
    if (!S.segments || !S.segments.length) return -1;
    for (let i = 0; i < S.segments.length; i++) if (t < S.segments[i].end - 0.05) return i;
    return -1;
  }

  function arm(t) { S.armed = clampIdx(t); }

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
    if (t >= seg.end - 0.05) enterReview(S.armed);
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
    S.mode = 'review';
    S.video.pause();
    const seg = S.segments[i];
    S.current = i;

    const cached = S.analyses.get(i);
    if (cached) { renderResult(i, cached); prefetch(i + 1); return; }

    Panel.render({ kind: 'loading', msg: '正在整理這段的單字與句子…', segment: seg, total: S.segments.length, enabled: S.enabled });
    try {
      const r = await requestAnalysis(i);
      if (S.mode !== 'review' || S.current !== i) return;
      renderResult(i, r);
      prefetch(i + 1);
    } catch (e) {
      Panel.render({ kind: 'error', msg: String(e.message || e), segment: seg, total: S.segments.length, enabled: S.enabled });
    }
  }

  async function requestAnalysis(i) {
    const seg = S.segments[i];
    const res = await chrome.runtime.sendMessage({
      type: 'analyze',
      videoId: S.videoId,
      settings: LY.resolve(S.settings),
      segment: { start: seg.start, end: seg.end, lines: seg.lines.map((l) => ({ i: l.i, text: l.text })) }
    });
    if (!res) throw new Error('背景程序沒有回應，請重新整理頁面。');
    if (res.error) throw new Error(res.error);
    S.analyses.set(i, res);
    collect(i, res.data);
    return res;
  }

  function prefetch(i) {
    if (!S.segments || i >= S.segments.length || S.analyses.has(i)) return;
    if (!LY.resolve(S.settings).apiKey) return;
    requestAnalysis(i).catch(() => {});
  }

  // 找一句包含這個詞的例句，當作卡片的例句
  function findExample(data, word) {
    if (!word) return null;
    const w = String(word).toLowerCase();
    const hit = (data.sentences || []).find((s) => (s.text || '').toLowerCase().includes(w));
    return hit ? { example: hit.text, exampleZh: hit.translation || '' } : null;
  }

  function entry(data, at, o) {
    const ex = o.type === 'grammar' ? null : findExample(data, o.word);
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
    // 句子 → 時間的對應表，點句子播放時用
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
      segment: null,
      total: S.segments ? S.segments.length : 0,
      enabled: S.enabled
    });
  }

  function showDone() {
    S.mode = 'done';
    S.range = null;
    const count = (t) => S.collected.filter((c) => c.type === t).length;
    Panel.render({
      kind: 'done',
      enabled: S.enabled,
      total: S.segments ? S.segments.length : 0,
      segment: null,
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
    S.mode = 'watching';
    endRange();
    const seg = S.segments[S.current];
    // 已經是最後一段的話直接收尾：影片播到底再 play() 有些瀏覽器會從頭開始
    const dur = S.video.duration || 0;
    if (S.current >= S.segments.length - 1 || (dur && seg && seg.end >= dur - 0.3)) {
      showDone();
      return;
    }
    if (seg && Math.abs(S.video.currentTime - seg.end) > 1.5) S.video.currentTime = seg.end;
    arm(S.video.currentTime);
    renderWatching();
    const p = S.video.play();
    if (p && p.catch) p.catch(() => {});
  }

  // ---------- 匯出 ----------
  function csvEscape(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

  function exportCsv() {
    if (!S.collected.length) { alert('這部影片還沒有收集到單字。'); return; }
    const rows = [['單字', '原形', '詞性', '解釋', '備註', '影片', '時間點']];
    for (const c of S.collected) {
      rows.push([c.word, c.lemma, c.pos, c.meaning, c.note, S.title,
        `https://youtu.be/${S.videoId}?t=${Math.floor(c.at)}`]);
    }
    const csv = '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = LY.el('a', { href: url, download: `vocab-${S.videoId}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function star(v) {
    const got = await chrome.storage.local.get('wordbook');
    const book = got.wordbook || [];
    if (!book.some((b) => b.word === v.word && b.meaning === v.meaning)) {
      book.push(Object.assign({}, v, {
        video: S.title,
        url: `https://youtu.be/${S.videoId}?t=${Math.floor((S.segments[S.current] || {}).start || 0)}`,
        savedAt: Date.now()
      }));
      await chrome.storage.local.set({ wordbook: book });
    }
  }

  const handlers = {
    continue: continueNext,
    retry: () => { S.analyses.delete(S.current); enterReview(S.current); },
    replaySegment: () => { const s = S.segments[S.current]; if (s) playRange(s.start, s.end, 1); },
    playSentence: (sent, rate, idx) => {
      const seg = S.segments[S.current];
      if (!seg) return;
      // 優先用按字數比例算出來的時間；萬一算不出來就退回整行
      const t = (S.times && S.times[idx]) || sentenceTime(seg, sent);
      playRange(t.start, t.end, rate);
    },
    toggleEnabled: () => {
      S.enabled = !S.enabled;
      if (S.mode === 'review' && !S.enabled) continueNext();
      else if (Panel.last) Panel.render(Object.assign({}, Panel.last, { enabled: S.enabled }));
      else renderWatching();
    },
    openOptions: () => chrome.runtime.sendMessage({ type: 'openOptions' }),
    exportCsv,
    restart,
    star
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
    S.mode = 'idle'; S.range = null; S.analyses = new Map(); S.collected = []; S.starred = []; S.times = null;
    Panel.unmount();
  }

  async function route() {
    const v = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (!v) { if (S.videoId) { S.videoId = null; detach(); } return; }
    if (v === S.videoId && S.segments) return;

    detach();
    S.videoId = v;
    const token = (S.token = Symbol('route'));
    S.settings = await LY.getSettings();
    S.enabled = S.settings.autoPause !== false;

    const video = await LY.waitFor(() => document.querySelector('video.html5-main-video') || document.querySelector('video'), 15000);
    if (!video || S.token !== token) return;
    S.video = video;

    Panel.mount(handlers);
    Panel.render({ kind: 'loading', msg: '正在取得字幕…', total: 0, enabled: S.enabled });

    try {
      const r = await LY.loadCues(S.settings);
      if (S.token !== token) return;
      if (!r.cues.length) {
        const hint = r.available && r.available.length
          ? `這部影片有字幕（${r.available.join('、')}），但抓不到內容，試著重新整理頁面。`
          : '這部影片沒有可用的字幕，無法分析。';
        Panel.render({ kind: 'error', msg: hint, total: 0, enabled: S.enabled });
        return;
      }
      S.cues = r.cues;
      S.title = r.title || document.title;
      // 之前看這部影片時收藏過的項目也算進來，完成畫面的數字和匯出才不會漏
      try {
        const book = (await chrome.storage.local.get('wordbook')).wordbook || [];
        S.starred = book.filter((b) => typeof b.url === 'string' && b.url.includes(S.videoId));
      } catch (e) { S.starred = []; }
      S.segments = LY.buildSegments(r.cues, S.settings.segmentSeconds);
      S.sourceLabel = (r.source === 'panel' ? '轉錄稿面板' : '字幕檔') +
        (r.langUsed ? ' · ' + r.langUsed + (r.isAuto ? ' 自動產生' : '') : '');

      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('play', onPlay);
      video.addEventListener('ended', onEnded);
      arm(video.currentTime);
      S.mode = 'watching';

      Panel.render({
        kind: 'ready', total: S.segments.length, sourceLabel: S.sourceLabel, enabled: S.enabled, segment: null
      });
      LY.log('字幕', r.cues.length, '行 →', S.segments.length, '段（來源：' + r.source + '）');
    } catch (e) {
      Panel.render({ kind: 'error', msg: String(e.message || e), total: 0, enabled: S.enabled });
    }
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const old = S.settings;
    S.settings = await LY.getSettings();
    if (!S.cues) return;
    if (old && old.segmentSeconds !== S.settings.segmentSeconds) {
      S.segments = LY.buildSegments(S.cues, S.settings.segmentSeconds);
      S.analyses = new Map();
      arm(S.video.currentTime);
      Panel.render({ kind: 'ready', total: S.segments.length, sourceLabel: S.sourceLabel, enabled: S.enabled });
    }
  });

  window.addEventListener('yt-navigate-finish', () => setTimeout(route, 500));
  setInterval(() => {
    const v = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (v !== S.videoId) route();
  }, 1500);
  route();
})();
