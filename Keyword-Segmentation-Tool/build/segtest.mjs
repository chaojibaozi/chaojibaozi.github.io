import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf-8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let code = blocks.find(b => b.includes('function classify'));
function makeProxy() {
  const t = function () {}; let s;
  const h = { get(o, q) { if (q === 'style' || q === 'dataset') return {}; if (q === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } }; if (q === 'children' || q === 'files' || q === 'length') return 0; if (q === 'value' || q === 'textContent') return ''; if (q === 'checked') return false; if (q === Symbol.toPrimitive) return () => 0; if (q === 'valueOf') return () => 0; if (q === 'toString') return () => ''; return s; }, set() { return true; }, apply() { return s; }, construct() { return s; } };
  s = new Proxy(t, h); return s;
}
const doc = new Proxy({ getElementById: () => makeProxy(), createElement: () => makeProxy(), createDocumentFragment: () => makeProxy(), createTextNode: () => makeProxy(), addEventListener: () => {}, body: makeProxy(), querySelector: () => makeProxy(), querySelectorAll: () => [] }, { get(o, q) { if (q in o) return o[q]; return makeProxy(); } });
code += '\n;return {BASE,state,buildRegexCache,segment,segmentFMM,segmentBMM};';
const api = new Function('document', 'XLSX', 'FileReader', 'window', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', code)(doc, {}, function () {}, makeProxy(), setTimeout, clearTimeout, () => {});
api.buildRegexCache();
const B = api.BASE, D = api.state.dict;
const segDict = new Set();
for (const k of ['brand','competitor','product','geo','company','phone','factory','attribute','audience','question','reputation','promo','price']) (B[k]||[]).forEach(t=>segDict.add(t));
for (const k of ['question','reputation','promo','price','attribute','audience','company','phone','factory']) ((D.ext&&D.ext[k])||[]).forEach(t=>segDict.add(t));
console.log('SEG_DICT size:', segDict.size);
const cases = ['实木家具','智能锁','变频空调','花都汽车城','北京装修公司','跑步鞋','不锈钢水槽','上海某某机械有限公司','游戏社区','妇科论坛'];
for (const c of cases) console.log(c.padEnd(16), '->', api.segment(c, segDict).join('/'));
