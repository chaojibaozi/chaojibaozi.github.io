/* 子集矩阵压力测试 · 验证「任意分日报告子集都能离线跑通并产出结果+方法论建议」（Round 3 要求②）
 * 用真实盈拓全维度文件（testdata/，已复制到工作区以便 Node 访问）组装 11 种丢入子集，
 * 逐个 loadScript 注入 → runAnalysis()，断言：①不抛错 ②自适应覆盖正确 ③设备端识别 ④对应维度诊断非空 ⑤结果真实存在（非赝）。
 * 关键验证点：无搜索词降级分支现在也会产出 covar(账户级) + 统一操作清单；convSource 对盈拓(oCPC 含转化)判定正确。
 */
const fs = require('fs');
const path = require('path');

/* ---------- DOM shim（与 yingtuo_test 一致） ---------- */
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
const CAP = 5*1048576;        // 超大文件仅读前 5MB（避免 OOM），逻辑校验不受影响
const MAXROWS = 12000;

/* ---------- 文件目录（真实盈拓文件名，含日期前缀） ---------- */
const CATALOG = {
  acct:  ['2023-08-01至2024-01-31搜索产品线数据报告43262566.csv'],
  plan:  ['2023-08-01至2024-01-31搜索计划数据报告43262567.csv'],
  grp:   ['2023-08-01至2024-01-31搜索组数据报告43262568.csv'],
  rank:  ['2023-08-01至2024-01-31搜索关键词pc端搜索类数据报告43262587.csv','2023-08-01至2024-01-31搜索关键词移动端搜索类数据报告43262588.csv'],
  adv:   ['2023-08-01至2024-01-31搜索凤舞pc端搜索类数据报告43262571.csv','2023-08-01至2024-01-31搜索凤舞移动端搜索类分创意类型报告43262593.csv'],
  basic: ['2023-08-01至2024-01-31搜索创意pc端搜索类数据报告43262590.csv','2023-08-01至2024-01-31搜索创意移动端搜索类数据报告43262591.csv'],
  search:['2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv','2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv'],
  geo:   ['2023-08-01至2024-01-31搜索计划移动端搜索类市级地域报告43262584.csv','2023-08-01至2024-01-31搜索组pc端搜索类市级地域报告43262585.csv'],
  ocpc:  ['2023-08-01至2024-01-31搜索oCPC分oCPC投放包数据43262576.csv','2023-08-01至2024-01-31搜索oCPC移动端搜索类分oCPC投放包数据43262581.csv'],
  pic:   ['2023-08-01至2024-01-31搜索创意pc端搜索类创意系统配图报告43262578.csv']
};

/* ---------- 载入一个子集到全局 FILES（模拟 handleFiles 的解析+分日校验） ---------- */
function loadSubset(types){
  FILES.length = 0; R = null;
  const loaded = [];
  types.forEach(t=>{
    (CATALOG[t]||[]).forEach(f=>{
      const fp = path.join(DIR,f);
      if(!fs.existsSync(fp)){ console.log('    ⚠ 缺失(跳过):', f); return; }
      let buf = fs.readFileSync(fp);
      if(buf.length>CAP) buf = buf.slice(0, CAP);
      const text = decodeCsv(buf);
      let rows = parseCSV(text);
      if(rows.length>MAXROWS+1) rows = rows.slice(0, MAXROWS+1);
      const type = detectType(rows[0], f);
      const dev = detectDevice(f, rows);
      const objs = rowsToObjects(type, rows);
      if(type==='rank'){
        FILES.push({name:f, type, rows:objs, device:dev});   // 排名补充：特例放行，不强制分日
      }else{
        const valid = objs.filter(r=>isSingleDate(r.date)).length;
        if(valid < objs.length*0.5){ console.log('    ❌ 非分日:', f); throw new Error('非分日文件被误装入: '+f); }
        FILES.push({name:f, type, rows:objs, device:dev});
      }
      loaded.push({type, name:f, rows:objs.length, dev});
    });
  });
  return loaded;
}

/* ---------- 场景定义 ---------- */
const SCEN = [
  {name:'仅 oCPC',                         types:['ocpc'],                 exp:{noSearch:true,  ocpcAnchor:true}},
  {name:'仅搜索词(盈拓无转化列)',            types:['search'],               exp:{noSearch:false, convSource:'none'}},
  {name:'仅排名',                          types:['rank'],                 exp:{noSearch:true,  rankDiag:true}},
  {name:'仅地域',                          types:['geo'],                  exp:{noSearch:true,  geo:true}},
  {name:'仅基础创意',                       types:['basic'],                exp:{noSearch:true,  cre:true}},
  {name:'排名 + 地域',                      types:['rank','geo'],           exp:{noSearch:true,  rankDiag:true, geo:true}},
  {name:'基础创意 + 高级创意(凤舞)',          types:['basic','adv'],         exp:{noSearch:true,  cre:true, adv:true}},
  {name:'搜索词 + 排名(盈拓:搜索无转化、排名浅层亦0→无转化锚点)', types:['search','rank'],  exp:{noSearch:false, convSource:'none', noAnchor:true, rankDiag:true}},
  {name:'搜索词 + oCPC(盈拓:仅oCPC含转化→账户级锚点；无协变量维度)', types:['search','ocpc'], exp:{noSearch:false, convSource:'oCPC', covarOcpcAnchor:true, covarMissingNote:true}},
  {name:'维度专项全开(无搜索词)',             types:['rank','ocpc','geo','basic','adv'], exp:{noSearch:true, rankDiag:true, ocpc:true, geo:true, cre:true, adv:true}},
  {name:'全维度全集',                        types:['acct','plan','grp','rank','adv','basic','search','geo','ocpc','pic'], exp:{noSearch:false, convSource:'oCPC', fullCoverage:true}}
];

/* ---------- 运行 ---------- */
console.log('===== 子集矩阵压力测试（真实盈拓数据） =====');
let totalFail=0, totalScen=SCEN.length;

SCEN.forEach(s=>{
  const A=[];
  const assert=(n,c,info)=>{ A.push({n,ok:!!c,info:info||''}); if(!c) console.log('    ❌ '+n+(info?' → '+info:'')); };
  console.log('\n--- 场景: '+s.name+' [ '+s.types.join(' + ')+' ] ---');
  let loaded, threw=null;
  try{
    loaded = loadSubset(s.types);
    runAnalysis();
  }catch(e){ threw = e && e.stack || e; }

  if(threw){ console.log('    💥 runAnalysis 抛错:', threw); assert('runAnalysis 不抛错', false, String(threw).slice(0,200)); }
  else assert('runAnalysis 不抛错', true);

  if(threw){ totalFail += A.filter(a=>!a.ok).length; return; }

  /* 通用断言 */
  assert('覆盖类型含全部上传维度', s.types.every(t=> R.coverage.typesPresent.includes(t)), 'typesPresent='+R.coverage.typesPresent.join(','));
  assert('设备端已识别', !!R.deviceScope && ['pc','mobile','both','mixed','unknown'].includes(R.deviceScope), 'deviceScope='+R.deviceScope);
  const exists = (R.actions&&R.actions.length>0) || (R.covar&&R.covar.units&&R.covar.units.length>0) ||
                 (R.rank&&R.rank.diag&&R.rank.diag.length>0) || (R.geo&&R.geo.length>0) ||
                 (R.creGroups&&R.creGroups.length>0) || (R.ocpc&&R.ocpc.has);
  assert('结果真实存在(诊断/归因/清单至少其一非空)', exists,
    `actions=${R.actions&&R.actions.length} covarUnits=${R.covar&&R.covar.units&&R.covar.units.length} rankDiag=${R.rank&&R.rank.diag&&R.rank.diag.length} geo=${R.geo&&R.geo.length} cre=${R.creGroups&&R.creGroups.length} ocpc=${R.ocpc&&R.ocpc.has}`);

  /* 场景特定断言 */
  const e=s.exp;
  if('noSearch' in e) assert('无搜索词降级标记正确', R.noSearch===e.noSearch, 'noSearch='+R.noSearch);
  if('convSource' in e) assert('转化来源判定='+e.convSource, R.convSource===e.convSource, 'convSource='+R.convSource);
  if(e.rankDiag) assert('排名诊断非空', R.rank&&R.rank.has&&R.rank.diag&&R.rank.diag.length>0, 'diag='+(R.rank&&R.rank.diag&&R.rank.diag.length));
  if(e.geo) assert('地域分析非空', R.geo&&R.geo.length>0, 'geo='+(R.geo&&R.geo.length));
  if(e.cre) assert('创意分组非空', R.creGroups&&R.creGroups.length>0, 'cre='+(R.creGroups&&R.creGroups.length));
  if(e.adv) assert('高级/凤舞对比非空', R.advCompare&&R.advCompare.length>0, 'adv='+(R.advCompare&&R.advCompare.length));
  if(e.ocpc) assert('oCPC 诊断有投放包', R.ocpc&&R.ocpc.has&&R.ocpc.pkgs.length>0, 'pkgs='+(R.ocpc&&R.ocpc.pkgs&&R.ocpc.pkgs.length));
  if(e.ocpcAnchor) assert('波动归因命中 oCPC 锚点(账户级)', R.covar&&R.covar.hasAnchor&&/oCPC/.test(R.covar.anchorSource||''), 'anchor='+(R.covar&&R.covar.anchorSource));
  if(e.noAnchor) assert('无转化来源→共变无锚点(正确：盈拓仅oCPC含转化，本子集不含oCPC)', R.covar&&R.covar.hasAnchor===false, 'hasAnchor='+(R.covar&&R.covar.hasAnchor)+' anchor='+(R.covar&&R.covar.anchorSource));
  if(e.covarOcpcAnchor) assert('波动归因锚点=oCPC(账户级)', R.covar&&R.covar.hasAnchor&&/oCPC/.test(R.covar.anchorSource||''), 'anchor='+(R.covar&&R.covar.anchorSource));
  if(e.covarMissingNote) assert('共变说明缺失维度(无协变量→无相关性单元，note 解释)', R.covar&&R.covar.note&&/(未导入|未参与)/.test(R.covar.note), 'note前24='+(R.covar&&R.covar.note&&R.covar.note.slice(0,24)));
  if(e.convSource==='oCPC') assert('总览转化>0(来自oCPC)', R.tot&&R.tot.conv>0, 'conv='+(R.tot&&R.tot.conv));
  if(e.fullCoverage){
    assert('覆盖含 search/ocpc/rank/geo/basic/adv', ['search','ocpc','rank','geo','basic','adv'].every(t=>R.coverage.typesPresent.includes(t)), R.coverage.typesPresent.join(','));
    assert('设备端感知为双端(both/mixed)', ['both','mixed'].includes(R.deviceScope), 'deviceScope='+R.deviceScope);
    assert('维度专项模块至少就绪多模块', R.coverage.readyCount>=6, 'ready='+R.coverage.readyCount+'/'+R.coverage.total);
  }

  const fail = A.filter(a=>!a.ok).length;
  totalFail += fail;
  console.log('    '+(fail? ('❌ 失败 '+fail+' 项') : '✔ 通过') +
    ' | noSearch='+R.noSearch+' convSource='+(R.convSource||'-')+' device='+R.deviceScope+
    ' actions='+(R.actions&&R.actions.length)+' covarUnits='+(R.covar&&R.covar.units&&R.covar.units.length)+
    ' rankDiag='+(R.rank&&R.rank.diag&&R.rank.diag.length)+' geo='+(R.geo&&R.geo.length)+' cre='+(R.creGroups&&R.creGroups.length));
});

console.log('\n===== 汇总 =====');
console.log((totalFail? ('❌ 共 '+totalFail+' 项失败 / '+totalScen+' 场景') : '✔ 全部 '+totalScen+' 个子集场景通过  → TEST_PASS'));
process.exit(totalFail?1:0);
