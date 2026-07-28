/* 量化：两搜索词文件重叠导致的双计膨胀；验证 过滤比 与 过滤点击/过滤前点击 的一致性 */
const fs = require('fs');
function parseCSV(text){
  text=text.replace(/^\uFEFF/,''); const rows=[]; let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;}else q=false;} else cell+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(cell);cell='';} else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';} else if(c!=='\r')cell+=c; } }
  if(cell!==''||row.length){row.push(cell);rows.push(row);} return rows.filter(r=>r.some(x=>x.trim()!==''));
}
function cleanCell(v){return (v||'').replace(/^="?|"?$/g,'').replace(/^="|"$/g,'').trim();}
function num(v){const n=parseFloat(String(v).replace(/[%,＄¥]/g,''));return isNaN(n)?0:n;}
const dir=__dirname+'/../testdata/中信建投/';
const A=parseCSV(fs.readFileSync(dir+'中信建投01_2026-06-26至2026-07-26_搜索词报告.csv','utf8'));
const B=parseCSV(fs.readFileSync(dir+'中信建投01_2026-06-26至2026-07-26_搜索词报告 (1).csv','utf8'));
const ha=A[0].map(x=>x.trim()),hb=B[0].map(x=>x.trim());
const col=(h,n)=>h.indexOf(n);
const keyOf=(r,h)=>{const i=n=>h.indexOf(n);return [r[i('时间')],r[i('推广计划')],r[i('推广组')],r[i('关键词')],r[i('搜索词')]].map(x=>cleanCell(x)).join('||');};
const costIdxA=col(ha,'总费用'),convIdxA=col(ha,'转化数'),clkIdxA=col(ha,'点击次数');
const costIdxB=col(hb,'总费用'),convIdxB=col(hb,'转化数'),clkIdxB=col(hb,'点击次数');
const mapA=new Map(); A.slice(1).forEach(r=>{const k=keyOf(r,ha); const o=mapA.get(k)||{cost:0,conv:0,clk:0}; o.cost+=num(r[costIdxA]); o.conv+=num(r[convIdxA]); o.clk+=num(r[clkIdxA]); mapA.set(k,o);});
const mapB=new Map(); B.slice(1).forEach(r=>{const k=keyOf(r,hb); const o=mapB.get(k)||{cost:0,conv:0,clk:0}; o.cost+=num(r[costIdxB]); o.conv+=num(r[convIdxB]); o.clk+=num(r[clkIdxB]); mapB.set(k,o);});
let overlapCost=0,overlapConv=0,overlapClk=0;
mapB.forEach((v,k)=>{ if(mapA.has(k)){ overlapCost+=v.cost; overlapConv+=v.conv; overlapClk+=v.clk; } });
const totA=[...mapA.values()].reduce((s,o)=>({cost:s.cost+o.cost,conv:s.conv+o.conv,clk:s.clk+o.clk}),{cost:0,conv:0,clk:0});
const totB=[...mapB.values()].reduce((s,o)=>({cost:s.cost+o.cost,conv:s.conv+o.conv,clk:s.clk+o.clk}),{cost:0,conv:0,clk:0});
// 当前引擎: 直接拼接 A+B 的逐行 (40000 行)
const engineCost=totA.cost+totB.cost, engineConv=totA.conv+totB.conv, engineClk=totA.clk+totB.clk;
// 去重后(按 key 合并, 重叠只算一次 A): unique = A全量 + B独有
const uniqueCost=totA.cost+(totB.cost-overlapCost), uniqueConv=totA.conv+(totB.conv-overlapConv), uniqueClk=totA.clk+(totB.clk-overlapClk);
console.log('=== 搜索词双计膨胀量化 ===');
console.log('引擎(拼接)消费: ¥'+engineCost.toFixed(2)+' | 点击: '+engineClk+' | 深层转化: '+engineConv);
console.log('去重(正确)消费: ¥'+uniqueCost.toFixed(2)+' | 点击: '+uniqueClk+' | 深层转化: '+uniqueConv);
console.log('重叠部分(被双计): 消费 ¥'+overlapCost.toFixed(2)+' | 点击 '+overlapClk+' | 转化 '+overlapConv);
console.log('膨胀率: 消费 +'+((engineCost-uniqueCost)/uniqueCost*100).toFixed(1)+'% | 转化 +'+((engineConv-overlapConv)/Math.max(1,uniqueConv)*100).toFixed(1)+'%');
console.log('→ 若按引擎数, CPA 虚低/虚高? 引擎CPA='+(engineCost/Math.max(1,engineConv)).toFixed(1)+' vs 真实CPA='+(uniqueCost/Math.max(1,uniqueConv)).toFixed(1));
// 过滤比一致性
const INV=parseCSV(fs.readFileSync(dir+'中信建投01_2026-06-26至2026-07-26_无效点击报告.csv','utf8'));
const hi=INV[0].map(x=>x.trim());
const ri=hi.indexOf('过滤比'),bi=hi.indexOf('过滤前点击量'),fi=hi.indexOf('过滤点击量');
let match=0,mis=0,ex=[];
INV.slice(1,400).forEach(r=>{ const fr=num(r[ri]); const bf=num(r[bi]),cf=num(r[fi]); if(bf>0){ const calc=cf/bf*100; const diff=Math.abs(calc-fr); if(diff<=2)match++; else {mis++; if(ex.length<5)ex.push(`过滤比=${fr}% 计算=${calc.toFixed(1)}% (前${bf}/过${cf})`);} } });
console.log('\n=== 过滤比 一致性(前399行) ===');
console.log('一致(差≤2pp):',match,'| 不一致:',mis); if(ex.length)console.log('不一致样例:',ex.join(' | '));
