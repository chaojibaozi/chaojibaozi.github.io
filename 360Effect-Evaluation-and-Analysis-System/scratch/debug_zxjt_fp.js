/* 调试：中信建投两搜索词文件 日期×计划 指纹差异定位 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const TD = path.join(ROOT, 'testdata');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
function fakeEl() {
  return new Proxy(function(){}, {
    get(t, p) {
      if (p === 'style' || p === 'dataset') return {};
      if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if (p === 'children' || p === 'childNodes') return [];
      if (p === Symbol.toPrimitive) return () => '';
      return typeof p === 'string' && /^(innerHTML|textContent|value|id|className)$/.test(p) ? '' : fakeEl();
    },
    set() { return true; }, apply() { return fakeEl(); }
  });
}
const sandbox = {
  console, document: { getElementById: () => fakeEl(), querySelector: () => fakeEl(), querySelectorAll: () => [], addEventListener(){}, createElement: () => fakeEl(), body: fakeEl(), documentElement: fakeEl() },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  navigator: {}, location: {}, setTimeout, clearTimeout, TextDecoder, alert(){}, confirm: () => false,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(scripts, sandbox); } catch (e) { console.log('[加载告警] ' + e.message); }

function loadFile(rel) {
  const buf = fs.readFileSync(path.join(TD, rel));
  const txt = sandbox.decodeCsv(buf);
  const rows = sandbox.parseCSV(txt).filter(r => r.length > 1);
  const base = rel.split('/').pop();
  const type = sandbox.detectType(rows[0], base);
  return { name: base, type, header: rows[0], rows: sandbox.rowsToObjects(type, rows), rawCount: rows.length - 1 };
}

const f1 = loadFile('中信建投/中信建投01_2026-06-26至2026-07-26_搜索词报告.csv');
const f2 = loadFile('中信建投/中信建投01_2026-06-26至2026-07-26_搜索词报告 (1).csv');
console.log('F1 原始行=' + f1.rawCount + ' 解析行=' + f1.rows.length + ' | F2 原始行=' + f2.rawCount + ' 解析行=' + f2.rows.length);

function fpMap(f) {
  const m = new Map();
  f.rows.forEach(r => {
    const k = (r.date || '') + '|' + (r.plan || '');
    const o = m.get(k) || { cost: 0, clicks: 0, shows: 0 };
    o.cost += r.cost || 0; o.clicks += r.clicks || 0; o.shows += r.shows || 0;
    m.set(k, o);
  });
  return m;
}
const m1 = fpMap(f1), m2 = fpMap(f2);
console.log('F1 单元数=' + m1.size + ' | F2 单元数=' + m2.size);
let same = 0, diffCost = 0, diffOther = 0, onlyF1 = 0, onlyF2 = 0;
const diffs = [];
m1.forEach((o1, k) => {
  const o2 = m2.get(k);
  if (!o2) { onlyF1++; return; }
  const costEq = Math.abs(o1.cost - o2.cost) < 0.005;
  const clkEq = o1.clicks === o2.clicks, shEq = o1.shows === o2.shows;
  if (costEq && clkEq && shEq) same++;
  else {
    if (costEq) diffOther++; else diffCost++;
    if (diffs.length < 6) diffs.push(k + ' | F1(' + o1.cost.toFixed(2) + ',' + o1.clicks + ',' + o1.shows + ') vs F2(' + o2.cost.toFixed(2) + ',' + o2.clicks + ',' + o2.shows + ')');
  }
});
m2.forEach((o, k) => { if (!m1.has(k)) onlyF2++; });
console.log('全同=' + same + ' | cost不同=' + diffCost + ' | cost同但clicks/shows不同=' + diffOther + ' | 仅F1=' + onlyF1 + ' | 仅F2=' + onlyF2);
diffs.forEach(d => console.log('  差异样例: ' + d));

/* 全文件汇总 */
const t1 = f1.rows.reduce((s, r) => ({ c: s.c + r.cost, k: s.k + r.clicks, v: s.v + r.shows }), { c: 0, k: 0, v: 0 });
const t2 = f2.rows.reduce((s, r) => ({ c: s.c + r.cost, k: s.k + r.clicks, v: s.v + r.shows }), { c: 0, k: 0, v: 0 });
console.log('F1 总 cost=' + t1.c.toFixed(2) + ' clicks=' + t1.k + ' shows=' + t1.v);
console.log('F2 总 cost=' + t2.c.toFixed(2) + ' clicks=' + t2.k + ' shows=' + t2.v);
