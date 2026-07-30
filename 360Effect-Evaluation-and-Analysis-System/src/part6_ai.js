/* ============ DeepSeek AI 辅助分析 & 报告导出 ============ */
function dsReady(){ return SET.dsKey && SET.dsKey.startsWith('sk-'); }

async function callDeepSeek(systemPrompt, userPrompt, targetEl){
  if(!targetEl) return;
  const box=targetEl; box.classList.add('show');
  const content=box.querySelector('.ai-content');
  if(!content) return;
  content.innerHTML='<span class="loading-dot"></span>';
  /* Bug #3 修复：添加 60s 超时控制，防止 API 挂起时 UI 永久转圈 */
  const ctrl=new AbortController();
  const timer=setTimeout(function(){ ctrl.abort(); }, 60000);
  try{
    const resp=await fetch(SET.dsUrl||'https://api.deepseek.com/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+SET.dsKey},
      body:JSON.stringify({model:SET.dsModel||'deepseek-chat',
        messages:[{role:'system',content:systemPrompt},{role:'user',content:userPrompt}],
        temperature:0.3, max_tokens:2500}),
      signal:ctrl.signal
    });
    if(!resp.ok){ const t=await resp.text(); throw new Error('API '+resp.status+'：'+t.slice(0,200)); }
    const data=await resp.json();
    const text=data.choices?.[0]?.message?.content||'（无返回内容）';
    content.innerHTML=mdLite(text);
  }catch(e){
    content.innerHTML='<span style="color:var(--red)">调用失败：'+esc(e.message)+'。请检查 API Key、网络（需联网）或稍后重试。</span>';
  }finally{
    clearTimeout(timer);
  }
}
/* 轻量markdown渲染 */
function mdLite(t){
  let h=esc(t);
  h=h.replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>');
  h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/^\s*[-•] (.*)$/gm,'<li>$1</li>');
  h=h.replace(/^\s*(\d+)[.、] (.*)$/gm,'<li>$2</li>');
  h=h.replace(/(<li>.*<\/li>\n?)+/g, m=>'<ul>'+m+'</ul>');   /* v15：合并包裹放到两类列表都转换后，修复编号列表产生裸 <li>（无效 HTML） */
  h=h.replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');
  return '<p>'+h+'</p>';
}

const SYS_PROMPT='你是资深360搜索推广（点睛平台）优化师，精通SEM账户诊断：关键词四象限管理、搜索词匹配度与否词策略、oCPC智能出价、创意CTR优化（含凤舞高级样式）、地域时段策略。基于用户提供的真实账户数据摘要，输出专业、具体、可直接执行的优化结论。要求：1)先给核心结论 2)按优先级列出具体动作（含具体词/创意/地域名称与调整幅度建议）3)不要泛泛而谈，每条建议必须引用数据依据 4)用markdown格式，中文回答，控制在600字内。';

function digestOverview(){
  return `分析周期：${R.period}
账户汇总：消费¥${fmt(R.tot.cost)}，展示${R.tot.shows}，点击${R.tot.clicks}，CTR ${pct(R.tot.ctr)}，转化${R.tot.conv}，CPA ${R.tot.conv?'¥'+fmt(R.tot.cpa):'无转化'}（目标基准¥${fmt(R.targetCPA)}）
分日数据：
${R.daily.map(d=>`${d.date}: 消费¥${fmt(d.cost)} 点击${d.clicks} 转化${d.conv} CPA${d.conv?'¥'+fmt(d.cost/d.conv):'—'}`).join('\n')}
零转化高消费日：${R.zeroDays.map(z=>z.date+'(¥'+fmt(z.cost)+')').join('、')||'无'}
计划表现：${R.planStats.map(p=>`${p.plan}:消费¥${fmt(p.cost)}/转化${p.conv}`).join('；')}
触发模式：${R.modeStats.map(m=>`${m.mode}:消费¥${fmt(m.cost)}/转化${m.conv}/匹配均分${Math.round(m.avgScore)}`).join('；')}`
  + (R.compare? `\n上周期(${R.compare.period})对比：消费¥${fmt(R.compare.cost)}→¥${fmt(R.tot.cost)}，转化${R.compare.conv}→${R.tot.conv}`:'');
}
function digestQuad(){
  const byQ=groupBy(R.kws,k=>k.quad);
  const line=q=>(byQ[q]||[]).sort((a,b)=>b.cost-a.cost).slice(0,10).map(k=>`${k.kw}(¥${fmt(k.cost)}/${k.conv}转)`).join('、');
  return `高消费分界¥${fmt(R.highCost)}。\nA重点词：${line('A')}\nB问题词(高消费零转化)：${line('B')}\nC潜力词：${line('C')}\nD观察词TOP：${line('D')}`;
}
function digestConv(){
  return `转化词分日矩阵（周期${R.period}，总转化${R.tot.conv}）：\n`+
    R.convKws.map(k=>`${k.kw}[${k.status}] 总${k.conv}转 CPA¥${fmt(k.cpa)} 分日:${R.dates.map(d=>k.byDate[d]||0).join(',')}`).join('\n')+
    `\n核心词(贡献80%)：${R.coreKws.join('、')}`+
    (R.compare? `\n跨周期变化：${R.compare.changes.filter(c=>c.st!=='持平').map(c=>`${c.kw}:${c.prev}→${c.cur}(${c.st})`).join('；')}`:'')+
    `\n转化搜索词：${R.convQueries.map(q=>`${q.query}(经${q.kw},${q.conv}转)`).join('、')}`;
}
function digestConvDaily(){
  const cd=R.convDaily; if(!cd||!cd.has) return null;
  const lines=['分日转化关键词日度变化追踪（逐日 churn）：'];
  lines.push(`日均转化词数 ${cd.avgDailyConvKw.toFixed(1)} 个；累计逐日新增 ${cd.totalNew} 个、流失 ${cd.totalLost} 个；Top3 集中度 前半 ${(cd.firstShare*100).toFixed(0)}% → 后半 ${(cd.lastShare*100).toFixed(0)}%（${cd.concTrend}）`);
  if(cd.lostStillSpending.length) lines.push('⚠ 流失核心词仍在烧钱(P1)：'+cd.lostStillSpending.slice(0,8).map(c=>`${c.kw}(近3日¥${fmt(c.recentCost)}/${c.daysSinceConv}日无转化,曾${c.convTotal}转)`).join('、'));
  if(cd.flickerCore.length) lines.push('间断核心词(P2)：'+cd.flickerCore.slice(0,8).map(c=>`${c.kw}(${c.presentDays}/${cd.dates.length}日)`).join('、'));
  const sample=cd.churn.filter(c=>c.gained.length||c.lost.length).slice(0,5).map(c=>`${c.date.slice(5)}: +${c.gained.length}/-${c.lost.length}(新转${c.gainedConv.toFixed(0)}/失转${c.lostConv.toFixed(0)})`);
  if(sample.length) lines.push('逐日变化样例：'+sample.join('；'));
  // v10：生命周期时间线 + 流失核心词 × 共变联动
  const lc=cd.lifecycle||[];
  const dead=lc.filter(l=>!l.active);
  if(lc.length) lines.push(`生命周期时间线：在产 ${lc.length-dead.length} 个 / 已流失 ${dead.length} 个；最长生命周期 ${Math.max.apply(null,lc.map(l=>l.lifespanDays))} 天，最短 ${Math.min.apply(null,lc.map(l=>l.lifespanDays))} 天`);
  if(cd.lostCoreLink.length){
    lines.push(`🔗 流失核心词×共变联动（相关性假设非因果）：`+cd.lostCoreLink.slice(0,8).map(x=>{
      const sig=x.signals.map(s=>s.dim+(s.dim==='无效点击过滤比'?`(${(s.pre*100).toFixed(1)}%→${(s.post*100).toFixed(1)}%)`:`(${s.pre.toFixed(s.dim==='CTR'?2:1)}→${s.post.toFixed(s.dim==='CTR'?2:1)})`)).join('、');
      return `${x.kw}于${x.lastConvDate.slice(5)}断流,同步${sig}`;
    }).join('；'));
  } else if(cd.hasRankData||cd.hasKwCtrData||cd.hasInvalidData){
    lines.push('🔗 流失核心词当日未检出 排名/CTR/无效点击 同步劣化；断流或源于 预算/匹配/落地页 等未覆盖因素');
  }
  return lines.join('\n');
}
function digestQuery(){
  const lo=R.queries.filter(q=>q.level==='低');
  return `搜索词匹配度：高${R.queries.filter(q=>q.level==='高').length}组/中${R.queries.filter(q=>q.level==='中').length}组/低${lo.length}组，低匹配消费¥${fmt(lo.reduce((s,q)=>s+q.cost,0))}
建议否词TOP20：${R.negList.slice(0,20).map(q=>`${q.query}(¥${fmt(q.cost)},经${q.kw})`).join('、')}
建议加词：${R.addList.map(q=>`${q.query}(${q.conv}转,CTR${pct(q.shows?q.clicks/q.shows:0,1)})`).join('、')}
触发模式匹配质量：${R.modeStats.map(m=>`${m.mode}:均分${Math.round(m.avgScore)}/消费¥${fmt(m.cost)}/转化${m.conv}`).join('；')}`;
}
function digestMatchMode(){
  if(!R.matchMode || !R.matchMode.has) return null;
  const m=R.matchMode;
  const lines=['触发模式(匹配模式)效率诊断（v8）：'];
  m.modes.forEach(x=> lines.push(`  ${x.mode}: 消费¥${fmt(x.cost)} / 转化${x.conv} / CPA${x.cpa!=null?'¥'+fmt(x.cpa,1):'—'} / 零转化词消耗占比${(x.zeroConvCostShare*100).toFixed(0)}%`));
  if(m.overBroad.length) lines.push('  ⚠ 匹配过宽：'+m.overBroad.map(o=>`${o.mode}(零转化词消耗${(o.zeroConvCostShare*100).toFixed(0)}%)`).join('、')+' → 收为短语/精确匹配 + 加否词围栏');
  lines.push('  '+m.note);
  return lines.join('\n');
}
function digestCreative(){
  return `基础创意组表现：\n`+R.creGroups.map(g=>`[${g.gkey}] 组CTR${pct(g.gctr)} 消费¥${fmt(g.cost)}：`+g.titles.slice(0,4).map(t=>`「${t.title.slice(0,25)}」CTR${pct(t.ctr)}/${t.shows}展`).join('；')).join('\n')+
  `\n低效创意：${R.weakCre.map(c=>`[${c.g}]${c.title.slice(0,20)}(CTR${pct(c.ctr)}vs组${pct(c.gctr)})`).join('、')||'无'}`+
  `\n高级样式vs基础：${R.advCompare.slice(0,8).map(x=>`${x.gkey}:高级CTR${pct(x.adv.ctr)}${x.basic?('/基础'+pct(x.basic.ctr)):''}`).join('；')}`;
}
function digestGeo(){
  return `地域数据（周期汇总，均值CTR${pct(R.geoAvgCtr)}、CPC¥${fmt(R.geoAvgCpc)}）：\n`+
    R.geo.map(g=>`${g.region}:消费¥${fmt(g.cost)}(${pct(R.geoTot.cost?g.cost/R.geoTot.cost:0,1)}) CTR${pct(g.ctr)} CPC¥${fmt(g.cpc)} [${g.diag}]`).join('\n');
}
function digestCpa(){
  const c=R.cpa; if(!c) return 'CPA基准归因：未计算';
  return `CPA基准归因（基准CPA¥${c.baselineCPA?fmt(c.baselineCPA,1):'—'}，基准日${c.baselineDays.join('、')||'无'}）：\n`+
    `高CPA异动日：${c.highDays.join('、')||'无'}；高日预估超额成本¥${fmt(c.wastedCost,1)}\n`+
    c.factors.map(f=>f.text).join('\n')+
    (c.newTerms.length?`\n新增无转化搜索词(预算吞噬)：${c.newTerms.slice(0,15).map(t=>`${t.query}(¥${fmt(t.cost)},经${t.kw})`).join('、')}`:'')+
    (c.creShift.length?`\n创意CTR异动(代理)：${c.creShift.slice(0,8).map(x=>x.title+'('+x.shifts.map(s=>s.date.slice(5)+' '+(s.deltaPct*100).toFixed(0)+'%').join('、')+')').join('、')}`:'');
}
function digestCovar(){
  const cv=R.covar; if(!cv||!cv.units.length) return '波动归因：无显著波动单元，无需归因';
  let s='波动归因 · 跨维度同步变化共变（相关性假设，非因果）：\n'+cv.note+'\n';
  if(cv.planTypes && cv.planTypes.length) s+='计划类型：'+cv.planTypes.map(p=>p.plan+'='+p.type+(p.corrConvCost!=null?'(r='+p.corrConvCost.toFixed(2)+')':'')).join('；')+'。\n';
  if(cv.emptyRuns && cv.emptyRuns.length) s+='空转单元(高消费0转化)：'+cv.emptyRuns.map(e=>e.name+'(¥'+fmt(e.cost)+')').join('、')+'。\n';
  s += cv.units.slice(0,10).map(u=>{
    const drv=u.drivers.slice(0,3).map(d=>d.dim+'(r='+d.r.toFixed(2)+d.dir+','+d.strength+')').join('、');
    return `[${u.scope}] ${u.target}（${u.plan}/${u.group}）：可能驱动=${drv||'无显著相关'}`;
  }).join('\n');
  return s;
}
function digestDiag(){
  const out=[];
  const rk=R.rank, hr=R.hour, iv=R.invalid, oc=R.ocpc;
  if(rk&&rk.has){
    out.push('【排名三分支诊断·分设备】（账户周期CTR '+pct(rk.accountCtr)+'，判定"CTR偏低"=其60%）：');
    out.push(rk.diag.slice(0,15).map(d=>{
      const parts=[];
      if(d.pc) parts.push('PC('+d.pc.dev+')'+d.pc.val.toFixed(2)+'→'+d.pc.verdict);
      if(d.mobile) parts.push(d.mobile.dev+'('+d.mobile.val.toFixed(2)+')→'+d.mobile.verdict);
      return d.kw+': '+(parts.join(' / ')||'无排名')+' / CTR'+pct(d.ctr)+' / 转化'+d.conv+(d.cross?(' | '+d.cross):'');
    }).join('\n'));
  }
  if(hr&&hr.has){
    out.push('【分时效率】账户均值CTR '+pct(hr.avgCtr)+'；低效时段(CTR<均值60%且消费高)：'+(hr.worst.map(o=>o.hour+'('+pct(o.ctr)+',占比'+pct(o.costShare,1)+'%)').join('、')||'无')+'；高效时段(CTR≥均值1.2倍)：'+(hr.best.map(o=>o.hour+'('+pct(o.ctr)+')').join('、')||'无'));
  }
  if(iv&&iv.has){
    out.push('【无效点击】过滤比均值 '+iv.avgRatio.toFixed(1)+'%（行业合格线15%）→ '+(iv.avgRatio>15?'偏高':'合格')+'；过滤金额合计¥'+fmt(iv.totalFiltered)+'；过滤比超阈值日：'+(iv.flags.join('、')||'无'));
  }
  if(oc&&oc.has){
    out.push('【oCPC】'+oc.pkgs.length+' 个投放包，消耗合计¥'+fmt(oc.totalCost)+(oc.learning?'，处于学习期(约'+oc.learnDays+'天)需保护':'，模型已稳定')+'：'+oc.pkgs.slice(0,5).map(p=>p.pkg+' ¥'+fmt(p.cost)).join('、'));
  }
  return out.length? out.join('\n') : '维度专项诊断：未导入排名/分时/无效点击/oCPC 报告，无法做专项维度诊断';
}

function digestShift(){
  const s=R.shift; if(!s||!s.data.length) return '转化关联诊断：无足够转化数据';
  return `转化关联诊断（高转化词逐日CVR波动 ↔ 搜索词结构变化）：\n`+
    s.data.map(x=>`${x.kw}(${x.conv}转, 新词↔CVR相关r=${(x.rNew==null||isNaN(x.rNew))?'—':x.rNew.toFixed(2)}, 低质量↔CVR相关r=${(x.rLow==null||isNaN(x.rLow))?'—':x.rLow.toFixed(2)})：`+
      (x.conclusions.length?x.conclusions.join('；'):'CVR与搜索词结构变化（新词涌入/低质量占比）未见明显关联')).join('\n');
}

function runModuleAI(mod){
  if(!R){ toast('请先完成分析'); return; }
  /* 离线优先/可选 DeepSeek：无 Key 或用户选择离线 → 本地合成摘要；有 Key 且选 DeepSeek → 调用 API */
  if(!dsReady() || SET.aiMode!=='deepseek'){ runOfflineModule(mod); return; }
  const map={
    overview:{d:digestOverview, q:'请解读该账户本周期整体走势与分日异常，指出最需要立即处理的3件事。'},
    quad:{d:digestQuad, q:'请基于四象限数据给出各象限具体词的调价、匹配方式、否词/暂停建议。'},
    conv:{d:digestConv, q:'请深入分析转化词的分日变化（衰减/新增/波动原因假设）与跨周期变化，给出保量与放量的具体动作。'},
    convDaily:{d:digestConvDaily, q:'请深入分析分日转化关键词的逐日新增/流失/上升/下降变化，重点解读"流失核心词仍在烧钱"的预算泄漏、转化集中度风险，给出保量与防泄漏的具体动作。'},
    query:{d:digestQuery, q:'请评估流量匹配质量，确认否词清单是否合理（指出可能误伤的词），并给出匹配方式收放策略。'},
    creative:{d:digestCreative, q:'请诊断创意结构，为低效创意给出2-3条可直接使用的新标题文案（结合PCB打样行业卖点），并评估高级样式效果。'},
    geo:{d:digestGeo, q:'请给出各省地域出价系数调整的具体建议（如+20%/-30%），并说明依据。'},
    cpa:{d:digestCpa, q:'请基于CPA基准归因结果，逐日解释转化成本异动的根因（关键词/搜索词/创意/预算），并给出针对每个高异动日的可执行修复动作。'},
    shift:{d:digestShift, q:'请解读高转化词CVR波动与搜索词结构变化（新词涌入/低质量占比）的关系，判断转化率波动是否由搜索词变化驱动，并给出针对核心转化词的关键词/否词/匹配方式调整建议。'},
    covar:{d:digestCovar, q:'请基于多变量共变归因结果，逐条解释高转化词/计划波动最可能的驱动变量（创意/高级样式/搜索词结构/排名），并给出验证该假设的下一步动作（如是否需补导出排名字段、是否做A/B创意测试）。强调结论为相关性假设，非因果定论。'},
    diag:{d:digestDiag, q:'请基于维度专项诊断（排名三分支/分时/无效点击/oCPC）结果，逐维度给出可执行调整动作：对"排名掉主导"词给出抢排名幅度建议，对"创意差主导"词给出文案方向，对低效时段给出出价系数调整，对高无效点击日给出排查建议，对oCPC学习期给出保护策略。强调排名为周期汇总、分时/无效/oCPC为账户级，结论须与日度转化数据联合解读。'}
  };
  const m=map[mod];
  if(!m){ toast('未知模块'); return; }
  const digest=m.d(); if(!digest){ toast('该模块暂无数据，无法生成摘要'); return; }
  callDeepSeek(SYS_PROMPT, digest+'\n\n'+m.q, document.getElementById('ai-'+mod));
}
/* 离线模块摘要：本地计算，数据不出本机，无需联网 */
function runOfflineModule(mod){
  const map={ overview:digestOverview, quad:digestQuad, conv:digestConv, convDaily:digestConvDaily, query:digestQuery, creative:digestCreative, geo:digestGeo, cpa:digestCpa, shift:digestShift, covar:digestCovar, diag:digestDiag };
  const f=map[mod]; if(!f) return;
  const el=document.getElementById('ai-'+mod);
  if(!el) return;
  const txt=f(); if(!txt){ toast('该模块暂无数据'); return; }
  el.querySelector('.ai-content').innerHTML=mdLite('# 离线模块摘要（本地计算，数据不出本机）\n\n'+txt);
  el.classList.add('show');
  toast('已生成离线模块摘要（无需联网）');
}
function digestCoverage(){
  if(!R||!R.coverage) return '';
  const cov=R.coverage;
  const tMap={search:'搜索词报告',kw:'关键词报告',grp:'推广组报告',plan:'计划报告',acct:'账户报告',geo:'地域报告',basic:'基础创意报告',adv:'高级创意报告',comp:'创意组件报告',pic:'创意配图报告',hour:'分时报告',invalid:'无效点击报告',ocpc:'oCPC报告',rank:'平均排名(PC/移动)'};
  const ready=cov.modules.filter(m=>m.ready).map(m=>m.name);
  const miss=cov.modules.filter(m=>!m.ready).map(m=>(m.or?'需其一':'需')+m.need.map(t=>tMap[t]||t).join('/')+'→'+m.name);
  const ds=cov.deviceScope||'unknown';
  const dsTxt = ds==='both'?'PC + 移动 混合投放':ds==='pc'?'仅 PC 端':ds==='mobile'?'仅 移动端':(cov.deviceUnknown>0?('未识别设备端（'+cov.deviceUnknown+' 个报告未标设备，建议文件名含「PC/移动」）'):'未识别设备端');
  return `【数据覆盖与诊断工作流】已载入 ${cov.typesPresent.length} 类报告（${cov.typesPresent.map(t=>tMap[t]||t).join('、')}），可运行 ${cov.readyCount}/${cov.total} 个模块（${ready.join('、')}）。`+
    (miss.length?`\n本次缺失数据未运行的模块：${miss.join('；')}——补导对应报告可解锁完整诊断。`:'')+
    (R.noSearch?'\n（当前未提供搜索词报告，核心模块不可用，仅运行了独立维度模块。）':'')+
    `\n设备端识别：${dsTxt}（离线按文件名 / 表头自动识别，无需人工指定）。`;
}
function runGlobalAI(){
  if(!R){ toast('请先完成分析'); return; }
  if(!dsReady() || SET.aiMode!=='deepseek'){ runOfflineGlobal(); return; }
  switchTab(document.querySelector('nav .tab[data-p="p-overview"]'));
  const digest=[digestCoverage(),digestOverview(),digestQuad(),digestConv(),digestConvDaily(),digestQuery(),digestMatchMode(),digestCreative(),digestGeo(),digestCpa(),digestShift(),digestCovar(),digestDiag()].filter(Boolean).join('\n\n----\n\n');
  callDeepSeek(SYS_PROMPT.replace('600字内','1200字内'),
    digest+'\n\n请输出本周期《360搜索推广账户综合诊断周报》：1)整体结论与健康度评分(0-100) 2)转化词深度洞察 3)流量质量与否词策略 4)创意与地域 5)下周期最重要的5个动作(按优先级)。',
    document.getElementById('ai-global'));
}
/* 离线综合摘要：本地计算，数据不出本机，无需联网 */
function runOfflineGlobal(){
  if(!R){ toast('请先完成分析'); return; }
  switchTab(document.querySelector('nav .tab[data-p="p-overview"]'));
  const box=document.getElementById('ai-global');
  if(!box) return;
  const parts=[digestCoverage(),digestOverview(),digestQuad(),digestConv(),digestConvDaily(),digestQuery(),digestMatchMode(),digestCreative(),digestGeo(),digestCpa(),digestShift(),digestCovar(),digestDiag()].filter(Boolean);
  if(R.actions&&R.actions.length){ parts.push('可执行操作清单（P0/P1/P2）：\n'+R.actions.map(a=>'[P'+a.p+']['+a.mod+'] '+a.act).join('\n')); }
  const c=box.querySelector('.ai-content'); if(!c) return;
  c.innerHTML=mdLite('# 离线智能诊断摘要（本地计算，数据不出本机）\n\n'+parts.join('\n\n'));
  box.classList.add('show');
  toast('已生成离线诊断摘要（无需联网）');
}
/* ---------- 离线 / DeepSeek 模式切换 ---------- */
function loadAIMode(){ try{ return localStorage.getItem('sem360_aimode')||''; }catch(e){ return ''; } }
function setAIMode(m){ SET.aiMode=m; try{ localStorage.setItem('sem360_aimode', m); }catch(e){} updateAIModeUI(); }
function updateAIModeUI(){
  const wrap=document.getElementById('aiModeWrap'); if(!wrap) return;
  const btn=document.getElementById('btnGlobalAI');
  if(!dsReady()){ wrap.style.display='none'; SET.aiMode='offline';
    if(btn) btn.textContent='🧠 离线摘要';   /* 无 Key 时按钮仍显示，但须标明实际为离线模式，避免误导 */
    return; }
  wrap.style.display='inline-flex';
  if(!SET.aiMode) SET.aiMode='deepseek';
  const off=document.getElementById('segOffline'), dp=document.getElementById('segDeep');
  if(off) off.classList.toggle('active', SET.aiMode!=='deepseek');
  if(dp) dp.classList.toggle('active', SET.aiMode==='deepseek');
  if(btn) btn.textContent = SET.aiMode==='deepseek'? '🤖 AI诊断' : '🧠 离线摘要';
}

/* ---------- 导出独立HTML报告 ----------
   Bug I 修复（2026-07-28）：旧版 exportReport 模板字符串含 19 个嵌套反引号，
   在某些浏览器解析器下导致 SyntaxError，外部脚本块停止执行 -> 后续函数全部未定义 ->
   浏览器把脚本块里的 exportReport 函数体源代码当成 HTML 文本渲染（用户看到 ${R.period} 等字面量）。
   修复：拆成纯普通字符串数组 .join('')，所有 ${} 表达式改为 + 拼接，彻底消除嵌套反引号。 */
function exportReport(){
  if(!R) return;
  const aiGlobal=document.querySelector('#ai-global .ai-content')?.innerHTML||'';
  const dateHdrs = R.dates.map(d=>'<th>'+d.slice(5)+'</th>').join('');
  const dailyRows = R.daily.map(d=>'<tr><td>'+d.date+'</td><td class="num">¥'+fmt(d.cost)+'</td><td class="num">'+d.clicks+'</td><td class="num">'+d.conv+'</td><td class="num">'+(d.conv?'¥'+fmt(d.cost/d.conv):'—')+'</td></tr>').join('');
  const convKwRows = R.convKws.map(k=>'<tr><td>'+esc(k.kw)+'</td><td class="num">'+k.conv+'</td><td class="num">¥'+fmt(k.cpa)+'</td>'+R.dates.map(d=>'<td class="num">'+(k.byDate[d]||0)+'</td>').join('')+'<td>'+k.status+'</td></tr>').join('');
  const quadRows = ['A','B','C','D'].map(q=>{const l=R.kws.filter(k=>k.quad===q).sort((a,b)=>b.cost-a.cost); return '<tr><td>'+QUAD_META[q].name+'（'+l.length+'个）</td><td>'+l.slice(0,12).map(k=>esc(k.kw)+'(¥'+fmt(k.cost,0)+'/'+k.conv+'转)').join('、')+'</td></tr>';}).join('');
  const geoRows = R.geo.map(g=>'<tr><td>'+esc(g.region)+'</td><td class="num">¥'+fmt(g.cost)+'</td><td class="num">'+pct(g.ctr)+'</td><td class="num">¥'+fmt(g.cpc)+'</td><td>'+g.diag+'：'+esc(g.advice)+'</td></tr>').join('');
  const shiftHtml = (R.shift && R.shift.data.length)? R.shift.data.map(x=>'<b>'+esc(x.kw)+'</b>：'+(x.conclusions.length?esc(x.conclusions.join('；')):'CVR与搜索词结构变化（新词涌入/低质量占比）未见明显关联')).join('<br><br>') : '无足够转化数据';
  const diagParts = [];
  if(R.rank && R.rank.has) diagParts.push('排名三分支(分设备)：'+R.rank.diag.slice(0,15).map(d=>{const p=[];if(d.pc)p.push('PC('+d.pc.dev+')'+d.pc.verdict);if(d.mobile)p.push('移动'+d.mobile.verdict);return esc(d.kw)+'→'+(p.join('/')||(d.primary?d.primary.verdict:''))+(d.primary&&d.primary.weight!=null?('（权重'+d.primary.weight+'）'):'');}).join('；')+'。');
  if(R.hour && R.hour.has) diagParts.push(' 分时低效时段：'+(R.hour.worst.map(o=>o.hour).join('、')||'无')+'。');
  if(R.invalid && R.invalid.has) diagParts.push(' 无效点击过滤比均值'+R.invalid.avgRatio.toFixed(1)+'%（合格线15%）。');
  if(R.ocpc && R.ocpc.has) diagParts.push(' oCPC投放包'+R.ocpc.pkgs.length+'个，'+(R.ocpc.learning?'学习期(约'+R.ocpc.learnDays+'天)保护':'已稳定')+'。');
  if(!(R.rank&&R.rank.has||R.hour&&R.hour.has||R.invalid&&R.invalid.has||R.ocpc&&R.ocpc.has)) diagParts.push('未导入排名/分时/无效点击/oCPC 报告。');
  const actRows = (R.actions||[]).map(a=>'<p><span class="p'+a.p+'">[P'+a.p+']</span> <b>['+a.mod+']</b> '+esc(a.act)+'</p>').join('');
  const html = [
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>360搜索推广诊断报告 '+R.period+'</title>',
    '<style>body{font-family:"Microsoft YaHei",sans-serif;max-width:1000px;margin:0 auto;padding:30px;color:#1f2937;font-size:14px;line-height:1.7}',
    'h1{font-size:22px;border-bottom:3px solid #2563eb;padding-bottom:10px}h2{font-size:17px;margin-top:28px;color:#1d4ed8}',
    'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}th{background:#f3f4f6}',
    '.num{text-align:right}.p0{color:#dc2626;font-weight:700}.p1{color:#d97706;font-weight:700}.p2{color:#2563eb;font-weight:700}',
    '.ai{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px}</sty'+'le></he'+'ad><bo'+'dy>',
    '<h1>360搜索推广效果诊断报告</h1>',
    '<p>分析周期：<b>'+R.period+'</b> ｜ 生成时间：'+new Date().toLocaleString('zh-CN')+'</p>',
    R.coverage?('<h2>〇、数据覆盖与诊断工作流</h2><p>已载入 <b>'+R.coverage.typesPresent.length+'</b> 类报告，可运行 <b>'+R.coverage.readyCount+'/'+R.coverage.total+'</b> 个诊断模块'+(R.noSearch?'（未提供搜索词报告，核心模块不可用）':'')+'。本工具为离线本地分析，数据不出本机；DeepSeek AI 解读为可选增强。</p>'):'',
    '<h2>一、账户总览</h2>',
    '<table><tr><th>消费</th><th>展示</th><th>点击</th><th>CTR</th><th>转化</th><th>CPA</th></tr>',
    '<tr><td>¥'+fmt(R.tot.cost)+'</td><td>'+fmt0(R.tot.shows)+'</td><td>'+fmt0(R.tot.clicks)+'</td><td>'+pct(R.tot.ctr)+'</td><td>'+R.tot.conv+'</td><td>'+(R.tot.conv?'¥'+fmt(R.tot.cpa):'—')+'</td></tr></table>',
    '<table><tr><th>日期</th><th class="num">消费</th><th class="num">点击</th><th class="num">转化</th><th class="num">CPA</th></tr>',
    dailyRows, '</table>',
    (R.convValue>0||R.rev>0)?('<h2>一之二、转化价值与投产比</h2><table><tr><th>转化价值(收入)</th><th>ROAS</th><th>价值加权CPA</th></tr><tr><td>\u00a5'+fmt(R.rev)+'</td><td>'+fmt(R.roas,2)+'</td><td>'+(R.valueCPA?'\u00a5'+fmt(R.valueCPA):'\u2014')+'</td></tr></table><p style="color:#6b7280;font-size:12px">价值数据来源：'+(R.valueMode==='column'?'CSV\u300c\u8f6c\u5316\u91d1\u989d/\u8f6c\u5316\u4ef7\u503c\u300d\u5217':'\u7edf\u4e00\u5ba2\u5355\u4ef7 \u00a5'+fmt(R.convValue)+' \u00d7 \u8f6c\u5316\u6570')+'</p>'):'',
    '<h2>二、转化词分日矩阵</h2>',
    '<table><tr><th>关键词</th><th class="num">转化</th><th class="num">CPA</th>'+dateHdrs+'<th>状态</th></tr>',
    convKwRows, '</table>',
    '<h2>三、关键词四象限</h2>',
    '<table><tr><th>象限</th><th>关键词（TOP）</th></tr>', quadRows, '</table>',
    '<h2>四、建议否词（'+R.negList.length+'个）</h2>',
    '<p>'+(R.negList.map(q=>esc(q.query)).join('、')||'无')+'</p>',
    '<h2>五、建议加词</h2>',
    '<p>'+(R.addList.map(q=>esc(q.query)+(q.conv?'('+q.conv+'转)':'')).join('、')||'无')+'</p>',
    '<h2>六、地域诊断</h2>',
    '<table><tr><th>省份</th><th class="num">消费</th><th class="num">CTR</th><th class="num">CPC</th><th>诊断</th></tr>',
    geoRows, '</table>',
    '<h2>六之二、转化关联诊断</h2>',
    '<p>'+shiftHtml+'</p>',
    '<h2>六之三、维度专项诊断（v6）</h2>',
    '<p>'+diagParts.join('')+'</p>',
    '<h2>七、操作清单（'+R.actions.length+'条）</h2>',
    actRows,
    aiGlobal?('<h2>八、DeepSeek AI 综合诊断</h2><div class="ai">'+aiGlobal+'</div>'):'',
    '<p style="color:#9ca3af;margin-top:30px">由 360搜索推广效果评估分析系统 生成</p></bo'+'dy></ht'+'ml>'
  ].join('');
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='360推广诊断报告_'+R.period.replace(/至/,'_')+'.html';
  a.click(); URL.revokeObjectURL(a.href);
  toast('报告已导出下载');
}

/* ============ PDF 报告导出（新标签页 + 浏览器打印为PDF） ============ */
function exportPDFReport(){
  if(!R) return;
  function escH(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  /* 捕获所有 canvas 图表为图片 */
  function canvasToImg(cv,w,h){
    if(!cv||!cv.getContext) return '';
    try{ return '<img src="'+cv.toDataURL('image/png')+'" style="max-width:100%;width:'+(w||700)+'px;height:auto;display:block;margin:8px 0">'; }
    catch(e){ return '<p style="color:#999">[图表渲染失败]</p>'; }
  }
  var charts={daily:'',geo:'',cpa:''};
  var cvDaily=document.getElementById('chartDaily');
  if(cvDaily) charts.daily=canvasToImg(cvDaily,700,190);
  var cvGeo=document.getElementById('chartGeo');
  if(cvGeo) charts.geo=canvasToImg(cvGeo,700,200);
  var cvCpa=document.getElementById('chartCpa');
  if(cvCpa) charts.cpa=canvasToImg(cvCpa,700,190);

  /* 构建封面数据 */
  var p0=R.actions.filter(function(a){return a.p===0;}).length;
  var p1=R.actions.filter(function(a){return a.p===1;}).length;
  var p2=R.actions.filter(function(a){return a.p===2;}).length;
  var coreKws=R.coreKws||[];
  var coreConvTotal=0;
  if(coreKws.length && R.convKws && R.tot.conv>0){
    for(var _i=0;_i<coreKws.length;_i++){
      var _cf=R.convKws.find(function(k){return k.kw===coreKws[_i];});
      if(_cf) coreConvTotal+=_cf.conv||0;
    }
  }
  var coreConvPctVal = R.tot.conv>0 ? coreConvTotal/R.tot.conv : 0;
  var topKw=coreKws.slice(0,8).map(function(k){return escH(k);}).join('\u3001');

  /* 四象限数据 */
  var quadRows=['A','B','C','D'].map(function(q){
    var l=R.kws.filter(function(k){return k.quad===q;}).sort(function(a,b){return b.cost-a.cost;});
    return '<tr><td><b>'+QUAD_META[q].name+'</b>\uff08'+l.length+'\u4e2a\uff09</td><td style="font-size:11px">'+l.slice(0,12).map(function(k){return escH(k.kw)+'(\xa5'+fmt(k.cost,0)+'/'+k.conv+'\u8f6c)';}).join('\u3001')+'</td></tr>';
  }).join('');

  /* 地域表 */
  var geoRows=R.geo.map(function(g){
    var diagCls=g.diag==='\u6269\u91cf'?'color:#0a7c45':g.diag==='\u964d\u4ef7'?'color:#9a5b00':g.diag==='\u6536\u7f29'?'color:#c53035':'color:#666';
    return '<tr><td>'+escH(g.region)+'</td><td>\xa5'+fmt(g.cost)+'</td><td>'+pct(g.ctr)+'</td><td>\xa5'+fmt(g.cpc)+'</td><td style="'+diagCls+'"><b>'+g.diag+'</b>\uff1a'+escH(g.advice)+'</td></tr>';
  }).join('');

  /* 操作清单 */
  var actRows=R.actions.map(function(a){
    var sevCls=a.p===0?'color:#dc2626;font-weight:700':a.p===1?'color:#d97706;font-weight:700':'color:#2563eb;font-weight:700';
    return '<tr><td style="'+sevCls+'">P'+a.p+'</td><td>'+escH(a.mod)+'</td><td>'+escH(a.act)+'</td></tr>';
  }).join('');

  /* 否词清单 */
  var negText=R.negList.length?R.negList.map(function(q){return escH(q.query);}).join('\u3001'):'\u65e0';

  /* 维度专项 */
  var diagText=[];
  if(R.rank&&R.rank.has) diagText.push('\u300a\u6392\u540d\u4e09\u5206\u652f\u8bca\u65ad\u300b\uff1a'+R.rank.diag.slice(0,12).map(function(d){
    var parts=[];if(d.pc) parts.push('PC('+d.pc.dev+')'+d.pc.verdict);if(d.mobile) parts.push('\u79fb\u52a8'+d.mobile.verdict);
    return escH(d.kw)+'\u2192'+(parts.join('/')||(d.primary?d.primary.verdict:''));
  }).join('\uff1b'));
  if(R.hour&&R.hour.has){
    var worstH=(R.hour.worst||[]).slice(0,4).map(function(o){return o.hour+':00(\u7cfb\u6570'+o.bidMult+')';}).join('\u3001');
    diagText.push('\u300a\u5206\u65f6\u6548\u7387\u300b\uff1a\u4f4e\u6548\u65f6\u6bb5\uff1a'+worstH);
  }
  if(R.invalid&&R.invalid.has) diagText.push('\u300a\u65e0\u6548\u70b9\u51fb\u300b\uff1a\u8fc7\u6ee4\u6bd4\u5747\u503c'+R.invalid.avgRatio.toFixed(1)+'%\uff08\u5408\u683c\u7ebf15%\uff09\u3002\u8d85\u6807\u5929\u6570\uff1a'+(R.invalid.flags||[]).length+'\u5929');
  if(R.ocpc&&R.ocpc.has) diagText.push('\u300aoCPC\u300b\uff1a'+R.ocpc.pkgs.length+'\u4e2a\u6295\u653e\u5305\uff0c'+(R.ocpc.learning?'\u5904\u4e8e\u5b66\u4e60\u671f(\u7ea6'+R.ocpc.learnDays+'\u5929)\u4e0d\u5b9c\u9891\u7e41\u8c03\u6574':'\u6a21\u578b\u5df2\u7a33\u5b9a'));
  if(!(R.rank&&R.rank.has||R.hour&&R.hour.has||R.invalid&&R.invalid.has||R.ocpc&&R.ocpc.has)) diagText.push('\u672a\u5bfc\u5165\u6392\u540d/\u5206\u65f6/\u65e0\u6548\u70b9\u51fb/oCPC \u62a5\u544a\u3002');

  /* 转化词日度追踪 */
  var convDailyText='';
  if(R.convDaily&&R.convDaily.has){
    var cd=R.convDaily;
    /* Bug #1 修复：字段名应为 avgDailyConvKw（非 avgActiveKw），日均转化为 daily 数组推算 */
    var avgDailyConv = cd.daily && cd.daily.length ? cd.daily.reduce(function(s,x){return s+(x.totalConv||0);},0)/cd.daily.length : 0;
    convDailyText='<p>\u8f6c\u5316\u8bcd\u65e5\u5747 '+fmt(cd.avgDailyConvKw,1)+' \u4e2a\uff0c\u65e5\u5747\u8f6c\u5316 '+fmt(avgDailyConv,1)+' \u6b21\u3002';
    if(cd.lostStillSpending&&cd.lostStillSpending.length) convDailyText+='\u26a0\ufe0f \u6d41\u5931\u6838\u5fc3\u8bcd\u4ecd\u5728\u70e7\u94b1('+cd.lostStillSpending.length+'\u4e2a)\uff1a'+cd.lostStillSpending.slice(0,8).map(function(c){return escH(c.kw)+'(\u8fd13\u65e5\xa5'+fmt(c.recentCost)+'/'+c.daysSinceConv+'\u65e5\u65e0\u8f6c\u5316)';}).join('\u3001')+'</p>';
  }

  /* 波动归因摘要 */
  var covarText='';
  if(R.covar&&R.covar.hasAnchor){
    var units=R.covar.units.slice(0,8);
    covarText='<p>'+R.covar.note+'</p>';
    covarText+='<p>\u5173\u8054\u5355\u5143\u793a\u4f8b\uff1a'+units.map(function(u){
      return escH(u.scope+':'+u.target)+' \u2192 '+(u.drivers||[]).slice(0,3).map(function(d){return d.dim+' r='+d.r.toFixed(2)+d.dir+'('+d.strength+')';}).join('\uff1b');
    }).join('<br>')+'</p>';
  }

  /* 拼装完整 PDF 页面 */
  var aiGlobalEl=document.querySelector('#ai-global .ai-content');
  var aiHtml=aiGlobalEl?aiGlobalEl.innerHTML:'';

  var html='<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'+
    '<title>360\u641c\u7d22\u63a8\u5e7f\u8bca\u65ad\u62a5\u544a '+escH(R.period)+'</title>'+
    '<style>'+
    '*{margin:0;padding:0;box-sizing:border-box}'+
    'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;max-width:960px;margin:0 auto;padding:30px 36px;color:#1a1a2e;font-size:13px;line-height:1.72}'+
    '.cover{text-align:center;padding:40px 20px 20px;border-bottom:3px solid #2563eb;margin-bottom:24px}'+
    '.cover h1{font-size:26px;color:#1a1a2e;margin-bottom:10px}'+
    '.cover .meta{font-size:14px;color:#666}'+
    '.cover .logo-row{display:flex;justify-content:center;gap:16px;margin:20px 0}'+
    '.cover .stat-box{display:inline-block;text-align:center;padding:12px 20px;border-radius:10px;background:#f0f4ff;border:1px solid #d0d8f0}'+
    '.cover .stat-box .num{font-size:28px;font-weight:800;color:#2563eb}'+
    '.cover .stat-box .lbl{font-size:11px;color:#888;margin-top:2px}'+
    '.pg-h{font-size:19px;font-weight:700;color:#1d4ed8;border-left:4px solid #2563eb;padding-left:12px;margin:28px 0 14px;page-break-before:always}'+
    '.pg-h:first-of-type{page-break-before:avoid}'+
    '.pg-sub{font-size:15px;font-weight:700;color:#374151;margin:18px 0 8px}'+
    'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}'+
    'th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}'+
    'th{background:#f3f4f6;font-weight:700;color:#374151;font-size:11px;text-transform:uppercase;letter-spacing:.03em}'+
    '.num{text-align:right;font-variant-numeric:tabular-nums}'+
    '.kpi-row{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}'+
    '.kpi-item{flex:1;min-width:120px;padding:14px 16px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb}'+
    '.kpi-item .v{font-size:24px;font-weight:800;margin:4px 0}'+
    '.kpi-item .l{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em}'+
    '.kpi-item .s{font-size:11px;color:#aaa}'+
    '.alert{border-left:4px solid #f59e0b;background:#fffbeb;padding:12px 16px;margin:10px 0;border-radius:0 8px 8px 0}'+
    '.alert.danger{border-left-color:#dc2626;background:#fef2f2}'+
    '.alert.info{border-left-color:#2563eb;background:#eff6ff}'+
    '.alert.ok{border-left-color:#10b981;background:#f0fdf4}'+
    '.pg-footer{text-align:center;color:#9ca3af;font-size:11px;margin-top:36px;padding-top:18px;border-top:1px solid #e5e7eb}'+
    'img.chart{max-width:100%;height:auto;display:block;margin:10px 0}'+
    '@media print{'+
    '  body{font-size:10pt}'+
    '  .pg-h{font-size:14pt;page-break-before:always}'+
    '  .pg-h:first-of-type{page-break-before:avoid}'+
    '  table{font-size:9pt}'+
    '  th{font-size:8pt}'+
    '}'+
    '</style></head><body>'+
    /* ========== 封面 ========== */
    '<div class="cover">'+
    '<h1>360\u641c\u7d22\u63a8\u5e7f\u00b7\u6548\u679c\u8bca\u65ad\u62a5\u544a</h1>'+
    '<p class="meta">\u5206\u6790\u5468\u671f\uff1a<b>'+escH(R.period)+'</b> \uff5c \u751f\u6210\u65f6\u95f4\uff1a'+new Date().toLocaleString('zh-CN')+'</p>'+
    '<div class="logo-row">'+
    '<div class="stat-box"><div class="num">\xa5'+fmt(R.tot.cost,0)+'</div><div class="lbl">\u603b\u6d88\u8d39</div></div>'+
    '<div class="stat-box"><div class="num">'+R.tot.conv+'</div><div class="lbl">\u603b\u8f6c\u5316</div></div>'+
    '<div class="stat-box"><div class="num">\xa5'+(R.tot.conv?fmt(R.tot.cpa):'\u2014')+'</div><div class="lbl">\u8f6c\u5316\u6210\u672c CPA</div></div>'+
    '<div class="stat-box"><div class="num">'+R.dates.length+'</div><div class="lbl">\u5206\u6790\u5929\u6570</div></div>'+
    '</div>'+
    (R.coverage?'<p style="font-size:12px;color:#888;margin-top:8px">\u5df2\u8f7d\u5165 <b>'+R.coverage.typesPresent.length+'</b> \u7c7b\u62a5\u544a \uff5c \u53ef\u8fd0\u884c <b>'+R.coverage.readyCount+'/'+R.coverage.total+'</b> \u4e2a\u8bca\u65ad\u6a21\u5757 \uff5c \u8bbe\u5907\uff1a'+(R.coverage.deviceScope||'\u672a\u8bc6\u522b')+'</p>':'')+
    '</div>'+

    /* ========== 一、数据总览 ========== */
    '<div class="pg-h">\u4e00\u3001\u6570\u636e\u603b\u89c8</div>'+
    '<div class="kpi-row">'+
    '<div class="kpi-item"><div class="l">\u6d88\u8d39</div><div class="v">\xa5'+fmt(R.tot.cost,0)+'</div><div class="s">\u5c55\u793a '+fmt0(R.tot.shows)+' \u6b21</div></div>'+
    '<div class="kpi-item"><div class="l">\u70b9\u51fb</div><div class="v">'+fmt0(R.tot.clicks)+'</div><div class="s">CTR '+pct(R.tot.ctr)+'</div></div>'+
    '<div class="kpi-item"><div class="l">\u8f6c\u5316</div><div class="v">'+R.tot.conv+'</div><div class="s">CPA \xa5'+(R.tot.conv?fmt(R.tot.cpa):'\u2014')+'</div></div>'+
    '<div class="kpi-item"><div class="l">\u8bca\u65ad\u64cd\u4f5c</div><div class="v">'+(R.actions||[]).length+'</div><div class="s">P0:'+p0+' P1:'+p1+' P2:'+p2+'</div></div>'+
    '</div>'+
    /* 分日趋势表 */
    '<div class="pg-sub">\u25b6 \u5206\u65e5\u8d8b\u52bf</div>'+
    '<table><tr><th>\u65e5\u671f</th><th class="num">\u6d88\u8d39</th><th class="num">\u70b9\u51fb</th><th class="num">\u8f6c\u5316</th><th class="num">CPA</th></tr>'+
    R.daily.map(function(d){return '<tr><td>'+d.date+'</td><td class="num">\xa5'+fmt(d.cost)+'</td><td class="num">'+d.clicks+'</td><td class="num">'+d.conv+'</td><td class="num">'+(d.conv?'\xa5'+fmt(d.cost/d.conv):'\u2014')+'</td></tr>';}).join('')+
    '</table>'+
    /* 趋势图 */
    charts.daily+
    /* 核心转化词 */
    (topKw?'<div class="pg-sub">\u25b6 \u6838\u5fc3\u8f6c\u5316\u8bcd</div><p>'+topKw+'\uff08\u5171 '+coreKws.length+'\u4e2a\uff0c\u8d21\u732e '+pct(coreConvPctVal,1)+' \u8f6c\u5316\uff09</p>':'')+

    /* ========== 二、关键词四象限 ========== */
    '<div class="pg-h">\u4e8c\u3001\u5173\u952e\u8bcd\u56db\u8c61\u9650</div>'+
    '<table><tr><th>\u8c61\u9650</th><th>\u5173\u952e\u8bcd\uff08TOP\uff09</th></tr>'+quadRows+'</table>'+

    /* ========== 三、转化词分日矩阵 ========== */
    '<div class="pg-h">\u4e09\u3001\u8f6c\u5316\u8bcd\u5206\u65e5\u77e9\u9635</div>'+
    '<table><tr><th>\u5173\u952e\u8bcd</th><th class="num">\u8f6c\u5316</th><th class="num">CPA</th>'+R.dates.map(function(d){return '<th>'+d.slice(5)+'</th>';}).join('')+'<th>\u72b6\u6001</th></tr>'+
    R.convKws.map(function(k){return '<tr><td>'+escH(k.kw)+'</td><td class="num">'+k.conv+'</td><td class="num">\xa5'+fmt(k.cpa)+'</td>'+R.dates.map(function(d){return '<td class="num">'+(k.byDate[d]||0)+'</td>';}).join('')+'<td>'+k.status+'</td></tr>';}).join('')+
    '</table>'+

    /* ========== 四、搜索词匹配 ========== */
    '<div class="pg-h">\u56db\u3001\u641c\u7d22\u8bcd\u5339\u914d\u5ea6</div>'+
    '<div class="alert danger">\u26a0\ufe0f \u5426\u8bcd\u5efa\u8bae\uff08'+R.negList.length+'\u4e2a\uff09\uff1a'+negText+'</div>'+
    '<div class="alert info">\u2795 \u52a0\u8bcd\u5efa\u8bae\uff1a'+(R.addList.length?R.addList.map(function(q){return escH(q.query)+(q.conv?'('+q.conv+'\u8f6c)':'');}).join('\u3001'):'\u65e0')+'</div>'+

    /* ========== 五、地域诊断 ========== */
    '<div class="pg-h">\u4e94\u3001\u5730\u57df\u6295\u653e\u6548\u7387</div>'+
    charts.geo+
    '<table><tr><th>\u5730\u57df</th><th class="num">\u6d88\u8d39</th><th class="num">CTR</th><th class="num">CPC</th><th>\u8bca\u65ad\u4e0e\u5efa\u8bae</th></tr>'+geoRows+'</table>'+

    /* ========== 六、转化词日度追踪 ========== */
    (convDailyText?'<div class="pg-h">\u516d\u3001\u8f6c\u5316\u8bcd\u65e5\u5ea6\u8ffd\u8e2a</div>'+convDailyText:'')+

    /* ========== 七、波动归因 ========== */
    (covarText?'<div class="pg-h">\u4e03\u3001\u6ce2\u52a8\u5f52\u56e0\u00b7\u591a\u53d8\u91cf\u5171\u53d8</div>'+covarText:'')+

    /* ========== 八、维度专项 ========== */
    '<div class="pg-h">\u516b\u3001\u7ef4\u5ea6\u4e13\u9879\u8bca\u65ad</div>'+
    '<div style="font-size:12px;line-height:1.8">'+diagText.map(function(t){return '<p style="margin:6px 0">'+t+'</p>';}).join('')+'</div>'+

    /* ========== 九、CPA 基准归因 ========== */
    (R.cpa&&R.cpa.factors&&R.cpa.factors.length?'<div class="pg-h">\u4e5d\u3001CPA \u57fa\u51c6\u5f52\u56e0</div>'+charts.cpa+'':'');

  /* ========== 十、操作清单 ========== */
  if(R.actions.length){
    html+='<div class="pg-h">\u5341\u3001\u4f18\u5316\u64cd\u4f5c\u6e05\u5355\uff08'+R.actions.length+'\u6761\uff09</div>'+
    '<table><tr><th>\u4f18\u5148\u7ea7</th><th>\u6a21\u5757</th><th>\u64cd\u4f5c\u5efa\u8bae</th></tr>'+actRows+'</table>';
  }

  /* ========== AI 诊断 ========== */
  if(aiHtml){
    html+='<div class="pg-h">\u9644\u5f55\u3001DeepSeek AI \u7efc\u5408\u8bca\u65ad</div>'+
    '<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px 20px;font-size:13px;line-height:1.8">'+aiHtml+'</div>';
  }

  html+='<div class="pg-footer">\u7531 360\u641c\u7d22\u63a8\u5e7f\u6548\u679c\u8bc4\u4f30\u5206\u6790\u7cfb\u7edf \u751f\u6210 \uff5c \u7eaf\u672c\u5730\u79bb\u7ebf\u8fd0\u884c \uff5c \u6570\u636e\u4e0d\u51fa\u672c\u673a</div>'+
    '</body></html>';

  /* 打开新窗口并触发打印（用户可另存为 PDF） */
  var w=window.open('','_blank','width=1000,height=700');
  if(!w){ toast('\u5f39\u7a97\u88ab\u62e6\u622a\uff0c\u8bf7\u5141\u8bb8\u5f39\u7a97\u540e\u91cd\u8bd5'); return; }
  w.document.write(html);
  w.document.close();
  /* 等页面渲染完成后触发打印 */
  setTimeout(function(){
    try{ w.print(); }catch(e){ toast('PDF\u6253\u5370\u5931\u8d25\uff0c\u8bf7\u5728\u65b0\u7a97\u53e3\u624b\u52a8 Ctrl+P \u6253\u5370\u4e3a PDF'); }
  },800);
  toast('PDF\u62a5\u544a\u5df2\u6253\u5f00\u2014\u2014\u8bf7\u5728\u6253\u5370\u5bf9\u8bdd\u6846\u4e2d\u9009\u62e9\u300c\u53e6\u5b58\u4e3a PDF\u300d');
}

