import fs from 'fs';
import path from 'path';

const XLSX = { read() {}, utils: { sheet_to_json() {}, aoa_to_sheet() {}, book_new() {}, book_append_sheet() {} }, writeFile() {} };
const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.html'), 'utf-8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let code = blocks.find(b => b.includes('function classify'));
if (!code) { console.error('未找到 classify 脚本块'); process.exit(1); }

function makeProxy() {
  const target = function () {};
  let self;
  const handler = {
    get(o, p) {
      if (p === 'style' || p === 'dataset') return {};
      if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (p === 'children' || p === 'files' || p === 'length') return 0;
      if (p === 'value' || p === 'textContent') return '';
      if (p === 'checked') return false;
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'valueOf') return () => 0;
      if (p === 'toString') return () => '';
      return self;
    },
    set(o, p, v) { o[p] = v; return true; },
    apply() { return self; },
    construct() { return self; },
  };
  self = new Proxy(target, handler);
  return self;
}
const docBase = {
  getElementById: () => makeProxy(), createElement: () => makeProxy(),
  createDocumentFragment: () => makeProxy(), createTextNode: () => makeProxy(),
  addEventListener: () => {}, body: makeProxy(),
  querySelector: () => makeProxy(), querySelectorAll: () => [],
};
const doc = new Proxy(docBase, { get(o, p) { if (p in o) return o[p]; return makeProxy(); } });
code += '\n;return {state,runClassification,classify,CATEGORIES,CAT_NAME,segment,segmentFMM,segmentBMM,detectIndustry,buildRegexCache,BASE};';
const api = new Function('document', 'XLSX', 'FileReader', 'window', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', code)(doc, XLSX, function () {}, makeProxy(), setTimeout, clearTimeout, cb => { if (typeof cb === 'function') cb(); });
api.buildRegexCache();

const kws = ['实木家具','智能锁','变频空调','防水涂料','游戏社区','妇科论坛','医美自媒体','汽车资讯平台','花都汽车城','南开大学','朝阳产业','河东狮吼','上海某某机械有限公司','广州某某电子厂家','深圳某某设备厂商','北京装修公司','海淀医院','某某科技有限公司','木门','真皮沙发','不锈钢水槽','儿童玩具','跑步鞋','南京医疗器械有限公司'];
for (const kw of kws) {
  const r = api.classify(kw);
  console.log(kw.padEnd(16), '=>', r.cat, '|', (r.rule||[]).join(' ; '));
}
