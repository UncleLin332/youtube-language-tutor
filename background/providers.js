// 供應商邏輯（純函式，不碰 chrome API）
//
// 這個檔案同時被兩個地方用：
//   background/service-worker.js  正式的擴充背景程序
//   test/api-test.html            本機測試台
// 共用同一份程式碼，測試台測到的就是擴充實際會跑的路徑。

// ---------- 共用的輸出結構 ----------
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sentences', 'vocab', 'phrases', 'notes'],
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'translation', 'start_line', 'end_line'],
        properties: {
          text: { type: 'string', description: '修正標點後的原文句子' },
          translation: { type: 'string' },
          start_line: { type: 'integer' },
          end_line: { type: 'integer' }
        }
      }
    },
    vocab: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'lemma', 'pos', 'meaning', 'note'],
        properties: {
          word: { type: 'string', description: '影片中出現的實際型態' },
          lemma: { type: 'string', description: '原形／字典型' },
          pos: { type: 'string', description: '詞性縮寫，例如 n.m. / v. / adj.' },
          meaning: { type: 'string' },
          note: { type: 'string', description: '用法、變化或發音提醒；沒有就空字串' }
        }
      }
    },
    phrases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['phrase', 'meaning', 'note'],
        properties: {
          phrase: { type: 'string' },
          meaning: { type: 'string' },
          note: { type: 'string', description: '字面意思、語氣或使用場合；沒有就空字串' }
        }
      }
    },
    notes: {
      type: 'array',
      description: '這段值得注意的文法或發音重點，0 到 2 則',
      items: { type: 'string' }
    }
  }
};

function instructions(langName, nativeLang) {
  return [
    `你是一位${langName}老師，學生的母語是${nativeLang}。學生正在看一段${langName}影片，你要幫他整理這一小段的學習重點。`,
    '',
    '輸入是帶編號的字幕行。字幕可能來自自動辨識，所以常常沒有標點、偶爾有辨識錯誤。',
    '',
    '規則：',
    '1. sentences：把這段切成自然的句子，依序排列。text 要補上正確標點、修正明顯的辨識錯誤，但不可以自行增加原文沒有的內容。start_line / end_line 填該句涵蓋的字幕行編號（含頭尾）。',
    `2. translation：用${nativeLang}翻譯，要通順、口語，不要逐字硬翻。`,
    '3. vocab：挑 4 到 10 個真正值得學的詞。跳過最基本的功能詞（冠詞、常見代名詞、be/have 類助動詞），除非它在這裡有特殊用法。word 填影片中的實際型態，lemma 填原形。',
    '4. phrases：慣用語、固定搭配、口語縮讀與省略（例如法文的 j\'sais pas、y\'a、t\'es）。沒有就給空陣列。',
    `5. 所有解釋都用${nativeLang}，盡量精簡，一個解釋不超過 25 個字。`,
    '6. notes：這段最值得注意的文法或發音點，最多 2 則；沒有特別的就給空陣列。',
    '7. 只根據提供的字幕內容作答，不要臆測影片其他部分。'
  ].join('\n');
}

function transcriptBlock(lines) {
  return '字幕行：\n' + lines.map((l) => `[${l.i}] ${l.text}`).join('\n');
}

// ---------- Anthropic ----------
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2026-10-21';
const ANTHROPIC_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

async function callAnthropic(settings, job) {
  const system = job.system;
  const schema = job.schema;

  function body(opt) {
    const b = {
      model: settings.model,
      max_tokens: 8000,
      system: opt.structured ? system
        : system + '\n\n只輸出一個 JSON 物件，不要有任何其他文字或程式碼框。結構：\n' + JSON.stringify(schema),
      messages: [{ role: 'user', content: job.user }],
      output_config: { effort: 'low' }
    };
    if (opt.structured) b.output_config.format = { type: 'json_schema', schema };
    if (opt.fallback) b.fallbacks = 'default';
    return b;
  }

  function send(opt) {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // 從瀏覽器擴充直接呼叫 API 需要這個標頭
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    if (opt.fallback) headers['anthropic-beta'] = ANTHROPIC_FALLBACK_BETA;
    return fetchWithTimeout(ANTHROPIC_URL, { method: 'POST', headers, body: JSON.stringify(body(opt)) });
  }

  // 先用最完整的形式；若這個帳號／模型不吃某個參數，逐步退回，不要整個壞掉。
  const opt = { fallback: true, structured: true };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await send(opt);
    if (res.ok) {
      const data = await res.json();
      if (data.stop_reason === 'refusal') throw new Error('模型拒絕回應這段內容，可以跳過這一段再試。');
      const block = (data.content || []).find((b) => b.type === 'text');
      if (!block) throw new Error('API 沒有回傳文字內容');
      return block.text;
    }
    const txt = await res.text();
    if (res.status === 400 && opt.fallback && /fallback|beta/i.test(txt)) { opt.fallback = false; continue; }
    if (res.status === 400 && opt.structured && /output_config|format|schema/i.test(txt)) { opt.structured = false; continue; }
    throw apiError(txt, res.status, 'anthropic');
  }
  throw new Error('連續三次請求都被 API 拒絕，請檢查設定。');
}

// ---------- Gemini ----------
// 2026/05 之後 Gemini 改用 Interactions API，舊的 generateContent 已列為 legacy。
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

async function callGemini(settings, job) {
  const prompt = job.system + '\n\n' + job.user;
  const schema = job.schema;

  function body(opt) {
    const b = {
      model: settings.model,
      input: opt.structured ? prompt
        : prompt + '\n\n只輸出一個 JSON 物件，不要有任何其他文字或程式碼框。結構：\n' + JSON.stringify(schema)
    };
    if (opt.structured) {
      b.response_format = { type: 'text', mime_type: 'application/json', schema };
    }
    return b;
  }

  const opt = { structured: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithTimeout(GEMINI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': settings.apiKey
        // 不送 Api-Revision：2026/05/26 起 steps[] 已是預設格式（舊的 outputs[] 在 6/8 移除），
        // 而且 Google 的 CORS 不放行這個標頭，送了會讓一般網頁完全打不通（擴充的
        // service worker 有 host_permissions 不受影響，但測試台和自架 proxy 都會死在預檢）。
        // readGemini() 兩種格式都認，所以不釘也安全。
      },
      body: JSON.stringify(body(opt))
    });
    if (res.ok) return readGemini(await res.json());
    const txt = await res.text();
    if (res.status === 400 && opt.structured && /response_format|schema|mime/i.test(txt)) { opt.structured = false; continue; }
    throw apiError(txt, res.status, 'gemini');
  }
  throw new Error('Gemini 連續拒絕請求，請檢查設定。');
}

function readGemini(data) {
  const texts = [];
  // 新格式：steps[].content[].text
  for (const step of data.steps || []) {
    if (step.type && step.type !== 'model_output') continue;
    for (const c of step.content || []) if (c && typeof c.text === 'string') texts.push(c.text);
  }
  // 舊格式（2026/06 已移除，保險起見還是認）：outputs[].text
  if (!texts.length) for (const o of data.outputs || []) if (o && typeof o.text === 'string') texts.push(o.text);
  if (!texts.length) throw new Error('Gemini 沒有回傳文字內容');
  return texts.join('');
}

// ---------- 共用 ----------
const PROVIDERS = {
  anthropic: { call: callAnthropic, label: 'Claude' },
  gemini: { call: callGemini, label: 'Gemini' }
};

// 帶狀態碼的錯誤，retryable 的才會自動重試
class ApiError extends Error {
  constructor(message, status, retryable) {
    super(message);
    this.status = status;
    this.retryable = !!retryable;
  }
}

// 這些是「等一下就會好」的暫時性失敗：負載過高、速率限制、後端抽風
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

function apiError(txt, status, provider) {
  let msg = txt;
  try {
    const j = JSON.parse(txt);
    msg = (j.error && j.error.message) || txt;
  } catch (e) { /* 原文就好 */ }
  const retry = RETRYABLE.has(status);
  if (status === 401 || status === 403) return new ApiError('API key 無效或沒有權限，請到擴充設定頁重新填寫。', status, false);
  if (status === 404 && provider === 'gemini') return new ApiError(`找不到模型「${msg}」。到設定頁換一個模型試試。`, status, false);
  if (status === 429) return new ApiError(`超過速率限制。（${String(msg).slice(0, 200)}）`, status, true);
  if (status === 503 || status === 529) {
    // 保留原文：哪一個模型在忙、是不是真的負載問題，都要靠它判斷
    return new ApiError(`這個模型現在負載過高，可以換一個模型或等一下再試。（${String(msg).slice(0, 200)}）`, status, true);
  }
  return new ApiError(`API 錯誤 ${status}：${String(msg).slice(0, 300)}`, status, retry);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 沒有逾時的 fetch 會永遠掛著：面板會卡在「正在整理…」，使用者既看不到錯誤也按不到重試。
const REQUEST_TIMEOUT_MS = 45000;

async function fetchWithTimeout(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new ApiError(`請求超過 ${Math.round(REQUEST_TIMEOUT_MS / 1000)} 秒沒有回應。`, 0, true);
    }
    throw new ApiError('連不上 API：' + String((e && e.message) || e), 0, true);
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('無法解析模型回傳的 JSON');
    return JSON.parse(m[0]);
  }
}

const MAX_ATTEMPTS = 3;

async function callModel(settings, job, onProgress) {
  const p = PROVIDERS[settings.provider] || PROVIDERS.anthropic;
  const notify = typeof onProgress === 'function' ? onProgress : () => {};
  let last = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      notify({ phase: 'request', attempt, max: MAX_ATTEMPTS });
      const parsed = parseJson(await p.call(settings, job));
      return job.normalize ? job.normalize(parsed) : parsed;
    } catch (e) {
      last = e;
      if (!e || !e.retryable || attempt === MAX_ATTEMPTS) break;
      // 指數退避＋一點隨機，避免和其他請求擠在同一刻重試
      const waitMs = Math.round(1200 * Math.pow(2, attempt - 1) + Math.random() * 400);
      notify({ phase: 'retry', attempt, max: MAX_ATTEMPTS, waitMs, reason: e.message });
      await sleep(waitMs);
    }
  }

  if (last && last.retryable) {
    last.message = `${last.message}（已自動重試 ${MAX_ATTEMPTS} 次都失敗）`;
  }
  throw last;
}


// ---------- 任務：整理一個段落 ----------
function analyzeJob(settings, lines) {
  return {
    system: instructions(settings.langName, settings.nativeLang),
    user: transcriptBlock(lines),
    schema: SCHEMA,
    normalize: (p) => {
      p.sentences = p.sentences || [];
      p.vocab = p.vocab || [];
      p.phrases = p.phrases || [];
      p.notes = p.notes || [];
      return p;
    }
  };
}

// ---------- 任務：解說句子裡被框選的一小段 ----------
const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meaning', 'note', 'breakdown'],
  properties: {
    meaning: { type: 'string', description: '這一小段在這個句子裡的中文意思' },
    note: { type: 'string', description: '為什麼這樣說：文法結構、語氣或固定用法；沒有特別的就空字串' },
    breakdown: {
      type: 'array',
      description: '把這一小段拆成幾塊各自解釋，最多 6 塊；只有一兩個字時給空陣列',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['part', 'meaning'],
        properties: {
          part: { type: 'string', description: '原文的一小塊' },
          meaning: { type: 'string', description: '這一塊的中文' }
        }
      }
    }
  }
};

function explainJob(settings, p) {
  const lang = settings.langName || '目標語言';
  const native = settings.nativeLang || '繁體中文';
  return {
    system: [
      `你是一位${lang}老師，學生的母語是${native}。`,
      '學生在一個句子裡框選了一小段，想知道這一段的意思和用法。',
      '',
      '規則：',
      '1. 只解釋被框選的那一段，不要解釋整句。整句只是用來判斷語境。',
      `2. meaning：這一段在這個句子裡的${native}意思，要通順，不要逐字硬翻。`,
      '3. breakdown：把它拆成幾塊各自解釋，讓學生看出結構；只有一兩個字就給空陣列。',
      '4. note：這樣說的原因——文法結構、語氣、固定用法、或容易誤解的地方。沒有就空字串。',
      `5. 全部用${native}解釋，精簡，不要客套話。`
    ].join('\n'),
    user: [
      '整句：' + p.sentence,
      p.sentenceZh ? '整句中文：' + p.sentenceZh : '',
      '',
      '框選的部分：' + p.fragment
    ].filter(Boolean).join('\n'),
    schema: EXPLAIN_SCHEMA,
    normalize: (r) => {
      r.meaning = r.meaning || '';
      r.note = r.note || '';
      r.breakdown = r.breakdown || [];
      return r;
    }
  };
}

export { SCHEMA, EXPLAIN_SCHEMA, callModel, analyzeJob, explainJob, apiError, PROVIDERS };
