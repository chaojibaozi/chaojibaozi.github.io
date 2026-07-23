#!/usr/bin/env python3
with open('app.html','r',encoding='utf-8') as f:
    c = f.read()

changes = []

# 1. Add SUBCAT definitions after CAT_COLOR
old1 = '''const CAT_NAME = {}; CATEGORIES.forEach(c=>CAT_NAME[c.id]=c.name);
const CAT_COLOR = {}; CATEGORIES.forEach(c=>CAT_COLOR[c.id]=c.color);
'''
new1 = '''const CAT_NAME = {}; CATEGORIES.forEach(c=>CAT_NAME[c.id]=c.name);
const CAT_COLOR = {}; CATEGORIES.forEach(c=>CAT_COLOR[c.id]=c.color);

/* ============ 三级分类（价格词/长尾词下沉细分） ============
   利用已有信号交叉判定，自动推导子类别，无需额外词典维护。
   价格词: 产品价/服务价/人群价/属性价/优惠价/地域价/二手价/通用价
   长尾词: 人群尾/属性尾/地域尾/活动尾/场景尾                     */
const SUBCATS = {
  // 价格词子类
  product_price:  {name:'产品+价', color:'#D4782A', parent:'price'},
  service_price:  {name:'服务+价', color:'#C0661D', parent:'price'},
  audience_price: {name:'人群+价', color:'#C49A1C', parent:'price'},
  attr_price:     {name:'属性+价', color:'#B88918', parent:'price'},
  promo_price:    {name:'优惠价',   color:'#BB6D25', parent:'price'},
  geo_price:      {name:'地域+价', color:'#BD6F30', parent:'price'},
  rental_price:   {name:'二手/租价',color:'#AA7030', parent:'price'},
  generic_price:  {name:'通用价',   color:'#947856', parent:'price'},
  // 长尾词子类
  audience_longtail: {name:'人群长尾', color:'#849B3A', parent:'longtail'},
  attr_longtail:     {name:'属性长尾', color:'#7A9436', parent:'longtail'},
  geo_longtail:      {name:'地域长尾', color:'#8E9E3E', parent:'longtail'},
  promo_longtail:    {name:'活动长尾', color:'#8F9B32', parent:'longtail'},
  scene_longtail:    {name:'场景长尾', color:'#6B8E23', parent:'longtail'},
  plain_longtail:    {name:'纯长尾',   color:'#7D8C4A', parent:'longtail'},
};
'''
if old1 in c:
    c = c.replace(old1, new1)
    changes.append('SUBCAT definitions')
else:
    print('WARN: change 1 not found')

# 2. Add subcat computation before classify return
old2 = '''  const rule = best==='generic' ? ['通用词:未匹配到其他类目特征'] : [ruleMap[best], ...order.filter(c=>c!==best&&ruleMap[c]).map(c=>ruleMap[c])].filter(Boolean);
  return {cat:best, conf, rule, matched:order.filter(c=>ruleMap[c])};'''
new2 = '''  // === 三级分类推导：基于其他信号的交叉判定 ===
  let subcat=null;
  if(best==='price'){
    const hasProduct=!!s.core||!!s.longtail;
    const hasAudience=!!s.audience;
    const hasAttr=!!s.attribute;
    const hasPromo=!!s.promo;
    const hasGeo=!!s.geo;
    const isRental=/二手|出租|租赁|回收/.test(k);
    if(isRental) subcat='rental_price';
    else if(hasPromo) subcat='promo_price';
    else if(hasGeo) subcat='geo_price';
    else if(hasAudience) subcat='audience_price';
    else if(hasAttr) subcat='attr_price';
    else if(hasProduct) subcat='product_price';
    else subcat='generic_price';
  } else if(best==='longtail'){
    const hasAudience=!!s.audience;
    const hasAttr=!!s.attribute;
    const hasGeo=!!s.geo;
    const hasPromo=!!s.promo;
    if(hasAudience) subcat='audience_longtail';
    else if(hasAttr) subcat='attr_longtail';
    else if(hasGeo) subcat='geo_longtail';
    else if(hasPromo) subcat='promo_longtail';
    else if(s.question) subcat='scene_longtail';
    else subcat='plain_longtail';
  }

  const rule = best==='generic' ? ['通用词:未匹配到其他类目特征'] : [ruleMap[best], ...order.filter(c=>c!==best&&ruleMap[c]).map(c=>ruleMap[c])].filter(Boolean);
  return {cat:best, subcat, conf, rule, matched:order.filter(c=>ruleMap[c])};'''
if old2 in c:
    c = c.replace(old2, new2)
    changes.append('subcat in classify')
else:
    print('WARN: change 2 not found')

# 3. Update renderTable to show subcat
old3 = '''  for(const r of show){
    const tr=document.createElement('tr');
    const review = r.conf<state.confTh;
    const tag='<span class="tag" style="background:'+CAT_COLOR[r.cat]+'">'+CAT_NAME[r.cat]+'</span>';
    const conf='<span class="conf'+(review?' review':'')+'"'+'>'+r.conf+'%'+(review?' <span class="badge">复核</span>':'')+'</span>';
    const rule='<div class="rule-cell">'+escapeHtml(r.rule.join('\uFF1B'))+'</div>';
    const src='<span class="src">'+(r.source||'\u79BB\u7EBF')+'</span>';
    tr.innerHTML='<td>'+escapeHtml(r.kw)+'</td><td>'+tag+'</td><td>'+conf+'</td><td>'+rule+'</td><td>'+src+'</td>';
    body.appendChild(tr);
  }'''
new3 = '''  for(const r of show){
    const tr=document.createElement('tr');
    const review = r.conf<state.confTh;
    const subcatInfo = (r.subcat && SUBCATS[r.subcat]) ? '<span class="subtag" style="background:'+SUBCATS[r.subcat].color+'">'+SUBCATS[r.subcat].name+'</span>' : '';
    const tag='<span class="tag" style="background:'+CAT_COLOR[r.cat]+'">'+CAT_NAME[r.cat]+'</span>' + subcatInfo;
    const conf='<span class="conf'+(review?' review':'')+'"'+'>'+r.conf+'%'+(review?' <span class="badge">复核</span>':'')+'</span>';
    const rule='<div class="rule-cell">'+escapeHtml(r.rule.join('\uFF1B'))+'</div>';
    const src='<span class="src">'+(r.source||'\u79BB\u7EBF')+'</span>';
    tr.innerHTML='<td>'+escapeHtml(r.kw)+'</td><td>'+tag+'</td><td>'+conf+'</td><td>'+rule+'</td><td>'+src+'</td>';
    body.appendChild(tr);
  }'''
if old3 in c:
    c = c.replace(old3, new3)
    changes.append('renderTable with subcat')
else:
    print('WARN: change 3 not found')

# 4. Update export to include subcat column
old4 = '''  const aoa=[ [...head,'\u5206\u7C7B','\u7F6E\u4FE1\u5EA6','\u547D\u4E2D\u89C4\u5219','\u6765\u6E90'] ];
  for(const r of state.results){
    aoa.push([ ...(r.row||[r.kw]), CAT_NAME[r.cat], r.conf+'%', r.rule.join('\uFF1B'), r.source||'\u79BB\u7EBF' ]);
  }'''
new4 = '''  const aoa=[ [...head,'\u4E00\u7EA7\u5206\u7C7B','\u4E09\u7EA7\u5206\u7C7B','\u7F6E\u4FE1\u5EA6','\u547D\u4E2D\u89C4\u5219','\u6765\u6E90'] ];
  for(const r of state.results){
    const subcatName = (r.subcat && SUBCATS[r.subcat]) ? SUBCATS[r.subcat].name : '';
    aoa.push([ ...(r.row||[r.kw]), CAT_NAME[r.cat], subcatName, r.conf+'%', r.rule.join('\uFF1B'), r.source||'\u79BB\u7EBF' ]);
  }'''
if old4 in c:
    c = c.replace(old4, new4)
    changes.append('export with subcat')
else:
    print('WARN: change 4 not found')

# 5. Add CSS for subtag
old5 = '''.tag{border-radius:3px;padding:0 8px;font-size:12px;line-height:22px;color:#fff;white-space:nowrap;display:inline-block}'''
new5 = '''.tag{border-radius:3px;padding:0 8px;font-size:12px;line-height:22px;color:#fff;white-space:nowrap;display:inline-block}
.subtag{border-radius:3px;padding:0 6px;font-size:10px;line-height:18px;color:#fff;white-space:nowrap;display:inline-block;margin-left:3px;vertical-align:middle;opacity:.9}'''
if old5 in c:
    c = c.replace(old5, new5)
    changes.append('CSS subtag')
else:
    print('WARN: change 5 not found')

# 6. Update the category distribution chart to include subcats
# Also need to add subcat to the distribution rendering - update renderChart
# Find the section that renders category distribution
old6 = '''  const dist={}; const sub={};
  for(const r of state.results){
    dist[r.cat]=(dist[r.cat]||0)+1;
  }'''
new6 = '''  const dist={}; const sub={};
  for(const r of state.results){
    dist[r.cat]=(dist[r.cat]||0)+1;
    if(r.subcat) sub[r.subcat]=(sub[r.subcat]||0)+1;
  }'''
if old6 in c:
    c = c.replace(old6, new6)
    changes.append('subcat distribution')
else:
    print('WARN: change 6 not found')

# Add subcat bar chart rendering after the existing dist chart
old7 = '''  // 分类计数条
  const total=state.results.length;
  if(!total){ $('catChart').innerHTML='<div class="chart-empty">暂无数据</div>'; return; }
  let html='';'''
new7 = '''  // 分类计数条
  const total=state.results.length;
  if(!total){ $('catChart').innerHTML='<div class="chart-empty">\u6682\u65E0\u6570\u636E</div>'; return; }
  // 一级分类分布
  let html='<div class="chart-title">\u4E00\u7EA7\u5206\u7C7B</div>';'''
if old7 in c:
    c = c.replace(old7, new7)
    changes.append('chart title for level1')
else:
    print('WARN: change 7 not found')

# Add subcat rendering after the main dist rendering (before the close of the function)
old8 = '''  // 置信度分布
  const bins={};
  for(const r of state.results){'''
new8 = '''  // 三级分类分布
  if(Object.keys(sub).length>0){
    html+='<div class="chart-title" style="margin-top:10px">\u4E09\u7EA7\u5206\u7C7B</div>';
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
if old8 in c:
    c = c.replace(old8, new8)
    changes.append('subcat chart rendering')
else:
    print('WARN: change 8 not found')

if changes:
    with open('app.html','w',encoding='utf-8') as f:
        f.write(c)
    print('OK -', len(changes), 'changes applied:', ', '.join(changes))
else:
    print('No changes applied!')
