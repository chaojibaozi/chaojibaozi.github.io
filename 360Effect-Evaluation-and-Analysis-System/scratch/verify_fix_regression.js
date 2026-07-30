/* v15 修复回归验证（只读，不改源码）
   1. Bug P：mergeFiles 文件级指纹去重 —— 三批次搜索词消费须对齐计划报告黄金基准（不双计、不漏计）
   2. Bug O：geo 市级列名兼容 —— xc 地域报告 city 字段须非空
   直接从 index.html 提取核心函数在 Node 沙箱执行，验证的是"构建产物"而非源码草稿。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const TD = path.join(ROOT, 'testdata');

/* ---- 从构建产物 index.html 抽取 <script> 部分 ---- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

/* ---- 最小浏览器桩 ---- */
function fakeEl() {
  return new Proxy(function(){}, {
    get(t, p) {
      if (p === 'style' || p === 'dataset') return {};
      if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if (p === 'children' || p === 'childNodes') return [];
      if (p === Symbol.toPrimitive) return () => '';
      return typeof p === 'string' && /^(innerHTML|textContent|value|id|className)$/.test(p) ? '' : fakeEl();
    },
    set() { return true; },
    apply() { return fakeEl(); }
  });
}
const sandbox = {
  console, window: {}, document: {
    getElementById: () => fakeEl(), querySelector: () => fakeEl(), querySelectorAll: () => [],
    addEventListener: () => {}, createElement: () => fakeEl(),
    body: fakeEl(), documentElement: fakeEl()
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { userAgent: 'node' }, location: { href: '' },
  setTimeout, clearTimeout, setInterval, clearInterval,
  TextDecoder, FileReader: function(){}, fetch: () => Promise.reject(new Error('no net')),
  alert: () => {}, confirm: () => false, requestAnimationFrame: (f) => f(),
};
sandbox.window = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(scripts, sandbox, { timeout: 30000 }); }
catch (e) { console.log('[加载告警] ' + e.message); }

const need = ['decodeCsv', 'parseCSV', 'rowsToObjects', 'detectType', 'mergeFiles'];
for (const n of need) {
  if (typeof sandbox[n] !== 'function') { console.log('FAIL: 核心函数缺失 ' + n); process.exit(1); }
}

function loadFile(name) {
  const buf = fs.readFileSync(path.join(TD, name));
  const txt = sandbox.decodeCsv(buf);
  const rows = sandbox.parseCSV(txt).filter(r => r.length > 1);
  const base = name.split('/').pop();
  const type = sandbox.detectType(rows[0], base);   // detectType(header, filename)
  const objs = sandbox.rowsToObjects(type, rows);
  return { name: base, type, header: rows[0], rows: objs };
}

function sum(rows, f) { return rows.reduce((s, r) => s + (r[f] || 0), 0); }

let pass = 0, fail = 0;
function check(label, actual, expected, tol) {
  tol = tol || 0.5;
  const ok = Math.abs(actual - expected) <= tol;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + ' | 实际=' + actual.toFixed(2) + ' 期望=' + expected.toFixed(2));
  ok ? pass++ : fail++;
}

function runBatch(label, searchFiles, planFile) {
  const pf = loadFile(planFile);
  const golden = sum(pf.rows, 'cost');
  sandbox.__input = searchFiles.map(loadFile);
  vm.runInContext('FILES = __input; mergeFiles(); __result = RAW.search;', sandbox);
  const merged = sandbox.__result;
  console.log('\n== ' + label + ' == 计划黄金基准 ¥' + golden.toFixed(2) + ' | 搜索文件数 ' + searchFiles.length + ' | 合并后行数 ' + merged.length);
  check(label + ' 合并后搜索消费对齐黄金基准', sum(merged, 'cost'), golden, golden * 0.005 + 1);
}

/* ---- 批次1：xc（单搜索词文件，同语义键多行，修复前漏计~18%） ---- */
runBatch('xc捷配',
  ['xc捷配信息_2026-04-28至2026-07-27_搜索词报告.csv'],
  'xc捷配信息_2026-04-28至2026-07-27_计划报告.csv');

/* ---- 批次2：2023盈拓（分创意类型多行，修复前漏计~20%） ---- */
runBatch('2023盈拓',
  ['2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv'],
  '2023-08-01至2024-01-31搜索计划数据报告43262567.csv');

/* ---- 批次2b：2023盈拓 全设备+移动端子集 双文件（移动端为全设备子集，考察是否双计） ---- */
runBatch('2023盈拓(全设备+移动端子集)',
  ['2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv', '2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv'],
  '2023-08-01至2024-01-31搜索计划数据报告43262567.csv');

/* ---- 批次3：中信建投（双文件同数据不同列集，直接并集双计+100%、旧语义键去重漏计~8%） ---- */
runBatch('中信建投',
  ['中信建投/中信建投01_2026-06-26至2026-07-26_搜索词报告.csv', '中信建投/中信建投01_2026-06-26至2026-07-26_搜索词报告 (1).csv'],
  '中信建投/中信建投01_2026-06-26至2026-07-26_计划报告.csv');

/* 中信建投附加：确认保留的是含触发模式的文件 */
const modeRows = sandbox.__result.filter(r => r.mode).length;
console.log((modeRows > 0 ? 'PASS' : 'FAIL') + ' | 中信建投保留含触发模式文件 | mode行数=' + modeRows);
modeRows > 0 ? pass++ : fail++;

/* ---- Bug O：xc 地域「市级地区」列解析 ---- */
const geo = loadFile('xc捷配信息_2026-04-28至2026-07-27_地域分析报告 (1).csv');
const cityFilled = geo.rows.filter(r => r.city).length;
console.log('\n== xc地域市级列 == 总行 ' + geo.rows.length + ' | city非空 ' + cityFilled + ' | 样例 ' + JSON.stringify(geo.rows.slice(0, 2).map(r => r.region + '/' + r.city)));
const okCity = geo.rows.length > 0 && cityFilled / geo.rows.length > 0.9;
console.log((okCity ? 'PASS' : 'FAIL') + ' | xc市级地区列解析');
okCity ? pass++ : fail++;

/* 2023 批次「城市」列不回归 */
const geo2 = loadFile('2023-08-01至2024-01-31搜索组pc端搜索类市级地域报告43262585.csv');
const cityFilled2 = geo2.rows.filter(r => r.city).length;
const okCity2 = geo2.rows.length > 0 && cityFilled2 / geo2.rows.length > 0.9;
console.log((okCity2 ? 'PASS' : 'FAIL') + ' | 2023城市列不回归 | ' + cityFilled2 + '/' + geo2.rows.length);
okCity2 ? pass++ : fail++;

console.log('\n===== 结果: ' + pass + ' PASS / ' + fail + ' FAIL ' + (fail === 0 ? '✅ REGRESSION_PASS' : '❌ REGRESSION_FAIL'));
process.exit(fail === 0 ? 0 : 1);
