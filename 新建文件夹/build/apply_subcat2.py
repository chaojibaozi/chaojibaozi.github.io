#!/usr/bin/env python3
import re

with open('app.html', 'r', encoding='utf-8') as f:
    c = f.read()

changes = []

# 3. renderTable subcat - use template literals
old3 = '''  for(const r of show){
    const tr=document.createElement('tr');
    const review = r.conf<state.confTh;
    const tag=`<span class="tag" style="background:${CAT_COLOR[r.cat]}">${CAT_NAME[r.cat]}</span>`;
    const conf=`<span class="conf${review?' review':''}">${r.conf}%${review?' <span class="badge">复核</span>':''}</span>`;
    const rule=`<div class="rule-cell">${escapeHtml(r.rule.join('；'))}</div>`;
    const src=`<span class="src">${r.source||'离线'}</span>`;
    tr.innerHTML=`<td>${escapeHtml(r.kw)}</td><td>${tag}</td><td>${conf}</td><td>${rule}</td><td>${src}</td>`;
    body.appendChild(tr);
  }'''
if old3 in c:
    c = c.replace(old3, old3.replace(
        "const tag=`<span class=\"tag\" style=\"background:${CAT_COLOR[r.cat]}\">${CAT_NAME[r.cat]}</span>`;",
        "const subcatInfo = (r.subcat && SUBCATS[r.subcat]) ? `<span class=\"subtag\" style=\"background:${SUBCATS[r.subcat].color}\">${SUBCATS[r.subcat].name}</span>` : '';\n    const tag=`<span class=\"tag\" style=\"background:${CAT_COLOR[r.cat]}\">${CAT_NAME[r.cat]}</span>${subcatInfo}`;"
    ))
    changes.append('renderTable with subcat')
else:
    print('WARN: change 3 renderTable not found')

# 5. CSS subtag
old5 = '.tag{border-radius:3px;padding:0 8px;font-size:12px;line-height:22px;color:#fff;white-space:nowrap;display:inline-block}'
new5 = '.tag{border-radius:3px;padding:0 8px;font-size:12px;line-height:22px;color:#fff;white-space:nowrap;display:inline-block}\n.subtag{border-radius:3px;padding:0 6px;font-size:10px;line-height:18px;color:#fff;white-space:nowrap;display:inline-block;margin-left:3px;vertical-align:middle;opacity:.9}'
if old5 in c:
    c = c.replace(old5, new5)
    changes.append('CSS subtag')
else:
    print('WARN: change 5 CSS not found')

# 6. Add subcat counting in dist loop
old6_text = '''  const dist={}; const sub={};
  for(const r of state.results){
    dist[r.cat]=(dist[r.cat]||0)+1;
  }'''
new6_text = '''  const dist={}; const sub={};
  for(const r of state.results){
    dist[r.cat]=(dist[r.cat]||0)+1;
    if(r.subcat) sub[r.subcat]=(sub[r.subcat]||0)+1;
  }'''
if old6_text in c:
    c = c.replace(old6_text, new6_text)
    changes.append('subcat counting')
else:
    print('WARN: change 6 not found')

# 7. Add chart title "一级分类" before the bar chart
old7_text = '''  // 分类计数条
  const total=state.results.length;
  if(!total){ $('catChart').innerHTML='<div class="chart-empty">暂无数据</div>'; return; }
  let html='';'''
new7_text = '''  // 分类计数条
  const total=state.results.length;
  if(!total){ $('catChart').innerHTML='<div class="chart-empty">暂无数据</div>'; return; }
  let html='<div class="chart-title">一级分类</div>';'''
if old7_text in c:
    c = c.replace(old7_text, new7_text)
    changes.append('chart title')
else:
    print('WARN: change 7 not found')

# 8. Add subcat chart before confidence distribution
old8_text = '''  // 置信度分布
  const bins={};
  for(const r of state.results){'''
new8_text = '''  // 三级分类分布
  if(Object.keys(sub).length>0){
    html+='<div class="chart-title" style="margin-top:10px">三级分类</div>';
    for(const [scid, n] of Object.entries(sub).sort((a,b)=>b[1]-a[1])){
      const sc=SUBCATS[scid];
      if(!sc||!sc.name||!sc.color) continue;
      const pct=(n/total*100).toFixed(1);
      const w=Math.max(3,n/total*100);
      html+='<div class="bar-row"><span class="bar-label">'+escapeHtml(sc.name)+'</span><span class="bar-fill"><span style="display:inline-block;width:'+w+'%;min-width:12px;background:'+sc.color+';height:16px;border-radius:2px;vertical-align:middle"></span></span><span class="bar-num">'+n+' ('+pct+'%)</span></div>';
    }
  }
  // 置信度分布
  const bins={};
  for(const r of state.results){'''
if old8_text in c:
    c = c.replace(old8_text, new8_text)
    changes.append('subcat chart')
else:
    print('WARN: change 8 not found')

# 9. Add CSS for chart-title if not exists
if '.chart-title' not in c:
    old9 = '/* ============ 拖拽/导入区域 ============ */'
    new9 = '.chart-title{font-size:13px;font-weight:600;color:#333;margin:4px 0 2px;padding:0 4px}\n/* ============ 拖拽/导入区域 ============ */'
    if old9 in c:
        c = c.replace(old9, new9)
        changes.append('chart-title CSS')
    else:
        print('WARN: change 9 not found')

if changes:
    with open('app.html', 'w', encoding='utf-8') as f:
        f.write(c)
    print('OK -', len(changes), 'changes applied:', ', '.join(changes))
else:
    print('No changes applied!')
