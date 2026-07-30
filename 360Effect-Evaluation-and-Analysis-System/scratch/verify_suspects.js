/* 疑点实证验证脚本（只读，不改源码） */
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT='D:\\BianCheng\\360效果评估分析系统 - 副本 (3)';
const TD=path.join(ROOT,'testdata');

/* 最小浏览器桩 */
const sandbox={ console, localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>({addEventListener:()=>{},style:{},classList:{add:()=>{},remove:()=>{}},value:'',textContent:'',innerHTML:''}),querySelectorAll:()=>[],querySelector:()=>null,documentElement:{setAttribute:()=>{},getAttribute:()=>null},addEventListener:()=>{}},
  window:{scrollTo:()=>{}}, TextDecoder, global:{} };
sandbox.global=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'src','part3_core.js'),'utf8'), sandbox);

const { parseCSV, decodeCsv, rowsToObjects, detectType } = sandbox;

console.log('===== 疑点1：xc 地域报告「市级地区」列是否被解析 =====');
const geoFile=path.join(TD,'xc捷配信息_2026-04-28至2026-07-27_地域分析报告 (1).csv');
const geoRows=parseCSV(decodeCsv(fs.readFileSync(geoFile)));
console.log('表头:', geoRows[0].join(' | '));
const geoObjs=rowsToObjects('geo', geoRows);
const withCity=geoObjs.filter(o=>o.city && o.city.trim()).length;
console.log('总行数:', geoObjs.length, '| city 字段非空行数:', withCity, withCity===0?'→ ❌ 市级信息全部丢失':'→ ✅ 正常');
console.log('样例行:', JSON.stringify(geoObjs[0]));

console.log('\n===== 疑点1b：2023 批次市级地域报告（含「城市」列）对照 =====');
const geo2023=path.join(TD,'2023-08-01至2024-01-31搜索组pc端搜索类市级地域报告43262585.csv');
const g23rows=parseCSV(decodeCsv(fs.readFileSync(geo2023)));
console.log('表头:', g23rows[0].join(' | '));
const g23objs=rowsToObjects('geo', g23rows);
console.log('city 非空行:', g23objs.filter(o=>o.city).length, '/', g23objs.length);

console.log('\n===== 疑点2：搜索词语义键去重是否误删单文件内合法行（分创意类型） =====');
['2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv','2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv',
 'xc捷配信息_2026-04-28至2026-07-27_搜索词报告.csv'].forEach(fn=>{
  const p=path.join(TD,fn); if(!fs.existsSync(p)){ console.log(fn,'不存在，跳过'); return; }
  const rows=parseCSV(decodeCsv(fs.readFileSync(p)));
  const objs=rowsToObjects('search', rows);
  const keyOf=r=>[r.date,r.plan,r.group,r.kw,r.query,''].join('\u0001');
  const m=new Map(); let dupCost=0, dupConv=0, dupRows=0;
  objs.forEach(r=>{ const k=keyOf(r); if(m.has(k)){ dupRows++; dupCost+=r.cost; dupConv+=(r.conv||0); } else m.set(k,r); });
  const totCost=objs.reduce((s,r)=>s+r.cost,0);
  console.log(fn.slice(0,40)+'... 行数:'+objs.length+' | 同语义键重复行:'+dupRows+' | 若去重损失消费 ¥'+dupCost.toFixed(2)+' ('+(totCost? (dupCost/totCost*100).toFixed(1):'0')+'%) 转化 '+dupConv);
  console.log('  表头:', rows[0].join('|').slice(0,120));
});

console.log('\n===== 疑点4：spikedTerms 排序比较器 =====');
const src4=fs.readFileSync(path.join(ROOT,'src','part4_analysis.js'),'utf8');
const m4=src4.match(/spikedTerms[\s\S]{0,900}?sort\(\(a,b\)=>([^)]+)\)/);
console.log('比较器表达式:', m4? m4[1] : '未找到');

console.log('\n===== 疑点3：analyzeInvalid note 金额字段 =====');
const m3=src4.match(/过滤金额合计[^']*'?\+fmt\((\w+)\)/);
console.log('note 中「过滤金额合计」用的变量:', m3? m3[1]:'未找到', '（应为 amount 之和，而非 filtered 点击量之和）');
