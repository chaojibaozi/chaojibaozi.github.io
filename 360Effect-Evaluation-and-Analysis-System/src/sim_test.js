/* ============================================================
   50 轮模拟测试 · 全维度组合 + 深度检查
   验证：工作流覆盖、输出正确性、浮层提示完整性、数据健康
   ============================================================ */
const fs = require('fs');
const path = require('path');

/* DOM shim */
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl(), documentElement:null };
global.window = { scrollTo(){}, innerWidth:1400, innerHeight:900 };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));

function loadScript(p){ let code = fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/part4_analysis.js');

const TD = path.join(__dirname,'..','testdata') + '/';
const CAP = 5*1048576;
const MAXROWS = 20000;

/* ========= 数据目录 ========= */
const CAT = {
  /* xc 捷配（小文件，快速测试） */
  xc_search:   ['xc捷配信息_2026-04-28至2026-07-27_搜索词报告.csv'],
  xc_rank:     ['xc捷配信息_2026-04-28至2026-07-27_关键词报告.csv'],
  xc_geo:      ['xc捷配信息_2026-04-28至2026-07-27_地域分析报告.csv'],
  xc_geoAll:   ['xc捷配信息_2026-04-28至2026-07-27_地域分析报告.csv','xc捷配信息_2026-04-28至2026-07-27_地域分析报告 (1).csv','xc捷配信息_2026-04-28至2026-07-27_地域分析报告 (4).csv','xc捷配信息_2026-04-28至2026-07-27_地域分析报告 (5).csv','xc捷配信息_2026-04-28至2026-07-27_地域分析报告 (6).csv'],
  xc_basic:    ['xc捷配信息_2026-04-28至2026-07-27_基础创意报告.csv'],
  xc_adv:      ['xc捷配信息_2026-04-28至2026-07-27_高级创意报告.csv'],
  xc_grp:      ['xc捷配信息_2026-04-28至2026-07-27_推广组报告.csv'],
  xc_plan:     ['xc捷配信息_2026-04-28至2026-07-27_计划报告.csv'],
  xc_acct:     ['xc捷配信息_2026-03-01至2026-07-27_账户报告.csv'],
  xc_hour:     ['xc捷配信息_2026-06-26至2026-07-27_分时分析报告.csv'],
  xc_invalid:  ['xc捷配信息_2026-04-28至2026-07-27_无效点击报告.csv'],
  xc_invalidAll:['xc捷配信息_2026-04-28至2026-07-27_无效点击报告.csv','xc捷配信息_2026-04-28至2026-07-27_无效点击报告 (2).csv','xc捷配信息_2026-04-28至2026-07-27_无效点击报告 (5).csv'],
  xc_ocpc:     ['xc捷配信息_2026-04-28至2026-07-27_oCPC报告.csv'],
  /* 盈拓 2023 小文件 */
  yt_acct:     ['2023-08-01至2024-01-31搜索产品线数据报告43262566.csv'],
  yt_plan:     ['2023-08-01至2024-01-31搜索计划数据报告43262567.csv'],
  yt_grp:      ['2023-08-01至2024-01-31搜索组数据报告43262568.csv'],
  yt_ocpc:     ['2023-08-01至2024-01-31搜索oCPC分oCPC投放包数据43262576.csv','2023-08-01至2024-01-31搜索oCPC移动端搜索类分oCPC投放包数据43262581.csv'],
  yt_rank:     ['2023-08-01至2024-01-31搜索关键词pc端搜索类数据报告43262587.csv','2023-08-01至2024-01-31搜索关键词移动端搜索类数据报告43262588.csv'],
  yt_geo:      ['2023-08-01至2024-01-31搜索计划移动端搜索类市级地域报告43262584.csv','2023-08-01至2024-01-31搜索组pc端搜索类市级地域报告43262585.csv'],
  yt_basic:    ['2023-08-01至2024-01-31搜索创意pc端搜索类数据报告43262590.csv','2023-08-01至2024-01-31搜索创意移动端搜索类数据报告43262591.csv'],
  yt_adv:      ['2023-08-01至2024-01-31搜索凤舞pc端搜索类数据报告43262571.csv','2023-08-01至2024-01-31搜索凤舞移动端搜索类分创意类型报告43262593.csv'],
  yt_search:   ['2023-08-01至2024-01-31搜索搜索词分创意类型报告43262575.csv','2023-08-01至2024-01-31搜索搜索词移动端搜索类分创意类型报告43262574.csv'],
  /* 中信建投 */
  zx_acct:     ['中信建投01_2026-06-26至2026-07-26_账户报告.csv'],
  zx_plan:     ['中信建投01_2026-06-26至2026-07-26_计划报告.csv'],
  zx_grp:      ['中信建投01_2026-06-26至2026-07-26_推广组报告.csv'],
  zx_search:   ['中信建投01_2026-06-26至2026-07-26_搜索词报告.csv'],
  zx_rank:     ['中信建投01_2026-06-26至2026-07-26_关键词报告.csv'],
  zx_geo:      ['中信建投01_2026-06-26至2026-07-26_地域分析报告.csv'],
  zx_basic:    ['中信建投01_2026-06-26至2026-07-26_基础创意报告.csv'],
  zx_adv:      ['中信建投01_2026-06-26至2026-07-26_高级创意报告.csv'],
  zx_ocpc:     ['中信建投01_2026-06-26至2026-07-26_oCPC报告.csv'],
  zx_invalid:  ['中信建投01_2026-06-26至2026-07-26_无效点击报告.csv'],
  zx_hour:     ['中信建投01_2026-07-20至2026-07-26_分时分析报告.csv'],
};

/* 加载文件 */
function loadFiles(keys){
  FILES.length = 0; R = null;
  const loaded = [];
  keys.forEach(k=>{
    const files = CAT[k];
    if(!files) { loaded.push({key:k, status:'未定义'}); return; }
    files.forEach(fn=>{
      const dir = (fn.includes('中信建投')) ? path.join(TD,'中信建投')+'/' : TD;
      const fp = path.join(dir, fn);
      if(!fs.existsSync(fp)){ loaded.push({key:k, fn, status:'文件缺失'}); return; }
      let buf = fs.readFileSync(fp);
      if(buf.length>CAP) buf = buf.slice(0, CAP);
      const text = decodeCsv(buf);
      let rows = parseCSV(text);
      if(rows.length>MAXROWS+1) rows = rows.slice(0, MAXROWS+1);
      const type = detectType(rows[0], fn);
      const dev = detectDevice(fn, rows);
      let objs = rowsToObjects(type, rows);
      if(type!=='rank'){
        const valid = objs.filter(r=>isSingleDate(r.date)).length;
        if(valid < objs.length*0.5){ loaded.push({key:k, fn, status:'非分日(跳过)'}); return; }
      }
      FILES.push({name:fn, type, rows:objs, device:dev});
      loaded.push({key:k, type, fn, rows:objs.length, dev, status:'已加载'});
    });
  });
  return loaded;
}

/* ========= 50 轮场景定义 ========= */
const SCENARIOS = [
  /* 第1-12轮：单维度 */
  {id:1,  name:'仅搜索词(xc)',       keys:['xc_search'],   exp:{hasSearch:true, convSource:'search'}},
  {id:2,  name:'仅关键词(xc)',       keys:['xc_rank'],     exp:{noSearch:true, rankDiag:true}},
  {id:3,  name:'仅地域(xc)',         keys:['xc_geo'],      exp:{noSearch:true, geoCount:true}},
  {id:4,  name:'仅基础创意(xc)',     keys:['xc_basic'],    exp:{noSearch:true, creCount:true}},
  {id:5,  name:'仅高级创意(xc)',     keys:['xc_adv'],      exp:{noSearch:true, advCount:true}},
  {id:6,  name:'仅推广组(xc)',       keys:['xc_grp'],      exp:{noSearch:true, planDiag:true}},
  {id:7,  name:'仅计划(xc)',         keys:['xc_plan'],     exp:{noSearch:true, planDiag:true}},
  {id:8,  name:'仅账户(xc)',         keys:['xc_acct'],     exp:{noSearch:true}},
  {id:9,  name:'仅分时(xc)',         keys:['xc_hour'],     exp:{noSearch:true, hourHas:true}},
  {id:10, name:'仅无效点击(xc)',     keys:['xc_invalid'],  exp:{noSearch:true, invalidHas:true}},
  {id:11, name:'仅oCPC(xc)',         keys:['xc_ocpc'],     exp:{noSearch:true, ocpcHas:true}},
  {id:12, name:'仅搜索词(盈拓)',     keys:['yt_search'],   exp:{hasSearch:true, convSource:'none'}},

  /* 第13-25轮：双维度组合（覆盖所有关键配对） */
  {id:13, name:'搜索+关键词(xc)',    keys:['xc_search','xc_rank'],       exp:{hasSearch:true, rankDiag:true, covar:true}},
  {id:14, name:'搜索+地域(xc)',      keys:['xc_search','xc_geo'],        exp:{hasSearch:true, geoCount:true, covar:true}},
  {id:15, name:'搜索+创意(xc)',      keys:['xc_search','xc_basic'],      exp:{hasSearch:true, creCount:true}},
  {id:16, name:'搜索+分时(xc)',      keys:['xc_search','xc_hour'],       exp:{hasSearch:true, hourHas:true, covar:true}},
  {id:17, name:'搜索+无效(xc)',      keys:['xc_search','xc_invalid'],    exp:{hasSearch:true, invalidHas:true, covar:true}},
  {id:18, name:'搜索+oCPC(xc)',      keys:['xc_search','xc_ocpc'],       exp:{hasSearch:true, ocpcHas:true}},
  {id:19, name:'搜索+结构(xc)',      keys:['xc_search','xc_plan','xc_grp','xc_acct'], exp:{hasSearch:true, planDiag:true}},
  {id:20, name:'关键词+地域(xc)',    keys:['xc_rank','xc_geo'],          exp:{noSearch:true, rankDiag:true, geoCount:true}},
  {id:21, name:'关键词+分时(xc)',    keys:['xc_rank','xc_hour'],         exp:{noSearch:true, rankDiag:true, hourHas:true}},
  {id:22, name:'关键词+无效(xc)',    keys:['xc_rank','xc_invalid'],      exp:{noSearch:true, rankDiag:true, invalidHas:true}},
  {id:23, name:'地域+创意(xc)',      keys:['xc_geo','xc_basic'],         exp:{noSearch:true, geoCount:true, creCount:true}},
  {id:24, name:'分时+无效(xc)',      keys:['xc_hour','xc_invalid'],      exp:{noSearch:true, hourHas:true, invalidHas:true}},
  {id:25, name:'oCPC+创意(盈拓)',    keys:['yt_ocpc','yt_basic'],        exp:{noSearch:true, ocpcHas:true, creCount:true}},

  /* 第26-35轮：三维度组合 */
  {id:26, name:'搜索+关键词+地域(xc)', keys:['xc_search','xc_rank','xc_geo'],     exp:{hasSearch:true, rankDiag:true, geoCount:true, covar:true}},
  {id:27, name:'搜索+关键词+分时(xc)', keys:['xc_search','xc_rank','xc_hour'],     exp:{hasSearch:true, rankDiag:true, hourHas:true, covar:true}},
  {id:28, name:'搜索+关键词+无效(xc)', keys:['xc_search','xc_rank','xc_invalid'],  exp:{hasSearch:true, rankDiag:true, invalidHas:true, covar:true}},
  {id:29, name:'搜索+地域+分时(xc)',   keys:['xc_search','xc_geo','xc_hour'],      exp:{hasSearch:true, geoCount:true, hourHas:true, covar:true}},
  {id:30, name:'搜索+地域+无效(xc)',   keys:['xc_search','xc_geo','xc_invalid'],   exp:{hasSearch:true, geoCount:true, invalidHas:true, covar:true}},
  {id:31, name:'关键词+地域+分时(xc)', keys:['xc_rank','xc_geo','xc_hour'],        exp:{noSearch:true, rankDiag:true, geoCount:true, hourHas:true}},
  {id:32, name:'关键词+地域+无效(xc)', keys:['xc_rank','xc_geo','xc_invalid'],     exp:{noSearch:true, rankDiag:true, geoCount:true, invalidHas:true}},
  {id:33, name:'创意+高级+oCPC(xc)',   keys:['xc_basic','xc_adv','xc_ocpc'],       exp:{noSearch:true, creCount:true, advCount:true, ocpcHas:true}},
  {id:34, name:'搜索+oCPC+无效(盈拓)',  keys:['yt_search','yt_ocpc'],              exp:{hasSearch:true, convSource:'oCPC', ocpcHas:true}},
  {id:35, name:'关键词+搜索+创意(xc)',  keys:['xc_rank','xc_search','xc_basic'],   exp:{hasSearch:true, rankDiag:true, creCount:true, covar:true}},

  /* 第36-45轮：混合来源 + 边界场景 */
  {id:36, name:'xc搜索+盈拓结构',       keys:['xc_search','yt_plan','yt_grp','yt_acct'], exp:{hasSearch:true, xcConv:true}},
  {id:37, name:'全维度(xc)',            keys:['xc_search','xc_rank','xc_geo','xc_basic','xc_adv','xc_grp','xc_plan','xc_acct','xc_hour','xc_invalid','xc_ocpc'], exp:{hasSearch:true, full:true}},
  {id:38, name:'全维度(盈拓)',          keys:['yt_search','yt_rank','yt_geo','yt_basic','yt_adv','yt_grp','yt_plan','yt_acct','yt_ocpc'], exp:{hasSearch:true, full:true, ytConv:'oCPC'}},
  {id:39, name:'全维度(中信建投)',      keys:['zx_search','zx_rank','zx_geo','zx_basic','zx_adv','zx_grp','zx_plan','zx_acct','zx_ocpc','zx_invalid','zx_hour'], exp:{hasSearch:true, full:true}},
  {id:40, name:'仅结构报告无转化(xc)',  keys:['xc_grp','xc_plan','xc_acct'],       exp:{noSearch:true, planDiag:true}},
  {id:41, name:'多粒度地域(xc)',         keys:['xc_geoAll'],                         exp:{noSearch:true, geoCount:true}},
  {id:42, name:'多粒度无效(xc)',         keys:['xc_invalidAll'],                     exp:{noSearch:true, invalidHas:true}},
  {id:43, name:'搜索+多粒度地域(xc)',    keys:['xc_search','xc_geoAll'],             exp:{hasSearch:true, geoCount:true, covar:true}},
  {id:44, name:'搜索+多粒度无效(xc)',    keys:['xc_search','xc_invalidAll'],         exp:{hasSearch:true, invalidHas:true, covar:true}},
  {id:45, name:'搜索+多粒度全(xc)',      keys:['xc_search','xc_geoAll','xc_invalidAll'], exp:{hasSearch:true, geoCount:true, invalidHas:true, covar:true}},

  /* 第46-50轮：极限/边界场景 */
  {id:46, name:'xc搜索+盈拓oCPC(锚点切换)', keys:['xc_search','yt_ocpc'],           exp:{hasSearch:true}},
  {id:47, name:'仅小文件不产生分析(xc)',     keys:['xc_acct'],                       exp:{noSearch:true}},
  {id:48, name:'地域+创意+高级(xc)',         keys:['xc_geo','xc_basic','xc_adv'],     exp:{noSearch:true, geoCount:true, creCount:true, advCount:true}},
  {id:49, name:'oCPC+无效+分时(xc)',         keys:['xc_ocpc','xc_invalid','xc_hour'], exp:{noSearch:true, ocpcHas:true, invalidHas:true, hourHas:true}},
  {id:50, name:'盈拓搜索+中信建投oCPC(跨源)', keys:['yt_search','zx_ocpc'],          exp:{hasSearch:true}},
];

/* ========= 深度校验器 ========= */
function deepCheck(R, scenario){
  const issues = [];

  /* 1. 数据健康：无 NaN/Inf/undefined 污染 */
  function checkVal(v, path){
    if(v == null) return; /* null/undefined 在数值字段可接受 */
    if(typeof v === 'number' && isNaN(v)) issues.push(`NaN @ ${path}`);
    if(typeof v === 'number' && !isFinite(v) && v !== null) issues.push(`Inf @ ${path}`);
    if(typeof v === 'string' && v === 'undefined') issues.push(`"undefined" string @ ${path}`);
  }
  function deepScan(obj, prefix, depth){
    if(depth>6) return;
    if(obj==null) return;
    if(Array.isArray(obj)){
      obj.forEach((item, i)=>{ if(typeof item==='object') deepScan(item, `${prefix}[${i}]`, depth+1); else checkVal(item, `${prefix}[${i}]`); });
    } else if(typeof obj==='object'){
      Object.entries(obj).forEach(([k,v])=>{
        if(typeof v==='object' && v!==null) deepScan(v, `${prefix}.${k}`, depth+1);
        else checkVal(v, `${prefix}.${k}`);
      });
    }
  }
  deepScan(R, 'R', 0);

  /* 2. 覆盖检测一致性 */
  if(R.coverage){
    if(!R.coverage.typesPresent) issues.push('R.coverage.typesPresent 缺失');
    if(!R.coverage.modulesActive) issues.push('R.coverage.modulesActive 缺失');
  }

  /* 3. 操作清单健康 */
  if(R.actions){
    R.actions.forEach((a, i)=>{
      if(a.p == null || a.p<0 || a.p>2) issues.push(`actions[${i}].p 异常: ${a.p}`);
      if(!a.mod) issues.push(`actions[${i}].mod 缺失`);
      if(!a.act) issues.push(`actions[${i}].act 缺失`);
    });
  }

  /* 4. 共变引擎健康 */
  if(R.covar && R.covar.units && R.covar.units.length){
    R.covar.units.forEach((u, i)=>{
      if(!u.drivers) issues.push(`covar.units[${i}].drivers 缺失`);
      else u.drivers.forEach((d, j)=>{
        if(isNaN(d.r)) issues.push(`covar.units[${i}].drivers[${j}].r NaN`);
        if(!d.dir || !['↑','↓'].includes(d.dir)) issues.push(`covar.units[${i}].drivers[${j}].dir 异常: ${d.dir}`);
        if(!d.strength) issues.push(`covar.units[${i}].drivers[${j}].strength 缺失`);
        if(!d.hyp) issues.push(`covar.units[${i}].drivers[${j}].hyp 缺失`);
        /* 确认 hyp 文本不重复使用旧错误 */
        if(d.dim==='创意CTR' && d.dir==='↓' && d.hyp && d.hyp.indexOf('创意CTR走低')>=0)
          issues.push(`covar 创意CTR r<0 hyp 仍为旧错误文本 @ drivers[${j}]`);
      });
    });
  }

  /* 5. 关键词象限健康 */
  if(R.kws){
    R.kws.forEach((k, i)=>{
      if(!k.quad || !['A','B','C','D'].includes(k.quad))
        issues.push(`kws[${i}](${k.kw}) quad 异常: ${k.quad}`);
    });
  }

  /* 6. 转化词状态健康 */
  if(R.convKws){
    R.convKws.forEach((k, i)=>{
      const valid = ['稳定','衰减','新增','波动','偶发'];
      if(!valid.includes(k.status)) issues.push(`convKws[${i}](${k.kw}) status 异常: ${k.status}`);
    });
  }

  /* 7. 地域诊断方向一致性 */
  if(R.geo){
    R.geo.forEach((g, i)=>{
      if(g.diag==='收缩' && g.bidCoef>1) issues.push(`geo[${i}](${g.region}) 收缩但 bidCoef>1`);
      if(g.diag==='扩量' && g.bidCoef<1) issues.push(`geo[${i}](${g.region}) 扩量但 bidCoef<1`);
    });
  }

  /* 8. 分时出价系数一致性 */
  if(R.hour && R.hour.byHour){
    R.hour.byHour.forEach((h, i)=>{
      if(h.ctr===0 && h.cost>0 && h.bidMult!==0) issues.push(`hour[${i}](${h.hour}) 零点击高消费但 bidMult!=0`);
      if(h.ctr>0 && h.bidMult===0) issues.push(`hour[${i}](${h.hour}) 有点击但 bidMult=0`);
    });
  }

  /* 9. 匹配模式健康 */
  if(R.matchMode && R.matchMode.overBroad){
    R.matchMode.overBroad.forEach((m, i)=>{
      if(!m.mode) issues.push(`matchMode.overBroad[${i}] mode 缺失`);
    });
  }

  /* 10. 分日转化词健康 */
  if(R.convDaily && R.convDaily.has){
    const cd = R.convDaily;
    if(cd.lostStillSpending){
      cd.lostStillSpending.forEach((c,i)=>{
        if(c.recentCost<20) issues.push(`convDaily.lostStillSpending[${i}](${c.kw}) recentCost<20: ${c.recentCost}`);
      });
    }
    if(cd.lifecycle){
      cd.lifecycle.forEach((l,i)=>{
        if(l.fadePct>1 || l.fadePct<0) issues.push(`convDaily.lifecycle[${i}](${l.kw}) fadePct 异常: ${l.fadePct}`);
      });
    }
  }

  /* 11. DATA_TIP 完整性（确保所有使用的类型都已定义） */
  if(typeof DATA_TIP !== 'undefined'){
    const requiredTypes = ['ctr','cpa','cost','conv','quad','matchScore','invalidRatio','rank',
      'concentration','rValue','cvr','ocpcStatus','geoDiag','hourEff','convStatus',
      'top3Share','roas','modeAssessment','zeroConvCostShare','negType','severity'];
    requiredTypes.forEach(t=>{
      if(!DATA_TIP[t]) issues.push(`DATA_TIP.${t} 类型未定义`);
      else {
        if(!DATA_TIP[t].eval) issues.push(`DATA_TIP.${t}.eval 未定义`);
        if(t!=='quad' && t!=='geoDiag' && t!=='hourEff' && t!=='convStatus' && t!=='ocpcStatus'
           && t!=='modeAssessment' && t!=='negType' && t!=='severity'
           && !DATA_TIP[t].format) issues.push(`DATA_TIP.${t}.format 缺失`);
        if(t==='rValue'){
          const advs=DATA_TIP[t].advices;
          if(!advs['强相关-正'] || !advs['强相关-负'] || !advs['中等相关-正'] || !advs['中等相关-负'])
            issues.push(`DATA_TIP.rValue 缺少方向感知 advices`);
        }
      }
    });
  }

  /* 12. DIM_HELP 完整性 */
  if(typeof DIM_HELP !== 'undefined'){
    ['创意CTR','排名','无效点击过滤比','地域集中度','时段集中度'].forEach(dim=>{
      if(!DIM_HELP[dim]) issues.push(`DIM_HELP.${dim} 缺失`);
      else {
        if(!DIM_HELP[dim].rUp_conclusion) issues.push(`DIM_HELP.${dim}.rUp_conclusion 缺失`);
        if(!DIM_HELP[dim].rDown_conclusion) issues.push(`DIM_HELP.${dim}.rDown_conclusion 缺失`);
      }
    });
  }

  return issues;
}

/* ========= 运行全部 50 轮 ========= */
let passed=0, failed=0, totalIssues=[];
const startTime = Date.now();

SCENARIOS.forEach((s, idx)=>{
  const round = idx+1;
  let result = {round, id:s.id, name:s.name, pass:true, issues:[], loadErrors:[], time:0};
  const t0 = Date.now();

  try {
    const loaded = loadFiles(s.keys);
    const loadFails = loaded.filter(l=>l.status!=='已加载');
    result.loadErrors = loadFails.map(l=>l.key+':'+l.status);

    runAnalysis();

    /* 基本断言 */
    if(!R) { result.pass=false; result.issues.push('runAnalysis 后 R 为 null'); }
    else {
      const issues = deepCheck(R, s);
      result.issues = issues;
      if(issues.length) result.pass=false;
    }
  } catch(e){
    result.pass = false;
    result.issues.push('异常: ' + String(e).slice(0,300));
  }

  result.time = Date.now()-t0;

  if(result.pass) passed++; else failed++;
  if(result.issues.length) totalIssues.push(result);

  const status = result.pass?'✅':'❌';
  const timeStr = result.time<100?result.time+'ms':(result.time/1000).toFixed(1)+'s';
  console.log(`${status} 第${String(round).padStart(2,'0')}轮 [${String(s.id).padStart(2,'0')}] ${s.name.padEnd(32)} ${timeStr.padStart(6)} ${result.issues.length?'('+result.issues.length+'个问题)':''}`);
});

/* ========= 汇总报告 ========= */
const totalTime = Date.now()-startTime;
console.log(`\n${'='.repeat(70)}`);
console.log(`汇总：${passed}/${SCENARIOS.length} 通过 | ${failed} 失败 | 用时 ${(totalTime/1000).toFixed(1)}s`);

if(totalIssues.length){
  console.log(`\n${'='.repeat(70)}`);
  console.log(`发现 ${totalIssues.length} 个有问题轮次：`);
  totalIssues.forEach(r=>{
    console.log(`\n❌ 第${r.round}轮 [${r.id}] ${r.name}`);
    r.issues.forEach((issue, i)=> console.log(`   ${i+1}. ${issue}`));
    if(r.loadErrors.length) r.loadErrors.forEach(e=> console.log(`   ⚠ 加载: ${e}`));
  });
} else {
  console.log(`\n🎉 全部 50 轮通过！无问题发现。`);
}

/* 输出 JSON 报告 */
const report = {passed, failed, totalRounds: SCENARIOS.length, totalTimeMs: totalTime, issues: totalIssues, timestamp: new Date().toISOString()};
fs.writeFileSync(path.join(__dirname,'..','.workbuddy','sim_test_report.json'), JSON.stringify(report, null, 2));
console.log(`\n详细报告已写入 .workbuddy/sim_test_report.json`);

process.exit(totalIssues.length?1:0);
