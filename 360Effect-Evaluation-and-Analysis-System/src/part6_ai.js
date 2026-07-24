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
function digestQuery(){
  const lo=R.queries.filter(q=>q.level==='低');
  return `搜索词匹配度：高${R.queries.filter(q=>q.level==='高').length}组/中${R.queries.filter(q=>q.level==='中').length}组/低${lo.length}组，低匹配消费¥${fmt(lo.reduce((s,q)=>s+q.cost,0))}
建议否词TOP20：${R.negList.slice(0,20).map(q=>`${q.query}(¥${fmt(q.cost)},经${q.kw})`).join('、')}
建议加词：${R.addList.map(q=>`${q.query}(${q.conv}转,CTR${pct(q.shows?q.clicks/q.shows:0,1)})`).join('、')}
触发模式匹配质量：${R.modeStats.map(m=>`${m.mode}:均分${Math.round(m.avgScore)}/消费¥${fmt(m.cost)}/转化${m.conv}`).join('；')}`;
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
function digestShift(){
  const s=R.shift; if(!s||!s.data.length) return '转化关联诊断：无足够转化数据';
  return `转化关联诊断（高转化词逐日CVR波动 ↔ 搜索词结构变化）：\n`+
    s.data.map(x=>`${x.kw}(${x.conv}转, 新词↔CVR相关r=${isNaN(x.rNew)?'—':x.rNew.toFixed(2)}, 低质量↔CVR相关r=${isNaN(x.rLow)?'—':x.rLow.toFixed(2)})：`+
      (x.conclusions.length?x.conclusions.join('；'):'CVR与搜索词结构变化（新词涌入/低质量占比）未见明显关联')).join('\n');
}

function runModuleAI(mod){
  if(!R){ toast('请先完成分析'); return; }
  if(!dsReady()){ toast('请先在「参数设置」填入 DeepSeek API Key'); openSettings(); return; }
  const map={
    overview:{d:digestOverview, q:'请解读该账户本周期整体走势与分日异常，指出最需要立即处理的3件事。'},
    quad:{d:digestQuad, q:'请基于四象限数据给出各象限具体词的调价、匹配方式、否词/暂停建议。'},
    conv:{d:digestConv, q:'请深入分析转化词的分日变化（衰减/新增/波动原因假设）与跨周期变化，给出保量与放量的具体动作。'},
    query:{d:digestQuery, q:'请评估流量匹配质量，确认否词清单是否合理（指出可能误伤的词），并给出匹配方式收放策略。'},
    creative:{d:digestCreative, q:'请诊断创意结构，为低效创意给出2-3条可直接使用的新标题文案（结合PCB打样行业卖点），并评估高级样式效果。'},
    geo:{d:digestGeo, q:'请给出各省地域出价系数调整的具体建议（如+20%/-30%），并说明依据。'},
    cpa:{d:digestCpa, q:'请基于CPA基准归因结果，逐日解释转化成本异动的根因（关键词/搜索词/创意/预算），并给出针对每个高异动日的可执行修复动作。'},
    shift:{d:digestShift, q:'请解读高转化词CVR波动与搜索词结构变化（新词涌入/低质量占比）的关系，判断转化率波动是否由搜索词变化驱动，并给出针对核心转化词的关键词/否词/匹配方式调整建议。'}
  };
  const m=map[mod];
  callDeepSeek(SYS_PROMPT, m.d()+'\n\n'+m.q, document.getElementById('ai-'+mod));
}
function runGlobalAI(){
  if(!R){ toast('请先完成分析'); return; }
  if(!dsReady()){ toast('请先在「参数设置」填入 DeepSeek API Key'); openSettings(); return; }
  switchTab(document.querySelector('nav .tab[data-p="p-overview"]'));
  const digest=[digestOverview(),digestQuad(),digestConv(),digestQuery(),digestCreative(),digestGeo(),digestCpa(),digestShift()].join('\n\n----\n\n');
  callDeepSeek(SYS_PROMPT.replace('600字内','1200字内'),
    digest+'\n\n请输出本周期《360搜索推广账户综合诊断周报》：1)整体结论与健康度评分(0-100) 2)转化词深度洞察 3)流量质量与否词策略 4)创意与地域 5)下周期最重要的5个动作(按优先级)。',
    document.getElementById('ai-global'));
}

/* ---------- 导出独立HTML报告 ---------- */
function exportReport(){
  if(!R) return;
  const aiGlobal=document.querySelector('#ai-global .ai-content')?.innerHTML||'';
  const html=`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>360搜索推广诊断报告 ${R.period}</title>
<style>body{font-family:"Microsoft YaHei",sans-serif;max-width:1000px;margin:0 auto;padding:30px;color:#1f2937;font-size:14px;line-height:1.7}
h1{font-size:22px;border-bottom:3px solid #2563eb;padding-bottom:10px}h2{font-size:17px;margin-top:28px;color:#1d4ed8}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}th{background:#f3f4f6}
.num{text-align:right}.p0{color:#dc2626;font-weight:700}.p1{color:#d97706;font-weight:700}.p2{color:#2563eb;font-weight:700}
.ai{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px}</style></head><body>
<h1>360搜索推广效果诊断报告</h1>
<p>分析周期：<b>${R.period}</b> ｜ 生成时间：${new Date().toLocaleString('zh-CN')}</p>
<h2>一、账户总览</h2>
<table><tr><th>消费</th><th>展示</th><th>点击</th><th>CTR</th><th>转化</th><th>CPA</th></tr>
<tr><td>¥${fmt(R.tot.cost)}</td><td>${fmt0(R.tot.shows)}</td><td>${fmt0(R.tot.clicks)}</td><td>${pct(R.tot.ctr)}</td><td>${R.tot.conv}</td><td>${R.tot.conv?'¥'+fmt(R.tot.cpa):'—'}</td></tr></table>
<table><tr><th>日期</th><th class="num">消费</th><th class="num">点击</th><th class="num">转化</th><th class="num">CPA</th></tr>
${R.daily.map(d=>`<tr><td>${d.date}</td><td class="num">¥${fmt(d.cost)}</td><td class="num">${d.clicks}</td><td class="num">${d.conv}</td><td class="num">${d.conv?'¥'+fmt(d.cost/d.conv):'—'}</td></tr>`).join('')}</table>
<h2>二、转化词分日矩阵</h2>
<table><tr><th>关键词</th><th class="num">转化</th><th class="num">CPA</th>${R.dates.map(d=>`<th>${d.slice(5)}</th>`).join('')}<th>状态</th></tr>
${R.convKws.map(k=>`<tr><td>${esc(k.kw)}</td><td class="num">${k.conv}</td><td class="num">¥${fmt(k.cpa)}</td>${R.dates.map(d=>`<td class="num">${k.byDate[d]||0}</td>`).join('')}<td>${k.status}</td></tr>`).join('')}</table>
<h2>三、关键词四象限</h2>
<table><tr><th>象限</th><th>关键词（TOP）</th></tr>
${['A','B','C','D'].map(q=>{const l=R.kws.filter(k=>k.quad===q).sort((a,b)=>b.cost-a.cost);return `<tr><td>${QUAD_META[q].name}（${l.length}个）</td><td>${l.slice(0,12).map(k=>esc(k.kw)+'(¥'+fmt(k.cost,0)+'/'+k.conv+'转)').join('、')}</td></tr>`;}).join('')}</table>
<h2>四、建议否词（${R.negList.length}个）</h2>
<p>${R.negList.map(q=>esc(q.query)).join('、')||'无'}</p>
<h2>五、建议加词</h2>
<p>${R.addList.map(q=>esc(q.query)+(q.conv?'('+q.conv+'转)':'')).join('、')||'无'}</p>
<h2>六、地域诊断</h2>
<table><tr><th>省份</th><th class="num">消费</th><th class="num">CTR</th><th class="num">CPC</th><th>诊断</th></tr>
${R.geo.map(g=>`<tr><td>${esc(g.region)}</td><td class="num">¥${fmt(g.cost)}</td><td class="num">${pct(g.ctr)}</td><td class="num">¥${fmt(g.cpc)}</td><td>${g.diag}：${esc(g.advice)}</td></tr>`).join('')}</table>
<h2>六之二、转化关联诊断</h2>
<p>${R.shift && R.shift.data.length? R.shift.data.map(x=>`<b>${esc(x.kw)}</b>：${x.conclusions.length?esc(x.conclusions.join('；')):'CVR与搜索词结构变化（新词涌入/低质量占比）未见明显关联'}`).join('<br><br>'):'无足够转化数据'}</p>
<h2>七、操作清单（${R.actions.length}条）</h2>
${R.actions.map(a=>`<p><span class="p${a.p}">[P${a.p}]</span> <b>[${a.mod}]</b> ${esc(a.act)}</p>`).join('')}
${aiGlobal?`<h2>八、DeepSeek AI 综合诊断</h2><div class="ai">${aiGlobal}</div>`:''}
<p style="color:#9ca3af;margin-top:30px">由 360搜索推广效果评估分析系统 生成</p></body></html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='360推广诊断报告_'+R.period.replace(/至/,'_')+'.html';
  a.click(); URL.revokeObjectURL(a.href);
  toast('报告已导出下载');
}
