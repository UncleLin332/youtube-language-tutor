// 側邊面板 UI
(() => {
  const LY = globalThis.LY;
  const el = LY.el;

  const P = {
    root: null,
    body: null,
    head: null,
    foot: null,
    on: {},
    opts: { showZh: true, dictation: false },
    last: null
  };

  // 注意：視窗變窄、劇院模式、全螢幕時，YouTube 會把 #secondary 設成 display:none，
  // 但元素還留在 DOM 裡。只檢查「存在」會讓面板掛進一個看不見的容器裡人間蒸發，
  // 所以這裡要檢查它真的有被算進版面。
  function usable(el) {
    if (!el) return false;
    if (el.offsetParent === null) return false;
    return el.getBoundingClientRect().width > 80;
  }

  function host() {
    const inner = document.querySelector('#secondary-inner');
    if (usable(inner)) return inner;
    const sec = document.querySelector('#secondary');
    if (usable(sec)) return sec;
    return null;   // 找不到可用的側欄 → 改用浮動面板
  }

  // 版面會在使用者切劇院模式／改變視窗大小時變動，面板要跟著換位置
  P.reflow = function () {
    if (!P.root || !document.contains(P.root)) return;
    const h = host();
    const floating = P.root.classList.contains('ly-floating');
    if (h && floating) {
      P.root.classList.remove('ly-floating');
      h.insertBefore(P.root, h.firstChild);
    } else if (!h && !floating) {
      P.root.classList.add('ly-floating');
      document.body.appendChild(P.root);
    } else if (h && P.root.parentNode !== h) {
      h.insertBefore(P.root, h.firstChild);
    }
  };

  P.mount = function (handlers) {
    P.on = handlers || {};
    if (P.root && document.contains(P.root)) return P.root;

    P.head = el('div', { class: 'ly-head' });
    P.body = el('div', { class: 'ly-body' });
    P.foot = el('div', { class: 'ly-foot' });
    P.root = el('div', { class: 'ly-panel' }, [P.head, P.body, P.foot]);

    const h = host();
    if (h) h.insertBefore(P.root, h.firstChild);
    else { P.root.classList.add('ly-floating'); document.body.appendChild(P.root); }
    return P.root;
  };

  P.unmount = function () {
    if (P.root && P.root.parentNode) P.root.parentNode.removeChild(P.root);
    P.root = null; P.last = null;
  };

  P.ensure = function () {
    if (!P.root || !document.contains(P.root)) {
      const keep = P.last;
      P.root = null;
      P.mount(P.on);
      if (keep) P.render(keep);
    }
  };

  function headerRow(vm) {
    const title = el('span', { class: 'ly-brand', text: '語言學習助手' });
    const seg = el('span', {
      class: 'ly-segname',
      text: vm.segment
        ? `第 ${vm.segment.index + 1}/${vm.total} 段 · ${LY.fmtTime(vm.segment.start)}–${LY.fmtTime(vm.segment.end)}`
        : (vm.total ? `共 ${vm.total} 段` : '')
    });
    const spacer = el('span', { class: 'ly-spacer' });
    const running = vm.kind !== 'launcher';
    const pauseBtn = running ? el('button', {
      class: 'ly-icon' + (vm.enabled ? ' on' : ''),
      title: vm.enabled ? '自動暫停：開（點擊關閉）' : '自動暫停：關（點擊開啟）',
      text: vm.enabled ? '⏸ 自動' : '▷ 連續',
      onclick: () => P.on.toggleEnabled && P.on.toggleEnabled()
    }) : null;
    const stopBtn = running ? el('button', {
      class: 'ly-icon', title: '結束這部影片的學習模式', text: '⏹',
      onclick: () => P.on.stop && P.on.stop()
    }) : null;
    const gear = el('button', {
      class: 'ly-icon', title: '設定', text: '⚙',
      onclick: () => P.on.openOptions && P.on.openOptions()
    });
    const fold = el('button', {
      class: 'ly-icon', title: '收合', text: '–',
      onclick: () => P.root.classList.toggle('ly-collapsed')
    });
    return [title, seg, spacer, pauseBtn, stopBtn, gear, fold];
  }

  function toggles() {
    const mk = (label, key, title) => {
      const b = el('button', {
        class: 'ly-chip' + (P.opts[key] ? ' on' : ''), text: label, title,
        onclick: () => { P.opts[key] = !P.opts[key]; P.render(P.last); }
      });
      return b;
    };
    return el('div', { class: 'ly-chips' }, [
      mk('顯示翻譯', 'showZh', '隱藏後點句子即可單獨顯示'),
      mk('聽寫模式', 'dictation', '先蓋住原文，只靠聽力，點一下再揭曉')
    ]);
  }

  // 隨時可以匯出目前收藏的，不必等整部影片看完（常常是分好幾次看的）。
  // 兩顆按鈕是兩種用途：表格給人看（Excel），Anki 檔給機器吃。
  function exportRow(scope) {
    const label = el('span', { class: 'ly-export-label' });
    const excel = el('button', { class: 'ly-mini', text: '📊 表格', title: '詳細欄位，用 Excel 或 Numbers 開' });
    const anki = el('button', { class: 'ly-mini', text: '★ Anki', title: '法文＋中文兩欄，用 Anki 內建的 Basic 直接匯入' });

    P.syncExportBtn = () => {
      const n = P.on.starredCount ? P.on.starredCount() : 0;
      label.textContent = n ? `收藏了 ${n} 個` : '還沒有收藏';
      for (const b of [excel, anki]) b.classList.toggle('ly-disabled', !n);
    };
    const go = (format) => () => {
      if (P.on.starredCount && !P.on.starredCount()) return;
      P.on.exportCsv && P.on.exportCsv(scope, format);
    };
    excel.addEventListener('click', go('excel'));
    anki.addEventListener('click', go('anki'));
    P.syncExportBtn();
    return el('div', { class: 'ly-export' }, [label, el('span', { class: 'ly-spacer' }), excel, anki]);
  }

  // 收藏鈕。狀態一律跟 app 查，不要只記在 DOM 的 class 上——
  // 面板任何一次重繪（例如切換「顯示翻譯」）都會把 class 洗掉。
  function starBtn(item, extraClass) {
    const on = !!(P.on.isStarred && P.on.isStarred(item.type, item.word));
    const b = el('button', {
      class: 'ly-mini ly-star' + (extraClass ? ' ' + extraClass : '') + (on ? ' saved' : ''),
      text: '★',
      title: on ? '已收藏，點一下取消' : '加入生字本'
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !b.classList.contains('saved');
      b.classList.toggle('saved', next);
      b.title = next ? '已收藏，點一下取消' : '加入生字本';
      if (P.on.toggleStar) P.on.toggleStar(item, next);
      if (P.syncExportBtn) P.syncExportBtn();
    });
    return b;
  }

  function sentenceList(vm) {
    const list = el('ol', { class: 'ly-sents' });
    (vm.data.sentences || []).forEach((s, i) => {
      const fr = el('div', { class: 'ly-fr', text: s.text });
      const zh = el('div', { class: 'ly-zh', text: s.translation || '' });
      const main = el('div', { class: 'ly-sent-main' }, [fr, zh]);
      const tools = el('div', { class: 'ly-sent-tools' }, [
        el('button', { class: 'ly-mini', text: '▶', title: '播放這一句',
          onclick: (e) => { e.stopPropagation(); P.on.playSentence && P.on.playSentence(s, 1, i); } }),
        el('button', { class: 'ly-mini', text: '0.75×', title: '放慢跟讀',
          onclick: (e) => { e.stopPropagation(); P.on.playSentence && P.on.playSentence(s, 0.75, i); } })
      ]);
      // 星號放在 tools 之外：tools 平常是透明的（hover 才顯示），
      // 但收藏要隨時看得到才會有人用
      const star = starBtn({
        type: 'sentence', word: s.text, meaning: s.translation || '',
        lemma: '', pos: '', note: ''
      }, 'ly-sent-star');
      const li = el('li', { class: 'ly-sent' }, [main, tools, star]);
      li.addEventListener('click', () => {
        li.classList.add('ly-revealed');
        P.on.playSentence && P.on.playSentence(s, 1, i);
      });
      list.appendChild(li);
    });
    return list;
  }

  function vocabList(vm) {
    const ul = el('ul', { class: 'ly-cards' });
    (vm.data.vocab || []).forEach((v) => {
      const head = el('div', { class: 'ly-card-head' }, [
        el('b', { class: 'ly-word', text: v.word }),
        v.lemma && v.lemma !== v.word ? el('span', { class: 'ly-lemma', text: '← ' + v.lemma }) : null,
        v.pos ? el('i', { class: 'ly-pos', text: v.pos }) : null,
        el('span', { class: 'ly-spacer' }),
        starBtn(Object.assign({ type: 'word' }, v))
      ]);
      const body = el('div', { class: 'ly-mean', text: v.meaning || '' });
      const note = v.note ? el('div', { class: 'ly-note', text: v.note }) : null;
      ul.appendChild(el('li', { class: 'ly-card' }, [head, body, note]));
    });
    return ul;
  }

  function phraseList(vm) {
    const ul = el('ul', { class: 'ly-cards' });
    (vm.data.phrases || []).forEach((p) => {
      ul.appendChild(el('li', { class: 'ly-card' }, [
        el('div', { class: 'ly-card-head' }, [
          el('b', { class: 'ly-word', text: p.phrase }),
          el('span', { class: 'ly-spacer' }),
          starBtn({ type: 'phrase', word: p.phrase, lemma: '', pos: '', meaning: p.meaning, note: p.note })
        ]),
        el('div', { class: 'ly-mean', text: p.meaning || '' }),
        p.note ? el('div', { class: 'ly-note', text: p.note }) : null
      ]));
    });
    return ul;
  }

  function section(title, hint, node) {
    return el('section', { class: 'ly-sec' }, [
      el('h4', {}, [title, hint ? el('small', { text: hint }) : null]),
      node
    ]);
  }

  P.render = function (vm) {
    P.ensure();
    P.reflow();
    if (!vm) return;
    P.last = vm;

    P.root.classList.toggle('ly-hide-zh', !P.opts.showZh);
    P.root.classList.toggle('ly-dictation', P.opts.dictation);

    P.head.textContent = '';
    headerRow(vm).forEach((n) => n && P.head.appendChild(n));

    P.body.textContent = '';
    P.foot.textContent = '';
    P.syncExportBtn = null;
    P.foot.classList.remove('ly-foot-wrap');

    if (vm.kind === 'launcher') {
      P.body.appendChild(el('div', { class: 'ly-launch' }, [
        el('div', { class: 'ly-launch-title', text: '要用這部影片學語言嗎？' }),
        el('div', { class: 'ly-launch-sub', text:
          '啟動後會抓字幕、每隔一段自動暫停並整理單字片語。沒按之前完全不會動作，也不會用到 API。' })
      ]));
      P.foot.appendChild(el('button', {
        class: 'ly-btn ly-wide ly-primary', text: '開始學習這部影片',
        onclick: () => P.on.start && P.on.start()
      }));
      P.foot.classList.add('ly-foot-wrap');
    } else if (vm.kind === 'loading') {
      P.body.appendChild(el('div', { class: 'ly-msg' }, [el('span', { class: 'ly-spin' }), vm.msg || '處理中…']));
      if (vm.lines && vm.lines.length) {
        P.body.appendChild(el('section', { class: 'ly-sec' }, [
          el('h4', {}, ['這一段的原文', el('small', { text: '筆記好了會接在下面' })]),
          el('div', { class: 'ly-raw' }, vm.lines.map((t) => el('div', { class: 'ly-raw-line', text: t })))
        ]));
        P.foot.appendChild(el('button', { class: 'ly-btn', text: '↻ 重聽整段',
          onclick: () => P.on.replaySegment && P.on.replaySegment() }));
      }
    } else if (vm.kind === 'error') {
      P.body.appendChild(el('div', { class: 'ly-msg ly-err' }, [vm.msg || '發生錯誤']));
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '重試', onclick: () => P.on.retry && P.on.retry() }));
      P.foot.appendChild(el('button', { class: 'ly-btn ly-primary', text: '略過這段 ▶', onclick: () => P.on.continue && P.on.continue() }));
    } else if (vm.kind === 'ready') {
      P.body.appendChild(el('div', { class: 'ly-msg' }, [
        `字幕已載入（${vm.sourceLabel}），共切成 ${vm.total} 段。播到第一個停點會自動暫停。`
      ]));
    } else if (vm.kind === 'watching') {
      P.body.appendChild(el('div', { class: 'ly-msg' }, [
        vm.waitingNotes ? '播放中…'
          : vm.nextStop != null ? `播放中…下一個停點 ${LY.fmtTime(vm.nextStop)}`
          : '播放中…已經是最後一段'
      ]));
      if (vm.waitingNotes) {
        P.body.appendChild(el('div', { class: 'ly-msg' }, [
          el('span', { class: 'ly-spin' }),
          '筆記還在整理，先讓影片繼續播 —— 好了就會停下來'
        ]));
      } else if (vm.nextStop != null) {
        P.body.appendChild(vm.ready
          ? el('div', { class: 'ly-msg ly-ok' }, [el('span', { class: 'ly-tick', text: '✓' }), '這一段已經整理好了，停下來就能直接開始'])
          : el('div', { class: 'ly-msg' }, [
              vm.pending ? el('span', { class: 'ly-spin' }) : null,
              vm.pending ? '背景整理中…' : '等一下會在背景先整理好這一段'
            ].filter(Boolean)));
      }
    } else if (vm.kind === 'done') {
      const st = vm.stats || {};
      const row = (k, v) => el('div', { class: 'ly-stat' }, [
        el('span', { class: 'ly-stat-k', text: k }),
        el('span', { class: 'ly-stat-v', text: String(v) })
      ]);
      P.body.appendChild(el('div', { class: 'ly-done' }, [
        el('div', { class: 'ly-done-icon', text: '🎉' }),
        el('div', { class: 'ly-done-title', text: '這部影片學完了！' }),
        el('div', { class: 'ly-done-sub', text: st.title || '' }),
        el('div', { class: 'ly-stats' }, [
          row('複習段落', `${st.reviewed} / ${st.total} 段`),
          row('影片長度', LY.fmtTime(st.duration)),
          row('整理單字', `${st.words} 個`),
          row('整理片語', `${st.phrases} 個`),
          row('你收藏了', `${st.starred} 個`)
        ]),
        st.starred
          ? null
          : el('div', { class: 'ly-done-hint', text: '下次看的時候，點單字旁邊的 ★ 就能收進生字本。' })
      ]));

      P.foot.classList.add('ly-foot-wrap');
      P.foot.appendChild(el('button', {
        class: 'ly-btn ly-wide ly-primary' + (st.starred ? '' : ' ly-disabled'),
        text: st.starred ? `★ 匯出收藏的 ${st.starred} 個 → Anki` : '還沒有收藏任何項目',
        title: '法文＋中文兩欄，用 Anki 內建的 Basic 直接匯入',
        onclick: () => st.starred && P.on.exportCsv && P.on.exportCsv('starred', 'anki')
      }));
      P.foot.appendChild(el('button', {
        class: 'ly-btn' + (st.starred ? '' : ' ly-disabled'), text: '📊 收藏表格',
        title: '收藏項目的詳細欄位，用 Excel 開',
        onclick: () => st.starred && P.on.exportCsv && P.on.exportCsv('starred', 'excel')
      }));
      P.foot.appendChild(el('button', {
        class: 'ly-btn', text: '📊 全部表格',
        title: '這部影片整理過的所有單字與片語',
        onclick: () => P.on.exportCsv && P.on.exportCsv('all', 'excel')
      }));
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '從頭再看',
        onclick: () => P.on.restart && P.on.restart() }));
    } else if (vm.kind === 'result') {
      P.body.appendChild(toggles());
      const d = vm.data;
      if ((d.sentences || []).length) P.body.appendChild(section('逐句複習', '點句子播放', sentenceList(vm)));
      if ((d.vocab || []).length) P.body.appendChild(section('單字', '', vocabList(vm)));
      if ((d.phrases || []).length) P.body.appendChild(section('片語・口語', '', phraseList(vm)));
      if ((d.notes || []).length) {
        P.body.appendChild(section('文法・重點', '可收藏', el('ul', { class: 'ly-notes' },
          d.notes.map((n) => el('li', {}, [
            el('span', { class: 'ly-note-text', text: n }),
            starBtn({ type: 'grammar', word: n, lemma: '', pos: '', meaning: '', note: '' })
          ])))));
      }
      if (vm.cached) P.body.appendChild(el('div', { class: 'ly-foot-note', text: '（這段用的是之前的分析結果，沒有重新呼叫 API）' }));

      P.body.appendChild(exportRow('starred'));
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '↻ 重聽整段', onclick: () => P.on.replaySegment && P.on.replaySegment() }));
      P.foot.appendChild(el('button', { class: 'ly-btn ly-primary', text: '繼續播放 ▶', onclick: () => P.on.continue && P.on.continue() }));
    }
  };

  let reflowTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => P.reflow(), 250);
  });
  // 劇院模式不一定會觸發 resize，所以也定期檢查一次
  setInterval(() => P.reflow(), 2000);

  LY.Panel = P;
})();
