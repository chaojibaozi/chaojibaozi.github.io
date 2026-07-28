/* Node端逻辑验证：模拟DOM，运行核心分析引擎 */
const fs = require('fs');
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl() };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));

function loadScript(p){
  let code = fs.readFileSync(p,'utf8');
  code = code.replace(/^(let|const) /gm,'var ');   // 顶层声明转var
  (0,eval)(code);                                   // 间接eval→全局作用域
}
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{};  // 跳过渲染
loadScript(__dirname+'/part4_analysis.js');

const dir = __dirname + '/../testdata/';   // 指向当前批次的 testdata 副本（与 xc_test.js 同源，避免依赖用户实时下载目录）
const files = [
  'xc捷配信息_2026-04-28至2026-07-27_搜索词报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_地域分析报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_基础创意报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_高级创意报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_关键词报告.csv',   // PC排名（平均排名（计算机））
  'xc捷配信息_2026-04-28至2026-07-27_推广组报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_计划报告.csv',
  'xc捷配信息_2026-03-01至2026-07-27_账户报告.csv',
  'xc捷配信息_2026-06-26至2026-07-27_分时分析报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_无效点击报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_oCPC报告.csv',
  'xc捷配信息_2026-04-28至2026-07-27_关键词报告 (1).csv'   // 移动端排名（平均排名（移动端））
];
files.forEach(name=>{
  const text = fs.readFileSync(dir+name,'utf8');
  const rows = parseCSV(text);
  const type = detectType(rows[0], name);   // 传文件名，忠实复现前端 detectType(filename-first)
  if(!type){ console.log('❌ 无法识别:', name); return; }
  FILES.push({name, type, rows: rowsToObjects(type, rows)});
  console.log('✔ 识别', name, '→', type, FILES[FILES.length-1].rows.length, '行');
});

// 设备感知验证：注入一份合成「移动端关键词排名」文件（含 平均排名(移动)），验证 PC/移动 按同键合并 + 分设备判定
(function(){
  const txt = '时间,推广计划,推广组,关键词,展示次数,点击次数,点击率,总费用,平均每次点击费用,平均排名(移动),转化数\n="2026-07-18至2026-07-24",JP品牌词-江浙沪鲁粤G606,捷配PCB在线下单,杭州捷配pcb在线下单,256,29,11.33%,719.49,24.81,1.20,6\n="2026-07-18至2026-07-24",JP品牌词-江浙沪鲁粤G606,捷配PCB在线下单,捷配pcb在线下单平台,168,18,10.71%,336.12,20.07,3.50,0';
  const rows = parseCSV(txt);
  const type = detectType(rows[0], 'xc捷配信息_2026-07-18至2026-07-24_关键词报告(移动).csv');
  if(type!=='rank') throw new Error('合成移动排名文件 detectType 应为 rank，实际='+type);
  FILES.push({name:'__synthetic_mobile_rank__.csv', type, rows: rowsToObjects(type, rows)});
  console.log('✔ 注入合成移动排名文件 →', type, FILES[FILES.length-1].rows.length, '行（含 平均排名(移动)）');
})();

// 覆盖 renderAll 后半段DOM操作靠 dummy，直接跑
runAnalysis();

console.log('\n===== 验证结果 =====');
console.log('周期:', R.period, '| 日期数:', R.dates.length);
console.log('总消费:', R.tot.cost.toFixed(2), '| 总点击:', R.tot.clicks, '| 总转化:', R.tot.conv, '| CPA:', R.tot.cpa?.toFixed(2));
console.log('目标CPA基准:', R.targetCPA.toFixed(2), '| 高消费分界:', R.highCost.toFixed(2));
console.log('分日转化:', R.daily.map(d=>d.date.slice(5)+'='+d.conv).join(' '));
console.log('零转化日:', R.zeroDays.map(z=>z.date+'(¥'+z.cost.toFixed(0)+')').join(', ')||'无');
const qc={}; R.kws.forEach(k=>qc[k.quad]=(qc[k.quad]||0)+1);
console.log('四象限分布:', JSON.stringify(qc), '| 关键词总数:', R.kws.length);
console.log('B象限问题词TOP5:', R.kws.filter(k=>k.quad==='B').sort((a,b)=>b.cost-a.cost).slice(0,5).map(k=>k.kw+'¥'+k.cost.toFixed(0)).join(', '));
console.log('转化词及状态:', R.convKws.map(k=>`${k.kw}(${k.conv}转,${k.status})`).join(', '));
console.log('核心词(80%):', R.coreKws.join(', '));
console.log('搜索词组数:', R.queries.length, '| 低匹配:', R.queries.filter(q=>q.level==='低').length);
console.log('否词建议:', R.negList.length, '个, 浪费¥'+R.negList.reduce((s,q)=>s+q.cost,0).toFixed(2));
console.log('否词TOP8:', R.negList.slice(0,8).map(q=>q.query).join(' | '));
console.log('加词建议:', R.addList.length, '个:', R.addList.slice(0,8).map(q=>q.query+(q.conv?'('+q.conv+'转)':'')).join(' | '));
console.log('创意组数:', R.creGroups.length, '| 低效创意:', R.weakCre.length, '| 高级样式组对比:', R.advCompare.length);
console.log('低效创意例:', R.weakCre.slice(0,3).map(c=>c.title.slice(0,20)+' CTR'+(c.ctr*100).toFixed(1)+'%(组'+(c.gctr*100).toFixed(1)+'%)').join(' | '));
console.log('地域诊断:', R.geo.slice(0,8).map(g=>g.region+'['+g.diag+']').join(', '));
console.log('操作清单:', R.actions.length, '条 (P0:'+R.actions.filter(a=>a.p===0).length+' P1:'+R.actions.filter(a=>a.p===1).length+' P2:'+R.actions.filter(a=>a.p===2).length+')');
console.log('\n-- P0 动作 --');
R.actions.filter(a=>a.p===0).forEach(a=>console.log('[P0]['+a.mod+']', a.act.slice(0,110)));
console.log('\n-- 匹配度抽检 --');
[['捷配下载','捷配pcb官网登录入口'],['pcb4层板','捷配pcb官网登录'],['铝基板打样在线下单','金筑铝单板官网入口'],['捷配pcb下单','捷配pcb下单']].forEach(([k,q])=>console.log(`${k} vs ${q} => ${matchScore(k,q)} (${matchLevel(matchScore(k,q))})`));
// 历史环比模拟：伪造上周期快照后重跑
localStorage.setItem('sem360_history', JSON.stringify([{period:'2026-04-20至2026-04-26', cost:4000, conv:30, clicks:500, shows:6000, convKw:{'捷配pcb下单':12,'已流失词':3,'杭州捷配pcb在线下单':5}}]));
runAnalysis();
console.log('\n-- 跨周期对比验证 --');
console.log('对比周期:', R.compare.period);
console.log('变化:', R.compare.changes.filter(c=>c.st!=='持平').map(c=>`${c.kw}:${c.prev}→${c.cur}(${c.st})`).join(' | '));

console.log('\n-- CPA 基准归因验证 --');
const c=R.cpa;
console.log('基准CPA:', c.baselineCPA?.toFixed(2), '| 基准日:', c.baselineDays.join(','), '| 高异动日:', c.highDays.join(',')||'无', '| 阈值%:', c.thresh);
console.log('日度CPA:', c.days.map(d=>d.date.slice(5)+'='+(d.cpa?('¥'+d.cpa.toFixed(1)):'∞')+(d.isHigh?'[高]':d.isBaseline?'[基]':d.isZero?'[零]':'')).join(' '));
console.log('高日预估超额成本: ¥'+c.wastedCost.toFixed(2));
console.log('关键词CPA矩阵TOP5:', c.kwMatrix.slice(0,5).map(k=>k.kw+'(基准'+(k.baselineCpa?('¥'+k.baselineCpa.toFixed(1)):'—')+')').join(' | '));
c.highDays.forEach(hd=>{ const f=c.factors.find(x=>x.date===hd); console.log('  ['+hd+'] 因素:', f.text.slice(0,140)); console.log('        主因词:', (c.kwCulprits[hd]||[]).slice(0,4).map(t=>t.kw+'(¥'+t.cost.toFixed(0)+'/超额¥'+t.contribution.toFixed(0)+')').join('、')); });
console.log('新增无转化搜索词:', c.newTerms.length, '个:', c.newTerms.slice(0,6).map(t=>t.query+'(¥'+t.cost.toFixed(0)+')').join(' | '));
console.log('CPA骤升搜索词:', c.spikedTerms.length, '个:', c.spikedTerms.slice(0,5).map(t=>t.query+'('+(t.baseCpa?t.baseCpa.toFixed(0):'?')+'→'+t.highCpa.toFixed(0)+')').join(' | '));
console.log('创意CTR异动(代理):', c.creShift.length, '条; 高级样式CTR异动(代理):', c.advShift.length, '条');
console.log('操作清单含CPA归因动作:', R.actions.filter(a=>a.mod==='CPA归因').length, '条');

// v6 跨维度同步变化共变「大脑」校验（防字段名错位回归）
console.log('\n-- v6 跨维度共变「大脑」验证 --');
const cv=R.covar;
const cvUnits=cv?.units||[];
const badUnits=cvUnits.filter(u=>!(u.drivers&&u.drivers.length)).length;
console.log('共变归因单元数:', cvUnits.length, '| 无驱动变量的异常单元:', badUnits, badUnits===0?'(正常)':'(⚠字段映射异常)');
console.log('锚点来源:', cv.anchorSource, '| 计划类型诊断:', (cv.planTypes||[]).length, '| 空转单元:', (cv.emptyRuns||[]).length);
console.log('示例单元:', cvUnits.slice(0,3).map(u=>(u.scope+':'+u.target+' → '+(u.drivers||[]).map(x=>x.dim+' r='+x.r.toFixed(2)+x.dir).join('/'))).join(' | '));
console.log('计划类型:', (cv.planTypes||[]).slice(0,5).map(p=>p.plan+'='+p.type).join('、'));
if(!cv.hasAnchor) throw new Error('covar 未识别到转化锚点（搜索词/排名均未载入？）');
if(badUnits>0) throw new Error('covar 驱动变量为空，疑似 u.drivers 字段未产出');
if(!(cv.planTypes&&cv.planTypes.length)) throw new Error('covar 计划类型诊断未产出');

// v4 维度专项诊断校验（设备感知排名 / 分时 / 无效点击 / oCPC 字段映射回归）
console.log('\n-- 维度专项诊断验证 (v4 设备感知) --');
const rk=R.rank;
console.log('排名诊断 has:', !!rk?.has, '| 命中高转化词:', rk?.diag?.length, '| 设备维度:', rk?.devices);
if(!rk||!rk.has) throw new Error('rank 诊断未产出（未导入排名补充文件？）');
if(!(rk.diag&&rk.diag.length)) throw new Error('rank.diag 为空');
console.log('排名三分支示例:', rk.diag.slice(0,5).map(d=>`${d.kw}→${d.primary?d.primary.verdict:'?'}(w${d.primary?d.primary.weight:'?'})`+(d.mobile?(' /移动'+d.mobile.verdict):'')).join(' | '));
if(!(rk.diag.some(d=>d.mobile))) throw new Error('设备感知：未产出 移动 排名判定（PC/移动 合并失败？）');
const cross = rk.diag.find(d=>d.cross && d.cross.includes('分设备处理'));
console.log('跨设备差异示例:', cross? (cross.kw+'：'+cross.cross) : '（本批无跨设备差异，正常）');
const iv=R.invalid;
console.log('无效点击 has:', !!iv?.has, '| 过滤比均值:', iv?.avgRatio?.toFixed(1)+'%', '| 超阈值日:', iv?.flags?.length);
if(!iv||!iv.has) throw new Error('invalid 诊断未产出');
const hr=R.hour;
console.log('分时 has:', !!hr?.has, '| 时段数:', hr?.byHour?.length, '| 低效时段:', hr?.worst?.length);
if(!hr||!hr.has) throw new Error('hour 诊断未产出');
const oc=R.ocpc;
console.log('oCPC has:', !!oc?.has, '| 投放包:', oc?.pkgs?.length, '| 学习期:', oc?.learning);
if(!oc||!oc.has) throw new Error('ocpc 诊断未产出');

// 自适应工作流：数据覆盖检测
console.log('\n-- 数据覆盖检测 (自适应工作流) --');
const cov=R.coverage;
console.log('已载入报告类型:', cov.typesPresent.join(','), '| 可运行模块:', cov.readyCount+'/'+cov.total);
if(!cov.typesPresent.includes('search')) throw new Error('覆盖检测应包含搜索词报告');
if(!cov.typesPresent.includes('rank')) throw new Error('覆盖检测应包含排名报告（(4)/(5)全角括号未识别？）');
if(cov.readyCount<10) throw new Error('应至少可运行10个模块, 实际'+cov.readyCount);
const rankMod=cov.modules.find(m=>m.id==='rank');
if(!rankMod.ready) throw new Error('rank 模块应标记为已运行');
console.log('设备维度(排名):', rk.devices, '| 浅层转化列样例:', rk.diag.slice(0,3).map(d=>d.kw+'(浅层'+(d.shallow||0)+')').join(' | '));

// 自适应降级：仅丢排名文件（无搜索词报告）也应能独立分析，不崩溃
(function(){
  const syn='时间,推广计划,推广组,关键词,展示次数,点击次数,点击率,总费用,平均每次点击费用,平均排名(移动),浅层转化数,转化数\n="2026-07-18",JP,G1,测试词A,100,10,10%,20,2,3,5,6\n="2026-07-19",JP,G1,测试词A,120,12,10%,24,2,3,6,7';
  const rows=parseCSV(syn); const type=detectType(rows[0],'x (移动).csv');
  if(type!=='rank') throw new Error('合成排名文件 detectType 应为 rank，实际='+type);
  const saved=FILES; FILES=[{name:'__only_rank__',type,rows:rowsToObjects(type,rows)}];
  runAnalysis();
  console.log('\n-- 自适应降级(仅排名文件, 无搜索词) --');
  console.log('noSearch=',R.noSearch,'| rank.has=',R.rank.has,'| rank.diag=',R.rank.diag.length,'| 总览转化=',R.tot.conv);
  if(!R.noSearch) throw new Error('无搜索时应置 noSearch=true');
  if(!R.rank||!R.rank.has||!R.rank.diag.length) throw new Error('仅排名文件时排名诊断应基于浅层/深层转化排序产出');
  console.log('排名诊断(无搜索)示例:', R.rank.diag.slice(0,3).map(d=>d.kw+'→'+(d.primary?d.primary.verdict:'?')).join(' | '));
  FILES=saved;
})();

console.log('\nTEST_PASS');
