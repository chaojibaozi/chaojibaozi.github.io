import fs from 'fs';
import path from 'path';

// —— 复用 audit_v3 的抽取+DOM 桩逻辑，运行修复后的 classify ——
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
api.buildRegexCache?.();

const cases = [
  // —— 原 company_missed 样例（应判 company）——
  ['妇科炎症设备集团','company'], ['武汉XX乳腺科机构集团','company'], ['越秀华美炎症集团','company'],
  ['妇科炎症厂集团','company'], ['妇科炎症材料集团','company'], ['乳腺科集团','company'],
  ['炎症集团','company'], ['天津严选妇科炎症集团','company'], ['海淀华美妇科炎症材料集团','company'],
  ['北京华美炎症公司','company'], ['上海德邦妇科炎症机构集团','company'],
  // —— 原 factory_missed 样例（应判 factory）——
  ['长安乳腺科材料厂商','factory'], ['长安乳腺科服务厂商','factory'], ['长安内分泌科服务工厂','factory'],
  ['长安中成药服务厂商','factory'], ['长安口腔科厂商','factory'], ['长安肾内科机构厂家','factory'],
  ['长安网页策略厂制造厂','factory'], ['长安初中辅导材料厂商','factory'],
  // —— 原 geo 过匹配残留（应判 generic，而非 geo）——
  ['朝阳产业','generic'], ['河东狮吼','generic'], ['浦东开发','generic'], ['鼓楼大街','generic'],
  // —— 原固定探针应通过者（保持）——
  ['南开大学','generic'], ['海淀医院','company'], ['长安汽车','core'], ['变频空调','core'],
  ['实木家具','core'], ['妇科论坛','core'], ['游戏社区','core'], ['某某科技有限公司','company'],
  ['上海某某机械有限公司','company'], ['广州某某电子厂家','factory'], ['深圳某某设备厂商','factory'],
  ['新能源汽车厂家','factory'], ['双眼皮整形','core'], ['种植牙价格','price'], ['前列腺疾病','generic'],
  // —— 非回归 sanity（不应误判为公司/厂家）——
  ['苹果公司','company'], ['华为技术有限公司','company'], ['小米厂家','factory'],
  ['格力电器','brand'], ['变频空调','core'], ['游戏平台','core'], ['妇科论坛','core'],
  ['朝阳区','geo'], ['北京','geo'], ['上海外滩','geo'],
];

let pass = 0, fail = 0;
console.log('关键词'.padEnd(22), '期望'.padEnd(10), '实际'.padEnd(10), '规则');
for (const [kw, exp] of cases) {
  const r = api.classify(kw);
  const got = r.cat;
  const ok = got === exp;
  ok ? pass++ : fail++;
  console.log(kw.padEnd(20), exp.padEnd(10), got.padEnd(10), (ok ? '✅' : '❌') + '  ' + (r.rule || []).join(';'));
}
console.log(`\n通过 ${pass} / ${cases.length}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
