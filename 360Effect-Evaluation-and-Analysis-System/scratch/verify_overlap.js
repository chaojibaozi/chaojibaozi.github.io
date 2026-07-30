/* 验证：2023 批次 搜索词分创意类型报告(全设备) 与 搜索词移动端分创意类型报告 是否数据重叠；
   以及当前 mergeFiles 语义键(含文件级 device)下会不会双计 */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='D:\\BianCheng\\360效果评估分析系统 - 副本 (3)';
const TD=path.join(ROOT,'testdata');
const sandbox={ console, localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>({addEventListener:()=>{},style:{},classList:{add:()=>{},remove:()=>{}},value:'',textContent:'',innerHTML:''}),querySelectorAll:()=>[],querySelector:()=>null,documentElement:{setAttribute:()=>{},getAttribute:()=>null},addEventListener:()=>{}},
  window:{scrollTo:()=>{}}, TextDecoder, global:{} };
sandbox.global=sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'src','part3_core.js'),'utf8'), sandbox);
const { parseCSV, decodeCsv, rowsToObjects, detectDevice } = sandbox;

function load(fn){ const rows=parseCSV(decodeCsv(fs.readFileSync(path.join(TD,fn)))); return {rows, objs:rowsToObjects('search',rows), header:rows[0].map(x=>x.trim())}; }
const A=load('2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv');
const B=load('2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv');
console.log('A(全设备?) 行数:',A.objs.length,' 消费:',A.objs.reduce((s,r)=>s+r.cost,0).toFixed(0));
console.log('B(移动端) 行数:',B.objs.length,' 消费:',B.objs.reduce((s,r)=>s+r.cost,0).toFixed(0));
console.log('A detectDevice:', detectDevice('2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv', A.rows));
console.log('B detectDevice:', detectDevice('2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv', B.rows));
// A 是否含 设备类型 列，其移动端子集是否 ≈ B
const devIdx=A.header.findIndex(h=>/设备类型/.test(h));
console.log('A 设备类型列 idx:', devIdx);
if(devIdx>=0){
  const rawA=A.rows; const vals={};
  for(let i=1;i<rawA.length;i++){ const v=rawA[i][devIdx]; vals[v]=(vals[v]||0)+1; }
  console.log('A 设备类型值分布:', JSON.stringify(vals).slice(0,200));
}
// 键重叠：date|plan|group|kw|query
const keyOf=r=>[r.date,r.plan,r.group,r.kw,r.query].join('\u0001');
const setB=new Set(B.objs.map(keyOf));
let overlapRows=0, overlapCost=0;
A.objs.forEach(r=>{ if(setB.has(keyOf(r))){ overlapRows++; overlapCost+=r.cost; } });
console.log('A 中与 B 共键行:', overlapRows, ' 共键消费 ¥'+overlapCost.toFixed(0), '（若 B⊂A 则当前 device 不同键会导致移动端双计）');
// B 消费与 A 中共键消费比例
const bCost=B.objs.reduce((s,r)=>s+r.cost,0);
console.log('B 总消费 ¥'+bCost.toFixed(0), ' → 若双计则总消费虚增 ¥'+bCost.toFixed(0));
