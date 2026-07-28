/* v8 针对性验证：确认新增字段在真实数据上真正产出（非仅不崩溃） */
const fs = require('fs');
const path = require('path');
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl(), documentElement:null };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));
function loadScript(p){ (0,eval)(fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var ')); }
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{}; global.showResultUI=()=>{}; global.switchTab=()=>{}; global.toast=()=>{};
global.saveSnapshot=()=>{}; global.findPrev=()=>null;
loadScript(__dirname+'/part4_analysis.js');

const DIR = path.join(__dirname,'..','testdata') + '/';
const all = fs.readdirSync(DIR).filter(f=>f.startsWith('xc捷配') && (f.endsWith('.csv')||/^[^.]+$/.test(f)));
all.forEach(f=>{
  const fp = DIR+f;
  const buf = fs.readFileSync(fp);
  const rows = parseCSV(decodeCsv(buf));
  const type = detectType(rows[0], f);
  const objs = rowsToObjects(type, rows);
  const dev = detectDevice(f, rows);
  FILES.push({name:f, type, rows:objs, device:dev});
});
console.log('已载入 xc 文件', FILES.length, '个:', FILES.map(x=>x.type).join(','));
runAnalysis();
console.log('=== 触发模式效率 (analyzeMatchMode) ===');
console.log('has=', R.matchMode.has, '| overBroad=', JSON.stringify(R.matchMode.overBroad.map(m=>({mode:m.mode,spend:(m.spendShare*100).toFixed(0)+'%',conv:(m.convShare*100).toFixed(0)+'%',cpa:m.cpa})), null, 0));
console.log('modes:', R.matchMode.modes.map(m=>`${m.mode}(消费¥${fmt(m.cost,0)},转化${m.conv},CPA${m.cpa!=null?'¥'+fmt(m.cpa,1):'—'},CTR${pct(m.ctr)},匹配均分${Math.round(m.avgScore)})`).join('\n        '));
console.log('note:', R.matchMode.note);

console.log('\n=== 否词分级 (negList) ===');
console.log('总数=', R.negList.length, '| P0=', R.negList.filter(q=>q.severity==='P0').length, '| 短语否定=', R.negList.filter(q=>q.negType==='短语否定').length, '| 精确否定=', R.negList.filter(q=>q.negType==='精确否定').length);
console.log('样本:', R.negList.slice(0,6).map(q=>`${q.query}[${q.negType}/${q.severity}] ¥${fmt(q.cost)} 触发:${q.modes.join('/')||'—'}`).join('\n      '));

console.log('\n=== 分时出价系数 (analyzeHour.bidMult) ===');
R.hour.byHour.slice(0,6).forEach(h=> console.log(`  ${h.hour}: CTR=${pct(h.ctr)} 消费¥${fmt(h.cost,0)} → 系数${h.bidMult}(${h.bidLabel})`));
console.log('worst(零点击高消费已纳入):', R.hour.worst.slice(0,3).map(h=>`${h.hour}(CTR${pct(h.ctr)},¥${fmt(h.cost,0)},系数${h.bidMult})`).join('、'));

console.log('\n=== 地域出价系数 (analyzeGeo.bidCoef) ===');
R.geo.slice(0,6).forEach(g=> console.log(`  ${g.region}: CTR=${pct(g.ctr)} CPC¥${fmt(g.cpc,1)} ${g.diag} → 系数${g.bidCoef}(${g.bidLabel})`));

console.log('\n=== 统一操作清单中关于新维度的条目 ===');
console.log(R.actions.filter(a=>/匹配模式|否词|时段出价|地域出价|短语否定|精确否定/.test(a.act)).map(a=>`[P${a.p}|${a.mod}] ${a.act}`).join('\n'));

console.log('\n=== 分日转化关键词日度变化追踪 (analyzeConvKeywordDaily · v9) ===');
const cd=R.convDaily;
console.log('has=', cd.has, '| 天数=', cd.dates.length, '| 日均转化词数=', cd.avgDailyConvKw.toFixed(1));
console.log('累计逐日新增=', cd.totalNew, '| 累计流失=', cd.totalLost, '| Top3集中度 前半', (cd.firstShare*100).toFixed(0)+'% → 后半', (cd.lastShare*100).toFixed(0)+'% ('+cd.concTrend+')');
console.log('每日 churn 表（日期 | 转化词数 | Top3集中度 | 核心词在场 | +新增/-流失 | 上升/下降）:');
cd.daily.forEach((d,i)=>{ const c=i>0?cd.churn[i-1]:null;
  console.log(`  ${d.date.slice(5)}: n=${d.count} top3=${(d.top3Share*100).toFixed(0)}% core=${d.coreCount}/${d.coreTotal} ${c?('+'+(c.gained.length)+'/'+(-c.lost.length)+' ↑'+(c.rising.length)+'↓'+(c.falling.length)):'—'}`);
});
console.log('流失核心词仍在烧钱 (P1 预警):', cd.lostStillSpending.length, '个');
cd.lostStillSpending.slice(0,8).forEach(c=> console.log(`  🚨 ${c.kw}: 曾${c.convTotal}转, 近3日¥${fmt(c.recentCost,0)}消费, ${c.daysSinceConv}日无转化`));
console.log('间断核心词:', cd.flickerCore.length, '个 →', cd.flickerCore.slice(0,8).map(c=>`${c.kw}(${c.presentDays}/${cd.dates.length}日)`).join('、'));
console.log('convDaily 相关操作清单:');
console.log(R.actions.filter(a=>a.mod==='转化词' && /日度变化|流失核心词|间断|集中度/.test(a.act)).map(a=>`[P${a.p}|${a.mod}] ${a.act}`).join('\n'));

console.log('\n=== v10：转化词生命周期时间线 + 流失核心词×共变联动 ===');
const lc=cd.lifecycle||[];
const dead=lc.filter(l=>!l.active);
console.log('维度可用：排名文件='+cd.hasRankData+' | 关键词CTR='+cd.hasKwCtrData+' | 无效点击='+cd.hasInvalidData);
console.log('生命周期：在产', lc.length-dead.length, '个 / 已流失', dead.length, '个；最长', Math.max.apply(null,lc.map(l=>l.lifespanDays)), '天，最短', Math.min.apply(null,lc.map(l=>l.lifespanDays)), '天');
console.log('生命周期时间线（Top 12，核心词优先）:');
lc.slice().sort((a,b)=>((R.coreKws.includes(b.kw)?1:0)-(R.coreKws.includes(a.kw)?1:0))||b.totalConv-a.totalConv).slice(0,12)
  .forEach(l=> console.log(`  ${l.active?'在产':'流失'} ${l.kw}: 首发${l.firstDate.slice(5)} 峰值${l.peakDate.slice(5)}(${l.peakConv}) 末次${l.lastConvDate.slice(5)} 流失${l.lossDate?l.lossDate.slice(5):'—'} 生命${l.lifespanDays}天 末次衰减${(l.fadePct*100).toFixed(0)}%`));
console.log('流失核心词×共变联动（事件研究，相关性非因果）:', cd.lostCoreLink.length, '个');
cd.lostCoreLink.forEach(x=> console.log(`  🔗 ${x.kw} 于 ${x.lastConvDate.slice(5)} 断流(生命${x.lifecycleDays}天,累计${x.totalConv}转) 同步劣化：${x.signals.map(s=>s.txt).join('；')}`));
console.log('联动相关操作清单:');
console.log(R.actions.filter(a=>a.mod==='转化词' && /生命周期|断流|同步劣化|共变/.test(a.act)).map(a=>`[P${a.p}|${a.mod}] ${a.act}`).join('\n'));

