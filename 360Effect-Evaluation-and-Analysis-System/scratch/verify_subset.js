const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='D:\\BianCheng\\360效果评估分析系统 - 副本 (3)';
const TD=path.join(ROOT,'testdata');
const sandbox={ console, localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>({addEventListener:()=>{},style:{},classList:{add:()=>{},remove:()=>{}},value:'',textContent:'',innerHTML:''}),querySelectorAll:()=>[],querySelector:()=>null,documentElement:{setAttribute:()=>{},getAttribute:()=>null},addEventListener:()=>{}},
  window:{scrollTo:()=>{}}, TextDecoder, global:{} };
sandbox.global=sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'src','part3_core.js'),'utf8'), sandbox);
const { parseCSV, decodeCsv, rowsToObjects } = sandbox;
function load(fn){ const rows=parseCSV(decodeCsv(fs.readFileSync(path.join(TD,fn)))); return rowsToObjects('search',rows); }
const A=load('2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv');
const B=load('2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv');
const sig=r=>[r.date,r.plan,r.group,r.kw,r.query,r.shows,r.clicks,r.cost,r.conv||0].join('\u0001');
const mA=new Map(); A.forEach(r=>{ const s=sig(r); mA.set(s,(mA.get(s)||0)+1); });
let hit=0;
B.forEach(r=>{ const s=sig(r); const c=mA.get(s)||0; if(c>0){ hit++; mA.set(s,c-1); } });
console.log('B 行数:',B.length,'| 在 A 中有相同签名(维度+指标)的行:',hit,'| 覆盖率:',(hit/B.length*100).toFixed(2)+'%');
const X1=load('xc捷配信息_2026-04-28至2026-07-27_搜索词报告.csv');
const X2=load('xc捷配信息_2026-04-28至2026-07-27_搜索词报告 (1).csv');
const mX=new Map(); X1.forEach(r=>{ const s=sig(r); mX.set(s,(mX.get(s)||0)+1); });
let hx=0; X2.forEach(r=>{ const s=sig(r); const c=mX.get(s)||0; if(c>0){ hx++; mX.set(s,c-1); } });
console.log('xc(1) 行数:',X2.length,'| 与 xc 原版签名重合:',hx,'| 覆盖率:',(hx/X2.length*100).toFixed(2)+'%');
