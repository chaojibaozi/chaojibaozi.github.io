/* 中信建投 全维度离线验证 runner：加载全部 12 文件 → runAnalysis → 逐维度 dump + 设备分布 + 错误捕获 */
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
  code = code.replace(/^(let|const) /gm,'var ');
  (0,eval)(code);
}
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/part4_analysis.js');

const dir = __dirname + '/../testdata/中信建投/';
const names = fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort();
console.log('== 载入', names.length, '个文件 ==');
let detectFail = [];
names.forEach(name=>{
  const text = fs.readFileSync(dir+name,'utf8');
  const rows = parseCSV(text);
  const type = detectType(rows[0], name);
  if(!type){ console.log('❌ 无法识别:', name); detectFail.push(name); return; }
  FILES.push({name, type, rows: rowsToObjects(type, rows), device: detectDevice(name, rows), header: rows[0].map(x=>x.trim())});
  console.log('✔', type.padEnd(6), '| dev=', (detectDevice(name,rows)||'unknown').padEnd(7), '|', rows.length-1, '行 |', name);
});

if(detectFail.length){ console.log('⚠️ 有文件未识别:', detectFail.join(',')); }

console.log('\n== 运行 runAnalysis ==');
try {
  runAnalysis();
  console.log('runAnalysis 完成，无异常');
} catch(e){
  console.log('❌ runAnalysis 抛错:', e.message);
  console.log(e.stack.split('\n').slice(0,6).join('\n'));
  process.exit(1);
}

console.log('\n===== 全局 =====');
console.log('周期:', R.period, '| 日期数:', R.dates.length, '| noSearch=', R.noSearch);
console.log('总消费:', R.tot.cost.toFixed(2), '| 总点击:', R.tot.clicks, '| 总展现:', R.tot.shows, '| 总转化(深层):', R.tot.conv, '| CPA:', (R.tot.cpa||0).toFixed(2));
console.log('目标CPA基准:', (R.targetCPA||0).toFixed(2), '| 高消费分界:', (R.highCost||0).toFixed(2));

// 设备分布（search）
const devDist = {};
RAW.search.forEach(r=>{ const d=r.device||'无'; devDist[d]=devDist[d]||{cost:0,clicks:0,conv:0,n:0}; devDist[d].cost+=r.cost; devDist[d].clicks+=r.clicks; devDist[d].conv+=r.conv; devDist[d].n++; });
console.log('\n== 搜索词 设备分布 ==');
Object.keys(devDist).forEach(d=>console.log(`  ${d}: 行数=${devDist[d].n} 消费=¥${devDist[d].cost.toFixed(0)} 点击=${devDist[d].clicks} 深层转化=${devDist[d].conv}`));
const searchTot = RAW.search.reduce((s,r)=>s+r.cost,0);
console.log('  搜索词总消费(原始累加): ¥'+searchTot.toFixed(0));

console.log('\n== 覆盖检测 ==');
const cov=R.coverage;
console.log('已载入:', cov.typesPresent.join(','));
console.log('可运行模块:', cov.readyCount+'/'+cov.total, '| 列表:', cov.modules.filter(m=>m.ready).map(m=>m.id).join(','));

console.log('\n== 四象限 ==');
const qc={}; R.kws.forEach(k=>qc[k.quad]=(qc[k.quad]||0)+1);
console.log('分布:', JSON.stringify(qc), '| 关键词数:', R.kws.length);
console.log('B象限TOP5:', R.kws.filter(k=>k.quad==='B').sort((a,b)=>b.cost-a.cost).slice(0,5).map(k=>k.kw+'¥'+k.cost.toFixed(0)).join(', '));

console.log('\n== 转化词 ==');
console.log('转化词数:', R.convKws.length, '| 核心词:', R.coreKws.join(', '));
console.log('convKws:', R.convKws.map(k=>`${k.kw}(${k.conv}转,${k.status})`).join(', '));

console.log('\n== 否词 / 加词 ==');
console.log('否词:', R.negList.length, '个 浪费¥'+R.negList.reduce((s,q)=>s+q.cost,0).toFixed(2), '| TOP:', R.negList.slice(0,6).map(q=>q.query).join(' | '));
console.log('加词:', R.addList.length, '个');

console.log('\n== 匹配模式 ==');
if(R.matchMode && R.matchMode.has){ console.log('overBroad(建议收紧):', R.matchMode.overBroad.map(m=>m.mode).join(',')||'(无)'); console.log('bestCPA:', R.matchMode.bestCPA, '| bestModeWaste(仅否词清理):', (R.matchMode.bestModeWaste||[]).map(m=>m.mode+'('+(m.zeroConvCostShare*100).toFixed(0)+'%)').join(',')||'(无)'); 
  console.log('modeStats 明细:'); (R.matchMode.modes||[]).forEach(m=>console.log('    '+m.mode+': cost¥'+(m.cost||0).toFixed(0)+' conv='+(m.conv||0)+' cpa='+(m.cpa!=null?m.cpa.toFixed(1):'null')+' spendShare='+((m.spendShare||0)*100).toFixed(0)+'% zeroConvCostShare='+((m.zeroConvCostShare||0)*100).toFixed(0)+'%'));
  console.log('note:', R.matchMode.note); } else console.log('matchMode: 无');

console.log('\n== 地域 ==');
console.log('地域诊断数:', R.geo.length, '| 样例:', R.geo.slice(0,6).map(g=>g.region+'['+g.diag+']').join(', '));

console.log('\n== 分时 ==');
console.log('hour.has:', !!R.hour?.has, '| 时段数:', R.hour?.byHour?.length, '| worst:', R.hour?.worst?.length);
if(R.hour?.has){
  const byH=R.hour.byHour.slice().sort((a,b)=>b.cost-a.cost);
  console.log('  高消费时段TOP5:', byH.slice(0,5).map(o=>o.hour+':00 ¥'+o.cost.toFixed(0)+'/'+o.clicks+'击').join(' | '));
  const mults={}; R.hour.byHour.forEach(o=>{ const l=o.bidLabel||(o.bidMult==null?'?':o.bidMult); mults[l]=(mults[l]||0)+1; });
  console.log('  出价系数分布:', JSON.stringify(mults));
  console.log('  worst样例:', (R.hour.worst||[]).slice(0,4).map(o=>o.hour+':00 CTR'+(o.ctr*100).toFixed(1)+'% ¥'+o.cost.toFixed(0)).join(' | '));
}

console.log('\n== 无效点击 ==');
console.log('invalid.has:', !!R.invalid?.has, '| 均值过滤比:', (R.invalid?.avgRatio||0).toFixed(1)+'%', '| flags:', R.invalid?.flags?.length);

console.log('\n== oCPC ==');
console.log('ocpc.has:', !!R.ocpc?.has, '| 投放包:', R.ocpc?.pkgs?.length, '| 学习期:', R.ocpc?.learning);
console.log('  totalDeep(深层转化):', R.ocpc?.totalDeep, '| totalShallow(浅层):', R.ocpc?.totalShallow, '| 消耗:', (R.ocpc?.totalCost||0).toFixed(2));
(R.ocpc?.pkgs||[]).forEach(p=>console.log('   包「'+p.pkg+'」: 深层'+p.deep+' 浅层'+p.shallow+' CPA¥'+(p.deepCPA?p.deepCPA.toFixed(1):'-')+' 阶段'+p.phases.join('/')+' 设备'+p.devs.join('/')));

console.log('\n== 排名 ==');
console.log('rank.has:', !!R.rank?.has, '| 诊断数:', R.rank?.diag?.length, '| 设备:', JSON.stringify(R.rank?.devices));

console.log('\n== 创意 ==');
console.log('基础创意组:', R.basic?.length, '| 低效:', R.weakCre?.length, '| 高级:', R.adv?.length, '| advCompare:', R.advCompare?.length);

console.log('\n== 共变大脑 ==');
console.log('covar.has:', !!R.covar?.has, '| 单元:', R.covar?.units?.length, '| 空转:', (R.covar?.emptyRuns||[]).length);

console.log('\n== convDaily (v9/v10) ==');
if(R.convDaily && R.convDaily.has){
  console.log('日均转化词:', R.convDaily.avgDailyConvKw?.toFixed(1), '| 累计新增/流失:', R.convDaily.totalNew+'/'+R.convDaily.totalLost);
  console.log('流失核心词仍在烧钱:', (R.convDaily.lostStillSpending||[]).length, '| 间断核心词:', (R.convDaily.flickerCore||[]).length);
  console.log('生命周期条目:', (R.convDaily.lifecycle||[]).length, '| 联动命中:', (R.convDaily.lostCoreLink||[]).length);
} else console.log('convDaily: 无');

console.log('\n== 操作清单 ==');
console.log('总数:', R.actions.length, '| P0:', R.actions.filter(a=>a.p===0).length, 'P1:', R.actions.filter(a=>a.p===1).length, 'P2:', R.actions.filter(a=>a.p===2).length);
console.log('P0 动作:');
R.actions.filter(a=>a.p===0).forEach(a=>console.log('  [P0]['+a.mod+']', a.act.slice(0,120)));

console.log('\nZXTJ_PASS');
