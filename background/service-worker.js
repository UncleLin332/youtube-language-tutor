// 背景 service worker：呼叫 LLM（content script 受 CORS 限制，不能直接打）＋ 結果快取
//
// 供應商的請求／解析邏輯在 providers.js，和 test/api-test.html 共用。
import { callModel, analyzeJob, explainJob } from './providers.js';

// v3：輸出新增日文的 reading（假名讀音）欄位。舊快取沒有此欄位，須更換版號，否則會持續取到沒有讀音的結果
const CACHE_VERSION = 'v3';

function cacheKey(req) {
  const s = req.segment;
  return [CACHE_VERSION, req.videoId, req.settings.provider, req.settings.model,
    req.settings.nativeLang, req.settings.targetLang || '', Math.round(s.start), Math.round(s.end)].join(':');
}

async function analyze(req) {
  const key = cacheKey(req);
  const hit = await chrome.storage.local.get(key);
  if (hit[key]) return { data: hit[key], cached: true };

  if (!req.settings.apiKey) throw new Error('尚未設定 API key，請點右上角 ⚙ 開啟設定頁。');
  const data = await callModel(req.settings, analyzeJob(req.settings, req.segment.lines));
  try {
    await chrome.storage.local.set({ [key]: data });
  } catch (e) {
    console.warn('[語言助手] 快取寫入失敗', e);
  }
  return { data, cached: false };
}

function explainKey(req) {
  const s = req.settings;
  return [CACHE_VERSION, 'ex', s.provider, s.model, s.nativeLang,
    (req.fragment || '').slice(0, 120), (req.sentence || '').slice(0, 120)].join(':');
}

async function explain(req) {
  const key = explainKey(req);
  const hit = await chrome.storage.local.get(key);
  if (hit[key]) return { data: hit[key], cached: true };

  if (!req.settings.apiKey) throw new Error('尚未設定 API key，請點右上角 ⚙ 開啟設定頁。');
  const data = await callModel(req.settings, explainJob(req.settings, req));
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

  if (msg.type === 'explain') {
    explain(msg).then(
      (r) => sendResponse(r),
      (e) => sendResponse({ error: String((e && e.message) || e) })
    );
    return true;
  }

  if (msg.type === 'testKey') {
    callModel(msg.settings, analyzeJob(msg.settings, [{ i: 0, text: 'Bonjour, ça va bien aujourd\'hui.' }])).then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: String((e && e.message) || e) })
    );
    return true;
  }

  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return;
  }

  // 啟動中的分頁於圖示上顯示 ON，標示該影片正在處理中
  if (msg.type === 'setBadge') {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId != null) {
      chrome.action.setBadgeText({ tabId, text: msg.on ? 'ON' : '' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#7c5cff' });
    }
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

// 分頁換頁時清除徽章，否則離開 YouTube 後圖示仍會顯示 ON。
// 僅檢查 status，不讀取 url（讀取 url 需要 tabs 權限）；實際重新啟動時由 content script 再度設定。
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
});

// 點選工具列圖示＝在該影片上切換擴充的啟用狀態。
// 不讀取 tab.url（需要額外的 tabs 權限），改為詢問 content script：
// 若其不在影片頁，或尚未載入，則改為開啟設定頁。
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) { chrome.runtime.openOptionsPage(); return; }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    if (!res || !res.ok) chrome.runtime.openOptionsPage();
  } catch (e) {
    chrome.runtime.openOptionsPage();
  }
});
