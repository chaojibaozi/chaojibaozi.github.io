/* ============ 核心：CSV解析 / 类型识别 / 设置 / 历史存储 ============ */
const DEFAULTS = { targetCPA:'', costFactor:1.0, ctrLowPct:50, negMinCost:1, zeroConvCost:300, cpaHighThresh:50, convValue:'', dsKey:'', dsModel:'deepseek-chat', dsUrl:'https://api.deepseek.com/chat/completions' };
let SET = loadSettings();
let RAW = { search:[], geo:[], basic:[], adv:[] };   // 清洗后的行对象
let FILES = [];                                       // {name,type,rows}
let R = null;                                         // 分析结果
let PREV = null;                                      // 上一周期快照

function loadSettings(){
  try{ return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('sem360_settings')||'{}')); }
  catch(e){ return Object.assign({}, DEFAULTS); }
}
function openSettings(){
  ['targetCPA','costFactor','ctrLowPct','negMinCost','zeroConvCost','cpaHighThresh','convValue','dsKey','dsUrl'].forEach(k=>{ document.getElementById('set_'+k).value = SET[k]; });
  document.getElementById('set_dsModel').value = SET.dsModel;
  document.getElementById('settingsModal').classList.add('show');
}
function saveSettings(){
  ['targetCPA','costFactor','ctrLowPct','negMinCost','zeroConvCost','cpaHighThresh','convValue','dsKey','dsUrl'].forEach(k=>{ SET[k]=document.getElementById('set_'+k).value.trim(); });
  SET.dsModel = document.getElementById('set_dsModel').value;
  SET.costFactor = parseFloat(SET.costFactor)||1.0;
  SET.ctrLowPct = parseFloat(SET.ctrLowPct)||50;
  SET.negMinCost = parseFloat(SET.negMinCost)||1;
  SET.zeroConvCost = parseFloat(SET.zeroConvCost)||300;
  SET.cpaHighThresh = parseFloat(SET.cpaHighThresh)||50;
  SET.convValue = (SET.convValue!=='' && !isNaN(parseFloat(SET.convValue))) ? parseFloat(SET.convValue) : 0;
  localStorage.setItem('sem360_settings', JSON.stringify(SET));
  closeModal('settingsModal');
  toast('设置已保存');
  if(RAW.search.length) runAnalysis();
}
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.style.display='block';
  clearTimeout(t._h); t._h=setTimeout(()=>t.style.display='none',2600);
}

/* ---------- CSV 解析（处理引号、="date" 格式、BOM） ---------- */
function parseCSV(text){
  text = text.replace(/^\uFEFF/,'');
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; }
      else cell+=c;
    }else{
      if(c==='"') q=true;
      else if(c===','){ row.push(cell); cell=''; }
      else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
      else if(c!=='\r') cell+=c;
    }
  }
  if(cell!==''||row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(x=>x.trim()!==''));
}
function cleanCell(v){ return (v||'').replace(/^="?|"?$/g,'').replace(/^="|"$/g,'').trim(); }
function cleanDate(v){ return cleanCell(v).replace(/^=/,'').replace(/"/g,''); }
function num(v){ const n=parseFloat(String(v).replace(/[%,＄¥]/g,'')); return isNaN(n)?0:n; }

/* ---------- 报告类型识别 ---------- */
function detectType(header){
  const h = header.join(',');
  if(h.includes('搜索词')) return 'search';
  if(h.includes('省级地区')||h.includes('地域定位')) return 'geo';
  if(h.includes('创意标题')) return 'basic';
  if(h.includes('推广组')&&h.includes('展示次数')) return 'adv';
  return null;
}
const TYPE_NAME = { search:'搜索词报告(分日)', geo:'地域分析报告', basic:'基础创意报告', adv:'高级创意报告' };

function rowsToObjects(type, rows){
  const header = rows[0].map(x=>x.trim());
  const idx = n=>header.findIndex(h=>h.includes(n));
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(r.length<3) continue;
    if(type==='search'){
      const revIdx = header.findIndex(h=>h.includes('转化金额')||h.includes('转化价值'));
      out.push({ date:cleanDate(r[idx('时间')]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]),
        title:cleanCell(r[idx('创意标题')]), mode:cleanCell(r[idx('触发模式')]), kw:cleanCell(r[idx('关键词')]),
        query:cleanCell(r[idx('搜索词')]), shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]),
        cost:num(r[idx('总费用')]), conv:num(r[idx('转化数')]), rev: revIdx>=0 ? num(r[revIdx]) : undefined });
    }else if(type==='geo'){
      out.push({ date:cleanDate(r[idx('时间')]), region:cleanCell(r[idx('省级地区')]), method:cleanCell(r[idx('地域定位')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), cost:num(r[idx('总费用')]) });
    }else if(type==='basic'){
      out.push({ date:cleanDate(r[idx('时间')]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]),
        title:cleanCell(r[idx('创意标题')]), shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), cost:num(r[idx('总费用')]) });
    }else if(type==='adv'){
      out.push({ date:cleanDate(r[idx('时间')]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), cost:num(r[idx('总费用')]) });
    }
  }
  return out;
}

/* ---------- 文件导入 ---------- */
const dz = document.getElementById('dropzone');
['dragenter','dragover'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.add('over');}));
['dragleave','drop'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.remove('over');}));
dz.addEventListener('drop',ev=>handleFiles(ev.dataTransfer.files));

function handleFiles(fileList){
  Array.from(fileList).forEach(f=>{
    if(!/\.csv$/i.test(f.name)){ toast('已跳过非CSV文件：'+f.name); return; }
    const reader = new FileReader();
    reader.onload = e=>{
      let text = e.target.result;
      const rows = parseCSV(text);
      if(!rows.length){ toast(f.name+' 解析为空'); return; }
      const type = detectType(rows[0]);
      if(!type){ toast('无法识别报告类型：'+f.name); return; }
      FILES.push({name:f.name, type, rows: rowsToObjects(type, rows)});
      renderFileList();
    };
    // 360导出一般为UTF-8带BOM；若乱码可另存。先按UTF-8读取
    reader.readAsText(f,'UTF-8');
  });
}
function renderFileList(){
  const el=document.getElementById('filelist');
  el.innerHTML = FILES.map((f,i)=>`<div class="fileitem"><span class="ftype">${TYPE_NAME[f.type]}</span><span>${esc(f.name)}</span><span style="color:var(--muted)">${f.rows.length} 行</span><span class="spacer" style="flex:1"></span><button class="btn sm" onclick="FILES.splice(${i},1);renderFileList()">移除</button></div>`).join('');
  document.getElementById('btnAnalyze').disabled = !FILES.some(f=>f.type==='search');
}
function clearFiles(){ FILES=[]; renderFileList(); }

/* ---------- 合并去重 ---------- */
function mergeFiles(){
  RAW={search:[],geo:[],basic:[],adv:[]};
  const seen={search:new Set(),geo:new Set(),basic:new Set(),adv:new Set()};
  let dup=0;
  FILES.forEach(f=>{
    f.rows.forEach(r=>{
      const sig = JSON.stringify(r);
      if(seen[f.type].has(sig)){ dup++; return; }
      seen[f.type].add(sig);
      RAW[f.type].push(r);
    });
  });
  return dup;
}

/* ---------- 历史存储 ---------- */
function historyAll(){ try{ return JSON.parse(localStorage.getItem('sem360_history')||'[]'); }catch(e){ return []; } }
function saveSnapshot(snap){
  let h = historyAll();
  h = h.filter(x=>x.period!==snap.period);       // 同周期覆盖
  h.push(snap); h.sort((a,b)=>a.period<b.period?-1:1);
  if(h.length>24) h=h.slice(h.length-24);
  try{ localStorage.setItem('sem360_history', JSON.stringify(h)); }catch(e){ toast('历史存储空间不足，已跳过保存'); }
}
function findPrev(period){
  const h = historyAll().filter(x=>x.period<period);
  return h.length? h[h.length-1] : null;
}
function openHistory(){
  const h=historyAll();
  document.getElementById('historyList').innerHTML = h.length?
    ('<table><tr><th>周期</th><th class="num">消费</th><th class="num">转化</th><th class="num">CPA</th><th class="num">转化词数</th><th>保存时间</th></tr>'+
    h.slice().reverse().map(x=>`<tr><td>${x.period}</td><td class="num">¥${fmt(x.cost)}</td><td class="num">${x.conv}</td><td class="num">${x.conv?('¥'+fmt(x.cost/x.conv)):'-'}</td><td class="num">${Object.keys(x.convKw||{}).length}</td><td>${x.savedAt||''}</td></tr>`).join('')+'</table>')
    : '<div class="empty">暂无历史周期。完成一次分析后自动保存。</div>';
  document.getElementById('historyModal').classList.add('show');
}
function clearHistory(){ if(confirm('确认清空全部历史周期数据？')){ localStorage.removeItem('sem360_history'); openHistory(); toast('历史已清空'); } }

/* ---------- 工具 ---------- */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(n,d){ d=(d===undefined)?2:d; return Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmt0(n){ return fmt(n,0); }
function pct(n,d){ return (n*100).toFixed(d===undefined?2:d)+'%'; }
function switchTab(el){
  document.querySelectorAll('nav .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById(el.dataset.p).classList.add('active');
  const pt=document.getElementById('pageTitle'), ps=document.getElementById('pageSub');
  if(pt&&el.dataset.title) pt.textContent=el.dataset.title;
  if(ps&&el.dataset.sub) ps.textContent=el.dataset.sub;
  try{ if(typeof redrawActiveCharts==='function') redrawActiveCharts(); }catch(e){}
}

/* ---------- 主题：浅色 / 深色 ---------- */
const THEME_KEY='sem360_theme';
function applyTheme(t){
  if(!t) t = (localStorage && localStorage.getItem(THEME_KEY)) || 'light';
  const de=document.documentElement;
  if(de) de.setAttribute('data-theme', t);
  const lbl=document.getElementById('themeLabel');
  if(lbl) lbl.textContent = t==='dark' ? '切换浅色' : '切换深色';
  try{ if(localStorage) localStorage.setItem(THEME_KEY, t); }catch(e){}
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  applyTheme(cur);
  if(R){
    try{ if(typeof drawDailyChart==='function') drawDailyChart(); }catch(e){}
    try{ if(typeof drawGeoChart==='function') drawGeoChart(); }catch(e){}
    try{ if(typeof drawCpaChart==='function') drawCpaChart(); }catch(e){}
  }
}
applyTheme();
