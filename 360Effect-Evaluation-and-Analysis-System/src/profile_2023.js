/* 2023 批次性能剖析 runner。加载 tier2 → 用 _wrap 包裹所有分析函数计时 → dump。
   用法: node profile_2023.js <tier1|tier2|geo|big>
   改进：所有输出同步写 profile_result.txt（防会话重启丢失），并暴露 bestAccountMatch 调用计数。 */
const fs = require('fs');
const OUT = fs.createWriteStream(__dirname + '/profile_result.txt', { flags: 'a' });
function log(...a){ const s = a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '); console.log(s); try{ OUT.write(s+'\n'); }catch(e){} }
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl() };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true; global.fetch = ()=>Promise.reject(new Error('offline'));

function loadScript(p){ let c=fs.readFileSync(p,'utf8'); c=c.replace(/^(let|const) /gm,'var '); (0,eval)(c); }
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/part4_analysis.js');

/* ---- 性能包裹：给所有分析函数套计时 ---- */
const _perf = {};
function _wrap(label, fn){ return function(){ const t=Date.now(); const r=fn.apply(this, arguments); _perf[label]=(_perf[label]||0)+(Date.now()-t); return r; }; }
global._wrap = _wrap;
const _fns = ['runAnalysis','detectCoverage','mergeFiles','analyzeCreative','analyzeGeo','analyzeCpaAttribution','analyzeStats','analyzeConvSearchShift','analyzeConvKeywordDaily','buildActions','analyzeCovariation','analyzeRank','analyzeInvalid','analyzeHour','analyzeOcpc','analyzeMatchMode','analyzePlanLevel','findPrev'];
_fns.forEach(n=>{ try{ (0,eval)(n+' = global._wrap('+JSON.stringify(n)+', '+n+')'); }catch(e){ log('skip '+n+': '+e.message); } });
/* 统计 bestAccountMatch 调用次数（嵌套函数，无法全局包裹 → 直接重写计数） */
let _bamCalls=0, _bamCand=0;
if(typeof bestAccountMatch==='function'){
  const _orig = bestAccountMatch;
  bestAccountMatch = function(q){ _bamCalls++; const t=Date.now(); const r=_orig(q); _perf.bestAccountMatch=(_perf.bestAccountMatch||0)+(Date.now()-t); return r; };
}
global.__bam = ()=>_bamCalls;

const dir = __dirname + '/../testdata/';
const tier = process.argv[2] || 'tier2';
const SUB = {
  tier1: ['搜索产品线数据报告43262566','搜索计划数据报告43262567','搜索组数据报告43262568','搜索计划移动端搜索类市级地域报告43262584','搜索oCPC分oCPC投放包数据43262576','搜索oCPC移动端搜索类分oCPC投放包数据43262581','搜索凤舞pc端搜索类数据报告43262571','搜索凤舞移动端搜索类分创意类型报告43262593','搜索创意pc端搜索类创意系统配图报告43262578','搜索搜索词移动端搜索类分创意类型报告43262574','搜索关键词移动端搜索类数据报告43262588'],
  tier2: ['搜索关键词pc端搜索类数据报告43262587','搜索创意pc端搜索类数据报告43262590','搜索搜索词分创意类型报告43262575'],
  geo:   ['搜索组pc端搜索类市级地域报告43262585','搜索计划移动端搜索类市级地域报告43262584'],
  big:   ['搜索创意pc端搜索类数据报告43262590','搜索搜索词分创意类型报告43262575','搜索组pc端搜索类市级地域报告43262585'],
};
const keys = SUB[tier] || SUB.tier2;
const names = fs.readdirSync(dir).filter(f => keys.some(k => f.includes(k)) && f.endsWith('.csv')).sort();
log('== ['+tier+'] 载入', names.length, '个文件 ==');
names.forEach(name=>{
  const t0=Date.now();
  const buf = fs.readFileSync(dir+name);
  const text = decodeCsv(buf);
  const rows = parseCSV(text);
  const type = detectType(rows[0], name);
  if(!type){ log('❌ 无法识别:', name); return; }
  const device = detectDevice(name, rows);
  FILES.push({name, type, rows: rowsToObjects(type, rows), device, header: rows[0].map(x=>x.trim())});
  log('✔', type.padEnd(6), '| dev=', (device||'unknown').padEnd(7), '|', rows.length-1, '行 |', (Date.now()-t0)+'ms |', name.slice(0,30));
});

log('\n== 运行 runAnalysis ==');
const tA=Date.now();
try { runAnalysis(); log('runAnalysis 完成，耗时', (Date.now()-tA)+'ms，无异常'); }
catch(e){ log('❌ runAnalysis 抛错:', e.message); log(e.stack.split('\n').slice(0,8).join('\n')); process.exit(1); }

log('\n== PERF (函数累计耗时) ==');
Object.entries(_perf).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>log('  '+(v/1000).toFixed(1).padStart(7)+'s  '+k));
log('  bestAccountMatch 调用次数:', _bamCalls);

log('\n===== 全局 =====');
log('周期:', R.period, '| 日期数:', R.dates.length);
log('总消费:', R.tot.cost.toFixed(2), '| 总转化(深层):', R.tot.conv, '| 关键词数:', R.kws.length, '| 搜索词query数:', R.queries.length, '| negList:', R.negList.length);
log('R2023_PASS');
try{ OUT.end(); }catch(e){}
