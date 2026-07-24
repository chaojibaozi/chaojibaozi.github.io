import fs from 'fs';
import path from 'path';

/* ============================================================
 * 分词/分类逻辑批量审计引擎（自包含可复现）
 * 用法: node audit_v2.mjs <slice.json> <out.json> [perIndustry=3000]
 * ============================================================ */

// ---------- 抽取 index.html 中真实 classify 脚本并注入 DOM 桩 ----------
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

// ---------- 分词词典（用于直接测试 segment 死代码） ----------
function buildSegDict() {
  const B = api.BASE; const d = api.state.dict; const s = new Set();
  for (const k of ['brand', 'competitor', 'product', 'geo', 'company', 'phone', 'factory', 'attribute', 'audience']) (B[k] || []).forEach(t => s.add(t));
  for (const k of ['question', 'reputation', 'promo', 'price', 'attribute', 'audience', 'company', 'phone', 'factory']) (d.ext?.[k] || []).forEach(t => s.add(t));
  return s;
}
const SEG_DICT = buildSegDict();

// ---------- 词库（用于合成拟真关键词） ----------
const TRIGGERS = ['论坛', '社区', '平台', '自媒体', '直播', '网店', '资讯', '电商', '网站', 'APP', '软件', '系统', '游戏', '媒体', '社交', '网络', '店铺', '商城', '短视频', '公众号', '社群', '网', '官网', '手机端', 'PC端', '小程序', '门户'];
const MODIFIERS = ['价格', '多少钱', '厂家', '批发', '电话', '哪家好', '品牌', '排行榜', '官网', '加盟', '怎么样', '好不好', '推荐', '十大品牌', '代理', '招商', '多少钱一盒', '效果怎么样', '副作用', '价格表', '哪家靠谱', '哪里有', '怎么选', '报价', '多少钱一台', '好不好用', '多少钱一疗程'];
const GEO = ['北京', '上海', '广州', '深圳', '朝阳', '南开', '河东', '花都', '杭州', '成都', '武汉', '西安', '南京', '重庆', '天津', '苏州', '青岛', '海淀', '浦东', '望京', '鼓楼'];
const BRANDS = ['某某', 'XX', '优选', '惠选', '严选', '康佳', '华美'];
const GEOBAD = ['朝阳产业', '河东狮吼', '南开大学', '花都汽车城', '海淀医院', '浦东开发', '望京soho', '鼓楼大街'];
const ATTRBAD = ['变频空调', '防水涂料', '实木家具', '节能灯', '智能锁', '无痛人流', '微创手术', '无痛胃镜', '防爆电机'];
const SEG_PROBES = ['游戏论坛', '医疗社区', '整形平台', '妇科资讯网', '上海大学城', '中国人民银行', '研究生命奥秘', '结合成分子', '男科医院网'];
const COMPANY_RE = /(有限公司|股份公司|集团|企业集团|公司)$/;
const FACTORY_RE = /(厂家|厂商|工厂|制造厂|生产商)$/;
const GEO_END_RE = /(产业|大学|汽车城|狮吼|开发|医院|公司|大厦|广场|街道|大街)$/;

// ---------- 随机数与行业词根 ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function makeCore(name) {
  let base = name.replace(/^(专科-|在线|淘宝天猫类-|淘宝 天猫类)/, '').replace(/（.*?）/g, '').replace(/\//g, '').replace(/类$/, '');
  const cores = [base];
  for (const s of ['设备', '产品', '服务', '机构', '材料', '用品', '系统', '软件', '平台', '网']) if ((base + s).length >= 3) cores.push(base + s);
  return cores.filter(c => c.length >= 2);
}

const TEMPLATES = [
  r => pick(r.core, r.rng) + pick(TRIGGERS, r.rng),
  r => pick(TRIGGERS, r.rng) + pick(r.core, r.rng),
  r => pick(r.core, r.rng) + pick(MODIFIERS, r.rng),
  r => pick(MODIFIERS, r.rng) + pick(r.core, r.rng),
  r => pick(GEO, r.rng) + pick(r.core, r.rng),
  r => pick(r.core, r.rng) + pick(GEO, r.rng),
  r => pick(BRANDS, r.rng) + pick(r.core, r.rng),
  r => pick(r.core, r.rng) + '公司',
  r => pick(r.core, r.rng) + '厂家',
  r => pick(r.core, r.rng),
  r => pick(TRIGGERS, r.rng) + pick(MODIFIERS, r.rng) + pick(r.core, r.rng),
  r => pick(r.core, r.rng) + pick(TRIGGERS, r.rng) + pick(MODIFIERS, r.rng),
];

function genKeywords(name, n) {
  const rng = mulberry32(hashStr(name));
  const core = makeCore(name);
  const out = new Set();
  let guard = 0;
  while (out.size < n && guard < n * 40) {
    guard++;
    const tpl = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];
    const kw = tpl({ core, rng });
    if (kw && kw.length >= 2) out.add(kw);
  }
  return [...out];
}

// ---------- 错误判定 ----------
function hasTrigger(kw) { for (const t of TRIGGERS) if (kw.includes(t)) return t; return null; }
function hasGeo(kw) { for (const g of GEO) if (kw.includes(g)) return g; return null; }

function detectErrors(kw, pred) {
  const errs = [];
  const trig = hasTrigger(kw);
  if (trig && (pred === 'company' || pred === 'factory' || pred === 'phone') && !COMPANY_RE.test(kw) && !FACTORY_RE.test(kw)) {
    errs.push({ type: 'trigger_as_company', detail: `含「${trig}」却被判为${pred}` });
  }
  if (pred === 'geo') {
    const bad = GEOBAD.includes(kw);
    const g = hasGeo(kw);
    if (bad || (g && GEO_END_RE.test(kw) && kw.length > g.length + 1)) {
      errs.push({ type: 'geo_overmatch', detail: `含地名「${g}」但构成复合词却被判地域词` });
    }
  }
  if (pred === 'attribute' && ATTRBAD.includes(kw)) {
    errs.push({ type: 'attr_over_product', detail: '属性词压过产品词根' });
  }
  if (COMPANY_RE.test(kw) && pred !== 'company') {
    errs.push({ type: 'company_missed', detail: `含法人后缀却未判公司词(→${pred})` });
  }
  if (FACTORY_RE.test(kw) && pred !== 'factory') {
    errs.push({ type: 'factory_missed', detail: `含厂家后缀却未判厂家词(→${pred})` });
  }
  return errs;
}

// ---------- 主流程 ----------
function run() {
  const sliceFile = process.argv[2];
  const outFile = process.argv[3];
  const perIndustry = parseInt(process.argv[4] || '3000', 10);
  const industries = JSON.parse(fs.readFileSync(sliceFile, 'utf-8'));

  const results = [];
  let totKeywords = 0;
  const grand = { trigger_as_company: 0, geo_overmatch: 0, attr_over_product: 0, company_missed: 0, factory_missed: 0 };
  const triggerTally = {};

  for (const name of industries) {
    const kws = genKeywords(name, perIndustry);
    api.state.dataRows = kws.map(k => [k]);
    api.state.keywordCol = 0;
    api.runClassification();
    const rows = api.state.results;
    const rec = { name, total: rows.length, errs: { trigger_as_company: 0, geo_overmatch: 0, attr_over_product: 0, company_missed: 0, factory_missed: 0 }, examples: [], triggerTally: {}, segMiss: 0, segSample: 0, segExamples: [] };
    totKeywords += rows.length;

    rows.forEach(r => {
      const kw = r.kw; const pred = r.cat; const rule = (r.rule || [])[0] || '';
      const errs = detectErrors(kw, pred);
      for (const e of errs) {
        rec.errs[e.type]++; grand[e.type]++;
        if (e.type === 'trigger_as_company') { const t = hasTrigger(kw); rec.triggerTally[t] = (rec.triggerTally[t] || 0) + 1; triggerTally[t] = (triggerTally[t] || 0) + 1; }
        if (rec.examples.length < 30) rec.examples.push({ kw, pred: api.CAT_NAME[pred] || pred, rule, type: e.type, detail: e.detail });
      }
    });

    // 分词直接测试（采样）
    const segKws = kws.slice(0, 300);
    rec.segSample = segKws.length;
    for (const kw of segKws) {
      const toks = api.segment(kw, SEG_DICT);
      const t = hasTrigger(kw);
      if (t && !toks.includes(t)) rec.segMiss++;
      if (rec.segExamples.length < 8) rec.segExamples.push({ kw, seg: toks.join('/') });
    }

    results.push(rec);
  }

  // 固定分词探针（演示 segment 死代码缺陷）
  const segProbes = SEG_PROBES.map(kw => ({ kw, seg: api.segment(kw, SEG_DICT).join('/') }));

  // 全类目固定探针（覆盖所有已知 bug 类，作为可复核证据）
  const PROBE_LIST = [
    ...GEOBAD,
    ...ATTRBAD,
    '妇科论坛', '游戏社区', '整形平台', '医美自媒体', '男科网店', '考研培训网',
    '汽车资讯平台', '装修论坛', '旅游社区', '母婴社群', '法律咨询网', '家政服务平台',
    '某某科技有限公司', '上海某某机械有限公司', '广州某某电子厂家', '深圳某某设备厂商',
  ];
  const probeResults = PROBE_LIST.map(kw => {
    const r = api.classify(kw); const pred = r.cat;
    const errs = detectErrors(kw, pred).map(e => e.type);
    return { kw, pred: api.CAT_NAME[pred] || pred, rule: (r.rule || [])[0] || '', errs };
  });

  const out = { sliceFile, perIndustry, totalKeywords: totKeywords, industryCount: industries.length, grand, triggerTally, segProbes, probeResults, industries: results };
  fs.writeFileSync(outFile, JSON.stringify(out));
  // 控制台摘要
  console.log(`Slice ${path.basename(sliceFile)}: ${industries.length} industries, ${totKeywords} keywords`);
  console.log(`  trigger_as_company=${grand.trigger_as_company} geo_overmatch=${grand.geo_overmatch} attr_over_product=${grand.attr_over_product} company_missed=${grand.company_missed} factory_missed=${grand.factory_missed}`);
  console.log(`  triggerTally=${JSON.stringify(triggerTally)}`);
}

run();
