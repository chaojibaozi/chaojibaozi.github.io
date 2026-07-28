/* 中信建投 任意子集离线工作流健壮性测试 (#83)
   加载 harness → 对多组「仅部分维度」文件组合：重置 FILES/RAW → 载入子集 → runAnalysis → 断言
   断言点：① 不抛异常 ② 覆盖检测 typesPresent 与子集一致 ③ 已载入维度的 R 字段为真实数据 ④ 缺失维度无幻影数据/崩溃 */
const fs = require('fs');
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl() };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));
global.toast = ()=>{};
global.showResultUI = ()=>{};
global.switchTab = ()=>{};
global.saveSnapshot = ()=>{};
global.updateAIModeUI = ()=>{};
global.renderAll = ()=>{};

function loadScript(p){ let code=fs.readFileSync(p,'utf8'); code=code.replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/part3_core.js');
loadScript(__dirname+'/part4_analysis.js');

const dir = __dirname + '/../testdata/中信建投/';
const allNames = fs.readdirSync(dir).filter(f=>f.endsWith('.csv')).sort();

function loadSubset(keepNames){
  FILES = [];
  RAW = { search:[], geo:[], basic:[], adv:[], rank:[], kw:[], grp:[], plan:[], acct:[], hour:[], invalid:[], ocpc:[], comp:[], pic:[] };
  let detFail=[];
  keepNames.forEach(name=>{
    const text=fs.readFileSync(dir+name,'utf8');
    const rows=parseCSV(text);
    const type=detectType(rows[0], name);
    if(!type){ detFail.push(name); return; }
    FILES.push({name, type, rows: rowsToObjects(type, rows), device: detectDevice(name, rows), header: rows[0].map(x=>x.trim())});
  });
  if(detFail.length) throw new Error('未识别文件: '+detFail.join(','));
  let err=null;
  try { runAnalysis(); } catch(e){ err=e; }
  return { detFail, err };
}

// 场景定义：包含哪些文件名子串
const scenarios = [
  { name:'仅核心(search+ocpc)',   keep:['搜索词报告','oCPC报告'] },
  { name:'无搜索词(geo+hour+rank+invalid+ocpc+basic+adv)', keep:['地域','分时','关键词报告','无效点击','oCPC','基础创意','高级创意'] },
  { name:'仅账户结构(grp+plan+acct)', keep:['推广组','计划','账户'] },
  { name:'仅创意(basic+adv)',     keep:['基础创意','高级创意'] },
  { name:'仅无效点击',            keep:['无效点击'] },
  { name:'部分维度(search+geo+hour)', keep:['搜索词报告','地域','分时'] },
  { name:'单文件(search)',         keep:['搜索词报告'] },
  { name:'单文件(分时)',           keep:['分时'] },
  { name:'单文件(oCPC)',           keep:['oCPC'] },
  { name:'全量(12文件)',           keep: allNames },
];

let pass=0, fail=0;
const fails=[];
function ok(cond,msg){ if(cond){pass++;} else {fail++; fails.push(msg);} }

scenarios.forEach(sc=>{
  const keepNames = sc.keep===allNames ? allNames : allNames.filter(n=> sc.keep.some(k=>n.includes(k)));
  let r;
  try { r = loadSubset(keepNames); } catch(e){ ok(false, `【${sc.name}】载入异常: ${e.message}`); return; }
  ok(!r.err, `【${sc.name}】runAnalysis 抛错: ${r.err?r.err.message:'?'}`);
  ok(!r.detFail.length, `【${sc.name}】有文件未识别: ${r.detFail.join(',')}`);
  // 覆盖检测一致性
  const expectTypes = [...new Set(keepNames.map(n=>detectType(parseCSV(fs.readFileSync(dir+n,'utf8'))[0], n)))];
  const gotTypes = R.coverage.typesPresent.slice().sort();
  const expSorted = expectTypes.slice().sort();
  ok(JSON.stringify(gotTypes)===JSON.stringify(expSorted), `【${sc.name}】覆盖检测不符: 期望[${expSorted}] 实得[${gotTypes}]`);
  // 已载入维度必须有真实 R 字段、缺失维度不得幻影
  const typeField = { search:'convKws', geo:'geo', hour:'hour', rank:'rank', invalid:'invalid', ocpc:'ocpc', basic:'weakCre', adv:'advCompare', grp:'planStats', plan:'planStats', acct:'tot' };
  expectTypes.forEach(t=>{
    const f = typeField[t];
    if(f==='convKws'){ ok(Array.isArray(R.convKws), `【${sc.name}】${t} convKws 非数组`); }
    else if(f==='geo'){ ok(Array.isArray(R.geo)&&R.geo.length>0, `【${sc.name}】${t} geo 空`); }
    else if(f==='hour'){ ok(R.hour&&R.hour.has, `【${sc.name}】${t} hour.has 假`); }
    else if(f==='rank'){ ok(R.rank&&R.rank.has, `【${sc.name}】${t} rank.has 假`); }
    else if(f==='invalid'){ ok(R.invalid&&R.invalid.has, `【${sc.name}】${t} invalid.has 假`); }
    else if(f==='ocpc'){ ok(R.ocpc&&R.ocpc.has, `【${sc.name}】${t} ocpc.has 假`); }
    else if(f==='weakCre'){ ok(Array.isArray(R.weakCre), `【${sc.name}】${t} weakCre 非数组`); }
    else if(f==='advCompare'){ ok(Array.isArray(R.advCompare), `【${sc.name}】${t} advCompare 非数组`); }
    else if(f==='planStats'){ ok(Array.isArray(R.planStats), `【${sc.name}】${t} planStats 非数组`); }
    else if(f==='tot'){ ok(R.tot&&typeof R.tot.cost==='number', `【${sc.name}】${t} tot 缺失`); }
  });
  // 操作清单必须存在（任意子集都要给建议）
  ok(Array.isArray(R.actions)&&R.actions.length>0, `【${sc.name}】操作清单为空（应给出方法论建议）`);
  console.log(`场景【${sc.name}】→ 加载${keepNames.length}文件, 模块${R.coverage.readyCount}/${R.coverage.total}, 操作清单${R.actions.length}条 ${r.err?'❌':'✅'}`);
});

console.log(`\n=== 子集健壮性测试: ${pass} 通过 / ${fail} 失败 ===`);
if(fail){ console.log('失败项:'); fails.forEach(f=>console.log('  - '+f)); console.log('SUBSET_FAIL'); process.exit(1); }
else { console.log('SUBSET_PASS'); }
