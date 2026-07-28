/* ============ DeepSeek AI 辅助分析 & 报告导出 ============ */
function dsReady(){ return SET.dsKey && SET.dsKey.startsWith('sk-'); }

async function callDeepSeek(systemPrompt, userPrompt, targetEl){
  const box=targetEl; box.classList.add('show');
  const content=box.querySelector('.ai-content');
  content.innerHTML='<span class="loading-dot"></span>';
  try{
    const resp=await fetch(SET.dsUrl||'https://api.deepseek.com/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+SET.dsKey},
      body:JSON.stringify({model:SET.dsModel||'deepseek-chat',
        messages:[{role:'system',content:systemPrompt},{role:'user',content:userPrompt}],
        temperature:0.3, max_tokens:2500})
    });
    if(!resp.ok){ const t=await resp.text(); throw new Error('API '+resp.status+'：'+t.slice(0,200)); }
    const data=await resp.json();
    const text=data.choices?.[0]?.message?.content||'（无返回内容）';
    content.innerHTML=mdLite(text);
  }catch(e){
    content.innerHTML='<span style="color:var(--red)">调用失败：'+esc(e.message)+'。请检查 API Key、网络（需联网）或稍后重试。</span>';
  }
}
/* 轻量markdown渲染 */
function mdLite(t){
  let h=esc(t);
  h=h.replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>');
  h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/^\s*[-•] (.*)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, m=>'<ul>'+m+'</ul>');
  h=h.replace(/^\s*(\d+)[.、] (.*)$/gm,'<li>$2</li>');
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
    s.data.map(x=>`${x.kw}(${x.conv}转, 新词↔CVR相关r=${isNaN(x.rNew)?'—':x.rNew.toFixed(2)}, 低质量↔CVR相关r=${isNaN(x.rLow)?'—':x.rLow.toFixed(2)})：`+
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
  callDeepSeek(SYS_PROMPT, m.d()+'\n\n'+m.q, document.getElementById('ai-'+mod));
}
/* 离线模块摘要：本地计算，数据不出本机，无需联网 */
function runOfflineModule(mod){
  const map={ overview:digestOverview, quad:digestQuad, conv:digestConv, convDaily:digestConvDaily, query:digestQuery, creative:digestCreative, geo:digestGeo, cpa:digestCpa, shift:digestShift, covar:digestCovar, diag:digestDiag };
  const f=map[mod]; if(!f) return;
  const el=document.getElementById('ai-'+mod);
  if(!el) return;
  el.querySelector('.ai-content').innerHTML=mdLite('# 离线模块摘要（本地计算，数据不出本机）\n\n'+f());
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
  const digest=[digestCoverage(),digestOverview(),digestQuad(),digestConv(),digestConvDaily(),digestQuery(),digestCreative(),digestGeo(),digestCpa(),digestShift(),digestCovar(),digestDiag()].filter(Boolean).join('\n\n----\n\n');
  callDeepSeek(SYS_PROMPT.replace('600字内','1200字内'),
    digest+'\n\n请输出本周期《360搜索推广账户综合诊断周报》：1)整体结论与健康度评分(0-100) 2)转化词深度洞察 3)流量质量与否词策略 4)创意与地域 5)下周期最重要的5个动作(按优先级)。',
    document.getElementById('ai-global'));
}
/* 离线综合摘要：本地计算，数据不出本机，无需联网 */
function runOfflineGlobal(){
  if(!R){ toast('请先完成分析'); return; }
  switchTab(document.querySelector('nav .tab[data-p="p-overview"]'));
  const box=document.getElementById('ai-global');
  const parts=[digestCoverage(),digestOverview(),digestQuad(),digestConv(),digestConvDaily(),digestQuery(),digestMatchMode(),digestCreative(),digestGeo(),digestCpa(),digestShift(),digestCovar(),digestDiag()].filter(Boolean);
  if(R.actions&&R.actions.length){ parts.push('可执行操作清单（P0/P1/P2）：\n'+R.actions.map(a=>'[P'+a.p+']['+a.mod+'] '+a.act).join('\n')); }
  box.querySelector('.ai-content').innerHTML=mdLite('# 离线智能诊断摘要（本地计算，数据不出本机）\n\n'+parts.join('\n\n'));
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
  if(R.rank && R.rank.has) diagParts.push('排名三分支(分设备)：'+R.rank.diag.slice(0,15).map(d=>{const p=[];if(d.pc)p.push('PC('+d.pc.dev+')'+d.pc.verdict);if(d.mobile)p.push('移动'+d.mobile.verdict);return esc(d.kw)+'→'+(p.join('/')||(d.primary?d.primary.verdict:''))+'（权重'+(d.primary?d.primary.weight:d.weight)+'）';}).join('；')+'。');
  if(R.hour && R.hour.has) diagParts.push(' 分时低效时段：'+(R.hour.worst.map(o=>o.hour).join('、')||'无')+'。');
  if(R.invalid && R.invalid.has) diagParts.push(' 无效点击过滤比均值'+R.invalid.avgRatio.toFixed(1)+'%（合格线15%）。');
  if(R.ocpc && R.ocpc.has) diagParts.push(' oCPC投放包'+R.ocpc.pkgs.length+'个，'+(R.ocpc.learning?'学习期(约'+R.ocpc.learnDays+'天)保护':'已稳定')+'。');
  if(!(R.rank&&R.rank.has||R.hour&&R.hour.has||R.invalid&&R.invalid.has||R.ocpc&&R.ocpc.has)) diagParts.push('未导入排名/分时/无效点击/oCPC 报告。');
  const actRows = R.actions.map(a=>'<p><span class="p'+a.p+'">[P'+a.p+']</span> <b>['+a.mod+']</b> '+esc(a.act)+'</p>').join('');
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

