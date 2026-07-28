/* 核查：两搜索词文件 是否重复(双计) / 是否 PC-移动互补；抽样无效点击过滤比真实性 */
const fs = require('fs');
function parseCSV(text){
  text = text.replace(/^\uFEFF/,'');
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=c; }
    else { if(c==='"') q=true; else if(c===','){ row.push(cell); cell=''; } else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; } else if(c!=='\r') cell+=c; } }
  if(cell!==''||row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(x=>x.trim()!==''));
}
function cleanCell(v){ return (v||'').replace(/^="?|"?$/g,'').replace(/^="|"$/g,'').trim(); }
const dir = __dirname + '/../testdata/中信建投/';
const A = parseCSV(fs.readFileSync(dir+'中信建投01_2026-06-26至2026-07-26_搜索词报告.csv','utf8'));
const B = parseCSV(fs.readFileSync(dir+'中信建投01_2026-06-26至2026-07-26_搜索词报告 (1).csv','utf8'));
const ha=A[0].map(x=>x.trim()), hb=B[0].map(x=>x.trim());
console.log('A 表头:', ha.join(' | '));
console.log('B 表头:', hb.join(' | '));
const devA = ha.indexOf('投放设备'), devB = hb.indexOf('投放设备');
const modeA = ha.indexOf('触发模式'), typeB = hb.indexOf('创意类型');
function devVals(rows, di){ const m={}; rows.slice(1).forEach(r=>{ const v=r[di]?cleanCell(r[di]):'(空)'; m[v]=(m[v]||0)+1; }); return m; }
console.log('\nA 投放设备分布:', JSON.stringify(devVals(A, devA)));
console.log('B 投放设备分布:', JSON.stringify(devVals(B, devB)));
console.log('A 含触发模式列?', modeA>=0, '| B 含创意类型列?', typeB>=0, '| B 含触发模式列?', hb.indexOf('触发模式')>=0);
// 重叠检测：以 (时间,计划,组,关键词,搜索词) 为键
const keyOf = (r,h)=>{ const i=n=>h.indexOf(n); return [r[i('时间')],r[i('推广计划')],r[i('推广组')],r[i('关键词')],r[i('搜索词')]].map(x=>cleanCell(x)).join('||'); };
const setA = new Set(A.slice(1).map(r=>keyOf(r,ha)));
const setB = new Set(B.slice(1).map(r=>keyOf(r,hb)));
let inter=0; setB.forEach(k=>{ if(setA.has(k)) inter++; });
console.log('\nA 行数:', A.length-1, '| B 行数:', B.length-1);
console.log('A∪B 键交集(重叠行):', inter, '| B 中属于 A 的比例:', (inter/(B.length-1)*100).toFixed(1)+'%');
console.log('结论:', inter>=(B.length-1)*0.9 ? '⚠️ B 几乎是 A 的重复(双计风险!)' : (inter<= (B.length-1)*0.1 ? '✅ B 与 A 基本不重叠(应为 PC/移动 互补)' : '部分重叠，需进一步看'));
// 无效点击 过滤比 抽样
const INV = parseCSV(fs.readFileSync(dir+'中信建投01_2026-06-26至2026-07-26_无效点击报告.csv','utf8'));
const hi=INV[0].map(x=>x.trim());
const ri=hi.indexOf('过滤比'), bi=hi.indexOf('过滤前点击量'), fi=hi.indexOf('过滤点击量'), ai=hi.indexOf('过滤金额');
const ratios=INV.slice(1).map(r=>{ const raw=r[ri]||''; const n=parseFloat(String(raw).replace(/[%,]/g,'')); return isNaN(n)?null:n; }).filter(x=>x!=null);
const sum=ratios.reduce((a,b)=>a+b,0);
console.log('\n== 无效点击 过滤比 ==');
console.log('行数:', ratios.length, '| 均值:', (sum/ratios.length).toFixed(2)+'%', '| 中位:', ratios.sort((a,b)=>a-b)[Math.floor(ratios.length/2)].toFixed(1)+'%');
console.log('≥90% 行数:', ratios.filter(r=>r>=90).length, '| 0 行数:', ratios.filter(r=>r===0).length, '| 样例:', ratios.slice(0,8).map(r=>r.toFixed(1)).join(','));
console.log('过滤前点击量样例:', INV.slice(1,4).map(r=>r[bi]+'/过滤'+r[fi]+'/金额'+r[ai]).join(' | '));
