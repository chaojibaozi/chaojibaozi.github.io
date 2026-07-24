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

const dir = 'D:/360浏览器下载的文件/';
const files = [
  'xc捷配信息_2026-07-17至2026-07-23_搜索词报告 (1).csv',
  'xc捷配信息_2026-07-17至2026-07-23_搜索词报告.csv',
  'xc捷配信息_2026-07-17至2026-07-23_地域分析报告 (1).csv',
  'xc捷配信息_2026-07-17至2026-07-23_基础创意报告.csv',
  'xc捷配信息_2026-07-17至2026-07-23_高级创意报告.csv'
];
files.forEach(name=>{
  const text = fs.readFileSync(dir+name,'utf8');
  const rows = parseCSV(text);
  const type = detectType(rows[0]);
  if(!type){ console.log('❌ 无法识别:', name); return; }
  FILES.push({name, type, rows: rowsToObjects(type, rows)});
  console.log('✔ 识别', name, '→', type, FILES[FILES.length-1].rows.length, '行');
});

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
localStorage.setItem('sem360_history', JSON.stringify([{period:'2026-07-10至2026-07-16', cost:4000, conv:30, clicks:500, shows:6000, convKw:{'捷配pcb下单':12,'已流失词':3,'杭州捷配pcb在线下单':5}}]));
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

console.log('\nTEST_PASS');
