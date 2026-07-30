/* 盈拓真实全维度数据 · 端到端验证（Node + DOM shim，复用 test_harness 模式）
 * 目的：
 *  1) 校验 decodeCsv(GBK/GB18030 自动回退) + detectType(文件名优先) + findDateCol(日期列) + detectDevice(PC/移动) 对全部维度正确；
 *  2) 全维度真实数据跑通 runAnalysis 不崩溃，且「转化仅存在于 oCPC」这一关键事实被正确纳入总览/共变归因；
 *  3) 输出 KPI 概要，证明结果真实存在（非空、非赝）。
 * 说明：180/160MB 等超大文件按 MAXROWS 截行以避免 OOM，仅影响总量口径，不影响字段/逻辑校验。
 */
const fs = require('fs');
const path = require('path');
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl(), documentElement:null };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));

function loadScript(p){
  let code = fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var ');
  (0,eval)(code);
}
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/part4_analysis.js');
PERIOD_ACK = true;   // v16：本测试对大文件截行(MAXROWS)会造成各类型日期覆盖不一致的「伪周期错位」，
                     // 属测试环境产物（真实全量文件周期一致）。模拟用户点击「仍要继续分析」放行；
                     // 周期拦截行为本身由 period_test.js 专项覆盖。

const DIR = path.join(__dirname,'..','testdata') + '/';   // 已用真实文件名（含日期前缀）复制到工作区，Node 可访问
const MAXROWS = 12000;   // 大文件截行（保留表头），避免 OOM

/* 代表文件：每类型取 1~2 个，优先小文件；文件名自带 pc端/移动端 设备信号 */
const pick = [
  {f:'2023-08-01至2024-01-31搜索产品线数据报告43262566.csv',                 t:'acct'},
  {f:'2023-08-01至2024-01-31搜索计划数据报告43262567.csv',                   t:'plan'},
  {f:'2023-08-01至2024-01-31搜索组数据报告43262568.csv',                     t:'grp'},
  {f:'2023-08-01至2024-01-31搜索关键词pc端搜索类数据报告43262587.csv',       t:'rank'},   // 关键词含 平均排名(计算机) → 走 rank 特例放行
  {f:'2023-08-01至2024-01-31搜索关键词移动端搜索类数据报告43262588.csv',     t:'rank'},   // 移动关键词 → rank
  {f:'2023-08-01至2024-01-31搜索凤舞pc端搜索类数据报告43262571.csv',         t:'adv'},
  {f:'2023-08-01至2024-01-31搜索凤舞移动端搜索类分创意类型报告43262593.csv', t:'adv'},
  {f:'2023-08-01至2024-01-31搜索创意pc端搜索类数据报告43262590.csv',         t:'basic'},
  {f:'2023-08-01至2024-01-31搜索创意移动端搜索类数据报告43262591.csv',       t:'basic'},
  {f:'2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv',     t:'search'},
  {f:'2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv',               t:'search'},
  {f:'2023-08-01至2024-01-31搜索计划移动端搜索类市级地域报告43262584.csv',     t:'geo'},
  {f:'2023-08-01至2024-01-31搜索组pc端搜索类市级地域报告43262585.csv',        t:'geo'},
  {f:'2023-08-01至2024-01-31搜索oCPC分oCPC投放包数据43262576.csv',            t:'ocpc'},   // 含 浅层/深度转化数（账户级）
  {f:'2023-08-01至2024-01-31搜索oCPC移动端搜索类分oCPC投放包数据43262581.csv', t:'ocpc'},
  {f:'2023-08-01至2024-01-31搜索创意pc端搜索类创意系统配图报告43262578.csv',         t:'pic'},
];

let loaded=0, rejected=0, typeErr=0;
console.log('===== 阶段1：维度识别 / 解码 / 分日校验 =====');
pick.forEach(({f,t})=>{
  const fp = path.join(DIR,f);
  if(!fs.existsSync(fp)){ console.log('  ⚠ 缺失(跳过):', f); return; }
  let buf = fs.readFileSync(fp);
  const CAP = 5*1048576;                                  // 超大文件只读前 5MB（避免 OOM），oCPC 等小文件不受影响
  if(buf.length>CAP) buf = buf.slice(0, CAP);
  const text = decodeCsv(buf);                         // GBK/GB18030 自动回退
  let rows = parseCSV(text);
  if(rows.length>MAXROWS+1) rows = rows.slice(0, MAXROWS+1);   // 截行（保留表头）双保险
  const header = rows[0].map(x=>x.trim());
  const type = detectType(rows[0], f);                // 文件名优先
  if(type!==t){ console.log('  ❌ 类型识别不符:', f.slice(0,30), '期望='+t, '实际='+type); typeErr++; return; }
  const dev = detectDevice(f, rows);
  const objs = rowsToObjects(type, rows);
  if(type==='rank'){
    // 排名补充（特例放行，不强制分日）
    FILES.push({name:f, type, rows:objs, device:dev});
  }else{
    const valid = objs.filter(r=>isSingleDate(r.date)).length;
    const pct = (valid/objs.length*100).toFixed(0);
    if(valid < objs.length*0.5){ console.log('  ❌ 非分日(疑似汇总):', f.slice(0,30), 'valid='+valid+'/'+objs.length); rejected++; return; }
    FILES.push({name:f, type, rows:objs, device:dev});
    console.log('  ✔', f.slice(0,36).padEnd(36), '→', type.padEnd(6), 'rows='+String(objs.length).padStart(6), '分日率='+pct+'%', 'dev='+dev, '日期样例='+(objs[0]&&objs[0].date));
  }
  loaded++;
});

if(typeErr || rejected){ console.log('\n❌ 维度识别/分日校验失败，终止。typeErr='+typeErr+' rejected='+rejected); process.exit(1); }
console.log('\n  载入 '+loaded+' 个文件，0 拒绝。');

/* 设备端覆盖 */
const devs = new Set(FILES.map(f=>f.device));
console.log('  设备端覆盖:', [...devs].join(',') || '(未知)');

console.log('\n===== 阶段2：全维度 runAnalysis 端到端 =====');
try{
  runAnalysis();
}catch(e){
  console.log('\n❌ runAnalysis 抛错:', e && e.stack || e);
  process.exit(1);
}

console.log('\n===== 阶段3：结果校验（证明真实存在） =====');
const A = [];
function assert(name, cond, info){ A.push({name, ok:!!cond, info:info||''}); if(!cond) console.log('  ❌ '+name+(info?' → '+info:'')); else console.log('  ✔ '+name+(info?' → '+info:'')); }

assert('总览有分日数据', R.dates && R.dates.length>0, '日期数='+(R.dates&&R.dates.length));
assert('转化来源识别为 oCPC', R.convSource==='oCPC', 'convSource='+R.convSource);
assert('总览转化>0(来自oCPC)', R.tot && R.tot.conv>0, 'conv='+(R.tot&&R.tot.conv)+' cost='+(R.tot&&R.tot.cost&&R.tot.cost.toFixed(0)));
assert('总览 CPA 已算', R.tot && R.tot.cpa>0, 'CPA='+(R.tot&&R.tot.cpa&&R.tot.cpa.toFixed(2)));
assert('oCPC 诊断有投放包', R.ocpc && R.ocpc.has && R.ocpc.pkgs.length>=2, 'pkgs='+(R.ocpc&&R.ocpc.pkgs&&R.ocpc.pkgs.length));
const anyConv = R.ocpc && R.ocpc.pkgs && R.ocpc.pkgs.some(p=>(p.shallow||0)+(p.deep||0)>0);
assert('oCPC 含浅层/深度转化数', anyConv, 'totalShallow='+(R.ocpc&&R.ocpc.totalShallow)+' totalDeep='+(R.ocpc&&R.ocpc.totalDeep));
assert('共变归因命中 oCPC 锚点', R.covar && R.covar.hasAnchor && /oCPC/.test(R.covar.anchorSource||''), 'anchor='+(R.covar&&R.covar.anchorSource));
assert('共变归因产出账户级单元', R.covar && R.covar.units && R.covar.units.length>=1 && R.covar.units[0].scope==='账户', 'units='+(R.covar&&R.covar.units&&R.covar.units.length));
assert('排名诊断有结果(来自关键词文件)', R.rank && R.rank.has && R.rank.diag && R.rank.diag.length>0, 'diag='+(R.rank&&R.rank.diag&&R.rank.diag.length));
assert('地域分析有结果', R.geo && R.geo.length>0, 'geo='+(R.geo&&R.geo.length));
assert('创意分析有结果', R.creGroups && R.creGroups.length>0, 'creGroups='+(R.creGroups&&R.creGroups.length));
assert('操作清单非空', R.actions && R.actions.length>0, 'actions='+(R.actions&&R.actions.length));

/* 设备端感知：应同时含 pc 与 mobile */
const devScope = R.deviceScope || '';
assert('设备端感知含 PC', /pc|both|电脑|计算机/.test(devScope) || devs.has('pc'), 'deviceScope='+devScope);
assert('设备端感知含 移动', /mobile|both|移动/.test(devScope) || devs.has('mobile'), 'deviceScope='+devScope);

/* 维度覆盖（自适应工作流） */
const cov = R.coverage;
assert('覆盖检测含 search', cov && cov.typesPresent.includes('search'));
assert('覆盖检测含 ocpc', cov && cov.typesPresent.includes('ocpc'));
assert('覆盖检测含 rank', cov && cov.typesPresent.includes('rank'));

console.log('\n===== 阶段4：KPI 概要（真实数据） =====');
console.log('周期:', R.period, '| 日期数:', R.dates.length);
console.log('总消费 ¥'+(R.tot.cost.toFixed(0)), '| 总转化(账户级oCPC):', R.tot.conv, '| 账户CPA ¥'+(R.tot.cpa.toFixed(2)), '| 转化来源:', R.convSource);
console.log('oCPC 投放包:', R.ocpc.pkgs.length, '个 | 浅层转化', R.ocpc.totalShallow, '| 深度转化', R.ocpc.totalDeep, '| 学习期:', R.ocpc.learning);
console.log('共变归因锚点:', R.covar.anchorSource, '| 账户级驱动变量:', (R.covar.units[0]&&R.covar.units[0].drivers.map(d=>d.dim+' r='+d.r.toFixed(2)+d.dir).join('、'))||'(无)');
console.log('排名诊断示例:', (R.rank.diag.slice(0,3).map(d=>(d.kw||'?')+'→'+(d.primary?d.primary.verdict:'?')).join(' | '))||'');
console.log('地域 TOP3:', R.geo.slice(0,3).map(g=>g.region+' ¥'+(g.cost.toFixed(0))).join(' | '));
console.log('设备端:', R.deviceScope, '| 已载入类型:', (cov&&cov.typesPresent.join(',')));
console.log('操作清单:', R.actions.length, '条 (P0:'+R.actions.filter(a=>a.p===0).length+' P1:'+R.actions.filter(a=>a.p===1).length+' P2:'+R.actions.filter(a=>a.p===2).length+')');

const fail = A.filter(a=>!a.ok).length;
console.log('\n'+(fail? ('❌ 失败 '+fail+' 项') : '✔ 全部校验通过')+(fail? '' : '  → TEST_PASS'));
process.exit(fail?1:0);
