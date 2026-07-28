/* 逻辑正确性测试：用受控合成数据校验分析引擎的数值正确性
   覆盖：① CPA 基准中位数 + 高异动日识别  ② 共变大脑 Pearson 符号（排名/创意CTR/无效点击）方向正确
        ③ 单日文件下 analyzeStats 预测不再产生 Infinity/NaN  ④ oCPC 学习期判定不再误报
        ⑤ mergeFiles 去重不重复累加  ⑥ 真实渲染管线无 undefined/NaN
   不依赖用户本机缺失的 xc捷配_2026-07-18至2026-07-24_* 文件。 */
const fs = require('fs');
const NODE = process.argv[2] || 'C:/Users/39747/.workbuddy/binaries/node/versions/22.22.2/node.exe';

/* ---------- 捕获型 DOM stub ---------- */
const _els = {}; const _toasts = [];
function ctx2d(){ return new Proxy({}, { get(t,k){ if(k==='canvas') return {width:900,height:400}; if(k==='measureText') return ()=>({width:10}); return ()=>{}; }, set(){return true;} }); }
function makeEl(id){ let _html=''; const el={ id, style:{}, dataset:{}, disabled:false, value:'', textContent:'',
  classList:{add(){},remove(){},contains(){return false}, toggle(){}}, addEventListener(){}, appendChild(){}, removeChild(){}, click(){}, options:[],
  querySelector(){return makeEl('qs');}, querySelectorAll(){return [];}, parentElement:{clientWidth:900,clientHeight:400},
  getContext(){return ctx2d();}, set innerHTML(v){_html=v;}, get innerHTML(){return _html;} }; return el; }
global.document = { getElementById(id){ return _els[id]||(_els[id]=makeEl(id)); }, querySelector(){return makeEl('qs');},
  querySelectorAll(){return [];}, createElement(t){ const c=makeEl(t); c.parentElement={clientWidth:900,clientHeight:400}; return c; },
  body:makeEl('body'), documentElement:{ setAttribute(){}, getAttribute(){return 'light';} } };
global.window = { scrollTo(){}, devicePixelRatio:1 };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true; global.fetch = ()=>Promise.reject(new Error('offline test'));
global.getComputedStyle = ()=>({ getPropertyValue:()=>'#16a34a' });
global.Blob = class { constructor(parts){ global.__lastBlob = parts[0]; } };
global.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
global.toast = (m)=>{ _toasts.push(m); };
global.FileReader = class { readAsText(file){ const text=global.__files[file.name]; this.result=text; if(this.onload) this.onload({target:{result:text}}); } };
function loadScript(p){ let code=fs.readFileSync(p,'utf8'); code=code.replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/part3_core.js');
loadScript(__dirname+'/part4_analysis.js');
loadScript(__dirname+'/part5_render.js');
loadScript(__dirname+'/part6_ai.js');
global.toast = (m)=>{ _toasts.push(m); };

let fails=0; function assert(c,m){ if(!c){ fails++; console.log('  ❌ '+m); throw new Error(m);} else console.log('  ✔ '+m); }
function scanHTML(tag){ let bad=0,total=0; Object.keys(_els).forEach(id=>{ const h=_els[id].innerHTML||''; if(!h) return; total++;
  if(/undefined/.test(h)){ console.log('    ⚠ '+id+' 含字面 "undefined"'); bad++; }
  if(/NaN/.test(h)){ console.log('    ⚠ '+id+' 含 NaN'); bad++; } });
  if(bad) throw new Error(tag+' 渲染 HTML 检出 '+bad+' 处异常字面量'); console.log('  ✔ '+tag+' 渲染 HTML 扫描：'+total+' 个元素，无 undefined/NaN'); }

/* ============ T1：CPA 基准中位数 + 高异动日识别 ============ */
console.log('\n===== T1 CPA 基准中位数 & 高异动日识别 =====');
const D7=['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12'];
FILES=[
  {name:'cpa_a.csv',type:'search',rows:[
    {date:'2026-07-06',plan:'P2',group:'G2',kw:'K2',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:100,conv:2},
    {date:'2026-07-07',plan:'P2',group:'G2',kw:'K2',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:200,conv:4},
    {date:'2026-07-08',plan:'P2',group:'G2',kw:'K2',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:300,conv:6},
    {date:'2026-07-09',plan:'P2',group:'G2',kw:'K2',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:400,conv:8},
    {date:'2026-07-10',plan:'P2',group:'G2',kw:'K2',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:300,conv:10}
  ]}
];
runAnalysis();
// dayCPA = [50,50,50,50,30] → 中位数 50
assert(Math.abs(R.cpa.baselineCPA-50)<1e-6, 'CPA 基准中位数 = 50 (dayCPA=[50,50,50,50,30])，实='+(R.cpa.baselineCPA&&R.cpa.baselineCPA.toFixed(2)));
assert(R.cpa.highDays.length===0, '无日度 CPA > 基准×1.5(75) → 高异动日为空');
// 改最后一天为 CPA=150
FILES[0].rows[4].conv=2; FILES[0].rows[4].cost=300;   // 300/2=150
runAnalysis();
assert(Math.abs(R.cpa.baselineCPA-50)<1e-6, '加入 CPA=150 日后中位数仍=50 (抗极端值)');
assert(R.cpa.highDays.length===1, '识别出 1 个高异动日 (CPA=150>75)');

/* ============ T2：共变大脑 Pearson 符号正确性（植入已知相关） ============ */
console.log('\n===== T2 共变大脑 Pearson 符号正确性 =====');
const convDays=[10,9,8,7,6,5,4];                 // 转化逐日递减
const rankDays=[3,3.2,3.4,3.6,3.8,4.0,4.2];     // 排名逐日变差(值增大) → 应与转化负相关
const ctrDays =[0.10,0.095,0.090,0.085,0.080,0.075,0.070]; // 创意CTR 与转化同向
const invDays =[10,12,15,18,22,26,30];          // 无效点击过滤比 与转化反向
const search2=[], basic2=[], rank2=[], invalid2=[];
D7.forEach((d,i)=>{
  search2.push({date:d,plan:'P1',group:'G1',kw:'K1',query:'q',title:'T1',mode:'精确',shows:1000,clicks:80,cost:200,conv:convDays[i]});
  basic2.push({date:d,plan:'P1',group:'G1',title:'T1',shows:1000,clicks:Math.round(ctrDays[i]*1000),cost:200});
  rank2.push({date:d,plan:'P1',group:'G1',kw:'K1',shows:100,clicks:10,cost:20,conv:1,shallow:1,ranks:{'计算机':rankDays[i]}});
  invalid2.push({date:d,before:1000,filtered:invDays[i]*10,ratio:invDays[i],amount:invDays[i]*2});
});
FILES=[
  {name:'s.csv',type:'search',rows:search2},
  {name:'b.csv',type:'basic',rows:basic2},
  {name:'r.csv',type:'rank',rows:rank2},
  {name:'i.csv',type:'invalid',rows:invalid2}
];
runAnalysis();
assert(R.covar && R.covar.hasAnchor, '共变大脑锚点已识别');
assert(R.covar.units.some(u=>u.target&&u.target.includes('K1')), 'K1 进入共变单元');
const allD = R.covar.units.flatMap(u=>u.drivers);
const rankD = allD.find(d=>d.dim==='排名');
const ctrD  = allD.find(d=>d.dim==='创意CTR');
const invD  = allD.find(d=>d.dim==='无效点击过滤比');
assert(rankD && rankD.r<0, '排名↔转化 呈负相关 (排名变差→转化走低) r='+(rankD&&rankD.r.toFixed(3)));
assert(ctrD && ctrD.r>0,  '创意CTR↔转化 呈正相关 r='+(ctrD&&ctrD.r.toFixed(3)));
assert(invD && invD.r<0, '无效点击过滤比↔转化 呈负相关 (过滤比升→真实流量小) r='+(invD&&invD.r.toFixed(3)));
// 方向文字与符号一致
assert(rankD.dir==='↓' && ctrD.dir==='↑' && invD.dir==='↓', 'dir 箭头与 r 符号一致');
console.log('   驱动示例: '+R.covar.units.filter(u=>u.target&&u.target.includes('K1')).map(u=>u.target+'→'+u.drivers.map(x=>x.dim+' r='+x.r.toFixed(2)+x.dir).join('/')).join(' | '));

/* ============ T3：单日文件下 analyzeStats 预测不产生 Infinity/NaN ============ */
console.log('\n===== T3 单日文件 → 预测有限（修复除零） =====');
FILES=[{name:'one.csv',type:'search',rows:[
  {date:'2026-07-06',plan:'P9',group:'G9',kw:'K9',query:'q',title:'t',mode:'精确',shows:1000,clicks:50,cost:500,conv:5}
]}];
runAnalysis();
assert(isFinite(R.stats.fcConv) && !isNaN(R.stats.fcConv), 'fcConv 有限 (='+R.stats.fcConv+')');
assert(isFinite(R.stats.fcCI[0]) && isFinite(R.stats.fcCI[1]), 'fcCI 置信区间有限 (['+R.stats.fcCI[0].toFixed(1)+','+R.stats.fcCI[1].toFixed(1)+'])');
assert(isFinite(R.stats.fcCPA), 'fcCPA 有限 (='+R.stats.fcCPA+')');
assert(!/∞|NaN/.test(''+R.stats.fcConv+R.stats.fcCPA), 'fcConv/fcCPA 不含 ∞/NaN 字面量');
try{ renderAll(); assert(true,'单日数据 renderAll 不抛异常'); }catch(e){ assert(false,'renderAll 抛异常: '+e.message); }
scanHTML('T3 单日渲染');

/* ============ T4：oCPC 学习期判定不再误报全周期包 ============ */
console.log('\n===== T4 oCPC 学习期判定 =====');
// Case A：投放包覆盖全 7 天 → 不应判为学习期
const ocpcFull=D7.map(d=>({date:d,pkg:'PKG_FULL',shows:1000,clicks:50,ctr:5,cost:200,cpc:4}));
FILES=[
  {name:'s.csv',type:'search',rows:D7.map(d=>({date:d,plan:'P1',group:'G1',kw:'K',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:200,conv:3}))},
  {name:'o.csv',type:'ocpc',rows:ocpcFull}
];
runAnalysis();
assert(R.ocpc.has && R.ocpc.learning===false, 'Case A 全周期投放包 → learning=false（不再误报学习期），learnDays='+R.ocpc.learnDays);
// Case B：投放包仅后半 3 天活跃 → 应判学习期
const ocpcNew=['2026-07-10','2026-07-11','2026-07-12'].map(d=>({date:d,pkg:'PKG_NEW',shows:1000,clicks:50,ctr:5,cost:200,cpc:4}));
FILES=[
  {name:'s.csv',type:'search',rows:D7.map(d=>({date:d,plan:'P1',group:'G1',kw:'K',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:200,conv:3}))},
  {name:'o.csv',type:'ocpc',rows:ocpcNew}
];
runAnalysis();
assert(R.ocpc.learning===true && R.ocpc.learnDays===3, 'Case B 新建投放包(活跃3/7天) → learning=true, learnDays=3');
// Case C：周期本身仅 3 天 + 全周期包 → 学习期(样本不足)
const D3=['2026-07-10','2026-07-11','2026-07-12'];
FILES=[
  {name:'s.csv',type:'search',rows:D3.map(d=>({date:d,plan:'P1',group:'G1',kw:'K',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:200,conv:3}))},
  {name:'o.csv',type:'ocpc',rows:D3.map(d=>({date:d,pkg:'PKG',shows:1000,clicks:50,ctr:5,cost:200,cpc:4}))}
];
runAnalysis();
assert(R.ocpc.learning===true && R.ocpc.learnDays===3, 'Case C 短周期(3天)全周期包 → learning=true（样本不足，谨慎）');

/* ============ T5：mergeFiles 去重，不重复累加 ============ */
console.log('\n===== T5 mergeFiles 去重不重复累加 =====');
const baseRows=[
  {date:'2026-07-06',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:50,conv:2},
  {date:'2026-07-07',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:50,conv:3},
  {date:'2026-07-08',plan:'P',group:'G',kw:'K',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:50,conv:1}
];
const singleSum = baseRows.reduce((s,r)=>s+r.conv,0);
// 同一份数据作为两个文件载入（模拟重复导入）
FILES=[ {name:'dup1.csv',type:'search',rows:baseRows.map(r=>({...r}))},
        {name:'dup2.csv',type:'search',rows:baseRows.map(r=>({...r}))} ];
runAnalysis();
assert(R.tot.conv===singleSum, '重复导入同一份数据 → 总转化未被翻倍 (='+R.tot.conv+', 期望='+singleSum+')');
assert(RAW.search.length===baseRows.length, 'RAW.search 去重后行数='+RAW.search.length+' (期望='+baseRows.length+', 非 '+(baseRows.length*2)+')');

/* ============ T6：pct NaN/undefined 安全（防止渲染出 "NaN%"） ============ */
console.log('\n===== T6 pct NaN 安全 =====');
assert(pct(NaN)==='0.00%', 'pct(NaN)=0.00% 而非 NaN% (='+pct(NaN)+')');
assert(pct(undefined)==='0.00%', 'pct(undefined)=0.00% (='+pct(undefined)+')');
assert(pct(null)==='0.00%', 'pct(null)=0.00% (='+pct(null)+')');
assert(pct(0.1234)===(0.1234*100).toFixed(2)+'%', 'pct(0.1234) 正常 (='+pct(0.1234)+')');

/* ============ T7：跨周期环比 新增/流失/上升/下降 识别 ============ */
console.log('\n===== T7 跨周期环比(compare) 识别 =====');
global.localStorage.setItem('sem360_history', JSON.stringify([
  {period:'2026-07-01至2026-07-05', savedAt:'x', cost:1000, conv:8, clicks:100, shows:1000, convKw:{A:5,B:3,E:2}}
]));
const cmpRows=[];
['A','B','C','D','E'].forEach(kw=>{
  D7.forEach(d=>{
    const conv = (kw==='A'&&d==='2026-07-06')?8 : (kw==='C'&&d==='2026-07-12')?4 : (kw==='E'&&d==='2026-07-08')?2 : 0;
    cmpRows.push({date:d,plan:'P',group:'G',kw,query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv});
  });
});
FILES=[{name:'cmp.csv',type:'search',rows:cmpRows}];
runAnalysis();
assert(R.compare && R.compare.period==='2026-07-01至2026-07-05', 'compare 关联到上一周期快照');
const st={}; R.compare.changes.forEach(c=>st[c.kw]=c.st);
assert(st.A==='上升', 'A 5→8 判为 上升');
assert(st.B==='流失', 'B 3→0 判为 流失');
assert(st.C==='新增', 'C 0→4 判为 新增');
assert(st.E==='持平', 'E 2→2 判为 持平');
assert(st.D===undefined, 'D 双周期均 0 转化 → 正确不纳入环比（非 bug）');

/* ============ T8：恒定 CVR 关键词 → Pearson 为 NaN 但不崩 ============ */
console.log('\n===== T8 恒定CVR关键词 → rNew/rLow=NaN 但渲染不崩 =====');
const cstRows=[];
D7.forEach((d,i)=>{ cstRows.push({date:d,plan:'P1',group:'G1',kw:'KS',query:'q'+(i%2),title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:1}); });
FILES=[{name:'cst.csv',type:'search',rows:cstRows}];
runAnalysis();
assert(R.shift && R.shift.data.length>=1, '转化关联诊断产出 data（KS 进入）');
const ksShift=R.shift.data.find(x=>x.kw==='KS');
assert(ksShift && isFinite(ksShift.rNew) && Math.abs(ksShift.rNew)<0.01, 'KS rNew≈0 有限（恒定CVR→无线性相关，正确；='+(ksShift&&ksShift.rNew.toFixed(4))+')');
assert(ksShift && (isNaN(ksShift.rLow) || isFinite(ksShift.rLow)), 'KS rLow 为 NaN(低质量词序列亦恒定→双常数)或有限，均属合理');
try{ renderAll(); assert(true,'rLow=NaN 时 renderAll 不抛异常（isNaN 守卫生效）'); }catch(e){ assert(false,'renderAll 抛异常: '+e.message); }
scanHTML('T8 恒定CVR渲染');

/* =========== T9：导出独立 HTML 报告 exportReport 不崩且含象限名 =========== */
console.log('\n===== T9 exportReport 导出报告 =====');
FILES=[{name:'exp.csv',type:'search',rows:[
  {date:'2026-07-06',plan:'P',group:'G',kw:'KA',query:'q',title:'t',mode:'精确',shows:1000,clicks:80,cost:500,conv:5},
  {date:'2026-07-07',plan:'P',group:'G',kw:'KB',query:'q2',title:'t',mode:'精确',shows:1000,clicks:80,cost:500,conv:0},
  {date:'2026-07-08',plan:'P',group:'G',kw:'KC',query:'q3',title:'t',mode:'精确',shows:1000,clicks:80,cost:50,conv:2}
]}
];
runAnalysis();
try{ exportReport(); assert(true,'exportReport() 不抛异常'); }catch(e){ assert(false,'exportReport 抛异常: '+e.message); }
const expHTML = global.__lastBlob||'';
assert(expHTML.length>300, '导出 HTML 报告已生成（'+expHTML.length+' 字）');
assert(expHTML.includes('360搜索推广效果诊断报告'), '报告含标题');
assert(expHTML.includes('A · 重点词')&&expHTML.includes('B · 问题词')&&expHTML.includes('C · 潜力词')&&expHTML.includes('D · 观察词'), '四象限名称(QUAD_META) 正确渲染（跨文件全局依赖修复生效）');
assert(!/undefined/.test(expHTML), '导出 HTML 无 undefined 字面量');
assert(typeof QUAD_META!=='undefined' && !!QUAD_META.A, 'QUAD_META 为全局可见（part3 定义）');
assert(expHTML.includes('维度专项诊断（v6）'), 'T9 导出报告版本标注为 v6（修复残留 v3）');
assert(!expHTML.includes('（v3）'), 'T9 导出报告无残留 v3 标签');

// ===== T10 digestDiag 学习期天数来源 & 移动端真实设备键 =====
console.log('--- T10 digestDiag 学习期天数/移动端键 ---');
RAW={search:[],geo:[],basic:[],adv:[],rank:[],kw:[],grp:[],plan:[],acct:[],hour:[],invalid:[],ocpc:[],comp:[],pic:[]};
const D7b=['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12'];
const t10s=[]; D7b.forEach(d=>t10s.push({date:d,plan:'P',group:'G',kw:'KW1',query:'q',title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:1}));
FILES=[{name:'t10s.csv',type:'search',rows:t10s}];
FILES.push({name:'t10r.csv',type:'rank',rows:[
  {date:'2026-07-06',plan:'P',group:'G',kw:'KW1',shows:100,clicks:10,cost:20,conv:1,shallow:2,ranks:{'左侧':2.1,'移动端':3.0}},
  {date:'2026-07-07',plan:'P',group:'G',kw:'KW1',shows:100,clicks:10,cost:20,conv:1,shallow:2,ranks:{'左侧':2.0,'移动端':3.1}}
]});
FILES.push({name:'t10o.csv',type:'ocpc',rows:[
  {date:'2026-07-06',pkg:'包A',shows:100,clicks:10,cost:50,ctr:10,cpc:5},
  {date:'2026-07-07',pkg:'包A',shows:100,clicks:10,cost:50,ctr:10,cpc:5},
  {date:'2026-07-08',pkg:'包A',shows:100,clicks:10,cost:50,ctr:10,cpc:5}
]});
runAnalysis();
assert(R.ocpc&&R.ocpc.has&&R.ocpc.learning===true,'T10 oCPC 新建(3/7天活跃)→learning=true');
assert(R.ocpc.learnDays===3,'T10 oCPC learnDays=3（投放包活跃天数）');
const dg10=digestDiag();
assert(dg10.includes('处于学习期(约3天)需保护'),'T10 digestDiag 显示"约3天"(取自learnDays)');
assert(!dg10.includes('学习期(7天)'),'T10 digestDiag 不再误用周期天数(7天)');
assert(dg10.includes('移动端('),'T10 digestDiag 移动端用真实设备键(移动端)而非硬编码"移动"');

// ===== T11 转化词状态分类：衰减漏报修复 =====
console.log('--- T11 转化词状态分类 ---');
RAW={search:[],geo:[],basic:[],adv:[],rank:[],kw:[],grp:[],plan:[],acct:[],hour:[],invalid:[],ocpc:[],comp:[],pic:[]};
const D7c=['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12'];
function kwRows(kw, convByDay){ const rows=[]; D7c.forEach((d,i)=>{ rows.push({date:d,plan:'P',group:'G',kw,query:'q'+kw,title:'t',mode:'精确',shows:100,clicks:10,cost:20,conv:convByDay[i]||0}); }); return rows; }
FILES=[{name:'t11.csv',type:'search',rows:[
  ...kwRows('KW_STABLE',[2,2,2,2,2,2,2]),
  ...kwRows('KW_DECAY',[3,3,3,0,0,0,0]),
  ...kwRows('KW_NEW',[0,0,0,0,0,4,4]),
  ...kwRows('KW_ONCE',[0,0,0,1,0,0,0])
]}];
runAnalysis();
const st11={}; R.convKws.forEach(k=>st11[k.kw]=k.status);
assert(st11.KW_STABLE==='稳定','T11 KW_STABLE(每天转化)→稳定');
assert(st11.KW_DECAY==='衰减','T11 KW_DECAY(前3天转化/近2天归零/convDays=3)→衰减（修复核心：不再误判稳定）');
assert(st11.KW_NEW==='新增','T11 KW_NEW(仅近2天转化)→新增');
assert(st11.KW_ONCE==='偶发','T11 KW_ONCE(单次转化)→偶发');
const p0d=R.actions.filter(a=>a.p===0&&a.mod==='转化词'&&a.act.includes('KW_DECAY'));
assert(p0d.length>0,'T11 衰减核心词 KW_DECAY 触发 P0 转化词告警（buildActions 联动）');

console.log('\n'+(fails===0?'LOGIC_TEST_PASS ✅':'LOGIC_TEST_FAIL ❌ ('+fails+' 项)'));
process.exit(fails===0?0:1);
