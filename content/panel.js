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
    const pauseBtn = el('button', {
      class: 'ly-icon' + (vm.enabled ? ' on' : ''),
      title: vm.enabled ? '自動暫停：開（點擊關閉）' : '自動暫停：關（點擊開啟）',
      text: vm.enabled ? '⏸ 自動' : '▷ 連續',
      onclick: () => P.on.toggleEnabled && P.on.toggleEnabled()
    });
    const gear = el('button', {
      class: 'ly-icon', title: '設定', text: '⚙',
      onclick: () => P.on.openOptions && P.on.openOptions()
    });
    const fold = el('button', {
      class: 'ly-icon', title: '收合', text: '–',
      onclick: () => P.root.classList.toggle('ly-collapsed')
    });
    return [title, seg, spacer, pauseBtn, gear, fold];
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
      const li = el('li', { class: 'ly-sent' }, [main, tools]);
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
        el('button', {
          class: 'ly-mini ly-star', text: '★', title: '加入生字本',
          onclick: (e) => {
            e.currentTarget.classList.add('saved');
            P.on.star && P.on.star(Object.assign({ type: 'word' }, v));
          }
        })
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
          el('button', {
            class: 'ly-mini ly-star', text: '★', title: '加入生字本',
            onclick: (e) => {
            e.currentTarget.classList.add('saved');
            P.on.star && P.on.star({ type: 'phrase', word: p.phrase, lemma: '', pos: '', meaning: p.meaning, note: p.note });
          }
          })
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
    P.foot.classList.remove('ly-foot-wrap');

    if (vm.kind === 'loading') {
      P.body.appendChild(el('div', { class: 'ly-msg' }, [el('span', { class: 'ly-spin' }), vm.msg || '處理中…']));
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
        vm.nextStop != null ? `播放中…下一個停點 ${LY.fmtTime(vm.nextStop)}` : '播放中…已經是最後一段'
      ]));
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
        text: st.starred ? `匯出收藏的 ${st.starred} 個 → Anki` : '還沒有收藏任何項目',
        title: '匯出成 Anki 可以直接匯入的 CSV',
        onclick: () => st.starred && P.on.exportCsv && P.on.exportCsv('starred')
      }));
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '從頭再看',
        onclick: () => P.on.restart && P.on.restart() }));
      P.foot.appendChild(el('button', {
        class: 'ly-btn', text: '匯出全部',
        title: '這部影片整理過的所有單字與片語',
        onclick: () => P.on.exportCsv && P.on.exportCsv('all')
      }));
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
            el('button', {
              class: 'ly-mini ly-star', text: '★', title: '加入生字本',
              onclick: (e) => {
                e.currentTarget.classList.add('saved');
                P.on.star && P.on.star({ type: 'grammar', word: n, lemma: '', pos: '', meaning: '', note: '' });
              }
            })
          ])))));
      }
      if (vm.cached) P.body.appendChild(el('div', { class: 'ly-foot-note', text: '（這段用的是之前的分析結果，沒有重新呼叫 API）' }));

      P.foot.appendChild(el('button', { class: 'ly-btn', text: '↻ 重聽整段', onclick: () => P.on.replaySegment && P.on.replaySegment() }));
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '匯出 CSV', title: '匯出這部影片已收集的生字', onclick: () => P.on.exportCsv && P.on.exportCsv('all') }));
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
