/* ============ 渲染层：KPI / 图表 / 表格 ============ */
function tv(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
/* 数据感知浮层 · 辅助函数 */
function dt(type, value, innerHTML, bench, label, context){
  var a='data-tip-type="'+type+'"';
  if(value!=null) a+=' data-tip-value="'+String(value).replace(/"/g,'&quot;')+'"';
  if(bench!=null) a+=' data-tip-bench="'+String(bench).replace(/"/g,'&quot;')+'"';
  if(label) a+=' data-tip-label="'+esc(label)+'"';
  if(context) a+=' data-tip-context="'+esc(context)+'"';
  return '<span '+a+'>'+innerHTML+'</span>';
}

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
  renderDashboard(); renderWorkflow(); renderOverview(); renderQuad(); renderConv(); renderConvDaily(); renderQuery(); renderCreative(); renderGeo(); renderCpa(); renderShift(); renderCovar(); renderActions(); renderDiag();
}

/* ---------- 全局仪表盘（Dashboard） ---------- */
function renderDashboard(){
  const dc=document.getElementById('dashboardCard'), el=document.getElementById('dashboard');
  if(!dc||!el||!R||!R.tot) return;
  dc.style.display='block';
  const tot=R.tot, prev=R.compare||{};
  const delta=(key)=>{
    if(!prev[key]&&prev[key]!==0) return '';
    const p=prev[key], c=tot[key];
    if(p===0&&c===0) return '';
    const d=p?((c-p)/p*100):0;
    const cls=d>0?'up':'down';
    const arrow=d>0?'↑':'↓';
    return `<span class="dc-delta ${cls}">${arrow} ${Math.abs(d).toFixed(1)}%</span>`;
  };
  /* 环比转化 */
  const compareConv = R.compare && R.compare.conv!==undefined? R.compare.conv : null;
  const convDelta = compareConv!==null?
    (compareConv===0&&R.tot.conv===0?'':`<span class="dc-delta ${R.tot.conv>compareConv?'up':'down'}">${R.tot.conv>compareConv?'↑':'↓'} ${compareConv?(Math.abs((R.tot.conv-compareConv)/compareConv*100).toFixed(1)):'—'}%</span>`)
    :(prev.conv?delta('conv'):'');
  el.innerHTML=[
    {l:'总消费',v:'¥'+fmt(R.tot.cost,0),s:fmt0(R.tot.shows)+' 展示 · '+R.dates.length+' 天',d:delta('cost'),cls:'dc-cost'},
    {l:'点击',v:fmt0(R.tot.clicks),s:'CTR '+pct(R.tot.ctr),d:delta('clicks'),cls:'dc-click'},
    {l:'转化',v:R.tot.conv,s:'CPA ¥'+(R.tot.conv?fmt(R.tot.cpa):'—'),d:convDelta,cls:'dc-conv'},
    {l:'转化成本',v:'¥'+(R.tot.conv?fmt(R.tot.cpa):'—'),s:'日均 ¥'+fmt(R.tot.cost/R.dates.length,0)+'/'+(R.tot.conv?fmt(R.tot.conv/R.dates.length,1):'0')+' 转',d:'',cls:'dc-cpa'},
    {l:'核心转化词',v:(R.coreKws?R.coreKws.length:'—'),s:'贡献 '+pct(R.coreConvPct||0)+' 转化',d:'',cls:'dc-ctr'},
    {l:'诊断操作',v:(R.actions||[]).length,s:'P0:'+(R.actions||[]).filter(a=>a.p===0).length+' P1:'+(R.actions||[]).filter(a=>a.p===1).length+' P2:'+(R.actions||[]).filter(a=>a.p===2).length,d:'',cls:'dc-shows'}
  ].map(c=>
    `<div class="dash-card ${c.cls}"><div class="dc-lbl">${c.l}</div><div class="dc-val">${c.v}</div><div class="dc-sub">${c.s}${c.d?' '+c.d:''}</div></div>`
  ).join('');

  /* 操作摘要快捷入口 */
  const hintEl=document.getElementById('dashboard-hint');
  if(hintEl) hintEl.textContent='分析周期：'+R.period+' · 已载入 '+(R.coverage?R.coverage.typesPresent.length:0)+' 类报告 · 设备：'+(R.coverage?(R.coverage.deviceScope==='both'?'PC+移动':R.coverage.deviceScope||'未识别'):'—');

  const actQuick=document.getElementById('dashboard-actions-quick');
  if(actQuick && R.actions && R.actions.length){
    const p0=R.actions.filter(a=>a.p===0), p1=R.actions.filter(a=>a.p===1), p2=R.actions.filter(a=>a.p===2);
    let html='<div class="section-hint" style="margin-bottom:6px">⚡ 紧急操作预览（点击展开/折叠）：</div><div class="action-summary">';
    if(p0.length) html+='<span class="action-chip ac-p0" onclick="toggleActionPreview()">🔴 P0 紧急：'+p0.length+' 条</span>';
    if(p1.length) html+='<span class="action-chip" onclick="toggleActionPreview()">🟡 P1 重要：'+p1.length+' 条</span>';
    html+='<span class="action-chip" onclick="switchToActions()">📋 查看完整清单（'+(p0.length+p1.length+p2.length)+' 条）</span>';
    html+='</div>';
    html+='<div id="actionPreviewPanel" class="action-preview" style="display:'+(ACTIONS_EXPANDED?'block':'none')+'">'+(ACTIONS_EXPANDED?renderActionPreviewItems():'')+'</div>';
    actQuick.innerHTML=html;
  }
}
/* 仪表盘操作预览：展开/折叠 */
function renderActionPreviewItems(){
  const top=R.actions.slice(0, Math.min(10, R.actions.length));
  let html='<div class="action-preview-header"><span>前 '+top.length+' 条优先级操作</span><button class="btn sm" onclick="toggleActionPreview()">▲ 收起预览</button></div>';
  html+=top.map(a=>'<div class="alert '+(a.p===0?'danger':(a.p===1?'warn':'info'))+'"><span class="prio p'+a.p+'">P'+a.p+'</span><div><b>['+esc(a.mod)+']</b> '+esc(a.act)+'</div></div>').join('');
  if(R.actions.length>top.length) html+='<div class="section-hint" style="margin-top:8px">还有 '+(R.actions.length-top.length)+' 条操作，<a href="javascript:switchToActions()">查看完整清单 →</a></div>';
  return html;
}
function toggleActionPreview(){
  ACTIONS_EXPANDED = !ACTIONS_EXPANDED;
  const panel=document.getElementById('actionPreviewPanel');
  if(panel){
    panel.style.display = ACTIONS_EXPANDED ? 'block':'none';
    if(ACTIONS_EXPANDED) panel.innerHTML = renderActionPreviewItems();
  } else {
    renderDashboard();
  }
}
/* 快捷跳转到操作清单 */
function switchToActions(){
  const tab=document.querySelector('.tab[data-p="p-actions"]');
  if(tab) switchTab(tab);
}
function deviceScopeBlock(cov){
  const ds = cov.deviceScope || 'unknown';
  const label = ds==='both'?'PC + 移动（混合投放）': ds==='pc'?'仅 PC 端': ds==='mobile'?'仅 移动端':'未识别设备端';
  const badge = ds==='unknown' ? '<span class="badge b-amber">⚠ 未识别设备端</span>' : '<span class="badge b-green">'+label+'</span>';
  const hint = cov.deviceUnknown>0 ? '<span class="section-hint" style="margin-top:4px">⚠ 有 '+cov.deviceUnknown+' 个报告未识别设备端，建议文件名标注「PC / 移动」以便分端分析（系统已按文件名 / 表头自动识别）。</span>' : '';
  return '<div style="margin:6px 0 10px"><b>设备端识别：</b> '+badge+' <span class="section-hint" style="margin-left:6px">离线自动识别（文件名 / 表头双轨）</span></div>'+hint;
}

function renderWorkflow(){
  const wf=document.getElementById('workflow');
  if(!wf || !R || !R.coverage) return;
  const cov=R.coverage;
  const tMap={search:'搜索词报告',kw:'关键词报告',grp:'推广组报告',plan:'计划报告',acct:'账户报告',geo:'地域报告',basic:'基础创意报告',adv:'高级创意报告',comp:'创意组件报告',pic:'创意配图报告',hour:'分时报告',invalid:'无效点击报告',ocpc:'oCPC报告',rank:'平均排名(PC/移动)'};
  const loaded=cov.typesPresent.map(t=>`<span class="badge b-green">✔ ${tMap[t]||t}</span>`).join(' ');
  const allTypes=['search','kw','grp','plan','acct','geo','basic','adv','comp','pic','hour','invalid','ocpc','rank'];
  const missing=allTypes.filter(t=>!cov.typesPresent.includes(t)).map(t=>`<span class="badge b-gray">✘ ${tMap[t]||t}</span>`).join(' ');
  const stageMap=[
    {s:'① 展示 / 曝光', types:['search','kw','grp','plan','acct','geo','basic','adv','hour','invalid','ocpc','rank'], d:'量级的入口：各报告都含「展示次数」'},
    {s:'② 点击 / CTR', types:['search','kw','grp','plan','acct','geo','basic','adv','hour','invalid','ocpc','rank'], d:'点击率由 创意(基础/高级)、排名、匹配方式、无效点击稀释 共同决定'},
    {s:'③ 浅层转化（咨询/表单）', types:['kw','search','ocpc'], d:'主要来自 关键词报告「浅层转化数」；意图→兴趣 的第一次转化'},
    {s:'④ 深层转化（成交/线索）', types:['search','ocpc'], d:'搜索词报告「转化数」是波动归因锚点；oCPC 投放包转化'},
    {s:'⑤ CPA / 成本控制', types:['search','ocpc'], d:'消费÷深层转化；oCPC 以目标CPA智能出价'}
  ];
  const funnelHtml=stageMap.map(st=>{
    const covTypes=st.types.filter(t=>cov.typesPresent.includes(t)).map(t=>tMap[t]||t);
    const missTypes=st.types.filter(t=>!cov.typesPresent.includes(t)).map(t=>tMap[t]||t);
    return `<div class="funnel-stage">
      <div class="fs-head"><span class="fs-name">${st.s}</span><span class="fs-desc">${st.d}</span></div>
      <div class="fs-cov">${covTypes.length?covTypes.map(t=>`<span class="badge b-green">✔ ${t}</span>`).join(' '):'<span class="badge b-gray">未覆盖</span>'}${missTypes.length?` <span class="fs-miss">缺失：${missTypes.join('、')}</span>`:''}</div>
    </div>`;
  }).join('');
  const catMap={};
  cov.modules.forEach(m=>{ (catMap[m.cat]=catMap[m.cat]||[]).push(m); });
  const modHtml=Object.entries(catMap).map(([cat,ms])=>`<div class="wf-cat"><div class="wf-cat-h">${cat}</div>`+ms.map(m=>{
    const cls=m.ready?'b-green':'b-gray';
    const icon=m.ready?'✔ 已运行':'✘ 未提供数据·跳过';
    const need=(m.or?'需任一：':'需：')+m.need.map(t=>tMap[t]||t).join('/');
    return `<div class="wf-mod"><span class="badge ${cls}">${icon}</span><span class="wf-mod-name">${m.name}</span><span class="wf-mod-need">${need}</span></div>`;
  }).join('')+'</div>').join('');
  wf.innerHTML=`
    <div class="card"><h2><span class="ic">🧭</span> 数据覆盖与诊断工作流 <span class="tag">丢入哪些分日文件，就跑哪些分析</span><span class="help-btn" data-help="workflow" title="数据覆盖与诊断工作流帮助">?</span></h2>
      <div class="section-hint">已载入 <b>${cov.typesPresent.length}</b> 类报告，可运行 <b>${cov.readyCount}/${cov.total}</b> 个诊断模块。本系统为离线本地工具，所有数据仅在浏览器处理、不上传；DeepSeek AI 解读为可选增强（需填入 API Key 并联网）。缺失某些报告不影响其余模块独立分析。</div>
      <div style="margin:10px 0"><b>已载入：</b> ${loaded||'<span class="badge b-gray">无</span>'}</div>
      <div style="margin:6px 0 14px"><b>未提供：</b> ${missing}</div>
      ${deviceScopeBlock(cov)}
      <h3>关键词转化链路 · 各报告表头关联性</h3>
      <div class="funnel">${funnelHtml}</div>
      <h3 style="margin-top:16px">诊断模块运行矩阵</h3>
      ${modHtml}
    </div>`;
}

/* ---------- ⑧ 转化关联诊断（任务14） ---------- */
function renderCovar(){
  const card=document.getElementById('covarCard'), el=document.getElementById('covarUnits');
  if(!card||!el) return;
  const cv=R.covar;
  if(!cv || !cv.units || !cv.units.length){ card.style.display='none'; return; }
  card.style.display='block';
  const note=document.getElementById('covar-note'); if(note) note.textContent=cv.note;

  /* 维度解读词典 · 一句话结论 + 操作指南
     rUp  = r>0（正相关）：维度数值越高 → 转化越多
     rDown= r<0（负相关）：维度数值越高 → 转化越少
     "弱/中/强" = 相关性可信程度，不是维度本身的等级评价
  */
  const DIM_HELP={
    '\u521b\u610fCTR': {
      name:'创意吸引力（CTR）',
      desc:'CTR = 用户看到你的广告后，有多大比例会点进来。越高 = 标题/图片越抓人',
      rUp_conclusion:'创意越吸引人，转化越好 → 好标题、好图片直接带单',
      rUp_actions:['保持高CTR创意的投放，别轻易停掉——它们是"金牌销售"','照着高CTR创意的风格批量复制，多做几个类似的','把没人点的低CTR创意换成高CTR的改版'],
      rDown_conclusion:'创意越吸引人，转化反而越少 → 可能标题太夸张，点了之后发现货不对板',
      rDown_actions:['检查创意文案是不是太"标题党"了——人来了但发现不是想要的','做个A/B测试：把夸张词汇去掉，看转化率会不会回升','去搜索词报告看高CTR的词——用户搜的跟你的业务真的匹配吗？']
    },
    '\u6392\u540d': {
      name:'广告排名',
      desc:'排名 = 你的广告在搜索结果里排第几。数字越小越靠前（第1位最好）',
      rUp_conclusion:'排名越靠后（数字越大），转化反而越多 → 这些词的用户喜欢翻到后面比价再做决定',
      rUp_actions:['不要无脑提价——既然靠后转化也不错，可以适当降价把预算给更需要的词','看看是不是"比价型"关键词，这类词的位置靠后一点反而性价比高'],
      rDown_conclusion:'排名越靠后（数字越大），转化越少 → 排名掉了正在拖累转化，得抢救',
      rDown_actions:['找出掉排名的词，优先给高转化的提价抢回位置','检查质量分有没有下降（CTR不行、搜索词相关性差都会拖累质量分）','考虑加否定词——低匹配流量会拉低质量分，间接拖累排名']
    },
    '\u65e0\u6548\u70b9\u51fb\u8fc7\u6ee4\u6bd4': {
      name:'无效流量占比',
      desc:'过滤比 = 360系统拦截的作弊/误点点击占总点击的比例。越高 = 垃圾流量越多',
      rUp_conclusion:'过滤比越高，转化越好 → 360的反作弊系统正在帮你挡垃圾，正常流量更纯',
      rUp_actions:['保持现在的匹配方式和定向设置，不要随意放宽','不要把否定词删掉或把匹配放宽——一放宽垃圾流量就会涌进来'],
      rDown_conclusion:'过滤比越高，转化越差 → 垃圾流量太多了，反作弊系统来不及拦截，预算白白烧掉',
      rDown_actions:['收紧匹配方式——从广泛改成短语、从短语改成精确','去搜索词报告，把不相关的低质量搜索词全加进否定词','看垃圾流量集中在哪些时段或地域，针对性调整']
    },
    '\u5730\u57df\u96c6\u4e2d\u5ea6': {
      name:'地域投放集中度',
      desc:'集中度 = 你的预算有多少比例砸在最贵的1-2个省份。越高 = 越"偏食"，只投少数地区',
      rUp_conclusion:'钱越集中在少数几个省份，转化越好 → 说明你选对了重点区域',
      rUp_actions:['继续保持对高转化省份的重点投放','给这些省份单独建计划，方便精细控价','如果还有没投但感觉有潜力的省份，小预算试探一下'],
      rDown_conclusion:'钱越集中在少数省份，转化反而越差 → 就像只在北上广开店，其他城市的顾客全错过了',
      rDown_actions:['把预算分散到更多省份试试，小预算测试其他省份的转化','给被忽略的省份单独建计划，出价不用高，先探路','如果要全国投，给低竞争省份单独调高价系数——那里可能更便宜']
    },
    '\u65f6\u6bb5\u96c6\u4e2d\u5ea6': {
      name:'时段投放集中度',
      desc:'集中度 = 你的预算有多少比例砸在最忙的1-3个时段。越高 = 越"偏食"，只投少数时段',
      rUp_conclusion:'时段越集中在高效时段，转化越好 → 好钢用在刀刃上，砸对时间了',
      rUp_actions:['保持高效时段的投放力度，甚至可以考虑加价','看看哪几个小时转化最好，给它们设置更高的分时出价系数','低效时段设低价或直接暂停——别在不该花的时间段浪费钱'],
      rDown_conclusion:'时段越集中在少数几个时段，转化反而越少 → 就像饭店只开中午，晚上和早上的客人全错过了',
      rDown_actions:['给其他时段小预算测试一下，说不定有意外发现','被忽略的时段不要完全关掉——出价设低一点，保留曝光但不抢预算','找出除了当前高峰外的第二、第三好时段，把"只开一餐"变成"全天营业"']
    }
  };

  /* 悬浮提示 */
  const tipEl = document.getElementById('covarTooltip');
  const tipContent = document.getElementById('covarTipContent');
  const tipArrow = document.getElementById('covarTipArrow');
  function showTip(e, dim, r, dir, strength){
    const h = DIM_HELP[dim];
    if(!h || !tipEl || !tipContent) return;
    if(dir===''||strength==='\u65e0\u4fe1\u53f7'){
      /* 无信号：说明这个维度数据不足或未导出 */
      tipContent.innerHTML =
        '<div class="tip-dim"><span class="badge b-gray">'+esc(h.name||dim)+'</span></div>'+
        '<div class="tip-stat" style="margin-bottom:6px;color:var(--muted)"><b>\u65e0\u4fe1\u53f7</b> = \u6570\u636e\u4e0d\u8db3\uff0c\u770b\u4e0d\u51fa\u8fd9\u4e2a\u7ef4\u5ea6\u4e0e\u8f6c\u5316\u7684\u660e\u663e\u89c4\u5f8b</div>'+
        '<div class="tip-mean">\u8fd9\u4e2a\u7ef4\u5ea6\u4e0e\u8f6c\u5316\u6ce2\u52a8\u7684\u5173\u7cfb\u4e0d\u5927\uff0c\u53ef\u80fd\u662f\u6570\u636e\u91cf\u4e0d\u591f\u6216\u672a\u5bfc\u51fa\u76f8\u5173\u62a5\u544a\u3002</div>'+
        '<div class="tip-opt">\ud83d\udca1 \u5982\u679c\u8fd9\u4e2a\u7ef4\u5ea6\u5bf9\u4f60\u5f88\u91cd\u8981\uff0c\u53ef\u4ee5\u5bfc\u51fa\u76f8\u5173\u62a5\u544a\u540e\u91cd\u65b0\u5206\u6790\u3002</div>';
    } else if(dir==='\u2191'){
      tipContent.innerHTML =
        '<div class="tip-dim"><span class="badge '+(strength==='\u5f3a'?'b-red':strength==='\u4e2d'?'b-amber':'b-gray')+'">'+esc(h.name)+' r='+r.toFixed(2)+' \u2191 \u00b7 '+strength+'</span></div>'+
        '<div class="tip-stat" style="margin-bottom:6px;color:var(--muted);line-height:1.8">'+
        '<b>\ud83d\udcc8 \u6b63\u76f8\u5173</b>\uff1a\u8fd9\u4e2a\u6307\u6807\u8d8a\u9ad8\uff0c\u5f53\u5929\u7684\u8f6c\u5316\u5c31\u8d8a\u591a<br>'+
        '<b>\ud83d\udd10 \u53ef\u4fe1\u5ea6\u201c'+strength+'\u201d</b>\uff1a\u6570\u636e\u91cc\u80fd\u770b\u51fa\u8fd9\u4e2a\u8d8b\u52bf\uff0c\u4f46'+esc(strength==='\u5f3a'?'\u6570\u636e\u91cc\u8fd9\u4e2a\u8d8b\u52bf\u975e\u5e38\u660e\u663e\uff0c\u5927\u6982\u7387\u662f\u771f\u7684\uff0c\u4f46\u4ecd\u8981\u7ed3\u5408\u5e38\u8bc6\u5224\u65ad\u4e00\u4e0b':strength==='\u4e2d'?'\u6570\u636e\u91cc\u80fd\u770b\u5230\u8d8b\u52bf\uff0c\u4f46\u6837\u672c\u6709\u9650\u2014\u2014\u50cf\u770b\u4e86\u51e0\u5929\u5929\u6c14\u9884\u62a5\uff0c\u53ef\u4ee5\u53c2\u8003\u4f46\u522b\u5168\u4fe1':'\u6570\u636e\u592a\u5c11\uff0c\u53ea\u80fd\u770b\u5230\u4e00\u70b9\u82d7\u5934\u2014\u2014\u522b\u8fc7\u5ea6\u89e3\u8bfb\uff0c\u5148\u89c2\u5bdf\u591a\u6512\u70b9\u6570\u636e\u518d\u8bf4')+'\uff0c\u5efa\u8bae\u7ed3\u5408\u4e1a\u52a1\u5e38\u8bc6\u5224\u65ad'+
        (h.desc?'<br><span style="color:var(--muted-2);font-size:12px">\u2139\ufe0f '+esc(h.desc)+'</span>':'')+
        '</div>'+
        '<div class="tip-mean">\ud83d\udca1 <b>'+esc(h.rUp_conclusion)+'</b></div>'+
        '<div class="tip-opt"><b>\u2714 \u4f60\u5e94\u8be5\u8fd9\u6837\u505a\uff1a</b><ol style="margin:6px 0 0;padding-left:18px">'+h.rUp_actions.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ol></div>';
    } else {
      tipContent.innerHTML =
        '<div class="tip-dim"><span class="badge '+(strength==='\u5f3a'?'b-red':strength==='\u4e2d'?'b-amber':'b-gray')+'">'+esc(h.name)+' r='+r.toFixed(2)+' \u2193 \u00b7 '+strength+'</span></div>'+
        '<div class="tip-stat" style="margin-bottom:6px;color:var(--muted);line-height:1.8">'+
        '<b>\ud83d\udcc9 \u8d1f\u76f8\u5173</b>\uff1a\u8fd9\u4e2a\u6307\u6807\u8d8a\u9ad8\uff0c\u5f53\u5929\u7684\u8f6c\u5316\u5c31\u8d8a\u5c11<br>'+
        '<b>\ud83d\udd10 \u53ef\u4fe1\u5ea6\u201c'+strength+'\u201d</b>\uff1a\u6570\u636e\u91cc\u80fd\u770b\u51fa\u8fd9\u4e2a\u8d8b\u52bf\uff0c\u4f46'+esc(strength==='\u5f3a'?'\u6570\u636e\u91cc\u8fd9\u4e2a\u8d8b\u52bf\u975e\u5e38\u660e\u663e\uff0c\u5927\u6982\u7387\u662f\u771f\u7684\uff0c\u4f46\u4ecd\u8981\u7ed3\u5408\u5e38\u8bc6\u5224\u65ad\u4e00\u4e0b':strength==='\u4e2d'?'\u6570\u636e\u91cc\u80fd\u770b\u5230\u8d8b\u52bf\uff0c\u4f46\u6837\u672c\u6709\u9650\u2014\u2014\u50cf\u770b\u4e86\u51e0\u5929\u5929\u6c14\u9884\u62a5\uff0c\u53ef\u4ee5\u53c2\u8003\u4f46\u522b\u5168\u4fe1':'\u6570\u636e\u592a\u5c11\uff0c\u53ea\u80fd\u770b\u5230\u4e00\u70b9\u82d7\u5934\u2014\u2014\u522b\u8fc7\u5ea6\u89e3\u8bfb\uff0c\u5148\u89c2\u5bdf\u591a\u6512\u70b9\u6570\u636e\u518d\u8bf4')+'\uff0c\u5efa\u8bae\u7ed3\u5408\u4e1a\u52a1\u5e38\u8bc6\u5224\u65ad'+
        (h.desc?'<br><span style="color:var(--muted-2);font-size:12px">\u2139\ufe0f '+esc(h.desc)+'</span>':'')+
        '</div>'+
        '<div class="tip-mean">\u26a0\ufe0f <b>'+esc(h.rDown_conclusion)+'</b></div>'+
        '<div class="tip-opt"><b>\u2714 \u4f60\u5e94\u8be5\u8fd9\u6837\u505a\uff1a</b><ol style="margin:6px 0 0;padding-left:18px">'+h.rDown_actions.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ol></div>';
    }
    tipEl.classList.add('show');
    posTip(e);
  }
  function posTip(e){
    const rect = e.target.getBoundingClientRect();
    const tipW = tipEl.offsetWidth || 340;
    const tipH = tipEl.offsetHeight || 120;
    let left = rect.left + rect.width/2 - tipW/2;
    if(left < 12) left = 12;
    if(left + tipW > window.innerWidth - 12) left = window.innerWidth - tipW - 12;
    let top = rect.bottom + 10;
    const arrowDown = rect.bottom + tipH + 16 < window.innerHeight;
    if(!arrowDown){ top = rect.top - tipH - 10; tipArrow.className = 'covar-tip-arrow bottom'; }
    else { tipArrow.className = 'covar-tip-arrow top'; }
    tipEl.style.left = left+'px';
    tipEl.style.top = top+'px';
  }
  function hideTip(){ if(tipEl) tipEl.classList.remove('show'); }
  const tipHandler = function(e){
    const badge = e.target.closest('[data-covar-dim]');
    if(!badge){ hideTip(); return; }
    const dim = badge.dataset.covarDim;
    const r = parseFloat(badge.dataset.covarR||'0');
    const dir = badge.dataset.covarDir||'';
    const strength = badge.dataset.covarStrength||'';
    showTip(e, dim, r, dir, strength);
  };
  const tipLeave = function(){ hideTip(); };

  let html='';
  /* 计划类型诊断 */
  if(cv.planTypes && cv.planTypes.length){
    html += '<div style="margin:6px 0 12px"><b style="font-size:13px">\u8ba1\u5212\u7c7b\u578b\u8bca\u65ad\uff1a</b> '+cv.planTypes.map(p=>{
      const cls = p.type==='\u7a7a\u8f6c\u578b'?'b-red':(p.type==='\u9884\u7b97/\u66dd\u5149\u9a71\u52a8\u578b'?'b-blue':'b-green');
      return `<span class="badge ${cls}" title="${esc(p.lever)}">${esc(p.plan)}\uff1a${esc(p.type)}${p.corrConvCost!=null?(' (r='+p.corrConvCost.toFixed(2)+')'):''}</span>`;
    }).join(' ')+'</div>';
  }
  /* 空转单元预警 */
  if(cv.emptyRuns && cv.emptyRuns.length){
    html += '<div class="alert danger" style="margin:6px 0 12px">\ud83d\udea8 <b>\u7a7a\u8f6c\u5355\u5143\u9884\u8b66\uff08\u9ad8\u6d88\u8d39 0 \u8f6c\u5316\uff09</b>\uff1a'+cv.emptyRuns.map(e=>esc(e.name)+'(\u00a5'+fmt(e.cost)+')').join('\u3001')+'\u2014\u2014 \u5efa\u8bae\u6682\u505c\u91cd\u5ba1\u6216\u5426\u8bcd/\u521b\u610f\u91cd\u5efa\u3002</div>';
  }
  /* 各高转化单元的驱动变量 */
  html += cv.units.map(u=>{
    const drv = u.drivers.map(d=>{
      const c=(d.strength==='\u5f3a'?'b-red':d.strength==='\u4e2d'?'b-amber':'b-gray');
      return `<span class="badge ${c}" data-covar-dim="${esc(d.dim)}" data-covar-r="${d.r}" data-covar-dir="${esc(d.dir)}" data-covar-strength="${esc(d.strength)}">${esc(d.dim)} r=${d.r.toFixed(2)}${d.dir}\u00b7${d.strength}</span>`;
    }).join(' ');
    const exc = u.excludes.length? u.excludes.map(e=>{
      return `<span class="badge b-gray" data-covar-dim="${esc(e)}" data-covar-r="0" data-covar-dir="" data-covar-strength="\u65e0\u4fe1\u53f7">${esc(e)} \u65e0\u4fe1\u53f7</span>`;
    }).join(' '):'';
    return `<div style="border:1px solid var(--border,#E6EBE9);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface,#fff)">
      <div style="font-size:13px;margin-bottom:6px"><span class="badge b-purple">${esc(u.scope)}</span> <b>${esc(u.target)}</b> \u00b7 ${esc(u.plan)} / ${esc(u.group)} \u00b7 \u603b\u8f6c\u5316${u.convTotal||0} \u00b7 <span style="color:var(--muted)">\u951a\u70b9:${esc(u.anchorSource)}</span></div>
      <div style="font-size:12.5px;color:var(--text-2,#3D4B44);margin:3px 0;line-height:1.9"><b>\u53ef\u80fd\u9a71\u52a8\u53d8\u91cf\uff08\u6309\u76f8\u5173\u6027\uff09\uff1a</b>${drv||'\u2014'}</div>
      ${exc?`<div style="font-size:12.5px;color:var(--muted);margin:3px 0;line-height:1.9"><b>\u65e0\u663e\u8457\u76f8\u5173\uff1a</b>${exc}</div>`:''}
    </div>`;
  }).join('');
  el.innerHTML = html;

  /* 事件委托：悬浮提示 */
  el.onmouseover = el.onmousemove = function(e){
    const badge = e.target.closest('[data-covar-dim]');
    if(!badge){ hideTip(); return; }
    const dim = badge.dataset.covarDim;
    const r = parseFloat(badge.dataset.covarR||'0');
    const dir = badge.dataset.covarDir||'';
    const strength = badge.dataset.covarStrength||'';
    showTip(e, dim, r, dir, strength);
  };
  el.onmouseleave = function(){ hideTip(); };
}

function renderShift(){
  const sd=R.shift;
  const host=document.getElementById('shift-cards');
  if(host){
    if(!sd || !sd.data.length){ host.innerHTML='<div class="empty">无足够转化数据（需存在转化≥3的核心词）</div>'; return; }
    document.getElementById('shift-kpis').innerHTML=[
      {l:'分析的高转化词', v:sd.data.length+' 个', d:'转化≥3 的核心词'},
      {l:'CVR 骤降关联点', v: sd.data.reduce((s,x)=>s+x.drops.length,0)+' 处', d:'CVR较前日骤降≥30%'},
      {l:'关联结论数', v: sd.data.reduce((s,x)=>s+x.conclusions.length,0)+' 条', d:'CVR骤降且搜索词结构变化'},
      {l:'新词↔CVR 相关性', v:(()=>{const v=sd.data.filter(x=>x.rNew!=null&&!isNaN(x.rNew));return v.length?fmt(v.reduce((s,x)=>s+x.rNew,0)/v.length,2):'—';})(), d:'Pearson r（越接近1越正相关，仅统计可计算的核心词）', tip:'rValue', tv:(()=>{const v=sd.data.filter(x=>x.rNew!=null&&!isNaN(x.rNew));return v.length?v.reduce((s,x)=>s+x.rNew,0)/v.length:0;})()}
    ].map(k=>`<div class="kpi"${(k.tip?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':'')+(k.tb!=null?' data-tip-bench="'+k.tb+'"':'')+(k.tc?' data-tip-context="'+esc(k.tc)+'"':'')}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');

    host.innerHTML = sd.data.map(x=>{
      const rows=R.dates.map(d=>{ const pd=x.perDay[d]; const cvrCls=pd.cvr===0?'b-gray':(pd.cvr<0.02?'b-red':'b-green');
        return `<tr><td>${d.slice(5)}</td><td class="num"><span class="badge ${cvrCls}">${(pd.cvr*100).toFixed(1)}%</span></td><td class="num">${pd.queries}</td><td class="num ${pd.newTerms>0?'up':''}">${pd.newTerms}</td><td class="num ${pd.lowQ>0?'up':''}">${pd.lowQ}</td><td class="num">${pd.queries?Math.round(pd.lowQ/pd.queries*100):0}%</td></tr>`; }).join('');
      const conc = x.conclusions.length? x.conclusions.map(c=>`<div class="alert warn" style="margin-bottom:6px">${esc(c)}</div>`).join('')
        : '<div class="alert ok" style="margin-bottom:6px">未检测到 CVR 骤降与搜索词结构变化（新词涌入/低质量占比）的明显关联</div>';
      return `<div class="card" style="margin-top:14px">
        <h2><span class="ic">🔗</span> ${esc(x.kw)} <span class="tag">${x.conv} 转化 · 新词↔CVR r=${(x.rNew==null||isNaN(x.rNew))?'—':x.rNew.toFixed(2)} · 低质量↔CVR r=${(x.rLow==null||isNaN(x.rLow))?'—':x.rLow.toFixed(2)}</span><span class="help-btn" data-help="shift" title="转化关联诊断帮助">?</span></h2>
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
  var kpis=[
    {l:'总消费', v:'¥'+fmt(t.cost), tip:'cost', tv:t.cost},
    {l:'总展示', v:fmt0(t.shows)},
    {l:'总点击', v:fmt0(t.clicks)},
    {l:'平均CTR', v:pct(t.ctr), tip:'ctr', tv:t.ctr, tb:R.tot.ctr, tc:'全账户周期均值'},
    {l:'总转化', v:fmt0(t.conv), tip:'conv', tv:t.conv},
    {l:'CPA（转化成本）', v:t.conv?('¥'+fmt(t.cpa)):'—', cls:cpaClass, d:'基准 ¥'+fmt(R.targetCPA), tip:'cpa', tv:t.conv?t.cpa:null, tb:R.targetCPA, tc:'目标CPA'}
  ];
  if(R.convValue>0 || R.rev>0){
    kpis.push({l:'转化价值（收入）', v:'¥'+fmt(R.rev), d:R.valueMode==='column'?'取自CSV转化金额列':'客单价¥'+fmt(R.convValue)+'×转化'});
    kpis.push({l:'ROAS（投产比）', v:fmt(R.roas,2), d:'收入÷消费', tip:'roas', tv:R.roas});
    kpis.push({l:'价值加权CPA', v:R.valueCPA?('¥'+fmt(R.valueCPA)):'—', d:'消费÷收入', tip:'cpa', tv:R.valueCPA, tb:R.targetCPA});
  }
  const ds=(R.coverage&&R.coverage.deviceScope)||'unknown';
  const dsVal = ds==='both'?'PC + 移动':ds==='pc'?'仅 PC':ds==='mobile'?'仅 移动':'未识别';
  kpis.push({l:'设备端', v:dsVal, d: ds==='unknown'?'建议文件名标 PC/移动':'离线自动识别'});
  let cmp=null;
  if(R.compare){
    cmp={cost:R.compare.cost, conv:R.compare.conv, clicks:R.compare.clicks, shows:R.compare.shows};
  }
  document.getElementById('ov-kpis').innerHTML = kpis.map((k,i)=>{
    let delta='';
    if(cmp){
      if(k.l==='总消费') delta=deltaHtml(t.cost,cmp.cost,'¥');
      if(k.l==='总展示') delta=deltaHtml(t.shows,cmp.shows,'');
      if(k.l==='总点击') delta=deltaHtml(t.clicks,cmp.clicks,'');
      if(k.l==='总转化') delta=deltaHtml(t.conv,cmp.conv,'',true);
    }
    return `<div class="kpi"${(k.tip?' data-tip-type="'+k.tip+'"':'')+(k.tv!=null?' data-tip-value="'+k.tv+'"':'')+(k.tb!=null?' data-tip-bench="'+k.tb+'"':'')+(k.tc?' data-tip-context="'+esc(k.tc)+'"':'')}><div class="lbl">${k.l}</div><div class="val ${k.cls||''}">${k.v}</div><div class="delta">${delta||k.d||''}</div></div>`;
  }).join('');

  const ph=document.getElementById('ov-period-hint');
  if(ph){
    if(R.compare) ph.innerHTML='';
    else if(R.compareSuppressed){
      const msg = R.compareSuppressed.reason==='unknown'
        ? '未能从文件名识别客户标识，已隐藏上期对比（避免跨客户误比）。'
        : '未找到同客户「'+esc(R.accountKey)+'」的上期数据，已隐藏上期环比对比。';
      ph.innerHTML='<span class="ph-ic">ℹ️</span> '+msg;
    } else ph.innerHTML='';
  }

  drawDailyChart();

  document.getElementById('ov-plans').innerHTML = tableHtml(
    ['推广计划','消费','点击','CTR','转化','CPA'],
    R.planStats.map(p=>[esc(p.plan),'¥'+fmt(p.cost),fmt0(p.clicks),dt('ctr',p.ctr,pct(p.ctr),R.tot.ctr,null,'账户均值'),fmt0(p.conv),p.conv?('¥'+fmt(p.cpa)):dt('conv',0,'<span class="badge b-red">无转化</span>',null,null,'高消费零转化P0预警')]),
    [0]);
  const obModes = new Set((R.matchMode&&R.matchMode.overBroad||[]).map(m=>m.mode));
  document.getElementById('ov-modes').innerHTML = tableHtml(
    ['触发模式','消费','点击','转化','匹配均分','CPA','零转化词占比','评估'],
    R.modeStats.map(m=>{
      var ev = m.avgScore>=60?dt('modeAssessment','优','<span class="badge b-green">优</span>',null,null,'匹配质量'):(m.avgScore>=40?dt('modeAssessment','中','<span class="badge b-amber">中</span>',null,null,'匹配质量'):dt('modeAssessment','流量跑偏风险','<span class="badge b-red">流量跑偏风险</span>',null,null,'匹配质量'));
      var ob = obModes.has(m.mode)?dt('modeAssessment','匹配过宽','<span class="badge b-red">匹配过宽</span>',null,null,'匹配范围过宽·需收紧'):'';
      return [esc(m.mode),'¥'+fmt(m.cost),fmt0(m.clicks),fmt0(m.conv),dt('matchScore',Math.round(m.avgScore),Math.round(m.avgScore)+'分'), m.cpa!=null?dt('cpa',m.cpa,'¥'+fmt(m.cpa,1),R.targetCPA):'—', dt('zeroConvCostShare',m.zeroConvCostShare,(m.zeroConvCostShare*100).toFixed(0)+'%'), ev+(ob?' '+ob:'')];
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
  } else { cc.style.display='block'; document.getElementById('ov-compare').innerHTML = '<div class="empty">'+(R.compareSuppressed&&R.compareSuppressed.reason!=='unknown'?'未找到同客户「'+esc(R.accountKey)+'」的上期数据，无法进行同期对比。':'无上期数据，无法进行同期对比。')+'</div>'; }

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

/* ---------- 分日趋势图（原生canvas，高清自适应 · 可拖动/滚轮缩放） ---------- */
let chartDailyState = null;
let dailyChartEventsBound = false;

function bindDailyChartEvents(cv){
  if(dailyChartEventsBound) return;
  dailyChartEventsBound = true;
  const onMove = e=>{
    if(!chartDailyState||!chartDailyState.isDragging) return;
    const clientX = e.touches?e.touches[0].clientX:e.clientX;
    const dx = clientX - chartDailyState.dragStartX;
    const wrap = cv.parentElement;
    const cssW = (wrap?wrap.clientWidth:0)||cv.clientWidth||900;
    const iw = (cssW-120)/chartDailyState.count;
    const dOffset = Math.round(-dx/Math.max(iw,20));
    chartDailyState.offset = Math.max(0, Math.min(chartDailyState.dragStartOffset+dOffset, R.daily.length-chartDailyState.count));
    drawDailyChart();
  };
  const onUp = ()=>{
    if(!chartDailyState) return;
    chartDailyState.isDragging = false;
    cv.style.cursor = 'grab';
  };
  cv.addEventListener('mousedown', e=>{
    chartDailyState.isDragging = true;
    chartDailyState.dragStartX = e.clientX;
    chartDailyState.dragStartOffset = chartDailyState.offset;
    cv.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  cv.addEventListener('touchstart', e=>{
    if(e.touches.length===1){
      chartDailyState.isDragging = true;
      chartDailyState.dragStartX = e.touches[0].clientX;
      chartDailyState.dragStartOffset = chartDailyState.offset;
    }
  }, {passive:true});
  cv.addEventListener('touchmove', e=>{
    if(!chartDailyState||!chartDailyState.isDragging||e.touches.length!==1) return;
    onMove(e);
    e.preventDefault();
  }, {passive:false});
  cv.addEventListener('touchend', onUp);
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const st = chartDailyState;
    const oldCount = st.count;
    const delta = e.deltaY>0 ? 2 : -2;
    const newCount = Math.max(5, Math.min(R.daily.length, oldCount+delta));
    if(newCount===oldCount) return;
    const center = st.offset + oldCount/2;
    st.count = newCount;
    st.offset = Math.max(0, Math.min(R.daily.length-newCount, Math.round(center-newCount/2)));
    drawDailyChart();
  }, {passive:false});
}

function drawDailyChart(){
  const cv=document.getElementById('chartDaily'); if(!cv) return;
  const d=R.daily; if(!d.length)return;

  /* 初始化/同步视口状态 */
  if(!chartDailyState){
    chartDailyState = { offset:0, count:Math.min(d.length,20), isDragging:false, dragStartX:0, dragStartOffset:0 };
  }
  const st = chartDailyState;
  st.count = Math.max(5, Math.min(st.count, d.length));
  st.offset = Math.max(0, Math.min(st.offset, d.length-st.count));

  const {ctx,W,H}=prepCanvas(cv, 320);
  ctx.clearRect(0,0,W,H);

  const padL=60,padR=60,padT=28,padB=44;
  const iw=(W-padL-padR)/st.count;

  const visible = d.slice(st.offset, st.offset+st.count);
  const maxCost=Math.max(...visible.map(x=>x.cost),1);
  const maxConv=Math.max(...visible.map(x=>x.conv),1);

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
  /* 标签密度：当可视点过多时智能跳过，避免重叠 */
  const labelStep = Math.max(1, Math.ceil(st.count/20));
  /* 消费柱 */
  const convLabelBoxes=[]; // 记录已绘转化标签占位，用于碰撞避让
  function boxOverlap(x,y,w,h){ for(const b of convLabelBoxes){ if(x<b.x+b.w && x+w>b.x && y<b.y+b.h && y+h>b.y) return true; } return false; }
  ctx.font='12px "Microsoft YaHei"'; ctx.textAlign='center';
  visible.forEach((x,i)=>{
    const bx=padL+i*iw+iw*0.18, bw=iw*0.4;
    const bh=(H-padT-padB)*x.cost/maxCost;
    ctx.fillStyle = x.conv===0&&x.cost>=SET.zeroConvCost ? C.costZero : C.cost;
    ctx.fillRect(bx,H-padB-bh,bw,bh);
    ctx.fillStyle=C.label;
    if(i%labelStep===0){
      ctx.fillText(x.date.slice(5), padL+i*iw+iw/2, H-padB+16);
    }
    /* 柱顶金额：过密或标签宽于柱+间距时隐藏，避免横向重叠 */
    const costLabel='¥'+fmt0(x.cost);
    const costLW=ctx.measureText(costLabel).width;
    if(iw>=42 && costLW <= iw*0.92){
      ctx.fillText(costLabel, bx+bw/2, H-padB-bh-6);
    }
  });
  /* 转化线（预计算坐标，供后续避让判断） */
  const pt=visible.map((x,i)=>({px:padL+i*iw+iw/2, py:H-padB-(H-padT-padB)*x.conv/maxConv, bh:(H-padT-padB)*x.cost/maxCost}));
  ctx.strokeStyle=C.conv; ctx.lineWidth=2; ctx.beginPath();
  pt.forEach((p,i)=> i?ctx.lineTo(p.px,p.py):ctx.moveTo(p.px,p.py));
  ctx.stroke();
  ctx.font='12px "Microsoft YaHei"';
  pt.forEach((p,i)=>{
    const x=visible[i];
    ctx.fillStyle=x.conv===0?C.convZero:C.conv;
    ctx.beginPath();ctx.arc(p.px,p.py,4,0,7);ctx.fill();
    /* 转化标签避让：默认数据点上方，与柱顶金额距离<14px 时改放数据点下方；下方紧贴 X 轴则改放柱顶更上方 */
    const barLabelY=H-padB-p.bh-6;
    let labelY=p.py-10;
    if(Math.abs(labelY-barLabelY)<14){
      if(p.py+18 < H-padB-4) labelY=p.py+18;
      else labelY=barLabelY-14;
    }
    const txt=x.conv+'转化';
    const tw=ctx.measureText(txt).width;
    const th=13;
    const lx=p.px-tw/2, ly=labelY-th;
    /* 与已绘标签碰撞则跳过，避免连续等值标签堆叠 */
    if(!boxOverlap(lx-2,ly-2,tw+4,th+4)){
      ctx.fillStyle=C.label; ctx.fillText(txt, p.px, labelY);
      convLabelBoxes.push({x:lx-2,y:ly-2,w:tw+4,h:th+4});
    }
  });
  /* 图例：右上角自右向左排列，不与左轴标签抢占空间 */
  ctx.font='12px "Microsoft YaHei"';
  const legendItems=[
    {t:'消费（左轴）', box:C.cost, line:null},
    {t:'转化数（右轴）', box:null, line:C.conv},
    {t:'零转化高消费日', box:C.costZero, line:null}
  ];
  let lx=W-padR;
  for(let i=legendItems.length-1;i>=0;i--){
    const it=legendItems[i];
    const tw=ctx.measureText(it.t).width;
    const textX=lx;
    const boxX=textX-tw-18;
    if(it.box){ ctx.fillStyle=it.box; ctx.fillRect(boxX,8,14,10); }
    if(it.line){ ctx.strokeStyle=it.line; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(boxX,13); ctx.lineTo(boxX+14,13); ctx.stroke(); }
    ctx.fillStyle=C.label; ctx.textAlign='right'; ctx.fillText(it.t, textX, 17);
    lx=boxX-8;
  }

  /* 导航提示（当数据多于可视窗口时） */
  if(d.length > st.count){
    ctx.fillStyle = tv('--chart-label');
    ctx.font = '11px "Microsoft YaHei"';
    ctx.textAlign = 'left';
    const hint = `↔ 拖动平移  ·  滚轮缩放  ·  ${visible[0].date.slice(5)} 至 ${visible[visible.length-1].date.slice(5)}  (${d.length}天中${st.count}天)`;
    ctx.fillText(hint, padL, H-6);
  }

  /* 绑定交互事件 */
  bindDailyChartEvents(cv);
  /* 光标提示 */
  cv.style.cursor = st.isDragging ? 'grabbing' : 'grab';
}

/* ---------- ② 四象限 ---------- */
function renderQuad(){
  const th=document.getElementById('quad-thresh');
  if(R.noSearch){
    if(th) th.textContent='未提供搜索词报告，关键词四象限不可用';
    const g=document.getElementById('quadGrid'); if(g) g.innerHTML='<div class="empty">请上传搜索词报告以启用关键词四象限分析</div>';
    const kt=document.getElementById('kwTable'); if(kt) kt.innerHTML='<div class="empty">未提供搜索词报告</div>';
    return;
  }
  if(th) th.textContent='高消费分界：¥'+fmt(R.highCost)+'（目标CPA ¥'+fmt(R.targetCPA)+' × 系数'+SET.costFactor+'）';
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
      <td>${dt('quad',k.quad,'<span class="badge '+qcls[k.quad]+'">'+k.quad+'</span>')}</td>
      <td class="num">¥${fmt(k.cost)}</td><td class="num">${fmt0(k.shows)}</td><td class="num">${fmt0(k.clicks)}</td>
      <td class="num">${dt('ctr',k.ctr,pct(k.ctr),R.tot.ctr)}</td><td class="num">¥${fmt(k.cpc)}</td>
      <td class="num">${dt('conv',k.conv,k.conv?'<b>'+k.conv+'</b>':'0')}</td><td class="num">${k.cpa?dt('cpa',k.cpa,'¥'+fmt(k.cpa),R.targetCPA):'—'}</td>
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
  const corePct=pct(R.tot.conv?core.reduce((s,k)=>s+k.conv,0)/R.tot.conv:0,0);
  alerts.push(`<div class="alert info"><span>💡</span><div><b>二八法则：</b>本周期 <b>${R.coreKws.length}</b> 个核心词贡献了 <b>${corePct}</b> 的转化——它们的排名、预算、创意必须优先保障。<div class="kw-list">${R.coreKws.map(k=>`<span class="kw-chip">${esc(k)}</span>`).join('')}</div></div></div>`);
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
      `<td>${dt('convStatus',k.status,'<span class="badge '+stCls+'">'+k.status+'</span>')}</td></tr>`;
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
  } else { cc.style.display='block'; document.getElementById('convCompare').innerHTML = '<div class="empty">'+(R.compareSuppressed&&R.compareSuppressed.reason!=='unknown'?'未找到同客户「'+esc(R.accountKey)+'」的上期数据，无法进行转化词环比对比。':'无上期数据，无法进行转化词环比对比。')+'</div>'; }
}

/* ---------- 分日转化关键词 · 日度变化追踪（v9） ---------- */
function sparkline(series, w, h){
  if(!series || !series.length) return '';
  const max=Math.max.apply(null, series.concat([1])), n=series.length;
  const pts=series.map((v,i)=> `${(i/(n-1)*w).toFixed(1)},${(h - v/max*h).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#4f8cff" stroke-width="1.5"/></svg>`;
}
function renderConvDaily(){
  const el=document.getElementById('convDailyCard');
  if(!el) return;
  const cd=R.convDaily;
  if(!cd || !cd.has){ el.style.display='none'; return; }
  el.style.display='block';
  document.getElementById('convDaily-hint').textContent=`本期 ${cd.dates.length} 天，日均 ${cd.avgDailyConvKw.toFixed(1)} 个转化关键词；累计逐日新增 ${cd.totalNew} 个、流失 ${cd.totalLost} 个。下表为每天相对前一天的转化词 churn（新增/流失/上升/下降）。`;
  document.getElementById('convDaily-kpis').innerHTML=[
    {l:'日均转化词数', v:cd.avgDailyConvKw.toFixed(1)+' 个', d:'本期日度均值'},
    {l:'累计新增转化词', v:'+'+cd.totalNew+' 个', d:'逐日相对前日新增'},
    {l:'累计流失转化词', v:'-'+cd.totalLost+' 个', d:'逐日相对前日流失'},
    {l:'Top3 集中度(后半)', v:(cd.lastShare*100).toFixed(0)+'%', d:`前半 ${(cd.firstShare*100).toFixed(0)}% → 后半 ${(cd.lastShare*100).toFixed(0)}% · ${cd.concTrend}`, tip:'top3Share', tv:cd.lastShare}
  ].map(k=>`<div class="kpi"${k.tip?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':''}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');
  const head='<tr><th>日期</th><th class="num">转化词数</th><th class="num">Top3集中度</th><th class="num">核心词在场</th><th class="num">新增</th><th class="num">流失</th><th class="num">上升</th><th class="num">下降</th></tr>';
  const rows=cd.daily.map((d,i)=>{
    const c = i>0? cd.churn[i-1] : null;
    const gained=c?c.gained.length:0, lost=c?c.lost.length:0, rising=c?c.rising.length:0, falling=c?c.falling.length:0;
    return `<tr><td>${d.date.slice(5)}</td><td class="num">${d.count}</td><td class="num">${(d.top3Share*100).toFixed(0)}%</td><td class="num">${d.coreCount}/${d.coreTotal}</td>`+
      `<td class="num ${gained?'up':''}">${gained?('+'+gained):'—'}</td>`+
      `<td class="num ${lost?'down':''}">${lost?('-'+lost):'—'}</td>`+
      `<td class="num ${rising?'up':''}">${rising||'—'}</td>`+
      `<td class="num ${falling?'down':''}">${falling||'—'}</td></tr>`;
  }).join('');
  document.getElementById('convDaily-churn').innerHTML='<table>'+head+rows+'</table>';

  // —— v10：生命周期时间线 ——
  const lc=cd.lifecycle||[];
  const lcShow=lc.slice().sort((a,b)=> ((R.coreKws.includes(b.kw)?1:0)-(R.coreKws.includes(a.kw)?1:0)) || b.totalConv-a.totalConv).slice(0,20);
  const lcHead='<tr><th>关键词</th><th>状态</th><th>首发</th><th>峰值日(转化)</th><th>末次转化</th><th>流失日</th><th>生命周期</th><th>趋势</th></tr>';
  const lcRows=lcShow.map(l=>{
    var st=l.active?dt('convStatus','稳定','<span class="badge b-green">在产</span>'):dt('convStatus','衰减','<span class="badge b-red">已流失</span>');
    var fade=l.fadePct>=0.6?dt('convStatus','衰减','<span class="badge b-red">断流</span>'):l.fadePct>=0.3?dt('convStatus','衰减','<span class="badge b-amber">衰减</span>'):'<span class="badge b-blue">平稳</span>';
    return `<tr><td>${esc(l.kw)}</td><td>${st}</td><td>${l.firstDate.slice(5)}</td><td>${l.peakDate.slice(5)} (${l.peakConv})</td>`+
      `<td>${l.lastConvDate.slice(5)}</td><td>${l.lossDate?l.lossDate.slice(5):'—'}</td><td>${l.lifespanDays}天</td>`+
      `<td>${sparkline(l.series,90,22)}</td></tr>`;
  }).join('');
  document.getElementById('convDaily-life').innerHTML = lcShow.length? '<table>'+lcHead+lcRows+'</table>'
    : '<div class="empty">无生命周期数据</div>';

  // —— v10：流失核心词 × 共变引擎联动 ——
  const link=cd.lostCoreLink||[];
  const linkAl=[];
  if(link.length){
    linkAl.push(`<div class="alert info">🔗 <b>流失核心词 × 共变引擎联动（事件研究）</b>：核心词停止转化的当日，其 排名 / 关键词 CTR / 无效点击过滤比 是否同步劣化。结论为<b>相关性假设、非因果定论</b>，需结合业务排查根因（排名掉了？创意弱了？无效流量吞噬？）。${cd.hasRankData?'':'（注：未导入排名文件，排名维度未参与本次联动）'}</div>`);
    link.forEach(x=>{
      const sigs=x.signals.map(s=>s.txt).join('；');
      linkAl.push(`<div class="alert warn">⚠️ <b>${esc(x.kw)}</b> 于 ${x.lastConvDate.slice(5)} 后停止转化（生命周期 ${x.lifecycleDays} 天、累计 ${x.totalConv} 转化），流失当日同步观测到：${sigs}。建议：核对当日 排名/创意/无效点击，定位断流根因。</div>`);
    });
  } else if(cd.lostStillSpending.length || cd.flickerCore.length){
    linkAl.push(`<div class="alert info">ℹ️ 流失核心词未检出「排名 / CTR / 无效点击」在流失当日同步劣化（或对应维度未导入）；断流更可能源于 预算分配 / 匹配方式 / 落地页 等共变引擎未覆盖的因素，建议结合 CPA 归因与操作清单排查。</div>`);
  }
  document.getElementById('convDaily-link').innerHTML = linkAl.join('');
  const al=[];
  if(cd.lostStillSpending.length){
    al.push(`<div class="alert danger">🚨 <b>流失核心词仍在烧钱（${cd.lostStillSpending.length} 个）</b>：曾贡献核心转化、近 3 日 0 转化却仍在消费，是预算泄漏点：${cd.lostStillSpending.slice(0,10).map(c=>`${esc(c.kw)}(近3日¥${fmt(c.recentCost)}/${c.daysSinceConv}日无转化)`).join('、')}。动作：检查排名/预算/创意是否被挤压，必要时暂停或重审。</div>`);
  }
  if(cd.flickerCore.length){
    al.push(`<div class="alert warn">⚠️ <b>${cd.flickerCore.length} 个核心词转化间断</b>（不足一半日期产出转化，稳定性差）：${cd.flickerCore.slice(0,10).map(c=>`${esc(c.kw)}(${c.presentDays}/${cd.dates.length}日)`).join('、')}。动作：保障预算与排名稳定，避免转化时有时无。</div>`);
  }
  if(cd.concTrend.indexOf('风险')>=0){
    al.push(`<div class="alert warn">⚠️ <b>转化集中度上升</b>：Top3 词转化占比由 ${(cd.firstShare*100).toFixed(0)}% 升至 ${(cd.lastShare*100).toFixed(0)}%，过度依赖少数词，一旦核心词波动整体转化将剧烈震荡。动作：培育中长尾转化词分散风险。</div>`);
  } else if(cd.concTrend.indexOf('改善')>=0){
    al.push(`<div class="alert ok">✅ 转化集中度下降（Top3 占比 ${(cd.firstShare*100).toFixed(0)}%→${(cd.lastShare*100).toFixed(0)}%），转化词结构更均衡，抗风险能力提升。</div>`);
  } else if(cd.lastShare>0.6){
    al.push(`<div class="alert info">ℹ️ <b>转化集中度持续偏高</b>：Top3 词转化占比稳定在 ${(cd.lastShare*100).toFixed(0)}%（前半 ${(cd.firstShare*100).toFixed(0)}%），虽未继续上升但整体转化仍高度依赖少数词。动作：持续培育中长尾转化词，避免单点波动拖累全盘。</div>`);
  }
  document.getElementById('convDaily-alerts').innerHTML=al.join('');
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
    {l:'低匹配流量占比',v:pct(R.tot.cost?loCost/R.tot.cost:0,1),d:'建议压降至10%以内',tip:'zeroConvCostShare',tv:R.tot.cost?loCost/R.tot.cost:0}
  ].map(k=>`<div class="kpi"${k.tip?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':''}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');

  document.getElementById('negTable').innerHTML = R.negList.length? tableHtml(
    ['搜索词','触发关键词','类型','优先级','匹配分','消费','点击'],
    R.negList.map(q=>[esc(q.query),esc(q.kw),
      dt('negType',q.negType,'<span class="badge '+(q.negType==='短语否定'?'b-amber':'b-blue')+'">'+q.negType+'</span>'),
      dt('severity',q.severity,'<span class="badge '+(q.severity==='P0'?'b-red':'b-amber')+'">'+q.severity+'</span>'),
      dt('matchScore',q.score,q.score+'分'),
      '¥'+fmt(q.cost),fmt0(q.clicks)]),[0,1])
    : '<div class="empty">暂无需要否定的搜索词 ✅</div>';

  document.getElementById('addTable').innerHTML = R.addList.length? tableHtml(
    ['搜索词','经由关键词','转化','CTR','理由'],
    R.addList.map(q=>[esc(q.query),esc(q.kw),q.conv||'—',q.shows?dt('ctr',q.clicks/q.shows,pct(q.clicks/q.shows),R.tot.ctr,null,q.query):'—',
      q.conv>0?'<span class="badge b-green">已产生转化，提精确锁量</span>':'<span class="badge b-blue">高匹配高CTR，值得单独培育</span>']),[0,1])
    : '<div class="empty">暂无建议加词</div>';

  const mf=document.getElementById('qModeFilter');
  /* Bug P0-5 修复：增加 mf null 检查 */
  if(mf && mf.options.length<=1) R.modeStats.forEach(m=>{ const o=document.createElement('option');o.value=m.mode;o.textContent=m.mode;mf.appendChild(o); });
  window._queryPage=1; renderQueryTable();
}
function renderQueryTable(){
  const s=(document.getElementById('qSearch').value||'').toLowerCase();
  /* Bug P0-5 修复：增加 DOM 元素 null 检查 */
  var mfEl=document.getElementById('qModeFilter'), lfEl=document.getElementById('qMatchFilter');
  const mf=mfEl?mfEl.value:'', lf=lfEl?lfEl.value:'';
  const full=R.queries.filter(q=>(!s||q.query.toLowerCase().includes(s)||q.kw.toLowerCase().includes(s))&&(!mf||q.mode===mf)&&(!lf||q.level===lf));
  const PAGE=200, total=full.length; let page=window._queryPage||1;
  const pages=Math.ceil(total/PAGE);
  const list=full.slice(0,page*PAGE);
  const lvCls={'高':'b-green','中':'b-amber','低':'b-red'};
  document.getElementById('queryTable').innerHTML=tableHtml(
    ['搜索词','触发关键词','触发模式','匹配度','展示','点击','消费','转化'],
    list.map(q=>[esc(q.query),esc(q.kw),esc(q.mode),dt('matchScore',q.score,`<span class="badge ${lvCls[q.level]}">${q.level} ${q.score}</span>`),fmt0(q.shows),fmt0(q.clicks),'¥'+fmt(q.cost),q.conv?('<b>'+q.conv+'</b>'):'0']),[0,1,2,3])
    +(list.length<total?'<div class="load-more-row" onclick="window._queryPage='+(page+1)+';renderQueryTable();">📋 加载更多（已显示 '+list.length+'/'+total+' 条，点击展开下一页）</div>'
      :(total>PAGE?'<div class="total-count">已显示全部 '+total+' 条搜索词</div>':''));
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
    {l:'基础创意整体CTR',v:pct(actr),d:fmt0(all.shows)+' 次展示',tip:'ctr',tv:actr},
    {l:'高级样式整体CTR',v:advAll.shows?pct(advCtr):'—',d:fmt0(advAll.shows)+' 次展示',tip:'ctr',tv:advCtr},
    {l:'需优化创意',v:R.weakCre.length+' 条',d:'CTR低于同组均值'+SET.ctrLowPct+'%'},
    {l:'创意标题数',v:[...new Set(RAW.basic.map(r=>r.title))].length+' 个',d:'覆盖 '+R.creGroups.length+' 个推广组'}
  ].map(k=>`<div class="kpi"${k.tip?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':''}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');

  document.getElementById('creTable').innerHTML='<table><tr><th>推广组 / 创意标题</th><th class="num">展示</th><th class="num">点击</th><th class="num">CTR</th><th class="num">消费</th><th class="num">vs组均值</th></tr>'+
    R.creGroups.map(g=>`<tr style="background:#f8fafc"><td><b>${esc(g.gkey)}</b></td><td class="num">${fmt0(g.shows)}</td><td class="num">${fmt0(g.clicks)}</td><td class="num"><b>${pct(g.gctr)}</b></td><td class="num">¥${fmt(g.cost)}</td><td class="num">组均值</td></tr>`+
      g.titles.map(t=>{
        const ratio=g.gctr? t.ctr/g.gctr:0;
        const cls=ratio>=1.2?'b-green':(ratio<SET.ctrLowPct/100&&t.shows>=50?'b-red':'b-gray');
        return `<tr><td style="padding-left:26px">${esc(t.title)}</td><td class="num">${fmt0(t.shows)}</td><td class="num">${fmt0(t.clicks)}</td><td class="num">${dt('ctr',t.ctr,pct(t.ctr),g.gctr,null,'同组均值 '+pct(g.gctr))}</td><td class="num">¥${fmt(t.cost)}</td><td class="num"><span class="badge ${cls}">${g.gctr?Math.round(ratio*100)+'%':'—'}</span></td></tr>`;
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
      return [esc(x.gkey),dt('ctr',x.adv.ctr,pct(x.adv.ctr),b?b.ctr:null,null,'高级样式CTR'),b?dt('ctr',b.ctr,pct(b.ctr),null,null,'基础创意CTR'):'—','¥'+fmt(x.adv.cpc),b?('¥'+fmt(b.cpc)):'—',verdict];
    }),[0,5]) : '<div class="empty">未导入高级创意报告</div>';
}

/* ---------- ⑥ 地域 ---------- */
function renderGeo(){
  if(!R.geo.length){ document.getElementById('geoTable').innerHTML='<div class="empty">未导入地域分析报告</div>'; return; }
  drawGeoChart();
  const dCls={'扩量':'b-green','保持':'b-blue','降价':'b-amber','收缩':'b-red','观察':'b-gray'};
  document.getElementById('geoTable').innerHTML=tableHtml(
    ['省份','消费','占比','展示','点击','CTR','CPC','诊断','建议'],
    R.geo.map(g=>[esc(g.region),'¥'+fmt(g.cost),pct(R.geoTot.cost?g.cost/R.geoTot.cost:0,1),fmt0(g.shows),fmt0(g.clicks),dt('ctr',g.ctr,pct(g.ctr),R.geoTot.ctr||R.tot.ctr,null,'地域均值'),'¥'+fmt(g.cpc),dt('geoDiag',g.diag,'<span class="badge '+dCls[g.diag]+'">'+g.diag+'</span>'),esc(g.advice)]),[0,7,8]);
}
function drawGeoChart(){
  const cv=document.getElementById('chartGeo'); if(!cv) return;
  if(!R||!R.geo||!R.geo.length) return;
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
  if(base===null){ alerts.push('<div class="alert warn">⚠️ 本期有转化日不足，无法建立 CPA 基准（需至少 1 个有转化的日期）。</div>'); }
  else if(base===0){ alerts.push('<div class="alert warn">⚠️ 基准 CPA 为 ¥0（存在零消费却产生转化的日期，转化成本基准失真，请核对「总费用」列是否缺失/为 0）。</div>'); }
  else if(!c.highDays.length){ alerts.push('<div class="alert ok">✅ 各日转化成本均不超过基准的 '+c.thresh+'%，未见显著高 CPA 异动日。</div>'); }
  else {
    c.highDays.forEach(hd=>{ const f=c.factors.find(x=>x.date===hd); if(!f) return; alerts.push(`<div class="alert danger">🚨 <b>${hd} 高转化成本日</b>：CPA ¥${fmt(f.cpa,1)}，较基准（¥${fmt(base,1)}）高 ${pct(f.dev,0)}，预估超额成本 ¥${fmt(f.excess,1)}。</div>`); });
  }
  document.getElementById('cpa-alerts').innerHTML=alerts.join('');

  document.getElementById('cpa-kpis').innerHTML=[
    {l:'基准 CPA', v:base===null?'—':('¥'+fmt(base,1)), d:'有转化日度CPA中位数', tip:'cpa', tv:base, tb:R.targetCPA},
    {l:'基准日', v:c.baselineDays.length+' 天', d:c.baselineDays.map(d=>d.slice(5)).join('、')||'—'},
    {l:'高 CPA 异动日', v:c.highDays.length+' 天', d:c.highDays.map(d=>d.slice(5)).join('、')||'无'},
    {l:'高日预估超额成本', v:'¥'+fmt(c.wastedCost,0), d:'相对基准CPA多花的钱'}
  ].map(k=>`<div class="kpi"${(k.tip&&k.tv!=null?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':'')+(k.tb!=null?' data-tip-bench="'+k.tb+'"':'')}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('');  /* v15：tv 为 null（无转化日）时不得输出 data-tip-value="null"（字符串"null"会让浮层解读错误），与 ov-kpis 守卫一致 */

  drawCpaChart();

  /* 异动归因卡 */
  if(c.highDays.length){
    document.getElementById('cpa-attr').innerHTML = c.highDays.map(hd=>{
      const f=c.factors.find(x=>x.date===hd);
      if(!f) return '';   /* v15：与上方告警循环(886)守卫一致——防御 factors 缺条目时 f.cpa 抛错致整面板崩溃 */
      const culps=(c.kwCulprits[hd]||[]).slice(0,6);
      const news=c.newTerms.filter(t=>t.highDays.includes(hd));
      const spk=c.spikedTerms.filter(t=>t.date===hd);
      const cre=c.creShift.filter(x=>x.shifts.some(s=>s.date===hd));
      const adv=c.advShift.filter(x=>x.shifts.some(s=>s.date===hd));
      return `<div class="card" style="margin-top:14px">
        <h2><span class="ic">🔎</span> 异动归因 · ${hd} <span class="tag">CPA ¥${fmt(f.cpa,1)} / 基准 ¥${fmt(base,1)} / 高出 ${pct(f.dev,0)}</span><span class="help-btn" data-help="cpa-main" title="CPA归因帮助">?</span></h2>
        <div class="alert info" style="margin-bottom:10px">${f.text}</div>
        ${culps.length?`<div class="section-hint">主因关键词（按超额成本排序）</div>`+tableHtml(['关键词','当日消费','当日转化','当日CPA','基准CPA','超额成本'],[...culps].map(k=>[esc(k.kw),'¥'+fmt(k.cost),k.conv||0,k.cpa?dt('cpa',k.cpa,'¥'+fmt(k.cpa,1),k.baselineCpa,k.kw+'当日CPA'):'<span class="badge b-red">零转化</span>','¥'+fmt(k.baselineCpa,1),'¥'+fmt(k.contribution,1)]),[0]):''}
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
      return `<tr><td>${esc(k.kw)}</td><td class="num">¥${fmt(k.cost)}</td><td class="num">${k.baselineCpa!=null?('¥'+fmt(k.baselineCpa,1)):'—'}</td>`+
      R.dates.map(d=>{ const o=k.perDay[d]; if(!o||o.cost===0) return '<td></td>'; return `<td style="text-align:center">${dt('cpa',o.cpa,cpaCell(o, base),base,k.kw+' '+d.slice(5))}</td>`; }).join('')+
      '</tr>';
    }).join('')+'</table>' : '<div class="empty">无数据</div>';

  /* 搜索词新增/异动 */
  document.getElementById('cpa-newTerms').innerHTML = (c.newTerms.length||c.spikedTerms.length)?
    (c.newTerms.length?`<div class="section-hint">新增无转化搜索词（仅在异动日出现、基准日无、零转化）→ 优先否词围栏</div>`+tableHtml(['搜索词','触发关键词','触发模式','消耗','出现在异动日'],[...c.newTerms].map(t=>[esc(t.query),esc(t.kw),esc(t.mode),'¥'+fmt(t.cost),t.highDays.map(d=>d.slice(5)).join('、')]),[0,1,2]):'')+
    (c.spikedTerms.length?`<div class="section-hint" style="margin-top:10px">CPA 较基准骤升的搜索词</div>`+tableHtml(['搜索词','触发关键词','基准CPA','高异动日CPA','日期'],[...c.spikedTerms].map(t=>[esc(t.query),esc(t.kw),'¥'+fmt(t.baseCpa,1),dt('cpa',t.highCpa,'¥'+fmt(t.highCpa,1),t.baseCpa,t.query+' '+t.date.slice(5)),t.date.slice(5)]),[0,1]):'')
    : '<div class="empty">未发现明显的搜索词新增/骤变 ✅</div>';

  /* 创意 / 高级样式 代理归因（CTR 波动） */
  document.getElementById('cpa-creShift').innerHTML = c.creShift.length? tableHtml(
    ['创意标题','基准CTR','异动日','当日CTR','CTR变化','当日CPC'],
    c.creShift.flatMap(x=>x.shifts.map(s=>([esc(x.title),pct(x.baseCtr),s.date.slice(5),dt('ctr',s.ctr,pct(s.ctr),x.baseCtr,x.title),(s.deltaPct*100).toFixed(0)+'%',s.cpc?('¥'+fmt(s.cpc,1)):'—']))),[0])
    : '<div class="empty">创意 CTR 在各日波动均在 ±15% 内，未见明显下滑 ✅</div>';
  document.getElementById('cpa-advShift').innerHTML = c.advShift.length? tableHtml(
    ['推广组','基准CTR','异动日','当日CTR','CTR变化','当日CPC'],
    c.advShift.flatMap(x=>x.shifts.map(s=>([esc(x.title),pct(x.baseCtr),s.date.slice(5),dt('ctr',s.ctr,pct(s.ctr),x.baseCtr,x.title),(s.deltaPct*100).toFixed(0)+'%',s.cpc?('¥'+fmt(s.cpc,1)):'—']))),[0])
    : '<div class="empty">高级样式（凤舞）CTR 在各日波动均在 ±15% 内，未见明显下滑 ✅</div>';
}
function cpaCell(o, base){
  if(o.conv===0) return `<span class="heatcell" style="background:${tv('--heat-0')};color:${tv('--heat-0-t')}">零转化</span>`;
  const ratio = base>0? o.cpa/base : 1;
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
  document.getElementById('actionList').innerHTML = (R.actions||[]).length? R.actions.map(a=>
    `<div class="alert ${a.p===0?'danger':(a.p===1?'warn':'info')}"><span class="prio p${a.p}">P${a.p}</span><div><b>[${a.mod}]</b> ${a.act}</div></div>`).join('')
    : '<div class="empty">无操作建议</div>';
}
function copyActions(){
  copyText(R.actions.map(a=>`[P${a.p}][${a.mod}] ${a.act}`).join('\n'),'操作清单已复制（'+R.actions.length+'条）');
}

/* ---------- ⑩ 维度专项诊断（v6） ---------- */
function renderDiag(){
  renderRankDiag(); renderHourDiag(); renderInvalidDiag(); renderOcpcDiag();
}
function renderRankDiag(){
  const card=document.getElementById('diagRankCard'), el=document.getElementById('diagRank');
  const D=R.rank;
  if(!card||!el) return;
  if(!D||!D.has){ card.style.display='none'; return; }
  card.style.display='block';
  const note=document.getElementById('diag-rank-note');
  if(note) note.textContent='账户周期平均CTR '+pct(D.accountCtr)+'（判定的"CTR偏低"基准为其60%）。以下按转化降序列出高转化词的分设备排名三分支判定'+(D.devices&&D.devices.length>1?'（已接入 '+D.devices.join('/')+' 多设备排名，按 计划||组||词 同键合并）':'')+'。排名支持分日文件按展示量加权平均；\u201c转化\u201d为深层(成交/线索)，\u201c浅层转化\u201d来自排名文件自带浅层转化数(咨询/表单)，二者构成 360 双层转化链路。';
  const vcls={'排名掉主导':'b-red','创意/标题差主导':'b-amber','意图/匹配/落地页':'b-purple','混合/波动型':'b-gray'};
  /* 动态分设备排序列：左侧/计算机/移动 按数据实际出现的设备生成 */
  const devCols=[];
  if(D.devices&&D.devices.includes('左侧')) devCols.push({k:'左侧',label:'PC左侧排名'});
  if(D.devices&&D.devices.includes('计算机')) devCols.push({k:'计算机',label:'PC计算机排名'});
  if(D.devices&&D.devices.includes('移动')) devCols.push({k:'移动',label:'移动排名'});
  if(D.devices&&D.devices.includes('移动端')) devCols.push({k:'移动端',label:'移动排名'});
  /* 列索引（devCols 长度为 n）：0 关键词 / 1..n 各设备排名 / n+1 周期CTR / n+2 深层 / n+3 浅层 / n+4 判定(主设备) / n+5 跨设备差异 / n+6 权重 / n+7 建议 */
  const verdictCol=devCols.length+4;
  const cols=['转化关键词', ...devCols.map(c=>c.label), '周期CTR','深层转化','浅层转化','判定(主设备)','跨设备差异','权重','建议'];
  const rows=D.diag.map(d=>{
    const cells=[esc(d.kw)];
    devCols.forEach(c=>{ cells.push(d.ranks&&d.ranks[c.k]!=null?dt('rank',d.ranks[c.k],d.ranks[c.k].toFixed(2),null,c.label+'排名'):'—'); });
    cells.push(dt('ctr',d.ctr,pct(d.ctr),D.accountCtr,d.kw), d.conv||0, d.shallow||0,
      d.primary?`<span class="badge ${vcls[d.primary.verdict]||'b-gray'}">${esc(d.primary.verdict)}</span>`:'—',
      d.cross?`<span class="badge b-amber">${esc(d.cross)}</span>`:'—',
      d.primary?d.primary.weight:'—', esc(d.primary?d.primary.note:''));
    return cells;
  });
  el.innerHTML = D.diag.length? tableHtml(cols, rows, [0, verdictCol, devCols.length+5, devCols.length+7]) : '<div class="empty">无高转化词命中排名数据</div>';
}
function renderHourDiag(){
  const card=document.getElementById('diagHourCard'), el=document.getElementById('diagHour');
  const D=R.hour;
  if(!card||!el) return;
  if(!D||!D.has){ card.style.display='none'; return; }
  /* Bug P0-6 修复：确保子数组存在 */
  if(!Array.isArray(D.worst)) D.worst = [];
  if(!Array.isArray(D.best)) D.best = [];
  if(!Array.isArray(D.byHour)) D.byHour = [];
  card.style.display='block';
  const kpis=[
    {l:'账户均值CTR', v:pct(D.avgCtr), d:'低效时段判定基准', tip:'ctr', tv:D.avgCtr, tc:'账户周期均值CTR'},
    {l:'低效时段', v:D.worst.length+' 个', d:'CTR<均值60% 且消费高（hourEff 仅用于逐时段；聚合计数跳过浮层）'},
    {l:'高效时段', v:D.best.length+' 个', d:'CTR≥均值1.2倍（hourEff 仅用于逐时段；聚合计数跳过浮层）'},
    {l:'分时总消费', v:'¥'+fmt(D.totalCost), d:'账户级聚合'}
  ];
  const rows=D.byHour.map(o=>{
    const cls=o.ctr>0 && o.ctr<D.avgCtr*0.6?'b-red':(o.ctr>=D.avgCtr*1.2?'b-green':'b-gray');
    return [esc(o.hour), fmt0(o.shows), fmt0(o.clicks), dt('ctr',o.ctr,`<span class="badge ${cls}">${pct(o.ctr)}</span>`,D.avgCtr,o.hour), '¥'+fmt(o.cost), pct(o.costShare,1)];
  });
  const rec=D.worst.length? `<div class="alert warn" style="margin-top:10px">建议缩减低效时段出价系数：${D.worst.map(o=>esc(o.hour)+(o.ctr>0?('(CTR'+pct(o.ctr)+',消费占比'+pct(o.costShare,1)+'%)'):'')).join('、')}</div>` : '';
  el.innerHTML = '<div class="grid g4" style="margin-bottom:12px">'+kpis.map(k=>`<div class="kpi"${(k.tip?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':'')+(k.tb!=null?' data-tip-bench="'+k.tb+'"':'')+(k.tc?' data-tip-context="'+esc(k.tc)+'"':'')}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('')+'</div>'+
    tableHtml(['时段','展示','点击','CTR','消费','消费占比'], rows,[0]) + rec + (D.best.length?`<div class="alert ok" style="margin-top:8px">高效时段建议加投：${D.best.map(o=>esc(o.hour)+'(CTR'+pct(o.ctr)+')').join('、')}</div>`:'');
}
function renderInvalidDiag(){
  const card=document.getElementById('diagInvalidCard'), el=document.getElementById('diagInvalid');
  const D=R.invalid;
  if(!card||!el) return;
  if(!D||!D.has){ card.style.display='none'; return; }
  /* Bug P0-6 修复：确保子数组存在 */
  if(!Array.isArray(D.flags)) D.flags = [];
  if(!Array.isArray(D.worst)) D.worst = [];
  if(!Array.isArray(D.daily)) D.daily = [];
  card.style.display='block';
  const kpis=[
    {l:'过滤比均值', v:pct(D.avgRatio,1), d:D.avgRatio>15?'\u26a0\ufe0f 超行业合格线15%':'<15% 合格', tip:'invalidRatio', tv:D.avgRatio, tc:'账户周期过滤比均值'},
    {l:'过滤金额合计', v:'¥'+fmt(D.totalFiltered), d:'过滤前 ¥'+fmt(D.totalBefore)},
    {l:'超阈值日', v:D.flags.length+' 天', d:'过滤比>15%'},
    {l:'高过滤金额日TOP3', v:D.worst.length+' 天', d:D.worst.map(w=>w.date.slice(5)).join('、')||'—'}
  ];
  const rows=D.daily.map(d=>{
    const cls=d.ratio>15?'b-red':'b-green';
    return [d.date.slice(5), fmt0(d.before), fmt0(d.filtered), dt('invalidRatio',d.ratio,`<span class="badge ${cls}">${pct(d.ratio,1)}</span>`,null,d.date.slice(5)), '¥'+fmt(d.amount)];
  });
  el.innerHTML = '<div class="grid g4" style="margin-bottom:12px">'+kpis.map(k=>`<div class="kpi"${(k.tip?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':'')+(k.tb!=null?' data-tip-bench="'+k.tb+'"':'')+(k.tc?' data-tip-context="'+esc(k.tc)+'"':'')}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('')+'</div>'+
    `<div class="section-hint">${esc(D.note)}</div>` +
    tableHtml(['日期','过滤前点击','过滤点击','过滤比','过滤金额'], rows,[0]) +
    (D.flags.length?`<div class="alert warn" style="margin-top:8px">过滤比超阈值的日期：${D.flags.map(f=>f.slice(5)).join('、')}——当日原始点击含较多无效流量，真实有效流量更小，定位波动时需联合排名/创意解读。</div>`:'');
}
function renderOcpcDiag(){
  const card=document.getElementById('diagOcpcCard'), el=document.getElementById('diagOcpc');
  const D=R.ocpc;
  if(!card||!el) return;
  if(!D||!D.has){ card.style.display='none'; return; }
  /* Bug P0-6 修复：确保子数组存在 */
  if(!Array.isArray(D.pkgs)) D.pkgs = [];
  card.style.display='block';
  const kpis=[
    {l:'投放包数', v:D.pkgs.length+' 个', d:'使用 oCPC 智能出价'},
    {l:'oCPC 总消耗', v:'¥'+fmt(D.totalCost), d:'占账户消费主要部分'},
    {l:'学习期', v:D.learning?'是（'+(D.learnDays||R.dates.length)+'天）':'否', d:D.learning?'3-7天不宜频繁调整':'模型已稳定', tip:'ocpcStatus', tv:D.learning?1:0, tb:D.learnDays||R.dates.length, tc:'oCPC学习期状态'},
    {l:'状态建议', v:D.learning?'保护中':'监控中', d:D.learning?'避免否词/改页/大调预算':'持续观察波动', tip:'ocpcStatus', tv:D.learning?1:0, tb:D.learnDays||R.dates.length, tc:'oCPC运行建议'}
  ];
  const rows=D.pkgs.map(p=>[esc(p.pkg), fmt0(p.shows), fmt0(p.clicks), pct(p.ctr), '¥'+fmt(p.cpc), '¥'+fmt(p.cost), p.days+' 天']);
  el.innerHTML = '<div class="grid g4" style="margin-bottom:12px">'+kpis.map(k=>`<div class="kpi"${(k.tip?' data-tip-type="'+k.tip+'" data-tip-value="'+k.tv+'"':'')+(k.tb!=null?' data-tip-bench="'+k.tb+'"':'')+(k.tc?' data-tip-context="'+esc(k.tc)+'"':'')}><div class="lbl">${k.l}</div><div class="val">${k.v}</div><div class="delta">${k.d}</div></div>`).join('')+'</div>'+
    `<div class="section-hint">${esc(D.note)}</div>` +
    tableHtml(['oCPC投放包','展示','点击','CTR','CPC','消耗','覆盖天数'], rows,[0]) +
    (D.learning?`<div class="alert warn" style="margin-top:8px">学习期内（投放包活跃 ${(D.learnDays||R.dates.length)} 天）：连续3天成本超基准±15%再干预，避免破坏模型学习。</div>`:'');
}

/* ============================================================
   图表点击弹窗系统（Chart Click Popup）
   
   用户点击 Canvas 图表数据点或 HTML KPI卡片/表格行时，
   弹出结构化浮层，展示该元素的详细数据、迷你图表和分析建议。
   浮层排版条理清晰、内容准确、重要信息一目了然。
   ============================================================ */

/* ---- 弹窗核心函数 ---- */
function showChartPopup(title, badge, sections){
  /* Bug P0-3 修复：增加 cpTitle/cpBadge null 检查 */
  var t = document.getElementById('cpTitle'); if(t) t.textContent = title;
  var b = document.getElementById('cpBadge'); if(b) b.textContent = badge || '📊';
  var body = document.getElementById('cpBody');
  if(!body) return;
  
  var html = '';
  sections.forEach(function(sec){
    if(!sec) return;
    html += '<div class="cp-section">';
    if(sec.title) html += '<div class="cp-section-title">'+esc(sec.title)+'</div>';
    
    /* KPI 卡片行 */
    if(sec.kpis && sec.kpis.length){
      html += '<div class="cp-kpi-row">';
      sec.kpis.forEach(function(k){
        html += '<div class="cp-kpi">'+
          '<div class="cp-k-lbl">'+esc(k.l)+'</div>'+
          '<div class="cp-k-val">'+esc(k.v)+'</div>'+
          (k.d?'<div class="cp-k-delta" style="color:'+(k.dc||'var(--muted)')+'">'+esc(k.d)+'</div>':'')+
        '</div>';
      });
      html += '</div>';
    }
    
    /* 数据表格 */
    if(sec.table && sec.table.rows && sec.table.rows.length){
      html += '<div class="cp-table-wrap"><table><thead><tr>';
      sec.table.cols.forEach(function(c){ html += '<th>'+esc(c)+'</th>'; });
      html += '</tr></thead><tbody>';
      sec.table.rows.forEach(function(row){
        html += '<tr>';
        row.forEach(function(cell){
          html += '<td>'+(typeof cell==='string'?cell:esc(String(cell)))+'</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
    
    /* 迷你柱状图 */
    if(sec.bars && sec.bars.length){
      var maxV = Math.max.apply(null, sec.bars.map(function(b){ return b.v||0; })) || 1;
      html += '<div class="cp-mini-chart">';
      sec.bars.forEach(function(b){
        var h = Math.max(4, (b.v||0)/maxV*56);
        html += '<div class="mc-bar" style="height:'+h+'px;background:'+(b.color||'var(--p)')+'" title="'+esc(b.label||'')+': '+esc(String(b.v))+'"></div>';
      });
      html += '</div>';
      if(sec.barLegend){
        html += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;display:flex;gap:16px">';
        sec.barLegend.forEach(function(l){
          html += '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+l.color+';margin-right:4px"></span>'+esc(l.label)+'</span>';
        });
        html += '</div>';
      }
    }
    
    /* 分析/建议 */
    if(sec.analysis){
      html += '<div class="cp-analysis">'+sec.analysis+'</div>';
    }
    
    html += '</div>';
  });
  
  body.innerHTML = html;
  /* Bug P0-4 修复：增加 chartPopupOverlay null 检查 */
  var ov = document.getElementById('chartPopupOverlay'); if(ov) ov.classList.add('show');
  /* 按需滚动到顶部 */
  body.scrollTop = 0;
}

function hideChartPopup(){
  var ov = document.getElementById('chartPopupOverlay');
  if(ov) ov.classList.remove('show');
}

/* ---- 点击/拖动区分（Canvas 通用） ---- */
var _cpClickState = { startX:0, startY:0, moved:false, threshold:6 };

function _cpMarkDown(e){
  _cpClickState.startX = e.clientX;
  _cpClickState.startY = e.clientY;
  _cpClickState.moved = false;
}
function _cpMarkMove(e){
  if(!_cpClickState.moved){
    var dx = e.clientX - _cpClickState.startX, dy = e.clientY - _cpClickState.startY;
    if(Math.abs(dx)>_cpClickState.threshold || Math.abs(dy)>_cpClickState.threshold) _cpClickState.moved = true;
  }
}

/* ============================================================
   ① 分日趋势图点击 → 显示当日全维度明细
   ============================================================ */
function _initDailyChartClick(cv){
  if(cv._cpBound) return; cv._cpBound = true;
  cv.addEventListener('mousedown', function(e){ _cpMarkDown(e); });
  cv.addEventListener('mouseup', function(e){
    if(_cpClickState.moved){ _cpClickState.startX = 0; return; }
    /* Bug #1 修复：移除 isDragging 冗余检测——moved 标志已正确区分拖动/点击。
       且 chartDailyState.isDragging 在 mousedown 设为 true，但 window mouseup 才重置，
       canvas mouseup 先于 window mouseup 触发，导致此处 isDragging 恒为 true → 弹窗永远不触发 */
    _cpClickState.startX = 0;
    var d = R.daily; if(!d||!d.length) return;
    var st = chartDailyState || {offset:0, count:Math.min(d.length,20)};
    var wrap = cv.parentElement, cssW = (wrap?wrap.clientWidth:0)||cv.clientWidth||900;
    cssW = Math.max(320, Math.floor(cssW));
    var padL=60, padR=60, iw=(cssW-padL-padR)/st.count;
    var idx = Math.floor((e.offsetX - padL)/iw);
    if(idx<0||idx>=st.count) return;
    var actualIdx = st.offset + idx;
    if(actualIdx<0||actualIdx>=d.length) return;
    showDailyDetail(d, actualIdx);
  });
}

function showDailyDetail(d, idx){
  var x = d[idx];
  /* 环比：找前一日数据 */
  var prev = idx>0?d[idx-1]:null;
  var deltaCostNum = prev&&prev.cost?((x.cost-prev.cost)/prev.cost*100):null;
  var deltaConvNum = prev&&prev.conv?((x.conv-prev.conv)/prev.conv*100):null;
  var deltaCtrNum  = prev&&prev.ctr?((x.ctr-prev.ctr)*100):null;
  var deltaCost = deltaCostNum!==null?deltaCostNum.toFixed(1):null;
  var deltaConv = deltaConvNum!==null?deltaConvNum.toFixed(1):null;
  var deltaCtr  = deltaCtrNum!==null?deltaCtrNum.toFixed(1):null;
  
  /* 当日是否有零转化高消费预警 */
  var zeroWarn = x.conv===0 && x.cost >= (SET.zeroConvCost||300);
  
  /* 当日转化词详情（如有） */
  var convKwRows = [];
  /* Bug #4 修复：daily 对象字段为 present（kw 字符串数组），非 top3Kws */
  if(R.convDaily && R.convDaily.daily){
    var cdDay = R.convDaily.daily.find(function(dd){ return dd.date===x.date; });
    if(cdDay && cdDay.present && cdDay.present.length){
      convKwRows = cdDay.present.slice(0,5).map(function(kw, i){ return [i+1, esc(kw)]; });
    }
  }
  
  var sections = [
    { title: '📅 '+x.date+' 当日核心指标', kpis: [
      {l:'消费', v:'¥'+fmt(x.cost), d:deltaCost?'较前日 '+(deltaCostNum>0?'+':'')+deltaCost+'%':null, dc:deltaCostNum>0?'var(--danger)':'var(--ok)'},
      {l:'转化数', v:fmt(x.conv,1), d:deltaConv?'较前日 '+(deltaConvNum>0?'+':'')+deltaConv+'%':null, dc:deltaConvNum>0?'var(--ok)':'var(--danger)'},
      {l:'展示', v:fmt0(x.shows), d:deltaCtr?'CTR变化 '+(deltaCtrNum>0?'+':'')+deltaCtr+'pp':null},
      {l:'点击', v:fmt0(x.clicks), d:'CPC ¥'+fmt(x.cpc,1)},
      {l:'CPA', v:x.conv?'¥'+fmt(x.cost/x.conv,1):'∞', d:x.cpaStatus||(x.conv===0&&x.cost>=100?'⚠️ 零转化高消费':''), dc:zeroWarn?'var(--danger)':'var(--muted)'},
      {l:'CTR', v:(x.ctr*100).toFixed(2)+'%', d:x.ctr>=0.05?'高点击率':(x.ctr>=0.01?'正常':'偏低'), dc:x.ctr>=0.05?'var(--ok)':(x.ctr>=0.01?'var(--muted)':'var(--warn)')}
    ]},
    { title: '\u{1F4CA} 周期内分日消费/转化对比', bars: d.slice(Math.max(0,idx-6), Math.min(d.length,idx+7)).map(function(dd,i){
      return {label:dd.date.slice(5), v:dd.cost, color:dd.date===x.date?'var(--p)':(dd.conv===0&&dd.cost>=100?'var(--danger)':'var(--chart-cost)')};
    }), barLegend: [{label:'当日',color:'var(--p)'},{label:'零转化高消费',color:'var(--danger)'},{label:'普通',color:'var(--chart-cost)'}] }
  ];
  
  /* 转化词表格 */
  if(convKwRows.length){
    sections.push({ title: '\u{1F50D} 当日 Top 转化关键词', table: {cols:['#','关键词'], rows:convKwRows} });
  }
  
  /* 分析建议 */
  var analysis = '';
  if(zeroWarn){
    analysis = '<b>\u{1F6A8} 零转化高消费日预警</b>：当日消费 ¥'+fmt(x.cost)+'但转化为 0，预算被完全浪费。<ol>'+
      '<li>检查当日是否有新增无转化搜索词大量花钱（去 CPA 归因模块查看）</li>'+
      '<li>检查关键词排名是否在当日突然下滑（去维度专项诊断 → 排名三分支）</li>'+
      '<li>若搭配 oCPC，核对当日是否处于\"探索期\"大量扩触发</li></ol>';
  } else if(x.conv>0 && deltaConvNum!==null && deltaConvNum<-30){
    analysis = '<b>\u26A0\uFE0F 转化骤降</b>：较前日下降 '+Math.abs(deltaConvNum).toFixed(1)+'%，建议去 CPA 基准归因模块查看当日是否有高CPA异动。';
  } else if(x.conv>0){
    analysis = '<b>\u2705 转化正常</b>：当日产出 '+x.conv+' 个转化，CPA ¥'+fmt(x.cost/x.conv,1)+'。继续关注后续日度趋势，若连续 3 日转化低于均值 30% 则需排查。';
  } else if(x.cost<50){
    analysis = '<b>\u2139\uFE0F 低消费零转化日</b>：当日消费仅 ¥'+fmt(x.cost)+'，转化偶然为零属正常波动，暂不需要干预。';
  }
  if(analysis) sections.push({ title: '\u{1F4DD} 诊断分析', analysis: analysis });
  
  showChartPopup(x.date+' 全维度明细', zeroWarn?'🚨':'📅', sections);
}

/* ============================================================
   ② 地域分布图点击 → 显示该地域详细数据
   ============================================================ */
function _initGeoChartClick(cv){
  if(cv._cpBound) return; cv._cpBound = true;
  cv.addEventListener('mousedown', function(e){ _cpMarkDown(e); });
  cv.addEventListener('mouseup', function(e){
    if(_cpClickState.moved){ _cpClickState.startX = 0; return; }
    _cpClickState.startX = 0;
    var gs = R.geo; if(!gs||!gs.length) return;
    gs = gs.slice(0,12);
    var padT=24, padB=30, H=340;
    var bh=(H-padT-padB)/gs.length;
    var idx = Math.floor((e.offsetY - padT)/bh);
    if(idx<0||idx>=gs.length) return;
    showGeoDetail(gs, idx);
  });
}

function showGeoDetail(gs, idx){
  var g = gs[idx];
  var diagColor = g.diag==='收缩'?'var(--danger)':(g.diag==='降价'?'var(--warn)':(g.diag==='扩量'?'var(--ok)':'var(--info)'));
  var diagBadge = g.diag==='收缩'?'b-red':(g.diag==='降价'?'b-amber':(g.diag==='扩量'?'b-green':'b-blue'));
  
  /* 全部12地域排名（地域报告无转化列，仅展示消费/CTR/CPC） */
  var rankRows = gs.map(function(r,i){ return [(i+1), esc(r.region), '¥'+fmt(r.cost), pct(r.ctr,1), '¥'+fmt(r.cpc,1)]; });
  
  var sections = [
    { title: '\u{1F30D} '+g.region+' 地域诊断详情', kpis: [
      {l:'消费', v:'¥'+fmt(g.cost), d:'排名 #'+(idx+1)+'/'+gs.length, dc:diagColor},
      {l:'CTR', v:pct(g.ctr,1), d:g.ctr>=0.05?'高于均值':(g.ctr>=0.02?'正常':'偏低'), dc:g.ctr>=0.05?'var(--ok)':(g.ctr>=0.02?'var(--muted)':'var(--warn)')},
      {l:'CPC', v:'¥'+fmt(g.cpc,1), d:g.cpc<=3?'低成本':(g.cpc<=8?'正常':'偏高')},
      {l:'诊断', v:g.diag||'保持', d:g.advice||'', dc:diagColor}
    ]},
    { title: '\u{1F4CA} TOP12 地域消费对比', bars: gs.map(function(r){
      return {label:r.region, v:r.cost, color:r.region===g.region?'var(--p)':(r.diag==='收缩'?'var(--danger)':(r.diag==='降价'?'var(--warn)':(r.diag==='扩量'?'var(--ok)':'var(--chart-cost)')))};
    }), barLegend: [
      {label:'当前',color:'var(--p)'},{label:'扩量',color:'var(--ok)'},{label:'保持',color:'var(--chart-cost)'},{label:'降价',color:'var(--warn)'},{label:'收缩',color:'var(--danger)'}
    ]},
    { title: '\u{1F4CB} TOP12 地域完整排名（地域报告无转化数据）', table: {cols:['排名','地域','消费','CTR','CPC'], rows:rankRows} }
  ];
  
  var analysis = '';
  if(g.diag==='收缩'){
    analysis = '<b>\u{1F534} 建议收缩</b>：该地域消费 ¥'+fmt(g.cost)+'，CTR/CPC 效率严重偏低。<ol>'+
      '<li>降低该地域出价系数至 0.5-0.7 或暂停投放</li><li>检查落地页在该地域的加载速度是否正常</li><li>分析该地域的搜索词是否与业务匹配</li></ol>';
  } else if(g.diag==='降价'){
    analysis = '<b>\u{1F7E1} 建议降价</b>：该地域转化成本偏高，可适度降低出价。<ol><li>下调地域出价系数 10-20%</li><li>优先保留精准匹配关键词，暂停广泛匹配</li></ol>';
  } else if(g.diag==='扩量'){
    analysis = '<b>\u{1F7E2} 建议扩量</b>：该地域转化效率高，CPA可控，是潜力市场。<ol><li>上调地域出价系数 10-30%</li><li>增加该地域的精准关键词覆盖</li></ol>';
  } else {
    analysis = '<b>\u{1F535} 建议保持</b>：该地域表现稳定，维持当前策略即可。';
  }
  if(analysis) sections.push({ title: '\u{1F4DD} 优化建议', analysis: analysis });
  
  showChartPopup(g.region+' 地域诊断', g.diag==='收缩'?'🔴':(g.diag==='降价'?'🟡':(g.diag==='扩量'?'🟢':'🔵')), sections);
}

/* ============================================================
   ③ CPA 归因图点击 → 显示当日 CPA 归因明细
   ============================================================ */
function _initCpaChartClick(cv){
  if(cv._cpBound) return; cv._cpBound = true;
  cv.addEventListener('mousedown', function(e){ _cpMarkDown(e); });
  cv.addEventListener('mouseup', function(e){
    if(_cpClickState.moved){ _cpClickState.startX = 0; return; }
    _cpClickState.startX = 0;
    var c = R.cpa; if(!c||!c.days||!c.days.length) return;
    var d = c.days, wrap = cv.parentElement, cssW = (wrap?wrap.clientWidth:0)||cv.clientWidth||900;
    cssW = Math.max(320, Math.floor(cssW));
    var padL=64, padR=20, iw=(cssW-padL-padR)/d.length;
    var idx = Math.floor((e.offsetX - padL)/iw);
    if(idx<0||idx>=d.length) return;
    showCpaDetail(c, d[idx], idx);
  });
}

function showCpaDetail(c, x, idx){
  var base = c.baselineCPA;
  var devNum = base&&x.cpa?((x.cpa-base)/base*100):null;
  var dev = devNum!==null?devNum.toFixed(0):null;
  /* Bug #3 修复：x.excess 不存在于 days 对象，应从 c.factors 查询 */
  var xExcess = null;
  if(c.factors && c.factors.length){
    var xf = c.factors.find(function(f){return f.date===x.date;});
    if(xf) xExcess = xf.excess;
  }
  
  /* 当日归因关键词 */
  var culpRows = [];
  if(c.kwCulprits && c.kwCulprits[x.date]){
    culpRows = c.kwCulprits[x.date].slice(0,8).map(function(k){
      return [esc(k.kw), '¥'+fmt(k.cost,1), k.conv||0, k.cpa?('¥'+fmt(k.cpa,1)):'零转化', k.baselineCpa?('¥'+fmt(k.baselineCpa,1)):'—', k.contribution?('¥'+fmt(k.contribution,1)):'—'];
    });
  }
  
  /* 当日新增无转化词 */
  var newRows = [];
  if(c.newTerms){
    newRows = c.newTerms.filter(function(t){ return t.highDays.indexOf(x.date)>=0; }).slice(0,5).map(function(t){
      return [esc(t.query), esc(t.kw), esc(t.mode), '¥'+fmt(t.cost,1)];
    });
  }
  
  var sections = [
    { title: '\u{1F4C5} '+x.date+' CPA 归因详情', kpis: [
      {l:'当日CPA', v:x.cpa?'¥'+fmt(x.cpa,1):'∞', d:dev?'较基准 '+(devNum>0?'+':'')+dev+'%':'', dc:(devNum!==null&&devNum>50)?'var(--danger)':(devNum!==null&&devNum>0?'var(--warn)':'var(--ok)')},
      {l:'基准CPA', v:base?'¥'+fmt(base,1):'—', d:'有转化日度CPA中位数'},
      {l:'消费', v:'¥'+fmt(x.cost,1), d:x.conv?'转化 '+x.conv+' 个':'零转化', dc:x.conv?'var(--ok)':'var(--danger)'},
      {l:'高异动日', v:x.isHigh?'🚨 是':'✅ 否', d:x.isHigh?'CPA大幅超标':'在正常范围内', dc:x.isHigh?'var(--danger)':'var(--ok)'},
      {l:'基准日', v:x.isBaseline?'是':'否', d:x.isBaseline?'该日参与基准计算':'非基准日'},
      {l:'预估超额', v:xExcess?'¥'+fmt(xExcess,1):'—', d:'相对基准多花的钱'}
    ]},
    { title: '\u{1F4CA} 周期 CPA 走势（★当前日）', bars: c.days.map(function(dd,i){
      return {label:dd.date.slice(5), v:dd.cpa||0, color:dd.date===x.date?'var(--p)':(dd.isHigh?'var(--danger)':(dd.isBaseline?'var(--ok)':'var(--chart-cost)'))};
    }), barLegend: [{label:'当前',color:'var(--p)'},{label:'高异动',color:'var(--danger)'},{label:'基准日',color:'var(--ok)'},{label:'普通',color:'var(--chart-cost)'}] }
  ];
  
  if(culpRows.length){
    sections.push({ title: '\u{1F50D} 当日主因关键词（按超额成本排序）', table: {cols:['关键词','消费','转化','当日CPA','基准CPA','超额成本'], rows:culpRows} });
  }
  if(newRows.length){
    sections.push({ title: '\u{2795} 当日新增无转化搜索词（预算吞噬源）', table: {cols:['搜索词','关键词','模式','消费'], rows:newRows} });
  }
  
  var analysis = '';
  if(x.isHigh && devNum!==null && devNum>50){
    analysis = '<b>\u{1F6A8} CPA 严重超标</b>：当日CPA较基准高 '+dev+'%，预估浪费 ¥'+(xExcess?fmt(xExcess,1):'—')+'。<ol>'+
      '<li>立即排查当日新增无转化搜索词→加入否词清单</li>'+
      '<li>检查是否有 CPC 突然飙升的关键词（排名竞争加剧）</li>'+
      '<li>查看是否有创意CTR在当日大幅下滑（去创意诊断模块）</li>'+
      '<li>若使用 oCPC，确认是否处于二阶学习期波动</li></ol>';
  } else if(x.isHigh){
    analysis = '<b>\u26A0\uFE0F CPA 轻度超标</b>：当日CPA较基准高 '+dev+'%，建议持续观察，若连续2日超标则按严重超标处理。';
  } else if(!x.isHigh && x.conv>0){
    analysis = '<b>\u2705 转化成本正常</b>：当日CPA在基准范围内，转化效率良好。保持当前投放策略。';
  } else if(x.conv===0){
    analysis = '<b>\u2139\uFE0F 零转化日</b>：当日未能产出转化。若消费较高（¥'+fmt(x.cost,1)+'），建议检查当日流量质量（无效点击比、搜索词匹配度）。';
  }
  if(analysis) sections.push({ title: '\u{1F4DD} 诊断建议', analysis: analysis });
  
  showChartPopup(x.date+' CPA归因', x.isHigh?'🚨':(x.conv?'✅':'ℹ️'), sections);
}

/* ============================================================
   ④ KPI 卡片点击 → 显示该指标详细数据
   ============================================================ */
function _initKpiCardClicks(){
  /* 委托：点击 .kpi 卡片打开弹窗 */
  document.addEventListener('click', function(e){
    var kpi = e.target.closest('.kpi');
    if(!kpi) return;
    /* Bug Issue #10 修复：移除 [data-tip-type] 排除——点击弹窗与 hover tooltip 是不同交互，
       不该互相排斥。原守卫导致所有含 tooltip 的 KPI（总消费/转化/CPA/CTR 等）点击弹窗被屏蔽 */
    /* 避免干扰按钮 */
    if(e.target.closest('button,a,input,select')) return;
    
    var lbl = (kpi.querySelector('.lbl')||{}).textContent || '';
    var val = (kpi.querySelector('.val')||{}).textContent || '';
    var deltaEl = kpi.querySelector('.delta');
    var delta = deltaEl?deltaEl.textContent:'';
    
    if(!lbl) return;
    
    /* 根据标签确定数据类型 */
    var type = _guessKpiType(lbl);
    showKpiDetail(type, lbl, val, delta);
  });
}

function _guessKpiType(lbl){
  if(lbl.indexOf('消费')>=0||lbl.indexOf('消耗')>=0) return 'cost';
  if(lbl.indexOf('CPA')>=0||lbl.indexOf('转化成本')>=0) return 'cpa';
  if(lbl.indexOf('CTR')>=0||lbl.indexOf('点击率')>=0) return 'ctr';
  if(lbl.indexOf('转化')>=0||lbl.indexOf('转化数')>=0) return 'conv';
  if(lbl.indexOf('点击')>=0) return 'click';
  if(lbl.indexOf('展示')>=0) return 'show';
  if(lbl.indexOf('CPC')>=0) return 'cpc';
  return 'generic';
}

function showKpiDetail(type, lbl, val, delta){
  var sections = [{ title: '\u{1F4CA} '+lbl+' 详情', kpis: [{l:lbl, v:val, d:delta||'—'}] }];
  
  /* 匹配 DATA_TIP 规则库的解释 */
  var dt = DATA_TIP[type];
  if(dt){
    var numVal = parseFloat(String(val).replace(/[¥%,]/g,''));
    if(!isNaN(numVal)){
      var evalResult = dt.eval(numVal, null);
      if(evalResult && evalResult.txt){
        sections.push({ title: '\u{1F4AC} 指标解读', analysis: '<b>'+esc(evalResult.level||'')+'</b>：'+esc(evalResult.txt) });
      }
      if(dt.what){
        sections.push({ title: '\u{1F4A1} 什么是'+lbl+'？', analysis: esc(dt.what) });
      }
      if(dt.advices){
        var advs = dt.advices[evalResult.level] || dt.advices['正常'];
        if(advs && advs.length){
          sections.push({ title: '\u2714 优化建议', analysis: '<ol>'+advs.map(function(a){ return '<li>'+esc(a)+'</li>'; }).join('')+'</ol>' });
        }
      }
    }
  }
  
  showChartPopup(lbl+' 详细分析', '📊', sections);
}

/* ============================================================
   ⑤ 初始化所有图表点击事件
   ============================================================ */
function initChartClickPopups(){
  /* 全局 mousemove 标记拖动（所有图表共用）。Bug P0-2 修复：仅注册一次 */
  if(!window._cpMoveBound){ window._cpMoveBound = true; window.addEventListener('mousemove', _cpMarkMove); }
  
  /* Canvas 图表 */
  var dailyCv = document.getElementById('chartDaily');
  if(dailyCv) _initDailyChartClick(dailyCv);
  
  var geoCv = document.getElementById('chartGeo');
  if(geoCv) _initGeoChartClick(geoCv);
  
  var cpaCv = document.getElementById('chartCpa');
  if(cpaCv) _initCpaChartClick(cpaCv);
  
  /* KPI 卡片 */
  if(!window._cpKpiBound){ window._cpKpiBound = true; _initKpiCardClicks(); }
  
  /* 添加"点击查看详情"提示光标到 KPI 卡片 */
  var style = document.createElement('style');
  style.id = '_cpStyle';
  style.textContent = '.kpi{cursor:pointer;transition:transform .15s,box-shadow .15s}.kpi:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,0.08)}canvas{cursor:crosshair}canvas:hover{opacity:.95}';
  if(!document.getElementById('_cpStyle')) document.head.appendChild(style);
}

/* 在 renderAll 之后初始化弹窗系统 */
var _origRenderAll = renderAll;
renderAll = function(){
  _origRenderAll();
  /* 延迟初始化，等 DOM 渲染完 */
  setTimeout(function(){ initChartClickPopups(); }, 50);
};

/* 键盘 ESC 关闭弹窗 */
document.addEventListener('keydown', function(e){
  if(e.key==='Escape') hideChartPopup();
});

