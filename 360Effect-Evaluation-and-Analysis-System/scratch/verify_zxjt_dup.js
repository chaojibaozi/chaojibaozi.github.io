/* 复现 v11 中信建投场景：两份搜索词报告（一份含触发模式，一份含创意类型），
   验证它们是否为"同一数据的两种列集导出"（同传会双计），并测各方案口径。 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='D:\\BianCheng\\360效果评估分析系统 - 副本 (3)';
const TD=path.join(ROOT,'testdata','中信建投');
const sandbox={ console, localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>({addEventListener:()=>{},style:{},classList:{add:()=>{},remove:()=>{}},value:'',textContent:'',innerHTML:''}),querySelectorAll:()=>[],querySelector:()=>null,documentElement:{setAttribute:()=>{},getAttribute:()=>null},addEventListener:()=>{}},
  window:{scrollTo:()=>{}}, TextDecoder, global:{} };
sandbox.global=sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'src','part3_core.js'),'utf8'), sandbox);
const { parseCSV, decodeCsv, rowsToObjects } = sandbox;
function load(fn,type){ const rows=parseCSV(decodeCsv(fs.readFileSync(path.join(TD,fn)))); return {objs:rowsToObjects(type||'search',rows), header:rows[0].map(x=>x.trim())}; }
const sum=(a,f)=>a.reduce((s,r)=>s+(r[f]||0),0);
const F1=load('中信建投01_2026-06-26至2026-07-26_搜索词报告.csv');       // 含触发模式
const F2=load('中信建投01_2026-06-26至2026-07-26_搜索词报告 (1).csv');   // 含创意类型
const plan=load('中信建投01_2026-06-26至2026-07-26_计划报告.csv','plan');
console.log('F1(含触发模式): 行数', F1.objs.length, 'cost=¥'+sum(F1.objs,'cost').toFixed(0), 'conv='+sum(F1.objs,'conv'));
console.log('F2(含创意类型): 行数', F2.objs.length, 'cost=¥'+sum(F2.objs,'cost').toFixed(0), 'conv='+sum(F2.objs,'conv'));
console.log('计划报告基准:   cost=¥'+sum(plan.objs,'cost').toFixed(0));
console.log('两文件并集直加: cost=¥'+(sum(F1.objs,'cost')+sum(F2.objs,'cost')).toFixed(0), '（若≈2×基准即双计）');
// 现行语义键去重（date|plan|group|kw|query|device）：
const key=r=>[r.date,r.plan,r.group,r.kw,r.query,''].join('\u0001');
const m=new Map();
[...F1.objs,...F2.objs].forEach(r=>{ const k=key(r); const ex=m.get(k); if(!ex) m.set(k,r); else if(!ex.mode && r.mode) m.set(k,r); });
console.log('现行语义键去重: cost=¥'+sum([...m.values()],'cost').toFixed(0));
// 方案：文件级选择（同类型多文件若互为同一数据不同列集 → 只选一份"最优文件"，不做行级去重）
console.log('\n单用 F1: cost=¥'+sum(F1.objs,'cost').toFixed(0), ' 单用 F2: cost=¥'+sum(F2.objs,'cost').toFixed(0));
// 判定 F1 与 F2 是否同一数据：日期×计划 聚合指纹比较
function fp(objs){ const g={}; objs.forEach(r=>{ const k=r.date+'|'+r.plan; const o=g[k]=g[k]||{cost:0,clicks:0}; o.cost+=r.cost; o.clicks+=r.clicks; }); return g; }
const g1=fp(F1.objs), g2=fp(F2.objs);
const keys=new Set([...Object.keys(g1),...Object.keys(g2)]);
let same=0, tot=0;
keys.forEach(k=>{ tot++; const a=g1[k]||{cost:0},b=g2[k]||{cost:0}; if(Math.abs(a.cost-b.cost)<0.51) same++; });
console.log('日期×计划 聚合单元:', tot, '| 消费一致单元:', same, '('+(same/tot*100).toFixed(1)+'%) → 一致率高说明两文件是同一数据的不同列集导出');
