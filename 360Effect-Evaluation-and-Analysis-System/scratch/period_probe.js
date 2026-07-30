/* 跨周期探针（只读验证）：实证当前系统在「不同维度文件时间周期不重叠」时的真实行为。
 * 预期（修复前）：系统静默运行——period 标签只反映搜索词周期，6月的地域数据被贴上7月周期标签展示，
 * 共变分析因日期错位使 geo 维度序列全 null 而被静默剔除，且无任何 toast/浮层提示。
 * 该探针输出的事实将作为 Bug R（跨周期静默误导）真实性的证据。
 */
const fs = require('fs');

/* ---------- DOM shim（与 subset_test 一致） ---------- */
function dummyEl(){ return new Proxy({ style:{}, classList:{add(){},remove(){},contains(){return false}}, dataset:{}, options:[], value:'', innerHTML:'', textContent:'', disabled:false, addEventListener(){}, appendChild(){}, querySelector(){return dummyEl()}, querySelectorAll(){return []} }, { get(t,k){ if(k in t) return t[k]; return t[k]; }, set(t,k,v){ t[k]=v; return true; } }); }
global.document = { getElementById:()=>dummyEl(), querySelector:()=>dummyEl(), querySelectorAll:()=>[], createElement:()=>dummyEl(), body:dummyEl(), documentElement:null };
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));
function loadScript(p){ let code = fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var '); (0,eval)(code); }
loadScript(__dirname+'/../src/part3_core.js');
global.renderAll = ()=>{};
loadScript(__dirname+'/../src/part4_analysis.js');

/* 捕获所有 toast 调用（判定是否有周期提示） */
const TOASTS = [];
global.toast = m => TOASTS.push(m);

/* ---------- 合成受控数据 ---------- */
function days(start, n){ const out=[]; const d=new Date(start+'T00:00:00'); for(let i=0;i<n;i++){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); } return out; }
function mkSearch(dates){ const rows=[]; dates.forEach((d,i)=>{ rows.push({date:d,plan:'计划A',group:'组1',title:'创意标题X',mode:'智能匹配',kw:'工业设备',query:'工业设备价格',shows:1000+i*50,clicks:40+i*2,cost:120+i*8,conv:3+(i%3)}); rows.push({date:d,plan:'计划B',group:'组2',title:'创意标题Y',mode:'精确匹配',kw:'设备维修',query:'设备维修公司',shows:800,clicks:25,cost:90,conv:1}); }); return rows; }
function mkGeo(dates){ const rows=[]; dates.forEach(d=>{ rows.push({date:d,region:'广东省',city:'深圳市',method:'IP定位',shows:600,clicks:22,cost:70}); rows.push({date:d,region:'浙江省',city:'杭州市',method:'IP定位',shows:400,clicks:9,cost:45}); }); return rows; }
function mkHour(dates){ const rows=[]; dates.forEach(d=>{ for(let h=9;h<=11;h++) rows.push({date:d,hour:h,shows:200,clicks:8,cost:25,ctr:4,cpc:3.1}); }); return rows; }
function mkPic(dates){ return dates.map(d=>({date:d,pic:'img001.jpg',imgType:'系统配图',shows:300,clicks:5,ctr:1.6,cost:15,cpc:3})); }

function run(name, files){
  FILES.length=0; TOASTS.length=0; R=null;
  files.forEach(f=>FILES.push(f));
  let threw=null;
  try{ runAnalysis(); }catch(e){ threw=e&&e.message; }
  console.log('\n=== 场景：'+name+' ===');
  console.log('  抛错:', threw||'无');
  if(!threw){
    console.log('  R.period =', R.period);
    console.log('  R.geo 条数 =', R.geo&&R.geo.length, R.geo&&R.geo[0]? '(Top='+R.geo[0].region+')':'');
    if(R.covar){
      console.log('  covar.units =', R.covar.units.length,
        R.covar.units.length? ' drivers=['+R.covar.units[0].drivers.map(x=>x.dim).join(',')+'] excludes=['+(R.covar.units[0].excludes||[]).join(',')+']':'');
      console.log('  covar.note 摘要 =', String(R.covar.note||'').slice(0,120));
    }
    console.log('  hour.has =', R.hour&&R.hour.has);
  }
  console.log('  toast 记录('+TOASTS.length+'):', TOASTS.map(t=>t.slice(0,60)));
  const periodHint = TOASTS.some(t=>/周期|重叠|时间不一致|不同时间/.test(t));
  console.log('  >>> 是否有任何周期不一致提示：', periodHint? '有':'❌ 无（静默）');
}

const JUL = days('2026-07-01',7), JUN = days('2026-06-01',7), JULpart = days('2026-07-05',8);

/* A. 搜索词(7月) + 地域(6月) 完全不重叠 */
run('A 搜索词7月 + 地域6月（完全不重叠）', [
  {name:'搜索词报告.csv',type:'search',rows:mkSearch(JUL),device:'unknown'},
  {name:'地域报告.csv',type:'geo',rows:mkGeo(JUN),device:'unknown'}
]);

/* B. 搜索词(7/1-7/7) + 地域(7/5-7/12) 部分重叠 */
run('B 搜索词7/1-7/7 + 地域7/5-7/12（部分重叠3天）', [
  {name:'搜索词报告.csv',type:'search',rows:mkSearch(JUL),device:'unknown'},
  {name:'地域报告.csv',type:'geo',rows:mkGeo(JULpart),device:'unknown'}
]);

/* C. 无搜索词：地域(6月) + 分时(7月) 完全不重叠 */
run('C 无搜索词：地域6月 + 分时7月（完全不重叠）', [
  {name:'地域报告.csv',type:'geo',rows:mkGeo(JUN),device:'unknown'},
  {name:'分时报告.csv',type:'hour',rows:mkHour(JUL),device:'unknown'}
]);

/* D. 仅配图报告（无任何可运行模块） */
run('D 仅创意配图报告（维度太少：0个模块可运行）', [
  {name:'配图报告.csv',type:'pic',rows:mkPic(JUL),device:'unknown'}
]);

/* E. 对照组：搜索词+地域 同周期（应正常无提示） */
run('E 对照：搜索词7月 + 地域7月（同周期）', [
  {name:'搜索词报告.csv',type:'search',rows:mkSearch(JUL),device:'unknown'},
  {name:'地域报告.csv',type:'geo',rows:mkGeo(JUL),device:'unknown'}
]);
console.log('\n===== 探针结束 =====');
