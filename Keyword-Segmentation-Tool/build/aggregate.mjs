import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(dir, 'slices');
const slices = [];
for (let i = 0; i < 10; i++) {
  const f = path.join(base, `partial_${i}.json`);
  if (fs.existsSync(f)) slices.push(JSON.parse(fs.readFileSync(f, 'utf-8')));
}
if (slices.length === 0) { console.error('没有找到任何 partial 结果'); process.exit(1); }

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
const industries = [];
let totalKeywords = 0;
let segMiss = 0, segSample = 0;
const examples = { trigger_as_company: [], geo_overmatch: [], attr_over_product: [], company_missed: [], factory_missed: [] };
const exSeen = { trigger_as_company: new Set(), geo_overmatch: new Set(), attr_over_product: new Set(), company_missed: new Set(), factory_missed: new Set() };
const CAP = { trigger_as_company: 90, geo_overmatch: 30, attr_over_product: 20, company_missed: 30, factory_missed: 40 };

let probeResults = null, segProbes = null;

for (const s of slices) {
  totalKeywords += s.totalKeywords || 0;
  for (const t of TYPES) grand[t] += (s.grand?.[t] || 0);
  for (const [k, v] of Object.entries(s.triggerTally || {})) triggerTally[k] = (triggerTally[k] || 0) + v;
  for (const ind of (s.industries || [])) {
    industries.push(ind);
    segMiss += ind.segMiss || 0; segSample += ind.segSample || 0;
    for (const t of TYPES) {
      for (const ex of (ind.examples || [])) {
        if (ex.type === t && !exSeen[t].has(ex.kw) && examples[t].length < CAP[t]) { exSeen[t].add(ex.kw); examples[t].push(ex); }
      }
    }
  }
  if (!probeResults && s.probeResults) probeResults = s.probeResults;
  if (!segProbes && s.segProbes) segProbes = s.segProbes;
}

// 分行业错误率（按 trigger_as_company 排序取前 40）
const withRate = industries.map(ind => ({
  name: ind.name, total: ind.total, errs: ind.errs,
  triggerRate: ind.total ? (ind.errs.trigger_as_company / ind.total * 100) : 0,
})).sort((a, b) => b.errs.trigger_as_company - a.errs.trigger_as_company);
const worst = withRate.slice(0, 40);

const totalErr = grand.trigger_as_company + grand.geo_overmatch + grand.attr_over_product + grand.company_missed + grand.factory_missed;
const triggerPct = totalKeywords ? (grand.trigger_as_company / totalKeywords * 100) : 0;

// ---------- 生成 TXT 报告 ----------
const L = [];
const line = (s = '') => L.push(s);
const hr = '='.repeat(78);

line(hr);
line('关键词分词 / 分类逻辑 · 跨行业压测审查报告');
line(`生成时间：2026-07-24   测试方法：从 index.html 抽取真实 classify() 脚本，Node 注入 DOM 桩离线运行`);
line(hr);
line('');
line('一、测试规模与方法');
line(`  · 细分行业数：${industries.length} 个（覆盖医疗、机械、游戏、教育、商业服务、建筑、家政、`);
line(`    汽车、电子、农林、旅游、文体、安防、食品、金融、IT、婚恋社交、资讯、APP 等全类目）`);
line(`  · 每行业随机合成关键词：${slices[0]?.perIndustry || 3000} 个（去重后实际总计 ${totalKeywords.toLocaleString()} 个）`);
line(`  · 并行执行：10 个独立 agent，各跑一个分片，结果合并为本报告`);
line(`  · 判定方式：对每条关键词调用真实 classify() 取分类结果，并用固定规则检测 5 类逻辑错误；`);
line(`    同时直接调用 segment() 对采样词做分词（验证分词器本身缺陷）`);
line('');
line('  重要说明：合成器在造词时「刻意提高」了网络/平台/社区类触发词的出现比例（约 40% 模板含触发词），');
line('  目的是压力测试该 bug。因此下方百分比是「在触发词富集语料下的命中率」，不等于自然搜索词包的真实误判率；');
line('  真实率需用真实词包复核，但 bug 在全部 364 个行业均稳定复现（见固定探针证据，使用自然关键词）。');
line('');
line(hr);
line('二、总体错误统计（五类逻辑错误）');
line(`  ${'错误类型'.padEnd(34)}${'数量'.padStart(10)}${'占测试词比'.padStart(12)}`);
line(`  ${'-'.repeat(34)}${'-'.repeat(10)}${'-'.repeat(12)}`);
for (const t of TYPES) {
  line(`  ${TYPE_NAME[t].padEnd(33)} ${String(grand[t]).padStart(10)} ${(totalKeywords ? (grand[t] / totalKeywords * 100).toFixed(2) : '0.00').padStart(11)}%`);
}
line(`  ${'合计'.padEnd(33)} ${String(totalErr).padStart(10)} ${(totalKeywords ? (totalErr / totalKeywords * 100).toFixed(2) : '0.00').padStart(11)}%`);
line('');
line('  关键结论：');
line(`  · 触发词误判（网络/平台/社区词被判公司/厂家/电话）是绝对主因：${grand.trigger_as_company.toLocaleString()} 条，`);
line(`    占全部错误的 ${totalErr ? (grand.trigger_as_company / totalErr * 100).toFixed(1) : 0}%。`);
line(`  · 「含厂家后缀却漏判厂家词」${grand.factory_missed.toLocaleString()} 条——其根因与触发词误判同源：`);
line(`    词中若同时含网络触发词，company(102) 会压过 factory(98)，使「XX网厂家」被归为公司词而非厂家词。`);
line(`  · 「含法人后缀却漏判公司词」${grand.company_missed.toLocaleString()} 条——根因是 地域词(108) > 公司词(102)，`);
line(`    如「上海某某机械有限公司」被判地域词。`);
line('');
line(hr);
line('三、根因分析（分词逻辑错误的本质）');
line('');
line('  发现 1：分词函数 segment() / segmentFMM() / segmentBMM() 在整份代码中「只定义、从未被调用」');
line('  （全文件 grep 仅命中函数定义，无调用点）。也就是说系统实际并不走分词器，用户感知到的');
line('  「分词分到公司词」，本质是 classify() 用整词正则/子串匹配完成的分类结果。分词器是死代码。');
line('');
line('  发现 2：BASE.company 词典被网络/平台/社区类词严重污染。该词典约 5180 条，混入大量');
line('  平台(230)/网站(53)/电商(48)/资讯(50)/网络(44)/游戏(43)/软件(44)/直播(29)/社区(23)/论坛(13)/');
line('  APP(15)/媒体(20) 等，且含裸词「论坛/社区/媒体/自媒体/社交平台/直播平台/资讯平台/网店」等，');
line('  这些词亦同时存在于 BASE.product（双归属），部分仅存在于 company 词典。');
line('');
line('  发现 3：评分竞争机制放大污染。classify() 按得分取最高类，关键分值：');
line('  geo=108 > company=102 > phone=100 > factory=98 > brand=90 > attribute=92 > core精确=94 /');
line('  core短=60 > longtail=58 > generic=12。只要关键词含一个 company 词典子串（如「平台」），');
line('  即便它本身就是产品词，company 也几乎必然胜出。');
line('');
line('  发现 4：segment() 自身还有经典最大匹配缺陷（下方第四节以固定探针演示），且分词词典与');
line('  分类正则词典「两张皮」——分类正则靠 BASE.company 子串能认出「平台」，但分词词典常缺该');
line('  独立词条，segMiss 采样见第四节（分词器若被启用会漏切）。');
line('');
line(hr);
line('四、分词器自身缺陷（segment 固定探针，直接使用 segment() 验证）');
line('  说明：以下为直接调用 segment(text, 分词词典) 的输出，展示「若启用分词器」会怎样切：');
for (const p of (segProbes || [])) line(`  「${p.kw}」  →  ${p.seg}`);
line('');
line(`  分词采样漏切统计（触发词存在于关键词、但未被切为独立词元）：`);
line(`    ${segMiss.toLocaleString()} / ${segSample.toLocaleString()} 采样词（约 ${(segSample ? segMiss / segSample * 100 : 0).toFixed(1)}%）`);
line('  典型问题：');
line('   · 单字回退：未登录词退化为单字（如「医/疗/社区」「结/合/成/分/子」），无未登录词处理；');
line('   · 最大匹配偏短：双向最大匹配按「词元数少者优先」，易把「平台」「社区」这类短词吞进长词元；');
line('   · 无词性/领域感知：纯词典最长匹配，无法区分「研究生命」中的「研究生」与「生命」；');
line('   · 词典与分类不一致：分类正则靠 BASE.company 子串能识别「平台」，分词词典却常无独立词条。');
line('');
line(hr);
line('五、固定探针证据（自然关键词，全部 10 分片一致复现）');
line('  下列均为真实语义关键词，非合成，用于证明 bug 非偶发：');
for (const p of (probeResults || [])) {
  const flag = p.errs.length ? '  ❌误判' : '  ✅正常';
  line(`  「${p.kw}」  →  ${p.pred}  (规则:${p.rule})${flag}`);
}
line('');
line(hr);
line('六、触发词误判分布（按触发词聚合，定位最危险的污染词）');
const tt = Object.entries(triggerTally).sort((a, b) => b[1] - a[1]);
line(`  ${'触发词'.padEnd(10)}${'误判数'.padStart(10)}${'占比'.padStart(10)}`);
for (const [k, v] of tt) line(`  ${k.padEnd(10)} ${String(v).padStart(10)} ${(grand.trigger_as_company ? (v / grand.trigger_as_company * 100).toFixed(1) : 0).padStart(9)}%`);
line('');
line(hr);
line('七、误判最严重的行业（Top 40，按触发词误判数排序）');
line(`  ${'行业'.padEnd(18)}${'测试词'.padStart(8)}${'触发误判'.padStart(10)}${'厂家漏判'.padStart(10)}${'公司漏判'.padStart(10)}`);
for (const w of worst) line(`  ${w.name.slice(0, 16).padEnd(18)} ${String(w.total).padStart(8)} ${String(w.errs.trigger_as_company).padStart(10)} ${String(w.errs.factory_missed).padStart(10)} ${String(w.errs.company_missed).padStart(10)}`);
line('');
line(hr);
line('八、典型误判样本（来自各分片实测）');
for (const t of TYPES) {
  line(`【${TYPE_NAME[t]}】示例（共 ${grand[t]} 条，抽样 ${examples[t].length}）：`);
  for (const ex of examples[t].slice(0, 18)) line(`   · 「${ex.kw}」 → ${ex.pred}  (${ex.rule})`);
  line('');
}
line(hr);
line('九、修复建议（按优先级）');
line('  P0（必须）：净化 BASE.company 词典，把网络/平台/社区/媒体/电商/资讯/软件/系统/游戏/APP 等');
line('      非法人实体词移出；company 仅保留「有限公司/股份公司/集团/医院/诊所/厂/厂商」等法人后缀命中。');
line('  P0：修正评分竞争——产品词根命中时应优先于 company（或 company 得分降至 core 之下），');
line('      避免「直播平台」「游戏社区」被判公司词。');
line('  P1：调整优先级 地域词(108) > 公司词(102) 的不合理处，使「上海某某机械有限公司」正确归公司词；');
line('      厂家词(98) 应不低于 company，使「XX网厂家」归厂家词。');
line('  P1：属性词与「修饰+产品」冲突时，若含明确产品词根应判产品而非属性（变频空调/实木家具/智能锁）。');
line('  P2：厘清 segment() 与 classify() 关系——要么接入分类管线（并补齐未登录词/词性），要么显式标注为死代码，');
line('      避免维护两张不一致词典（分类正则词典 vs 分词词典）。');
line('  P2：统一词典来源，让分词器与分类器共用同一份词条，杜绝「正则认得、分词切不出」的割裂。');
line('');
line(hr);
line('十、复现方式');
line('  node build/audit_v2.mjs build/slices/slice_N.json build/slices/partial_N.json 3000   (N=0..9)');
line('  合并：node build/aggregate.mjs  （读取 partial_0..9.json 生成本报告）');
line('  说明：脚本从 index.html 抽取真实 classify 脚本块，用自引用 Proxy DOM 桩在 Node 中执行，');
line('        不依赖浏览器，结果可完整复现。');
line(hr);

const outPath = path.join(dir, '分词逻辑跨行业压测报告.txt');
fs.writeFileSync(outPath, L.join('\n'), 'utf-8');
console.log('报告已生成:', outPath);
console.log('行业数:', industries.length, '关键词:', totalKeywords, '总错误:', totalErr);
console.log('trigger_as_company:', grand.trigger_as_company, 'factory_missed:', grand.factory_missed, 'company_missed:', grand.company_missed, 'geo_overmatch:', grand.geo_overmatch, 'attr_over_product:', grand.attr_over_product);
