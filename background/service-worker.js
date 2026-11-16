// 背景 service worker：呼叫 LLM（content script 受 CORS 限制，不能直接打）＋ 結果快取
//
// 供應商的請求／解析邏輯在 providers.js，和 test/api-test.html 共用。
import { callModel } from './providers.js';

const CACHE_VERSION = 'v2';

function cacheKey(req) {
  const s = req.segment;
  return [CACHE_VERSION, req.videoId, req.settings.provider, req.settings.model,
    req.settings.nativeLang, Math.round(s.start), Math.round(s.end)].join(':');
}

async function analyze(req) {
  const key = cacheKey(req);
  const hit = await chrome.storage.local.get(key);
  if (hit[key]) return { data: hit[key], cached: true };

  if (!req.settings.apiKey) throw new Error('還沒設定 API key。點一下工具列的擴充圖示開啟設定頁。');
  const data = await callModel(req.settings, req.segment.lines);
  try {
    await chrome.storage.local.set({ [key]: data });
  } catch (e) {
    console.warn('[語言助手] 快取寫入失敗', e);
  }
  return { data, cached: false };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'analyze') {
    analyze(msg).then(
      (r) => sendResponse(r),
      (e) => sendResponse({ error: String((e && e.message) || e) })
    );
    return true;
  }

  if (msg.type === 'testKey') {
    callModel(msg.settings, [{ i: 0, text: 'Bonjour, ça va bien aujourd\'hui.' }]).then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: String((e && e.message) || e) })
    );
    return true;
  }

  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return;
  }

  if (msg.type === 'clearCache') {
    chrome.storage.local.get(null).then(async (all) => {
      const keys = Object.keys(all).filter((k) => /^v\d+:/.test(k));
      if (keys.length) await chrome.storage.local.remove(keys);
      sendResponse({ removed: keys.length });
    });
    return true;
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
