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

  // 注意：視窗變窄、劇院模式或全螢幕時，YouTube 會將 #secondary 設為 display:none，
  // 但元素仍留在 DOM 中。若只檢查「存在」，面板會被掛進看不見的容器而無法顯示，
  // 因此須檢查該元素確實參與版面。
  function usable(node) {
    if (!node) return false;
    if (node.offsetParent === null) return false;
    return node.getBoundingClientRect().width > 80;
  }

  function host() {
    const inner = document.querySelector('#secondary-inner');
    if (usable(inner)) return inner;
    const sec = document.querySelector('#secondary');
    if (usable(sec)) return sec;
    return null;   // 找不到可用的側欄 → 改用浮動面板
  }

  // 版面會在使用者切換劇院模式或調整視窗大小時變動，面板須隨之調整位置
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
    P.body.addEventListener('mouseup', () => setTimeout(showSelTool, 0));
    P.body.addEventListener('scroll', hideSelTool);
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
    const title = el('span', { class: 'ly-brand', text: '語言助手' });
    const seg = el('span', {
      class: 'ly-segname',
      text: vm.segment
        ? `${vm.segment.index + 1}/${vm.total} · ${LY.fmtTime(vm.segment.start)}–${LY.fmtTime(vm.segment.end)}`
        : (vm.total ? `共 ${vm.total} 段` : '')
    });
    const spacer = el('span', { class: 'ly-spacer' });
    const running = vm.kind !== 'launcher';
    const pauseBtn = running ? el('button', {
      class: 'ly-icon' + (vm.enabled ? ' on' : ''),
      title: vm.enabled ? '每段自動暫停：開（點此改為連續播放）' : '每段自動暫停：關（點此開啟自動暫停）',
      text: vm.enabled ? '⏸ 自動停' : '▶ 連續播',
      onclick: () => P.on.toggleEnabled && P.on.toggleEnabled()
    }) : null;
    const stopBtn = running ? el('button', {
      class: 'ly-icon', title: '結束這部影片的學習', text: '⏹',
      onclick: () => P.on.stop && P.on.stop()
    }) : null;
    const gear = el('button', {
      class: 'ly-icon', title: '開啟設定', text: '⚙',
      onclick: () => P.on.openOptions && P.on.openOptions()
    });
    const collapsed = P.root && P.root.classList.contains('ly-collapsed');
    const fold = el('button', {
      class: 'ly-icon',
      title: collapsed ? '展開面板' : '收合面板',
      text: collapsed ? '▸' : '▾',
      onclick: () => {
        const isCollapsed = P.root.classList.toggle('ly-collapsed');
        fold.textContent = isCollapsed ? '▸' : '▾';
        fold.title = isCollapsed ? '展開面板' : '收合面板';
      }
    });
    return [title, seg, spacer, pauseBtn, stopBtn, gear, fold];
  }

  function toggles() {
    const mk = (label, key, title) => el('button', {
      class: 'ly-chip' + (P.opts[key] ? ' on' : ''), text: label, title,
      onclick: () => { P.opts[key] = !P.opts[key]; P.render(P.last); }
    });
    const chips = el('div', { class: 'ly-chips' }, [
      mk('顯示翻譯', 'showZh', '隱藏後可練習聽力，點擊句子即可單獨顯示'),
      mk('聽寫模式', 'dictation', '先遮住原文只靠聽力，點擊句子再揭曉')
    ]);
    if (!P.opts.showZh || P.opts.dictation) {
      return el('div', {}, [
        chips,
        el('div', { class: 'ly-mode-hint', text: '提示：點擊模糊的句子即可揭曉並播放' })
      ]);
    }
    return chips;
  }

  // 可隨時匯出目前的收藏，不必等整部影片看完（使用者常分次觀看）。
  // 兩種匯出各有用途：表格供閱讀（Excel），Anki 檔供匯入 Anki。
  function exportRow(scope) {
    const label = el('span', { class: 'ly-export-label' });
    const excel = el('button', { class: 'ly-mini', text: '↓ 表格', title: '匯出詳細欄位表格，可用 Excel 或 Numbers 開啟' });
    const anki = el('button', { class: 'ly-mini', text: '↓ Anki', title: '原文＋翻譯兩欄，可直接匯入 Anki' });

    P.syncExportBtn = () => {
      const n = P.on.starredCount ? P.on.starredCount() : 0;
      label.textContent = n ? `已收藏 ${n} 項` : '尚未收藏';
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

  // ---------- 框選句子的一小段 ----------
  // 句子較長時，常只需記住其中一個子句，或只有某個結構看不懂。
  // 在原文那一行選取文字，即會出現「解說 / 收藏」。
  let selTool = null;

  function hideSelTool() {
    if (selTool && selTool.parentNode) selTool.parentNode.removeChild(selTool);
    selTool = null;
  }

  function selectionInfo() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = String(sel).trim();
    if (text.length < 2) return null;

    // 僅處理原文那一行的選取：中文翻譯與單字卡不需要此功能
    let node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentNode;
    const fr = node && node.closest && node.closest('.ly-fr');
    if (!fr || !P.root || !P.root.contains(fr)) return null;
    // 有假名標註時 textContent 會混入假名，一律以 dataset.plain 保存的原文為準
    const plain = (fr.dataset && fr.dataset.plain) || fr.textContent;
    // 若整句都被選取，使用原本的句子收藏即可
    if (text === plain.trim()) return null;

    const li = fr.closest('.ly-sent');
    return {
      text,
      sentence: plain.trim(),
      sentenceZh: li && li.querySelector('.ly-zh') ? li.querySelector('.ly-zh').textContent.trim() : '',
      rect: sel.getRangeAt(0).getBoundingClientRect(),
      li
    };
  }

  function showSelTool() {
    const info = selectionInfo();
    hideSelTool();
    if (!info) return;

    const explain = el('button', { class: 'ly-mini', text: '💡 解說' });
    const save = el('button', { class: 'ly-mini', text: '★ 收藏' });
    selTool = el('div', { class: 'ly-seltool' }, [explain, save]);

    const base = P.root.getBoundingClientRect();
    selTool.style.left = Math.max(4, Math.min(info.rect.left - base.left, base.width - 140)) + 'px';
    selTool.style.top = (info.rect.bottom - base.top + 6) + 'px';
    P.root.appendChild(selTool);

    explain.addEventListener('mousedown', (e) => {
      e.preventDefault();
      hideSelTool();
      P.on.explainFragment && P.on.explainFragment(info);
    });
    save.addEventListener('mousedown', (e) => {
      e.preventDefault();
      hideSelTool();
      P.on.starFragment && P.on.starFragment(info);
    });
  }

  // 顯示解說：接在那個句子底下，保留上下文
  P.showExplain = function (info, state) {
    if (!info.li || !document.contains(info.li)) return;
    const old = info.li.nextElementSibling;
    if (old && old.classList && old.classList.contains('ly-explain')) old.remove();

    const box = el('div', { class: 'ly-explain' }, [
      el('div', { class: 'ly-ex-frag', text: '「' + info.text + '」' })
    ]);

    if (state.loading) {
      box.appendChild(el('div', { class: 'ly-msg' }, [el('span', { class: 'ly-spin' }), '正在解說…']));
    } else if (state.error) {
      box.appendChild(el('div', { class: 'ly-msg ly-err', text: state.error }));
    } else {
      const d = state.data;
      box.appendChild(el('div', { class: 'ly-ex-meaning', text: d.meaning || '' }));
      if ((d.breakdown || []).length) {
        box.appendChild(el('ul', { class: 'ly-ex-parts' }, d.breakdown.map((b) =>
          el('li', {}, [el('b', { text: b.part }), ' ', el('span', { text: b.meaning })]))));
      }
      if (d.note) box.appendChild(el('div', { class: 'ly-ex-note', text: d.note }));
      box.appendChild(el('div', { class: 'ly-ex-foot' }, [
        starBtn({ type: 'fragment', word: info.text, meaning: d.meaning || '',
                  lemma: '', pos: '', note: d.note || '' }),
        el('button', { class: 'ly-mini', text: '關閉', onclick: () => box.remove() })
      ]));
    }
    info.li.insertAdjacentElement('afterend', box);
  };

  // 日文假名標註。模型只回傳整串讀音，由 LY.furigana 切開並對齊至各漢字上方；
  // 對不上時：單字退回整個詞標註一次，句子則不標註（整句掛一個 rt 反而更難閱讀）。
  function ruby(text, reading, whole) {
    const t = String(text || '');
    if (!reading || !LY.hasKanji(t)) return document.createTextNode(t);

    const parts = LY.furigana(t, reading);
    if (!parts) return whole ? el('ruby', {}, [t, el('rt', { text: reading })]) : document.createTextNode(t);

    const frag = document.createDocumentFragment();
    for (const p of parts) {
      frag.appendChild(p.r ? el('ruby', {}, [p.t, el('rt', { text: p.r })]) : document.createTextNode(p.t));
    }
    return frag;
  }

  // 單字／片語的發音鈕。句子不需要：點擊句子即可跳回影片聽原聲，
  // 真人語調優於合成音；單字沒有各自的時間點，才需要合成音。
  function speakBtn(text) {
    if (!P.on.speak) return null;
    const b = el('button', { class: 'ly-mini ly-speak', text: '🔊', title: '聽發音（合成音）' });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (P.on.speak(text) === false) b.title = '此電腦未安裝此語言的語音';
    });
    return b;
  }

  // 收藏鈕。狀態一律向 app 查詢，不可僅記錄在 DOM 的 class 上——
  // 面板每次重繪（例如切換「顯示翻譯」）都會重置 class。
  function starBtn(item, extraClass) {
    const on = !!(P.on.isStarred && P.on.isStarred(item.type, item.word));
    const b = el('button', {
      class: 'ly-mini ly-star' + (extraClass ? ' ' + extraClass : '') + (on ? ' saved' : ''),
      text: '★',
      title: on ? '已收藏，點擊取消' : '加入生字本'
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !b.classList.contains('saved');
      b.classList.toggle('saved', next);
      b.title = next ? '已收藏，點擊取消' : '加入生字本';
      if (P.on.toggleStar) P.on.toggleStar(item, next);
      if (P.syncExportBtn) P.syncExportBtn();
    });
    return b;
  }

  function sentenceList(vm) {
    const list = el('ol', { class: 'ly-sents' });
    (vm.data.sentences || []).forEach((s, i) => {
      // 另存一份原文：加上 ruby 之後 textContent 會混入假名，
      // 框選解說與「是否整句被選取」的判斷都必須使用不含假名的原文
      const fr = el('div', { class: 'ly-fr' }, [ruby(s.text, s.reading, false)]);
      fr.dataset.plain = s.text;
      const zh = el('div', { class: 'ly-zh', text: s.translation || '' });
      const main = el('div', { class: 'ly-sent-main' }, [fr, zh]);
      const tools = el('div', { class: 'ly-sent-tools' }, [
        el('button', { class: 'ly-mini', text: '▶', title: '播放這一句',
          onclick: (e) => { e.stopPropagation(); P.on.playSentence && P.on.playSentence(s, 1, i); } }),
        el('button', { class: 'ly-mini', text: '0.75×', title: '慢速跟讀（0.75×）',
          onclick: (e) => { e.stopPropagation(); P.on.playSentence && P.on.playSentence(s, 0.75, i); } })
      ]);
      // 收藏鈕置於 tools 之外：tools 平時為透明（hover 時才顯示），
      // 但收藏鈕須隨時可見，才容易被使用
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
        el('b', { class: 'ly-word' }, [ruby(v.word, v.reading, true)]),
        v.lemma && v.lemma !== v.word ? el('span', { class: 'ly-lemma', text: '← ' + v.lemma }) : null,
        v.pos ? el('i', { class: 'ly-pos', text: v.pos }) : null,
        el('span', { class: 'ly-spacer' }),
        speakBtn(v.word),
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
          el('b', { class: 'ly-word' }, [ruby(p.phrase, p.reading, true)]),
          el('span', { class: 'ly-spacer' }),
          speakBtn(p.phrase),
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

    hideSelTool();
    P.body.textContent = '';
    P.foot.textContent = '';
    P.syncExportBtn = null;
    P.foot.classList.remove('ly-foot-wrap');

    if (vm.kind === 'launcher') {
      const tag = [vm.langLabel, vm.providerLabel].filter(Boolean).join(' · ');
      const needKey = vm.hasKey === false;
      P.body.appendChild(el('div', { class: 'ly-launch' }, [
        el('div', { class: 'ly-launch-head' }, [
          el('div', { class: 'ly-launch-title', text: '開始學習這部影片' }),
          tag ? el('span', { class: 'ly-launch-tag', text: tag }) : null
        ]),
        el('div', { class: 'ly-launch-desc', text:
          '每 30 秒自動暫停，整理單字、片語與逐句翻譯；也能框選句子即時請 AI 解說。' }),
        needKey ? el('div', { class: 'ly-launch-warn', text: '尚未設定 API Key，請先至設定頁完成設定。' }) : null,
        el('div', { class: 'ly-launch-note', text:
          '未啟動前不讀字幕也不消耗 API；啟動後字幕將送往你設定的 AI 供應商分析。' })
      ]));
      P.foot.appendChild(needKey
        ? el('button', {
            class: 'ly-btn ly-wide ly-primary', text: '⚙ 前往設定 API Key',
            onclick: () => P.on.openOptions && P.on.openOptions()
          })
        : el('button', {
            class: 'ly-btn ly-wide ly-primary', text: '▶ 開始學習這部影片',
            onclick: () => P.on.start && P.on.start()
          }));
      P.foot.classList.add('ly-foot-wrap');
    } else if (vm.kind === 'loading') {
      P.body.appendChild(el('div', { class: 'ly-msg' }, [el('span', { class: 'ly-spin' }), vm.msg || '處理中…']));
      if (vm.lines && vm.lines.length) {
        P.body.appendChild(el('section', { class: 'ly-sec' }, [
          el('h4', {}, ['這段原文', el('small', { text: 'AI 整理完成後會自動顯示' })]),
          el('div', { class: 'ly-raw' }, vm.lines.map((t) => el('div', { class: 'ly-raw-line', text: t })))
        ]));
        P.foot.appendChild(el('button', { class: 'ly-btn', text: '↻ 重聽這段',
          onclick: () => P.on.replaySegment && P.on.replaySegment() }));
      }
    } else if (vm.kind === 'mismatch') {
      P.body.appendChild(el('div', { class: 'ly-msg ly-err' }, [
        `偵測到字幕為「${vm.got}」，與設定的「${vm.want}」不同。`
      ]));
      if (vm.sample) P.body.appendChild(el('div', { class: 'ly-raw' }, [
        el('div', { class: 'ly-raw-line', text: vm.sample + '…' })
      ]));
      P.body.appendChild(el('div', { class: 'ly-foot-note' }, [
        'YouTube 預設會依帳號語言提供字幕。你可以換一部影片、到設定更改學習語言，或直接以這份字幕繼續。'
      ]));
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '前往設定',
        onclick: () => P.on.openOptions && P.on.openOptions() }));
      P.foot.appendChild(el('button', { class: 'ly-btn ly-primary', text: '仍用此字幕',
        title: '照這份字幕繼續分析', onclick: () => P.on.continueAnyway && P.on.continueAnyway() }));
    } else if (vm.kind === 'error') {
      const msg = vm.msg || '發生錯誤';
      P.body.appendChild(el('div', { class: 'ly-msg ly-err' }, [msg]));
      // 兩種錯誤外觀相同，但可採取的處理不同：
      // 有 segment = 複習途中這一段整理失敗，可重試這一段或略過後繼續觀看；
      // 無 segment = 字幕尚未載入就失敗，沒有「這一段」可供重試或略過。
      if (vm.segment) {
        P.foot.appendChild(el('button', { class: 'ly-btn', text: '重試', onclick: () => P.on.retry && P.on.retry() }));
        P.foot.appendChild(el('button', { class: 'ly-btn ly-primary', text: '略過這段 ▶', onclick: () => P.on.continue && P.on.continue() }));
      } else {
        if (/API key|設定/i.test(msg)) {
          P.foot.appendChild(el('button', { class: 'ly-btn', text: '⚙ 前往設定', onclick: () => P.on.openOptions && P.on.openOptions() }));
        }
        P.foot.appendChild(el('button', { class: 'ly-btn ly-primary', text: '↻ 重新載入字幕', onclick: () => P.on.reload && P.on.reload() }));
      }
    } else if (vm.kind === 'ready') {
      P.body.appendChild(el('div', { class: 'ly-msg ly-ok' }, [
        el('span', { class: 'ly-tick', text: '✓' }),
        `字幕已載入（${vm.sourceLabel}）`
      ]));
      P.body.appendChild(el('div', { class: 'ly-msg' }, [
        vm.enabled
          ? `共 ${vm.total} 段，播到段落結尾會自動暫停。`
          : `共 ${vm.total} 段（目前為連續播放模式）。`
      ]));
    } else if (vm.kind === 'watching') {
      P.body.appendChild(el('div', { class: 'ly-msg' }, [
        vm.waitingNotes ? '播放中…'
          : vm.nextStop != null ? `播放中 · 下次暫停 ${LY.fmtTime(vm.nextStop)}`
          : '播放中 · 已經是最後一段'
      ]));
      if (vm.waitingNotes) {
        P.body.appendChild(el('div', { class: 'ly-msg' }, [
          el('span', { class: 'ly-spin' }),
          '正在整理這段筆記，完成後就會自動暫停'
        ]));
      } else if (vm.nextStop != null) {
        P.body.appendChild(vm.ready
          ? el('div', { class: 'ly-msg ly-ok' }, [el('span', { class: 'ly-tick', text: '✓' }), '這段筆記已就緒，暫停就能開始複習'])
          : el('div', { class: 'ly-msg' }, [
              vm.pending ? el('span', { class: 'ly-spin' }) : null,
              vm.pending ? '背景預先整理中…' : '稍後將在背景預先整理這段筆記'
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
        el('div', { class: 'ly-done-title', text: '這部影片學習完成！' }),
        el('div', { class: 'ly-done-sub', text: st.title || '' }),
        el('div', { class: 'ly-stats' }, [
          row('已複習段落', `${st.reviewed} / ${st.total} 段`),
          row('影片長度', LY.fmtTime(st.duration)),
          row('整理單字', `${st.words} 個`),
          row('整理片語', `${st.phrases} 個`),
          row('已收藏項目', `${st.starred} 項`)
        ]),
        st.starred
          ? null
          : el('div', { class: 'ly-done-hint', text: '小提醒：複習時點擊字詞或句子旁的 ★，就能收進生字本。' }),
        // 累計看完一定部數後才出現（見 app.js 的 SUPPORT_AFTER），且僅出現在此畫面。
        // 學習途中不打擾；完成畫面是使用者剛完成一部影片、可從容閱讀的時刻。
        vm.support
          ? el('div', { class: 'ly-support' }, [
              el('div', { class: 'ly-support-msg', text: '免費、無廣告、不收你的資料 ✨ 覺得這個小工具有幫助的話，歡迎支持河童繼續進化！' }),
              el('a', {
                class: 'ly-support-link',
                href: 'https://ko-fi.com/kappa46122',
                target: '_blank',
                rel: 'noopener noreferrer',
                text: '☕ 請河童喝杯咖啡'
              })
            ])
          : null
      ]));

      P.foot.classList.add('ly-foot-wrap');
      if (st.starred) {
        P.foot.appendChild(el('button', {
          class: 'ly-btn ly-wide ly-primary',
          text: `↓ 匯出收藏到 Anki（${st.starred} 項）`,
          title: '原文＋翻譯兩欄，可直接匯入 Anki',
          onclick: () => P.on.exportCsv && P.on.exportCsv('starred', 'anki')
        }));
        P.foot.appendChild(el('button', {
          class: 'ly-btn', text: '↓ 匯出收藏表格',
          title: '收藏項目的詳細欄位，用 Excel 開啟',
          onclick: () => P.on.exportCsv && P.on.exportCsv('starred', 'excel')
        }));
      } else {
        P.foot.appendChild(el('button', {
          class: 'ly-btn', text: '↓ 匯出本片全部表格',
          title: '這部影片整理過的所有單字與片語',
          onclick: () => P.on.exportCsv && P.on.exportCsv('all', 'excel')
        }));
      }
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '↻ 從頭再看',
        onclick: () => P.on.restart && P.on.restart() }));
    } else if (vm.kind === 'result') {
      P.body.appendChild(toggles());
      const d = vm.data;
      if ((d.sentences || []).length) P.body.appendChild(section('逐句複習', '點擊播放 · 框選可解說', sentenceList(vm)));
      if ((d.vocab || []).length) P.body.appendChild(section('單字', '', vocabList(vm)));
      if ((d.phrases || []).length) P.body.appendChild(section('片語與口語', '', phraseList(vm)));
      if ((d.notes || []).length) {
        P.body.appendChild(section('文法重點', '可點 ★ 收藏', el('ul', { class: 'ly-notes' },
          d.notes.map((n) => el('li', {}, [
            el('span', { class: 'ly-note-text', text: n }),
            starBtn({ type: 'grammar', word: n, lemma: '', pos: '', meaning: '', note: '' })
          ])))));
      }
      if (vm.cached) P.body.appendChild(el('div', { class: 'ly-foot-note', text: '✓ 已使用快取結果（未重複消耗 API）' }));

      P.body.appendChild(exportRow('starred'));
      P.foot.appendChild(el('button', { class: 'ly-btn', text: '↻ 重聽這段', onclick: () => P.on.replaySegment && P.on.replaySegment() }));
      P.foot.appendChild(el('button', { class: 'ly-btn ly-primary', text: '繼續播放 ▶', onclick: () => P.on.continue && P.on.continue() }));
    }
  };

  let reflowTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => P.reflow(), 250);
  });
  // 切換劇院模式不一定會觸發 resize，因此也定期檢查
  setInterval(() => P.reflow(), 2000);

  LY.Panel = P;
})();
