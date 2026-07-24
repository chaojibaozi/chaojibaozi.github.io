import fs from 'fs';
import path from 'path';

/* 抽取 index.html 中真实 classify 脚本并注入 DOM 桩，验证新增信号维度（软件/APP/下载/网站/官网/官方/网址）。 */
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
code += '\n;return {state,runClassification,classify,CATEGORIES,CAT_NAME,segment,detectIndustry,buildRegexCache,BASE};';
const api = new Function('document', 'XLSX', 'FileReader', 'window', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', code)(doc, XLSX, function () {}, makeProxy(), setTimeout, clearTimeout, cb => { if (typeof cb === 'function') cb(); });
api.buildRegexCache?.();

function cl(kw){ return api.classify(kw); }

let pass=0, fail=0;
const NEW_DIMS=['软件','APP','下载','网站','官网','官方','网址'];
function check(name, cond, detail){ if(cond){pass++; /*console.log('  ✅',name);*/} else {fail++; console.log('  ❌',name,'=>',detail);} }

// ---------- 新增维度用例 ----------
const cases = [
  ['微信下载',   {cat:'download', dimsHas:['品牌','下载'], intent:'navigational'}],
  ['抖音APP',    {cat:'app',     dimsHas:['品牌','APP'],  intent:'navigational'}],
  ['百度官网',   {cat:'official_site', dimsHas:['品牌','官网'], intent:'navigational'}],
  ['官方网站',   {cat:'official_site', dimsHas:['官方','官网'], intent:'navigational'}],
  ['官网',       {cat:'official_site', dimsHas:['官网'], intent:'navigational'}],
  ['下载',       {cat:'download', dimsHas:['下载'], intent:'commercial'}],
  ['软件下载',   {cat:'download', dimsHas:['软件','下载']}],
  ['网址',       {cat:'url',     dimsHas:['网址'], intent:'navigational'}],
  ['网站',       {cat:'website', dimsHas:['网站'], intent:'commercial'}],
  ['小米官方旗舰店', {cat:'official', dimsHas:['品牌','官方'], intent:'navigational'}],
  ['财务软件',   {dimsHas:['软件']}],
  ['企业微信APP', {dimsHas:['APP']}],
];
for(const [kw, exp] of cases){
  const r = cl(kw);
  const dims = (r.dimLabel||'').split('+');
  const tag = `[${kw}] cat=${r.cat} dims=(${r.dimLabel}) intent=${r.intent} stage=${r.stage}`;
  if(exp.cat) check(`cat(${kw})=${exp.cat}`, r.cat===exp.cat, tag);
  if(exp.dimsHas) for(const d of exp.dimsHas) check(`dim(${kw})含[${d}]`, dims.includes(d), tag);
  if(exp.intent) check(`intent(${kw})=${exp.intent}`, r.intent===exp.intent, tag);
}

// ---------- 非回归：新增维度不应误触发 ----------
const neg = [
  ['格力电器', '品牌'],
  ['朝阳区', '地域'],
  ['游戏平台', '核心词/通用'],
  ['苹果手机', '核心词'],
  ['妇科论坛', '核心词'],
  ['变频空调', '核心词'],
  ['南开大学', '地域'],
];
for(const [kw] of neg){
  const r = cl(kw);
  const dims = (r.dimLabel||'').split('+');
  const bad = dims.filter(d=>NEW_DIMS.includes(d));
  check(`非回归(${kw})不误触新维度`, bad.length===0, `[${kw}] dims=(${r.dimLabel})`);
}

// ---------- 电话维度确认仍存在（用户点名） ----------
{
  const r = cl('客服电话');
  const dims = (r.dimLabel||'').split('+');
  check('电话维度仍存在', dims.includes('电话'), `[客服电话] dims=(${r.dimLabel})`);
}

console.log(`\n通过 ${pass} / ${pass+fail}，失败 ${fail}`);
process.exit(fail===0?0:1);
