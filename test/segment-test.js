// 切段與句子時間：都是純函式，直接載入真正的 segmenter.js
//
//   node test/segment-test.js
const t = require('./harness');
globalThis.LY = {};
require(t.ROOT + '/content/segmenter.js');

const mk = (texts, dur) => ({
  start: 0, end: texts.length * (dur || 5),
  lines: texts.map((text, i) => ({ i, start: i * (dur || 5), end: (i + 1) * (dur || 5), text }))
});

// ---------------------------------------------------------------- 切段
t.section('切段：有標點的字幕');
{
  // 每 2.5 秒一行，每 5 行一個句尾
  const cues = Array.from({ length: 72 }, (_, i) => ({
    start: i * 2.5, end: (i + 1) * 2.5,
    text: 'mot mot mot mot mot mot' + (i % 5 === 4 ? '.' : '')
  }));
  const segs = LY.buildSegments(cues, 30);
  const lens = segs.map((s) => s.end - s.start);
  t.ok(segs.length > 0, '有切出段落');
  t.ok(lens.every((l) => l >= 15 && l <= 45), '長度都在合理範圍', lens.join(','));
  t.eq(segs.reduce((n, s) => n + s.lines.length, 0), cues.length, '每一行字幕都被涵蓋');
  t.ok(segs.every((s, i) => i === 0 || Math.abs(s.start - segs[i - 1].end) < 1e-6), '段落首尾相接沒有空隙');
  t.ok(segs.slice(0, -1).every((s) => /[.!?]$/.test(s.lines[s.lines.length - 1].text)), '都停在句尾');
}

t.section('切段：完全沒有標點（自動字幕的常態）');
{
  const cues = Array.from({ length: 72 }, (_, i) => ({
    start: i * 2.5, end: (i + 1) * 2.5, text: 'mot mot mot'
  }));
  const lens = LY.buildSegments(cues, 30).map((s) => s.end - s.start);
  // 這裡曾經膨脹到 42–51 秒，因為只靠句尾判斷而自動字幕沒有標點
  t.ok(Math.max(...lens) <= 30 * 1.35 + 2.5, '沒有膨脹成兩倍長', '最長 ' + Math.max(...lens));
  t.near(lens.reduce((a, b) => a + b, 0) / lens.length, 30, 6, '平均長度接近設定值');
}

t.section('切段：真實影片的行長（約 7 秒一行）');
{
  const cues = Array.from({ length: 61 }, (_, i) => ({
    start: i * 7.26, end: (i + 1) * 7.26, text: 'bonjour les amis et bienvenue dans ce nouvel épisode'
  }));
  const segs = LY.buildSegments(cues, 30);
  const lens = segs.map((s) => s.end - s.start);
  t.near(lens.reduce((a, b) => a + b, 0) / lens.length, 30, 5, '平均長度接近 30 秒');
  t.eq(segs.reduce((n, s) => n + s.lines.length, 0), cues.length, '沒有漏掉任何一行');
}

t.section('切段：壞輸入');
{
  t.eq(LY.buildSegments([], 30).length, 0, '空字幕回空陣列');
  t.eq(LY.buildSegments([{ start: 0, end: 3, text: 'a' }], 30).length, 1, '只有一行也切得出來');
}

// ------------------------------------------------------- 句子對應時間
t.section('句子時間：一行多句要分開');
{
  const seg = mk([
    "toi ça va un peu fatigué mais ça va tu es fatigué à cause du",
    "travail oui j'étais de garde à l'hôpital tout le weekend donc je n'ai"
  ], 7.3);
  const sentences = [
    { text: 'Toi, ça va ?', start_line: 0, end_line: 0 },
    { text: 'Un peu fatigué, mais ça va.', start_line: 0, end_line: 0 },
    { text: 'Tu es fatigué à cause du travail ?', start_line: 0, end_line: 1 }
  ];
  const times = LY.sentenceTimes(seg, sentences);
  t.eq(times.length, 3, '每句都有時間');
  t.ok(new Set(times.map((x) => x.start.toFixed(2))).size === 3, '三句的起點各不相同');
  t.ok(times.every((x, i) => i === 0 || x.start >= times[i - 1].start), '時間單調遞增');
  t.ok(times.every((x) => x.end > x.start), '每句長度為正');
  t.ok(times[0].end - times[0].start < times[2].end - times[2].start, '短句的時間比長句短');
}

t.section('句子時間：模型回傳壞資料也不能爆');
{
  const seg = mk(['aaa bbb ccc', 'ddd eee fff']);
  const cases = [
    ['行號超出範圍', [{ text: 'A.', start_line: 0, end_line: 99 }, { text: 'B.', start_line: -5, end_line: 1 }]],
    ['行號顛倒', [{ text: 'A.', start_line: 1, end_line: 0 }]],
    ['行號不是數字', [{ text: 'A.', start_line: 'x', end_line: null }]],
    ['文字是空的', [{ text: '', start_line: 0, end_line: 0 }, { text: '', start_line: 0, end_line: 0 }]],
    ['一句蓋整段', [{ text: 'A B C.', start_line: 0, end_line: 1 }]],
    ['句子比字幕長很多', [{ text: 'x'.repeat(500), start_line: 0, end_line: 0 }]],
    ['全部擠在最後一行', [{ text: 'A.', start_line: 1, end_line: 1 }, { text: 'B.', start_line: 1, end_line: 1 }]]
  ];
  for (const [name, sentences] of cases) {
    let r = null, err = null;
    try { r = LY.sentenceTimes(seg, sentences); } catch (e) { err = e; }
    const good = !err && r.length === sentences.length &&
      r.every((x) => isFinite(x.start) && isFinite(x.end) && x.end > x.start &&
                     x.start >= -0.01 && x.end <= seg.lines[seg.lines.length - 1].end + 0.5) &&
      r.every((x, i) => i === 0 || x.start >= r[i - 1].start - 0.01);
    t.ok(good, name, err ? '丟出 ' + err.message : JSON.stringify(r));
  }
  t.eq(LY.sentenceTimes({ lines: [] }, [{ text: 'A', start_line: 0, end_line: 0 }]).length, 0, '沒有字幕時回空陣列');
  t.eq(LY.sentenceTimes({}, [{ text: 'A', start_line: 0, end_line: 0 }]).length, 0, 'lines 未定義也不爆');
}

t.finish();
