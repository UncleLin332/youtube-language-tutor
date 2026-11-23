// 背景 service worker：呼叫 LLM（content script 受 CORS 限制，不能直接打）＋ 結果快取
//
// 供應商的請求／解析邏輯在 providers.js，和 test/api-test.html 共用。
import { callModel, analyzeJob, explainJob } from './providers.js';

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

  // 啟動中的分頁在圖示上顯示 ON，才知道這支影片正在被處理
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

// 分頁換頁時把徽章清掉，否則離開 YouTube 之後圖示還會一直顯示 ON。
// 只看 status，不讀 url（讀 url 需要 tabs 權限）；真的重新啟動時 content script 會再設回來。
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
});

// 點工具列圖示＝在這支影片上開關擴充。
// 不讀 tab.url（那需要額外的 tabs 權限），直接問 content script：
// 它不在影片頁、或根本還沒載入，就退回開設定頁。
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) { chrome.runtime.openOptionsPage(); return; }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    if (!res || !res.ok) chrome.runtime.openOptionsPage();
  } catch (e) {
    chrome.runtime.openOptionsPage();
  }
});
