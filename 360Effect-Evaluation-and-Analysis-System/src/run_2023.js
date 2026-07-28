/* 2023 批次真实文件测试 runner。加载指定子集 → runAnalysis → dump + NaN 全树扫描 + geo城市列验证 + 凤舞adv验证。
   用法: node run_2023.js <tier1|tier2|geo|big> */
const fs = require('fs');
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

const dir = __dirname + '/../testdata/';
const tier = process.argv[2] || 'tier1';
// 子集定义
const SUB = {
  tier1: ['搜索产品线数据报告43262566','搜索计划数据报告43262567','搜索组数据报告43262568','搜索计划移动端搜索类市级地域报告43262584','搜索oCPC分oCPC投放包数据43262576','搜索oCPC移动端搜索类分oCPC投放包数据43262581','搜索凤舞pc端搜索类数据报告43262571','搜索凤舞移动端搜索类分创意类型报告43262593','搜索创意pc端搜索类创意系统配图报告43262578','搜索搜索词移动端搜索类分创意类型报告43262574','搜索关键词移动端搜索类数据报告43262588'],
  tier2: ['搜索关键词pc端搜索类数据报告43262587','搜索创意pc端搜索类数据报告43262590','搜索搜索词分创意类型报告43262575'],
  geo:   ['搜索组pc端搜索类市级地域报告43262585','搜索计划移动端搜索类市级地域报告43262584'],
  big:   ['搜索创意pc端搜索类数据报告43262590','搜索搜索词分创意类型报告43262575','搜索组pc端搜索类市级地域报告43262585'],
};
const keys = SUB[tier] || SUB.tier1;
const names = fs.readdirSync(dir).filter(f => keys.some(k => f.includes(k)) && f.endsWith('.csv')).sort();
console.log('== ['+tier+'] 载入', names.length, '个文件 ==');
names.forEach(name=>{
  const t0=Date.now();
  const buf = fs.readFileSync(dir+name);            // 读 Buffer（与引擎 handleFiles 一致，再 decodeCsv 处理 GBK）
  const text = decodeCsv(buf);
  const rows = parseCSV(text);
  const type = detectType(rows[0], name);
  if(!type){ console.log('❌ 无法识别:', name); return; }
  const device = detectDevice(name, rows);
  FILES.push({name, type, rows: rowsToObjects(type, rows), device, header: rows[0].map(x=>x.trim())});
  console.log('✔', type.padEnd(6), '| dev=', (device||'unknown').padEnd(7), '|', rows.length-1, '行 |', (Date.now()-t0)+'ms |', name.slice(0,30));
});

console.log('\n== 运行 runAnalysis ==');
const tA=Date.now();
try { runAnalysis(); console.log('runAnalysis 完成，耗时', (Date.now()-tA)+'ms，无异常'); }
catch(e){ console.log('❌ runAnalysis 抛错:', e.message); console.log(e.stack.split('\n').slice(0,8).join('\n')); process.exit(1); }

// ---- NaN 全树扫描 ----
function scanNaN(obj, path, hits){
  if(hits.length>40) return;
  if(typeof obj==='number'){ if(Number.isNaN(obj)) hits.push(path+'=NaN'); else if(!isFinite(obj)) hits.push(path+'=Infinity'); return; }
  if(Array.isArray(obj)){ obj.forEach((v,i)=>scanNaN(v, path+'['+i+']', hits)); return; }
  if(obj && typeof obj==='object'){ for(const k of Object.keys(obj)) scanNaN(obj[k], path+'.'+k, hits); }
}
const nanHits=[];
scanNaN(R, 'R', nanHits);
console.log('\n== NaN/Inf 扫描 ==');
console.log(nanHits.length? '❌ 发现异常值 '+nanHits.length+' 处:\n  '+nanHits.slice(0,40).join('\n  ') : '✅ 无 NaN/Inf');

console.log('\n===== 全局 =====');
console.log('周期:', R.period, '| 日期数:', R.dates.length);
console.log('总消费:', R.tot.cost.toFixed(2), '| 总展现:', R.tot.shows, '| 总点击:', R.tot.clicks, '| 总转化(深层):', R.tot.conv, '| CPA:', (R.tot.cpa||0).toFixed(2));

console.log('\n== 覆盖检测 ==', R.coverage.readyCount+'/'+R.coverage.total, '|', R.coverage.modules.filter(m=>m.ready).map(m=>m.id).join(','));

console.log('\n== 地域 (geo 城市列验证) ==');
const geoFile = names.find(n=>n.includes('市级地域'));
let cityInRaw=false;
if(geoFile){ const raw=parseCSV(decodeCsv(fs.readFileSync(dir+geoFile))); const h=raw[0]; cityInRaw = h.some(x=>/城市/.test(x)); }
console.log('  原始文件含[城市]列:', cityInRaw, '| R.geo 对象数:', R.geo.length, '| 含 city 字段的样例:', JSON.stringify(R.geo[0]||{}));
const anyCity = R.geo.some(g=>g.province && /（/.test(g.region||''));
console.log('  R.geo 是否保留了城市粒度:', anyCity ? '✅ 是(已按城市聚合，标签带省名)' : '❌ 否(城市列被丢弃，全部坍缩到省级)');

console.log('\n== 凤舞 adv (无创意标题验证) ==');
console.log('  RAW.adv 行数:', RAW.adv.length, '| advCompare 数:', R.advCompare?.length, '| advShift 组数:', R.advShift?.length||(R.weakCre?0:0));
console.log('  adv 首行样例:', JSON.stringify(RAW.adv[0]||{}));

console.log('\n== oCPC (145列验证) ==');
console.log('  ocpc.has:', !!R.ocpc?.has, '| 投放包:', R.ocpc?.pkgs?.length, '| totalDeep:', R.ocpc?.totalDeep, '| totalShallow:', R.ocpc?.totalShallow);
(R.ocpc?.pkgs||[]).slice(0,4).forEach(p=>console.log('    包「'+p.pkg+'」: 深层'+p.deep+' 浅层'+p.shallow+' CPA¥'+(p.deepCPA?p.deepCPA.toFixed(1):'-')+' 阶段'+p.phases.join('/')));

console.log('\n== 创意配图 pic ==');
console.log('  RAW.pic 行数:', RAW.pic.length, '| 是否被分析(R.pic相关字段):', Object.keys(R).filter(k=>/pic/i.test(k)).join(',')||'(无 — 静默丢弃)');

console.log('\n== 操作清单 ==', '总数:', R.actions.length, '| P0:', R.actions.filter(a=>a.p===0).length, 'P1:', R.actions.filter(a=>a.p===1).length, 'P2:', R.actions.filter(a=>a.p===2).length);
console.log('R2023_PASS');
