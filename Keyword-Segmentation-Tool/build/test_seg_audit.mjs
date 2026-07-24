import fs from 'fs';
import path from 'path';
// XLSX 仅在 import/export 函数内部使用，分类流程不会触发；用最小 stub 占位即可。
const XLSX = {
  read() {}, utils: { sheet_to_json() {}, aoa_to_sheet() {}, book_new() {}, book_append_sheet() {} }, writeFile() {}
};

// ---- 从 index.html 提取“应用逻辑”脚本块（含 function classify 的那个）----
const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.html'), 'utf-8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let code = blocks.find(b => b.includes('function classify'));
if (!code) { console.error('未找到 classify 脚本块'); process.exit(1); }

function makeProxy() {
  // 自引用 Proxy：任意属性访问/函数调用/构造都返回自身，
  // 既不崩溃，也不影响纯分类逻辑（渲染结果我们不在乎）。
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
  getElementById: () => makeProxy(),
  createElement: () => makeProxy(),
  createDocumentFragment: () => makeProxy(),
  createTextNode: () => makeProxy(),
  addEventListener: () => {},
  body: makeProxy(),
  querySelector: () => makeProxy(),
  querySelectorAll: () => [],
};
const doc = new Proxy(docBase, { get(o, p) { if (p in o) return o[p]; return makeProxy(); } });
code += '\n;return {state,runClassification,classify,CATEGORIES,CAT_NAME,segment,segmentFMM,segmentBMM,detectIndustry,buildRegexCache};';
const api = new Function('document', 'XLSX', 'FileReader', 'window', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', code)(doc, XLSX, function () {}, makeProxy(), setTimeout, clearTimeout, cb => { if (typeof cb === 'function') cb(); });

// ---- 分类：把整批词一起跑（触发 domain 自学习，贴近真实使用）----
function classifyBatch(keywords) {
  api.state.dataRows = keywords.map(k => [k]);
  api.state.keywordCol = 0;
  api.runClassification();
  return api.state.results.map(r => ({ kw: r.kw, cat: r.cat, catName: api.CAT_NAME[r.cat], rule: (r.rule||[])[0]||'', conf: r.conf, dim: r.dimLabel, industry: r.industry }));
}

export { api, classifyBatch };

// 当直接运行时，导出全局供其它脚本引用
if (import.meta.url === `file://${process.argv[1].replace(/\\/g,'/')}` || process.argv[1].endsWith('test_seg_audit.mjs')) {
  globalThis.__seg = { api, classifyBatch };
}
