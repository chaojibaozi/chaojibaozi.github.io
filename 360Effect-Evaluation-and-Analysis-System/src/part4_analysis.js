/* ============ 分析引擎：指标计算 / 四象限 / 转化追踪 / 匹配度 / 创意 / 地域 / 规则引擎 ============ */

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

function runAnalysis(){
  if(!FILES.some(f=>f.type==='search')){ toast('请至少导入一个搜索词报告'); return; }
  const dup = mergeFiles();
  if(dup>0) toast('已自动去重 '+dup+' 行重复数据');

  const S = RAW.search;
  const dates = [...new Set(S.map(r=>r.date))].sort();
  const period = dates[0]+'至'+dates[dates.length-1];

  /* ---- 总览 KPI ---- */
  const tot = agg(S);
  const targetCPA = SET.targetCPA!=='' && !isNaN(parseFloat(SET.targetCPA)) ? parseFloat(SET.targetCPA) : (tot.conv>0? tot.cost/tot.conv : 200);
  const daily = dates.map(d=>{ const rows=S.filter(r=>r.date===d); const a=agg(rows); return Object.assign({date:d},a); });

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
    if(convDays>=3) k.status='稳定';
    else if(lastTwo>0 && firstHalf===0) k.status='新增';
    else if(k.conv<=1) k.status='偶发';
    else if(firstHalf>0 && lastTwo===0) k.status='衰减';
    else k.status='波动';
  });
  /* 二八法则：贡献80%转化的核心词 */
  let acc=0; const coreKws=[];
  for(const k of convKws){ acc+=k.conv; coreKws.push(k.kw); if(acc>=tot.conv*0.8) break; }

  /* ---- 零转化日诊断 ---- */
  const zeroDays = daily.filter(d=>d.cost>=SET.zeroConvCost && d.conv===0).map(d=>{
    const rows = S.filter(r=>r.date===d.date);
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
  const bestMatchCache={};
  function bestAccountMatch(query){
    if(bestMatchCache[query]!==undefined) return bestMatchCache[query];
    let best=0;
    for(const k of kwList){ const s=matchScore(k,query); if(s>best){ best=s; if(best>=90) break; } }
    return bestMatchCache[query]=best;
  }
  /* 否词：按搜索词聚合；须满足 低匹配触发+全局零转化+达消费门槛+与整个账户词库均不相关 */
  const negCand = queries.filter(q=>q.level==='低' && queryConvTotal[q.query]===0);
  const negMap = groupBy(negCand, q=>q.query);
  const negList = Object.entries(negMap).map(([query,list])=>{
    const cost=list.reduce((s,q)=>s+q.cost,0), clicks=list.reduce((s,q)=>s+q.clicks,0);
    const main=list.slice().sort((a,b)=>b.cost-a.cost)[0];
    return {query, kw:main.kw, score:bestAccountMatch(query), cost, clicks};
  }).filter(q=>q.cost>=SET.negMinCost && q.score<60)
    .sort((a,b)=>b.cost-a.cost);

  const convQueries = queries.filter(q=>q.conv>0).sort((a,b)=>b.conv-a.conv);
  /* 加词：搜索词尚未成为账户关键词才建议 */
  const addList = convQueries.filter(q=>!kwSet.has(normText(q.query)))
    .concat(queries.filter(q=>q.conv===0 && q.clicks>=3 && q.level==='高' && q.shows>0 && q.clicks/q.shows>=0.1 && !kwSet.has(normText(q.query))).slice(0,10));
  const addSeen=new Set(); const addFinal=addList.filter(q=>{ if(addSeen.has(q.query))return false; addSeen.add(q.query); return true; });

  /* ---- 触发模式质量 ---- */
  const modeMap = groupBy(S, r=>r.mode);
  const modeStats = Object.entries(modeMap).map(([mode,rows])=>{
    const a=agg(rows);
    const scores=rows.map(r=>matchScore(r.kw,r.query));
    const avgScore = scores.length? scores.reduce((s,x)=>s+x,0)/scores.length : 0;
    return Object.assign({mode, avgScore}, a);
  }).sort((a,b)=>b.cost-a.cost);

  /* ---- 计划维度 ---- */
  const planStats = Object.entries(groupBy(S,r=>r.plan)).map(([plan,rows])=>Object.assign({plan},agg(rows))).sort((a,b)=>b.cost-a.cost);

  /* ---- 创意分析 ---- */
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

  /* ---- 高级 vs 基础（推广组级对比） ---- */
  const advByGroup = Object.entries(groupBy(RAW.adv, r=>r.plan+' / '+r.group)).map(([gkey,rows])=>{const a=agg(rows);return {gkey, shows:a.shows,clicks:a.clicks,cost:a.cost,ctr:a.shows?a.clicks/a.shows:0,cpc:a.clicks?a.cost/a.clicks:0};});
  const basicByGroup = {}; creGroups.forEach(g=>basicByGroup[g.gkey]={ctr:g.gctr,cpc:g.clicks?g.cost/g.clicks:0,shows:g.shows,cost:g.cost});
  const advCompare = advByGroup.map(a=>({gkey:a.gkey, adv:a, basic:basicByGroup[a.gkey]||null})).sort((a,b)=>b.adv.cost-a.adv.cost);

  /* ---- 地域 ---- */
  const geo = RAW.geo.map(r=>({region:r.region, shows:r.shows, clicks:r.clicks, cost:r.cost, ctr:r.shows?r.clicks/r.shows:0, cpc:r.clicks?r.cost/r.clicks:0})).sort((a,b)=>b.cost-a.cost);
  const geoTot = geo.reduce((s,g)=>({shows:s.shows+g.shows,clicks:s.clicks+g.clicks,cost:s.cost+g.cost}),{shows:0,clicks:0,cost:0});
  const geoAvgCtr = geoTot.shows? geoTot.clicks/geoTot.shows:0;
  const geoAvgCpc = geoTot.clicks? geoTot.cost/geoTot.clicks:0;
  geo.forEach(g=>{
    if(g.cost < geoTot.cost*0.02){ g.diag='观察'; g.advice='消费占比低，暂观察'; return; }
    const hiCpc = g.cpc > geoAvgCpc*1.3, loCtr = g.ctr < geoAvgCtr*0.6;
    if(hiCpc && loCtr){ g.diag='收缩'; g.advice='CPC高且CTR低：建议降低地域出价系数或收缩投放'; }
    else if(hiCpc){ g.diag='降价'; g.advice='CPC显著高于均值：下调出价，观察排名变化'; }
    else if(g.ctr>geoAvgCtr*1.2 && g.cpc<geoAvgCpc){ g.diag='扩量'; g.advice='高CTR低CPC优质地域：可提预算/出价系数扩量'; }
    else { g.diag='保持'; g.advice='效率正常，保持现状'; }
  });

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

  R = { period, dates, daily, tot, targetCPA, highCost, kws, convKws, coreKws, zeroDays, queries, negList, addList:addFinal, convQueries, modeStats, planStats, creGroups, weakCre, topCre, advCompare, geo, geoAvgCtr, geoAvgCpc, geoTot, compare };

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

  R.cpa = analyzeCpaAttribution();
  R.stats = analyzeStats();
  R.shift = analyzeConvSearchShift();
  R.actions = buildActions(R);

  /* 保存快照 */
  const convKwObj={}; convKws.forEach(k=>convKwObj[k.kw]=k.conv);
  saveSnapshot({ period, savedAt:new Date().toLocaleString('zh-CN'), cost:tot.cost, conv:tot.conv, clicks:tot.clicks, shows:tot.shows, convKw:convKwObj });

  renderAll();
  document.getElementById('importZone').style.display='none';
  document.getElementById('panels').style.display='block';
  document.getElementById('nav').style.display='flex';
  document.getElementById('btnExport').disabled=false;
  document.getElementById('btnGlobalAI').disabled=false;
  const pl=document.getElementById('periodLabel'); pl.textContent='📅 '+period; pl.style.display='inline-block';
  window.scrollTo(0,0);
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
    const dev = (cpa!=null && baselineCPA)? (cpa-baselineCPA)/baselineCPA : null;
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
  /* P1：否词 */
  if(R.negList.length){
    const top=R.negList.slice(0,15);
    acts.push({p:1, mod:'搜索词', act:`添加否定关键词 ${R.negList.length} 个（浪费消费合计 ¥${fmt(R.negList.reduce((s,q)=>s+q.cost,0))}）。优先：${top.map(q=>q.query).join('、')}`});
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
  /* P1：地域 */
  R.geo.filter(g=>g.diag==='收缩'||g.diag==='降价').forEach(g=>{
    acts.push({p:1, mod:'地域', act:`${g.region}：CPC ¥${fmt(g.cpc)}（账户均值¥${fmt(R.geoAvgCpc)}）、CTR ${pct(g.ctr)}。${g.advice}`});
  });
  /* P2：潜力词 */
  R.kws.filter(k=>k.quad==='C').sort((a,b)=>b.conv-a.conv).slice(0,6).forEach(k=>{
    acts.push({p:2, mod:'关键词', act:`潜力词「${k.kw}」低消费产出 ${k.conv} 转化（CPA ¥${fmt(k.cpa)}）。动作：小步提价10-20%抢排名、适度放开匹配、围绕它拓展同结构长尾词`});
  });
  /* P2：扩量地域 */
  R.geo.filter(g=>g.diag==='扩量').forEach(g=>{
    acts.push({p:2, mod:'地域', act:`${g.region}：CTR ${pct(g.ctr)} 高于均值且 CPC ¥${fmt(g.cpc)} 低于均值。${g.advice}`});
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
  acts.sort((a,b)=>a.p-b.p);
  return acts;
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
  const half=Math.ceil(n/2);
  const avgConvDaily=daily.slice(half).reduce((s,d)=>s+(d.conv||0),0)/(n-half);
  const avgCostDaily=daily.slice(half).reduce((s,d)=>s+d.cost,0)/(n-half);
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
    const kw=k.kw, rows=S.filter(r=>r.kw===kw);
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
