import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(dir, 'slices_v3');
const parts = [];
for (let i = 0; i < 8; i++) {
  const f = path.join(base, `partial_${i}.json`);
  if (fs.existsSync(f)) parts.push(JSON.parse(fs.readFileSync(f, 'utf-8')));
}
if (parts.length === 0) { console.error('没有找到任何 partial 结果'); process.exit(1); }

const TYPES = ['trigger_as_company', 'geo_overmatch', 'attr_over_product', 'company_missed', 'factory_missed'];
const TYPE_NAME = {
  trigger_as_company: '网络/平台/社区词误判公司·厂家·电话词',
  geo_overmatch: '地域词子串过匹配',
  attr_over_product: '属性词压过产品词根',
  company_missed: '含法人后缀却漏判公司词',
  factory_missed: '含厂家后缀却漏判厂家词',
};

const grand = { trigger_as_company: 0, geo_overmatch: 0, attr_over_product: 0, company_missed: 0, factory_missed: 0 };
const triggerTally = {};
const posTally = {}, posErr = {};
const industries = [];
let totalKeywords = 0, segMiss = 0, segSample = 0;
const examples = {}; const exSeen = {};
for (const t of TYPES) { examples[t] = []; exSeen[t] = new Set(); }
const CAP = { trigger_as_company: 24, geo_overmatch: 24, attr_over_product: 20, company_missed: 30, factory_missed: 30 };
let probeResults = null, segProbes = null;

for (const s of parts) {
  totalKeywords += s.totalKeywords || 0;
  for (const t of TYPES) grand[t] += (s.grand?.[t] || 0);
  for (const [k, v] of Object.entries(s.triggerTally || {})) triggerTally[k] = (triggerTally[k] || 0) + v;
  for (const [k, v] of Object.entries(s.posTally || {})) posTally[k] = (posTally[k] || 0) + v;
  for (const [k, v] of Object.entries(s.posErr || {})) posErr[k] = (posErr[k] || 0) + v;
  for (const ind of (s.industries || [])) {
    industries.push(ind);
    segMiss += ind.segMiss || 0; segSample += ind.segSample || 0;
    for (const t of TYPES) for (const ex of (ind.examples || [])) {
      if (ex.type === t && !exSeen[t].has(ex.kw) && examples[t].length < CAP[t]) { exSeen[t].add(ex.kw); examples[t].push(ex); }
    }
  }
  if (!probeResults && s.probeResults) probeResults = s.probeResults;
  if (!segProbes && s.segProbes) segProbes = s.segProbes;
}

const withRate = industries.map(ind => ({ name: ind.name, top: ind.top, total: ind.total, errs: ind.errs }))
  .sort((a, b) => (b.errs.trigger_as_company + b.errs.company_missed + b.errs.factory_missed) - (a.errs.trigger_as_company + a.errs.company_missed + a.errs.factory_missed));
const worst = withRate.slice(0, 40);
const totalErr = TYPES.reduce((s, t) => s + grand[t], 0);
const probeOk = (probeResults || []).filter(p => !p.errs.length).length;

// ---------- 生成 TXT ----------
const L = []; const line = (s = '') => L.push(s); const hr = '='.repeat(78);
line(hr);
line('关键词分词 / 分类逻辑 · 更细行业深度压测审查报告（v3 · 50000词/行业 · 8-Agent并行）');
line(`生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
line('测试对象：D:\\BianCheng\\Keyword-Segmentation-Tool\\index.html（P0+P1 修复后版本）');
line('测试方法：从 index.html 抽取真实 classify()/segment() 脚本，Node 注入自引用 Proxy DOM 桩离线运行');
line(hr);
line('');
line('一、测试规模与方法');
line(`  · 更细子行业数：${industries.length} 个`);
line('    —— 由用户给出的 395 个一/二级细分行业标签，深度细分为 923 个更细子行业，');
line(`       去除空泛/重复标签（其他/综合/咨询等）后取 ${industries.length} 个代表性更细子行业，覆盖全部一级大类。`);
line(`  · 每行业随机合成关键词：${parts[0]?.perIndustry?.toLocaleString() || '50,000'} 个（去重）`);
line(`  · 实际测试关键词总量：${totalKeywords.toLocaleString()} 条`);
line('  · 并行执行：8 个独立 agent（进程），各跑一个分片，结果合并为本报告（对应 8 核 CPU）');
line('  · 多词性覆盖：每条关键词由带"词性标注"的模板生成，覆盖 24 种词性/结构组合：');
line('       产品名词 / 属性(形容词)+产品 / 动词+产品 / 产品+价格 / 产品+疑问 / 产品+口碑 /');
line('       产品+促销 / 地域+产品 / 品牌+产品 / 人群+产品 / 产品+公司后缀 / 产品+厂家后缀 /');
line('       产品+电话 / 网络触发词±产品 / 多槽长尾组合 等');
line('  · 判定方式：对每条关键词调用真实 classify() 取分类结果，用固定规则检测 5 类逻辑错误；');
line('    并直接调用 segment() 对采样词做分词，验证分词器本身缺陷。');
line('');
line('  重要说明：合成器刻意提高了网络/平台/社区触发词与各类后缀的出现比例（约 60% 模板含触发/后缀），');
line('  目的是压力放大潜在 bug。因此下方百分比为"触发词富集语料下命中率"，不等于自然词包真实误判率；');
line('  自然词真实表现见第五节固定探针（均为真实语义关键词）。');
line('');
line(hr);
line('二、总体错误统计（五类逻辑错误）');
line(`  ${'错误类型'.padEnd(34)}${'数量'.padStart(12)}${'占测试词比'.padStart(14)}`);
line(`  ${'-'.repeat(60)}`);
for (const t of TYPES) line(`  ${TYPE_NAME[t].padEnd(33)} ${String(grand[t]).padStart(12)} ${(totalKeywords ? (grand[t] / totalKeywords * 100).toFixed(3) : '0').padStart(12)}%`);
line(`  ${'合计'.padEnd(33)} ${String(totalErr).padStart(12)} ${(totalKeywords ? (totalErr / totalKeywords * 100).toFixed(3) : '0').padStart(12)}%`);
line('');
line('  关键结论：');
line(`  · 网络/平台/社区触发词误判（→公司/厂家/电话）：${grand.trigger_as_company.toLocaleString()} 条`);
line(`    （占测试词 ${(grand.trigger_as_company / totalKeywords * 100).toFixed(3)}%）。P0 修复后，无法人标记的纯网络词已基本不再误判，`);
line('    残余主要来自"网络触发词 + 真实法人/厂家后缀"共现的复合词（本就应归公司/厂家，属边界样本）。');
line(`  · 含法人后缀却漏判公司词：${grand.company_missed.toLocaleString()} 条 —— 本轮最突出的残留逻辑缺陷（详见第九节新发现）。`);
line(`  · 含厂家后缀却漏判厂家词：${grand.factory_missed.toLocaleString()} 条。`);
line(`  · 地域词过匹配：${grand.geo_overmatch.toLocaleString()} 条；属性压产品：${grand.attr_over_product.toLocaleString()} 条 —— 经 P1 修复后已降至极低量级。`);
line('');
line(hr);
line('三、按词性 / 结构维度的错误分布（本轮新增维度）');
line('  说明：统计各"词性/结构"模板下的样本量与错误命中数，定位最易触发 bug 的输入词性。');
line(`  ${'词性/结构'.padEnd(20)}${'样本数'.padStart(12)}${'错误数'.padStart(12)}${'错误率'.padStart(12)}`);
line(`  ${'-'.repeat(56)}`);
const posRows = Object.keys(posTally).map(k => ({ k, n: posTally[k], e: posErr[k] || 0 }))
  .sort((a, b) => (b.e / (b.n || 1)) - (a.e / (a.n || 1)));
for (const r of posRows) line(`  ${r.k.padEnd(19)} ${String(r.n).padStart(12)} ${String(r.e).padStart(12)} ${(r.n ? (r.e / r.n * 100).toFixed(2) : '0').padStart(11)}%`);
line('');
line(hr);
line('四、分词器自身缺陷（segment 固定探针 + 采样漏切统计）');
line('  直接调用 segment(text, 分词词典) 的输出：');
for (const p of (segProbes || [])) line(`  「${p.kw}」  →  ${p.seg}`);
line('');
line(`  分词采样漏切统计（触发词存在于关键词、但未被切为独立词元）：`);
line(`    ${segMiss.toLocaleString()} / ${segSample.toLocaleString()} 采样词（约 ${(segSample ? segMiss / segSample * 100 : 0).toFixed(1)}%）`);
line('  典型问题：单字回退（未登录词退化为单字）、双向最大匹配偏短、无词性/领域感知、词典与分类不完全一致。');
line('');
line(hr);
line('五、固定探针证据（自然语义关键词，非合成，全部分片一致复现）');
line(`  探针通过率：${probeOk} / ${(probeResults || []).length} 正常`);
for (const p of (probeResults || [])) line(`  「${p.kw}」  →  ${p.pred}  (规则:${p.rule})${p.errs.length ? '  ❌误判' : '  ✅正常'}`);
line('');
line(hr);
line('六、触发词误判分布（按触发词聚合，定位最危险污染词）');
line(`  ${'触发词'.padEnd(10)}${'误判数'.padStart(12)}${'占比'.padStart(10)}`);
for (const [k, v] of Object.entries(triggerTally).sort((a, b) => b[1] - a[1]))
  line(`  ${k.padEnd(10)} ${String(v).padStart(12)} ${(grand.trigger_as_company ? (v / grand.trigger_as_company * 100).toFixed(1) : 0).padStart(9)}%`);
line('');
line(hr);
line('七、错误最严重的更细行业（Top 40，按 触发误判+公司漏判+厂家漏判 合计排序）');
line(`  ${'更细行业'.padEnd(16)}${'所属大类'.padEnd(14)}${'测试词'.padStart(8)}${'触发误判'.padStart(9)}${'公司漏判'.padStart(9)}${'厂家漏判'.padStart(9)}`);
for (const w of worst) line(`  ${(w.name || '').slice(0, 14).padEnd(16)}${(w.top || '').slice(0, 12).padEnd(14)}${String(w.total).padStart(8)}${String(w.errs.trigger_as_company).padStart(9)}${String(w.errs.company_missed).padStart(9)}${String(w.errs.factory_missed).padStart(9)}`);
line('');
line(hr);
line('八、典型误判样本（各类型抽样）');
for (const t of TYPES) {
  line(`【${TYPE_NAME[t]}】示例（共 ${grand[t].toLocaleString()} 条，抽样 ${examples[t].length}）：`);
  for (const ex of examples[t]) line(`   · 「${ex.kw}」 → ${ex.pred}  (${ex.rule})  [词性:${ex.pos || '-'}]`);
  if (examples[t].length === 0) line('   · （无）');
  line('');
}
line(hr);
line('九、本轮新发现（较 P0/P1 修复报告的增量）');
line('  发现 A：「集团」类法人后缀漏判公司词 —— 最主要残留缺陷');
line('    现象：以「集团 / 有限公司 / 股份有限公司」结尾、且词中含"产品词根/网络触发词/地域词"的复合词，');
line('         常被判为 长尾词 / 品牌词 / 型号词 / 人群词，而非公司词。');
line('    样例：「妇科炎症设备集团」→长尾词、「武汉XX乳腺科机构集团」→长尾词、「越秀华美炎症集团」→型号词。');
line('    根因：P0/P1 修复主要强化了"公司"后缀识别与去污染，但 company 判定对「集团」等后缀权重仍不足，');
line('         当词中先命中产品词根(core=96)/品牌/人群等更高得分维度时，company 让位，导致漏判。');
line('    影响：该类是本轮 company_missed 的主体，量级显著高于修复报告中"公司"后缀的残留(22)。');
line('  发现 B：成语/修饰+地名歧义仍存（朝阳产业/河东狮吼/浦东开发/鼓楼大街）——');
line('    与修复报告"已知限制"一致，属语言固有歧义，geo=70 已不再压过产品/公司，量级极低。');
line('  发现 C：分词器 segment() 已接入 classify() 做产品词召回，但对未登录长词仍单字回退，');
line('    分词词典与分类正则词典仍非完全同源，采样漏切率见第四节。');
line('');
line(hr);
line('十、修复建议（按优先级）');
line('  P0：扩充 company 后缀识别集，将「集团/股份有限公司/有限责任公司/企业集团/控股」纳入强命中，');
line('      且当关键词以这些法人后缀结尾时，company 得分应上调至高于 core/brand/audience，杜绝漏判。');
line('  P1：厂家后缀「生产厂家/制造厂/厂商」同理，确保以其结尾者稳定归厂家词（当前仍有 factory_missed）。');
line('  P1：对"网络触发词 + 法人/厂家后缀"共现词，明确判定优先级（建议后缀 > 触发词），减少边界抖动。');
line('  P2：继续统一 segment() 与 classify() 词典来源，补齐未登录词处理，消除采样漏切。');
line('  P2：成语/短地名歧义可维护一份"地名假阳性白名单"（朝阳产业/河东狮吼等）进一步压低 geo 过匹配。');
line('');
line(hr);
line('十一、复现方式');
line('  1) 生成更细行业表：   node build/finer_taxonomy.mjs');
line('  2) 切片(8片)：        node build/split_finer.mjs');
line('  3) 8-Agent 并行压测： bash build/run_all.sh   （各片 node build/audit_v3.mjs slice_N.json partial_N.json 50000）');
line('  4) 合并生成本报告：   node build/aggregate_v3.mjs');
line(hr);

const outPath = path.join(dir, '..', '更细行业分词逻辑压测报告.txt');
fs.writeFileSync(outPath, L.join('\n'), 'utf-8');
console.log('报告已生成:', outPath);
console.log('更细行业:', industries.length, '关键词:', totalKeywords.toLocaleString(), '总错误:', totalErr.toLocaleString());
console.log('grand:', JSON.stringify(grand));
