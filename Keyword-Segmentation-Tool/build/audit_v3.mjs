import fs from 'fs';
import path from 'path';

/* ============================================================
 * 分词/分类逻辑批量审计引擎 v3（更细行业 + 多词性 + 50k/行业）
 * 用法: node audit_v3.mjs <slice.json> <out.json> [perIndustry=50000]
 * slice.json: [{finer, top}, ...]
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
api.buildRegexCache?.();

// ---------- 分词词典（直接测试 segment） ----------
function buildSegDict() {
  const B = api.BASE; const d = api.state.dict; const s = new Set();
  for (const k of ['brand', 'competitor', 'product', 'geo', 'company', 'phone', 'factory', 'attribute', 'audience']) (B[k] || []).forEach(t => s.add(t));
  for (const k of ['question', 'reputation', 'promo', 'price', 'attribute', 'audience', 'company', 'phone', 'factory']) (d.ext?.[k] || []).forEach(t => s.add(t));
  return s;
}
const SEG_DICT = api.state._segDict || buildSegDict();

/* ============================================================
 * 多词性词库（不同"词性"槽位，用于压测各类词性输入）
 * ============================================================ */
// 网络/平台/社区类触发词（名词性，历史误判高发）
const TRIGGERS = ['论坛', '社区', '平台', '自媒体', '直播', '网店', '资讯', '电商', '网站', 'APP', '软件', '系统', '游戏', '媒体', '社交', '网络', '店铺', '商城', '短视频', '公众号', '社群', '网', '官网', '手机端', 'PC端', '小程序', '门户', '频道', '中心', '基地'];
// 价格/交易类（名词/量词性）
const PRICE_WORDS = ['价格', '多少钱', '报价', '价格表', '多少钱一台', '多少钱一盒', '多少钱一疗程', '费用', '收费标准', '一套多少钱', '批发价', '出厂价'];
// 疑问类（疑问代词/副词性）
const QUESTION_WORDS = ['怎么样', '好不好', '哪家好', '哪个好', '怎么选', '怎么办', '如何选择', '哪里有', '哪家靠谱', '好用吗', '有用吗', '靠谱吗', '正规吗', '哪家专业'];
// 口碑/评价类
const REPUTATION_WORDS = ['排行榜', '十大品牌', '口碑', '测评', '对比', '推荐', '哪个品牌好', '排名', '评价', '哪家好一点'];
// 促销类
const PROMO_WORDS = ['优惠', '促销', '活动', '优惠券', '打折', '特价', '团购', '秒杀', '双11', '618'];
// 属性/形容词性（修饰词根）
const ATTR_WORDS = ['智能', '变频', '实木', '不锈钢', '防水', '节能', '无痛', '微创', '进口', '高端', '便携', '大功率', '静音', '环保', '全自动', '多功能', '轻奢', '定制', '新款', '折叠', '防爆', '高速', '大容量', '超薄'];
// 动词/服务动作性
const VERB_WORDS = ['安装', '维修', '保养', '清洗', '定制', '设计', '加盟', '批发', '出租', '回收', '培训', '咨询', '代办', '预约', '办理', '治疗', '检测', '租赁'];
// 地域词（含易误短地名 + 成语中缀）
const GEO = ['北京', '上海', '广州', '深圳', '朝阳', '南开', '河东', '花都', '杭州', '成都', '武汉', '西安', '南京', '重庆', '天津', '苏州', '青岛', '海淀', '浦东', '望京', '鼓楼', '福田', '越秀', '徐汇', '宝山', '长安'];
// 品牌占位
const BRANDS = ['某某', 'XX', '优选', '惠选', '严选', '康美', '华美', '恒信', '德邦', '欧派'];
// 人群/场景词
const AUDIENCE = ['儿童', '老人', '女性', '男士', '孕妇', '婴儿', '学生', '家用', '商用', '工业', '医用'];
// 法人/厂家后缀（用于漏判检测）
const COMPANY_SUFFIX = ['有限公司', '股份有限公司', '集团', '公司'];
const FACTORY_SUFFIX = ['厂家', '厂商', '工厂', '制造厂', '生产厂家'];
const PHONE_WORDS = ['电话', '联系方式', '客服电话', '咨询电话', '热线'];

// 固定自然探针（复现已知/历史 bug 类，非合成）
const GEOBAD = ['朝阳产业', '河东狮吼', '南开大学', '花都汽车城', '海淀医院', '浦东开发', '望京soho', '鼓楼大街', '长安汽车', '宝山钢铁'];
const ATTRBAD = ['变频空调', '防水涂料', '实木家具', '节能灯', '智能锁', '无痛人流', '微创手术', '无痛胃镜', '防爆电机', '不锈钢水槽', '跑步鞋', '真皮沙发'];
const SEG_PROBES = ['游戏论坛', '医疗社区', '整形平台', '妇科资讯网', '上海大学城', '中国人民银行', '研究生命奥秘', '结合成分子', '男科医院网', '双眼皮整形', '前列腺疾病', '新能源汽车'];

const COMPANY_RE = /(有限公司|股份公司|股份有限公司|集团|企业集团|公司)$/;
const FACTORY_RE = /(厂家|厂商|工厂|制造厂|生产厂家|生产商)$/;
const GEO_END_RE = /(产业|大学|汽车城|狮吼|开发|医院|公司|大厦|广场|街道|大街|钢铁)$/;

// ---------- 随机数 ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function maybe(rng, p, v) { return rng() < p ? v : ''; }

// 由行业名派生产品词根（core）
function makeCore(name) {
  let base = name.replace(/^(专科-|在线|淘宝天猫类-|淘宝天猫类|淘宝 天猫类)/, '').replace(/（.*?）/g, '').replace(/\//g, '').replace(/类$/, '');
  const cores = new Set([base]);
  // 取尾部 2-4 字作为品类词根候选
  if (base.length >= 4) cores.add(base.slice(-3));
  if (base.length >= 3) cores.add(base.slice(-2));
  for (const s of ['设备', '产品', '服务', '机构', '材料', '用品', '系统', '仪器', '厂']) if ((base + s).length >= 3) cores.add(base + s);
  return [...cores].filter(c => c.length >= 2);
}

/* 多词性模板：每条模板标注其"主词性/结构"，用于按词性归因 */
const TEMPLATES = [
  { pos: '产品名词', f: r => pick(r.core, r.rng) },
  { pos: '属性+产品', f: r => pick(ATTR_WORDS, r.rng) + pick(r.core, r.rng) },
  { pos: '产品+网络触发', f: r => pick(r.core, r.rng) + pick(TRIGGERS, r.rng) },
  { pos: '网络触发+产品', f: r => pick(TRIGGERS, r.rng) + pick(r.core, r.rng) },
  { pos: '产品+价格', f: r => pick(r.core, r.rng) + pick(PRICE_WORDS, r.rng) },
  { pos: '产品+疑问', f: r => pick(r.core, r.rng) + pick(QUESTION_WORDS, r.rng) },
  { pos: '产品+口碑', f: r => pick(r.core, r.rng) + pick(REPUTATION_WORDS, r.rng) },
  { pos: '产品+促销', f: r => pick(r.core, r.rng) + pick(PROMO_WORDS, r.rng) },
  { pos: '动词+产品', f: r => pick(VERB_WORDS, r.rng) + pick(r.core, r.rng) },
  { pos: '产品+动词', f: r => pick(r.core, r.rng) + pick(VERB_WORDS, r.rng) },
  { pos: '地域+产品', f: r => pick(GEO, r.rng) + pick(r.core, r.rng) },
  { pos: '地域+产品+公司', f: r => pick(GEO, r.rng) + pick(BRANDS, r.rng) + pick(r.core, r.rng) + pick(COMPANY_SUFFIX, r.rng) },
  { pos: '地域+产品+厂家', f: r => pick(GEO, r.rng) + pick(r.core, r.rng) + pick(FACTORY_SUFFIX, r.rng) },
  { pos: '品牌+产品', f: r => pick(BRANDS, r.rng) + pick(r.core, r.rng) },
  { pos: '人群+产品', f: r => pick(AUDIENCE, r.rng) + pick(r.core, r.rng) },
  { pos: '产品+公司后缀', f: r => pick(r.core, r.rng) + pick(COMPANY_SUFFIX, r.rng) },
  { pos: '产品+厂家后缀', f: r => pick(r.core, r.rng) + pick(FACTORY_SUFFIX, r.rng) },
  { pos: '产品+电话', f: r => pick(r.core, r.rng) + pick(PHONE_WORDS, r.rng) },
  { pos: '触发+产品+厂家', f: r => pick(TRIGGERS, r.rng) + pick(r.core, r.rng) + pick(FACTORY_SUFFIX, r.rng) },
  { pos: '属性+产品+触发', f: r => pick(ATTR_WORDS, r.rng) + pick(r.core, r.rng) + pick(TRIGGERS, r.rng) },
  { pos: '地域+属性+产品', f: r => pick(GEO, r.rng) + pick(ATTR_WORDS, r.rng) + pick(r.core, r.rng) },
  { pos: '产品+属性+疑问', f: r => pick(r.core, r.rng) + pick(ATTR_WORDS, r.rng) + pick(QUESTION_WORDS, r.rng) },
  { pos: '长尾组合', f: r => pick(GEO, r.rng) + pick(r.core, r.rng) + pick(TRIGGERS, r.rng) + pick(PRICE_WORDS, r.rng) },
  { pos: '人群+产品+价格', f: r => pick(AUDIENCE, r.rng) + pick(r.core, r.rng) + pick(PRICE_WORDS, r.rng) },
];

// 生成 n 条去重关键词，返回 [{kw,pos}]
function genKeywords(name, n) {
  const rng = mulberry32(hashStr(name));
  const core = makeCore(name);
  const out = new Map(); // kw -> pos
  let guard = 0;
  const maxGuard = n * 60;
  while (out.size < n && guard < maxGuard) {
    guard++;
    const tpl = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];
    const kw = tpl.f({ core, rng });
    if (kw && kw.length >= 2 && !out.has(kw)) out.set(kw, tpl.pos);
  }
  return [...out.entries()].map(([kw, pos]) => ({ kw, pos }));
}

// ---------- 错误判定 ----------
function hasTrigger(kw) { for (const t of TRIGGERS) if (kw.includes(t)) return t; return null; }
function hasGeo(kw) { for (const g of GEO) if (kw.includes(g)) return g; return null; }

const PHONE_END_RE = /(电话|热线|联系方式|客服电话|咨询电话)$/;
function detectErrors(kw, pred) {
  const errs = [];
  const trig = hasTrigger(kw);
  // 网络/平台/社区触发词却被判公司/厂家/电话；排除真正以法人/厂家/电话后缀结尾的正确归类
  if (trig && (pred === 'company' || pred === 'factory' || pred === 'phone') &&
      !COMPANY_RE.test(kw) && !FACTORY_RE.test(kw) && !(pred === 'phone' && PHONE_END_RE.test(kw))) {
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

const TYPES = ['trigger_as_company', 'geo_overmatch', 'attr_over_product', 'company_missed', 'factory_missed'];

// ---------- 主流程 ----------
function run() {
  const sliceFile = process.argv[2];
  const outFile = process.argv[3];
  const perIndustry = parseInt(process.argv[4] || '50000', 10);
  const slice = JSON.parse(fs.readFileSync(sliceFile, 'utf-8'));

  const results = [];
  let totKeywords = 0;
  const grand = { trigger_as_company: 0, geo_overmatch: 0, attr_over_product: 0, company_missed: 0, factory_missed: 0 };
  const triggerTally = {};
  const posTally = {};   // 按词性统计总数
  const posErr = {};     // 按词性统计错误数

  for (const item of slice) {
    const name = item.finer || item;
    const top = item.top || name;
    const gen = genKeywords(name, perIndustry);
    const kws = gen.map(g => g.kw);
    const posByKw = new Map(gen.map(g => [g.kw, g.pos]));
    api.state.dataRows = kws.map(k => [k]);
    api.state.keywordCol = 0;
    api.runClassification();
    const rows = api.state.results;
    const rec = { name, top, total: rows.length, errs: { trigger_as_company: 0, geo_overmatch: 0, attr_over_product: 0, company_missed: 0, factory_missed: 0 }, examples: [], triggerTally: {}, segMiss: 0, segSample: 0 };
    totKeywords += rows.length;

    rows.forEach(r => {
      const kw = r.kw; const pred = r.cat; const rule = (r.rule || [])[0] || '';
      const pos = posByKw.get(kw) || '其他';
      posTally[pos] = (posTally[pos] || 0) + 1;
      const errs = detectErrors(kw, pred);
      for (const e of errs) {
        rec.errs[e.type]++; grand[e.type]++;
        posErr[pos] = (posErr[pos] || 0) + 1;
        if (e.type === 'trigger_as_company') { const t = hasTrigger(kw); rec.triggerTally[t] = (rec.triggerTally[t] || 0) + 1; triggerTally[t] = (triggerTally[t] || 0) + 1; }
        if (rec.examples.length < 25) rec.examples.push({ kw, pred: api.CAT_NAME[pred] || pred, rule, type: e.type, pos });
      }
    });

    // 分词器直测（采样 200）
    const segKws = kws.slice(0, 200);
    rec.segSample = segKws.length;
    for (const kw of segKws) {
      const toks = api.segment(kw, SEG_DICT);
      const t = hasTrigger(kw);
      if (t && !toks.includes(t)) rec.segMiss++;
    }
    results.push(rec);
  }

  // 固定探针
  const segProbes = SEG_PROBES.map(kw => ({ kw, seg: api.segment(kw, SEG_DICT).join('/') }));
  const PROBE_LIST = [...GEOBAD, ...ATTRBAD, '妇科论坛', '游戏社区', '整形平台', '医美自媒体', '男科网店', '考研培训网', '汽车资讯平台', '装修论坛', '旅游社区', '母婴社群', '法律咨询网', '家政服务平台', '某某科技有限公司', '上海某某机械有限公司', '广州某某电子厂家', '深圳某某设备厂商', '双眼皮整形', '种植牙价格', '前列腺疾病', '新能源汽车厂家'];
  const probeResults = PROBE_LIST.map(kw => {
    const r = api.classify(kw); const pred = r.cat;
    const errs = detectErrors(kw, pred).map(e => e.type);
    return { kw, pred: api.CAT_NAME[pred] || pred, rule: (r.rule || [])[0] || '', errs };
  });

  const out = { sliceFile, perIndustry, totalKeywords: totKeywords, industryCount: slice.length, grand, triggerTally, posTally, posErr, segProbes, probeResults, industries: results };
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log(`Slice ${path.basename(sliceFile)}: ${slice.length} industries, ${totKeywords} keywords`);
  console.log(`  trigger_as_company=${grand.trigger_as_company} geo=${grand.geo_overmatch} attr=${grand.attr_over_product} company_missed=${grand.company_missed} factory_missed=${grand.factory_missed}`);
}

run();
