/* 压力 / 边界测试：用合成数据把分析引擎推到极端与边界条件，暴露崩溃 / 数值异常 / 逻辑错误。
   覆盖：① 大数据量性能  ② 全零转化（无搜索词也应跑 geo/创意）③ 单行单日
        ④ 仅维度文件(无搜索)→ geo/创意 不应被清空  ⑤ 空 FILES  ⑥ baselineCPA=0 → dev=Infinity
        ⑦ shows=0 行  ⑧ 重复日期跨文件合并  ⑨ 海量关键词 O(n²) 匹配性能
   不依赖用户本机缺失的 CSV。 */
const fs = require('fs');
const NODE = process.argv[2] || 'C:/Users/39747/.workbuddy/binaries/node/versions/22.22.2/node.exe';

/* ---------- 捕获型 DOM stub ---------- */
const _els = {}; const _toasts = [];
function ctx2d(){ return new Proxy({}, { get(t,k){ if(k==='canvas') return {width:900,height:400}; if(k==='measureText') return ()=>({width:10}); return ()=>{}; }, set(){return true;} }); }
function makeEl(id){ let _html=''; const el={ id, style:{}, dataset:{}, disabled:false, value:'', textContent:'',
  classList:{add(){},remove(){},contains(){return false}, toggle(){}}, addEventListener(){}, removeChild(){}, click(){}, options:[],
  querySelector(){return makeEl('qs');}, querySelectorAll(){return [];}, parentElement:{clientWidth:900,clientHeight:400},
  getContext(){return ctx2d();},
  appendChild(c){ if(this.options && c && c.value!==undefined) this.options.push(c); },
  set innerHTML(v){_html=v;}, get innerHTML(){return _html;} }; return el; }
global.document = { getElementById(id){ return _els[id]||(_els[id]=makeEl(id)); }, querySelector(){return makeEl('qs');},
  querySelectorAll(){return [];}, createElement(t){ const c=makeEl(t); c.parentElement={clientWidth:900,clientHeight:400}; return c; },
  addEventListener(){}, removeEventListener(){},   /* v14 图表弹窗在 part5 注册全局 keydown/click，测试壳须提供桩 */
  body:makeEl('body'), documentElement:{ setAttribute(){}, getAttribute(){return 'light';} } };
global.window = { scrollTo(){}, devicePixelRatio:1, addEventListener(){}, removeEventListener(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true; global.fetch = ()=>Promise.reject(new Error('offline test'));
global.getComputedStyle = ()=>({ getPropertyValue:()=>'#16a34a' });
global.Blob = class { constructor(parts){ global.__lastBlob = parts[0]; } };
global.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
global.toast = (m)=>{ _toasts.push(m); };
function loadScript(p){ let code=fs.readFileSync(p,'utf8'); code=code.replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/part3_core.js');
loadScript(__dirname+'/part4_analysis.js');
loadScript(__dirname+'/part5_render.js');
loadScript(__dirname+'/part6_ai.js');
global.toast = (m)=>{ _toasts.push(m); };

let fails=0, checks=0;
function assert(c,m){ checks++; if(!c){ fails++; console.log('  ❌ '+m); throw new Error(m);} else console.log('  ✔ '+m); }
function scanHTML(tag){
  let bad=0, total=0;
  Object.keys(_els).forEach(id=>{ const h=_els[id].innerHTML||''; if(!h) return; total++;
    if(/undefined/.test(h)){ console.log('    ⚠ '+id+' 含字面 "undefined"'); bad++; }
    if(/Infinity%/.test(h)){ console.log('    ⚠ '+id+' 含字面 "Infinity%"'); bad++; }
    if(/NaN%/.test(h)){ console.log('    ⚠ '+id+' 含字面 "NaN%"'); bad++; }
  });
  if(bad) throw new Error(tag+' 渲染 HTML 检出 '+bad+' 处异常字面量 (undefined/Infinity%/NaN%)');
  console.log('  ✔ '+tag+' 渲染 HTML 扫描：'+total+' 个元素，无 undefined/Infinity%/NaN%');
}

/* ============ S1 大数据量性能 + 健全性 ============ */
console.log('\n===== S1 大数据量 (150词×30天 + 全维度) =====');
const D30=[]; for(let i=0;i<30;i++){ const d=new Date(2026,6,1); d.setDate(d.getDate()+i); D30.push(d.toISOString().slice(0,10)); }
function bigSearch(){
  const rows=[];
  for(let k=0;k<150;k++){ const kw='KW'+k; for(let i=0;i<30;i++){ const conv=(k%3===0)?(i%7===0?2:1):(i%11===0?1:0);
    rows.push({date:D30[i],plan:'P'+(k%5),group:'G'+(k%3),kw,query:'q'+kw,title:'t'+kw,mode:(k%2?'精确':'短语'),shows:100+i*3,clicks:10+i,clickrate:0, cost:20+i, conv}); } }
  return rows;
}
const bigFiles=[
  {name:'big_search.csv',type:'search',rows:bigSearch()},
  {name:'big_geo.csv',type:'geo',rows:['广东','浙江','江苏','北京','上海'].flatMap((rg,ri)=>D30.map(d=>({date:d,region:rg,method:'',shows:200+ri*20,clicks:15+ri, cost:30+ri*5, cpc:2})))},
  {name:'big_basic.csv',type:'basic',rows:Array.from({length:150},(_,k)=>D30.map((d,i)=>({date:d,plan:'P'+(k%5),group:'G'+(k%3),title:'tKW'+k,shows:100,clicks:10,cost:20}))).flat()},
  {name:'big_adv.csv',type:'adv',rows:Array.from({length:150},(_,k)=>D30.map((d,i)=>({date:d,plan:'P'+(k%5),group:'G'+(k%3),shows:120,clicks:12,cost:24}))).flat()},
  {name:'big_rank_pc.csv',type:'rank',rows:Array.from({length:150},(_,k)=>D30.map((d,i)=>({date:d,plan:'P'+(k%5),group:'G'+(k%3),kw:'KW'+k,shows:100,clicks:10,cost:20,conv:(i%7===0?2:1),shallow:3,ranks:{'左侧':(2+(i%4)),'计算机':(2.2+(i%4))}}))).flat()},
  {name:'big_rank_mob.csv',type:'rank',rows:Array.from({length:150},(_,k)=>D30.map((d,i)=>({date:d,plan:'P'+(k%5),group:'G'+(k%3),kw:'KW'+k,shows:90,clicks:9,cost:18,conv:(i%7===0?2:1),shallow:2,ranks:{'移动端':(3+(i%4))}}))).flat()},
  {name:'big_hour.csv',type:'hour',rows:[9,10,14,15,20,21,22].flatMap(h=>D30.map(d=>({date:d,hour:h,shows:60,clicks:6,ctr:0.1,cost:12,cpc:2})))},
  {name:'big_invalid.csv',type:'invalid',rows:D30.map(d=>({date:d,before:1000,filtered:200,ratio:20,amount:40}))},
  {name:'big_ocpc.csv',type:'ocpc',rows:D30.map(d=>({date:d,pkg:'包A',shows:1000,clicks:50,ctr:5,cost:200,cpc:4}))}
];
FILES=bigFiles;
let t0=Date.now();
runAnalysis();
let dt=Date.now()-t0;
console.log('  运行耗时: '+dt+'ms | 关键词:'+R.kws.length+' | 转化词:'+R.convKws.length+' | 共变单元:'+R.covar.units.length);
assert(R.kws.length===150, 'S1 关键词数=150 (='+R.kws.length+')');
assert(isFinite(R.tot.cpa), 'S1 总CPA有限 (='+(R.tot.cpa&&R.tot.cpa.toFixed(2))+')');
assert(dt<5000, 'S1 运行耗时 <5s (='+dt+'ms)');
assert(R.rank.devices.includes('移动端'), 'S1 移动端排名设备键被识别');
assert(R.covar.units.length>0, 'S1 共变单元已产出 ('+R.covar.units.length+')');
try{ renderAll(); assert(true,'S1 renderAll 不抛异常'); }catch(e){ assert(false,'S1 renderAll 抛异常: '+e.message); }
scanHTML('S1 大数据渲染');

/* ============ S2 全零转化（每个词 conv=0 但 cost>0）=========== */
console.log('\n===== S2 全零转化（无转化但有消费 + 全维度） =====');
FILES=[
  {name:'zero_search.csv',type:'search',rows:D30.map((d,i)=>({date:d,plan:'P1',group:'G1',kw:'KZ',query:'qz',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:0}))},
  {name:'zero_geo.csv',type:'geo',rows:['广东','浙江'].flatMap(rg=>D30.map(d=>({date:d,region:rg,method:'',shows:100,clicks:10,cost:20,cpc:2})))},
  {name:'zero_basic.csv',type:'basic',rows:D30.map((d,i)=>({date:d,plan:'P1',group:'G1',title:'t',shows:100,clicks:10,cost:20}))},
  {name:'zero_adv.csv',type:'adv',rows:D30.map((d,i)=>({date:d,plan:'P1',group:'G1',shows:120,clicks:12,cost:24}))}
];
runAnalysis();
assert(R.tot.conv===0, 'S2 总转化=0');
assert(R.convKws.length===0, 'S2 无转化关键词');
assert(isFinite(R.tot.cost) && R.tot.cost>0, 'S2 总消费有限为正');
assert(R.coreKws.length===0, 'S2 核心词为空');
assert(R.geo.length>0, 'S2 geo 仍被计算（全零转化不掉geo）— 修复项');
assert(R.creGroups.length>0, 'S2 创意组仍被计算（修复项）');
assert(R.covar && !R.covar.hasAnchor, 'S2 共变无锚点（搜索全零→无搜索锚点，无排名→无锚点）');
assert(R.actions.every(a=>a.act && a.act.length>0), 'S2 操作清单文本非空');
try{ renderAll(); assert(true,'S2 renderAll 不抛异常'); }catch(e){ assert(false,'S2 renderAll 抛异常: '+e.message); }
scanHTML('S2 全零转化渲染');

/* ============ S3 单行单日 ============ */
console.log('\n===== S3 单行单日 =====');
FILES=[{name:'one.csv',type:'search',rows:[{date:'2026-07-06',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:1}]}];
runAnalysis();
assert(R.dates.length===1, 'S3 单日');
assert(R.tot.conv===1, 'S3 单转化');
assert(isFinite(R.stats.fcCPA), 'S3 预测CPA有限');
try{ renderAll(); assert(true,'S3 renderAll 不抛异常'); }catch(e){ assert(false,'S3 renderAll 抛异常: '+e.message); }
scanHTML('S3 单行单日渲染');

/* ============ S4 仅维度文件(无搜索) → geo 不应被清空 ============ */
console.log('\n===== S4 仅 geo 文件(无搜索词) =====');
FILES=[
  {name:'only_geo.csv',type:'geo',rows:['广东','浙江','江苏'].flatMap(rg=>D30.map(d=>({date:d,region:rg,method:'',shows:100,clicks:10,cost:20,cpc:2})))},
  {name:'only_hour.csv',type:'hour',rows:[9,20].flatMap(h=>D30.map(d=>({date:d,hour:h,shows:60,clicks:6,ctr:0.1,cost:12,cpc:2})))},
  {name:'only_invalid.csv',type:'invalid',rows:D30.map(d=>({date:d,before:1000,filtered:200,ratio:20,amount:40}))}
];
runAnalysis();
assert(R.noSearch===true, 'S4 noSearch=true');
assert(R.geo.length>0, 'S4 修复：仅geo文件时 R.geo 已填充（不再被清空）');
assert(R.geoTot.cost>0, 'S4 修复：geoTot.cost 有限为正');
try{ renderGeo(); assert(true,'S4 renderGeo 不抛异常'); }catch(e){ assert(false,'S4 renderGeo 抛异常: '+e.message); }
assert(/广东|浙江|江苏/.test(document.getElementById('geoTable').innerHTML), 'S4 渲染含省份行（修复项）');
console.log('    geo 诊断示例: '+R.geo.slice(0,3).map(g=>g.region+'['+g.diag+']').join(' '));

/* ============ S5 仅 basic+adv(无搜索) → 创意不应被清空 ============ */
console.log('\n===== S5 仅基础+高级创意(无搜索) =====');
FILES=[
  {name:'only_basic.csv',type:'basic',rows:D30.map((d,i)=>({date:d,plan:'P1',group:'G1',title:'TA',shows:100,clicks:10,cost:20}))},
  {name:'only_adv.csv',type:'adv',rows:D30.map((d,i)=>({date:d,plan:'P1',group:'G1',shows:120,clicks:12,cost:24}))}
];
runAnalysis();
assert(R.noSearch===true, 'S5 noSearch=true');
assert(R.creGroups.length>0, 'S5 修复：仅创意文件时 R.creGroups 已填充');
assert(R.advCompare.length>0, 'S5 修复：advCompare 已产出');
try{ renderCreative(); assert(true,'S5 renderCreative 不抛异常'); }catch(e){ assert(false,'S5 renderCreative 抛异常: '+e.message); }

/* ============ S6 空 FILES ============ */
console.log('\n===== S6 空 FILES =====');
FILES=[];
runAnalysis();
assert(R.noSearch===true, 'S6 空文件 → noSearch=true');
assert(R.tot.cost===0, 'S6 总消费=0');
try{ renderAll(); assert(true,'S6 renderAll 不抛异常'); }catch(e){ assert(false,'S6 renderAll 抛异常: '+e.message); }
scanHTML('S6 空文件渲染');

/* ============ S7 baselineCPA=0 → dev 不得为 Infinity ============ */
console.log('\n===== S7 baselineCPA=0 防御（转化日 cost=0） =====');
FILES=[
  {name:'b0.csv',type:'search',rows:[
    {date:'2026-07-06',plan:'P',group:'G',kw:'KA',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:0,conv:2},
    {date:'2026-07-07',plan:'P',group:'G',kw:'KA',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:100,conv:1},
    {date:'2026-07-08',plan:'P',group:'G',kw:'KA',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:50,conv:4}
  ]}
];
runAnalysis();
console.log('   baselineCPA='+R.cpa.baselineCPA+' | dev(07-07)='+(R.cpa.days.find(x=>x.date==='2026-07-07')||{}).dev);
assert(R.cpa.baselineCPA!==null, 'S7 baselineCPA 已计算');
assert(R.cpa.days.every(d=>d.dev===null || isFinite(d.dev)), 'S7 所有 dev 有限或为null（无 Infinity/NaN）');
try{ renderAll(); assert(true,'S7 renderAll 不抛异常'); }catch(e){ assert(false,'S7 renderAll 抛异常: '+e.message); }
scanHTML('S7 baselineCPA=0 渲染');

/* ============ S8 shows=0 / clicks=0 行（CTR/CPC 除零守卫）=========== */
console.log('\n===== S8 shows=0 / clicks=0 行 =====');
FILES=[
  {name:'z.csv',type:'search',rows:[
    {date:'2026-07-06',plan:'P',group:'G',kw:'KZ',query:'q',title:'t',mode:'精确',shows:0,clicks:0,cost:0,conv:0},
    {date:'2026-07-07',plan:'P',group:'G',kw:'KZ',query:'q',title:'t',mode:'精确',shows:100,clicks:0,cost:20,conv:0},
    {date:'2026-07-08',plan:'P',group:'G',kw:'KZ',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:1}
  ]}
];
runAnalysis();
assert(isFinite(R.tot.ctr), 'S8 总CTR有限 (='+(R.tot.ctr!=null?R.tot.ctr.toFixed(4):'null')+')');
assert(R.kws.every(k=>isFinite(k.ctr)&&isFinite(k.cpc||0)), 'S8 关键词 CTR/CPC 有限');
try{ renderAll(); assert(true,'S8 renderAll 不抛异常'); }catch(e){ assert(false,'S8 renderAll 抛异常: '+e.message); }
scanHTML('S8 shows=0 行渲染');

/* ============ S9 重复日期跨文件合并 → 日期唯一 ============ */
console.log('\n===== S9 重复日期跨文件合并 =====');
const base9=D30.slice(0,5).map((d,i)=>({date:d,plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:1}));
FILES=[ {name:'a.csv',type:'search',rows:base9}, {name:'b.csv',type:'search',rows:base9.map(r=>({...r}))} ];
runAnalysis();
assert(R.dates.length===5, 'S9 合并后日期唯一 (='+R.dates.length+')');
assert(R.tot.conv===5, 'S9 转化未翻倍 (='+R.tot.conv+')');

/* ============ S10 海量关键词 O(n²) 匹配性能 ============ */
console.log('\n===== S10 海量关键词(2000)匹配性能 =====');
const D7c=['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12'];
const many=[]; for(let k=0;k<2000;k++){ many.push({date:D7c[k%7],plan:'P'+(k%3),group:'G'+(k%2),kw:'MKW'+k,query:'mq'+k,title:'t'+k,mode:'精确',shows:50,clicks:5,cost:10,conv:(k%50===0?1:0)}); }
FILES=[{name:'many.csv',type:'search',rows:many}];
let t10=Date.now(); runAnalysis(); let dt10=Date.now()-t10;
console.log('  2000词运行耗时: '+dt10+'ms');
assert(dt10<8000, 'S10 2000词运行 <8s (='+dt10+'ms)');
assert(R.kws.length===2000, 'S10 关键词=2000');

/* ============ S11 转化价值列模式（column）与统一客单价模式（unified） ============ */
console.log('\n===== S11 转化价值：列模式 / 统一客单价模式 =====');
// S11a：CSV 含「转化金额」列 → column 模式，rev 取自列
const revCSV = ['时间,推广计划,推广组,创意标题,触发模式,关键词,搜索词,展示次数,点击次数,点击率,总费用,转化数,转化金额']
  .concat(D7c.map((d,i)=>`${d},P,G,t,精确,KW,q,100,10,10%,20,${i%3===0?2:1},${i%3===0?200:100}`)).join('\n');
SET.convValue='';
FILES=[{name:'rev.csv',type:'search',rows:(()=>{const rows=parseCSV(revCSV);return rowsToObjects('search',rows);})()}];
runAnalysis();
assert(R.valueMode==='column', 'S11a 含转化金额列 → valueMode=column (='+R.valueMode+')');
assert(isFinite(R.rev) && R.rev>0, 'S11a R.rev 有限为正 (='+R.rev+')');
assert(R.valueCPA!==null && isFinite(R.valueCPA), 'S11a 价值加权CPA有限');
try{ renderOverview(); assert(true,'S11a renderOverview 不抛异常'); }catch(e){ assert(false,'S11a renderOverview 抛异常: '+e.message); }
// S11b：无转化金额列 + 设置统一客单价 → unified 模式
SET.convValue='100';
FILES=[{name:'nounit.csv',type:'search',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'KW',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:i%3===0?2:1}))}];
runAnalysis();
assert(R.valueMode==='unified', 'S11b 无转化金额列+客单价 → valueMode=unified (='+R.valueMode+')');
assert(Math.abs(R.rev - R.tot.conv*100) < 1e-6, 'S11b R.rev=总转化×客单价 (='+R.rev+', 期望='+(R.tot.conv*100)+')');
assert(isFinite(R.roas), 'S11b ROAS有限');
SET.convValue='';
try{ renderOverview(); assert(true,'S11b renderOverview 不抛异常'); }catch(e){ assert(false,'S11b renderOverview 抛异常: '+e.message); }
scanHTML('S11 价值模式渲染');

/* ============ S12 单日 + 全维度 → 共变大脑（corrOf 需≥3对，单日应安全降级） ============ */
console.log('\n===== S12 单日 + 全维度（共变大脑安全） =====');
FILES=[
  {name:'s1.csv',type:'search',rows:[{date:'2026-07-06',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:3}]},
  {name:'g1.csv',type:'geo',rows:['广东','浙江'].map(rg=>({date:'2026-07-06',region:rg,method:'',shows:100,clicks:10,cost:20,cpc:2}))},
  {name:'r1.csv',type:'rank',rows:[{date:'2026-07-06',plan:'P',group:'G',kw:'K',shows:100,clicks:10,cost:20,conv:3,shallow:2,ranks:{'计算机':2.5,'移动端':3.0}}]},
  {name:'h1.csv',type:'hour',rows:[9,20].map(h=>({date:'2026-07-06',hour:h,shows:50,clicks:5,ctr:0.1,cost:10,cpc:2}))},
  {name:'i1.csv',type:'invalid',rows:[{date:'2026-07-06',before:1000,filtered:200,ratio:20,amount:40}]}
];
runAnalysis();
assert(R.dates.length===1, 'S12 单日');
assert(R.covar && typeof R.covar.hasAnchor==='boolean', 'S12 共变对象产出');
assert(R.covar.units.every(u=>u.drivers && Array.isArray(u.drivers)), 'S12 共变单元 drivers 为数组（单日→Pearson 不足3对→空数组，安全）');
try{ renderAll(); assert(true,'S12 renderAll 不抛异常'); }catch(e){ assert(false,'S12 renderAll 抛异常: '+e.message); }
scanHTML('S12 单日共变渲染');

/* ============ S13 5000 搜索词组 → 匹配度/否词 性能 ============ */
console.log('\n===== S13 5000 搜索词组匹配性能 =====');
const D5=['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10'];
const big5=[]; for(let q=0;q<5000;q++){ big5.push({date:D5[q%5],plan:'P',group:'G',kw:'BASEKW',query:'SEARCHQUERY'+q,title:'t',mode:'短语',shows:10,clicks:1,cost:2,conv:0}); }
FILES=[{name:'q5000.csv',type:'search',rows:big5}];
let t13=Date.now(); runAnalysis(); let dt13=Date.now()-t13;
console.log('  5000组运行耗时: '+dt13+'ms | 查询组数='+R.queries.length+' | 否词='+R.negList.length);
assert(dt13<8000, 'S13 5000搜索词组 <8s (='+dt13+'ms)');
assert(R.queries.length===5000, 'S13 查询组数=5000');

/* ============ S14 无搜索降级 + 导出报告（geo/创意已算，不应崩溃/undefined） ============ */
console.log('\n===== S14 无搜索降级 + 导出报告 =====');
FILES=[
  {name:'only_geo2.csv',type:'geo',rows:['广东','浙江','江苏'].flatMap(rg=>D7c.map(d=>({date:d,region:rg,method:'',shows:100,clicks:10,cost:20,cpc:2})))},
  {name:'only_basic2.csv',type:'basic',rows:D7c.map((d,i)=>({date:d,plan:'P1',group:'G1',title:'TA',shows:100,clicks:10,cost:20}))},
  {name:'only_adv2.csv',type:'adv',rows:D7c.map((d,i)=>({date:d,plan:'P1',group:'G1',shows:120,clicks:12,cost:24}))},
  {name:'only_rank2.csv',type:'rank',rows:D7c.map((d,i)=>({date:d,plan:'P1',group:'G1',kw:'KWX',shows:100,clicks:10,cost:20,conv:2,shallow:1,ranks:{'左侧':2.2,'移动端':3.1}}))},
  {name:'only_invalid2.csv',type:'invalid',rows:D7c.map(d=>({date:d,before:1000,filtered:200,ratio:20,amount:40}))}
];
runAnalysis();
assert(R.noSearch===true, 'S14 noSearch=true');
try{ exportReport(); assert(true,'S14 exportReport 不抛异常'); }catch(e){ assert(false,'S14 exportReport 抛异常: '+e.message); }
const rep14=global.__lastBlob||'';
assert(rep14.includes('地域诊断'), 'S14 导出报告含地域诊断（geo 已算）');
assert(rep14.includes('维度专项诊断'), 'S14 导出报告含维度专项诊断（排名已算）');
assert(!/undefined/.test(rep14), 'S14 导出报告无 undefined');
console.log('   导出报告长度: '+rep14.length+' 字');

/* ============ S15 非数值/脏单元格（N/A、-、空）防御解析 ============ */
console.log('\n===== S15 脏单元格（N/A / 空 / 负号）防御 =====');
const dirtyCSV = ['时间,推广计划,推广组,创意标题,触发模式,关键词,搜索词,展示次数,点击次数,点击率,总费用,转化数']
  .concat([
    '2026-07-06,P,G,t,精确,KW,q,100,10,10%,20,2',
    '2026-07-07,P,G,t,精确,KW,q,N/A,10,10%,-,1',          // shows=N/A, cost=- → 归0
    '2026-07-08,P,G,t,精确,KW,q,100,10,10%,,1',           // cost 空 → 0
    '2026-07-09,P,G,t,精确,KW,q,100,,10%,30,0'            // clicks 空 → 0
  ]).join('\n');
FILES=[{name:'dirty.csv',type:'search',rows:(()=>{const rows=parseCSV(dirtyCSV);return rowsToObjects('search',rows);})()}];
runAnalysis();
assert(R.kws.every(k=>isFinite(k.cost)&&isFinite(k.conv)&&isFinite(k.ctr)), 'S15 脏单元格未产生 NaN 指标');
assert(isFinite(R.tot.cost)&&isFinite(R.tot.conv), 'S15 总KPI有限');
try{ renderAll(); assert(true,'S15 renderAll 不抛异常'); }catch(e){ assert(false,'S15 renderAll 抛异常: '+e.message); }
scanHTML('S15 脏单元格渲染');

/* ============ S16 含转化价值列时导出报告 ============ */
console.log('\n===== S16 含转化价值列 → 导出报告含价值指标 =====');
FILES=[{name:'rev2.csv',type:'search',rows:(()=>{const rows=parseCSV(revCSV);return rowsToObjects('search',rows);})()}];
SET.convValue='';
runAnalysis();
try{ exportReport(); assert(true,'S16 exportReport 不抛异常'); }catch(e){ assert(false,'S16 exportReport 抛异常: '+e.message); }
const rep16=global.__lastBlob||'';
assert(rep16.includes('转化价值')||rep16.includes('收入')||rep16.includes('ROAS'), 'S16 导出报告含价值指标（column 模式）');
assert(!/undefined/.test(rep16), 'S16 导出报告无 undefined');

/* ============ S17 baselineCPA=0（中位数=0，存在零消费转化日）→ 不得误报"转化日不足" ============ */
console.log('\n===== S17 baselineCPA=0 退化基准（真实边界） =====');
FILES=[
  {name:'b0a.csv',type:'search',rows:[
    {date:'2026-07-06',plan:'P',group:'G',kw:'KA',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:0,conv:2},
    {date:'2026-07-07',plan:'P',group:'G',kw:'KA',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:0,conv:1}
  ]}
];
runAnalysis();
console.log('   baselineCPA='+R.cpa.baselineCPA+' | highDays='+JSON.stringify(R.cpa.highDays));
assert(R.cpa.baselineCPA===0, 'S17 baselineCPA 确为 0（中位数退化）');
assert(R.cpa.days.every(d=>d.dev===null||isFinite(d.dev)), 'S17 所有 dev 有限或为null');
try{ renderCpa(); assert(true,'S17 renderCpa 不抛异常'); }catch(e){ assert(false,'S17 renderCpa 抛异常: '+e.message); }
const cpaAlert=document.getElementById('cpa-alerts').innerHTML;
assert(!/转化日不足/.test(cpaAlert), 'S17 修复：不再误报"转化日不足"（应为 ¥0 失真提示）');
assert(/¥0/.test(cpaAlert), 'S17 给出 ¥0 基准失真提示');
assert(!/undefined/.test(cpaAlert) && !/Infinity%/.test(cpaAlert), 'S17 cpa 告警无 undefined/Infinity');

/* ============ S18 无搜索词 → 四象限不应显示 ¥0.00 分界 ============ */
console.log('\n===== S18 无搜索词 → 四象限友好降级 =====');
FILES=[
  {name:'ns_geo.csv',type:'geo',rows:['广东','浙江'].flatMap(rg=>D7c.map(d=>({date:d,region:rg,method:'',shows:100,clicks:10,cost:20,cpc:2})))},
  {name:'ns_basic.csv',type:'basic',rows:D7c.map((d,i)=>({date:d,plan:'P1',group:'G1',title:'TA',shows:100,clicks:10,cost:20}))}
];
runAnalysis();
assert(R.noSearch===true, 'S18 noSearch=true');
try{ renderQuad(); assert(true,'S18 renderQuad 不抛异常'); }catch(e){ assert(false,'S18 renderQuad 抛异常: '+e.message); }
const qt=document.getElementById('quad-thresh').textContent;
console.log('   quad-thresh="'+qt+'"');
assert(/未提供搜索词报告/.test(qt), 'S18 四象限提示"未提供搜索词报告"（不再显示 ¥0.00 阈值）');
assert(!/¥0\.00/.test(qt), 'S18 修复：阈值不再显示 ¥0.00');
assert(/未提供搜索词报告/.test(document.getElementById('kwTable').innerHTML), 'S18 关键词表为空占位文案');

/* ============ S19 主题切换重绘图表（深色/浅色）不抛异常 ============ */
console.log('\n===== S19 主题切换重绘图表 =====');
FILES=[
  {name:'th.csv',type:'search',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:i%2?1:0}))},
  {name:'th_geo.csv',type:'geo',rows:['广东','浙江'].flatMap(rg=>D7c.map(d=>({date:d,region:rg,method:'',shows:100,clicks:10,cost:20,cpc:2})))},
  {name:'th_rank.csv',type:'rank',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'K',shows:100,clicks:10,cost:20,conv:1,shallow:1,ranks:{'左侧':2.3,'移动端':3.1}}))}
];
runAnalysis();
let threw=false;
try{
  if(typeof drawDailyChart==='function') drawDailyChart();
  if(typeof drawGeoChart==='function') drawGeoChart();
  if(typeof drawCpaChart==='function') drawCpaChart();
  if(typeof toggleTheme==='function') toggleTheme();   // → dark
  if(typeof drawDailyChart==='function') drawDailyChart();
  if(typeof drawCpaChart==='function') drawCpaChart();
  if(typeof toggleTheme==='function') toggleTheme();   // → light
  if(typeof redrawActiveCharts==='function') redrawActiveCharts();
}catch(e){ threw=true; console.log('   ❌ 重绘抛异常: '+e.message); }
assert(!threw, 'S19 主题切换 + 图表重绘不抛异常');

/* ============ S20 排名设备边界：仅移动端 / 无任何排序列 ============ */
console.log('\n===== S20 排名设备边界（仅移动端 / 无排序列） =====');
FILES=[
  {name:'mob.csv',type:'search',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'KM',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:i%3?1:0}))},
  {name:'rk_mob_only.csv',type:'rank',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'KM',shows:100,clicks:10,cost:20,conv:1,shallow:1,ranks:{'移动端':3.0}}))},
  {name:'rk_no_col.csv',type:'rank',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'KN',shows:100,clicks:10,cost:20,conv:0,shallow:0,ranks:{}}))}
];
runAnalysis();
assert(R.rank.devices.includes('移动端'), 'S20 识别移动端设备键');
assert(R.rank.diag.some(d=>d.mobile), 'S20 存在仅移动端排名判定');
assert(R.rank.diag.every(d=> (d.pc&&d.pc.val!=null) || (d.mobile&&d.mobile.val!=null) || d.primary===null), 'S20 每词 pc/mobile 至少一端有效或 primary=null（无 undefined 判定）');
try{ renderDiag(); assert(true,'S20 renderDiag 不抛异常'); }catch(e){ assert(false,'S20 renderDiag 抛异常: '+e.message); }
const diagHtml=document.getElementById('diagRank').innerHTML;
assert(!/undefined/.test(diagHtml), 'S20 排名诊断表无 undefined（无排序列词 primary=null → 显示"—"）');

/* ============ S21 大体量地域（34省×30天）性能 + 渲染 ============ */
console.log('\n===== S21 大体量地域（34×30） =====');
const PROV=['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆','台湾','香港','澳门'];
FILES=[
  {name:'big_geo2.csv',type:'geo',rows:PROV.flatMap((rg,ri)=>D30.map(d=>({date:d,region:rg,method:'',shows:200+ri*10,clicks:15+ri, cost:30+ri*3, cpc:2})))},
  {name:'bg_search.csv',type:'search',rows:D30.map((d,i)=>({date:d,plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:i%3?1:0}))}
];
let t21=Date.now(); runAnalysis(); let dt21=Date.now()-t21;
console.log('   34省×30天 运行耗时: '+dt21+'ms | 地域行:'+R.geo.length);
/* v16 修正陈旧断言：v12 起 analyzeGeo 按「省|市」聚合键输出聚合实体（本例无市级列→34省），
   而非逐日行；旧断言 34×30 是 v11 前的逐日设计残留（本套件因壳缺 addEventListener 桩长期未跑，未随重构更新） */
assert(R.geo.length===PROV.length, 'S21 地域聚合实体=34省 ('+R.geo.length+'行，省|市聚合口径)');
assert(dt21<4000, 'S21 大体量地域运行 <4s (='+dt21+'ms)');
try{ renderGeo(); assert(true,'S21 renderGeo 不抛异常'); }catch(e){ assert(false,'S21 renderGeo 抛异常: '+e.message); }
scanHTML('S21 大体量地域渲染');

/* ============ S22 预测"后半段"窗口（修复 off-by-one：奇数日应取 ⌈n/2⌉ 天） ============ */
console.log('\n===== S22 预测后半段窗口（n=3） =====');
FILES=[{name:'fc.csv',type:'search',rows:[
  {date:'2026-07-06',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:2},
  {date:'2026-07-07',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:4},
  {date:'2026-07-08',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:6}
] } ];
runAnalysis();
console.log('   n=3, 后半段应取最后2天(conv 4+6=10, 日均5), fcConv='+R.stats.fcConv+' (期望15, 旧逻辑=18)');
assert(R.stats.fcConv===15, 'S22 预测取"后半段"最后2天（ceil(3/2)=2）→ fcConv=15 (=5×3)，非旧逻辑的18');
assert(R.stats.n===3, 'S22 n=3');

/* ============ S23 设备端识别（文件名 + 表头双轨，跨维度作用域） ============ */
console.log('\n===== S23 设备端识别（文件名/表头，跨维度） =====');
// 仅移动端：文件名含「移动端」，geo/kw 非排名维度也应被识别为 mobile，且每行带 device 标签
FILES=[
  {name:'地域分析报告(移动端).csv',type:'geo',rows:D7c.map(d=>({date:d,region:'广东',method:'',shows:100,clicks:10,cost:20,cpc:2}))},
  {name:'关键词报告(移动端).csv',type:'kw',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'K',shows:100,clicks:10,ctr:10,cost:20,cpc:2}))}
];
runAnalysis();
assert(R.deviceScope==='mobile', 'S23 文件名含「移动端」→ 设备作用域=mobile (实='+R.deviceScope+')');
assert(RAW.geo.every(r=>r.device==='mobile'), 'S23 各 geo 行带 device=mobile（跨维度设备标签）');
assert(RAW.kw.every(r=>r.device==='mobile'), 'S23 各 kw 行带 device=mobile');
// 仅 PC：文件名含「PC」
FILES=[{name:'地域分析报告(PC).csv',type:'geo',rows:D7c.map(d=>({date:d,region:'广东',method:'',shows:100,clicks:10,cost:20,cpc:2}))}];
runAnalysis();
assert(R.deviceScope==='pc', 'S23 文件名含「PC」→ 设备作用域=pc (实='+R.deviceScope+')');
// 混合：移动 + PC → both
FILES=[
  {name:'地域分析报告(移动端).csv',type:'geo',rows:D7c.map(d=>({date:d,region:'广东',method:'',shows:100,clicks:10,cost:20,cpc:2}))},
  {name:'地域分析报告(PC).csv',type:'geo',rows:D7c.map(d=>({date:d,region:'浙江',method:'',shows:100,clicks:10,cost:20,cpc:2}))}
];
runAnalysis();
assert(R.deviceScope==='both', 'S23 移动+PC 文件 → 设备作用域=both (实='+R.deviceScope+')');
// 未识别：文件名无设备信号 → unknown + 计数
FILES=[{name:'地域分析报告.csv',type:'geo',rows:D7c.map(d=>({date:d,region:'广东',method:'',shows:100,clicks:10,cost:20,cpc:2}))}];
runAnalysis();
/* v16 修正陈旧断言：detectCoverage 现行语义（v11+）—无任何设备拆分信号 = 该账户导出为 PC+移动
   合并口径 → deviceScope='combined'（非 'unknown'）；unknown 仅作为单文件标记进 deviceUnknown 计数 */
assert(R.deviceScope==='combined', 'S23 无设备信号文件名 → 设备作用域=combined合并口径 (实='+R.deviceScope+')');
assert(R.deviceUnknown===1, 'S23 deviceUnknown 计数=1 (实='+R.deviceUnknown+')');
// 表头信号：rank 的 ranks{移动端} 键 → mobile（即使文件名无设备词，对象行亦可识别）
FILES=[{name:'关键词报告(5).csv',type:'rank',rows:D7c.map((d,i)=>({date:d,plan:'P',group:'G',kw:'K',shows:100,clicks:10,cost:20,conv:1,shallow:1,ranks:{'移动端':3.0}}))}];
runAnalysis();
assert(R.deviceScope==='mobile', 'S23 表头 ranks{移动端} → 设备作用域=mobile (实='+R.deviceScope+')');
try{ renderWorkflow(); assert(true,'S23 renderWorkflow 含设备块不抛异常'); }catch(e){ assert(false,'S23 renderWorkflow 抛异常: '+e.message); }
const wfH=document.getElementById('workflow').innerHTML;
assert(/设备端识别/.test(wfH), 'S23 覆盖卡渲染出「设备端识别」块');
assert(!/undefined/.test(wfH), 'S23 覆盖卡无 undefined');

console.log('\n'+(fails===0?'STRESS_PASS ✅ ('+checks+' 项检查)':'STRESS_FAIL ❌ ('+fails+'/'+checks+' 失败)'));
process.exit(fails===0?0:1);
