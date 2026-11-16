// 把字幕切成「約 N 秒、而且盡量停在句尾」的段落
//
// 自動字幕常常整段沒有標點，光靠句尾判斷會讓段落一路膨脹到兩倍長；
// 所以改成在 [target*0.7, target*1.35] 這個範圍內挑最佳切點：
// 句尾 / 明顯停頓最優先，其次才是最接近設定秒數的那一行。
(() => {
  const LY = globalThis.LY;
  const SENTENCE_END = /[.!?…。！？][)"»”'\]]?\s*$/;
  const CLAUSE_END = /[,;:，；：、][)"»”'\]]?\s*$/;
  const SENTENCE_BONUS = 12;  // 停在句尾，值得多/少切 12 秒
  const CLAUSE_BONUS = 4;

  function breakType(cues, i) {
    const gapNext = cues[i + 1] ? cues[i + 1].start - cues[i].end : 99;
    if (SENTENCE_END.test(cues[i].text) || gapNext > 0.8) return 2;
    if (CLAUSE_END.test(cues[i].text)) return 1;
    return 0;
  }

  function findBreak(cues, from, target) {
    const start = cues[from].start;
    const minLen = target * 0.7;
    const maxLen = target * 1.35;
    let best = null;
    for (let i = from; i < cues.length; i++) {
      const len = cues[i].end - start;
      if (len >= minLen) {
        const t = breakType(cues, i);
        const score = (t === 2 ? SENTENCE_BONUS : t === 1 ? CLAUSE_BONUS : 0) - Math.abs(len - target);
        if (!best || score > best.score) best = { i, score };
      }
      if (len >= maxLen) break;
    }
    return best ? best.i : Math.min(from + 1, cues.length - 1);
  }

  LY.buildSegments = (cues, targetSeconds) => {
    if (!cues || !cues.length) return [];
    const target = Math.max(10, Number(targetSeconds) || 30);
    const raw = [];
    let from = 0;
    while (from < cues.length) {
      const to = findBreak(cues, from, target);
      raw.push({ from, to });
      from = to + 1;
    }

    // 最後一段太短就併回前一段
    if (raw.length > 1) {
      const last = raw[raw.length - 1];
      if (cues[last.to].end - cues[last.from].start < target * 0.4) {
        raw[raw.length - 2].to = last.to;
        raw.pop();
      }
    }

    return raw.map((s, i) => ({
      index: i,
      start: cues[s.from].start,
      end: cues[s.to].end,
      lines: cues.slice(s.from, s.to + 1).map((c, j) => ({ i: j, start: c.start, end: c.end, text: c.text }))
    }));
  };
})();

// 把每個句子對應到實際時間
//
// 模型給的 start_line / end_line 只能定位到「字幕行」，但一行字幕常常含好幾個句子
// （實測 5 行 → 9 句），直接用行的時間會讓好幾句都播到同一段音訊。
// 這裡用字數比例把一行的時長分給共用它的句子：第一句佔該行前 40% 的字，就播前 40% 的時間。
// 語速有快慢，所以不會完全精準，但比整行重播準得多。
(() => {
  const LY = globalThis.LY;

  LY.sentenceTimes = (seg, sentences) => {
    const lines = seg.lines || [];
    const n = lines.length;
    if (!n || !sentences || !sentences.length) return [];

    const clamp = (v) => Math.min(Math.max(Math.trunc(Number(v) || 0), 0), n - 1);
    const items = sentences.map((s) => {
      const a = clamp(s.start_line);
      const b = Math.max(a, clamp(s.end_line == null ? s.start_line : s.end_line));
      return { a, b, len: Math.max(1, (s.text || '').length) };
    });

    // 字數流動模型：句子依序「倒進」一行一行的字幕，倒到哪一行的第幾個字，
    // 就對應那一行的第幾秒。跨行的句子會自然吃掉下一行的開頭，
    // 後面那句就不會再從整行開頭算起。
    const cap = lines.map((l) => Math.max(1, (l.text || '').length));
    const totalLine = cap.reduce((a, b) => a + b, 0);
    const totalSent = items.reduce((a, b) => a + b.len, 0);
    const scale = totalLine / totalSent;   // 模型補標點會讓字數略有出入，先對齊總量
    const need = items.map((it) => Math.max(0.5, it.len * scale));

    const out = items.map(() => ({ start: null, end: null }));
    let si = 0;
    let left = need[0];
    for (let L = 0; L < n && si < items.length; L++) {
      const t0 = lines[L].start;
      const dur = Math.max(0.1, lines[L].end - t0);
      let filled = 0;
      while (si < items.length && filled < cap[L] - 1e-9) {
        if (out[si].start === null) out[si].start = t0 + dur * (filled / cap[L]);
        const take = Math.min(left, cap[L] - filled);
        left -= take;
        filled += take;
        if (left <= 1e-9) {
          out[si].end = t0 + dur * (filled / cap[L]);
          si++;
          if (si < items.length) left = need[si];
        }
      }
    }

    for (let i = 0; i < out.length; i++) {
      if (out[i].start === null) out[i].start = lines[items[i].a].start;
      if (out[i].end === null) out[i].end = lines[items[i].b].end;
      // 用模型給的行號夾住，萬一模型漏字造成整體漂移也不會跑掉
      const la = lines[items[i].a];
      const lb = lines[items[i].b];
      out[i].start = Math.min(Math.max(out[i].start, la.start), la.end);
      out[i].end = Math.min(Math.max(out[i].end, out[i].start + 0.5), lb.end + 0.4);
      if (i > 0 && out[i].start < out[i - 1].start) out[i].start = out[i - 1].start;
    }
    return out;
  };
})();
