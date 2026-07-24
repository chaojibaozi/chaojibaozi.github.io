/* ============ 渲染层：KPI / 图表 / 表格 ============ */
function tv(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

/* 高清画布：按容器实际宽度 + 设备像素比设置 backing store，避免图表模糊 */
function prepCanvas(cv, cssH){
  const dpr = window.devicePixelRatio || 1;
  const wrap = cv.parentElement;
  let cssW = (wrap ? wrap.clientWidth : 0) || cv.clientWidth || 900;
  cssW = Math.max(320, Math.floor(cssW));
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 之后均以 CSS 像素坐标绘制
  return { ctx, W: cssW, H: cssH };
}

/* 当前激活面板含图表时重绘（解决：隐藏面板内画布宽高为0 / 窗口缩放后模糊） */
function redrawActiveCharts(){
  if(!R || !document.querySelector) return;
  const ap = document.querySelector('.panel.active');
  if(!ap) return;
  if(ap.id === 'p-overview') drawDailyChart();
  if(ap.id === 'p-geo') drawGeoChart();
  if(ap.id === 'p-cpa') drawCpaChart();
}
function debounce(fn, ms){ let h; return function(){ clearTimeout(h); h = setTimeout(fn, ms); }; }
if(typeof window!=='undefined' && window.addEventListener){
  window.addEventListener('resize', debounce(function(){ redrawActiveCharts(); }, 180));
}

function renderAll(){
  renderOverview(); renderQuad(); renderConv(); renderQuery(); renderCreative(); renderGeo(); renderCpa(); renderShift(); renderActions();
}

/* ---------- ⑧ 转化关联诊断（任务14） ---------- */
function renderShift(){
  const sd=R.shift;
  const host=document.getElementById('shift-cards');
  if(host){
    if(!sd || !sd.data.length){ host.innerHTML='<div class="empty">无足够转化数据（需存在转化≥3的核心词）</div>'; return; }
    document.getElementById('shift-kpis').innerHTML=[
      {l:'分析的高转化词', v:sd.data.length+' 个', d:'转化≥3 的核心词'},
      {l:'CVR 骤降关联点', v: sd.data.reduce((s,x)=>s+x.drops.length,0)+' 处', d:'CVR较前日骤降≥30%'},
      {l:'关联结论数', v: sd.data.reduce((s,x)=>s+x.conclusions.length,0)+' 条', d:'CVR骤降且搜索词结构变化'},
      {l:'新词↔CVR 相关性', v: sd.data.length? fmt(sd.data.reduce((s,x)=>s+(isNaN(x.rNew)?0:x.rNew),0)/sd.data.length,2):'—', d:'Pearson r（越接近1越正相关）'}
    ].map(k=>`<div class="kpi"><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');

    host.innerHTML = sd.data.map(x=>{
      const rows=R.dates.map(d=>{ const pd=x.perDay[d]; const cvrCls=pd.cvr===0?'b-gray':(pd.cvr<0.02?'b-red':'b-green');
        return `<tr><td>${d.slice(5)}</td><td class="num"><span class="badge ${cvrCls}">${(pd.cvr*100).toFixed(1)}%</span></td><td class="num">${pd.queries}</td><td class="num ${pd.newTerms>0?'up':''}">${pd.newTerms}</td><td class="num ${pd.lowQ>0?'up':''}">${pd.lowQ}</td><td class="num">${pd.queries?Math.round(pd.lowQ/pd.queries*100):0}%</td></tr>`; }).join('');
      const conc = x.conclusions.length? x.conclusions.map(c=>`<div class="alert warn" style="margin-bottom:6px">${esc(c)}</div>`).join('')
        : '<div class="alert ok" style="margin-bottom:6px">未检测到 CVR 骤降与搜索词结构变化（新词涌入/低质量占比）的明显关联</div>';
      return `<div class="card" style="margin-top:14px">
        <h2><span class="ic">🔗</span> ${esc(x.kw)} <span class="tag">${x.conv} 转化 · 新词↔CVR r=${isNaN(x.rNew)?'—':x.rNew.toFixed(2)} · 低质量↔CVR r=${isNaN(x.rLow)?'—':x.rLow.toFixed(2)}</span></h2>
        <div class="section-hint">逐日：CVR（转化率）｜搜索词总数｜当日新词数（相对累计）｜低质量词数（匹配分&lt;30）｜低质量占比</div>
        <div class="scroll-table"><table><tr><th>日期</th><th class="num">CVR</th><th class="num">搜索词数</th><th class="num">新词</th><th class="num">低质量词</th><th class="num">低质量占比</th></tr>${rows}</table></div>
        ${conc}</div>`;
    }).join('');
  }
}

/* ---------- ① 总览 ---------- */
function renderOverview(){
  const t=R.tot;
  const alerts=[];
  R.zeroDays.forEach(z=>alerts.push(`<div class="alert danger">🚨 <b>${z.date} 零转化预警</b>：消费 ¥${fmt(z.cost)}、${z.clicks} 次点击但转化为 0。当日高消费词：${z.wasted.map(w=>esc(w.kw)+'(¥'+fmt(w.cost)+')').join('、')}</div>`));
  const decay=R.convKws.filter(k=>k.status==='衰减');
  if(decay.length) alerts.push(`<div class="alert warn">⚠️ ${decay.length} 个转化词出现衰减：${decay.map(k=>esc(k.kw)).join('、')}——详见「转化词追踪」</div>`);
  if(R.negList.length) alerts.push(`<div class="alert warn">⚠️ 发现 ${R.negList.length} 个低匹配度浪费搜索词，合计浪费 ¥${fmt(R.negList.reduce((s,q)=>s+q.cost,0))}——详见「搜索词匹配度」</div>`);
  if(!alerts.length) alerts.push('<div class="alert ok">✅ 未发现P0级异常</div>');
  document.getElementById('ov-alerts').innerHTML=alerts.join('');

  const cpaClass = R.tot.cpa && SET.targetCPA!=='' ? (R.tot.cpa>parseFloat(SET.targetCPA)?'up':'down') : '';
  const kpis=[
    {l:'总消费', v:'¥'+fmt(t.cost)}, {l:'总展示', v:fmt0(t.shows)}, {l:'总点击', v:fmt0(t.clicks)},
    {l:'平均CTR', v:pct(t.ctr)}, {l:'总转化', v:fmt0(t.conv)},
    {l:'CPA（转化成本）', v:t.conv?('¥'+fmt(t.cpa)):'—', cls:cpaClass, d:'基准 ¥'+fmt(R.targetCPA)}
  ];
  if(R.convValue>0){
    kpis.push({l:'转化价值（收入）', v:'¥'+fmt(R.rev), d:R.valueMode==='column'?'取自CSV转化金额列':'客单价¥'+fmt(R.convValue)+'×转化'});
    kpis.push({l:'ROAS（投产比）', v:fmt(R.roas,2), d:'收入÷消费'});
    kpis.push({l:'价值加权CPA', v:R.valueCPA?('¥'+fmt(R.valueCPA)):'—', d:'消费÷收入'});
  }
  let cmp=null;
  if(R.compare){
    cmp={cost:R.compare.cost, conv:R.compare.conv, clicks:R.compare.clicks};
  }
  document.getElementById('ov-kpis').innerHTML = kpis.map((k,i)=>{
    let delta='';
    if(cmp){
      if(k.l==='总消费') delta=deltaHtml(t.cost,cmp.cost,'¥');
      if(k.l==='总转化') delta=deltaHtml(t.conv,cmp.conv,'',true);
      if(k.l==='总点击') delta=deltaHtml(t.clicks,cmp.clicks,'');
    }
    return `<div class="kpi"><div class="lbl">${k.l}</div><div class="val ${k.cls||''}">${k.v}</div><div class="delta">${delta||k.d||''}</div></div>`;
  }).join('');

  drawDailyChart();

  document.getElementById('ov-plans').innerHTML = tableHtml(
    ['推广计划','消费','点击','CTR','转化','CPA'],
    R.planStats.map(p=>[esc(p.plan),'¥'+fmt(p.cost),fmt0(p.clicks),pct(p.ctr),fmt0(p.conv),p.conv?('¥'+fmt(p.cpa)):'<span class="badge b-red">无转化</span>']),
    [0]);
  document.getElementById('ov-modes').innerHTML = tableHtml(
    ['触发模式','消费','点击','转化','匹配度均分','评估'],
    R.modeStats.map(m=>{
      const ev = m.avgScore>=60?'<span class="badge b-green">优</span>':(m.avgScore>=40?'<span class="badge b-amber">中</span>':'<span class="badge b-red">流量跑偏风险</span>');
      return [esc(m.mode),'¥'+fmt(m.cost),fmt0(m.clicks),fmt0(m.conv),Math.round(m.avgScore),ev];
    }),[0]);

  const cc=document.getElementById('ov-compare-card');
  if(R.compare){
    cc.style.display='block';
    const c=R.compare;
    document.getElementById('ov-compare').innerHTML =
      `<div class="section-hint">对比周期：${c.period}</div>`+tableHtml(
      ['指标','上期','本期','变化'],
      [['消费','¥'+fmt(c.cost),'¥'+fmt(R.tot.cost),deltaHtml(R.tot.cost,c.cost,'¥')],
       ['点击',fmt0(c.clicks),fmt0(R.tot.clicks),deltaHtml(R.tot.clicks,c.clicks,'')],
       ['转化',fmt0(c.conv),fmt0(R.tot.conv),deltaHtml(R.tot.conv,c.conv,'',true)],
       ['CPA',c.conv?('¥'+fmt(c.cost/c.conv)):'—', R.tot.conv?('¥'+fmt(R.tot.cpa)):'—', (c.conv&&R.tot.conv)?deltaHtml(R.tot.cpa,c.cost/c.conv,'¥'):'—']],[0]);
  } else cc.style.display='none';

  /* 下周期预测卡片（任务13） */
  const fc=document.getElementById('ov-forecast-card');
  if(R.stats){
    const s=R.stats;
    fc.style.display='block';
    document.getElementById('ov-forecast').innerHTML =
      `<div class="section-hint">预测方法：取本周期后半段日均转化/消费外推至等长（${s.n}天）下周期；转化数附 Poisson 95% 置信区间（统计严谨性，任务13）</div>`+tableHtml(
      ['指标','预测值','说明'],
      [['下周期预测转化', fmt0(s.fcConv)+' <span style="color:var(--muted)">('+fmt(s.fcCI[0],1)+'~'+fmt(s.fcCI[1],1)+')</span>', 'Poisson 95% CI'],
       ['下周期预测CPA', s.fcCPA?('¥'+fmt(s.fcCPA)):'—', '预测消费÷预测转化'],
       ['本期总转化(基线)', fmt0(s.total), s.lowSample?'⚠️ <span class="badge b-amber">样本&lt;30·噪声大</span>':'样本量充足'],
       ['IQR统计离群日', s.iqrOut.length? (s.iqrOut.join('、')+' <span class="tag">相对固定阈值法的交叉验证</span>') : '无']],[0]);
  } else fc.style.display='none';
}
function deltaHtml(cur,prev,unit,goodUp){
  if(!prev) return '';
  const d=(cur-prev)/prev*100;
  const up=d>=0;
  const good = goodUp? up : !up;
  return `<span class="${good?'down':'up'}">${up?'↑':'↓'} ${Math.abs(d).toFixed(1)}%（上期 ${unit}${fmt(prev, unit==='¥'?2:0)}）</span>`;
}
function tableHtml(headers, rows, leftCols){
  leftCols=leftCols||[];
  return '<table><tr>'+headers.map((h,i)=>`<th class="${leftCols.includes(i)?'':'num'}">${h}</th>`).join('')+'</tr>'+
    rows.map(r=>'<tr>'+r.map((c,i)=>`<td class="${leftCols.includes(i)?'':'num'}">${c}</td>`).join('')+'</tr>').join('')+'</table>';
}

/* ---------- 分日趋势图（原生canvas，高清自适应） ---------- */
function drawDailyChart(){
  const cv=document.getElementById('chartDaily'); if(!cv) return;
  const {ctx,W,H}=prepCanvas(cv, 320);
  ctx.clearRect(0,0,W,H);
  const d=R.daily; if(!d.length)return;
  const padL=60,padR=60,padT=28,padB=44;
  const iw=(W-padL-padR)/d.length;
  const maxCost=Math.max(...d.map(x=>x.cost),1);
  const maxConv=Math.max(...d.map(x=>x.conv),1);
  const C={grid:tv('--chart-grid'),axis:tv('--chart-axis'),label:tv('--chart-label'),
    cost:tv('--chart-cost'),costZero:tv('--chart-cost-zero'),conv:tv('--chart-conv'),convZero:tv('--chart-conv-zero')};
  ctx.font='12px "Microsoft YaHei"'; ctx.textAlign='center';
  /* 网格 */
  ctx.strokeStyle=C.grid; ctx.fillStyle=C.axis; ctx.textAlign='right';
  for(let i=0;i<=4;i++){
    const y=padT+(H-padT-padB)*i/4;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();
    ctx.fillText('¥'+fmt0(maxCost*(4-i)/4), padL-6, y+4);
    ctx.textAlign='left'; ctx.fillText(fmt(maxConv*(4-i)/4,1), W-padR+6, y+4); ctx.textAlign='right';
  }
  /* 消费柱 */
  d.forEach((x,i)=>{
    const bx=padL+i*iw+iw*0.18, bw=iw*0.4;
    const bh=(H-padT-padB)*x.cost/maxCost;
    ctx.fillStyle = x.conv===0&&x.cost>=SET.zeroConvCost ? C.costZero : C.cost;
    ctx.fillRect(bx,H-padB-bh,bw,bh);
    ctx.fillStyle=C.label; ctx.textAlign='center';
    ctx.fillText(x.date.slice(5), padL+i*iw+iw/2, H-padB+16);
    ctx.fillText('¥'+fmt0(x.cost), bx+bw/2, H-padB-bh-6);
  });
  /* 转化线 */
  ctx.strokeStyle=C.conv; ctx.lineWidth=2; ctx.beginPath();
  d.forEach((x,i)=>{
    const px=padL+i*iw+iw/2, py=H-padB-(H-padT-padB)*x.conv/maxConv;
    i?ctx.lineTo(px,py):ctx.moveTo(px,py);
  }); ctx.stroke();
  d.forEach((x,i)=>{
    const px=padL+i*iw+iw/2, py=H-padB-(H-padT-padB)*x.conv/maxConv;
    ctx.fillStyle=x.conv===0?C.convZero:C.conv;
    ctx.beginPath();ctx.arc(px,py,4,0,7);ctx.fill();
    ctx.fillStyle=C.label; ctx.fillText(x.conv+'转化', px, py-10);
  });
  /* 图例 */
  ctx.fillStyle=C.cost;ctx.fillRect(padL,8,14,10);
  ctx.fillStyle=C.label;ctx.textAlign='left';ctx.fillText('消费（左轴）',padL+20,17);
  ctx.strokeStyle=C.conv;ctx.beginPath();ctx.moveTo(padL+120,13);ctx.lineTo(padL+150,13);ctx.stroke();
  ctx.fillText('转化数（右轴）',padL+156,17);
  ctx.fillStyle=C.costZero;ctx.fillRect(padL+280,8,14,10);
  ctx.fillStyle=C.label;ctx.fillText('零转化高消费日',padL+300,17);
}

/* ---------- ② 四象限 ---------- */
const QUAD_META={
  A:{name:'A · 重点词（高消费·有转化）', cls:'b-blue', action:'账户利润主力：稳排名不盲目抢第一（2-4名即可）；持续监控CPA变化；围绕其拓展同结构关键词；确保创意与落地页最优版本。'},
  B:{name:'B · 问题词（高消费·零转化）', cls:'b-red', action:'效率黑洞，优先处理：①核查搜索词相关性并否词 ②收匹配（短语→精确）③降价20-50%观察 ④仍无效则暂停。'},
  C:{name:'C · 潜力词（低消费·有转化）', cls:'b-green', action:'宝藏词：小步提价10-20%扩排名；适度放宽匹配拿量；作为种子词拓展长尾；单独预算保护。'},
  D:{name:'D · 观察词（低消费·零转化）', cls:'b-gray', action:'低成本试错池：检查是否因排名低导致无量（提价测试）；创意是否相关（优化）；连续2-3周仍无效则清理。'}
};
function renderQuad(){
  document.getElementById('quad-thresh').textContent='高消费分界：¥'+fmt(R.highCost)+'（目标CPA ¥'+fmt(R.targetCPA)+' × 系数'+SET.costFactor+'）';
  const byQuad=groupBy(R.kws.filter(k=>k.cost>0||k.conv>0), k=>k.quad);
  document.getElementById('quadGrid').innerHTML=['A','B','C','D'].map(q=>{
    const list=(byQuad[q]||[]).sort((a,b)=>b.cost-a.cost);
    const m=QUAD_META[q];
    const cost=list.reduce((s,k)=>s+k.cost,0), conv=list.reduce((s,k)=>s+k.conv,0);
    return `<div class="quad"><h3><span class="badge ${m.cls}">${m.name}</span></h3>
      <div style="font-size:12.5px;color:var(--muted)">${list.length} 个词 · 消费 ¥${fmt(cost)}（占${pct(R.tot.cost?cost/R.tot.cost:0,1)}） · 转化 ${conv}</div>
      <div class="pill-row">${list.slice(0,8).map(k=>`<span class="badge b-gray">${esc(k.kw)} ¥${fmt(k.cost,0)}${k.conv?'/'+k.conv+'转':''}</span>`).join('')}${list.length>8?`<span class="badge b-gray">+${list.length-8}</span>`:''}</div>
      <div class="action">📌 ${m.action}</div></div>`;
  }).join('');
  renderKwTable();
}
let kwSort={col:'cost',dir:-1};
function renderKwTable(){
  const kwq=(document.getElementById('kwSearch').value||'').toLowerCase();
  const qf=document.getElementById('kwQuadFilter').value;
  let list=R.kws.filter(k=>(!qf||k.quad===qf)&&(!kwq||k.kw.toLowerCase().includes(kwq)||k.plans.join(',').toLowerCase().includes(kwq)));
  list=list.slice().sort((a,b)=>{const va=a[kwSort.col]==null?-1:a[kwSort.col],vb=b[kwSort.col]==null?-1:b[kwSort.col];return (va>vb?1:va<vb?-1:0)*kwSort.dir;});
  const cols=[['kw','关键词'],['quad','象限'],['cost','消费'],['shows','展示'],['clicks','点击'],['ctr','CTR'],['cpc','CPC'],['conv','转化'],['cpa','CPA']];
  const qcls={A:'b-blue',B:'b-red',C:'b-green',D:'b-gray'};
  document.getElementById('kwTable').innerHTML='<table><tr>'+
    cols.map(c=>`<th class="${['kw','quad'].includes(c[0])?'':'num'} ${kwSort.col===c[0]?(kwSort.dir>0?'sorted-asc':'sorted-desc'):''}" onclick="sortKw('${c[0]}')">${c[1]}</th>`).join('')+'<th>分日转化</th></tr>'+
    list.map(k=>`<tr><td>${esc(k.kw)}<div style="font-size:11px;color:var(--muted)">${esc(k.plans.join('、'))}</div></td>
      <td><span class="badge ${qcls[k.quad]}">${k.quad}</span></td>
      <td class="num">¥${fmt(k.cost)}</td><td class="num">${fmt0(k.shows)}</td><td class="num">${fmt0(k.clicks)}</td>
      <td class="num">${pct(k.ctr)}</td><td class="num">¥${fmt(k.cpc)}</td>
      <td class="num"><b>${k.conv||''}</b>${k.conv?'':'0'}</td><td class="num">${k.cpa?('¥'+fmt(k.cpa)):'—'}</td>
      <td>${R.dates.map(d=>heat(k.byDate[d]||0)).join('')}</td></tr>`).join('')+'</table>';
}
function sortKw(col){ if(kwSort.col===col)kwSort.dir*=-1; else {kwSort.col=col;kwSort.dir=-1;} renderKwTable(); }
function heat(v){
  const bg = v===0?tv('--heat-0'):v===1?tv('--heat-1'):v===2?tv('--heat-2'):tv('--heat-3');
  const col= v===0?tv('--heat-0-t'):v===1?tv('--heat-1-t'):v===2?tv('--heat-2-t'):tv('--heat-3-t');
  return `<span class="heatcell" style="background:${bg};color:${col}">${v||'·'}</span>`;
}

/* ---------- ③ 转化词追踪 ---------- */
function renderConv(){
  const alerts=[];
  if(R.stats && R.stats.lowSample){
    alerts.push(`<div class="alert info">📊 统计提示：本周期总转化仅 ${R.stats.total} 个，日度CVR/CPA波动多为统计噪声。下表"衰减/新增"等结论暂作观察信号，建议累计2-3周再下确定性结论。</div>`);
  }
  const core=R.convKws.filter(k=>R.coreKws.includes(k.kw));
  alerts.push(`<div class="alert info">💡 二八法则：<b>${R.coreKws.length}</b> 个核心词（${R.coreKws.map(esc).join('、')}）贡献了 <b>${pct(R.tot.conv?core.reduce((s,k)=>s+k.conv,0)/R.tot.conv:0,0)}</b> 的转化——它们的排名、预算、创意必须优先保障</div>`);
  const decay=R.convKws.filter(k=>k.status==='衰减');
  decay.forEach(k=>alerts.push(`<div class="alert danger">🚨 「${esc(k.kw)}」转化衰减：前期共${k.conv}个转化，近2日归零。排查：排名被挤压？预算撞线？搜索词被竞品分流？</div>`));
  document.getElementById('conv-alerts').innerHTML=alerts.join('');
  document.getElementById('conv-hint').textContent=`本周期共 ${R.convKws.length} 个关键词产生转化，合计 ${R.tot.conv} 个；矩阵可直观看出每个词的转化连续性`;

  document.getElementById('convMatrix').innerHTML = R.convKws.length? '<table><tr><th>转化关键词</th><th class="num">总转化</th><th class="num">消费</th><th class="num">CPA</th>'+
    R.dates.map(d=>`<th style="text-align:center">${d.slice(5)}</th>`).join('')+'<th>状态</th></tr>'+
    R.convKws.map(k=>{
      const stCls={'稳定':'b-green','新增':'b-blue','衰减':'b-red','波动':'b-amber','偶发':'b-gray'}[k.status];
      return `<tr><td>${esc(k.kw)}${R.coreKws.includes(k.kw)?' <span class="badge b-purple">核心</span>':''}</td>
      <td class="num"><b>${k.conv}</b></td><td class="num">¥${fmt(k.cost)}</td><td class="num">¥${fmt(k.cpa)}</td>`+
      R.dates.map(d=>`<td style="text-align:center">${heat(k.byDate[d]||0)}</td>`).join('')+
      `<td><span class="badge ${stCls}">${k.status}</span></td></tr>`;
    }).join('')+'</table>' : '<div class="empty">本周期无转化关键词</div>';

  document.getElementById('convStatus').innerHTML = R.convKws.length? R.convKws.map(k=>{
    const advice={'稳定':'保持排名与预算，勿大幅调价','新增':'观察3-5天确认持续性，暂不调价','衰减':'立即排查排名/预算/竞品动向','波动':'转化不连续，检查分日排名波动与预算分配','偶发':'单次转化，样本不足，保持观察积累数据'}[k.status];
    return `<div class="alert ${k.status==='衰减'?'danger':(k.status==='稳定'?'ok':'info')}" style="margin-bottom:6px"><b>${esc(k.kw)}</b>（${k.status}）：${advice}</div>`;
  }).join('') : '<div class="empty">无数据</div>';

  document.getElementById('convQueries').innerHTML = R.convQueries.length? tableHtml(
    ['用户实际搜索词','经由关键词','转化','消费','建议'],
    R.convQueries.map(q=>[esc(q.query), esc(q.kw), '<b>'+q.conv+'</b>', '¥'+fmt(q.cost),
      normText(q.query)!==normText(q.kw)?'<span class="badge b-blue">提为精确关键词</span>':'<span class="badge b-green">已精准</span>']),[0,1])
    : '<div class="empty">无转化搜索词</div>';

  const cc=document.getElementById('convCompareCard');
  if(R.compare){
    cc.style.display='block';
    const chg=R.compare.changes;
    const stCls={'新增':'b-blue','流失':'b-red','上升':'b-green','下降':'b-amber','持平':'b-gray'};
    document.getElementById('convCompare').innerHTML = `<div class="section-hint">对比周期：${R.compare.period}</div>`+tableHtml(
      ['关键词','上期转化','本期转化','变化'],
      chg.filter(c=>c.st!=='持平'||c.cur>0).map(c=>[esc(c.kw), c.prev, c.cur, `<span class="badge ${stCls[c.st]}">${c.st}</span>`]),[0]);
  } else cc.style.display='none';
}

/* ---------- ④ 搜索词匹配度 ---------- */
function renderQuery(){
  const qs=R.queries;
  const hi=qs.filter(q=>q.level==='高'), mid=qs.filter(q=>q.level==='中'), lo=qs.filter(q=>q.level==='低');
  const loCost=lo.reduce((s,q)=>s+q.cost,0);
  document.getElementById('queryTag').textContent=`共 ${qs.length} 组搜索词-关键词配对`;
  document.getElementById('queryKpis').innerHTML=[
    {l:'高匹配（≥60分）',v:hi.length+' 组',d:'消费 ¥'+fmt(hi.reduce((s,q)=>s+q.cost,0))},
    {l:'中匹配（30-59分）',v:mid.length+' 组',d:'消费 ¥'+fmt(mid.reduce((s,q)=>s+q.cost,0))},
    {l:'低匹配（<30分）',v:lo.length+' 组',d:'消费 ¥'+fmt(loCost)},
    {l:'低匹配流量占比',v:pct(R.tot.cost?loCost/R.tot.cost:0,1),d:'建议压降至10%以内'}
  ].map(k=>`<div class="kpi"><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');

  document.getElementById('negTable').innerHTML = R.negList.length? tableHtml(
    ['搜索词','触发关键词','匹配分','消费','点击'],
    R.negList.map(q=>[esc(q.query),esc(q.kw),q.score,'¥'+fmt(q.cost),fmt0(q.clicks)]),[0,1])
    : '<div class="empty">暂无需要否定的搜索词 ✅</div>';

  document.getElementById('addTable').innerHTML = R.addList.length? tableHtml(
    ['搜索词','经由关键词','转化','CTR','理由'],
    R.addList.map(q=>[esc(q.query),esc(q.kw),q.conv||'—',pct(q.shows?q.clicks/q.shows:0),
      q.conv>0?'<span class="badge b-green">已产生转化，提精确锁量</span>':'<span class="badge b-blue">高匹配高CTR，值得单独培育</span>']),[0,1])
    : '<div class="empty">暂无建议加词</div>';

  const mf=document.getElementById('qModeFilter');
  if(mf.options.length<=1) R.modeStats.forEach(m=>{ const o=document.createElement('option');o.value=m.mode;o.textContent=m.mode;mf.appendChild(o); });
  renderQueryTable();
}
function renderQueryTable(){
  const s=(document.getElementById('qSearch').value||'').toLowerCase();
  const mf=document.getElementById('qModeFilter').value, lf=document.getElementById('qMatchFilter').value;
  const list=R.queries.filter(q=>(!s||q.query.toLowerCase().includes(s)||q.kw.toLowerCase().includes(s))&&(!mf||q.mode===mf)&&(!lf||q.level===lf)).slice(0,500);
  const lvCls={'高':'b-green','中':'b-amber','低':'b-red'};
  document.getElementById('queryTable').innerHTML=tableHtml(
    ['搜索词','触发关键词','触发模式','匹配度','展示','点击','消费','转化'],
    list.map(q=>[esc(q.query),esc(q.kw),esc(q.mode),`<span class="badge ${lvCls[q.level]}">${q.level} ${q.score}</span>`,fmt0(q.shows),fmt0(q.clicks),'¥'+fmt(q.cost),q.conv?('<b>'+q.conv+'</b>'):'0']),[0,1,2,3]);
}
function copyNegList(){ copyText(R.negList.map(q=>q.query).join('\n'),'否词清单已复制（'+R.negList.length+'个）'); }
function copyAddList(){ copyText(R.addList.map(q=>q.query).join('\n'),'加词清单已复制（'+R.addList.length+'个）'); }
function copyText(t,msg){ navigator.clipboard.writeText(t).then(()=>toast(msg)).catch(()=>{ const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast(msg); }); }

/* ---------- ⑤ 创意 ---------- */
function renderCreative(){
  const all=R.creGroups.reduce((s,g)=>({shows:s.shows+g.shows,clicks:s.clicks+g.clicks,cost:s.cost+g.cost}),{shows:0,clicks:0,cost:0});
  const actr=all.shows?all.clicks/all.shows:0;
  const advAll=R.advCompare.reduce((s,x)=>({shows:s.shows+x.adv.shows,clicks:s.clicks+x.adv.clicks,cost:s.cost+x.adv.cost}),{shows:0,clicks:0,cost:0});
  const advCtr=advAll.shows?advAll.clicks/advAll.shows:0;
  document.getElementById('creKpis').innerHTML=[
    {l:'基础创意整体CTR',v:pct(actr),d:fmt0(all.shows)+' 次展示'},
    {l:'高级样式整体CTR',v:advAll.shows?pct(advCtr):'—',d:fmt0(advAll.shows)+' 次展示'},
    {l:'需优化创意',v:R.weakCre.length+' 条',d:'CTR低于同组均值'+SET.ctrLowPct+'%'},
    {l:'创意标题数',v:[...new Set(RAW.basic.map(r=>r.title))].length+' 个',d:'覆盖 '+R.creGroups.length+' 个推广组'}
  ].map(k=>`<div class="kpi"><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');

  document.getElementById('creTable').innerHTML='<table><tr><th>推广组 / 创意标题</th><th class="num">展示</th><th class="num">点击</th><th class="num">CTR</th><th class="num">消费</th><th class="num">vs组均值</th></tr>'+
    R.creGroups.map(g=>`<tr style="background:#f8fafc"><td><b>${esc(g.gkey)}</b></td><td class="num">${fmt0(g.shows)}</td><td class="num">${fmt0(g.clicks)}</td><td class="num"><b>${pct(g.gctr)}</b></td><td class="num">¥${fmt(g.cost)}</td><td class="num">组均值</td></tr>`+
      g.titles.map(t=>{
        const ratio=g.gctr? t.ctr/g.gctr:0;
        const cls=ratio>=1.2?'b-green':(ratio<SET.ctrLowPct/100&&t.shows>=50?'b-red':'b-gray');
        return `<tr><td style="padding-left:26px">${esc(t.title)}</td><td class="num">${fmt0(t.shows)}</td><td class="num">${fmt0(t.clicks)}</td><td class="num">${pct(t.ctr)}</td><td class="num">¥${fmt(t.cost)}</td><td class="num"><span class="badge ${cls}">${g.gctr?Math.round(ratio*100)+'%':'—'}</span></td></tr>`;
      }).join('')
    ).join('')+'</table>';

  document.getElementById('creWeak').innerHTML=R.weakCre.length? R.weakCre.map(c=>
    `<div class="alert warn" style="margin-bottom:6px"><div><b>[${esc(c.g)}]</b> ${esc(c.title)}<br><span style="font-size:12px">CTR ${pct(c.ctr)}（同组均值 ${pct(c.gctr)}，${fmt0(c.shows)}次展示）→ 建议暂停或重写</span></div></div>`).join('')
    : '<div class="empty">未发现显著低效创意 ✅</div>';
  document.getElementById('creTop').innerHTML=R.topCre.length? R.topCre.slice(0,8).map(c=>
    `<div class="alert ok" style="margin-bottom:6px"><div><b>CTR ${pct(c.ctr)}</b> ｜ ${esc(c.title)}<br><span style="font-size:12px">[${esc(c.g)}] ${fmt0(c.shows)}次展示 · 可提炼其句式复制到低效组</span></div></div>`).join('')
    : '<div class="empty">展示量不足，暂无法评定</div>';

  document.getElementById('advVsBasic').innerHTML=R.advCompare.length? tableHtml(
    ['推广组','高级样式CTR','基础创意CTR','高级CPC','基础CPC','结论'],
    R.advCompare.map(x=>{
      const b=x.basic;
      let verdict='—';
      if(b){
        if(x.adv.ctr>b.ctr*1.2) verdict='<span class="badge b-green">高级样式更优，保持</span>';
        else if(x.adv.ctr<b.ctr*0.8) verdict='<span class="badge b-amber">高级样式偏弱，更新凤舞物料</span>';
        else verdict='<span class="badge b-gray">相当</span>';
      }
      return [esc(x.gkey),pct(x.adv.ctr),b?pct(b.ctr):'—','¥'+fmt(x.adv.cpc),b?('¥'+fmt(b.cpc)):'—',verdict];
    }),[0,5]) : '<div class="empty">未导入高级创意报告</div>';
}

/* ---------- ⑥ 地域 ---------- */
function renderGeo(){
  if(!R.geo.length){ document.getElementById('geoTable').innerHTML='<div class="empty">未导入地域分析报告</div>'; return; }
  drawGeoChart();
  const dCls={'扩量':'b-green','保持':'b-blue','降价':'b-amber','收缩':'b-red','观察':'b-gray'};
  document.getElementById('geoTable').innerHTML=tableHtml(
    ['省份','消费','占比','展示','点击','CTR','CPC','诊断','建议'],
    R.geo.map(g=>[esc(g.region),'¥'+fmt(g.cost),pct(R.geoTot.cost?g.cost/R.geoTot.cost:0,1),fmt0(g.shows),fmt0(g.clicks),pct(g.ctr),'¥'+fmt(g.cpc),`<span class="badge ${dCls[g.diag]}">${g.diag}</span>`,esc(g.advice)]),[0,7,8]);
}
function drawGeoChart(){
  const cv=document.getElementById('chartGeo'); if(!cv) return;
  const {ctx,W,H}=prepCanvas(cv, 340);
  ctx.clearRect(0,0,W,H);
  const gs=R.geo.slice(0,12);
  const padL=90,padR=70,padT=24,padB=30;
  const bh=(H-padT-padB)/gs.length;
  const maxCost=Math.max(...gs.map(g=>g.cost),1);
  const C={label:tv('--chart-label'),shrink:tv('--geo-shrink'),down:tv('--geo-down'),up:tv('--geo-up'),keep:tv('--geo-keep')};
  ctx.font='12px "Microsoft YaHei"';
  gs.forEach((g,i)=>{
    const y=padT+i*bh;
    const w=(W-padL-padR)*g.cost/maxCost;
    ctx.fillStyle = g.diag==='收缩'?C.shrink:(g.diag==='降价'?C.down:(g.diag==='扩量'?C.up:C.keep));
    ctx.fillRect(padL,y+bh*0.15,w,bh*0.7);
    ctx.fillStyle=C.label; ctx.textAlign='right'; ctx.fillText(g.region,padL-8,y+bh/2+4);
    ctx.textAlign='left'; ctx.fillText('¥'+fmt0(g.cost)+' · CTR '+pct(g.ctr,1)+' · CPC ¥'+fmt(g.cpc,1), padL+w+8, y+bh/2+4);
  });
  ctx.textAlign='left'; ctx.fillStyle=C.label;
  ctx.fillText('▉红=建议收缩 ▉黄=建议降价 ▉绿=建议扩量 ▉蓝=保持（按消费降序TOP12）',padL,14);
}

/* ---------- ⑧ CPA 基准归因 ---------- */
function renderCpa(){
  const c = R.cpa; if(!c){ document.getElementById('cpa-alerts').innerHTML='<div class="empty">未计算</div>'; return; }
  const base = c.baselineCPA;
  const alerts=[];
  if(!base){ alerts.push('<div class="alert warn">⚠️ 本期有转化日不足，无法建立 CPA 基准（需至少 1 个有转化的日期）。</div>'); }
  else if(!c.highDays.length){ alerts.push('<div class="alert ok">✅ 各日转化成本均不超过基准的 '+c.thresh+'%，未见显著高 CPA 异动日。</div>'); }
  else {
    c.highDays.forEach(hd=>{ const f=c.factors.find(x=>x.date===hd); alerts.push(`<div class="alert danger">🚨 <b>${hd} 高转化成本日</b>：CPA ¥${fmt(f.cpa,1)}，较基准（¥${fmt(base,1)}）高 ${pct(f.dev,0)}，预估超额成本 ¥${fmt(f.excess,1)}。</div>`); });
  }
  document.getElementById('cpa-alerts').innerHTML=alerts.join('');

  document.getElementById('cpa-kpis').innerHTML=[
    {l:'基准 CPA', v:base?('¥'+fmt(base,1)):'—', d:'有转化日度CPA中位数'},
    {l:'基准日', v:c.baselineDays.length+' 天', d:c.baselineDays.map(d=>d.slice(5)).join('、')||'—'},
    {l:'高 CPA 异动日', v:c.highDays.length+' 天', d:c.highDays.map(d=>d.slice(5)).join('、')||'无'},
    {l:'高日预估超额成本', v:'¥'+fmt(c.wastedCost,0), d:'相对基准CPA多花的钱'}
  ].map(k=>`<div class="kpi"><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');

  drawCpaChart();

  /* 异动归因卡 */
  if(c.highDays.length){
    document.getElementById('cpa-attr').innerHTML = c.highDays.map(hd=>{
      const f=c.factors.find(x=>x.date===hd);
      const culps=(c.kwCulprits[hd]||[]).slice(0,6);
      const news=c.newTerms.filter(t=>t.highDays.includes(hd));
      const spk=c.spikedTerms.filter(t=>t.date===hd);
      const cre=c.creShift.filter(x=>x.shifts.some(s=>s.date===hd));
      const adv=c.advShift.filter(x=>x.shifts.some(s=>s.date===hd));
      return `<div class="card" style="margin-top:14px">
        <h2><span class="ic">🔎</span> 异动归因 · ${hd} <span class="tag">CPA ¥${fmt(f.cpa,1)} / 基准 ¥${fmt(base,1)} / 高出 ${pct(f.dev,0)}</span></h2>
        <div class="alert info" style="margin-bottom:10px">${f.text}</div>
        ${culps.length?`<div class="section-hint">主因关键词（按超额成本排序）</div>`+tableHtml(['关键词','当日消费','当日转化','当日CPA','基准CPA','超额成本'],[...culps].map(k=>[esc(k.kw),'¥'+fmt(k.cost),k.conv||0,k.cpa?('¥'+fmt(k.cpa,1)):'<span class="badge b-red">零转化</span>','¥'+fmt(k.baselineCpa,1),'¥'+fmt(k.contribution,1)]),[0]):''}
        ${news.length?`<div class="section-hint" style="margin-top:10px">当日新增、基准日从未出现且无转化的搜索词（预算吞噬源）</div>`+tableHtml(['搜索词','触发关键词','触发模式','消耗'],[...news].map(t=>[esc(t.query),esc(t.kw),esc(t.mode),'¥'+fmt(t.cost)]),[0,1,2]):''}
        ${spk.length?`<div class="section-hint" style="margin-top:10px">CPA 较基准骤升的搜索词</div>`+tableHtml(['搜索词','基准CPA','当日CPA','日期'],[...spk].map(t=>[esc(t.query),'¥'+fmt(t.baseCpa,1),'¥'+fmt(t.highCpa,1),t.date.slice(5)]),[0]):''}
        ${cre.length?`<div class="section-hint" style="margin-top:10px">创意 CTR 在高异动日明显下滑（点击变贵，代理归因※）</div>`+cre.map(x=>x.title+'：基准CTR '+pct(x.baseCtr)+' → '+x.shifts.filter(s=>s.date===hd).map(s=>s.date.slice(5)+' '+pct(s.ctr)+'('+(s.deltaPct*100).toFixed(0)+'%)').join('、')).map(t=>`<div class="alert warn" style="margin-bottom:6px">${esc(t)}</div>`).join(''):''}
        ${adv.length?`<div class="section-hint" style="margin-top:10px">高级样式 CTR 在高异动日明显下滑（代理归因※）</div>`+adv.map(x=>x.title+'：基准CTR '+pct(x.baseCtr)+' → '+x.shifts.filter(s=>s.date===hd).map(s=>s.date.slice(5)+' '+pct(s.ctr)+'('+(s.deltaPct*100).toFixed(0)+'%)').join('、')).map(t=>`<div class="alert warn" style="margin-bottom:6px">${esc(t)}</div>`).join(''):''}
      </div>`;
    }).join('');
  } else {
    document.getElementById('cpa-attr').innerHTML='';
  }

  /* 关键词×日 CPA 异常矩阵 */
  const km=c.kwMatrix.slice().sort((a,b)=>b.cost-a.cost).slice(0,25);
  document.getElementById('cpa-kwMatrix').innerHTML = km.length? '<table><tr><th>关键词</th><th class="num">总消费</th><th class="num">基准CPA</th>'+
    R.dates.map(d=>`<th style="text-align:center">${d.slice(5)}</th>`).join('')+'</tr>'+
    km.map(k=>{
      const bcls = k.baselineCpa!=null?'b-gray':'b-gray';
      return `<tr><td>${esc(k.kw)}</td><td class="num">¥${fmt(k.cost)}</td><td class="num">${k.baselineCpa!=null?('¥'+fmt(k.baselineCpa,1)):'—'}</td>`+
      R.dates.map(d=>{ const o=k.perDay[d]; if(!o||o.cost===0) return '<td></td>'; return `<td style="text-align:center">${cpaCell(o, base)}</td>`; }).join('')+
      '</tr>';
    }).join('')+'</table>' : '<div class="empty">无数据</div>';

  /* 搜索词新增/异动 */
  document.getElementById('cpa-newTerms').innerHTML = (c.newTerms.length||c.spikedTerms.length)?
    (c.newTerms.length?`<div class="section-hint">新增无转化搜索词（仅在异动日出现、基准日无、零转化）→ 优先否词围栏</div>`+tableHtml(['搜索词','触发关键词','触发模式','消耗','出现在异动日'],[...c.newTerms].map(t=>[esc(t.query),esc(t.kw),esc(t.mode),'¥'+fmt(t.cost),t.highDays.map(d=>d.slice(5)).join('、')]),[0,1,2]):'')+
    (c.spikedTerms.length?`<div class="section-hint" style="margin-top:10px">CPA 较基准骤升的搜索词</div>`+tableHtml(['搜索词','触发关键词','基准CPA','高异动日CPA','日期'],[...c.spikedTerms].map(t=>[esc(t.query),esc(t.kw),'¥'+fmt(t.baseCpa,1),'¥'+fmt(t.highCpa,1),t.date.slice(5)]),[0,1]):'')
    : '<div class="empty">未发现明显的搜索词新增/骤变 ✅</div>';

  /* 创意 / 高级样式 代理归因（CTR 波动） */
  document.getElementById('cpa-creShift').innerHTML = c.creShift.length? tableHtml(
    ['创意标题','基准CTR','异动日','当日CTR','CTR变化','当日CPC'],
    c.creShift.flatMap(x=>x.shifts.map(s=>([esc(x.title),pct(x.baseCtr),s.date.slice(5),pct(s.ctr),(s.deltaPct*100).toFixed(0)+'%',s.cpc?('¥'+fmt(s.cpc,1)):'—']))),[0])
    : '<div class="empty">创意 CTR 在各日波动均在 ±15% 内，未见明显下滑 ✅</div>';
  document.getElementById('cpa-advShift').innerHTML = c.advShift.length? tableHtml(
    ['推广组','基准CTR','异动日','当日CTR','CTR变化','当日CPC'],
    c.advShift.flatMap(x=>x.shifts.map(s=>([esc(x.title),pct(x.baseCtr),s.date.slice(5),pct(s.ctr),(s.deltaPct*100).toFixed(0)+'%',s.cpc?('¥'+fmt(s.cpc,1)):'—']))),[0])
    : '<div class="empty">高级样式（凤舞）CTR 在各日波动均在 ±15% 内，未见明显下滑 ✅</div>';
}
function cpaCell(o, base){
  if(o.conv===0) return `<span class="heatcell" style="background:${tv('--heat-0')};color:${tv('--heat-0-t')}">零转化</span>`;
  const ratio = base? o.cpa/base : 1;
  const bg = ratio<=1?tv('--heat-2'):(ratio<=1.5?tv('--heat-1'):'#fca5a5');
  const col = ratio<=1.5?tv('--heat-3-t'):'#7f1d1d';
  return `<span class="heatcell" style="background:${bg};color:${col}">¥${fmt(o.cpa,0)}</span>`;
}
function drawCpaChart(){
  const cv=document.getElementById('chartCpa'); if(!cv) return;
  const {ctx,W,H}=prepCanvas(cv, 320);
  ctx.clearRect(0,0,W,H);
  const c=R.cpa; if(!c||!c.days.length) return;
  const d=c.days;
  const padL=64,padR=20,padT=30,padB=46;
  const iw=(W-padL-padR)/d.length;
  const maxCpa=Math.max(...d.map(x=>x.cpa||0), c.baselineCPA||1)*1.15;
  const C={grid:tv('--chart-grid'),axis:tv('--chart-axis'),label:tv('--chart-label'),
    cost:tv('--chart-cost'),conv:tv('--chart-conv'),base:tv('--chart-conv-zero'),zero:tv('--geo-shrink')};
  ctx.font='12px "Microsoft YaHei"';
  /* 网格 */
  ctx.strokeStyle=C.grid; ctx.fillStyle=C.axis; ctx.textAlign='right';
  for(let i=0;i<=4;i++){ const y=padT+(H-padT-padB)*i/4; ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke(); ctx.fillText('¥'+fmt0(maxCpa*(4-i)/4), padL-6, y+4); }
  /* 基准线 */
  if(c.baselineCPA){ const by=padT+(H-padT-padB)*(1-c.baselineCPA/maxCpa); ctx.strokeStyle=C.base; ctx.setLineDash([6,4]); ctx.lineWidth=1.5; ctx.beginPath();ctx.moveTo(padL,by);ctx.lineTo(W-padR,by);ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=C.base; ctx.textAlign='left'; ctx.fillText('基准CPA ¥'+fmt(c.baselineCPA,1), padL+4, by-6); }
  /* 柱 */
  d.forEach((x,i)=>{
    const bx=padL+i*iw+iw*0.22, bw=iw*0.56;
    const bh=(H-padT-padB)*(x.cpa?x.cpa/maxCpa:0);
    ctx.fillStyle = x.isHigh?C.zero:(x.isBaseline?C.conv:(x.isZero?'#cbd5e1':C.cost));
    if(x.cpa) ctx.fillRect(bx,H-padB-bh,bw,bh);
    ctx.fillStyle=C.label; ctx.textAlign='center';
    ctx.fillText(x.date.slice(5), padL+i*iw+iw/2, H-padB+16);
    if(x.isZero){ ctx.fillStyle=C.zero; ctx.fillText('零转化', bx+bw/2, H-padB-6); }
    else ctx.fillText('¥'+fmt0(x.cpa), bx+bw/2, H-padB-bh-6);
  });
  /* 图例 */
  ctx.textAlign='left'; ctx.fillStyle=C.label;
  ctx.fillRect(padL,8,12,9); ctx.fillText('高异动日',padL+16,17);
  ctx.fillStyle=C.conv; ctx.fillRect(padL+90,8,12,9); ctx.fillText('基准日',padL+106,17);
  ctx.fillStyle=C.cost; ctx.fillRect(padL+170,8,12,9); ctx.fillText('普通日',padL+186,17);
  ctx.fillStyle=C.zero; ctx.fillRect(padL+250,8,12,9); ctx.fillText('零转化日',padL+266,17);
}

/* ---------- ⑦ 操作清单 ---------- */
function renderActions(){
  const pName={0:'P0 紧急',1:'P1 重要',2:'P2 常规'};
  document.getElementById('actionList').innerHTML = R.actions.length? R.actions.map(a=>
    `<div class="alert ${a.p===0?'danger':(a.p===1?'warn':'info')}"><span class="prio p${a.p}">P${a.p}</span><div><b>[${a.mod}]</b> ${a.act}</div></div>`).join('')
    : '<div class="empty">无操作建议</div>';
}
function copyActions(){
  copyText(R.actions.map(a=>`[P${a.p}][${a.mod}] ${a.act}`).join('\n'),'操作清单已复制（'+R.actions.length+'条）');
}
