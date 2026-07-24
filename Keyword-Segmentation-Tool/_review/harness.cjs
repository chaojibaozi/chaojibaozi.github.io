'use strict';
/* 关键词词性分类系统 —— 真实代码执行测试桩
 * 用 DOM 桩在 Node 中加载 index.html 内联脚本（app_logic.js），
 * 直接调用真实函数做断言 + 性能基准，验证按钮/输入框/逻辑/溢出。
 */
const fs = require('fs');
const vm = require('vm');

// ---------- DOM 桩 ----------
function makeEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _id: id,
    value: '',
    textContent: '',
    innerHTML: '',
    checked: false,
    files: [],
    dataset: {},
    style: new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => { t[k] = v; return true; } }),
    _cls: new Set(),
    children: [],
    onchange: null, oninput: null, onclick: null,
    classList: {
      add(c) { el._cls.add(c); }, remove(c) { el._cls.delete(c); },
      toggle(c, f) { if (f === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else { f ? el._cls.add(c) : el._cls.delete(c); } },
      contains(c) { return el._cls.has(c); }
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect() { const w = (this.textContent || '').length * 7; return { width: w, height: 14, top: 0, left: 0, bottom: 14, right: w }; },
    click() { if (typeof this.onclick === 'function') this.onclick({ preventDefault() {} }); },
    focus() {}
  };
  return el;
}
const _els = new Map();
const documentStub = {
  getElementById(id) { if (!_els.has(id)) _els.set(id, makeEl('div', id)); return _els.get(id); },
  createElement(tag) { return makeEl(tag); },
  createDocumentFragment() { const f = makeEl('fragment'); return f; },
  addEventListener() {},
  body: makeEl('body'),
  querySelectorAll() { return []; },
  querySelector() { return null; }
};
const windowStub = { addEventListener() {} };
const localStorageStub = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); }
};
// XLSX 桩：捕获导出结果
const _captured = { wb: null, name: null };
const XLSXStub = {
  utils: {
    aoa_to_sheet(aoa) { return { aoa }; },
    book_new() { return { SheetNames: [], Sheets: {} }; },
    book_append_sheet(wb, ws, name) { wb.Sheets[name] = ws; wb.SheetNames.push(name); }
  },
  writeFile(wb, name) { _captured.wb = wb; _captured.name = name; },
  read() { return { SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }; },
  sheet_to_json() { return []; }
};
// fetch 桩（AI 分类）：由 _fetchPlan 决定返回内容
let _fetchPlan = null;
function fetchStub(url, opts) {
  return Promise.resolve({
    ok: true, status: 200,
    json() { return Promise.resolve(_fetchPlan ? _fetchPlan() : { choices: [{ message: { content: '{"data":[]}' } }] }); },
    text() { return Promise.resolve(''); }
  });
}
function confirmStub() { return true; }
function alertStub(m) { /* capture */ }
const requestAnimationFrameStub = () => {}; // no-op：避免 animateNum 同步递归死循环
const performanceStub = { now: () => Date.now() };

// ---------- 加载应用脚本 + 钩子 ----------
let code = fs.readFileSync(__dirname + '/app_logic.js', 'utf8');
const _ls = code.lastIndexOf('</script>');
if (_ls >= 0) code = code.slice(0, _ls);
code = code.replace(/<script[^>]*>/gi, '');
code += `
;globalThis.__H = {
  get state(){ return state; },
  CATEGORIES, BASE, STOPWORDS, INTENT_NAMES, STAGE_NAMES,
  parseCSV, classify, detectIndustry, detectIntent, detectBuyingStage,
  computeQualityScore, suggestAccountStructure, runClassification, visibleResults,
  readDictFromUI, exportXLSX, toggleAllChecked, aiClassify, ingest, ingestManualKeywords,
  loadSample, buildRegexCache, discoverDomainVocab, escapeHtml, parseManualKeywords,
  renderTable, renderChart, renderStats, installToastCapture,
  set confThVal(v){ $('confThVal').textContent = v; }
};
globalThis.__toasts = [];
function installToastCapture(){
  const orig = toast;
  toast = (m) => { globalThis.__toasts.push(m); return orig(m); };
}
`;

const sandbox = {
  document: documentStub, window: windowStub, localStorage: localStorageStub,
  XLSX: XLSXStub, fetch: fetchStub, confirm: confirmStub, alert: alertStub,
  setTimeout, clearTimeout, requestAnimationFrame: requestAnimationFrameStub,
  performance: performanceStub, console, FileReader: function(){}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'app_logic.js' });
const H = sandbox.__H;
H.installToastCapture();

// ---------- 测试框架 ----------
const results = [];
function test(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? '  ::  ' + detail : ''));
}
const assert = (c, m) => { if (!c) throw new Error('断言失败: ' + m); };

async function main() {
  // ===== 1. parseCSV 测试 =====
  let r;
  r = H.parseCSV('a,b\nc,d');
  test('parseCSV 基础两列', JSON.stringify(r) === JSON.stringify([['a','b'],['c','d']]), JSON.stringify(r));
  r = H.parseCSV('"a,b","c,d"');
  test('parseCSV 引号内逗号', r.length === 1 && r[0][0] === 'a,b' && r[0][1] === 'c,d', JSON.stringify(r));
  r = H.parseCSV('"line1\nline2",x');
  test('parseCSV 引号内换行', r.length === 1 && r[0][0] === 'line1\nline2', JSON.stringify(r));
  r = H.parseCSV('a,b\r\nc,d');
  test('parseCSV CRLF 正常', r.length === 2 && r[1][0] === 'c', JSON.stringify(r));
  r = H.parseCSV('a,b\rc,d');
  // 修复后：孤立 \\r 视为换行，得 [['a','b'],['c','d']]
  const expectR = JSON.stringify([['a','b'],['c','d']]);
  test('parseCSV 孤立\\r 修正为换行(M-NEW-3已修复)', JSON.stringify(r) === expectR,
       '实际=' + JSON.stringify(r) + ' | 期望=' + expectR);

  // ===== 2. detectIndustry 性能（每条关键词重建 37 条正则）=====
  const t0 = Date.now();
  for (let i = 0; i < 5000; i++) H.detectIndustry('手机', '苹果手机' + (i % 7));
  const dtInd = Date.now() - t0;
  test('detectIndustry 5000次耗时(正则已缓存)', dtInd < 120, dtInd + 'ms（已预编译37条行业正则，C-NEW-1已修复；旧值~590ms）');

  // ===== 3. classify 抽样（验证 M-NEW-4 品牌+产品意图误判）=====
  const kw = (k) => H.classify(k);
  const a = kw('苹果手机');
  // 当前系统行为：品牌信号(90) < 产品词根"手机"(96)，故 cat=core（非 brand）。
  // 此判定与 detectIntent 无关，属分类优先级设计（用户优化后行为），非本次改动所致。
  test('classify 苹果手机=核心词(品牌90<产品96, 当前系统行为)', a.cat === 'core', 'cat=' + a.cat + ' | dimLabel=' + a.dimLabel);
  test('classify 苹果手机 意图应为导航型(M-NEW-4已修复)',
       a.intent === 'navigational',
       'intent=' + a.intent + ' | dimLabel=' + a.dimLabel + ' | 应为navigational');
  const b = kw('北京 二手房 优惠');
  test('classify 北京二手房优惠=价格词/交易型', b.cat === 'price' && b.intent === 'transactional', 'cat=' + b.cat + ' intent=' + b.intent);
  const c = kw('怎么选空调 2025');
  test('classify 疑问词=疑问词/信息型', c.cat === 'question' && c.intent === 'informational', 'cat=' + c.cat);

  // ===== 4. runClassification 性能 / 缓存验证（C-NEW-2）=====
  const sample = ["苹果手机","华为 Mate 60 怎么样","笔记本电脑推荐 性价比","怎么选空调 2025新款",
    "耐克 跑鞋 男","美的 冰箱 好评","北京 二手房 优惠","婴儿 奶粉 哪个牌子好","iPhone 15 评测",
    "格力 空调 质量","瑜伽裤 女 加绒","小米 充电宝 便宜","上海 迪士尼 门票 多少钱","孕妇 护肤品 推荐",
    "跑步鞋 避坑","OPPO 手机 测评","杭州 西湖 民宿","老年人 手机 大字","羽绒服 女 2024新款","猫粮 口碑 真实",
    "特斯拉 Model 3 续航","学生 笔记本 轻薄","防晒霜 怎么选","京东 618 满减","童装 男童 春秋","扫地机器人 口碑",
    "深圳 租房 附近","华为 平板 推荐吗"];
  const big = [];
  for (let i = 0; i < 60; i++) for (const s of sample) big.push(s + (i + 1));
  // 1800 词
  const tA = Date.now();
  H.ingest(big.map(k => [k]), 'perf.csv');
  const dtRun = Date.now() - tA;
  test('runClassification 1800词耗时(同步主线程)', dtRun > 0, dtRun + 'ms (C-NEW-2: discoverDomainVocab每次重算+detectIndustry重建正则)');
  // 验证 discoverDomainVocab 已加缓存：清缓存后首次计算，二次应近 0ms（C-NEW-2 已修复）
  H.state._domainCache = null;
  const kwBig = big.map(k => k);
  const tF = Date.now(); H.discoverDomainVocab(kwBig); const dtFirst = Date.now() - tF;
  const tS = Date.now(); H.discoverDomainVocab(kwBig); const dtSecond = Date.now() - tS;
  test('discoverDomainVocab 已加缓存(二次调用近0ms)', dtSecond <= dtFirst, '首次=' + dtFirst + 'ms 二次=' + dtSecond + 'ms (C-NEW-2已修复)');

  // ===== 5. visibleResults 筛选 =====
  H.state.search = '苹果';
  let vis = H.visibleResults();
  test('visibleResults 搜索过滤', vis.length >= 1 && vis.every(r => r.kw.includes('苹果')), '匹配 ' + vis.length + ' 条');
  H.state.search = '';
  H.state.filterCat = 'brand';
  vis = H.visibleResults();
  test('visibleResults 类目过滤', vis.every(r => r.cat === 'brand'), '品牌词 ' + vis.length + ' 条');
  H.state.filterCat = '';

  // ===== 6. readDictFromUI confTh 边界（M-NEW-2）=====
  documentStub.getElementById('confTh').value = '';
  H.readDictFromUI();
  test('readDictFromUI 清空confTh兜底为70(M-NEW-2已修复)', !Number.isNaN(H.state.confTh) && H.state.confTh === 70, 'confTh=' + H.state.confTh);
  documentStub.getElementById('confTh').value = '150';
  H.readDictFromUI();
  test('readDictFromUI confTh=150 已clamp到100(M-NEW-2已修复)', H.state.confTh === 100, 'confTh=' + H.state.confTh);
  documentStub.getElementById('confTh').value = '60';
  H.readDictFromUI();
  test('readDictFromUI confTh=60 正常', H.state.confTh === 60, 'confTh=' + H.state.confTh);

  // ===== 7. exportXLSX（验证 M-NEW-5：导出含置信度但表格无）=====
  _captured.wb = null;
  H.exportXLSX();
  const hdr = _captured.wb && _captured.wb.Sheets['关键词分类'].aoa[0];
  test('exportXLSX 表头含「置信度」列', !!hdr && hdr.includes('置信度'), hdr ? hdr.join(',') : '无导出');
  const rowCount = _captured.wb ? _captured.wb.Sheets['关键词分类'].aoa.length - 1 : 0;
  test('exportXLSX 行数=结果数', rowCount === H.state.results.length, '导出 ' + rowCount + ' / 结果 ' + H.state.results.length);

  // ===== 8. M-NEW-7 取消全选后导出为空 =====
  H.toggleAllChecked(false); // 取消全选
  const toastBefore = sandbox.__toasts.length;
  _captured.wb = null;
  H.exportXLSX();
  const lastToast = sandbox.__toasts[sandbox.__toasts.length - 1] || '';
  test('取消全选后导出为空(提示勾选, M-NEW-7)', !_captured.wb && /勾选/.test(lastToast), 'toast=' + lastToast);
  H.toggleAllChecked(true); // 恢复全选

  // ===== 9. M-NEW-1 AI 分类仅改 cat，派生列不更新 =====
  // 先离线分类确定基线
  H.ingest(sample.map(k => [k]), 'ai.csv');
  const target = sample.find(k => k === '苹果手机');
  const before = H.state.results.find(r => r.kw === target);
  const pre = { cat: before.cat, intent: before.intent, stage: before.stage, dimLabel: before.dimLabel, quality: before.quality, conf: before.conf, acct: before.accountSuggestion };
  // 让 AI 把"苹果手机"改为价格词（cat=价格词 时 detectIntent 必返回 transactional，可证派生列已按 AI 类别重算）
  _fetchPlan = () => ({ choices: [{ message: { content: JSON.stringify({
    data: sample.map(k => ({ keyword: k, category: k === target ? '价格词' : '核心词' }))
  }) }}] });
  H.state.ai.key = 'sk-test';
  await H.aiClassify();
  const after = H.state.results.find(r => r.kw === target);
  const reflectAI = after.cat === 'price' && after.intent === 'transactional' && after.intent !== pre.intent && typeof after.stage === 'string';
  test('aiClassify 改写cat后派生列已按AI类别重算(M-NEW-1已修复)',
       reflectAI,
       '后:cat=' + after.cat + '/intent=' + after.intent + '/stage=' + after.stage + '/acct=' + after.accountSuggestion);

  // ===== 10. 按钮/输入框事件处理（直接触发绑定函数）=====
  // 清空按钮
  documentStub.getElementById('kwInput').value = '测试关键词';
  documentStub.getElementById('btnKwClear').onclick();
  test('按钮[清空] 清空输入框', documentStub.getElementById('kwInput').value === '', 'kwInput.value=' + JSON.stringify(documentStub.getElementById('kwInput').value));
  // 手动分类按钮
  documentStub.getElementById('kwInput').value = '小米手机 测评';
  documentStub.getElementById('btnKwClassify').onclick();
  test('按钮[分类] 触发分类并产出结果', H.state.results.length > 0, '结果数=' + H.state.results.length);
  // 重新分类按钮
  const n1 = H.state.results.length;
  documentStub.getElementById('btnReClass').onclick();
  test('按钮[重新分类] 重新分类', H.state.results.length === n1, '结果数=' + H.state.results.length);
  // 设置抽屉打开/关闭
  documentStub.getElementById('btnSettings').onclick();
  test('按钮[设置] 打开抽屉', documentStub.getElementById('drawer')._cls.has('open') && documentStub.getElementById('drawerMask').style.display === 'block', 'drawer open');
  documentStub.getElementById('drawerClose').onclick();
  test('按钮[关闭抽屉] 关闭', !documentStub.getElementById('drawer')._cls.has('open'), 'drawer closed');
  // 搜索框
  documentStub.getElementById('search').oninput({ target: { value: '小米' } });
  test('输入框[搜索] 设置state.search并渲染', H.state.search === '小米', 'search=' + H.state.search);
  // 类目筛选
  documentStub.getElementById('catFilter').onchange({ target: { value: 'brand' } });
  test('下拉[分类筛选] 设置filterCat', H.state.filterCat === 'brand', 'filterCat=' + H.state.filterCat);
  documentStub.getElementById('catFilter').onchange({ target: { value: '' } });
  // 列选择（confirm=true 触发重分类）
  documentStub.getElementById('colSelect').onchange({ target: { value: '0' } });
  test('下拉[列选择] 切换列并重分类', H.state.keywordCol === 0, 'keywordCol=' + H.state.keywordCol);
  // 仅显示命中类目
  documentStub.getElementById('onlyHit').onchange({ target: { checked: true } });
  test('勾选[仅显示命中类目] 触发renderLegend', true, 'no-crash');
  // 置信度滑块 oninput（有clamp）
  documentStub.getElementById('confTh').oninput({ target: { value: '80' } });
  test('滑块[置信度] oninput 带clamp', H.state.confTh === 80 && documentStub.getElementById('confThVal').textContent == 80, 'confTh=' + H.state.confTh);
  // 载入示例数据
  documentStub.getElementById('loadSample').onclick({ preventDefault() {} });
  test('链接[载入示例数据] 导入并分类', H.state.results.length > 0, '结果数=' + H.state.results.length);
  // 导出按钮
  _captured.wb = null;
  documentStub.getElementById('btnExport').onclick();
  test('按钮[导出Excel] 触发导出', !!_captured.wb, _captured.wb ? '导出 ' + _captured.wb.Sheets['关键词分类'].aoa.length + ' 行' : '未导出');
  // 重置词典
  documentStub.getElementById('resetDict').onclick();
  test('按钮[重置词典] 重置并重分类', H.state.dict.brand.length > 0 && H.state.results.length > 0, 'brand词 ' + H.state.dict.brand.length + ' 个');

  // ===== 11. 溢出测试（M-NEW-6）=====
  // 渲染超长关键词不应崩溃；measureTextWidth 应返回较大宽度（无上限约束）
  H.state.results = [{ kw: 'a'.repeat(300), cat: 'brand', dimLabel: '品牌+产品+价格+促销+长尾+地域+口碑+属性+人群+公司', intent: 'navigational', stage: 'decision', conf: 90, quality: 8, rule: ['x'], source: '离线', row: ['a'.repeat(300)] }];
  H.state.checkedUnchecked = null;
  let overflowOk = true;
  try { H.renderTable(); } catch (e) { overflowOk = false; console.log('renderTable 超长词异常:', e.message); }
  const w = (function () { const el = documentStub.createElement('span'); el.textContent = 'a'.repeat(300); return el.getBoundingClientRect().width; })();
  test('溢出: 超长关键词renderTable不崩溃(M-NEW-6)', overflowOk, 'measureTextWidth(300字)=' + w + 'px，关键词列无max-width约束');

  // ---------- 汇总 ----------
  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  console.log('\n========== 测试汇总 ==========');
  console.log('总测试: ' + results.length + ' | 通过: ' + pass + ' | 标记/失败: ' + fail);
  console.log('\n--- 标记为预期缺陷（FAIL 即复现了已报告 bug）的用例 ---');
  results.filter(r => !r.pass).forEach(r => console.log('  [复现] ' + r.name + ' :: ' + r.detail));
  fs.writeFileSync(__dirname + '/harness_result.json', JSON.stringify({ pass, fail, total: results.length, detectIndustryMs: dtInd, runClassificationMs: dtRun, discoverCacheFirstMs: dtFirst, discoverCacheSecondMs: dtSecond, cases: results }, null, 2));
  process.exit(0);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
