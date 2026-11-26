// 一次跑完所有檢查：語法、manifest、三支測試。
// 任何一項失敗就以非 0 結束。
//
//   node test/run.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const problems = [];

function run(label, cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ cwd: ROOT }, opts));
  const okay = r.status === 0;
  if (!okay) problems.push(label);
  return { okay, out: (r.stdout || '') + (r.stderr || '') };
}

// ---- 語法 ----
console.log('【語法檢查】');
const files = [];
for (const dir of ['content', 'options', 'shared', 'test', 'background']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (f.endsWith('.js')) files.push(path.join(dir, f));
  }
}
let syntaxBad = 0;
for (const f of files) {
  const esm = f.startsWith('background');
  const r = esm
    ? spawnSync(process.execPath, ['--input-type=module', '--check'],
        { cwd: ROOT, input: fs.readFileSync(path.join(ROOT, f)) })
    : spawnSync(process.execPath, ['--check', f], { cwd: ROOT });
  if (r.status !== 0) { console.log('  ❌ ' + f); syntaxBad++; }
}
if (syntaxBad) problems.push('語法檢查');
console.log(`  ${syntaxBad ? '❌' : '✅'} ${files.length} 個 JS 檔${syntaxBad ? `，${syntaxBad} 個有問題` : '全部通過'}`);

// ---- manifest ----
console.log('\n【manifest】');
try {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const refs = [];
  for (const cs of m.content_scripts || []) refs.push(...(cs.js || []), ...(cs.css || []));
  refs.push(m.background.service_worker, m.options_ui.page);
  // 圖示也須檢查：manifest 指向不存在的檔案時，Chrome 會讓整個套件載入失敗，而非僅缺少一張圖示。
  refs.push(...Object.values(m.icons || {}), ...Object.values((m.action || {}).default_icon || {}));
  const missing = refs.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  if (missing.length) { problems.push('manifest'); console.log('  ❌ 找不到：' + missing.join(', ')); }
  else console.log(`  ✅ JSON 正確，引用的 ${refs.length} 個檔案都在`);
} catch (e) {
  problems.push('manifest');
  console.log('  ❌ ' + e.message);
}

// ---- 測試 ----
for (const f of ['segment-test.js', 'pause-test.js', 'export-test.js', 'furigana-test.js']) {
  console.log(`\n${'─'.repeat(50)}\n執行 test/${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) problems.push(f);
}

console.log('\n' + '═'.repeat(50));
if (problems.length) {
  console.log('❌ 有問題：' + problems.join('、'));
  process.exit(1);
}
console.log('✅ 全部通過');
