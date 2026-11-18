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

  t.finish();
})();
