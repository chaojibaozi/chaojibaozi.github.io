/* 决定性验证：搜索词报告多行(按创意/触发模式拆分)求和 vs 语义键去重后求和，谁更接近 计划/账户报告 黄金基准 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='D:\\BianCheng\\360效果评估分析系统 - 副本 (3)';
const TD=path.join(ROOT,'testdata');
const sandbox={ console, localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>({addEventListener:()=>{},style:{},classList:{add:()=>{},remove:()=>{}},value:'',textContent:'',innerHTML:''}),querySelectorAll:()=>[],querySelector:()=>null,documentElement:{setAttribute:()=>{},getAttribute:()=>null},addEventListener:()=>{}},
  window:{scrollTo:()=>{}}, TextDecoder, global:{} };
sandbox.global=sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'src','part3_core.js'),'utf8'), sandbox);
const { parseCSV, decodeCsv, rowsToObjects } = sandbox;
function load(fn,type){ const rows=parseCSV(decodeCsv(fs.readFileSync(path.join(TD,fn)))); return rowsToObjects(type,rows); }
const sum=(a,f)=>a.reduce((s,r)=>s+(r[f]||0),0);

console.log('===== xc 账户 =====');
const xs=load('xc捷配信息_2026-04-28至2026-07-27_搜索词报告.csv','search');
const xplan=load('xc捷配信息_2026-04-28至2026-07-27_计划报告.csv','plan');
// 对齐日期范围（计划报告 4-28~7-27 与搜索词一致）
const dates=new Set(xs.map(r=>r.date));
const xp2=xplan.filter(r=>dates.has(r.date));
console.log('搜索词报告 全量求和: cost=¥'+sum(xs,'cost').toFixed(0),'clicks='+sum(xs,'clicks'),'shows='+sum(xs,'shows'),'conv='+sum(xs,'conv'));
// 语义键去重后
const key=r=>[r.date,r.plan,r.group,r.kw,r.query].join('\u0001');
const m=new Map(); xs.forEach(r=>{ const k=key(r); const ex=m.get(k); if(!ex) m.set(k,r); else if(!ex.mode && r.mode) m.set(k,r); });
const ded=[...m.values()];
console.log('语义键去重后求和:  cost=¥'+sum(ded,'cost').toFixed(0),'clicks='+sum(ded,'clicks'),'shows='+sum(ded,'shows'),'conv='+sum(ded,'conv'));
console.log('计划报告(黄金基准): cost=¥'+sum(xp2,'cost').toFixed(0),'clicks='+sum(xp2,'clicks'),'shows='+sum(xp2,'shows'));

console.log('\n===== 2023 批次 =====');
const A=load('2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv','search');
const plan23=load('2023-08-01至2024-01-31搜索计划数据报告43262567.csv','plan');
console.log('A(分创意类型,全设备) 全量求和: cost=¥'+sum(A,'cost').toFixed(0),'clicks='+sum(A,'clicks'));
const m2=new Map(); A.forEach(r=>{ const k=key(r); const ex=m2.get(k); if(!ex) m2.set(k,r); else if(!ex.mode && r.mode) m2.set(k,r); });
const ded2=[...m2.values()];
console.log('语义键去重后:           cost=¥'+sum(ded2,'cost').toFixed(0),'clicks='+sum(ded2,'clicks'));
console.log('计划报告(黄金基准):     cost=¥'+sum(plan23,'cost').toFixed(0),'clicks='+sum(plan23,'clicks'));
