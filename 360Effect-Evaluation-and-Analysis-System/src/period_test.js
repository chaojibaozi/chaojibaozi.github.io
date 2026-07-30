/* v16 周期一致性 × 维度组合枚举测试
 * 验证三项能力（用户需求 2026-07-29）：
 *   ① 任意维度组合的分日文件丢入都有正确工作流（枚举 14 类型的代表性组合，合成受控数据）
 *   ② 跨时间周期文件被正确识别：完全不重叠/重叠<3天 → 弹浮层拦截；用户确认后放行且共变 note 如实标注周期错位
 *   ③ 维度太少（无任何可运行模块）→ 弹浮层提示补充文件，不进结果页
 * 全部断言 PASS 输出 TEST_PASS，任一失败输出 TEST_FAIL 并列明。
 */
const fs = require('fs');

/* ---------- DOM shim（记录浮层调用） ---------- */
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
const MODAL_LOG = [];   // 记录 dataAlertModal 的 show 调用与内容
const alertBody = dummyEl(), alertTitle = dummyEl(), alertBtns = dummyEl();
const alertModal = { classList:{ add(c){ if(c==='show') MODAL_LOG.push({title:String(alertTitle.innerHTML||''), body:String(alertBody.innerHTML||'')}); }, remove(){}, contains(){return false} }, style:{} };
global.document = { getElementById:id=>{ if(id==='dataAlertModal') return alertModal; if(id==='dataAlertBody') return alertBody; if(id==='dataAlertTitle') return alertTitle; if(id==='dataAlertBtns') return alertBtns; return dummyEl(); }, querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl(), documentElement:null };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));
function loadScript(p){ let code = fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/part4_analysis.js');
const TOASTS=[]; global.toast = m=>TOASTS.push(m);

/* ---------- 合成受控数据 ---------- */
function days(start,n){ const out=[]; let [y,m,d]=start.split('-').map(Number); for(let i=0;i<n;i++){ out.push(y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')); d++; const dim=new Date(y,m,0).getDate(); if(d>dim){d=1;m++;} if(m>12){m=1;y++;} } return out; }
const GEN = {
  search: ds=>{ const rows=[]; ds.forEach((d,i)=>{ rows.push({date:d,plan:'计划A',group:'组1',title:'创意X',mode:'智能匹配',kw:'工业设备',query:'工业设备价格',shows:1000+i*50,clicks:40+i*2,cost:120+i*8,conv:3+(i%3)}); rows.push({date:d,plan:'计划B',group:'组2',title:'创意Y',mode:'精确匹配',kw:'设备维修',query:'设备维修公司',shows:800,clicks:25,cost:90,conv:1}); }); return rows; },
  geo:    ds=>{ const rows=[]; ds.forEach((d,i)=>{ rows.push({date:d,region:'广东省',city:'深圳市',method:'IP定位',shows:600+i*20,clicks:22+i,cost:70+i*3}); rows.push({date:d,region:'浙江省',city:'杭州市',method:'IP定位',shows:400,clicks:9,cost:45}); }); return rows; },
  hour:   ds=>{ const rows=[]; ds.forEach(d=>{ for(let h=9;h<=11;h++) rows.push({date:d,hour:h,shows:200,clicks:8,cost:25,ctr:4,cpc:3.1}); }); return rows; },
  basic:  ds=>ds.map((d,i)=>({date:d,plan:'计划A',group:'组1',title:'创意X',shows:900+i*30,clicks:30+i,cost:80})),
  adv:    ds=>ds.map(d=>({date:d,plan:'计划A',group:'组1',shows:500,clicks:18,cost:55})),
  invalid:ds=>ds.map((d,i)=>({date:d,before:500,filtered:40+i*2,ratio:8+i*0.4,amount:33+i})),
  ocpc:   ds=>ds.map((d,i)=>({date:d,pkg:'投放包1',phase:'二阶',dev:'全部',shows:2000,clicks:70,ctr:3.5,cost:260,cpc:3.7,shallow:4+(i%2),deep:2,shallowCost:50,deepCost:120})),
  rank:   ds=>ds.map((d,i)=>({date:d,plan:'计划A',group:'组1',kw:'工业设备',shows:700,clicks:26,cost:85,cpc:3.2,conv:2,shallow:1,ranks:{'计算机':1.5+i*0.1}})),
  plan:   ds=>ds.map(d=>({date:d,plan:'计划A',shows:1500,clicks:55,ctr:3.6,cost:170,cpc:3.1})),
  grp:    ds=>ds.map(d=>({date:d,plan:'计划A',group:'组1',shows:1200,clicks:45,ctr:3.7,cost:140,cpc:3.1})),
  acct:   ds=>ds.map(d=>({date:d,shows:2500,clicks:90,ctr:3.6,cost:280,cpc:3.1})),
  pic:    ds=>ds.map(d=>({date:d,pic:'img001.jpg',imgType:'系统配图',shows:300,clicks:5,ctr:1.6,cost:15,cpc:3})),
  comp:   ds=>ds.map(d=>({date:d,type:'子链',shows:250,clicks:4,ctr:1.6,cost:12,cpc:3})),
  kw:     ds=>ds.map(d=>({date:d,plan:'计划A',group:'组1',kw:'工业设备',shows:950,clicks:33,ctr:3.5,cost:100,cpc:3}))
};
function mkFiles(spec){ /* spec: [ [type, dates], ... ] */
  return spec.map(([t,ds],i)=>({name:'合成_'+t+'_'+i+'.csv', type:t, rows:GEN[t](ds), device:'unknown'}));
}
function run(files){
  FILES.length=0; TOASTS.length=0; MODAL_LOG.length=0; R=null; PERIOD_ACK=false;
  alertTitle.innerHTML=''; alertBody.innerHTML='';
  files.forEach(f=>FILES.push(f));
  let threw=null;
  try{ runAnalysis(); }catch(e){ threw=(e&&e.stack)||String(e); }
  return { threw, modal:MODAL_LOG.slice(), R:global.R };
}

const P7  = days('2026-07-01',7);     // 参照周期 7/1-7/7
const P6  = days('2026-06-01',7);     // 完全不重叠
const P7b = days('2026-07-06',7);     // 与 P7 重叠 2 天 (7/6,7/7)
const P7c = days('2026-07-05',7);     // 与 P7 重叠 3 天 (7/5-7/7)
const P2  = days('2026-07-03',2);     // 短周期 2 天，完全落入 P7

let fail=0; const bad=[];
function T(name, cond, info){ const ok=!!cond; if(!ok){ fail++; bad.push(name+(info?' → '+info:'')); } console.log((ok?'  ✅ ':'  ❌ ')+name+(ok?'':(' → '+(info||'')))); }

/* ========== ① 维度组合枚举：单类型 13 种 + 代表性组合，全部同周期，须全部有正确工作流 ========== */
console.log('===== ① 同周期维度组合枚举 =====');
const SINGLE_OK = ['search','geo','hour','basic','ocpc','rank','invalid','plan','grp','acct'];  // 单独丢入应能出结果
SINGLE_OK.forEach(t=>{
  const r = run(mkFiles([[t,P7]]));
  T('单一维度['+t+'] 不抛错', !r.threw, r.threw&&r.threw.slice(0,150));
  T('单一维度['+t+'] 不弹拦截浮层且产出结果', r.modal.length===0 && r.R, 'modal='+r.modal.length+' R='+!!r.R);
});
const SINGLE_BLOCK = ['pic','comp','kw'];   // 无任何可运行模块 → 应弹「维度太少」浮层且不进结果页
SINGLE_BLOCK.forEach(t=>{
  const r = run(mkFiles([[t,P7]]));
  T('单一维度['+t+'] 弹「维度太少」浮层', r.modal.length===1 && /维度太少/.test(r.modal[0].title), 'modal='+JSON.stringify(r.modal.map(m=>m.title)));
  T('单一维度['+t+'] 不进结果页(R为空)', !r.R, 'R='+!!r.R);
});
/* 组合：pic+geo（pic 自身无模块但 geo 有）→ 应正常分析不拦截 */
{
  const r = run(mkFiles([['pic',P7],['geo',P7]]));
  T('组合[pic+geo] 有可运行模块→正常分析', !r.threw && r.modal.length===0 && r.R && r.R.geo.length>0, 'modal='+r.modal.length);
}
/* 组合：kw+plan（kw 无模块但 plan 结构报告兜底）→ 正常 */
{
  const r = run(mkFiles([['kw',P7],['plan',P7]]));
  T('组合[kw+plan] 结构报告兜底→正常分析', !r.threw && r.modal.length===0 && r.R, 'modal='+r.modal.length);
}
/* 全维度同周期 → 正常，共变 note 不应出现周期错位标注 */
{
  const all = Object.keys(GEN).map(t=>[t,P7]);
  const r = run(mkFiles(all));
  T('全维度同周期 不抛错不拦截', !r.threw && r.modal.length===0 && r.R, (r.threw||'').slice(0,150)||('modal='+r.modal.length));
  T('全维度同周期 covar note 无周期错位标注', r.R && r.R.covar && !/重叠不足/.test(r.R.covar.note), r.R&&r.R.covar&&r.R.covar.note.slice(0,100));
  T('全维度同周期 共变含多维度', r.R && r.R.covar && r.R.covar.units.length>0, 'units='+(r.R&&r.R.covar&&r.R.covar.units.length));
}

/* ========== ② 跨周期识别与拦截 ========== */
console.log('\n===== ② 跨周期识别 =====');
/* A. 搜索词7月 + 地域6月（完全不重叠）→ 必须弹浮层拦截 */
{
  const r = run(mkFiles([['search',P7],['geo',P6]]));
  T('A 完全不重叠 → 弹周期浮层', r.modal.length===1 && /周期不一致/.test(r.modal[0].title), JSON.stringify(r.modal.map(m=>m.title)));
  T('A 拦截后不进结果页', !r.R, 'R='+!!r.R);
  T('A 浮层内容含"完全不重叠"', r.modal.length && /完全不重叠/.test(r.modal[0].body), '');
}
/* B. 重叠2天（<3）→ 拦截 */
{
  const r = run(mkFiles([['search',P7],['geo',P7b]]));
  T('B 重叠2天 → 弹周期浮层', r.modal.length===1 && /仅重叠 2 天/.test(r.modal[0].body), JSON.stringify(r.modal.map(m=>m.body.slice(0,80))));
}
/* C. 重叠3天（=阈值）→ 放行 */
{
  const r = run(mkFiles([['search',P7],['geo',P7c]]));
  T('C 重叠3天 → 放行不拦截', r.modal.length===0 && r.R, 'modal='+r.modal.length);
}
/* D. 短周期2天完全落入参照周期 → 放行（不误报） */
{
  const r = run(mkFiles([['search',P7],['invalid',P2]]));
  T('D 2天子周期完全落入 → 放行', r.modal.length===0 && r.R, 'modal='+r.modal.length);
}
/* E. 用户确认后放行（PERIOD_ACK）：共变 note 必须如实标注周期错位维度 */
{
  FILES.length=0; TOASTS.length=0; MODAL_LOG.length=0; R=null; PERIOD_ACK=false;
  mkFiles([['search',P7],['geo',P6]]).forEach(f=>FILES.push(f));
  runAnalysis();                    // 第一次：拦截
  PERIOD_ACK=true; runAnalysis();   // 模拟用户点击「仍要继续分析」
  T('E 确认后放行产出结果', !!R && R.period && R.period.includes('2026-07'), 'period='+(R&&R.period));
  T('E covar note 如实标注地域周期错位', R && R.covar && /地域集中度\(与锚点周期仅重叠0天/.test(R.covar.note), R&&R.covar&&R.covar.note.slice(0,200));
  T('E 地域维度不再虚报"已参与共变"', R && R.covar && !/已参与共变的维度：[^；。]*地域/.test(R.covar.note), '');
  T('E 地域独立模块仍可用(独立解读)', R && R.geo && R.geo.length>0, 'geo='+(R&&R.geo&&R.geo.length));
}
/* F. 无搜索词跨周期：地域6月 + 分时7月 → 拦截（参照=天数最多类型） */
{
  const r = run(mkFiles([['geo',P6],['hour',P7]]));
  T('F 无搜索词跨周期 → 弹周期浮层', r.modal.length===1 && /周期不一致/.test(r.modal[0].title), JSON.stringify(r.modal.map(m=>m.title)));
}
/* G. oCPC锚点 + 跨周期地域：确认后账户级共变 note 也如实标注 */
{
  FILES.length=0; MODAL_LOG.length=0; R=null; PERIOD_ACK=false;
  mkFiles([['ocpc',P7],['geo',P6]]).forEach(f=>FILES.push(f));
  runAnalysis(); PERIOD_ACK=true; runAnalysis();
  T('G oCPC锚点+错位地域 账户级note如实标注', R && R.covar && /地域集中度\(与锚点周期仅重叠0天/.test(R.covar.note), R&&R.covar&&String(R.covar.note).slice(0,200));
}
/* H. 排名周期汇总文件（date为范围串）+ 搜索词分日 → 不应误报周期不一致（特例放行） */
{
  const rankSummary = [{name:'排名汇总.csv',type:'rank',rows:[{date:'2026-07-01至2026-07-07',plan:'计划A',group:'组1',kw:'工业设备',shows:4900,clicks:180,cost:600,cpc:3.3,conv:14,shallow:7,ranks:{'计算机':1.6}}],device:'pc'}];
  const r = run(mkFiles([['search',P7]]).concat(rankSummary));
  T('H 排名周期汇总+搜索词 → 不误报拦截', r.modal.length===0 && r.R, 'modal='+r.modal.length);
  T('H covar note 标注排名为周期汇总', r.R && r.R.covar && /排名\(周期汇总文件/.test(r.R.covar.note), r.R&&r.R.covar&&String(r.R.covar.note).slice(0,200));
}

/* ========== ③ 结果真实性抽查：确认周期过滤后数字仍由真实数据驱动 ========== */
console.log('\n===== ③ 结果真实性抽查 =====');
{
  const r = run(mkFiles([['search',P7],['geo',P7]]));
  const expCost = r.R.tot.cost;
  const manual = GEN.search(P7).reduce((s,x)=>s+x.cost,0);
  T('搜索词总消费=手工求和', Math.abs(expCost-manual)<1e-6, expCost+' vs '+manual);
  const geoCost = r.R.geo.reduce((s,g)=>s+g.cost,0);
  const manualGeo = GEN.geo(P7).reduce((s,x)=>s+x.cost,0);
  T('地域总消费=手工求和', Math.abs(geoCost-manualGeo)<1e-6, geoCost+' vs '+manualGeo);
}

console.log('\n===== 汇总 =====');
if(fail===0) console.log('TEST_PASS 全部断言通过');
else { console.log('TEST_FAIL 失败 '+fail+' 项：'); bad.forEach(b=>console.log('  - '+b)); process.exitCode=1; }
