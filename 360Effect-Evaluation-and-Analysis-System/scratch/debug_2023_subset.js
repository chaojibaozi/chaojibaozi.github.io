/* 验证：2023 移动端搜索词报告是否为全设备报告的行级多重集子集（决定文件级子集去重可行性） */
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
  return { name: base, rows: sandbox.rowsToObjects(type, rows) };
}

const A = loadFile('2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv');   // 全设备
const B = loadFile('2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv'); // 移动端

const sig = r => [r.date, r.plan, r.group, r.kw, r.query, (r.cost||0).toFixed(2), r.clicks||0, r.shows||0].join('|');
const sigNoShows = r => [r.date, r.plan, r.group, r.kw, r.query, (r.cost||0).toFixed(2), r.clicks||0].join('|');

function containment(fA, fB, sigFn, label) {
  const ms = new Map();
  fA.rows.forEach(r => { const s = sigFn(r); ms.set(s, (ms.get(s)||0)+1); });
  let hit = 0, miss = 0;
  fB.rows.forEach(r => {
    const s = sigFn(r);
    const c = ms.get(s)||0;
    if (c > 0) { ms.set(s, c-1); hit++; } else miss++;
  });
  console.log(label + ': B行数=' + fB.rows.length + ' 命中A=' + hit + ' (' + (hit/fB.rows.length*100).toFixed(1) + '%) 未命中=' + miss);
}
console.log('A(全设备) 行数=' + A.rows.length + ' | B(移动端) 行数=' + B.rows.length);
containment(A, B, sig, '含shows签名包含');
containment(A, B, sigNoShows, '不含shows签名包含');

/* 日期×计划 单元格值关系：B单元 ≤ A单元？ */
function cellMap(f){ const m=new Map(); f.rows.forEach(r=>{ const k=(r.date||'')+'|'+(r.plan||''); const o=m.get(k)||{cost:0,clicks:0}; o.cost+=r.cost||0; o.clicks+=r.clicks||0; m.set(k,o); }); return m; }
const mA=cellMap(A), mB=cellMap(B);
let le=0, gt=0, missK=0;
mB.forEach((oB,k)=>{ const oA=mA.get(k); if(!oA){missK++;return;} if(oB.cost<=oA.cost+0.005) le++; else gt++; });
console.log('B单元数=' + mB.size + ' | cost B≤A: ' + le + ' | B>A: ' + gt + ' | A缺失键: ' + missK);
