/* 真实数据端到端测试：用本机真实 360 点睛搜索词报告（2310400683@qq.com_* 周报）
   覆盖：① 摄取类型识别/分日校验  ② 分析引擎（真实数字、列映射、NaN/崩溃）
        ③ 完整渲染管线（renderAll 真实执行，扫描 undefined/NaN 与异常）
   不依赖用户本机缺失的 xc捷配_2026-07-18至2026-07-24_* 文件。 */
const fs = require('fs');
const NODE = process.argv[2] || 'C:/Users/39747/.workbuddy/binaries/node/versions/22.22.2/node.exe';

/* ---------- 捕获型 DOM stub ---------- */
const _els = {};
const _toasts = [];
function ctx2d(){ return new Proxy({}, { get(t,k){ if(k==='canvas') return {width:900,height:400}; if(k==='measureText') return ()=>({width:10}); return ()=>{}; }, set(){return true;} }); }
function makeEl(id){
  let _html='';
  const el = {
    id, style:{}, dataset:{}, disabled:false, value:'', textContent:'',
    classList:{add(){},remove(){},contains(){return false}, toggle(){}},
    addEventListener(){}, appendChild(){}, removeChild(){}, options:[],
    querySelector(){return makeEl('qs');}, querySelectorAll(){return [];},
    parentElement:{clientWidth:900, clientHeight:400},
    getContext(){return ctx2d();},
    set innerHTML(v){ _html=v; }, get innerHTML(){ return _html; }
  };
  return el;
}
global.document = {
  getElementById(id){ return _els[id] || (_els[id]=makeEl(id)); },
  querySelector(){ return makeEl('qs'); },
  querySelectorAll(){ return []; },
  createElement(tag){ const c=makeEl(tag); c.parentElement={clientWidth:900,clientHeight:400}; return c; },
  body: makeEl('body'),
  documentElement:{ setAttribute(){}, getAttribute(){return 'light';} }
};
global.window = { scrollTo(){}, devicePixelRatio:1 };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));
global.getComputedStyle = ()=>({ getPropertyValue:()=>'#16a34a' });
global.toast = (m)=>{ _toasts.push(m); };
global.__files = {};
global.FileReader = class { readAsText(file){ const text=global.__files[file.name]; this.result=text; if(this.onload) this.onload({target:{result:text}}); } };

function loadScript(p){ let code=fs.readFileSync(p,'utf8'); code=code.replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/part3_core.js');
// 不 stub renderAll —— 走真实渲染管线
loadScript(__dirname+'/part4_analysis.js');
loadScript(__dirname+'/part5_render.js');
loadScript(__dirname+'/part6_ai.js');
// part3 自带 toast 会覆盖上面的捕获桩，加载后重新接管
global.toast = (m)=>{ _toasts.push(m); };

/* ---------- 工具 ---------- */
let fails=0; function assert(c,m){ if(!c){ fails++; console.log('  ❌ '+m); throw new Error(m);} else console.log('  ✔ '+m); }
function scanHTML(tag){
  let bad=0, total=0;
  Object.keys(_els).forEach(id=>{ const h=_els[id].innerHTML||''; if(!h) return; total++;
    if(/undefined/.test(h)) { console.log('    ⚠ '+id+' 含字面 "undefined"'); bad++; }
    if(/NaN|∞/.test(h) && /NaN|Infinity/.test(h)) { /* 允许 ∞ 文本(零转化日) */ if(/NaN/.test(h)){ console.log('    ⚠ '+id+' 含 NaN'); bad++; } }
  });
  if(bad) throw new Error(tag+' 渲染 HTML 检出 '+bad+' 处异常字面量');
  console.log('  ✔ '+tag+' 渲染 HTML 扫描：'+total+' 个元素，无 undefined/NaN');
}

const DIR='D:/360浏览器下载的文件/';
const real = ['2310400683@qq.com_2026-07-06至2026-07-12_搜索词报告.csv',
              '2310400683@qq.com_2026-06-15至2026-06-21_搜索词报告.csv',
              '2310400683@qq.com_2026-06-08至2026-06-14_搜索词报告.csv'];

console.log('\n===== 测试① 摄取层：类型识别 + 分日校验（真实文件） =====');
real.forEach(name=>{
  const text=fs.readFileSync(DIR+name,'utf8');
  const rows=parseCSV(text);
  const type=detectType(rows[0], name);
  assert(type==='search', name+' detectType → search (实='+type+')');
  // 分日校验决策（复刻 handleFiles 逻辑）
  const objs=rowsToObjects(type, rows);
  const validDaily=objs.filter(r=>isSingleDate(r.date)).length;
  const isWeekly = objs.some(r=>String(r.date).includes('至'));
  console.log('    '+name+': 行数='+objs.length+' | validDaily='+validDaily+' | 时间含"至"='+isWeekly+' | 首行时间='+objs[0].date);
  assert(validDaily < objs.length*0.5, name+' 被判定为周期汇总（validDaily<50%）→ 应拦截');
});

console.log('\n===== 测试①b 真实 handleFiles 拦截路径（周报应被拒绝，不崩溃） =====');
FILES=[]; _toasts.length=0;
const wname='2310400683@qq.com_2026-07-06至2026-07-12_搜索词报告.csv';
global.__files[wname]=fs.readFileSync(DIR+wname,'utf8');
handleFiles([{name:wname}]);
assert(FILES.length===0, '周报经 handleFiles 后 FILES 为空（已正确拦截）');
assert(_toasts.some(t=>/汇总|周期|分日/.test(t)), '拦截时给出汇总/分日提示 toast: "'+(_toasts.find(t=>/汇总|周期/.test(t))||'')+'"');

console.log('\n===== 测试② 分析引擎（真实数字 + 列映射，分日化注入） =====');
// 将真实周报按 7 天轮转分日化，作为有效分日数据测试引擎
const DAYS=['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12'];
FILES=[];
let expConv=0, expCost=0, expRows=0;
real.forEach((name,fi)=>{
  const text=fs.readFileSync(DIR+name,'utf8');
  const rows=parseCSV(text);
  const objs=rowsToObjects('search', rows);
  objs.forEach((o,i)=>{ o.date=DAYS[(fi*97+i)%DAYS.length]; });
  FILES.push({name, type:'search', rows:objs});
  objs.forEach(o=>{ expConv+=o.conv; expCost+=o.cost; expRows++; });
});
console.log('  注入真实行数='+expRows+' | 期望总转化='+expConv+' | 期望总消费='+expCost.toFixed(2));
runAnalysis();
assert(R && R.tot, 'runAnalysis 产出 R 且 R.tot 存在');
assert(R.tot.conv===expConv, 'R.tot.conv 与真实转化数之和一致 ('+R.tot.conv+'='+expConv+')');
assert(Math.abs(R.tot.cost-expCost)<0.01, 'R.tot.cost 与真实总费用之和一致');
assert(isFinite(R.tot.cpa) && R.tot.cpa>=0, 'R.tot.cpa 有限非负 (='+(R.tot.cpa&&R.tot.cpa.toFixed(2))+')');
assert(isFinite(R.targetCPA) && R.targetCPA>0, 'R.targetCPA 自动测算有限为正 (='+R.targetCPA.toFixed(2)+')');
assert(R.kws.length>0, 'R.kws 关键词已构建 ('+R.kws.length+')');
assert(R.kws.every(k=>isFinite(k.cost)&&isFinite(k.conv)), 'R.kws 无 NaN 成本/转化');
// 真实字段校验：抽取一条真实行核对 关键词/搜索词 是否被正确提取
const sample=R.kws.find(k=>k.kw.includes('捷配pcb下单'));
assert(!!sample, '真实关键词"捷配pcb下单"被正确解析提取');
const qSample=R.queries.find(q=>q.query==='捷配');
assert(!!qSample, '真实搜索词"捷配"被纳入搜索词组');
// 四象限 / 否词 / 匹配度 逻辑健全
const qc={}; R.kws.forEach(k=>qc[k.quad]=(qc[k.quad]||0)+1);
assert(Object.keys(qc).length>0, '四象限分布已计算: '+JSON.stringify(qc));
assert(R.negList.every(q=>isFinite(q.cost)), '否词建议成本均为有限值');
assert(R.actions.every(a=>a.act && a.act.length>0), '操作清单动作文本非空');
// CPA 归因 + 共变大脑（真实锚点=搜索词；仅搜索词报告无辅助维度，单元应为空属正常）
assert(R.cpa && isFinite(R.cpa.baselineCPA), 'CPA 基准归因 baselineCPA 有限');
assert(R.covar && R.covar.hasAnchor, '共变大脑识别到转化锚点(搜索词)');
assert(Array.isArray(R.covar.units), '共变单元为数组(仅搜索词无辅助维度→可能为空，属正常降级)');
console.log('   共变(仅搜索词,无辅助维度): units='+R.covar.units.length+' | hasAnchor='+R.covar.hasAnchor+' | planTypes='+R.covar.planTypes.length+' | emptyRuns='+(R.covar.emptyRuns||[]).length);
assert(R.covar.planTypes.length>0, '共变计划类型诊断已产出');
// 匹配度函数对真实中文词对返回合理值
const ms=matchScore('捷配pcb下单','捷配pcb官网登录入口');
assert(ms>=0&&ms<=100, '真实词对 捷配pcb下单 vs 捷配pcb官网登录入口 matchScore∈[0,100] (='+ms.toFixed(2)+', 系统按百分比,正确)');

console.log('\n===== 测试②b 共变大脑跨维度对齐（真实搜索词键 + 合成辅助维度） =====');
// 提取真实转化关键词的 计划/组/词 键（用真实语义键做对齐验证）
const realKeys=[]; const seenK=new Set();
FILES.forEach(f=>f.rows.forEach(r=>{ if(r.conv>0){ const k=r.plan+'||'+r.group+'||'+r.kw; if(!seenK.has(k)){seenK.add(k); realKeys.push({plan:r.plan,group:r.group,kw:r.kw,conv:r.conv});}}}));
realKeys.sort((a,b)=>b.conv-a.conv);
const topKeys=realKeys.slice(0,8);
console.log('   真实转化关键词键(前8): '+topKeys.map(k=>k.kw+'(conv'+k.conv+')').join(' | '));
const nf=[]; let expConv2=0, expCost2=0;
// 搜索词：真实行 ×7天 复制并带确定性日波动（使同一关键词跨多日出现，Pearson 可算）
real.forEach(name=>{
  const rows=rowsToObjects('search', parseCSV(fs.readFileSync(DIR+name,'utf8')));
  rows.forEach((o,i)=>{ DAYS.forEach((d,di)=>{ const f=0.7+0.1*di;
    nf.push({name:name+'(d'+di+')', type:'search', rows:[{date:d,plan:o.plan,group:o.group,title:o.title,mode:o.mode,kw:o.kw,query:o.query,shows:Math.round(o.shows*f),clicks:Math.round(o.clicks*f),cost:+(o.cost*f).toFixed(2),conv:Math.round(o.conv*f)}]});
    expConv2+=Math.round(o.conv*f); expCost2+=+(o.cost*f).toFixed(2);
  });});
});
// 排名：对真实 Top 关键词，跨7天带不同排名(波动) → 与转化共变
const rankRows=[];
topKeys.forEach(k=>DAYS.forEach((d,di)=>{ const rk=2+(di%5); rankRows.push({date:d,plan:k.plan,group:k.group,kw:k.kw,shows:300,clicks:30,cost:60,cpc:2,conv:k.conv,shallow:k.conv+2,ranks:{'计算机':rk,'移动端':rk+1}}); }));
nf.push({name:'synthetic_rank.csv', type:'rank', rows:rankRows});
// 无效点击 / 地域 / 分时：跨7天波动（真实日期）
nf.push({name:'synthetic_invalid.csv', type:'invalid', rows:DAYS.map((d,di)=>({date:d,before:1000,filtered:100+di*10,ratio:10+di*3,amount:20+di*5}))});
nf.push({name:'synthetic_geo.csv', type:'geo', rows:['广东','浙江','江苏'].flatMap((reg,ri)=>DAYS.map(d=>({date:d,region:reg,method:'',shows:100+ri*20,clicks:10+ri*2,cost:20+ri*5})))});
nf.push({name:'synthetic_hour.csv', type:'hour', rows:[9,10,14,15,20,21].flatMap((h,hi)=>DAYS.map(d=>({date:d,hour:h,shows:50+hi*10,clicks:5+hi,ctr:(5+hi)/100,cost:10+hi})))});
FILES=nf;
runAnalysis();
assert(R.tot.conv===expConv2, '复制×7后总转化聚合正确 ('+R.tot.conv+'='+expConv2+')');
assert(R.covar.units.length>0, '共变单元已产出（真实键+合成维度）: '+R.covar.units.length);
assert(R.covar.units.every(u=>u.drivers&&u.drivers.length>0), '共变单元均带驱动变量(维度字段映射正确)');
assert(R.covar.units.some(u=>topKeys.some(k=>u.target&&u.target.includes(k.kw))), '共变单元目标含真实关键词');
assert(R.covar.planTypes.length>0, '共变计划类型诊断已产出');
console.log('   共变示例: '+R.covar.units.slice(0,3).map(u=>u.scope+':'+u.target+'→'+(u.drivers||[]).map(x=>x.dim+' r='+x.r.toFixed(2)+x.dir).join('/')).join(' | '));

console.log('\n===== 测试③ 完整渲染管线（真实数据，检查崩溃/undefined/NaN） =====');
_toasts.length=0;
try{
  renderAll();           // 真实渲染：含 canvas 绘制(canvas stub) + 全部 render* HTML
  assert(true, 'renderAll() 真实执行未抛异常');
}catch(e){ assert(false, 'renderAll() 抛异常: '+e.message); }
// 逐个核心 render 函数直接调用，捕获各自 HTML
['renderWorkflow','renderCovar','renderQueries','renderDiag','renderRankDiag','renderInvalidDiag','renderHourDiag','renderOcpcDiag'].forEach(fn=>{
  try{ if(typeof global[fn]==='function'){ global[fn](); assert(true, fn+'() 执行无异常'); } }
  catch(e){ assert(false, fn+'() 抛异常: '+e.message); }
});
scanHTML('renderAll+各模块');

console.log('\n===== 测试④ 无搜索词降级（仅注入合成排名，复用真实引擎，应与测试①b隔离） =====');
FILES=[{name:'__only_rank__',type:'rank',rows:[
  {date:'2026-07-06',plan:'P1',group:'G1',kw:'测试词A',shows:100,clicks:10,cost:20,cpc:2,conv:6,shallow:5,ranks:{'移动端':3,'计算机':4}},
  {date:'2026-07-07',plan:'P1',group:'G1',kw:'测试词A',shows:120,clicks:12,cost:24,cpc:2,conv:7,shallow:6,ranks:{'移动端':3,'计算机':4}}
]}];
runAnalysis();
assert(R.noSearch===true, '仅排名文件 → noSearch=true');
assert(R.rank && R.rank.has && R.rank.diag.length>0, '排名诊断基于浅层/深层转化排序产出 diag');
assert(R.rank.devices.includes('移动端'), '真实设备键"移动端"被纳入 devices');
console.log('   排名三分支示例: '+R.rank.diag.slice(0,3).map(d=>d.kw+'→'+(d.primary?d.primary.verdict:'?')).join(' | '));

console.log('\n'+(fails===0?'REAL_TEST_PASS ✅':'REAL_TEST_FAIL ❌ ('+fails+' 项)'));
process.exit(fails===0?0:1);
