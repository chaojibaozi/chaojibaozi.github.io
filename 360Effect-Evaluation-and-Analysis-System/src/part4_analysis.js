/* ============ 分析引擎：指标计算 / 四象限 / 转化追踪 / 匹配度 / 创意 / 地域 / 规则引擎 ============ */

/* Bug H：全局预建索引（消除 O(n×维度) 全表 .filter 瓶颈），在 runAnalysis WITH-search 分支与 analyzeCovariation 内部填充 */
let IDX = null;

/* 文本归一化与相似度（bigram Dice + 包含加权） */
function normText(s){ return String(s||'').toLowerCase().replace(/[\s\-_，。、·【】\[\]{}()（）:：!！?？"'“”~～]/g,''); }
function bigrams(s){ const set=new Set(); for(let i=0;i<s.length-1;i++) set.add(s.slice(i,i+2)); if(s.length===1) set.add(s); return set; }
function matchScore(kw, query){
  const a=normText(kw), b=normText(query);
  if(!a||!b) return 0;
  if(a===b) return 100;
  if(b.includes(a)||a.includes(b)) return 90;
  const A=bigrams(a), B=bigrams(b);
  let inter=0; A.forEach(x=>{ if(B.has(x)) inter++; });
  const dice = 2*inter/(A.size+B.size);
  return Math.round(dice*100);
}
function matchLevel(score){ return score>=60?'高':(score>=30?'中':'低'); }
/* Bug H：预计算 bigram 的 Dice 相似度（复用调用方已算好的归一化串与 bigram 集合，避免每对重新 normText+bigrams） */
function diceScore(qNorm, qBig, kwNorm, kwBig){
  if(!qNorm || !kwNorm) return 0;
  if(!kwBig) return 0;
  if(qNorm===kwNorm) return 100;
  if(kwNorm.includes(qNorm) || qNorm.includes(kwNorm)) return 90;
  let inter=0; qBig.forEach(x=>{ if(kwBig.has(x)) inter++; });
  return Math.round(2*inter/(qBig.size+kwBig.size)*100);
}

/* ---------- 自适应工作流：数据覆盖检测（决定哪些诊断模块可运行） ---------- */
const MODULE_DEFS = [
  {id:'overview', name:'账户总览与告警', cat:'基础分析', need:['search']},
  {id:'quad', name:'关键词四象限', cat:'基础分析', need:['search']},
  {id:'conv', name:'转化词追踪', cat:'基础分析', need:['search']},
  {id:'query', name:'搜索词匹配度/否词', cat:'基础分析', need:['search']},
  {id:'cpa', name:'CPA基准归因', cat:'基础分析', need:['search']},
  {id:'shift', name:'转化关联诊断', cat:'基础分析', need:['search']},
  {id:'covar', name:'波动归因·多变量共变', cat:'基础分析', need:['search']},
  {id:'creative', name:'创意CTR分层', cat:'承载优化', need:['basic','adv'], or:true},
  {id:'geo', name:'地域四分法', cat:'承载优化', need:['geo']},
  {id:'rank', name:'排名三分支(分设备)', cat:'维度专项', need:['rank']},
  {id:'hour', name:'分时效率', cat:'维度专项', need:['hour']},
  {id:'invalid', name:'无效点击监控', cat:'维度专项', need:['invalid']},
  {id:'ocpc', name:'oCPC学习期', cat:'维度专项', need:['ocpc']}
];
function detectCoverage(){
  const typesPresent = [...new Set(FILES.map(f=>f.type))];
  const has = t => typesPresent.includes(t);
  const modules = MODULE_DEFS.map(m=>{
    const have = m.need.filter(t=>has(t));
    const ready = m.or ? have.length>0 : m.need.every(t=>has(t));
    return {id:m.id, name:m.name, cat:m.cat, need:m.need, have, ready, or:!!m.or};
  });
  const readyCount = modules.filter(m=>m.ready).length;
  /* 设备端作用域：文件名/表头双轨识别（见 detectDevice）。
     unknown = 文件名与表头均无设备拆分信号 → 该账户导出为 PC+移动 合并口径（如 xc捷配），按合并口径分析。 */
  const devSet = new Set(FILES.map(f=>(f.device||detectDevice(f.name,f.rows))).filter(d=>d && d!=='unknown'));
  const deviceScope = devSet.size===0 ? 'combined' : (devSet.size===1 ? [...devSet][0] : ((devSet.has('pc')&&devSet.has('mobile'))?'both':'mixed'));
  const deviceUnknown = FILES.filter(f=>(f.device||detectDevice(f.name,f.rows))==='unknown').length;
  const deviceNote = deviceScope==='combined'
    ? '本批报告为 PC+移动 合并口径（文件名与表头均无设备拆分列），按合并口径分析；如需分设备排名/出价建议，请分别导出 PC 与 移动 分设备报告（文件名含 PC/移动 或带 平均排名(移动端) 列）'
    : (deviceScope==='both'||deviceScope==='mixed' ? '已识别分设备报告，系统按 计划||组||词 同键合并并分设备呈现排名' : '设备端='+deviceScope);
  const modulesActive = modules.filter(m=>m.ready).map(m=>m.id);
  return { typesPresent, modules, modulesActive, readyCount, total:modules.length, deviceScope, deviceUnknown, deviceNote };
}
/* 揭示结果区：面板/导航须先显示，图表容器才有正确宽度（须在 renderAll 之前显示，否则 canvas 在 display:none 下宽度被钳到 320px 导致图表被压扁） */
function showResultUI(periodText){
  const imp=document.getElementById('importZone'); if(imp) imp.style.display='none';
  const pan=document.getElementById('panels'); if(pan) pan.style.display='block';
  const nav=document.getElementById('nav'); if(nav) nav.style.display='flex';
  const be=document.getElementById('btnExport'); if(be) be.disabled=false;
  const ba=document.getElementById('btnGlobalAI'); if(ba) ba.disabled=false;
  if(typeof updateAIModeUI==='function') updateAIModeUI();
  const pl=document.getElementById('periodLabel'); if(pl){ pl.textContent='📅 '+periodText; pl.style.display='inline-block'; }
  window.scrollTo(0,0);
}
function runAnalysis(){
  const cov = detectCoverage();
  R = { coverage: cov, deviceScope: cov.deviceScope, deviceUnknown: cov.deviceUnknown };
  const hasSearch = FILES.some(f=>f.type==='search');
  if(!hasSearch){
    /* 无搜索词报告：仅运行不依赖搜索词的独立维度模块，核心模块给安全空占位——实现"缺失其他模块文件也能分析" */
    const dup = mergeFiles();
    if(dup>0) toast('已自动去重 '+dup+' 行重复数据');
    R.noSearch = true; R.period = '未提供搜索词报告';
  const ocpcConvTotal = RAW.ocpc.reduce((s,r)=>s+(r.shallow||0)+(r.deep||0),0);
  R.convSource = (ocpcConvTotal>0)? 'oCPC' : 'none';   // 无搜索词时仍标注转化锚点来源（oCPC 含转化则回退到账户级 oCPC，否则 none）
    R.tot={cost:0,shows:0,clicks:0,ctr:0,conv:0,cpa:0}; R.daily=[]; R.dates=[];
    R.kws=[]; R.highCost=0; R.planStats=[]; R.modeStats=[]; R.zeroDays=[];
    R.convKws=[]; R.coreKws=[]; R.negList=[]; R.addList=[]; R.queries=[];
    R.creGroups=[]; R.weakCre=[]; R.advCompare=[]; R.geo=[];   // 注：geo/创意 将在下方 analyzeGeo/analyzeCreative 中按实际上传文件重新计算
    R.cpa=null; R.shift={data:[]};
    R.compare=null; R.rev=0; R.roas=0; R.valueCPA=0; R.convValue=0; R.valueMode='';
    R.convQueries=[]; R.stats=null; R.targetCPA=0; R.topCre=[];   // 搜索词派生字段缺省（renderConv/renderCreative 直接取 .length，须给安全空值）
    /* 无搜索词时，仍应运行不依赖搜索词的独立维度模块（geo / 创意 / 排名 / 分时 / 无效 / oCPC），
       不能把它们清空 —— 否则 renderGeo/renderCreative 显示为空甚至因未定义字段崩溃 */
    const creRes0 = analyzeCreative();
    R.creGroups=creRes0.creGroups; R.weakCre=creRes0.weakCre; R.topCre=creRes0.topCre; R.advCompare=creRes0.advCompare;
    const geoRes0 = analyzeGeo();
    R.geo=geoRes0.geo; R.geoTot=geoRes0.geoTot; R.geoAvgCtr=geoRes0.geoAvgCtr; R.geoAvgCpc=geoRes0.geoAvgCpc;
    R.rank=analyzeRank(); R.invalid=analyzeInvalid(); R.hour=analyzeHour(); R.ocpc=analyzeOcpc();
    /* 无搜索词时仍产出「波动归因（账户级，命中 oCPC/排名 转化锚点）+ 统一操作清单」，确保任意子集都给出结果与方法论优化建议（不依赖核心模块） */
    R.covar=analyzeCovariation(); R.actions=buildActions(R);
    /* #83 修复：推广组/计划/账户报告虽无转化列，但含真实 消耗/CTR/CPC 数据；无搜索词时也做计划级 CTR·消耗诊断，避免「只丢结构报告」时零输出 */
    const plDiag = analyzePlanLevel();
    if(plDiag.has){ R.planStats = plDiag.planStats; R.groupStats = plDiag.groupStats; R.actions = R.actions.concat(plDiag.actions); }
    renderAll();
    showResultUI('未提供搜索词报告');
    const diagTab=document.querySelector('nav .tab[data-p="p-diag"]');
    if(diagTab) switchTab(diagTab);   /* 无搜索词时核心模块为空占位，自动跳到已运行的维度专项诊断 */
    saveSnapshot({period:'未提供搜索词报告', savedAt:new Date().toLocaleString('zh-CN'), cost:0, conv:0, clicks:0, shows:0, convKw:{}});
    toast('已载入 '+cov.typesPresent.length+' 类报告；未提供搜索词报告，核心模块不可用，已运行可分析的维度模块');
    return;
  }
  R.noSearch = false;
  const dup = mergeFiles();
  if(dup>0) toast('已自动去重 '+dup+' 行重复数据');

  const S = RAW.search;
  const dates = [...new Set(S.map(r=>r.date))].sort();
  /* Bug H：预建 S 的 [日期]/[关键词] 索引，供 daily/zeroDays/analyzeConvSearchShift/bestAccountMatch 使用，避免全表 .filter */
  IDX = { SByDate: groupBy(S, r=>r.date), SByKw: groupBy(S, r=>r.kw) };
  const period = dates[0]+'至'+dates[dates.length-1];

  /* ---- 总览 KPI ---- */
  const tot = agg(S);
  let targetCPA = SET.targetCPA!=='' && !isNaN(parseFloat(SET.targetCPA)) ? parseFloat(SET.targetCPA) : (tot.conv>0? tot.cost/tot.conv : 200);
  const daily = dates.map(d=>{ const a=agg(IDX.SByDate[d]||[]); return Object.assign({date:d},a); });

  /* 转化来源识别：若搜索词报告无转化列/全 0（如盈拓数据集：转化仅存在于 oCPC 投放包），
     则以 oCPC 账户级（浅层+深度转化）作为总览转化口径，避免"有转化却显示 0"的失真。
     词级 CPA 归因仍不可用（oCPC 无 计划/组/词 维度）。 */
  const ocpcConvByDate = {};
  RAW.ocpc.forEach(r=>{ const d=r.date; ocpcConvByDate[d]=(ocpcConvByDate[d]||0)+(r.shallow||0)+(r.deep||0); });
  const ocpcConvTotal = Object.values(ocpcConvByDate).reduce((s,v)=>s+v,0);
  R.convSource = (tot.conv>0)? 'search' : (ocpcConvTotal>0? 'oCPC' : 'none');
  if(R.convSource==='oCPC'){
    tot.conv = ocpcConvTotal;
    tot.cpa = tot.conv>0? tot.cost/tot.conv : 0;
    targetCPA = SET.targetCPA!=='' && !isNaN(parseFloat(SET.targetCPA)) ? parseFloat(SET.targetCPA) : (tot.conv>0? tot.cost/tot.conv : 200);
    daily.forEach(d=>{ const c=ocpcConvByDate[d.date]||0; d.conv=c; d.cpa=c>0? d.cost/c : null; });
  }

  /* ---- 关键词聚合与四象限 ---- */
  const kwMap = groupBy(S, r=>r.kw);
  const kws = Object.entries(kwMap).map(([kw,rows])=>{
    const a=agg(rows);
    const byDate={}; rows.forEach(r=>{ byDate[r.date]=(byDate[r.date]||0)+r.conv; });
    const plans=[...new Set(rows.map(r=>r.plan))];
    const modes=[...new Set(rows.map(r=>r.mode))];
    return Object.assign({kw, plans, modes, byDate}, a);
  });
  const highCost = targetCPA * SET.costFactor;
  kws.forEach(k=>{
    k.cpa = k.conv>0? k.cost/k.conv : null;
    k.quad = k.cost>=highCost ? (k.conv>0?'A':'B') : (k.conv>0?'C':'D');
  });

  /* ---- 转化词分日矩阵与状态 ---- */
  const convKws = kws.filter(k=>k.conv>0).sort((a,b)=>b.conv-a.conv);
  const half = Math.ceil(dates.length/2);
  convKws.forEach(k=>{
    const firstHalf = dates.slice(0,half).reduce((s,d)=>s+(k.byDate[d]||0),0);
    const lastTwo = dates.slice(-2).reduce((s,d)=>s+(k.byDate[d]||0),0);
    const convDays = dates.filter(d=>(k.byDate[d]||0)>0).length;
    if(lastTwo>0 && firstHalf===0) k.status='新增';
    else if(firstHalf>0 && lastTwo===0 && k.conv>1) k.status='衰减';
    else if(k.conv<=1) k.status='偶发';
    else if(convDays>=3) k.status='稳定';
    else k.status='波动';
  });
  /* 二八法则：贡献80%转化的核心词 */
  let acc=0; const coreKws=[];
  for(const k of convKws){ acc+=k.conv; coreKws.push(k.kw); if(acc>=tot.conv*0.8) break; }

  /* ---- 零转化日诊断 ---- */
  const zeroDays = daily.filter(d=>d.cost>=SET.zeroConvCost && d.conv===0).map(d=>{
    const rows = IDX.SByDate[d.date]||[];
    const km = groupBy(rows, r=>r.kw);
    const wasted = Object.entries(km).map(([kw,rs])=>{const a=agg(rs);return {kw,cost:a.cost,clicks:a.clicks};})
      .filter(x=>x.cost>0).sort((a,b)=>b.cost-a.cost).slice(0,5);
    return {date:d.date, cost:d.cost, clicks:d.clicks, wasted};
  });

  /* ---- 搜索词聚合与匹配度 ---- */
  const qMap = groupBy(S, r=>r.query+'||'+r.kw+'||'+r.mode);
  const queries = Object.entries(qMap).map(([key,rows])=>{
    const [query,kw,mode]=key.split('||');
    const a=agg(rows);
    const score=matchScore(kw,query);
    return Object.assign({query,kw,mode,score,level:matchLevel(score)},a);
  }).sort((a,b)=>b.cost-a.cost);

  /* 全账户视角：搜索词全局转化、与账户词库最高匹配分（防止否词误伤品牌/相关词） */
  const kwSet = new Set(kws.map(k=>normText(k.kw)));
  const queryConvTotal={};
  queries.forEach(q=>{ queryConvTotal[q.query]=(queryConvTotal[q.query]||0)+q.conv; });
  const kwList = kws.map(k=>k.kw);
  /* Bug H：关键词 bigram 倒排索引 + 预存归一化串/bigram，bestAccountMatch 仅比对同词元候选且复用预计算，替代 否词×全量kwList 的二次遍历 */
  const kwNorm = new Map(), kwBigrams = new Map(), bigramToKws = new Map();
  kwList.forEach(kw=>{ const kn=normText(kw); const bs=bigrams(kn); kwNorm.set(kw,kn); kwBigrams.set(kw,bs); bs.forEach(b=>{ if(!bigramToKws.has(b)) bigramToKws.set(b,new Set()); bigramToKws.get(b).add(kw); }); });
  IDX.kwNorm = kwNorm; IDX.kwBigrams = kwBigrams; IDX.bigramToKws = bigramToKws;
  const bestMatchCache={};
  function bestAccountMatch(query){
    if(typeof global!=='undefined') global.__bam=(global.__bam||0)+1;
    if(bestMatchCache[query]!==undefined) return bestMatchCache[query];
    let best=0;
    const qn = normText(query), qb = bigrams(qn);
    if(qb.size){
      const cand = new Set();
      qb.forEach(b=>{ const s=IDX.bigramToKws.get(b); if(s) s.forEach(kw=>cand.add(kw)); });
      for(const k of cand){ const s=diceScore(qn, qb, IDX.kwNorm.get(k), IDX.kwBigrams.get(k)); if(s>best){ best=s; if(best>=90) break; } }
    }
    return bestMatchCache[query]=best;
  }
  /* 否词：按搜索词聚合；须满足 低匹配触发+全局零转化+达消费门槛+与整个账户词库均不相关。
     v8 增强：按触发模式给出「短语否定/精确否定」建议，并按消费×零转化严重度分级(P0/P1) */
  function classifyNeg(query){
    const q=(query||'').trim();
    const generic=/免费|价格|报价|多少钱|批发|国内|招聘|视频|下载|加盟|代理|公司|电话|地址|图片|怎么样|好不好|厂家|供应|求购|二手|贴吧|论坛|知乎|淘宝|京东|案例|范文|模板|破解|盗版|小说|游戏|电影|歌词|歌谱/i;
    if(q.length<=4 || generic.test(q)) return '短语否定';   // 短词根/通用词 → 包含即屏蔽，批量过滤无效人群
    return '精确否定';                                      // 具体无关长尾 → 完全一致才屏蔽，避免误伤相关流量
  }
  const negCand = queries.filter(q=>q.level==='低' && queryConvTotal[q.query]===0);
  const negMap = groupBy(negCand, q=>q.query);
  /* Bug H：先按消费门槛过滤，再对达门槛的候选算 bestAccountMatch（score<60 过滤依赖该值，但消费门槛可先行；
     AND 过滤可交换，结果集不变，却把 bestAccountMatch 调用从全部 negCand(十余万) 降到仅达消费门槛的候选(万级) */
  const negList = Object.entries(negMap).map(([query,list])=>{
    const cost=list.reduce((s,q)=>s+q.cost,0), clicks=list.reduce((s,q)=>s+q.clicks,0);
    const main=list.slice().sort((a,b)=>b.cost-a.cost)[0];
    const modes=[...new Set(list.map(q=>q.mode).filter(Boolean))];
    const negType=classifyNeg(query);
    const broadHit=modes.some(m=>/广泛|智能|短语/.test(m));
    const severity = (cost>=SET.zeroConvCost) || (cost>=50 && broadHit) ? 'P0':'P1';
    return {query, kw:main.kw, cost, clicks, modes, negType, severity, broadHit};
  }).filter(x=>x.cost>=SET.negMinCost)
    .map(x=>{ x.score=bestAccountMatch(x.query); return x; })
    .filter(x=>x.score<60)
    .sort((a,b)=> (a.severity==='P0'?0:1)-(b.severity==='P0'?0:1) || b.cost-a.cost);

  const convQueries = queries.filter(q=>q.conv>0).sort((a,b)=>b.conv-a.conv);
  /* 加词：搜索词尚未成为账户关键词才建议 */
  const addList = convQueries.filter(q=>!kwSet.has(normText(q.query)))
    .concat(queries.filter(q=>q.conv===0 && q.clicks>=3 && q.level==='高' && q.shows>0 && q.clicks/q.shows>=0.1 && !kwSet.has(normText(q.query))).slice(0,10));
  const addSeen=new Set(); const addFinal=addList.filter(q=>{ if(addSeen.has(q.query))return false; addSeen.add(q.query); return true; });

  /* ---- 触发模式质量（v8 增强：补全 CPA/转化率 + 过宽判定） ---- */
  const modeMap = groupBy(S, r=>r.mode);
  const modeStats = Object.entries(modeMap).map(([mode,rows])=>{
    const a=agg(rows);
    const scores=rows.map(r=>matchScore(r.kw,r.query));
    const avgScore = scores.length? scores.reduce((s,x)=>s+x,0)/scores.length : 0;
    return Object.assign({mode, avgScore, cpa:a.conv?a.cost/a.conv:null, convRate:a.clicks?a.conv/a.clicks:0}, a);
  }).sort((a,b)=>b.cost-a.cost);
  const matchMode = analyzeMatchMode(modeStats, tot, SET, queries);

  /* ---- 计划维度 ---- */
  const planStats = Object.entries(groupBy(S,r=>r.plan)).map(([plan,rows])=>Object.assign({plan},agg(rows))).sort((a,b)=>b.cost-a.cost);

  /* ---- 创意分析 / 地域分析：抽取为独立函数，供主路径与无搜索降级路径共用（修复：无搜索时 geo/创意 被清空、且 renderCreative 因 R.creGroups 未定义而崩溃） ---- */
  const creRes = analyzeCreative();
  const creGroups=creRes.creGroups, weakCre=creRes.weakCre, topCre=creRes.topCre, advCompare=creRes.advCompare;
  const geoRes = analyzeGeo();
  const geo=geoRes.geo, geoTot=geoRes.geoTot, geoAvgCtr=geoRes.geoAvgCtr, geoAvgCpc=geoRes.geoAvgCpc;

  /* ---- 跨周期对比 ---- */
  PREV = findPrev(period);
  let compare=null;
  if(PREV){
    const pk = PREV.convKw||{};
    const cur = {}; convKws.forEach(k=>cur[k.kw]=k.conv);
    const allKw = new Set([...Object.keys(pk), ...Object.keys(cur)]);
    const changes=[];
    allKw.forEach(kw=>{
      const p=pk[kw]||0, c=cur[kw]||0;
      let st;
      if(p===0&&c>0) st='新增'; else if(p>0&&c===0) st='流失'; else if(c>p) st='上升'; else if(c<p) st='下降'; else st='持平';
      changes.push({kw, prev:p, cur:c, st});
    });
    changes.sort((a,b)=>(b.cur+b.prev)-(a.cur+a.prev));
    compare = { period:PREV.period, cost:PREV.cost, conv:PREV.conv, clicks:PREV.clicks, shows:PREV.shows, changes };
  }

  R = Object.assign(R, { period, dates, daily, tot, targetCPA, highCost, kws, convKws, coreKws, zeroDays, queries, negList, addList:addFinal, convQueries, modeStats, matchMode, planStats, creGroups, weakCre, topCre, advCompare, geo, geoAvgCtr, geoAvgCpc, geoTot, compare });

  /* ---- 任务12：转化价值 / ROAS ---- */
  const convValue = SET.convValue || 0;
  const hasRevCol = RAW.search.length>0 && RAW.search.some(r=>typeof r.rev==='number');
  const valueMode = hasRevCol ? 'column' : 'unified';
  if(convValue>0){
    const applyRev = o=>{ if(valueMode==='unified') o.rev = o.conv*convValue; return o; };
    applyRev(tot); kws.forEach(applyRev); daily.forEach(applyRev);
  }
  R.rev = tot.rev||0;
  R.roas = tot.cost>0 && tot.rev>0 ? tot.rev/tot.cost : 0;
  R.valueCPA = tot.rev>0 ? tot.cost/tot.rev : null;
  R.convValue = convValue;
  R.valueMode = valueMode;

  R.cpa = (R.convSource==='oCPC')
    ? {baselineCPA:null, baselineDays:[], highDays:[], days:[], kwMatrix:[], kwCulprits:{}, factors:[], newTerms:[], spikedTerms:[], creShift:[], advShift:[], wastedCost:0, thresh: parseFloat(SET.cpaHighThresh)||50,
       note:'转化仅来自 oCPC 投放包（账户/投放包粒度），无关键词级转化数据，无法做词级 CPA 归因；账户级总转化已按 oCPC 口径计入总览。'}
    : analyzeCpaAttribution();
  R.stats = analyzeStats();
  R.shift = analyzeConvSearchShift();
  R.convDaily = analyzeConvKeywordDaily();   /* v9：分日转化关键词日度变化追踪（逐日 churn） */
  R.actions = buildActions(R);
  R.covar = analyzeCovariation();
  /* v6 维度专项诊断 */
  R.rank = analyzeRank();
  R.invalid = analyzeInvalid();
  R.hour = analyzeHour();
  R.ocpc = analyzeOcpc();

  /* 保存快照 */
  const convKwObj={}; convKws.forEach(k=>convKwObj[k.kw]=k.conv);
  saveSnapshot({ period, savedAt:new Date().toLocaleString('zh-CN'), cost:tot.cost, conv:tot.conv, clicks:tot.clicks, shows:tot.shows, convKw:convKwObj });

  renderAll();
  showResultUI(period);   /* 揭示结果区须在 renderAll 之后，确保 canvas 在可见容器绘制（避免图表被压扁） */
}

function agg(rows){
  const a=rows.reduce((s,r)=>({shows:s.shows+r.shows,clicks:s.clicks+r.clicks,cost:s.cost+r.cost,conv:s.conv+(r.conv||0),rev:s.rev+(r.rev||0)}),{shows:0,clicks:0,cost:0,conv:0,rev:0});
  a.ctr=a.shows?a.clicks/a.shows:0; a.cpc=a.clicks?a.cost/a.clicks:0; a.cpa=a.conv?a.cost/a.conv:null;
  a.roas=a.cost>0&&a.rev>0?a.rev/a.cost:0;
  return a;
}
function groupBy(arr, fn){ const m={}; arr.forEach(x=>{ const k=fn(x); (m[k]=m[k]||[]).push(x); }); return m; }

/* ---------- CPA 基准归因：以低转化成本日为基准，跨维度定位成本异动根因 ---------- */
function analyzeCpaAttribution(){
  const S = RAW.search;
  const dates = R.dates, daily = R.daily;
  const thresh = (typeof SET.cpaHighThresh==='number' && !isNaN(SET.cpaHighThresh)) ? SET.cpaHighThresh : 50;

  /* 1) 基准 CPA = 有转化日度 CPA 的中位数（抗极端值） */
  const convDays = daily.filter(d=>d.conv>0);
  const dayCpas = convDays.map(d=>({date:d.date, cpa:d.cost/d.conv, cost:d.cost, conv:d.conv}));
  let baselineCPA=null, baselineDays=[], highDays=[];
  if(dayCpas.length){
    const sorted=[...dayCpas].sort((a,b)=>a.cpa-b.cpa);
    const mid=Math.floor(sorted.length/2);
    baselineCPA = sorted.length%2 ? sorted[mid].cpa : (sorted[mid-1].cpa+sorted[mid].cpa)/2;
    baselineDays = dayCpas.filter(x=>x.cpa<=baselineCPA).map(x=>x.date);
    highDays = dayCpas.filter(x=>x.cpa > baselineCPA*(1+thresh/100)).map(x=>x.date);
  }
  const baseSet = new Set(baselineDays);

  /* 2) 日度 CPA 与偏离 */
  const days = daily.map(d=>{
    const cpa = d.conv>0? d.cost/d.conv : null;
    const dev = (cpa!=null && baselineCPA>0)? (cpa-baselineCPA)/baselineCPA : null;   // baselineCPA=0（某转化日 cost=0）时无法算相对偏离，置 null 防 Infinity/NaN
    return {date:d.date, cost:d.cost, conv:d.conv, cpa, dev,
      isBaseline: baseSet.has(d.date), isHigh: highDays.includes(d.date), isZero: d.conv===0};
  });

  /* 3) 关键词 × 日 矩阵 + 超额成本归因 */
  const kwDay={};
  S.forEach(r=>{ const k=r.kw,d=r.date; (kwDay[k]=kwDay[k]||{}); const o=kwDay[k][d]=kwDay[k][d]||{cost:0,conv:0}; o.cost+=r.cost; o.conv+=(r.conv||0); });
  const kwMatrix = R.kws.map(k=>{
    const perDay={}; const baseCpas=[];
    dates.forEach(d=>{ const o=kwDay[k.kw] && kwDay[k.kw][d]; if(o){ const cpa=o.conv>0?o.cost/o.conv:null; perDay[d]={cost:o.cost,conv:o.conv,cpa}; if(cpa!=null) baseCpas.push(cpa); } });
    const bc = baseCpas.length? [...baseCpas].sort((a,b)=>a-b)[Math.floor(baseCpas.length/2)] : null;
    return {kw:k.kw, perDay, baselineCpa:bc, cost:k.cost, conv:k.conv};
  });
  const kwBaseMap={}; kwMatrix.forEach(x=>kwBaseMap[x.kw]=x.baselineCpa);

  const kwCulprits={}; const factors=[];
  highDays.forEach(hd=>{
    const culprits=[];
    R.kws.forEach(k=>{
      const o = kwDay[k.kw] && kwDay[k.kw][hd]; if(!o) return;
      const base = kwBaseMap[k.kw] || baselineCPA;
      const contribution = o.conv===0 ? o.cost : Math.max(0, o.cost - o.conv*base);
      if(contribution>0.5) culprits.push({kw:k.kw, cost:o.cost, conv:o.conv, cpa:o.conv>0?o.cost/o.conv:null, contribution, baselineCpa:base});
    });
    culprits.sort((a,b)=>b.contribution-a.contribution);
    kwCulprits[hd]=culprits;
    const dayObj=days.find(x=>x.date===hd);
    const excess = Math.max(0, dayObj.cost - dayObj.conv*(baselineCPA||0));
    const top=culprits.slice(0,3);
    factors.push({date:hd, cpa:dayObj.cpa, baseline:baselineCPA, dev:dayObj.dev, excess,
      text:`${hd} CPA ¥${fmt(dayObj.cpa,1)} 较基准 ¥${baselineCPA?fmt(baselineCPA,1):'—'} 高 ${pct(dayObj.dev,0)}（当日消费 ¥${fmt(dayObj.cost)}、转化 ${dayObj.conv}、预估超额成本 ¥${fmt(excess,1)}）。主因关键词：${top.length?top.map(t=>`「${t.kw}」消耗¥${fmt(t.cost)}${t.conv?('/'+t.conv+'转'):'零转化'}`).join('、'):'当日转化词整体CPA均偏高'}`});
  });

  /* 4) 搜索词：新增/异动检测（出现在高异动日但基准日从未出现、且零转化 = 典型预算吞噬） */
  const qDay={};
  S.forEach(r=>{ const key=r.query+'||'+r.kw+'||'+r.mode, d=r.date; (qDay[key]=qDay[key]||{}); const o=qDay[key][d]=qDay[key][d]||{cost:0,conv:0,clicks:0,shows:0}; o.cost+=r.cost;o.conv+=(r.conv||0);o.clicks+=r.clicks;o.shows+=r.shows; });
  const qByQuery={};
  Object.entries(qDay).forEach(([key,byD])=>{ const [query,kw,mode]=key.split('||'); const g=qByQuery[query]=qByQuery[query]||{kw,mode,byD:{},totalCost:0,totalConv:0,onBaseline:false}; Object.entries(byD).forEach(([d,o])=>{ g.byD[d]=o; g.totalCost+=o.cost; g.totalConv+=o.conv; if(baseSet.has(d)) g.onBaseline=true; }); });
  const newTerms = Object.entries(qByQuery)
    .filter(([q,g])=> Object.keys(g.byD).some(d=>highDays.includes(d)) && !g.onBaseline && g.totalConv===0)
    .map(([q,g])=>({query:q, kw:g.kw, mode:g.mode, cost:g.totalCost, highDays:Object.keys(g.byD).filter(d=>highDays.includes(d))}))
    .sort((a,b)=>b.cost-a.cost);
  const spikedTerms = Object.entries(qByQuery)
    .filter(([q,g])=> g.onBaseline && Object.keys(g.byD).some(d=>highDays.includes(d)) )
    .map(([q,g])=>{ const baseCpas=[]; Object.entries(g.byD).forEach(([d,o])=>{ if(baseSet.has(d)&&o.conv>0) baseCpas.push(o.cost/o.conv); }); const bc=baseCpas.length?[...baseCpas].sort((a,b)=>a-b)[Math.floor(baseCpas.length/2)]:null; let worst={cpa:null,date:null}; Object.entries(g.byD).forEach(([d,o])=>{ if(highDays.includes(d)&&o.conv>0){ const c=o.cost/o.conv; if(worst.cpa==null||c>worst.cpa) worst={cpa:c,date:d}; } }); if(worst.cpa!=null&&bc&&worst.cpa>bc*(1+thresh/100)) return {query:q,kw:g.kw,baseCpa:bc,highCpa:worst.cpa,date:worst.date}; return null; })
    .filter(Boolean).sort((a,b)=>b.highCpa-b.highCpa);

  /* 5) 创意 / 高级样式：CTR·CPC 日度波动代理（创意报告无转化列，故以点击效率波动代理评估） */
  function shiftByTitle(rows, keyFn){
    const map={};
    rows.forEach(r=>{ const t=keyFn(r), d=r.date; (map[t]=map[t]||{}); const o=map[t][d]=map[t][d]||{cost:0,clicks:0,shows:0}; o.cost+=r.cost;o.clicks+=r.clicks;o.shows+=r.shows; });
    return Object.entries(map).map(([title,byD])=>{
      const baseCtrs=[], hi=[];
      dates.forEach(d=>{ const o=byD[d]; if(!o) return; const ctr=o.shows?o.clicks/o.shows:0; if(baseSet.has(d)) baseCtrs.push(ctr); if(highDays.includes(d)) hi.push({date:d,ctr,cpc:o.clicks?o.cost/o.clicks:0,cost:o.cost}); });
      const baseCtr = baseCtrs.length? baseCtrs.reduce((a,b)=>a+b,0)/baseCtrs.length : null;
      const shifts = hi.map(h=>({date:h.date, ctr:h.ctr, cpc:h.cpc, cost:h.cost, deltaPct: baseCtr? (h.ctr-baseCtr)/baseCtr : 0}))
        .filter(s=>s.deltaPct < -0.15).sort((a,b)=>a.deltaPct-b.deltaPct);
      return {title, baseCtr, shifts};
    }).filter(x=>x.baseCtr!=null && x.shifts.length);
  }
  const creShift = shiftByTitle(RAW.basic, r=>r.title);
  const advShift = shiftByTitle(RAW.adv, r=>r.plan+' / '+r.group);

  const wastedCost = days.filter(d=>d.isHigh).reduce((s,d)=> s + Math.max(0, d.cost - (d.conv||0)*(baselineCPA||0)), 0);

  return { baselineCPA, baselineDays, highDays, days, kwMatrix, kwCulprits, factors,
    newTerms, spikedTerms, creShift, advShift, wastedCost, thresh };
}

/* ---------- 规则引擎：操作清单 ---------- */
/* ---------- 匹配模式(触发模式)效率诊断（v8）：检测"匹配过宽"并给收匹配+否词建议 ----------
   关键修正：过宽信号必须用「同量纲」指标——该模式下"零转化搜索词"消耗占比(零转化cost/模式cost)，
   而非拿 convRate(转化/点击) 与 accountCtr(点击/展现) 这种量纲不同的量比较（会误伤主力模式）。 */
function analyzeMatchMode(modeStats, tot, SET, queries){
  if(!modeStats || !modeStats.length) return {has:false};
  const totalCost = modeStats.reduce((s,m)=>s+m.cost,0)||1;
  const totalConv = modeStats.reduce((s,m)=>s+(m.conv||0),0);
  const qByMode = groupBy((queries||[]).filter(q=>q.cost>0), q=>q.mode);
  modeStats.forEach(m=>{
    m.spendShare = m.cost/totalCost;
    m.convShare = totalConv? (m.conv||0)/totalConv : 0;
    const qs = qByMode[m.mode]||[];
    const zc = qs.filter(q=>q.conv===0).reduce((s,q)=>s+q.cost,0);
    m.zeroConvCostShare = qs.length? zc/m.cost : 0;   // 该模式触发词中"零转化搜索词"消耗占比（文献阈值>30%即匹配过宽）
  });
  const exact = modeStats.filter(m=>/精确/.test(m.mode));
  const broad = modeStats.filter(m=>/广泛|智能|短语/.test(m.mode) && !/精确/.test(m.mode));
  /* Bug D 修复：bestCPA 必须排除空 mode、零消费、零转化行——否则 (空 mode) 行 cpa=0.0 在升序中排首位会污染 bestCPA，
     导致"主导且最佳CPA的模式"仍被误判为 overBroad(建议收紧匹配)而伤及高转化词。 */
  const bestCPA = modeStats.filter(m=>m.cpa!=null && m.mode && m.cost>0 && (m.conv||0)>0).sort((a,b)=>a.cpa-b.cpa)[0];
  /* 过宽：消费份额>35% 且（零转化词消耗占比>30% 或 CPA 超最优模式1.5倍）。
     但「最佳CPA模式」即便零转化词占比偏高也不收紧匹配(否则伤及高转化词)——仅作否词清理提示(bestModeWaste)。 */
  const overBroad = bestCPA
    ? broad.filter(m=> m.mode!==bestCPA.mode && m.spendShare>0.35 && (m.zeroConvCostShare>0.30 || (m.cpa!=null && m.cpa > bestCPA.cpa*1.5)) )
    : broad.filter(m=> m.spendShare>0.35 && (m.zeroConvCostShare>0.30 || (m.cpa!=null && m.cpa > bestCPA.cpa*1.5)) );
  const bestModeWaste = bestCPA ? broad.filter(m=> m.mode===bestCPA.mode && m.zeroConvCostShare>0.30) : [];
  const exactBest = exact.length && bestCPA && /精确/.test(bestCPA.mode);
  const recs = overBroad.map(m=>({mode:m.mode, spendShare:m.spendShare, convShare:m.convShare, cpa:m.cpa, zeroConvCostShare:m.zeroConvCostShare}));
  const note = (overBroad.length
      ? '检测到「'+overBroad.map(m=>m.mode).join('、')+'」占消费 '+(overBroad.reduce((s,m)=>s+m.spendShare,0)*100).toFixed(0)+'%，且其触发词中零转化搜索词消耗占比达 '+(overBroad.reduce((s,m)=>s+m.zeroConvCostShare,0)/overBroad.length*100).toFixed(0)+'%（文献阈值>30%即匹配过宽）：建议收为短语/精确匹配 + 加否词围栏，把预算导向高意图词。'
      : '各触发模式消费/转化结构较均衡，未见明显匹配过宽（零转化词消耗占比均<30%）。')
    + (bestModeWaste.length ? ' 注：最佳CPA模式「'+bestModeWaste.map(m=>m.mode).join('、')+'」虽占主导且转化效率最优，但其触发词中零转化搜索词消耗占比仍达 '+(bestModeWaste.reduce((s,m)=>s+m.zeroConvCostShare,0)/bestModeWaste.length*100).toFixed(0)+'%，建议仅通过加否定词清理这些零转化搜索词、切勿整体收紧匹配以免伤及高转化词。' : '')
    + (exactBest ? ' 精确匹配 CPA ¥'+fmt(bestCPA.cpa,1)+' 为各模式最优，建议围绕高转化词拓精确匹配长尾锁住高意图流量。' : '')
    + (exact.length===0 ? ' 账户未使用精确匹配，建议对核心词补精确匹配以锁住高意图流量、降无效消耗。' : '');
  return {has:true, modes:modeStats, overBroad:recs, bestModeWaste, exactBest, bestCPA: bestCPA?bestCPA.mode:null, note};
}

/* #83 计划级诊断（仅用于「无搜索词」降级路径）：推广组/计划/账户报告无转化列，故只做 CTR·消耗·CPC 维度诊断，不做 CPA。
   聚合 计划报告(或上卷 推广组报告) → 计划级；推广组报告 → 推广组级；识别 消耗集中且低CTR / 高CPC / 低CTR推广组，给出方法论优化建议。 */
function analyzePlanLevel(){
  const hasPlan = RAW.plan.length>0, hasGrp = RAW.grp.length>0, hasAcct = RAW.acct.length>0;
  if(!hasPlan && !hasGrp && !hasAcct) return {has:false};
  const planRows = hasPlan ? RAW.plan : RAW.grp;
  const byPlan={};
  planRows.forEach(r=>{ const k=r.plan||'(未命名计划)'; const o=byPlan[k]=byPlan[k]||{plan:k,cost:0,clicks:0,shows:0}; o.cost+=(r.cost||0); o.clicks+=(r.clicks||0); o.shows+=(r.shows||0); });
  const planStats = Object.values(byPlan).map(o=>({plan:o.plan, cost:o.cost, clicks:o.clicks, shows:o.shows, ctr:o.shows?o.clicks/o.shows:0, cpc:o.clicks?o.cost/o.clicks:0})).sort((a,b)=>b.cost-a.cost);
  let groupStats=[];
  if(hasGrp){
    const byG={};
    RAW.grp.forEach(r=>{ const k=(r.plan||'')+'||'+(r.group||'(未命名组)'); const o=byG[k]=byG[k]||{plan:r.plan,group:r.group,cost:0,clicks:0,shows:0}; o.cost+=(r.cost||0); o.clicks+=(r.clicks||0); o.shows+=(r.shows||0); });
    groupStats=Object.values(byG).map(o=>({plan:o.plan,group:o.group,cost:o.cost,clicks:o.clicks,shows:o.shows,ctr:o.shows?o.clicks/o.shows:0,cpc:o.clicks?o.cost/o.clicks:0})).sort((a,b)=>b.cost-a.cost);
  }
  const totCost = planStats.reduce((s,p)=>s+p.cost,0)||1;
  const totShows = planStats.reduce((s,p)=>s+p.shows,0)||1;
  const totClicks = planStats.reduce((s,p)=>s+p.clicks,0)||1;
  const avgCtr = totShows? totClicks/totShows : 0;
  const avgCpc = totClicks? totCost/totClicks : 0;
  const acts=[];
  planStats.forEach(p=>{ const share=p.cost/totCost; if(share>0.30 && p.ctr < avgCtr*0.6){ acts.push({p:1, mod:'计划', act:`计划「${p.plan}」消耗占比达 ${(share*100).toFixed(0)}%（¥${p.cost.toFixed(0)}），但 CTR 仅 ${(p.ctr*100).toFixed(2)}% 远低于账户均值 ${(avgCtr*100).toFixed(2)}%：建议优化该计划下创意/落地页、收紧定向或拆分高/低意图词，避免预算被低质流量吸收。`}); } });
  planStats.forEach(p=>{ if(p.cpc > avgCpc*1.8 && p.cost>totCost*0.10){ acts.push({p:2, mod:'计划', act:`计划「${p.plan}」平均 CPC ¥${p.cpc.toFixed(2)} 高于账户均值 ¥${avgCpc.toFixed(2)} 的 1.8 倍：建议复查出价策略与竞争词，或在转化稀疏时段降出价。`}); } });
  groupStats.filter(g=>g.ctr < avgCtr*0.5 && g.cost>totCost*0.05).slice(0,5).forEach(g=>{ acts.push({p:2, mod:'推广组', act:`推广组「${g.group}」(计划 ${g.plan}) 消耗 ¥${g.cost.toFixed(0)} 但 CTR 仅 ${(g.ctr*100).toFixed(2)}%：建议检查搜索词相关性、否定词围栏与创意匹配度。`}); });
  if(!acts.length){ planStats.slice(0,3).forEach(p=>acts.push({p:2, mod:'计划', act:`计划「${p.plan}」消耗 ¥${p.cost.toFixed(0)}、CTR ${(p.ctr*100).toFixed(2)}%、CPC ¥${p.cpc.toFixed(2)}（账户均值 CTR ${(avgCtr*100).toFixed(2)}%）：结构尚可，可结合搜索词/转化报告进一步判断是否需加词或收匹配。`})); }
  const note = `已基于${hasPlan?'计划':''}${hasPlan&&hasGrp?'/':''}${hasGrp?'推广组':''}${hasAcct?'/账户':''}报告做计划级 CTR·消耗诊断（注：该类报告无转化列，无法算 CPA，优化建议以 CTR/消耗/CPC 为准）。`;
  return {has:true, planStats, groupStats, actions:acts, note, avgCtr, avgCpc, totCost};
}

function buildActions(R){
  const acts=[];
  /* P0：零转化日 */
  R.zeroDays.forEach(z=>{
    acts.push({p:0, mod:'账户总览', act:`${z.date} 消费 ¥${fmt(z.cost)} 但转化为 0（${z.clicks}次点击无效）。当日高消费词：${z.wasted.map(w=>w.kw+'(¥'+fmt(w.cost)+')').join('、')}。核查：转化跟踪是否正常 → 当日搜索词是否跑偏 → 落地页/客服是否异常`});
  });
  /* P0：B象限高消费无转化 */
  R.kws.filter(k=>k.quad==='B').sort((a,b)=>b.cost-a.cost).slice(0,8).forEach(k=>{
    acts.push({p:0, mod:'关键词', act:`「${k.kw}」消费 ¥${fmt(k.cost)}（${k.clicks}次点击）零转化，超目标CPA基准。动作：先收紧为精确匹配观察3天；仍无转化则降价50%或暂停；同时检查其触发的搜索词相关性`});
  });
  /* P0：核心转化词衰减 */
  R.convKws.filter(k=>k.status==='衰减' && R.coreKws.includes(k.kw)).forEach(k=>{
    acts.push({p:0, mod:'转化词', act:`核心转化词「${k.kw}」出现衰减（前期有转化、近2日归零）。动作：检查该词排名/出价是否被挤压、预算是否提前撞线、创意是否被换、搜索词是否被竞品分流`});
  });
  /* P1：准问题词（未达高消费分界但持续消耗零转化） */
  const nearB = R.kws.filter(k=>k.quad==='D' && k.cost>=R.highCost*0.25 && k.clicks>=2).sort((a,b)=>b.cost-a.cost).slice(0,10);
  if(nearB.length){
    acts.push({p:1, mod:'关键词', act:`${nearB.length} 个"准问题词"消费已达分界值25%以上且零转化，若下周期仍无转化将进入B象限：${nearB.map(k=>`${k.kw}(¥${fmt(k.cost)}/${k.clicks}击)`).join('、')}。动作：核查各词搜索词质量，竞品词类先降价30%控制试错成本`});
  }
  /* P1：否词（v8 增强：短语/精确分类 + P0/P1 分级） */
  if(R.negList.length){
    const p0=R.negList.filter(q=>q.severity==='P0').length;
    const phrase=R.negList.filter(q=>q.negType==='短语否定').length;
    const exact=R.negList.length-phrase;
    const top=R.negList.slice(0,15);
    acts.push({p:1, mod:'搜索词', act:`添加否定关键词 ${R.negList.length} 个（浪费消费合计 ¥${fmt(R.negList.reduce((s,q)=>s+q.cost,0))}；P0 高优先 ${p0} 个）。建议「短语否定」${phrase} 个（含即屏蔽，适合通用词根）→「精确否定」${exact} 个（完全一致才屏蔽，适合具体无关长尾）。优先：${top.map(q=>q.query+'('+q.negType+')').join('、')}`});
  }
  /* P1：加词 */
  R.addList.filter(q=>q.conv>0).slice(0,10).forEach(q=>{
    acts.push({p:1, mod:'搜索词', act:`搜索词「${q.query}」带来 ${q.conv} 个转化（经由关键词「${q.kw}」触发）。动作：将其直接提为精确匹配关键词单独出价，锁定该流量`});
  });
  /* P1：低效创意 */
  R.weakCre.slice(0,8).forEach(c=>{
    acts.push({p:1, mod:'创意', act:`[${c.g}]「${c.title.slice(0,30)}…」CTR ${pct(c.ctr)} 仅为同组均值 ${pct(c.gctr)} 的${Math.round(c.ctr/c.gctr*100)}%（${fmt0(c.shows)}次展示）。动作：暂停或重写，参考同组高CTR创意句式（数字承诺+免费/时效卖点+行动号召）`});
  });
  /* P1：oCPC扩触发质量 */
  const ocpc=R.modeStats.find(m=>m.mode.includes('oCPC')||m.mode.includes('扩'));
  if(ocpc && ocpc.avgScore<40 && ocpc.conv===0 && ocpc.cost>50){
    acts.push({p:1, mod:'触发模式', act:`oCPC扩触发流量匹配度均分仅 ${Math.round(ocpc.avgScore)}（消费 ¥${fmt(ocpc.cost)}、零转化）。动作：检查oCPC投放包扩量系数，必要时收紧扩触发范围或增加否词围栏`});
  }
  /* P1：匹配模式过宽（v8） */
  if(R.matchMode && R.matchMode.has && R.matchMode.overBroad.length){
    R.matchMode.overBroad.forEach(m=> acts.push({p:1, mod:'触发模式', act:`「${m.mode}」占消费 ${(m.spendShare*100).toFixed(0)}%，但其触发词中零转化搜索词消耗占比达 ${(m.zeroConvCostShare*100).toFixed(0)}%（>30% 阈值），匹配过宽导致无效流量。动作：收为短语/精确匹配 + 加否词围栏，把预算导向高意图词。`}));
    if(R.matchMode.bestModeWaste && R.matchMode.bestModeWaste.length){
      R.matchMode.bestModeWaste.forEach(m=> acts.push({p:2, mod:'触发模式', act:`最佳CPA模式「${m.mode}」占消费 ${(m.spendShare*100).toFixed(0)}%，但触发词中零转化搜索词消耗占比达 ${(m.zeroConvCostShare*100).toFixed(0)}%（>30%）：仅加否定词清理这些零转化搜索词，不要整体收紧匹配（会伤及高转化词）。`}));
    }
  }
  /* P1：CPA 基准归因 — 高异动日 */
  if(R.cpa && R.cpa.highDays.length){
    R.cpa.highDays.forEach(hd=>{
      const f = R.cpa.factors.find(x=>x.date===hd);
      const top = (R.cpa.kwCulprits[hd]||[]).slice(0,4);
      const news = R.cpa.newTerms.filter(t=>t.highDays.includes(hd)).slice(0,4);
      let detail = top.map(t=>`${t.kw}(¥${fmt(t.cost)}${t.conv?'/'+t.conv+'转':'零转化'})`).join('、');
      if(news.length) detail += '；新增无转化搜索词：'+news.map(t=>t.query).join('、');
      acts.push({p:1, mod:'CPA归因', act:`${hd} 转化成本异动（CPA ¥${fmt(f.cpa,1)} vs 基准 ¥${fmt(R.cpa.baselineCPA,1)}）：主因 ${detail}。动作：对该日零转化高消费词收匹配/否词；新增搜索词立即否词围栏；核对核心词排名与预算是否被挤压`});
    });
  }
  /* P1：地域（v8 增强：给出地域出价系数） */
  R.geo.filter(g=>g.diag==='收缩'||g.diag==='降价').forEach(g=>{
    acts.push({p:1, mod:'地域', act:`${g.region}：CPC ¥${fmt(g.cpc)}（账户均值¥${fmt(R.geoAvgCpc)}）、CTR ${pct(g.ctr)}。建议地域出价系数 ${g.bidCoef}（${g.bidLabel}）`});
  });
  /* P2：潜力词 */
  R.kws.filter(k=>k.quad==='C').sort((a,b)=>b.conv-a.conv).slice(0,6).forEach(k=>{
    acts.push({p:2, mod:'关键词', act:`潜力词「${k.kw}」低消费产出 ${k.conv} 转化（CPA ¥${fmt(k.cpa)}）。动作：小步提价10-20%抢排名、适度放开匹配、围绕它拓展同结构长尾词`});
  });
  /* P2：扩量地域（v8 增强：给出地域出价系数） */
  R.geo.filter(g=>g.diag==='扩量').forEach(g=>{
    acts.push({p:2, mod:'地域', act:`${g.region}：CTR ${pct(g.ctr)} 高于均值且 CPC ¥${fmt(g.cpc)} 低于均值。建议地域出价系数 ${g.bidCoef}（${g.bidLabel}）`});
  });
  /* P2：新增转化词培育 */
  R.convKws.filter(k=>k.status==='新增').forEach(k=>{
    acts.push({p:2, mod:'转化词', act:`新增转化词「${k.kw}」（近2日开始产出转化）。动作：保证预算与排名稳定，暂不调价，观察3-5天确认转化持续性后再加码`});
  });
  /* 价值维度（任务12） */
  if(R.convValue>0){
    acts.push({p:2, mod:'价值', act:`转化价值估算 ¥${fmt(R.rev)}、ROAS ${fmt(R.roas,2)}、价值加权CPA ¥${fmt(R.valueCPA)}。动作：价值加权CPA高于目标时优先压缩低ROAS关键词（保本线≈客单价对应的CPA）；ROAS偏低需排查转化质量与落地页承接`});
  }
  /* 统计严谨性提示（任务13） */
  if(R.stats && R.stats.lowSample){
    acts.push({p:2, mod:'统计', act:`本周期总转化仅 ${R.stats.total} 个（<30），日度CPA/CVR波动大半为统计噪声。动作：重要结论（衰减/新增）仅作观察信号，建议累计2-3周再下确定性结论；对单日异动谨慎调价`});
  }
  if(R.stats && R.stats.iqrOut.length){
    acts.push({p:1, mod:'统计', act:`除固定阈值外，IQR法另识别 ${R.stats.iqrOut.length} 个日度CPA统计离群日：${R.stats.iqrOut.join('、')}。动作：结合CPA归因交叉验证这些日是否真因结构变化而非随机波动`});
  }
  /* 维度专项（v6）：排名三分支 / oCPC / 无效点击 / 分时 —— 统一操作清单也纳入，确保"仅丢这些子集"也能给出优化建议（不依赖搜索词核心模块） */
  if(R.rank && R.rank.has){
    R.rank.diag.forEach(d=>{
      if(!d.primary) return;
      if(d.primary.verdict==='排名掉主导') acts.push({p:1, mod:'排名', act:`「${d.kw}」平均排名 ${d.primary.val.toFixed(2)} 位靠后（曝光被挤压），应抢排名：提质量度/加出价/扩匹配/收窄低效地域。${d.primary.note}`});
      else if(d.primary.verdict==='创意/标题差主导') acts.push({p:1, mod:'排名', act:`「${d.kw}」位置好(排名 ${d.primary.val.toFixed(2)})但CTR偏低，应改创意文案/卖点。${d.primary.note}`});
      else if(d.primary.verdict==='意图/匹配/落地页') acts.push({p:2, mod:'排名', act:`「${d.kw}」排名与CTR均好但转化低，问题在词路/匹配方式/落地页而非排名或创意。${d.primary.note}`});
      else acts.push({p:2, mod:'排名', act:`「${d.kw}」排名 ${d.primary.val.toFixed(2)} + CTR ${pct(d.ctr)} 呈混合/波动，需结合日度创意CTR与无效点击进一步定位。${d.primary.note||''}`});
    });
  }
  if(R.ocpc && R.ocpc.has){
    const ov = R.ocpc.totalDeep ? R.ocpc.totalCost/R.ocpc.totalDeep : null;
    if(R.ocpc.learning) acts.push({p:1, mod:'oCPC', act:`oCPC 处于学习/观察期：避免频繁否词、改落地页或大调预算出价；连续3天成本超基准±15%再干预。涉及包：${R.ocpc.pkgs.map(p=>p.pkg).slice(0,6).join('、')}`});
    else acts.push({p:2, mod:'oCPC', act:`oCPC 投放包已覆盖全周期、模型大概率稳定（${R.ocpc.pkgs.length} 个包，浅层 ${R.ocpc.totalShallow} / 深度 ${R.ocpc.totalDeep} 转化）；持续监控波动、按需优化。`});
    if(ov) R.ocpc.pkgs.filter(p=>p.deep>=5 && p.deepCPA && p.deepCPA>ov*1.5).slice(0,5).forEach(p=> acts.push({p:1, mod:'oCPC', act:`投放包「${p.pkg}」深度转化CPA ¥${fmt(p.deepCPA,1)} 高于账户均值 ¥${fmt(ov,1)} 的1.5倍（深度 ${p.deep}）；检查该包定向/否词围栏与落地页承接。`}));
  }
  if(R.invalid && R.invalid.has){
    if(R.invalid.avgRatio>30) acts.push({p:1, mod:'无效点击', act:`无效点击过滤比均值 ${R.invalid.avgRatio.toFixed(1)}% 超 30% 红线，疑似恶性无效流量；建议开启/加强过滤、核查高发日（${R.invalid.flags.slice(0,5).join('、')}）并比对竞品刷量。`});
    else if(R.invalid.flags.length) acts.push({p:2, mod:'无效点击', act:`${R.invalid.flags.length} 天过滤比超 15% 合格线（${R.invalid.flags.slice(0,5).join('、')}）；关注这些日真实流量是否被稀释，结合排名/创意看转化是否同步走低。`});
  }
  if(R.hour && R.hour.has){
    R.hour.worst.slice(0,3).forEach(h=> acts.push({p:2, mod:'分时', act:`${h.hour} CTR ${pct(h.ctr)} 显著低于均值且消费 ¥${fmt(h.cost)}（零点击高消费更甚），建议时段出价系数设为 ${h.bidMult}（${h.bidLabel}）。`}));
    R.hour.best.slice(0,3).forEach(h=> acts.push({p:2, mod:'分时', act:`${h.hour} CTR ${pct(h.ctr)} 高、效率好，建议时段出价系数 ${h.bidMult}（${h.bidLabel}）。`}));
  }
  /* P1/P2：分日转化词日度变化（v9 深挖） */
  if(R.convDaily && R.convDaily.has){
    const cd=R.convDaily;
    cd.lostStillSpending.forEach(c=> acts.push({p:1, mod:'转化词', act:`核心转化词「${c.kw}」已 ${c.daysSinceConv} 日无转化、近3日仍消费 ¥${fmt(c.recentCost)}（曾贡献 ${c.convTotal} 转化）——流失核心词仍在烧钱。动作：检查排名/出价是否被挤压、预算是否提前撞线、创意是否被替换、搜索词是否被竞品分流；若近3日持续零转化则暂停重审或否词/创意重建`}));
    cd.flickerCore.slice(0,8).forEach(c=> acts.push({p:2, mod:'转化词', act:`核心转化词「${c.kw}」转化间断（仅 ${c.presentDays}/${cd.dates.length} 天产出转化），稳定性差。动作：保障预算与排名稳定，避免转化时有时无；排查分日排名波动与预算分配`}));
    if(cd.concTrend.indexOf('风险')>=0) acts.push({p:2, mod:'转化词', act:`转化集中度上升（Top3 词占比 ${(cd.firstShare*100).toFixed(0)}%→${(cd.lastShare*100).toFixed(0)}%），过度依赖少数词。动作：培育中长尾转化词、拓展同结构长尾，分散单点波动风险`});
    // v10：生命周期断流 + 流失核心词 × 共变联动
    cd.lifecycle.filter(l=>!l.active && l.fadePct>=0.6).slice(0,6).forEach(l=> acts.push({p:2, mod:'转化词', act:`核心转化词「${l.kw}」生命周期 ${l.lifespanDays} 天、末次转化相对峰值衰减 ${(l.fadePct*100).toFixed(0)}%（峰值 ${l.peakConv} → 末次 ${l.tailConv}），呈"突然断流"。动作：复盘断流前后 排名/创意/匹配/落地页 变化，避免优质词白白流失`}));
    cd.lostCoreLink.forEach(x=>{
      const sig=x.signals.map(s=>s.dim).join('、');
      acts.push({p:2, mod:'转化词', act:`流失核心词「${x.kw}」于 ${x.lastConvDate} 后停止转化，且当日 排名/CTR/无效点击 同步劣化（${sig}）——共变引擎事件研究指向断流与流量质量/排名相关（相关性假设，非因果）。动作：核对流失当日 排名波动、创意CTR、无效点击过滤比，定位根因后重审预算/出价/创意`});
    });
  }
  acts.sort((a,b)=>a.p-b.p);
  return acts;
}

/* ---------- 任务15：多变量共变归因（高转化词/计划波动根因假设） ---------- */
/* 以 (date × 推广计划 × 推广组) 为对齐键，对波动日 join 创意CTR / 高级样式CTR / 搜索词结构，
   按「符号一致 × 幅度 × 常识」给出候选根因与排除项。结论为相关性假设，非因果定论。 */
/* ---------- 创意分析（基础/高级样式）：抽取为独立函数，供主路径与无搜索降级路径共用 ---------- */
function analyzeCreative(){
  const creGroups = Object.entries(groupBy(RAW.basic, r=>r.plan+' / '+r.group)).map(([gkey,rows])=>{
    const a=agg(rows);
    const titles = Object.entries(groupBy(rows,r=>r.title)).map(([title,rs])=>{
      const t=agg(rs); t.title=title; t.ctr=t.shows? t.clicks/t.shows:0; return t;
    }).sort((x,y)=>y.shows-x.shows);
    const gctr = a.shows? a.clicks/a.shows:0;
    return {gkey, shows:a.shows, clicks:a.clicks, cost:a.cost, gctr, titles};
  }).sort((a,b)=>b.cost-a.cost);
  const weakCre=[], topCre=[];
  creGroups.forEach(g=>{
    g.titles.forEach(t=>{
      if(t.shows>=50 && g.gctr>0 && t.ctr < g.gctr*(SET.ctrLowPct/100)) weakCre.push({g:g.gkey, title:t.title, shows:t.shows, ctr:t.ctr, gctr:g.gctr});
      if(t.shows>=50) topCre.push({g:g.gkey, title:t.title, shows:t.shows, clicks:t.clicks, ctr:t.ctr});
    });
  });
  topCre.sort((a,b)=>b.ctr-a.ctr);
  /* 高级 vs 基础（推广组级对比） */
  const advByGroup = Object.entries(groupBy(RAW.adv, r=>r.plan+' / '+r.group)).map(([gkey,rows])=>{const a=agg(rows);return {gkey, shows:a.shows,clicks:a.clicks,cost:a.cost,ctr:a.shows?a.clicks/a.shows:0,cpc:a.clicks?a.cost/a.clicks:0};});
  const basicByGroup = {}; creGroups.forEach(g=>basicByGroup[g.gkey]={ctr:g.gctr,cpc:g.clicks?g.cost/g.clicks:0,shows:g.shows,cost:g.cost});
  const advCompare = advByGroup.map(a=>({gkey:a.gkey, adv:a, basic:basicByGroup[a.gkey]||null})).sort((a,b)=>b.adv.cost-a.adv.cost);
  return { creGroups, weakCre, topCre, advCompare };
}
/* ---------- 地域分析：抽取为独立函数，供主路径与无搜索降级路径共用 ---------- */
function analyzeGeo(){
  /* 地域报告最细粒度为 计划×组×省×市（一行=一个省市单元）。优先按「城市」聚合（若报告含「城市」列），
     否则按「省级地区」聚合回省份口径——避免城市级数据被静默坍缩到省级、也避免碎片行顶替 Top 省份（压力测试发现的真实 bug）。 */
  const byRegion={};
  RAW.geo.forEach(r=>{
    const province = r.region || '未知';
    const city = (r.city||'').trim();
    const key = city ? (province+'|'+city) : province;       // 省|市 作键，防重名城市跨省碰撞
    const label = city ? (city+'（'+province+'）') : province; // 显示带省名，便于定位
    const g = byRegion[key] || (byRegion[key]={region:label, province, shows:0, clicks:0, cost:0});
    g.shows += (r.shows||0); g.clicks += (r.clicks||0); g.cost += (r.cost||0);
  });
  const geo = Object.values(byRegion).map(g=>({region:g.region, province:g.province, shows:g.shows, clicks:g.clicks, cost:g.cost, ctr:g.shows?g.clicks/g.shows:0, cpc:g.clicks?g.cost/g.clicks:0})).sort((a,b)=>b.cost-a.cost);
  const geoTot = geo.reduce((s,g)=>({shows:s.shows+g.shows,clicks:s.clicks+g.clicks,cost:s.cost+g.cost}),{shows:0,clicks:0,cost:0});
  const geoAvgCtr = geoTot.shows? geoTot.clicks/geoTot.shows:0;
  const geoAvgCpc = geoTot.clicks? geoTot.cost/geoTot.clicks:0;
  geo.forEach(g=>{
    let coef=1.0, label='维持';
    if(g.cost < geoTot.cost*0.02){ g.diag='观察'; g.advice='消费占比低，暂观察'; g.bidCoef=1.0; g.bidLabel='维持'; return; }
    const hiCpc = g.cpc > geoAvgCpc*1.3, loCtr = g.ctr < geoAvgCtr*0.6;
    if(hiCpc && loCtr){ g.diag='收缩'; g.advice='CPC高且CTR低'; coef=0.7; label='-30% 收缩/暂停'; }
    else if(hiCpc){ g.diag='降价'; g.advice='CPC显著高于均值：下调出价'; coef=0.85; label='-15% 降价'; }
    else if(g.ctr>geoAvgCtr*1.2 && g.cpc<geoAvgCpc){ g.diag='扩量'; g.advice='高CTR低CPC优质地域：可提预算/出价系数扩量'; coef=1.2; label='+20% 扩量'; }
    else { g.diag='保持'; g.advice='效率正常，保持现状'; coef=1.0; label='维持'; }
    g.bidCoef=coef; g.bidLabel=label;
  });
  return { geo, geoTot, geoAvgCtr, geoAvgCpc,
    note:'地域报告为账户级（无计划/组维度）。建议结合 360 点睛「地域出价系数」(计划维度, 1.0–10.0) 对高 CTR 低 CPC 省份提系数扩量、对高 CPC 低 CTR 省份降系数或收缩；本批为 PC+移动 合并口径，无法分设备评估。' };
}

/* ---------- 波动归因「大脑」：跨维度同步变化共变引擎（v6） ----------
   以「日期×计划×推广组×关键词」为对齐键，对高转化单元逐日对齐 创意CTR / 排名 / 无效点击过滤比 / 地域集中度 / 时段集中度 等候选变量，
   计算转化(及消费)与各候选变量的 Pearson 相关系数，给出「可能驱动变量」分级假设（严格标注相关性、非因果）。
   并做计划类型感知（预算/曝光驱动 vs 意图错配 vs 空转型）与高消费零转化「空转单元」检测。
   自适应：仅使用已载入的维度文件，缺哪些维度就在 note 中明确说明；锚点优先搜索词(分日深层)，无则用排名文件(分日浅层+深层)。 */
function analyzeCovariation(){
  let dates=R.dates;
  if(!dates || !dates.length){
    /* 无搜索词降级分支：R.dates 为空，但从已载入维度文件推导日期全集，使排名/oCPC 等子集也能做账户级共变归因 */
    const set=new Set();
    ['ocpc','rank','geo','basic','adv','invalid','hour','search','kw','grp','plan','acct'].forEach(t=>{ (RAW[t]||[]).forEach(r=>{ if(r.date) set.add(r.date); }); });
    dates=[...set].sort();
  }
  if(!dates.length) return {units:[],planTypes:[],emptyRuns:[],note:'无分日数据，无法做波动归因',hasAnchor:false,anchorSource:null};

  const ctrOf = o => (o&&o.shows)? o.clicks/o.shows : null;
  const aggSum = rows => { const o={shows:0,clicks:0,cost:0,conv:0,shallow:0}; rows.forEach(r=>{ o.shows+=(r.shows||0); o.clicks+=(r.clicks||0); o.cost+=(r.cost||0); o.conv+=(r.conv||0); o.shallow+=(r.shallow||0); }); return o; };
  const creRows = RAW.basic.concat(RAW.adv);
  function pairP(x,y){ const xs=[],ys=[]; for(let i=0;i<x.length;i++){ if(x[i]!=null && y[i]!=null){ xs.push(x[i]); ys.push(y[i]); } } return [xs,ys]; }
  function corrOf(conv, arr){ const [x,y]=pairP(conv, arr); return x.length>=3? pearson(x,y) : NaN; }

  const hasSearch = RAW.search.length>0 && RAW.search.some(r=>r.conv>0);
  const hasRank = RAW.rank.length>0 && RAW.rank.some(r=> (r.conv||0)>0 || (r.shallow||0)>0 );
  const hasOcpc = RAW.ocpc.length>0 && RAW.ocpc.some(r=> (r.shallow||0)+(r.deep||0)>0 );
  let anchor=null, anchorSource='', anchorLevel='';
  if(hasSearch){ anchor=RAW.search; anchorSource='搜索词报告(分日深层转化)'; anchorLevel='unit'; }
  else if(hasRank){ anchor=RAW.rank; anchorSource='平均排名文件(分日浅层+深层转化)'; anchorLevel='unit'; }
  else if(hasOcpc){ anchorSource='oCPC投放包(账户级浅层+深度转化)'; anchorLevel='account'; }
  if(!anchor && anchorLevel!=='account') return {units:[],planTypes:[],emptyRuns:[],note:'未导入任何含转化的报告（搜索词/排名/oCPC），无转化锚点',hasAnchor:false,anchorSource:null};

  /* Bug H：预建索引（一次性），替代 seriesFor/planTypes 内 O(单元×日期×n) 全表 .filter */
  const anchorByDatePlan = {};
  if(anchor) anchor.forEach(r=>{ const k=r.date+'||'+r.plan; (anchorByDatePlan[k]=anchorByDatePlan[k]||[]).push(r); });
  const creByDate = groupBy(creRows, r=>r.date);
  const creByDatePlan = {};
  creRows.forEach(r=>{ const k=r.date+'||'+r.plan; (creByDatePlan[k]=creByDatePlan[k]||[]).push(r); });
  const rankByDatePlan = {};
  RAW.rank.forEach(r=>{ const k=r.date+'||'+r.plan; (rankByDatePlan[k]=rankByDatePlan[k]||[]).push(r); });
  const ocpcByDate = groupBy(RAW.ocpc, r=>r.date);

  /* —— 账户级共变（仅 oCPC 含转化，无搜索词/排名词级锚点） —— */
  if(anchorLevel==='account'){
    const convByDate={}, costByDate={};
    dates.forEach(d=>{ const oc=ocpcByDate[d]||[]; convByDate[d]=oc.reduce((s,r)=>s+(r.shallow||0)+(r.deep||0),0); costByDate[d]=oc.reduce((s,r)=>s+(r.cost||0),0); });
    const ctrByDate={}; if(creRows.length){ dates.forEach(d=>{ const rs=creByDate[d]||[]; const sh=rs.reduce((s,r)=>s+(r.shows||0),0), cl=rs.reduce((s,r)=>s+(r.clicks||0),0); ctrByDate[d]= sh? cl/sh:null; }); }
    const invByDate={}; RAW.invalid.forEach(r=> invByDate[r.date]=r.ratio);
    const geoByDate={}; if(RAW.geo.length){ const byD={}; RAW.geo.forEach(r=>(byD[r.date]=byD[r.date]||[]).push(r)); Object.entries(byD).forEach(([d,rs])=>{ const tot=rs.reduce((s,x)=>s+x.cost,0)||1; const reg={}; rs.forEach(x=>{ reg[x.region]=(reg[x.region]||0)+x.cost; }); const top=Object.entries(reg).sort((a,b)=>b[1]-a[1])[0]; geoByDate[d]={share: top? top[1]/tot : 0}; }); }
    const hourByDate={}; if(RAW.hour.length){ const byD={}; RAW.hour.forEach(r=>(byD[r.date]=byD[r.date]||[]).push(r)); Object.entries(byD).forEach(([d,rs])=>{ const tot=rs.reduce((s,x)=>s+x.cost,0)||1; hourByDate[d]= rs.slice().sort((a,b)=>b.cost-a.cost).slice(0,3).reduce((s,x)=>s+x.cost,0)/tot; }); }
    const dims=[]; if(creRows.length) dims.push('创意CTR'); if(RAW.invalid.length) dims.push('无效点击过滤比'); if(RAW.geo.length) dims.push('地域集中度'); if(RAW.hour.length) dims.push('时段集中度');
    const cand = { '创意CTR': dates.map(d=>ctrByDate[d]), '无效点击过滤比': dates.map(d=> invByDate[d]!=null? invByDate[d]/100:null), '地域集中度': dates.map(d=> geoByDate[d]? geoByDate[d].share:null), '时段集中度': dates.map(d=> hourByDate[d]!=null? hourByDate[d]:null) };
    const conv=dates.map(d=>convByDate[d]);
    const drivers=[]; Object.entries(cand).forEach(([dim,arr])=>{ if(!arr.some(v=>v!=null)) return; const r=corrOf(conv,arr); if(!isNaN(r)){ const absR=Math.abs(r); const strength=absR>=0.6?'强':(absR>=0.35?'中':'弱'); let hyp=''; if(dim==='创意CTR') hyp = r>0?'创意吸引力提升伴随转化上升，创意/标题是正向杠杆':'高点击率但转化反而低——标题吸引人（CTR高）但落地页让人失望（转化低），创意吸引力≠转化力'; else if(dim==='无效点击过滤比') hyp = r>0?'过滤比升高日转化更高（无效流量被滤除后质量改善）':'过滤比升高日转化走低（无效流量吞噬预算，真实流量更小）'; else if(dim==='地域集中度') hyp = r>0?'投放越集中于高转化省份转化越好（聚焦策略有效）':'地域越集中转化反而越差（过度聚焦漏掉了其他省份的转化机会）'; else if(dim==='时段集中度') hyp = r>0?'越集中于高效时段转化越好（时段策略有效）':'时段越集中转化反而越差（只砸少数时段漏掉其他转化机会）'; drivers.push({dim,r,dir:r>=0?'↑':'↓',strength,hyp}); } });
    drivers.sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
    const units = drivers.length? [{ scope:'账户', target:'全账户(oCPC汇总)', plan:'(oCPC投放包汇总)', group:'(全部)', anchorSource, drivers, excludes: dims.filter(d=>!drivers.some(x=>x.dim===d)), convTotal: dates.reduce((s,d)=>s+convByDate[d],0) }] : [];
    const missing=['创意CTR','排名','无效点击过滤比','地域集中度','时段集中度'].filter(d=>!dims.includes(d));
    const note='相关性假设，非因果定论。锚点来源：'+anchorSource+'（oCPC 仅到投放包/账户粒度，无法对齐到 计划/组/词，故仅做【账户级】跨维度共变；词/组级波动归因需补导搜索词报告(分日,含转化数) 或 排名分日文件）。已参与共变维度：'+(dims.join('、')||'无')+(missing.length?'；未导入故未参与：'+missing.join('、')+'（补导对应分日报告可解锁）。':'。')+'结论须结合业务常识复核。';
    return { units, planTypes:[], emptyRuns:[], note, hasAnchor:true, anchorSource };
  }

  const useSearch = anchorLevel==='unit' && hasSearch;

  /* 账户级每日标量（地域/小时/无效点击无计划组维度，按日对齐到各单元） */
  const invByDate={}; RAW.invalid.forEach(r=>{ invByDate[r.date]=r.ratio; });
  const geoByDate={};
  if(RAW.geo.length){
    const byD={}; RAW.geo.forEach(r=>{ (byD[r.date]=byD[r.date]||[]).push(r); });
    Object.entries(byD).forEach(([d,rs])=>{ const tot=rs.reduce((s,x)=>s+x.cost,0)||1; const reg={}; rs.forEach(x=>{ reg[x.region]=(reg[x.region]||0)+x.cost; }); const top=Object.entries(reg).sort((a,b)=>b[1]-a[1])[0]; const topReg=top?top[0]:null; const tr=rs.filter(x=>x.region===topReg); const tsh=tr.reduce((s,x)=>s+x.shows,0), tcl=tr.reduce((s,x)=>s+x.clicks,0); geoByDate[d]={ region:topReg, share: top? top[1]/tot:0, ctr: tsh? tcl/tsh:0 }; });
  }
  const hourByDate={};
  if(RAW.hour.length){
    const byD={}; RAW.hour.forEach(r=>{ (byD[r.date]=byD[r.date]||[]).push(r); });
    Object.entries(byD).forEach(([d,rs])=>{ const tot=rs.reduce((s,x)=>s+x.cost,0)||1; const top3=rs.slice().sort((a,b)=>b.cost-a.cost).slice(0,3); hourByDate[d]= top3.reduce((s,x)=>s+x.cost,0)/tot; });
  }

  /* 生成某 (计划[,组[,词]]) 的逐日候选变量序列 */
  function seriesFor(plan, group, kw){
    const conv=[],cost=[],shows=[],ctrC=[],rank=[],inv=[],geo=[],hour=[];
    dates.forEach(d=>{
      const aRows = (anchorByDatePlan[d+'||'+plan]||[]).filter(r=> (group==null||r.group===group) && (kw==null||r.kw===kw));
      const a = aggSum(aRows);
      conv.push(useSearch? a.conv : (a.conv+a.shallow));
      cost.push(a.cost); shows.push(a.shows);
      const cre = aggSum((creByDatePlan[d+'||'+plan]||[]).filter(r=> (group==null||r.group===group)));
      ctrC.push(cre.shows? cre.clicks/cre.shows : null);
      const rkRows = (rankByDatePlan[d+'||'+plan]||[]).filter(r=> (group==null||r.group===group) && (kw==null||r.kw===kw));
      let rks=0, rkw=0;
      rkRows.forEach(r=>{ const devs=Object.values(r.ranks||{}); if(!devs.length) return; const avg=devs.reduce((x,y)=>x+y,0)/devs.length; rks+=avg*(r.shows||1); rkw+=(r.shows||0); });
      rank.push(rkw>0? rks/rkw : null);
      inv.push(invByDate[d]!=null? invByDate[d]/100 : null);
      geo.push(geoByDate[d]? geoByDate[d].share : null);
      hour.push(hourByDate[d]!=null? hourByDate[d] : null);
    });
    return {conv,cost,shows,ctrC,rank,inv,geo,hour};
  }

  const dims=[];
  if(creRows.length) dims.push('创意CTR');
  if(RAW.rank.length) dims.push('排名');
  if(RAW.invalid.length) dims.push('无效点击过滤比');
  if(RAW.geo.length) dims.push('地域集中度');
  if(RAW.hour.length) dims.push('时段集中度');

  function driversOf(plan, group, kw){
    const s = seriesFor(plan,group,kw);
    const cand = { '创意CTR':s.ctrC, '排名':s.rank, '无效点击过滤比':s.inv, '地域集中度':s.geo, '时段集中度':s.hour };
    const drivers=[];
    Object.entries(cand).forEach(([dim,arr])=>{
      if(!arr.some(v=>v!=null)) return;
      const r = corrOf(s.conv, arr);
      if(!isNaN(r)){
        const absR=Math.abs(r);
        const strength = absR>=0.6?'强':(absR>=0.35?'中':'弱');
        let hyp='';
        if(dim==='创意CTR') hyp = r>0?'创意吸引力提升伴随转化上升，创意/标题是正向杠杆':'高点击率但转化反而低——标题吸引人（CTR高）但落地页让人失望（转化低），创意吸引力≠转化力';
        else if(dim==='排名') hyp = r>0?'排名靠后（数值大）伴随转化上升，靠后位次转化成本可能更低':'排名靠后（数值大）伴随转化走低，抢排名是核心杠杆';
        else if(dim==='无效点击过滤比') hyp = r>0?'过滤比升高日转化更高（无效流量被滤除后质量改善）':'过滤比升高日转化走低（无效流量吞噬预算，真实流量更小）';
        else if(dim==='地域集中度') hyp = r>0?'投放越集中于高转化省份转化越好（聚焦策略有效）':'地域越集中转化反而越差（过度聚焦漏掉了其他省份的转化机会）';
        else if(dim==='时段集中度') hyp = r>0?'越集中于高效时段转化越好（时段策略有效）':'时段越集中转化反而越差（只砸少数时段漏掉其他转化机会）';
        drivers.push({ dim, r, dir: r>=0?'↑':'↓', strength, hyp });
      }
    });
    drivers.sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
    const excludes = dims.filter(d=>!drivers.some(x=>x.dim===d));
    return { drivers, excludes };
  }

  const units=[];
  /* 关键词（高转化，conv>=3） */
  R.convKws.filter(k=>k.conv>=3).sort((a,b)=>b.conv-a.conv).slice(0,5).forEach(k=>{
    const rows = anchor.filter(r=>r.kw===k.kw);
    const gMap=groupBy(rows, r=> r.plan+'||'+r.group); let mg=null,mx=0;
    Object.entries(gMap).forEach(([g,rs])=>{ const c=rs.reduce((s,x)=>s+x.cost,0); if(c>mx){ mx=c; mg=g; } });
    if(!mg) return; const [plan,group]=mg.split('||');
    const {drivers,excludes}=driversOf(plan,group,k.kw);
    if(drivers.length) units.push({ scope:'关键词', target:k.kw, plan, group, anchorSource, drivers, excludes, convTotal:k.conv });
  });
  /* 计划（Top3） */
  [...R.planStats].sort((a,b)=>b.conv-a.conv).slice(0,3).forEach(p=>{
    const {drivers,excludes}=driversOf(p.plan,null,null);
    if(drivers.length) units.push({ scope:'计划', target:p.plan, plan:p.plan, group:'(全部组)', anchorSource, drivers, excludes, convTotal:p.conv });
  });
  /* 推广组（Top3，从锚点直接聚合，避免依赖 R.grpStats 是否存在） */
  const grpAgg={}; anchor.forEach(r=>{ const k=r.plan+'||'+r.group; const o=grpAgg[k]=grpAgg[k]||{cost:0,conv:0,clicks:0}; o.cost+=(r.cost||0); o.conv+=(useSearch?r.conv:(r.conv+r.shallow)); o.clicks+=(r.clicks||0); });
  Object.entries(grpAgg).map(([k,o])=>({k, ...o})).sort((a,b)=>b.conv-a.conv).slice(0,3).forEach(g=>{
    const [plan,group]=g.k.split('||');
    const {drivers,excludes}=driversOf(plan,group,null);
    if(drivers.length) units.push({ scope:'推广组', target:plan+' / '+group, plan, group, anchorSource, drivers, excludes, convTotal:g.conv });
  });

  /* 计划类型感知 + 空转检测（高消费零转化） */
  const planTypes=[], emptyRuns=[];
  const emptyThr = parseFloat(SET.zeroConvCost)||300;
  R.planStats.forEach(p=>{
    const byDate={}; dates.forEach(d=>{ const rs=anchorByDatePlan[d+'||'+p.plan]||[]; byDate[d] = rs.reduce((s,r)=>s+(useSearch?r.conv:(r.conv+r.shallow)),0); });
    const convByDate = dates.map(d=>byDate[d]);
    const costByDate = dates.map(d=> aggSum(anchorByDatePlan[d+'||'+p.plan]||[]).cost);
    const rCC = convByDate.reduce((a,b)=>a+b,0)>0 ? corrOf(convByDate, costByDate) : NaN;
    const cvr = p.clicks? p.conv/p.clicks : 0;
    let type, lever;
    if(p.conv===0 && p.cost>=emptyThr){ type='空转型'; lever='否词/匹配收放 + 创意重写 + 暂停重审（360 空转计划规则：高消费0转化应暂停或重建）'; emptyRuns.push({scope:'计划',name:p.plan,cost:p.cost,conv:0}); }
    else if(cvr>=0.02 && !isNaN(rCC) && rCC>=0.5){ type='预算/曝光驱动型'; lever='加预算/扩地域/加投高效时段（转化随曝光同步上升）'; }
    else if(p.conv>0){ type='意图/转化型'; lever='保排名 + 否词精修 + 落地页匹配（转化稳定，重在守住）'; }
    else { type='观察型'; lever='小额培育，观察匹配度与创意'; }
    planTypes.push({ plan:p.plan, cost:p.cost, conv:p.conv, cvr, corrConvCost:isNaN(rCC)?null:rCC, type, lever });
  });
  Object.entries(grpAgg).forEach(([k,o])=>{ if(o.conv===0 && o.cost>=emptyThr) emptyRuns.push({scope:'推广组',name:k.replace('||',' / '),cost:o.cost,conv:0}); });

  const missing=['创意CTR','排名','无效点击过滤比','地域集中度','时段集中度'].filter(d=>!dims.includes(d));
  const note='相关性假设，非因果定论。锚点来源：'+anchorSource+'。已参与共变的维度：'+(dims.join('、')||'无')+
    (missing.length? '；未导入故未参与：'+missing.join('、')+'（补导对应分日报告可解锁）。':'。')+
    '硬约束：①地域/小时/无效点击为账户级（无计划/组维度），以账户标量按日对齐各单元；②排名为分日加权平均，但仍属结构性结论，需结合日度创意/无效点击联合解读；③无落地页/竞品拍卖数据，相关原因仅作假设。结论须结合业务常识复核。';

  return { units: units.slice(0,14), planTypes, emptyRuns, note, hasAnchor:true, anchorSource };
}

/* ---------- 维度专项诊断（v6）：排名 / 无效点击 / 分时 / oCPC ---------- */
/* 排名三分支判定：用关键词报告(1)的(计划,组,词)排名查表，结构性区分"创意差 / 排名掉 / 意图落地页" */
function rankVerdict(val, ctr, accountCtr){
  if(val==null) return null;
  const lowBar = Math.max(0.03, accountCtr*0.6);   // 周期CTR 低于账户均值60%视为"偏低"
  if(val>=2.2) return {verdict:'排名掉主导', weight:3.5, note:'平均排名 '+val.toFixed(2)+' 位（长期靠后），曝光位次被挤压；应抢排名：提质量度/加出价/扩匹配/收窄低效地域'};
  if(val<1.8 && ctr < lowBar) return {verdict:'创意/标题差主导', weight:3.0, note:'平均排名仅 '+val.toFixed(2)+' 位（位置好）但周期CTR '+pct(ctr)+' 偏低，标题/卖点不抓人；应改创意文案'};
  if(val<1.8 && ctr>=lowBar) return {verdict:'意图/匹配/落地页', weight:1.5, note:'平均排名 '+val.toFixed(2)+' 位、CTR '+pct(ctr)+' 均好但转化低，问题在词路/匹配方式/落地页，而非排名或创意'};
  return {verdict:'混合/波动型', weight:1.5, note:'平均排名 '+val.toFixed(2)+' 位 + CTR '+pct(ctr)+'，需结合日度创意CTR与无效点击进一步定位'};
}
function analyzeRank(){
  /* 按 计划||组||词 同键聚合（支持分日文件）：排名按展示量加权平均，conv/shallow 汇总 */
  const acc={};
  RAW.rank.forEach(r=>{
    const key=r.plan+'||'+r.group+'||'+r.kw;
    if(!acc[key]) acc[key]={ranksSum:{}, ranksShows:{}, shows:0, clicks:0, cost:0, conv:0, shallow:0, dates:new Set()};
    const o=acc[key];
    o.dates.add(r.date);
    o.shows += r.shows||0; o.clicks += r.clicks||0; o.cost += r.cost||0;
    o.conv += r.conv||0; o.shallow += (r.shallow||0);
    Object.entries(r.ranks).forEach(([dev,v])=>{ o.ranksSum[dev]=(o.ranksSum[dev]||0)+(v*(r.shows||1)); o.ranksShows[dev]=(o.ranksShows[dev]||0)+(r.shows||0); });
  });
  let gs=0,gc=0; RAW.rank.forEach(r=>{ gs+=(r.shows||0); gc+=(r.clicks||0); });
  const accountCtr = gs? gc/gs : 0;
  const merged={};
  Object.entries(acc).forEach(([key,o])=>{
    const ranks={};
    Object.keys(o.ranksSum).forEach(dev=>{ ranks[dev] = o.ranksShows[dev]>0 ? o.ranksSum[dev]/o.ranksShows[dev] : (o.ranksSum[dev]||null); });
    merged[key]={ranks, ctr:o.shows>0?o.clicks/o.shows:0, conv:o.conv, shallow:o.shallow, shows:o.shows, clicks:o.clicks, cost:o.cost, dayCount:o.dates.size};
  });
  const devices = [...new Set(Object.values(merged).flatMap(o=>Object.keys(o.ranks)))];
  /* 诊断关键词源：优先用搜索词报告的深层转化词；无搜索词报告时回退到排名文件自带的(浅层+深层)转化排序，保证"仅丢排名文件也能分析" */
  let diagKws;
  if(R.convKws && R.convKws.filter(k=>k.conv>0).length){
    diagKws = R.convKws.filter(k=>k.conv>0).sort((a,b)=>b.conv-a.conv).slice(0,15).map(k=>({kw:k.kw, conv:k.conv}));
  }else{
    diagKws = Object.entries(merged).map(([key,o])=>({kw:key.split('||').pop(), conv:(o.shallow||0)+o.conv})).sort((a,b)=>b.conv-a.conv).slice(0,15);
  }
  const diag = diagKws.map(k=>{
    let best=null, bShow=-1;
    Object.entries(merged).forEach(([key,o])=>{ if(key.endsWith('||'+k.kw) && (o.shows||0)>bShow){ bShow=o.shows||0; best={key,o}; } });
    if(!best) return null;
    const o=best.o;
    const pcVal = o.ranks['左侧']!=null?o.ranks['左侧']:(o.ranks['计算机']!=null?o.ranks['计算机']:null);
    const pcDev = o.ranks['左侧']!=null?'左侧':(o.ranks['计算机']!=null?'计算机':null);
    const mobKey = o.ranks['移动']!=null ? '移动' : (o.ranks['移动端']!=null ? '移动端' : null);
    const mobVal = mobKey!=null ? o.ranks[mobKey] : null;
    const pc = pcVal!=null ? Object.assign({dev:pcDev, val:pcVal}, rankVerdict(pcVal, o.ctr, accountCtr)) : null;
    const mobile = mobVal!=null ? Object.assign({dev:mobKey, val:mobVal}, rankVerdict(mobVal, o.ctr, accountCtr)) : null;
    const primary = pc || mobile;
    let cross=null;
    if(pc && mobile){ cross = (pc.verdict===mobile.verdict) ? ('各设备一致：'+pc.verdict) : ('PC('+pcDev+')'+pc.verdict+' / 移动'+mobile.verdict+' → 建议分设备处理'); }
    return {kw:k.kw, conv:o.conv, shallow:o.shallow, ctr:o.ctr, shows:o.shows, dayCount:o.dayCount, ranks:o.ranks,
      pc, mobile, cross,
      primary: primary?{dev:primary.dev, val:primary.val, verdict:primary.verdict, weight:primary.weight, note:primary.note}:null,
      key:best.key};
  }).filter(Boolean);
  return { keyRank:merged, accountCtr, diag, has:Object.keys(merged).length>0, devices,
    note:(devices.length>1?'已接入 '+devices.join('/')+' 多设备排名（按 计划||组||词 同键合并）':'已接入 '+devices.join('/')+' 排名')+'；排名按展示量加权平均（支持分日文件）。' };
}
function analyzeInvalid(){
  if(!RAW.invalid.length) return {daily:[], has:false};
  const daily = RAW.invalid.map(r=>({date:r.date, before:r.before, filtered:r.filtered, ratio:r.ratio, amount:r.amount})).sort((a,b)=>a.date<b.date?-1:1);
  const totalBefore=daily.reduce((s,d)=>s+d.before,0), totalFiltered=daily.reduce((s,d)=>s+d.filtered,0);
  const avgRatio = totalBefore? totalFiltered/totalBefore*100 : 0;
  const flags = daily.filter(d=>d.ratio>15).map(d=>d.date);
  const worst = [...daily].sort((a,b)=>b.amount-a.amount).slice(0,3);
  return {daily, totalBefore, totalFiltered, avgRatio, flags, worst, has:true,
    note:'行业合格线：无效点击过滤比 < 15%。本期均值 '+avgRatio.toFixed(1)+'%，过滤金额合计 ¥'+fmt(totalFiltered)+'。过滤比超阈值的日期提示当日原始点击含较多无效流量，真实流量更小——它是"稀释因素"而非唯一决定项，需与排名/创意联合看。防护建议：开启 360 防刷(默认开)、设置 IP 频次过滤(单IP每日最多计费5次)、用商盾/IP排除屏蔽高频异常IP；对「免费/下载/破解」类非目标词加否定词可降无效点击约35%（不同账户过滤比绝对值无横向对比价值，看本账户多日趋势）。'};
}
function analyzeHour(){
  if(!RAW.hour.length) return {byHour:[], has:false};
  const byH={};
  RAW.hour.forEach(r=>{ const h = r.hour<0? '未知' : (r.hour+'时'); const o=byH[h]=byH[h]||{shows:0,clicks:0,cost:0}; o.shows+=r.shows;o.clicks+=r.clicks;o.cost+=r.cost; });
  const arr=Object.entries(byH).map(([h,o])=>({hour:h, shows:o.shows, clicks:o.clicks, cost:o.cost, ctr:o.shows?o.clicks/o.shows:0, cpc:o.clicks?o.cost/o.clicks:0}));
  const tot=arr.reduce((s,o)=>({shows:s.shows+o.shows,clicks:s.clicks+o.clicks,cost:s.cost+o.cost}),{shows:0,clicks:0,cost:0});
  const avgCtr = tot.shows? tot.clicks/tot.shows : 0;
  arr.forEach(o=>{ o.costShare = tot.cost? o.cost/tot.cost : 0; });
  /* v8：按 CTR 相对账户均值给出「时段出价系数」具体建议（360 支持 0.1–10.0，填0=不投放），并修正"零点击高消费"漏判 */
  arr.forEach(o=>{
    let mult, label;
    if(o.clicks===0 && o.cost>0){ mult=0; label='暂停(零点击高消费)'; }
    else if(avgCtr>0 && o.ctr>=avgCtr*1.5){ mult=1.3; label='+30% 加投'; }
    else if(avgCtr>0 && o.ctr>=avgCtr*1.2){ mult=1.15; label='+15% 加投'; }
    else if(o.ctr>=avgCtr*0.6){ mult=1.0; label='维持'; }
    else if(avgCtr>0 && o.ctr>=avgCtr*0.3){ mult=0.7; label='-30% 缩量'; }
    else { mult=0.3; label='缩量70%+'; }
    o.bidMult=mult; o.bidLabel=label;
  });
  const worst = arr.filter(o=> (o.ctr>0 && o.ctr<avgCtr*0.6) || (o.clicks===0 && o.cost>0) ).sort((a,b)=>b.cost-a.cost).slice(0,4);
  const best = arr.filter(o=>o.ctr>=avgCtr*1.2).sort((a,b)=>b.ctr-a.ctr).slice(0,4);
  return {byHour:arr.sort((a,b)=>{const pa=parseInt(a.hour),pb=parseInt(b.hour);return (isNaN(pa)?99:pa)-(isNaN(pb)?99:pb);}), avgCtr, worst, best, totalCost:tot.cost, has:true,
    note:'分时报告为账户级（无计划/组维度）。按小时聚合：标出 CTR 显著低于账户均值('+pct(avgCtr)+')且消费占比高的"低效时段"，建议缩减低效时段出价系数；高CTR时段建议加投。360 点睛支持「时段出价系数」(计划维度, 0.1–10.0，填0=不投放此时段) 与「地域出价系数」(1.0–10.0)，可直接在后台将低效时段系数下调、黄金时段(19:00–23:00)上调，无需手调出价。'};
}
function analyzeOcpc(){
  if(!RAW.ocpc.length) return {has:false};
  const pkgs={};
  RAW.ocpc.forEach(r=>{ const p=r.pkg||'未命名投放包'; if(!pkgs[p]) pkgs[p]={shows:0,clicks:0,cost:0,shallow:0,deep:0,days:new Set(),phases:new Set(),devs:new Set()}; const o=pkgs[p]; o.shows+=r.shows;o.clicks+=r.clicks;o.cost+=r.cost;o.shallow+=(r.shallow||0);o.deep+=(r.deep||0);o.days.add(r.date); if(r.phase)o.phases.add(r.phase); if(r.dev)o.devs.add(r.dev); });
  const list=Object.entries(pkgs).map(([p,o])=>({pkg:p, shows:o.shows, clicks:o.clicks, cost:o.cost, cpc:o.clicks?o.cost/o.clicks:0, ctr:o.shows?o.clicks/o.shows:0, days:o.days.size,
    shallow:o.shallow, deep:o.deep, shallowCPA:o.shallow?o.cost/o.shallow:null, deepCPA:o.deep?o.cost/o.deep:null,
    phases:[...o.phases], devs:[...o.devs]}));
  const totalCost=list.reduce((s,o)=>s+o.cost,0);
  const totalShallow=list.reduce((s,o)=>s+o.shallow,0), totalDeep=list.reduce((s,o)=>s+o.deep,0);
  const maxDays = list.length? list.reduce((m,p)=>Math.max(m,p.days),0) : 0;
  const periodLen = R.dates.length;
  /* 学习期判定：① 投放包「投放阶段」列含 学习/观察/放量/冷启/新建 → 学习期；② 活跃天数 < 周期天数（疑似新建/重启用） → 学习期；
     ③ 周期本身 <7 天（样本不足） → 按学习期谨慎，但若任一投放包日均转化≥30则模型已过 Phase 1，不标学习期；
     ④ 投放包已覆盖全周期 → 模型大概率稳定。
     文献依据：360 oCPC Phase 1 入二阶条件=连续4天日均转化≥30（见 27sem/360官文）；日均转化达标即模型已收敛。 */
  const learnPhase = list.some(p=>p.phases.some(ph=>/学习|观察|放量|冷启|新建|待积累/i.test(ph)));
  const hasTrainedPkg = list.some(p=> p.days>=4 && (p.shallow+p.deep)/p.days >= 30);
  const learning = learnPhase || (!hasTrainedPkg && list.length>0 && maxDays>0 && maxDays<=7 && (maxDays < periodLen || periodLen < 7));
  const learnNote = learning
    ? (learnPhase ? '部分 oCPC 投放包处于「'+list.filter(p=>p.phases.some(ph=>/学习|观察|放量|冷启|新建|待积累/i.test(ph))).map(p=>p.pkg).join('、')+'」学习/观察期：避免频繁否词/改落地页/大调预算，连续3天成本超基准±15%再干预。'
        : (maxDays < periodLen
            ? '投放包本周期仅活跃 '+maxDays+'/'+periodLen+' 天（疑似新建或重启用），处于智能出价学习期(3-7天)：避免频繁否词/改落地页/大调预算。'
            : '本周期仅 '+periodLen+' 天，样本不足难以判断是否稳定，按学习期谨慎操作。'))
    : '投放包已覆盖全周期（'+periodLen+' 天），模型大概率已稳定，建议持续监控波动、按需优化。';
  return {pkgs:list, totalCost, totalShallow, totalDeep, learning, learnDays:maxDays, has:true,
    note: list.length? ('oCPC 投放包 '+list.length+' 个，消耗合计 ¥'+fmt(totalCost)+'；浅层转化 '+totalShallow+'（CPA ¥'+fmt(totalShallow?totalCost/totalShallow:0)+'）、深度转化 '+totalDeep+'（CPA ¥'+fmt(totalDeep?totalCost/totalDeep:0)+'）。'+learnNote+'稳定期可拆包(保留高转化计划、低效低消重建)并按每3天降5%CPA逐步下探；模型超成本可按平台成本保障申请赔付。') : '本周期未使用 oCPC 投放包。'};
}

/* ---------- 任务13：统计严谨性 + 轻量预测 ---------- */
function poissonCI(x){ if(x<=0) return [0,0]; const lo=Math.max(0, x-1.96*Math.sqrt(x)); const hi=x+1.96*Math.sqrt(x); return [lo,hi]; }
function analyzeStats(){
  const daily=R.daily, dates=R.dates, n=daily.length;
  const total=daily.reduce((s,d)=>s+(d.conv||0),0);
  const convCI=poissonCI(total);
  const dayCpas=daily.filter(d=>d.conv>0).map(d=>({date:d.date,cpa:d.cost/d.conv}));
  let iqrOut=[];
  if(dayCpas.length>=4){
    const s=dayCpas.map(x=>x.cpa).sort((a,b)=>a-b);
    const q=p=>{ const i=(s.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return s[lo]+(s[hi]-s[lo])*(i-lo); };
    const q1=q(0.25), q3=q(0.75), iqr=q3-q1, bound=q3+1.5*iqr;
    iqrOut=dayCpas.filter(x=>x.cpa>bound).map(x=>x.date);
  }
  const backStart = Math.floor(n/2);                 // 后半段起点=⌊n/2⌋ → 取 ceil(n/2) 天（"后半段"语义；原 ceil(n/2) 起点会取到较短半段，且预测值取决于所选半段，属逻辑偏差）
  const backN = n-backStart>0 ? (n-backStart) : n;    // 单日(n=1)时 backStart=0 → backN=n=1，避免除零
  const backSlice = daily.slice(backStart);
  const avgConvDaily=backSlice.reduce((s,d)=>s+(d.conv||0),0)/backN;
  const avgCostDaily=backSlice.reduce((s,d)=>s+d.cost,0)/backN;
  const fcConv=avgConvDaily*n, fcCost=avgCostDaily*n;
  const fcCI=poissonCI(Math.round(fcConv));
  const fcCPA=fcConv>0?fcCost/fcConv:null;
  return { total, convCI, iqrOut, fcConv, fcCI, fcCost, fcCPA, n, lowSample: total<30 };
}

/* ---------- 任务14：高转化词 × 搜索词变化关联诊断 ---------- */
function pearson(x,y){
  const n=x.length; if(n<3) return NaN;
  const mx=x.reduce((a,b)=>a+b,0)/n, my=y.reduce((a,b)=>a+b,0)/n;
  let num=0,dx=0,dy=0;
  for(let i=0;i<n;i++){ num+=(x[i]-mx)*(y[i]-my); dx+=(x[i]-mx)**2; dy+=(y[i]-my)**2; }
  return (dx>0&&dy>0)? num/Math.sqrt(dx*dy) : NaN;
}
function analyzeConvSearchShift(){
  const S=RAW.search, dates=R.dates;
  let targets=R.convKws.filter(k=>k.conv>=3).slice(0,8);
  if(!targets.length) targets=R.convKws.slice(0,5);
  const data=targets.map(k=>{
    const kw=k.kw, rows=IDX.SByKw[kw]||[];
    const perDay={}; const seen=new Set();
    dates.forEach(d=>{
      const dr=rows.filter(r=>r.date===d);
      const a=agg(dr);
      const cvr=a.clicks? a.conv/a.clicks : 0;
      const queriesAll=dr.map(r=>r.query);
      const newTerms=queriesAll.filter(q=>!seen.has(q)); newTerms.forEach(q=>seen.add(q));
      const lowQ=dr.filter(r=>matchScore(kw,r.query)<30).length;
      const totalQ=dr.length;
      const avgScore=dr.length? dr.reduce((s,r)=>s+matchScore(kw,r.query),0)/dr.length : 0;
      perDay[d]={clicks:a.clicks,conv:a.conv,cvr,queries:totalQ,newTerms:newTerms.length,lowQ,avgScore};
    });
    const cvrSeries=dates.map(d=>perDay[d].cvr);
    const newSeries=dates.map(d=>perDay[d].newTerms);
    const lowSeries=dates.map(d=>perDay[d].lowQ);
    const rNew=pearson(cvrSeries,newSeries), rLow=pearson(cvrSeries,lowSeries);
    const drops=dates.filter((d,i)=>{ const prev=cvrSeries[i-1]; return i>0 && prev>0 && cvrSeries[i]<prev*0.7; });
    const conclusions=[];
    drops.forEach(d=>{
      const pd=perDay[d], idx=dates.indexOf(d);
      if(pd.newTerms>0||pd.lowQ>0){
        conclusions.push(`${d} CVR 由 ${(cvrSeries[idx-1]*100).toFixed(1)}% 降至 ${(pd.cvr*100).toFixed(1)}%，当日涌入 ${pd.newTerms} 个新搜索词、低质量词 ${pd.lowQ} 个（占当日搜索词 ${pd.queries?Math.round(pd.lowQ/pd.queries*100):0}%），疑似搜索词结构恶化拉低转化效率`);
      }
    });
    return {kw, conv:k.conv, perDay, cvrSeries, newSeries, lowSeries, rNew, rLow, drops, conclusions};
  });
  return { targets: targets.map(k=>k.kw), data };
}

/* ---------- 分日转化关键词 · 日度变化追踪（v9 深挖：逐日 churn + 集中度 + 流失核心词烧钱） ---------- */
/* 输入：RAW.search（关键词×日期 的 cost/conv/clicks）。输出：
   1) daily[]：每日转化词集合、数量、Top3 集中度（前3词转化占比）、核心词在场数
   2) churn[]：逐日相对前日 新增/流失/上升/下降 转化词（含转化量）
   3) coreDetail：核心词(贡献80%)连续转化天数/最近转化日/近3日消费-转化/atRisk
   4) lostStillSpending：曾转化、近3日0转化却仍在烧钱的核心词（预算泄漏点，P1 预警）
   5) flickerCore：间断核心词（不足一半日期产出转化，稳定性差）
   6) concTrend：Top3 集中度前半 vs 后半 趋势（上升=风险/下降=改善）
   注：与现有 convKws.status（前半段 vs 近2天粗分）互补——本函数做的是真正的逐日差异(churn)，可定位"哪天丢了哪个词"。 */
function analyzeConvKeywordDaily(){
  if(!RAW.search || !RAW.search.length) return {has:false, note:'无搜索词数据（需搜索词报告含转化）'};
  const dates=(R.dates && R.dates.length)? R.dates : [...new Set(RAW.search.map(r=>r.date))].sort();
  if(dates.length<2) return {has:false, note:'需至少 2 个分日才能做逐日变化分析'};
  // 关键词 × 日期：cost / conv / clicks
  const kwMap=groupBy(RAW.search, r=>r.kw);
  const kd={};
  Object.entries(kwMap).forEach(([kw,rows])=>{
    const by={};
    rows.forEach(r=>{
      by[r.date]=by[r.date]||{cost:0,clicks:0,conv:0};
      by[r.date].cost+=r.cost; by[r.date].clicks+=r.clicks; by[r.date].conv+=(r.conv||0);
    });
    kd[kw]=by;
  });
  // 每日总转化（全账户）用于集中度分母
  const dateTotConv={};
  dates.forEach(d=>{ dateTotConv[d]=Object.keys(kd).reduce((s,kw)=>s+(kd[kw][d]?kd[kw][d].conv:0),0); });
  const coreKws=(R.coreKws||[]);
  // 每日：转化词集合、数量、Top3 集中度、核心词在场数
  const daily=dates.map(d=>{
    const present=Object.keys(kd).filter(kw=>kd[kw][d] && kd[kw][d].conv>0)
      .sort((a,b)=>kd[b][d].conv-kd[a][d].conv);
    const totalConv=dateTotConv[d];
    const top3=present.slice(0,3).reduce((s,kw)=>s+kd[kw][d].conv,0);
    const corePresent=coreKws.filter(kw=>kd[kw][d] && kd[kw][d].conv>0).length;
    return {date:d, count:present.length, present, totalConv,
      top3Share: totalConv>0? top3/totalConv : 0,
      coreCount: corePresent, coreTotal: coreKws.length};
  });
  // 逐日 churn（相对前一天）
  const churn=[];
  for(let i=1;i<dates.length;i++){
    const pd=dates[i-1], cd=dates[i];
    const prevSet=new Set(daily[i-1].present), curSet=new Set(daily[i].present);
    const gained=daily[i].present.filter(k=>!prevSet.has(k));
    const lost=daily[i-1].present.filter(k=>!curSet.has(k));
    const retained=[...curSet].filter(k=>prevSet.has(k));
    const rising=[], falling=[];
    retained.forEach(k=>{
      const pc=kd[k][pd].conv, cc=kd[k][cd].conv;
      if(cc>pc) rising.push({kw:k, from:pc, to:cc});
      else if(cc<pc) falling.push({kw:k, from:pc, to:cc});
    });
    const gConv=gained.reduce((s,k)=>s+kd[k][cd].conv,0);
    const lConv=lost.reduce((s,k)=>s+kd[k][pd].conv,0);
    churn.push({date:cd, prev:pd, gained, lost, rising, falling, gainedConv:gConv, lostConv:lConv});
  }
  // 核心词稳定性 + 流失核心词仍在烧钱
  const last3=dates.slice(-3);
  const coreDetail=coreKws.map(kw=>{
    const presentDaysArr=dates.filter(d=>kd[kw][d] && kd[kw][d].conv>0);
    const convTotal=dates.reduce((s,d)=>s+(kd[kw][d]?kd[kw][d].conv:0),0);
    const lastConvDate=presentDaysArr.length?presentDaysArr[presentDaysArr.length-1]:null;
    const recentCost=last3.reduce((s,d)=>s+(kd[kw][d]?kd[kw][d].cost:0),0);
    const recentConv=last3.reduce((s,d)=>s+(kd[kw][d]?kd[kw][d].conv:0),0);
    let streak=0;
    for(let i=dates.length-1;i>=0;i--){ if(kd[kw][dates[i]] && kd[kw][dates[i]].conv>0) streak++; else break; }
    const daysSinceConv = lastConvDate? (dates.length-1 - dates.indexOf(lastConvDate)) : dates.length;
    const LEAK_FLOOR = 20;   // 近3日消费材料性下限：排除四舍五入/微量噪声（如 ¥0、¥2），只保留仍在实质烧钱的核心词
    const atRisk = (daysSinceConv>=3) && recentCost>=LEAK_FLOOR;   // 前期转化、近3日0转化却仍在实质烧钱
    return {kw, convTotal, presentDays:presentDaysArr.length, lastConvDate, recentCost, recentConv, streak, daysSinceConv, atRisk};
  });
  const lostStillSpending=coreDetail.filter(c=>c.atRisk).sort((a,b)=>b.recentCost-a.recentCost);
  const flickerCore=coreDetail.filter(c=>c.presentDays>0 && c.presentDays<Math.max(2,Math.ceil(dates.length*0.5)) && !c.atRisk);

  /* ===== v10 扩展：关键词级 CTR(关键词报告) / 排名(排名文件) 标注 + 生命周期时间线 + 流失核心词×共变联动 ===== */
  RAW.kw.forEach(r=>{ const by=kd[r.kw]; if(by && by[r.date]) by[r.date].ctr=r.ctr; });
  /* 关键词报告(分日) 因含「平均排名」列常被 detectType 归类为 rank（part3 特例放行），RAW.kw 可能为空；
     此时从 rank 行的 点击/展现 推导关键词级 CTR，保证 CTR 联动维度可用（单位：%，与 RAW.kw.ctr 一致）。 */
  if(!RAW.kw.length && RAW.rank.length){
    RAW.rank.forEach(r=>{ const by=kd[r.kw]; if(by && by[r.date] && !(by[r.date].ctr>0)){ const c=r.shows? r.clicks/r.shows : null; if(c!=null && !isNaN(c)) by[r.date].ctr=c*100; } });
  }
  RAW.rank.forEach(r=>{ const by=kd[r.kw]; if(by && by[r.date]){ const devs=Object.values(r.ranks||{}); if(devs.length){ const avg=devs.reduce((a,b)=>a+b,0)/devs.length; const o=by[r.date]; o.rank=(o.rank==null)? avg : (o.rank+avg)/2; } } });
  const invByDate={}; RAW.invalid.forEach(r=> invByDate[r.date]=r.ratio);
  const hasRankData=RAW.rank.length>0, hasKwCtrData=RAW.kw.length>0||RAW.rank.length>0, hasInvalidData=RAW.invalid.length>0;
  const avgArr=arr=>{ const vs=arr.filter(v=>v!=null&&!isNaN(v)); return vs.length? vs.reduce((a,b)=>a+b,0)/vs.length:null; };

  // 生命周期时间线：首次 → 峰值 → 末次转化 → 流失（含生命周期天数与末次相对峰值衰减）
  const lifecycle = R.convKws.map(k=>{
    const by=kd[k.kw]; if(!by) return null;
    const convDays=dates.filter(d=> by[d] && by[d].conv>0);
    if(!convDays.length) return null;
    const firstDate=convDays[0], lastConvDate=convDays[convDays.length-1];
    let peakDate=convDays[0], peakConv=by[peakDate].conv;
    convDays.forEach(d=>{ if(by[d].conv>peakConv){ peakConv=by[d].conv; peakDate=d; } });
    const totalConv=convDays.reduce((s,d)=>s+by[d].conv,0);
    const lastIdx=dates.indexOf(lastConvDate);
    const lossDate=(lastConvDate!==dates[dates.length-1])? dates[lastIdx+1]:null;
    const lifespanDays=lastIdx-dates.indexOf(firstDate)+1;
    const tailConv=by[lastConvDate].conv;
    const fadePct= peakConv>0? (1-tailConv/peakConv):0;   // 末次转化相对峰值的衰减（断流程度）
    const series=dates.map(d=> by[d]? by[d].conv:0);
    return {kw:k.kw, firstDate, peakDate, peakConv, lastConvDate, lossDate, lifespanDays, totalConv, active: lossDate===null, series, by, tailConv, fadePct};
  }).filter(Boolean);

  // 流失核心词 × 共变引擎联动（事件研究）：核心词停止转化的当日，排名/CTR/无效点击 是否同步劣化
  const lostCore = lifecycle.filter(l=> !l.active && coreKws.includes(l.kw));
  const lostCoreLink = lostCore.map(l=>{
    const by=l.by, li=dates.indexOf(l.lastConvDate);
    const avg=(idxs,key)=>avgArr(idxs.map(i=>{ const o=by[dates[i]]; return o? o[key]:null; }));
    const pre=[], post=[];
    for(let i=Math.max(0,li-3); i<li; i++) pre.push(i);
    for(let i=li+1; i<=Math.min(dates.length-1,li+3); i++) post.push(i);
    const preRank=avg(pre,'rank'), postRank=avg(post,'rank');
    const preCtr=avg(pre,'ctr'), postCtr=avg(post,'ctr');
    const invAt=i=>{ const d=dates[i]; return invByDate[d]!=null? invByDate[d]/100:null; };
    const preInv=avgArr(pre.map(invAt)), postInv=avgArr(post.map(invAt));
    const signals=[];
    if(preRank!=null&&postRank!=null && postRank>preRank*1.05)
      signals.push({dim:'排名', pre:preRank, post:postRank, txt:`排名由 ${preRank.toFixed(1)} 跌至 ${postRank.toFixed(1)}（数值越大越靠后）`});
    if(preCtr!=null&&postCtr!=null && preCtr>0 && postCtr<preCtr*0.8)
      signals.push({dim:'CTR', pre:preCtr, post:postCtr, txt:`关键词 CTR 由 ${preCtr.toFixed(2)}% 降至 ${postCtr.toFixed(2)}%`});
    if(preInv!=null&&postInv!=null && postInv>preInv*1.2 && (postInv-preInv)>=0.03)
      signals.push({dim:'无效点击过滤比', pre:preInv, post:postInv, txt:`无效点击过滤比由 ${(preInv*100).toFixed(1)}% 升至 ${(postInv*100).toFixed(1)}%`});
    return {kw:l.kw, lastConvDate:l.lastConvDate, lossDate:l.lossDate, lifecycleDays:l.lifespanDays, totalConv:l.totalConv,
      preRank, postRank, preCtr, postCtr, preInv, postInv, signals};
  }).filter(x=> x.signals.length>0);

  // 集中度趋势：前半 vs 后半 Top3 占比
  const half=Math.floor(dates.length/2);
  const fShare=daily.slice(0,half).reduce((s,x)=>s+x.top3Share,0)/Math.max(1,half);
  const lShare=daily.slice(half).reduce((s,x)=>s+x.top3Share,0)/Math.max(1,dates.length-half);
  const concTrend = lShare>fShare+0.05?'上升(风险)': lShare<fShare-0.05?'下降(改善)':'平稳';
  const totalNew=churn.reduce((s,c)=>s+c.gained.length,0);
  const totalLost=churn.reduce((s,c)=>s+c.lost.length,0);
  const avgDailyConvKw=daily.reduce((s,x)=>s+x.count,0)/dates.length;
  return {has:true, dates, daily, churn, coreDetail, lostStillSpending, flickerCore,
    lifecycle, lostCoreLink, hasRankData, hasKwCtrData, hasInvalidData,
    concTrend, firstShare:fShare, lastShare:lShare, totalNew, totalLost, avgDailyConvKw, note:null};
}
