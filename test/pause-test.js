// 暫停時機：載入真正的 app.js，用假的 video 推進時間
//
// 規則是「停下來的時候筆記一定已經好了」：到了段落邊界如果還沒好，
// 就先讓影片繼續播（寬限期最多 20 秒），好了才停。
//
//   node test/pause-test.js
const t = require('./harness');

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

// 和 harness 產生的字幕一致，用來推算第一個段落邊界
function firstBoundary(app) {
  const cues = Array.from({ length: 20 }, (_, i) => ({
    start: i * 7, end: (i + 1) * 7, text: `ligne ${i} avec des mots français ici` }));
  return LY.buildSegments(cues, 30)[0].end;
}

(async () => {
  // ---------------------------------------------------------------
  t.section('筆記已經好了 → 準時停');
  {
    const app = await t.createApp();
    await app.handlers.start();
    await app.settle();
    const edge = firstBoundary(app);

    await app.tick(edge - 5);
    t.eq(app.video.paused, false, `邊界前（${edge - 5}s）還在播`);

    await app.tick(edge);
    await app.settle();
    t.eq(app.video.paused, true, `到邊界（${edge}s）就停`);
    t.eq(app.lastRender().kind, 'result', '停下來時筆記已經在畫面上');
  }

  // ---------------------------------------------------------------
  t.section('筆記還沒好 → 不停，繼續播到好為止');
  {
    const d = deferred();
    const app = await t.createApp({ analyze: () => d.promise });
    await app.handlers.start();
    await app.settle();
    const edge = firstBoundary(app);

    await app.tick(edge);
    t.eq(app.video.paused, false, '到邊界但筆記沒好 → 不暫停');
    t.eq(app.lastRender().waitingNotes, true, '面板說明正在等筆記');

    await app.tick(edge + 5);
    t.eq(app.video.paused, false, '寬限期內繼續播');

    d.resolve({ cached: false, data: JSON.parse(JSON.stringify(t.DEMO_ANALYSIS)) });
    await app.settle();
    await app.tick(edge + 6);
    await app.settle();
    t.eq(app.video.paused, true, '筆記一到就停');
    t.eq(app.lastRender().kind, 'result', '停下來時筆記已經在畫面上');
  }

  // ---------------------------------------------------------------
  t.section('筆記一直沒來 → 寬限期滿還是要停');
  {
    const app = await t.createApp({ analyze: () => new Promise(() => {}) });
    await app.handlers.start();
    await app.settle();
    const edge = firstBoundary(app);

    await app.tick(edge);
    await app.tick(edge + 19);
    t.eq(app.video.paused, false, '寬限 19 秒時還在播');

    await app.tick(edge + 21);
    await app.settle();
    t.eq(app.video.paused, true, '超過 20 秒就停下來');
    t.eq(app.lastRender().kind, 'loading', '改成顯示載入中');
    t.ok((app.lastRender().lines || []).length > 0, '至少先把這段的字幕原文給使用者');
  }

  // ---------------------------------------------------------------
  t.section('寬限期中拖曳跳轉 → 等待狀態要清掉');
  {
    const app = await t.createApp({ analyze: () => new Promise(() => {}) });
    await app.handlers.start();
    await app.settle();
    const edge = firstBoundary(app);

    await app.tick(edge);
    t.eq(app.lastRender().waitingNotes, true, '先進入寬限期');

    app.fire('seeked', 100);
    await app.settle();
    await app.tick(100);
    t.eq(app.video.paused, false, '跳轉後沒有被舊的等待狀態影響');
    t.ok(!app.lastRender().waitingNotes, '等待狀態已清除');
  }

  // ---------------------------------------------------------------
  t.section('關掉自動暫停 → 不管筆記好了沒都不停');
  {
    const app = await t.createApp({ settings: { autoPause: false } });
    await app.handlers.start();
    await app.settle();
    const edge = firstBoundary(app);
    await app.tick(edge + 30);
    t.eq(app.video.paused, false, '一路播過去不暫停');
  }

  // ---------------------------------------------------------------
  t.section('字幕語言和設定不符 → 不要默默分析下去');
  {
    const zh = Array.from({ length: 12 }, (_, i) => ({
      start: i * 7, end: (i + 1) * 7, text: '大家好我是日語教師今天的影片是實用日語' }));
    const app = await t.createApp({ cues: zh, settings: { targetLang: 'ja' } });
    await app.handlers.start();
    await app.settle(60);

    const last = app.lastRender();
    t.eq(last.kind, 'mismatch', '顯示語言不符的提示');
    t.eq(last.got, '中文', '說出抓到的是什麼語言');
    t.eq(last.want, '日文', '說出設定的是什麼語言');
    t.eq(app.calls.filter((c) => c.type === 'analyze').length, 0, '沒有白花 API 的錢');

    await app.handlers.continueAnyway();
    await app.settle(60);
    const after = app.lastRender().kind;
    t.ok(after === 'ready' || after === 'watching', '按「仍要用這份字幕」之後照常開始', '狀態是 ' + after);
    t.ok(app.renders.some((r) => r.kind === 'ready'), '有進到就緒狀態');
  }

  // ---------------------------------------------------------------
  // 贊助連結只在完成畫面出現，而且要看完幾部之後才出現。第一次就開口要錢，
  // 使用者連這東西好不好用都還不知道。門檻寫在 app.js 的 SUPPORT_AFTER。
  t.section('贊助連結的出現時機');
  {
    const finish = async (app) => {
      await app.handlers.start();
      await app.settle();
      app.fire('ended', app.video.duration);
      await app.settle();
      return app.lastRender();
    };

    const first = await t.createApp();
    const r1 = await finish(first);
    t.eq(r1.kind, 'done', '播完進到完成畫面');
    t.eq(r1.support, false, '第一次看完不顯示贊助連結');
    t.eq(first.store.finished, 1, '看完的部數記下來了');

    const third = await t.createApp();
    third.store.finished = 2;          // 之前已經看完兩部
    const r3 = await finish(third);
    t.eq(r3.support, true, '第三部看完才顯示');
    t.eq(third.store.finished, 3, '計數接著累加，不是從頭算');

    // 同一部「從頭再看」再看完一次，不應該灌水
    third.fire('ended', third.video.duration);
    await third.settle();
    t.eq(third.store.finished, 3, '同一部重看完不重複計數');

    // 學習途中的畫面不該出現贊助連結
    t.ok(
      third.renders.filter((r) => r.kind !== 'done').every((r) => !r.support),
      '只有完成畫面有，學習途中沒有'
    );
  }

  // ---------------------------------------------------------------
  // 回歸測試：字幕載入失敗的錯誤面板，和「這一段整理失敗」的錯誤面板長得一樣，
  // 以前共用同一組按鈕。但前者根本還沒有 segments，按下去會丟
  // TypeError: Cannot read properties of null (reading '-1')，而且沒人接。
  t.section('字幕載入失敗：錯誤面板的按鈕不該去碰不存在的段落');
  {
    const rejections = [];
    const onReject = (e) => rejections.push(e);
    process.on('unhandledRejection', onReject);

    const app = await t.createApp({ cues: [] });
    await app.handlers.start();
    await app.settle();

    const r = app.lastRender();
    t.eq(r.kind, 'error', '沒有字幕 → 顯示錯誤');
    t.eq(r.segment, undefined, '這種錯誤沒有「這一段」，面板要據此換按鈕');
    t.ok(typeof app.handlers.reload === 'function', '有「重新載入字幕」可以接');

    // 每個按鈕各自判定，共用一個變數的話前一顆的錯會污染後一顆
    const press = (fn) => { try { fn(); return null; } catch (e) { return String(e.message || e); } };
    t.eq(press(() => app.handlers.retry()), null, '按「重試」不會丟錯');
    t.eq(press(() => app.handlers.continue()), null, '按「略過這段」不會丟錯');
    t.eq(press(() => app.handlers.replaySegment()), null, '「重聽整段」不會丟錯');

    await app.settle();
    t.eq(rejections.length, 0, '沒有沒人接的 promise 錯誤');
    t.eq(app.lastRender().kind, 'error', '畫面還停在錯誤訊息上，沒被打壞');

    process.removeListener('unhandledRejection', onReject);
  }

  t.finish();
})();
