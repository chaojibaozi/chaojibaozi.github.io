/* 鲁棒性探针：向完整引擎喂入病理/边界数据，检测崩溃、NaN/Infinity 泄漏、错误标签
 * 复用 period_test 的 DOM shim + loadScript 模式。仅做只读式探测，不改源码。
 */
const fs = require('fs');
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ return t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
const alertModal = { classList:{ add(){}, remove(){}, contains(){return false} }, style:{} };
global.document = { getElementById:id=>{ if(id==='dataAlertModal') return alertModal; return dummyEl(); }, querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl(), documentElement:null, addEventListener(){}, removeEventListener(){} };
global.window = { scrollTo(){}, addEventListener(){}, removeEventListener(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));
function loadScript(p){ let code = fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/../src/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/../src/part4_analysis.js');
const TOASTS=[]; global.toast = m=>TOASTS.push(m);

function days(start,n){ const out=[]; let [y,m,d]=start.split('-').map(Number); for(let i=0;i<n;i++){ out.push(y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')); d++; const dim=new Date(y,m,0).getDate(); if(d>dim){d=1;m++;} if(m>12){m=1;y++;} } return out; }

const FAILS=[];
function scanNaN(obj, path){
  if(obj===null||obj===undefined) return;
  if(typeof obj==='number'){ if(!isFinite(obj)) FAILS.push('NaN/Infinity @ '+path+' = '+obj); return; }
  if(typeof obj==='string'){ if(obj==='NaN'||obj==='Infinity'||obj==='-Infinity') FAILS.push('字面量 '+obj+' @ '+path); return; }
  if(Array.isArray(obj)){ obj.forEach((v,i)=>scanNaN(v,path+'['+i+']')); return; }
  if(typeof obj==='object'){ for(const k of Object.keys(obj)) scanNaN(obj[k], path+'.'+k); }
}
function runCase(name, files){
  FILES.length=0; TOASTS.length=0; R=null; PERIOD_ACK=true;   // PERIOD_ACK 跳过周期拦截，专测数学鲁棒性
  files.forEach(f=>FILES.push(f));
  let threw=null;
  try{ runAnalysis(); }catch(e){ threw=(e&&e.stack)||String(e); }
  if(threw){ FAILS.push('【'+name+'】抛出异常: '+threw.split('\n')[0]); return {threw:true}; }
  scanNaN(R, 'R');
  // 文本层再扫一遍（render 前 JSON 序列化常漏不出来的字面量）
  const s = JSON.stringify(R||{});
  if(s.includes('NaN')||s.includes('Infinity')) FAILS.push('【'+name+'】JSON 含 NaN/Infinity 字面量');
  return {threw:false, R};
}

const P7 = days('2026-07-01',7);

/* 1) 单日搜索词（n=1）→ corrOf 须全部 NaN（无崩溃） */
const singleDay = [{name:'search_1d.csv', type:'search', device:'unknown', rows:P7.slice(0,1).map(d=>({date:d,plan:'P',group:'G',title:'T',mode:'精确',kw:'词A',query:'词A价格',shows:1000,clicks:40,cost:120,conv:3}))}];
runCase('单日搜索词(n=1)', singleDay);

/* 2) 7日 转化全恒定（conv 全等）→ pearson dy=0 → NaN（无虚假±1） */
const constConv = [{name:'search_const.csv', type:'search', device:'unknown', rows:P7.map((d,i)=>({date:d,plan:'P',group:'G',title:'T',mode:'精确',kw:'词A',query:'词A价格',shows:1000+i*10,clicks:40+i, cost:120+i*5, conv:3}))}];
const r2 = runCase('转化全恒定(7d)', constConv);

/* 3) 7日 零转化搜索词 → CPA 须为 null，无 Infinity；covar 无锚点 */
const zeroConv = [{name:'search_zero.csv', type:'search', device:'unknown', rows:P7.map((d,i)=>({date:d,plan:'P',group:'G',title:'T',mode:'精确',kw:'词A',query:'词A价格',shows:1000,clicks:40,cost:120,conv:0}))}];
const r3 = runCase('零转化(7d)', zeroConv);

/* 4) 极端离群日：第4日 cost×100、conv 同 → CPA 离群但不崩 */
const outlier = [{name:'search_out.csv', type:'search', device:'unknown', rows:P7.map((d,i)=>{ const big = i===3; return {date:d,plan:'P',group:'G',title:'T',mode:'精确',kw:'词A',query:'词A价格',shows:big?100000:1000,clicks:big?4000:40,cost:big?12000:120,conv:big?3:3}; })}];
const r4 = runCase('极端离群日', outlier);

/* 5) 仅地域（无搜索词/排名）→ 走 analyzeGeo 降级，无崩溃 */
const geoOnly = [{name:'geo.csv', type:'geo', device:'unknown', rows:P7.map(d=>({date:d,region:'广东省',city:'深圳市',method:'IP定位',shows:600,clicks:22,cost:70}))}];
runCase('仅地域', geoOnly);

/* 6) 仅排名（无搜索词）→ 回退排名自带转化排序诊断，无崩溃 */
const rankOnly = [{name:'rank.csv', type:'rank', device:'unknown', rows:P7.map(d=>({date:d,plan:'P',group:'G',kw:'词A',shows:700,clicks:26,cost:85,cpc:3.2,conv:2,shallow:1,ranks:{'计算机':1.5,'移动':2.1}}))}];
const r6 = runCase('仅排名', rankOnly);

/* 7) 仅 oCPC（无搜索词/排名）→ 账户级锚点，无崩溃 */
const ocpcOnly = [{name:'ocpc.csv', type:'ocpc', device:'unknown', rows:P7.map((d,i)=>({date:d,pkg:'包1',phase:'二阶',dev:'全部',shows:2000,clicks:70,ctr:3.5,cost:260,cpc:3.7,shallow:4+(i%2),deep:2,shallowCost:50,deepCost:120}))}];
const r7 = runCase('仅oCPC', ocpcOnly);

/* 8) 全零展现（shows=0 → CTR=null，无除零） */
const zeroShow = [{name:'search_zs.csv', type:'search', device:'unknown', rows:P7.map(d=>({date:d,plan:'P',group:'G',title:'T',mode:'精确',kw:'词A',query:'词A价格',shows:0,clicks:0,cost:120,conv:3}))}];
runCase('全零展现(shows=0)', zeroShow);

/* ---- 汇总断言 ---- */
console.log('\n===== 鲁棒性探针结果 =====');
if(FAILS.length){ console.log('FAIL ('+FAILS.length+'):'); FAILS.forEach(f=>console.log('  ✗ '+f)); }
else console.log('PASS：所有病理/边界场景均未崩溃、未泄漏 NaN/Infinity、未产生虚假标签');

console.log('\n--- 关键场景核对（人工可读）---');
console.log('转化全恒定 covar.note:', r2.R && r2.R.covar && r2.R.covar.note ? r2.R.covar.note.slice(0,60)+'...' : '(无)');
console.log('零转化 R.cpa:', r3.R && r3.R.cpa);
console.log('零转化 covar.hasAnchor:', r3.R && r3.R.covar && r3.R.covar.hasAnchor);
console.log('仅排名 diag 数:', r6.R && r6.R.rank && r6.R.rank.diag && r6.R.rank.diag.length);
console.log('仅oCPC covar.hasAnchor:', r7.R && r7.R.covar && r7.R.covar.hasAnchor);
console.log('\n'+(FAILS.length? 'ROBUST_FAIL':'ROBUST_PASS'));
