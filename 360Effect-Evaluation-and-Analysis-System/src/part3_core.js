/* ============ 核心：CSV解析 / 类型识别 / 设置 / 历史存储 ============ */
const DEFAULTS = { targetCPA:'', costFactor:1.0, ctrLowPct:50, negMinCost:1, zeroConvCost:300, cpaHighThresh:50, convValue:'', dsKey:'', dsModel:'deepseek-chat', dsUrl:'https://api.deepseek.com/chat/completions' };
let SET = loadSettings();
SET.aiMode = (typeof loadAIMode==='function')? loadAIMode() : '';   // 'offline' | 'deepseek'（无 Key 时强制离线，有 Key 时默认 DeepSeek，可切换）
let RAW = { search:[], geo:[], basic:[], adv:[], rank:[], kw:[], grp:[], plan:[], acct:[], hour:[], invalid:[], ocpc:[], comp:[], pic:[] };   // 清洗后的行对象
let FILES = [];                                       // {name,type,rows}
let R = null;                                         // 分析结果
let PERIOD_ACK = false;                               // v16：用户已确认「周期不一致仍继续分析」；文件列表变更即复位
let ACTIONS_EXPANDED = false;                         // v17：仪表盘操作预览展开状态
let PREV = null;                                      // 上一周期快照
let ACCOUNT_KEY = '';                                // v18：从文件名自动识别的账户标识，用于隔离不同客户的历史快照
/* 四象限元数据（账户级共享，置于核心层确保 part5/part6 均可见，避免跨文件 const 依赖在导出报告时崩溃） */
var QUAD_META={
  A:{name:'A · 重点词（高消费·有转化）', cls:'b-blue', action:'账户利润主力：稳排名不盲目抢第一（2-4名即可）；持续监控CPA变化；围绕其拓展同结构关键词；确保创意与落地页最优版本。'},
  B:{name:'B · 问题词（高消费·零转化）', cls:'b-red', action:'效率黑洞，优先处理：①核查搜索词相关性并否词 ②收匹配（短语→精确）③降价20-50%观察 ④仍无效则暂停。'},
  C:{name:'C · 潜力词（低消费·有转化）', cls:'b-green', action:'宝藏词：小步提价10-20%扩排名；适度放宽匹配拿量；作为种子词拓展长尾；单独预算保护。'},
  D:{name:'D · 观察词（低消费·零转化）', cls:'b-gray', action:'低成本试错池：检查是否因排名低导致无量（提价测试）；创意是否相关（优化）；连续2-3周仍无效则清理。'}
};

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
  if(typeof updateAIModeUI==='function') updateAIModeUI();
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
function isSingleDate(v){ return /^\d{4}-\d{2}-\d{2}$/.test(cleanDate(v)); }
/* 提取纯日期：360 的 分时/无效点击/oCPC 报告「时间」列常带时段（`2026-06-26 00:00至01:00` / `2026-04-28 00:00至01:00`），
   须剥离时段部分再判定单日，否则会被 isSingleDate 误杀导致整维度无法载入（oCPC 维度曾因此被拦截）。 */
function dateOnly(v){ return cleanDate(v).split(/\s/)[0]; }
function num(v){ const n=parseFloat(String(v).replace(/[%,＄¥]/g,'')); return isNaN(n)?0:n; }
/* 自动编码识别：360 部分账户（尤其老账户/特定导出）为 GBK/GB18030（非 UTF-8）。
   先按 UTF-8 解码；若产生大量替换字符（U+FFFD）则回退 GB18030，确保中文列名/词不被乱码。 */
function decodeCsv(buf){
  try{
    const utf8 = new TextDecoder('utf-8').decode(buf);
    if(/�/.test(utf8.slice(0,2000))){
      try{ return new TextDecoder('gb18030').decode(buf); }catch(e){}
    }
    return utf8;
  }catch(e){
    try{ return new TextDecoder('gb18030').decode(buf); }catch(e2){ return ''; }
  }
}
/* 日期列兼容：360 不同账户分别用「日期」或「时间」列名（如"产品线/关键词/创意/凤舞/oCPC"多用「日期」，搜索词/地域/分时多用「时间」） */
function findDateCol(header){ return header.findIndex(h=>{ const t=(h||'').trim(); return t==='日期' || t==='时间'; }); }

/* ---------- 报告类型识别（文件名优先 + 表头兜底，因高级创意/推广组报告列结构相同需靠文件名区分） ---------- */
function detectType(header, filename){
  const f = (filename||'').toLowerCase();
  const h = header.join(',');
  if(f.includes('搜索词')) return 'search';
  if(f.includes('分时')) return 'hour';               // 分时分析报告（含平均排名列时必须优先于表头判定，否则被误判为 rank → 分时维度整体丢失）
  if(h.includes('平均排名')) return 'rank';          // 关键词报告(1)：排名补充（周期汇总，特例放行）
  if(f.includes('基础创意')) return 'basic';
  if(f.includes('高级创意')) return 'adv';
  if(f.includes('凤舞')) return 'adv';               // 360 凤舞 = 高级/富媒体创意
  if(f.includes('推广组')||(f.includes('组')&&f.includes('数据报告'))) return 'grp';
  if(f.includes('地域')) return 'geo';               // 地域 先于 计划，避免「计划市级地域」误判为 plan
  if(f.includes('计划')) return 'plan';              // 计划数据报告 / 计划报告
  if(f.includes('账户报告')||f.includes('产品线')) return 'acct';
  if(h.includes('过滤前点击量')) return 'invalid';
  if(f.includes('ocpc')) return 'ocpc';
  if(f.includes('创意组件')) return 'comp';
  if(f.includes('创意配图')) return 'pic';
  if(h.includes('创意配图')) return 'pic';        // 表头兜底（盈拓文件名含"创意系统配图"等非连续写法时）
  if(h.includes('创意组件')) return 'comp';
  if(f.includes('创意')) return 'basic';             // 其余「创意*数据报告」归基础创意（含 创意标题 列）
  if(h.includes('创意标题')) return 'basic';
  if(h.includes('关键词')) return 'kw';
  return null;
}
const TYPE_NAME = { search:'搜索词报告(分日)', geo:'地域分析报告(分日)', basic:'基础创意报告', adv:'高级创意报告', rank:'关键词排名补充', kw:'关键词报告(分日)', grp:'推广组报告', plan:'计划报告', acct:'账户报告', hour:'分时分析报告', invalid:'无效点击报告', ocpc:'oCPC报告', comp:'创意组件报告', pic:'创意配图报告' };

/* ---------- 设备端识别（文件名 + 表头 双轨，行业/设备无关，离线可用） ----------
   360 点睛按设备拆分导出时，列结构常完全相同、仅靠文件名区分 PC/移动；部分导出把设备作为列。
   返回 'pc' | 'mobile' | 'both' | 'unknown'：文件名信号为主（覆盖 geo/kw/创意 等非排名维度），
   表头 平均排名(设备) 子列捕捉排名实测设备，独立「设备/设备类型」列的样例值作兜底。 */
function detectDevice(name, rows){
  const f=(name||'').toLowerCase();
  const first = rows && rows[0];
  /* 对象行（post-rowsToObjects / 测试直接构造）：rank 的 ranks{} 键即设备名；或已有 .device 标注 */
  if(first && typeof first==='object' && !Array.isArray(first)){
    let pc=false, mob=false;
    if(/\bpc\b|pc端|pc版|计算机|电脑|桌面/.test(f)) pc=true;
    if(/移动|无线|mobile|手机|移动端|无线端|移动版/.test(f)) mob=true;
    const rk = first.ranks;
    if(rk && typeof rk==='object'){ Object.keys(rk).forEach(k=>{ const kl=String(k).toLowerCase(); if(/计算机|左侧|\bpc\b/.test(kl)) pc=true; if(/移动|移动端|无线/.test(kl)) mob=true; }); }
    if(first.device) return first.device;
    if(pc&&mob) return 'both'; if(pc) return 'pc'; if(mob) return 'mobile'; return 'unknown';
  }
  /* 原始 CSV 数组行：靠表头（平均排名子列 / 独立设备列）+ 文件名 */
  const header=(first||[]).map(x=>String(x).trim());
  const h=header.join(',');
  let pc=false, mob=false;
  if(/\bpc\b|pc端|pc版|计算机|电脑|桌面/.test(f)) pc=true;
  if(/移动|无线|mobile|手机|移动端|无线端|移动版/.test(f)) mob=true;
  if(/平均排名[（(](计算机|左侧|\bpc\b)/i.test(h)) pc=true;          // 排名表头：PC 设备子列
  if(/平均排名[（(](移动|移动端|无线)/i.test(h)) mob=true;          // 排名表头：移动 设备子列
  const di=header.findIndex(x=>/^设备$|^设备类型$|^投放设备$/.test(x.trim()));   // 独立设备列
  if(di>=0 && rows){
    const vals=new Set();
    for(let i=1;i<Math.min(rows.length,50);i++){ const v=String(rows[i][di]||'').toLowerCase(); if(v) vals.add(v); }
    vals.forEach(v=>{ if(/\bpc\b|计算机|电脑|桌面/.test(v)) pc=true; if(/移动|无线|mobile|手机/.test(v)) mob=true; });
  }
  if(pc&&mob) return 'both';
  if(pc) return 'pc';
  if(mob) return 'mobile';
  return 'unknown';
}


function rowsToObjects(type, rows){
  const header = rows[0].map(x=>x.trim());
  const idx = n=>header.findIndex(h=>h.includes(n));
  const di = findDateCol(header);   // 兼容「日期」(盈拓) / 「时间」(xc捷配) 列名
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(r.length<3) continue;
    /* 过滤 360 导出常见的"合计"尾行：文件末尾会追加 日期列=「总点击次数」或纯数字(如 342642) 的汇总行，
       若误当分日数据吞入会破坏周期串/污染日期轴。判定标准：日期列必须含 YYYY-MM-DD 模式（兼容单日 / 分时带时段 / 周度范围串三种合法形态），
       完全不含日期模式的行即汇总尾行，丢弃。注：360 关键词/地域重导版时间列常为"YYYY-MM-DD至YYYY-MM-DD"范围串，须保留（工作记忆已记载此坑）。 */
    if(di>=0){ const d=cleanDate(r[di]||''); if(!/\d{4}-\d{2}-\d{2}/.test(d)) continue; }
    if(type==='search'){
      const revIdx = header.findIndex(h=>h.includes('转化金额')||h.includes('转化价值'));
      out.push({ date:cleanDate(r[di]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]),
        title:cleanCell(r[idx('创意标题')]), mode:cleanCell(r[idx('触发模式')]), kw:cleanCell(r[idx('关键词')]),
        query:cleanCell(r[idx('搜索词')]), shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]),
        cost:num(r[idx('总费用')]), conv:num(r[idx('转化数')]), rev: revIdx>=0 ? num(r[revIdx]) : undefined });
    }else if(type==='geo'){
      /* v15：城市列名兼容——盈拓导出为「城市」，xc/新版 360 导出为「市级地区」；只匹配「城市」会使 city 全空、
         市级分析静默降级为省级（v12 修复F 的遗漏变体）。注意顺序：先精确匹配「城市」，再回退「市级地区」。 */
      const cityIdx = (idx('城市')>=0) ? idx('城市') : idx('市级地区');
      out.push({ date:cleanDate(r[di]), region:cleanCell(r[idx('省级地区')]), city:cleanCell(r[cityIdx]), method:cleanCell(r[idx('地域定位')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), cost:num(r[idx('总费用')]) });
    }else if(type==='basic'){
      out.push({ date:cleanDate(r[di]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]),
        title:cleanCell(r[idx('创意标题')]), shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), cost:num(r[idx('总费用')]) });
    }else if(type==='adv'){
      out.push({ date:cleanDate(r[di]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), cost:num(r[idx('总费用')]) });
    }else if(type==='rank'){
      /* 表头驱动：动态捕获 平均排名（设备）列——兼容全角（）与半角()、PC(计算机/左侧)与移动及任意未来设备；
         支持分日文件（按展示量加权平均在 analyzeRank 聚合）；浅层转化数来自 360 双层转化链路（浅层=咨询/表单，深层=成交/线索） */
      const rankIdx={};
      header.forEach((h,i)=>{ const m=h.match(/平均排名[（(]([^）)]*)[）)]/); if(m) rankIdx[m[1]]=i; });
      const obj={ date:cleanDate(r[di]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]), kw:cleanCell(r[idx('关键词')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), cost:num(r[idx('总费用')]),
        cpc:num(r[idx('平均每次点击费用')]), conv:num(r[idx('转化数')]), shallow:num(r[idx('浅层转化数')]), ranks:{} };
      Object.keys(rankIdx).forEach(dev=>{ const raw=r[rankIdx[dev]]; if(raw!==''&&raw!=null){ const v=num(raw); if(v>0) obj.ranks[dev]=v; } });
      out.push(obj);
    }else if(type==='kw'){
      out.push({ date:cleanDate(r[di]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]), kw:cleanCell(r[idx('关键词')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]) });
    }else if(type==='grp'){
      out.push({ date:cleanDate(r[di]), plan:cleanCell(r[idx('推广计划')]), group:cleanCell(r[idx('推广组')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]) });
    }else if(type==='plan'){
      out.push({ date:cleanDate(r[di]), plan:cleanCell(r[idx('推广计划')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]) });
    }else if(type==='acct'){
      out.push({ date:cleanDate(r[di]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]) });
    }else if(type==='hour'){
      const t=cleanDate(r[di]);
      const hm=(t.match(/\s(\d{1,2}):\d{2}至/)||t.match(/\s(\d{1,2})时/)||['',null])[1];
      out.push({ date:cleanDate(t.split(/\s/)[0]), hour:hm!=null?parseInt(hm,10):-1,
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]) });
    }else if(type==='invalid'){
      out.push({ date:cleanDate(r[di]), before:num(r[idx('过滤前点击量')]), filtered:num(r[idx('过滤点击量')]),
        ratio:num(r[idx('过滤比')]), amount:num(r[idx('过滤金额')]) });
    }else if(type==='ocpc'){
      /* 360 oCPC 报告深层转化列名为「转化数」(非「深度转化数」)、深层成本列名为「实际转化成本(计费时间)」(非「深度转化成本」)；
         浅层仅有「浅层转化率」无「浅层转化数」。做列名回退，避免深层转化/CPA 被漏读为 0。 */
      const deepIdx = idx('深度转化数')>=0 ? idx('深度转化数') : idx('转化数');
      const deepCostIdx = idx('深度转化成本')>=0 ? idx('深度转化成本') : idx('实际转化成本(计费时间)');
      const shallowIdx = idx('浅层转化数');
      const shallowCostIdx = idx('浅层转化成本')>=0 ? idx('浅层转化成本') : idx('浅层目标转化成本');
      out.push({ date:dateOnly(r[di]), pkg:cleanCell(r[idx('oCPC投放包')]),
        phase:cleanCell(r[idx('投放阶段')]), dev:cleanCell(r[idx('投放设备')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]),
        shallow:(shallowIdx>=0?num(r[shallowIdx]):0), deep:(deepIdx>=0?num(r[deepIdx]):0),
        shallowCost:(shallowCostIdx>=0?num(r[shallowCostIdx]):0), deepCost:(deepCostIdx>=0?num(r[deepCostIdx]):0) });
    }else if(type==='comp'){
      out.push({ date:cleanDate(r[di]), type:cleanCell(r[idx('组件类型')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]) });
    }else if(type==='pic'){
      out.push({ date:cleanDate(r[di]), pic:cleanCell(r[idx('创意配图')]), imgType:cleanCell(r[idx('图片类型')]),
        shows:num(r[idx('展示次数')]), clicks:num(r[idx('点击次数')]), ctr:num(r[idx('点击率')]), cost:num(r[idx('总费用')]), cpc:num(r[idx('平均每次点击费用')]) });
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
    if(!/\.csv$/i.test(f.name) && !/^[^.]+$/.test(f.name)){ toast('已跳过非CSV文件：'+f.name); return; }   // 接受 .csv 与无扩展名（360 部分导出无扩展名，如「搜索关键词数据报告43262569」）
      const reader = new FileReader();
      reader.onload = e=>{
        const text = decodeCsv(e.target.result);
        const rows = parseCSV(text);
      if(!rows.length){ toast(f.name+' 解析为空'); return; }
      const type = detectType(rows[0], f.name);
      if(!type){ toast('无法识别报告类型：'+f.name); return; }
      if(type==='rank'){
        /* 排名补充文件：360 仅导出周期汇总排名，属特例放行（仅作关键词属性查表，不参与分日序列） */
        const objs = rowsToObjects(type, rows);
        if(!objs.length){ toast(f.name+' 解析为空'); return; }
        FILES.push({name:f.name, type, rows: objs, device: detectDevice(f.name, rows), header: rows[0].map(x=>x.trim())});
        toast('✅ 已读取「平均排名」补充（周期汇总，将用于区分"创意差 vs 排名掉"）');
        renderFileList();
        return;
      }
      /* 分日校验：本系统仅分析分日数据，汇总文件（无时间列/有效日期不足）拦截并提示重导 */
      const header = rows[0].map(x=>x.trim());
      const hasTimeCol = header.some(h=>h.includes('时间')||h.includes('日期'));
      if(!hasTimeCol){
        toast('⚠️ 汇总文件「'+f.name+'」：缺少时间/日期列。本系统仅分析分日数据，请到 360 点睛重新导出含"时间"列的分日版本后再上传。');
        return;
      }
      const objs = rowsToObjects(type, rows);
      /* 分日校验：有效日期必须是标准单日值 YYYY-MM-DD（Excel ="YYYY-MM-DD" 亦可），
         周期汇总文件的时间列往往是范围串（如 "2026-07-17至2026-07-23"）或无逐日值，需拦截 */
      const validDaily = objs.filter(r=>isSingleDate(r.date)).length;
      if(validDaily < objs.length*0.5){
        const hasRange = objs.some(r=>r.date && String(r.date).includes('至'));
        toast('⚠️ 汇总文件「'+f.name+'」：'+(hasRange?'时间列为周期范围（如"起至止"），':'有效日期不足，')+'疑似周期汇总。本系统仅分析分日数据，请到 360 点睛重新导出含逐日"时间"列的分日版本后再上传。');
        return;
      }
      FILES.push({name:f.name, type, rows: objs, device: detectDevice(f.name, rows), header: rows[0].map(x=>x.trim())});
      renderFileList();
    };
    // 360 导出编码不一：部分老账户/盈拓为 GBK/GB18030（非 UTF-8）。用 readAsArrayBuffer 取原始字节，
    // 交给 decodeCsv() 自动按 UTF-8 → GB18030 回退解码，确保中文列名/词不乱码。
    reader.readAsArrayBuffer(f);
  });
}
function renderFileList(){
  PERIOD_ACK = false;   // v16：文件集合已变化，周期一致性须重新校验
  const el=document.getElementById('filelist');
  el.innerHTML = FILES.map((f,i)=>`<div class="fileitem"><span class="ftype">${TYPE_NAME[f.type]}</span><span class="nm" title="${esc(f.name)}">${esc(f.name)}</span><span style="color:var(--muted)">${f.rows.length} 行</span><span class="spacer" style="flex:1"></span><button class="btn sm" onclick="FILES.splice(${i},1);renderFileList()">移除</button></div>`).join('');
  document.getElementById('btnAnalyze').disabled = FILES.length===0;   // 任意维度文件均可触发分析（自适应工作流：缺模块则对应模块安全空占位）
}
function clearFiles(){ FILES=[]; renderFileList(); }

/* ---------- 合并去重 ---------- */
const ALL_TYPES = ['search','geo','basic','adv','rank','kw','grp','plan','acct','hour','invalid','ocpc','comp','pic'];
/* 同维度多粒度文件（360 同一报告常导出多份：计划×组×省×市 / 计划×省×市 / 省×市 滚动汇总；无效点击：账户/计划/计划×组）。
   直接全并集会重复计数（账户级 rollup 已包含在最细粒度文件内）→ 必须「仅保留最细粒度文件，丢弃粗粒度 rollup」。
   交叉报告（如 搜索词×地域 含 关键词/消费排名 列）与纯地域报告 cost 口径不同 → 排除出地域成本聚合，避免重复计数。 */
function granularityScore(t, header){
  const h = (header||[]).map(x=>x.trim());
  const has = n => h.some(x=>x.includes(n));
  if(t==='geo'){
    let s = 0;
    if(has('推广计划')) s+=1;
    if(has('推广组')) s+=2;
    if(has('省级地区')||has('市级地区')) s+=4;
    if(has('关键词')||has('消费排名')) return -1;     // 搜索词×地域 交叉报告：排除出地域成本聚合
    return s;
  }
  if(t==='invalid'){
    let s = 0;
    if(has('推广计划')) s+=1;
    if(has('推广组')) s+=2;
    return s;
  }
  return 0;
}
function selectFinest(files, t){
  const scored = files.map(f=>({f, s:granularityScore(t, f.header)}));
  if(!scored.some(x=>x.f.header)) return files;        // 无表头信息（测试/老路径）→ 全并入（兼容旧行为）
  const max = Math.max(...scored.map(x=>x.s));
  if(max < 0) return files;                            // 全为交叉报告 → 退回全用（避免空）
  return scored.filter(x=>x.s===max).map(x=>x.f);      // 仅保留最细粒度文件，丢弃粗粒度 rollup（防重复计数）
}
function mergeFiles(){
  RAW={search:[],geo:[],basic:[],adv:[],rank:[],kw:[],grp:[],plan:[],acct:[],hour:[],invalid:[],ocpc:[],comp:[],pic:[]};
  const seen={}; ALL_TYPES.forEach(t=>seen[t]=new Set());
  let dup=0;
  ALL_TYPES.forEach(t=>{
    const files = FILES.filter(f=>f.type===t);
    if(!files.length) return;
    /* 地域/无效点击 同维度多粒度 → 仅取最细粒度文件（防重复计数）；其余维度直接全并集（同 schema 靠签名去重） */
    const chosen = (t==='geo'||t==='invalid') ? selectFinest(files, t) : files;
    if(t==='search'){
      /* v15：文件级指纹去重（替代此前的行级语义键去重）。
         背景：多搜索词文件可能为「同一数据不同列集」导出（一份含"触发模式"、另一份含"创意类型"），
         直接并集会双计（中信建投实测消费 +100%）；而行级语义键(日期×计划×组×词×搜索词×设备)去重
         会误删"同语义键、不同创意维度"的合法多行观测——实测 xc 漏计 ~18%、2023批次 ~20%、中信建投 ~8%
         （黄金基准：搜索词报告全量求和 = 计划报告总消费，三批次均精确成立）。
         正确口径：判定"同一数据"必须在文件级——对每个文件计算 日期×计划 → (cost,clicks) 聚合指纹，
         指纹完全一致的文件仅保留一份（优先保留含"触发模式"列的，匹配模式分析需要），其余整文件丢弃；
         保留文件内的所有行原样并入（同语义键多行观测应求和而非去重）。单文件场景指纹唯一 → 行为不变。
         注意：指纹只用计费口径 cost+clicks，不含 shows——中信建投实测同一数据按不同维度拆分导出时
         展示归组口径不同（触发模式版 shows=172316 vs 创意类型版 137783），cost/clicks 则逐单元精确一致。 */
      const fps = chosen.map(f=>{
        const m = new Map();
        f.rows.forEach(r=>{
          const k = (r.date||'')+'\u0001'+(r.plan||'');
          const o = m.get(k)||{cost:0,clicks:0};
          o.cost+=r.cost||0; o.clicks+=r.clicks||0;
          m.set(k,o);
        });
        const fp = [...m.entries()].map(([k,o])=>k+'\u0002'+o.cost.toFixed(2)+','+o.clicks).sort().join('\u0003');
        return { f, fp, hasMode: f.rows.some(r=>r.mode) };
      });
      const byFp = new Map();
      fps.forEach(x=>{
        const ex = byFp.get(x.fp);
        if(!ex){ byFp.set(x.fp, x); return; }
        const drop = (!ex.hasMode && x.hasMode) ? ex : x;   // 优先保留含触发模式的文件
        dup += drop.f.rows.length;
        if(drop===ex) byFp.set(x.fp, x);
      });
      /* v15 第二层：子集文件剔除。360 常同时导出「全设备报告 + 单设备（如移动端）报告」，
         单设备报告是全设备报告的严格行级多重集子集（2023 批次实测 151282/151282=100% 包含），
         直接并集会把该设备部分双计（实测 +19%）。判定：B 的每一行（按 日期|计划|组|词|搜索词|cost|clicks
         签名，多重集计数）都能在更大的文件 A 中命中 → B 为子集，整文件丢弃。
         代价说明：丢弃单设备文件会失去该文件的设备标注，但保总量正确（黄金基准=计划报告总消费）优先。 */
      let kept = [...byFp.values()].sort((a,b)=>b.f.rows.length - a.f.rows.length);
      const rowSig = r => [r.date,r.plan,r.group,r.kw,r.query,(r.cost||0).toFixed(2),r.clicks||0].map(x=>x==null?'':String(x)).join('\u0001');
      const isSubset = (small, big)=>{
        if(small.f.rows.length >= big.f.rows.length) return false;
        const m = new Map();
        big.f.rows.forEach(r=>{ const s=rowSig(r); m.set(s,(m.get(s)||0)+1); });
        return small.f.rows.every(r=>{ const s=rowSig(r); const c=m.get(s)||0; if(!c) return false; m.set(s,c-1); return true; });
      };
      kept = kept.filter((x,i)=>{
        for(let j=0;j<i;j++){ if(isSubset(x, kept[j])){ dup += x.f.rows.length; return false; } }
        return true;
      });
      kept.forEach(x=>{
        const fdev = x.f.device || detectDevice(x.f.name, x.f.rows);
        x.f.rows.forEach(r=>{ r.device = fdev; RAW.search.push(r); });
      });
      return;
    }
    chosen.forEach(f=>{
      const fdev = f.device || detectDevice(f.name, f.rows);
      f.rows.forEach(r=>{
        const sig = JSON.stringify(r);
        if(seen[t].has(sig)){ dup++; return; }
        seen[t].add(sig);
        r.device = fdev;
        RAW[t].push(r);
      });
    });
  });
  return dup;
}

/* ---------- 历史存储 ---------- */
function historyAll(){ try{ return JSON.parse(localStorage.getItem('sem360_history')||'[]'); }catch(e){ return []; } }
function saveSnapshot(snap){
  const account = ACCOUNT_KEY || ('__unknown_'+Date.now());   // v18：按当前批次账户隔离，避免跨客户快照互相覆盖
  let h = historyAll();
  h = h.filter(x=> !(x.period===snap.period && x.account===account));   // 同账户同周期覆盖
  h.push(Object.assign({account}, snap)); h.sort((a,b)=>a.period<b.period?-1:1);
  if(h.length>24) h=h.slice(h.length-24);
  try{ localStorage.setItem('sem360_history', JSON.stringify(h)); }catch(e){ toast('历史存储空间不足，已跳过保存'); }
}
function findPrev(period, account){
  // v18：仅匹配同账户（文件名自动识别）的历史快照，避免不同客户跨比（各行业客户数据不可比）
  const h = historyAll().filter(x=>x.account===account && x.period<period);
  return h.length? h[h.length-1] : null;
}
/* v18：从一批文件名自动提取账户标识（客户/账户用户名）。
   策略：① 多文件取所有文件名共有的、非日期、非报告类型的关键词（按首文件顺序拼接）；
         ② 单文件取首个非日期、非报告类型词；
         ③ 兜底取最长公共前缀的首段。取不到则返 ''（此时快照以唯一标记存储，永不参与跨批对比）。 */
function extractAccountKey(fileNames){
  if(!fileNames || !fileNames.length) return '';
  const bases = fileNames.map(n=>{
    let s = String(n).split(/[\\/]/).pop();
    return s.replace(/\.[^.]+$/, '');
  }).filter(Boolean);
  if(!bases.length) return '';
  const STOP = new Set(['搜索词','关键词','搜索关键词','地域','计划','推广计划','推广组','推广','组','账户','账号','ocpc','创意','时段','分时','无效','点击','排名','报告','分日','日报','数据','data','report','明细','汇总','全维度','维度','效果','统计','analysis','csv','xls','query']);
  const SEP = /[_\-－\s—~.]+/;
  const toks = s => String(s).split(SEP).map(t=>t.trim()).filter(Boolean)
    .map(t=>{ let u=t; STOP.forEach(w=>{ if(u.indexOf(w)>=0) u=u.split(w).join(''); }); return u; })  // 剔除嵌入的报告类型词缀（如「搜索词报告」→「」）
    .filter(t=>t.length>0)
    .filter(t=>!/^\d{4}[-/]?\d{1,2}([-/]\d{1,2})?$/.test(t))
    .filter(t=>!/^\d{6,8}$/.test(t))
    .filter(t=>!/^(19|20)\d{2}$/.test(t))
    .filter(t=>!STOP.has(t.toLowerCase()));
  if(bases.length===1){
    const ts = toks(bases[0]);
    return ts.length ? ts[0] : '';   // 单文件且整名均为报告类型/日期 → 无法识别客户，返回空（隔离，不误比）
  }
  let common=null;
  bases.forEach(b=>{ const ts=new Set(toks(b)); common = common===null? ts : new Set([...common].filter(x=>ts.has(x))); });
  const arr=[...(common||[])];
  if(arr.length){ arr.sort((a,b)=> bases[0].indexOf(a)-bases[0].indexOf(b)); return arr.join(''); }
  const seg = longestCommonPrefix(bases).split(SEP)[0];
  return seg || '';
}
function longestCommonPrefix(arr){
  if(!arr.length) return '';
  let p=arr[0];
  for(const s of arr){ let i=0; while(i<p.length && i<s.length && p[i]===s[i]) i++; p=p.slice(0,i); }
  return p;
}
function openHistory(){
  const h=historyAll();
  document.getElementById('historyList').innerHTML = h.length?
    ('<table><tr><th>客户</th><th>周期</th><th class="num">消费</th><th class="num">转化</th><th class="num">CPA</th><th class="num">转化词数</th><th>保存时间</th></tr>'+
    h.slice().reverse().map(x=>`<tr><td>${esc(x.account && x.account.indexOf('__unknown_')!==0 ? x.account : '未识别')}</td><td>${x.period}</td><td class="num">¥${fmt(x.cost)}</td><td class="num">${x.conv}</td><td class="num">${x.conv?('¥'+fmt(x.cost/x.conv)):'-'}</td><td class="num">${Object.keys(x.convKw||{}).length}</td><td>${x.savedAt||''}</td></tr>`).join('')+'</table>')
    : '<div class="empty">暂无历史周期。完成一次分析后自动保存。</div>';
  document.getElementById('historyModal').classList.add('show');
}
function clearHistory(){ if(confirm('确认清空全部历史周期数据？')){ localStorage.removeItem('sem360_history'); openHistory(); toast('历史已清空'); } }

/* ---------- 工具 ---------- */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(n,d){ d=(d===undefined)?2:d; return Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmt0(n){ return fmt(n,0); }
function pct(n,d){ n = (n==null||isNaN(Number(n)))?0:Number(n); return (n*100).toFixed(d===undefined?2:d)+'%'; }
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
if(typeof updateAIModeUI==='function') updateAIModeUI();
