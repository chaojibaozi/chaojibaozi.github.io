const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='D:\\BianCheng\\360效果评估分析系统 - 副本 (3)';
const TD=path.join(ROOT,'testdata','中信建投');
const sandbox={ console, localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>({addEventListener:()=>{},style:{},classList:{add:()=>{},remove:()=>{}},value:'',textContent:'',innerHTML:''}),querySelectorAll:()=>[],querySelector:()=>null,documentElement:{setAttribute:()=>{},getAttribute:()=>null},addEventListener:()=>{}},
  window:{scrollTo:()=>{}}, TextDecoder, global:{} };
sandbox.global=sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'src','part3_core.js'),'utf8'), sandbox);
const { parseCSV, decodeCsv, rowsToObjects } = sandbox;
function load(fn){ const rows=parseCSV(decodeCsv(fs.readFileSync(path.join(TD,fn)))); return rowsToObjects('search',rows); }
const F1=load('中信建投01_2026-06-26至2026-07-26_搜索词报告.csv');
const F2=load('中信建投01_2026-06-26至2026-07-26_搜索词报告 (1).csv');
const sig=r=>[r.date,r.plan,r.group,r.kw,r.query,r.shows,r.clicks,r.cost,r.conv||0].join('\u0001');
const m=new Map(); F1.forEach(r=>{ const s=sig(r); m.set(s,(m.get(s)||0)+1); });
let hit=0; F2.forEach(r=>{ const s=sig(r); const c=m.get(s)||0; if(c>0){ hit++; m.set(s,c-1); } });
console.log('F2 行在 F1 中签名重合率:', (hit/F2.length*100).toFixed(2)+'%', '('+hit+'/'+F2.length+')');
// 日期×计划×组 指纹一致率（更细粒度指纹）
function fp(objs){ const g={}; objs.forEach(r=>{ const k=r.date+'|'+r.plan+'|'+r.group; const o=g[k]=g[k]||{cost:0,clicks:0,shows:0}; o.cost+=r.cost; o.clicks+=r.clicks; o.shows+=r.shows; }); return g; }
const g1=fp(F1), g2=fp(F2);
const keys=new Set([...Object.keys(g1),...Object.keys(g2)]);
let same=0, tot=0;
keys.forEach(k=>{ tot++; const a=g1[k],b=g2[k]; if(a&&b&&Math.abs(a.cost-b.cost)<0.51&&a.clicks===b.clicks&&a.shows===b.shows) same++; });
console.log('日期×计划×组 单元:', tot, '| 三指标全同:', same, '('+(same/tot*100).toFixed(1)+'%)');
