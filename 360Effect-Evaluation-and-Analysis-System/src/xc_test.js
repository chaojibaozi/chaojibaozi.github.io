/* xc捷配 全维度真实数据 · 全方位压力测试（用户交付的 30 文件 pile）
 * 验证三大目标：
 *  ① 方法论/系统覆盖全部维度（含 oCPC 曾被 isSingleDate 误杀的修复）+ 多粒度同维度文件不重复计数
 *  ② 任意子集分日文件离线工作流都能跑出真实结果+优化建议
 *  ③ 全维度逻辑校验，结果真实存在（与独立解析的文件真值交叉核对）
 * 关键修复验证点：
 *  - G1: oCPC 报告时间带时段(`2026-04-28 00:00至01:00`)，修复后 R.ocpc.has=true（此前被 isSingleDate 拦截→整个 oCPC 维度不可用）
 *  - G2: 地域 8 文件 / 无效点击 6 文件 多粒度重叠 → 仅取最细粒度，R.geoTot.cost ≈ (1) 文件真值，绝不 ≈ 8 文件之和(≈3x)
 *  - G3: 设备 combined（PC+移动 合并口径，无设备拆分列）→ deviceScope='combined' 且给出说明
 */
const fs = require('fs');
const path = require('path');

/* ---------- DOM shim ---------- */
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl(), documentElement:null };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));
function loadScript(p){ let code = fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/part4_analysis.js');

const DIR = path.join(__dirname,'..','testdata') + '/';
const PFX = 'xc捷配信息_2026-04-28至2026-07-27_';
const PFX_HOUR = 'xc捷配信息_2026-06-26至2026-07-27_';   // 分时报告导出周期不同：仅近 1 个月
const nm = (suffix, n) => n ? PFX+suffix+' ('+n+').csv' : PFX+suffix+'.csv';
const nmh = (suffix, n) => n ? PFX_HOUR+suffix+' ('+n+').csv' : PFX_HOUR+suffix+'.csv';

/* ---------- 独立真值解析（与系统逻辑解耦，用于交叉核对） ---------- */
function sumCol(file, colName){
  const buf = fs.readFileSync(path.join(DIR,file));
  const text = decodeCsv(buf);
  const rows = parseCSV(text);
  if(rows.length<2) return 0;
  const header = rows[0].map(x=>x.trim());
  const ci = header.findIndex(h=>h.includes(colName));
  if(ci<0) return 0;
  let s=0;
  for(let i=1;i<rows.length;i++){ const v=rows[i][ci]; if(v!==undefined&&v!=='') s+=num(v); }
  return s;
}
function topRegionByCost(file){
  const buf = fs.readFileSync(path.join(DIR,file));
  const rows = parseCSV(decodeCsv(buf));
  const header = rows[0].map(x=>x.trim());
  const ri = header.findIndex(h=>h.includes('省级地区')), ci = header.findIndex(h=>h.includes('总费用'));
  const m={};
  for(let i=1;i<rows.length;i++){ const reg=cleanCell(rows[i][ri]); m[reg]=(m[reg]||0)+num(rows[i][ci]); }
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
}

/* ---------- CATALOG（xc 真实文件名） ---------- */
const GEO_ALL = [nm('地域分析报告'),nm('地域分析报告',1),nm('地域分析报告',2),nm('地域分析报告',3),nm('地域分析报告',4),nm('地域分析报告',5),nm('地域分析报告',6),nm('地域分析报告',7)];
const INVALID_ALL = [nm('无效点击报告'),nm('无效点击报告',1),nm('无效点击报告',2),nm('无效点击报告',3),nm('无效点击报告',4),nm('无效点击报告',5)];
const SEARCH_ALL = [nm('搜索词报告'),nm('搜索词报告',1)];
const HOUR_ALL = [nmh('分时分析报告'),nmh('分时分析报告',1)];
const CAT = {
  acct:  ['xc捷配信息_2026-03-01至2026-07-27_账户报告.csv'],
  ocpc:  [nm('oCPC报告')],
  search:[nm('搜索词报告')],
  geo:   [nm('地域分析报告',1)],     // 最细粒度 canonical
  geoAll:GEO_ALL,
  invalid:[nm('无效点击报告',5)],     // 最细粒度 canonical（计划×组）
  invalidAll: INVALID_ALL,
  hour:  [nmh('分时分析报告')],
  hourAll: HOUR_ALL,
  basic: [nm('基础创意报告')],
  adv:   [nm('高级创意报告')],
  kw:    [nm('关键词报告'), nm('关键词报告',1)],   // 关键词报告=PC(计算机)排名, (1)=移动端排名 → 两套设备，分别载入
  grp:   [nm('推广组报告')],
  plan:  [nm('计划报告')],
};

function loadSubset(types){
  FILES.length = 0; R = null;
  types.forEach(t=>{
    (CAT[t]||[]).forEach(f=>{
      const fp = path.join(DIR,f);
      if(!fs.existsSync(fp)){ console.log('    ⚠ 缺失(跳过):', f); return; }
      const text = decodeCsv(fs.readFileSync(fp));
      const rows = parseCSV(text);
      const type = detectType(rows[0], f);
      const dev = detectDevice(f, rows);
      const objs = rowsToObjects(type, rows);
      const header = rows[0].map(x=>x.trim());
      if(type==='rank'){ FILES.push({name:f,type,rows:objs,device:dev,header}); }
      else{
        const valid = objs.filter(r=>isSingleDate(r.date)).length;
        if(valid < objs.length*0.5){ console.log('    ❌ 非分日:', f); throw new Error('非分日被误装: '+f); }
        FILES.push({name:f,type,rows:objs,device:dev,header});
      }
    });
  });
}

/* ---------- 场景 ---------- */
const SCEN = [
  { name:'全量 30 文件', types:['acct','ocpc','search','geoAll','invalidAll','hourAll','basic','adv','kw','grp','plan'],
    exp:{ full:true, ocpcLoads:true, convSourceSearch:true, bothDevices:true, noDoubleGeo:true, noDoubleInvalid:true } },
  { name:'多粒度地域 8 文件（防重复计数）', types:['geoAll'], exp:{ noSearch:true, geo:true, noDoubleGeo:true } },
  { name:'多粒度无效点击 6 文件（防重复计数）', types:['invalidAll'], exp:{ noSearch:true, invalid:true, noDoubleInvalid:true } },
  { name:'仅 oCPC（成本报告，无转化列）', types:['ocpc'], exp:{ noSearch:true, ocpcLoads:true, convNone:true } },
  { name:'仅搜索词', types:['search'], exp:{ noSearch:false, convSourceSearch:true } },
  { name:'仅地域', types:['geo'], exp:{ noSearch:true, geo:true, noDoubleGeo:true } },
  { name:'仅无效点击', types:['invalid'], exp:{ noSearch:true, invalid:true } },
  { name:'搜索词 + 全部地域变体（仍不重复计数）', types:['search','geoAll'], exp:{ convSourceSearch:true, noDoubleGeo:true } },
  { name:'混合：搜索+排名+地域+无效+分时+oCPC+创意', types:['search','kw','geo','invalid','hour','ocpc','basic','adv'], exp:{ convSourceSearch:true, ocpcLoads:true, covar:true } },
  { name:'仅分时', types:['hour'], exp:{ noSearch:true, hour:true } },
  { name:'仅基础创意 + 高级创意', types:['basic','adv'], exp:{ noSearch:true, cre:true, adv:true } },
];

console.log('===== xc捷配 全维度真实数据 · 压力测试 =====');
let totalFail=0;

/* 预计算真值 */
const expGeoCost = sumCol(nm('地域分析报告',1),'总费用');                 // 最细粒度 canonical(1) 真值
const sumAllGeo  = GEO_ALL.reduce((s,f)=>s+sumCol(f,'总费用'),0);        // 8 文件之和（应远大于 R.geoTot.cost）
const expInvChosen = sumCol(nm('无效点击报告',5),'过滤前点击量') + sumCol(nm('无效点击报告',4),'过滤前点击量');
const sumAllInv = INVALID_ALL.reduce((s,f)=>s+sumCol(f,'过滤前点击量'),0);
const topRegions = topRegionByCost(nm('地域分析报告',1));
console.log('  真值: geo(1)总费用=¥'+expGeoCost.toFixed(0)+' | 8地域文件总费用之和=¥'+sumAllGeo.toFixed(0)+' (R.geoTot 应≈前者, ≪后者)');
console.log('  真值: 无效(5)+(4)过滤前=¥'+expInvChosen.toFixed(0)+' | 6无效文件过滤前之和=¥'+sumAllInv.toFixed(0)+' (R.invalid 应≈前者, ≪后者)');
console.log('  真值: 地域 Top3 省份 =', topRegions.slice(0,3).join(' / '));

SCEN.forEach(s=>{
  const A=[];
  const assert=(n,c,info)=>{ A.push({n,ok:!!c,info:info||''}); if(!c) console.log('    ❌ '+n+(info?' → '+info:'')); };
  console.log('\n--- 场景: '+s.name+' [ '+s.types.join(' + ')+' ] ---');
  let threw=null;
  try{ loadSubset(s.types); runAnalysis(); }
  catch(e){ threw = e && e.stack || e; }

  if(threw){ console.log('    💥 runAnalysis 抛错:', threw); assert('runAnalysis 不抛错', false, String(threw).slice(0,300)); totalFail+=A.filter(a=>!a.ok).length; return; }
  assert('runAnalysis 不抛错', true);

  const e=s.exp;
  const CANON = { geoAll:'geo', invalidAll:'invalid', hourAll:'hour', kw:'rank' };   // 测试场景用「文件组」标签，系统用规范类型名
  const expTypes = s.types.map(t=>CANON[t]||t);
  assert('覆盖类型含全部上传维度', expTypes.every(t=>R.coverage.typesPresent.includes(t)), 'types='+R.coverage.typesPresent.join(','));
  const exists = (R.actions&&R.actions.length>0) || (R.covar&&R.covar.units&&R.covar.units.length>0) ||
                 (R.rank&&R.rank.diag&&R.rank.diag.length>0) || (R.geo&&R.geo.length>0) ||
                 (R.creGroups&&R.creGroups.length>0) || (R.ocpc&&R.ocpc.has) || (R.invalid&&R.invalid.has) || (R.hour&&R.hour.has);
  assert('结果真实存在(诊断/归因/清单至少其一非空)', exists,
    `actions=${R.actions&&R.actions.length} covar=${R.covar&&R.covar.units&&R.covar.units.length} geo=${R.geo&&R.geo.length} ocpc=${R.ocpc&&R.ocpc.has} invalid=${R.invalid&&R.invalid.has} hour=${R.hour&&R.hour.has}`);

  if('noSearch' in e) assert('无搜索词降级标记', R.noSearch===e.noSearch, 'noSearch='+R.noSearch);
  if('convSourceSearch' in e) assert('转化来源=搜索词(有深层转化)', R.convSource==='search', 'convSource='+R.convSource+' tot.conv='+(R.tot&&R.tot.conv));
  if('convNone' in e) assert('无转化来源(convSource=none)', R.convSource==='none', 'convSource='+R.convSource);
  if('ocpcLoads' in e) assert('oCPC 维度已载入(修复 isSingleDate 误杀)', R.ocpc&&R.ocpc.has&&R.ocpc.pkgs.length>0, 'has='+(R.ocpc&&R.ocpc.has)+' pkgs='+(R.ocpc&&R.ocpc.pkgs&&R.ocpc.pkgs.length));
  if('combinedDevice' in e) assert('设备=合并口径(combined)且给说明', R.deviceScope==='combined' && /合并/.test(R.coverage.deviceNote||''), 'device='+R.deviceScope+' note='+(R.coverage.deviceNote||'').slice(0,20));
  if('bothDevices' in e) assert('设备=分设备(PC+移动,both)且给说明', R.deviceScope==='both' && /设备/.test(R.coverage.deviceNote||''), 'device='+R.deviceScope+' note='+(R.coverage.deviceNote||'').slice(0,20));
  if('geo' in e) assert('地域分析非空', R.geo&&R.geo.length>0, 'geo='+(R.geo&&R.geo.length));
  if('invalid' in e) assert('无效点击分析非空', R.invalid&&R.invalid.has, 'has='+(R.invalid&&R.invalid.has));
  if('hour' in e) assert('分时分析非空', R.hour&&R.hour.has, 'has='+(R.hour&&R.hour.has));
  if('cre' in e) assert('基础创意分组非空', R.creGroups&&R.creGroups.length>0, 'cre='+(R.creGroups&&R.creGroups.length));
  if('adv' in e) assert('高级创意对比非空', R.advCompare&&R.advCompare.length>0, 'adv='+(R.advCompare&&R.advCompare.length));
  if('covar' in e) assert('波动归因单元非空', R.covar&&R.covar.units&&R.covar.units.length>0, 'units='+(R.covar&&R.covar.units&&R.covar.units.length));

  /* G2: 地域不重复计数 */
  if('noDoubleGeo' in e){
    assert('地域成本≈最细粒度(1)真值(±10%, 非8文件之和)',
      Math.abs(R.geoTot.cost - expGeoCost) <= expGeoCost*0.10,
      'geoCost='+R.geoTot.cost.toFixed(0)+' vs 真值='+expGeoCost.toFixed(0));
    assert('地域成本 ≪ 8文件之和(证明无3x重复计数)', R.geoTot.cost <= sumAllGeo*0.6,
      'geoCost='+R.geoTot.cost.toFixed(0)+' / 8文件和='+sumAllGeo.toFixed(0));
    /* 真实性：Top 地域应与独立解析一致。v15 起 xc「市级地区」列已正确解析 → 系统 Top 为市级实体
       （如"深圳市（广东省）"），断言改为提取其所属省份（括号内），应落在文件真值省级 Top3 内 */
    const sysTop = R.geo.length>0 ? String(R.geo[0].region||'') : '';
    const mProv = sysTop.match(/[（(]([^）)]+)[）)]/);
    const sysProv = mProv ? mProv[1] : sysTop;
    assert('地域 Top 所属省份与文件真值一致', R.geo.length>0 && topRegions.slice(0,3).includes(sysProv),
      'systemTop='+sysTop+' (省='+sysProv+') / fileTop='+topRegions.slice(0,3).join(','));
  }
  /* G2: 无效点击不重复计数 */
  if('noDoubleInvalid' in e){
    assert('无效点击过滤前≈最细粒度(5)+(4)真值(±10%)',
      Math.abs(R.invalid.totalBefore - expInvChosen) <= Math.max(expInvChosen*0.10, 1),
      'invBefore='+R.invalid.totalBefore.toFixed(0)+' vs 真值='+expInvChosen.toFixed(0));
    assert('无效点击过滤前 ≪ 6文件之和(无重复计数)', R.invalid.totalBefore <= sumAllInv*0.6,
      'invBefore='+R.invalid.totalBefore.toFixed(0)+' / 6文件和='+sumAllInv.toFixed(0));
  }

  const fail = A.filter(a=>!a.ok).length;
  totalFail += fail;
  console.log('    '+(fail? ('❌ 失败 '+fail+' 项') : '✔ 通过') +
    ' | noSearch='+R.noSearch+' convSource='+(R.convSource||'-')+' device='+R.deviceScope+
    ' geo='+(R.geo&&R.geo.length)+' geoTot=¥'+(R.geoTot&&R.geoTot.cost.toFixed(0))+
    ' invalid='+(R.invalid&&R.invalid.has)+' ocpc='+(R.ocpc&&R.ocpc.has)+
    ' covarUnits='+(R.covar&&R.covar.units&&R.covar.units.length)+' actions='+(R.actions&&R.actions.length));
});

console.log('\n===== 汇总 =====');
console.log((totalFail? ('❌ 共 '+totalFail+' 项失败 / '+SCEN.length+' 场景') : '✔ 全部 '+SCEN.length+' 个场景通过  → TEST_PASS'));
process.exit(totalFail?1:0);
