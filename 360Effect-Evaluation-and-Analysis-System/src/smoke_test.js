/* 自包含合成 smoke 测试：不依赖用户外部 CSV，校验本轮修复不回归且关键逻辑正确 */
const fs = require('fs');

/* ---------- 稳定 DOM 桩（同一 id 返回同一元素，便于回读 textContent） ---------- */
const _reg = {};
function makeEl(id){
  const el = { id, style:{}, dataset:{}, _text:'', _html:'', disabled:false,
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)}, toggle(c,on){ on? this._s.add(c):this._s.delete(c) } },
    addEventListener(){}, appendChild(){},
    querySelector(){ return makeEl('q') }, querySelectorAll(){ return [] } };
  Object.defineProperty(el,'textContent',{ get(){return this._text}, set(v){this._text=v} });
  Object.defineProperty(el,'innerHTML',{ get(){return this._html}, set(v){this._html=v} });
  return el;
}
function getEl(id){ return _reg[id] || (_reg[id]=makeEl(id)); }
global.document = {
  getElementById:id=>getEl(id),
  querySelector(sel){ const e=makeEl('sel'); if(sel && sel.includes('p-diag')) e.dataset.p='p-diag'; return e; },
  querySelectorAll:()=>[],
  createElement:()=>makeEl('new'),
  body:makeEl('body')
};
global.window = { scrollTo(){} };
global.localStorage = { _s:{}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} };
global.navigator = { clipboard:{ writeText:()=>Promise.resolve() } };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('offline test'));

function loadScript(p){ let code=fs.readFileSync(p,'utf8').replace(/^(let|const) /gm,'var '); (0,eval)(code); }

loadScript(__dirname+'/part3_core.js');
loadScript(__dirname+'/part4_analysis.js');
loadScript(__dirname+'/part5_render.js'); // 含 renderRankDiag（验证 verdictCol 修复）
loadScript(__dirname+'/part6_ai.js');     // 含 updateAIModeUI（验证离线按钮文案修复）
global.renderAll = ()=>{};                 // part5 加载后重新覆盖真实 renderAll，跳过 canvas 图表渲染（Node 无 canvas）

/* ---------- 合成分日 CSV ---------- */
const S_DATES = ['2026-07-18','2026-07-19','2026-07-20'];
function joinRows(header, rows){ return [header, ...rows].join('\n'); }

const searchCSV = joinRows(
  '时间,推广计划,推广组,创意标题,触发模式,关键词,搜索词,展示次数,点击次数,点击率,总费用,转化数',
  S_DATES.map((d,i)=>`${d},JP-品牌词,G1,捷配pcb品质下单,精确,捷配pcb下单,捷配pcb在线下单,300,30,10%,${90+i*10},${[2,3,1][i]}`)
    .concat(S_DATES.map((d,i)=>`${d},JP-品牌词,G2,pcb打样标题,短语,pcb打样,pcb打样在线,200,15,7.5%,${40+i*5},${[0,1,0][i]}`))
    .concat(S_DATES.map((d,i)=>`${d},JP-通用词,G3,铝基板标题,广泛,铝基板,铝基板厂家,500,20,4%,${120+i*10},0`))
);
const geoCSV = joinRows(
  '时间,省级地区,地域定位,展示次数,点击次数,总费用',
  ['浙江','广东','江苏'].flatMap(rg=>S_DATES.map(d=>`${d},${rg},按省,400,30,60`))
);
const basicCSV = joinRows(
  '时间,推广计划,推广组,创意标题,展示次数,点击次数,总费用',
  S_DATES.map((d,i)=>`${d},JP-品牌词,G1,捷配pcb品质下单,300,30,90`)
    .concat(S_DATES.map((d,i)=>`${d},JP-品牌词,G1,捷配pcb次优标题,300,12,90`))
);
const advCSV = joinRows(
  '时间,推广计划,推广组,展示次数,点击次数,总费用',
  S_DATES.map(d=>`${d},JP-品牌词,G1,600,42,180`)
);
/* PC 排名：含 平均排名（左侧）/（计算机） */
const rankPC = joinRows(
  '时间,推广计划,推广组,关键词,展示次数,点击次数,点击率,总费用,平均每次点击费用,平均排名（左侧）,平均排名（计算机）,浅层转化数,转化数',
  S_DATES.map((d,i)=>`${d},JP-品牌词,G1,捷配pcb下单,300,30,10%,90,3,1.20,1.35,5,${[2,3,1][i]}`)
);
/* 移动排名：含 平均排名（移动端）—— 真实 (5) 导出键名 */
const rankMobile = joinRows(
  '时间,推广计划,推广组,关键词,展示次数,点击次数,点击率,总费用,平均每次点击费用,平均排名（移动端）,浅层转化数,转化数',
  S_DATES.map((d,i)=>`${d},JP-品牌词,G1,捷配pcb下单,260,28,10.7%,80,2.85,3.50,4,${[2,3,1][i]}`)
);
const hourCSV = joinRows(
  '时间,展示次数,点击次数,点击率,总费用,平均每次点击费用',
  S_DATES.map(d=>`${d} 08:00至09:00,200,20,10%,40,2`).concat(S_DATES.map(d=>`${d} 02:00至03:00,50,1,2%,5,5`))
);
const invalidCSV = joinRows(
  '时间,过滤前点击量,过滤点击量,过滤比,过滤金额',
  S_DATES.map(d=>`${d},100,22,22,11`)
);
const ocpcCSV = joinRows(
  '时间,oCPC投放包,展示次数,点击次数,点击率,总费用,平均每次点击费用',
  S_DATES.map(d=>`${d},品牌词包,600,42,7%,180,4.28`)
);

function feed(name, csv){
  const rows = parseCSV(csv);
  const type = detectType(rows[0], name);
  if(!type) throw new Error('detectType 失败: '+name);
  FILES.push({ name, type, rows: rowsToObjects(type, rows) });
}

/* ---------- 用例 1：完整分析（含 移动端 设备键） ---------- */
feed('搜索词报告.csv', searchCSV);
feed('地域分析报告.csv', geoCSV);
feed('基础创意报告.csv', basicCSV);
feed('高级创意报告.csv', advCSV);
feed('关键词报告(4).csv', rankPC);     // 文件名含"关键词" + 含平均排名 → rank
feed('关键词报告(5).csv', rankMobile); // 含 平均排名（移动端）
feed('分时分析报告.csv', hourCSV);
feed('无效点击报告.csv', invalidCSV);
feed('oCPC报告.csv', ocpcCSV);

runAnalysis();
console.log('【用例1 完整分析】');
console.log('  周期:', R.period, '| 日期数:', R.dates.length, '| 总转化:', R.tot.conv, '| CPA:', R.tot.cpa?.toFixed(2));
console.log('  转化词:', R.convKws.map(k=>`${k.kw}(${k.conv},${k.status})`).join(', '));
console.log('  排名设备维度:', R.rank.devices);

/* 断言：移动端 设备键被识别并产出移动判定 */
const mobileUnits = R.rank.diag.filter(d=>d.mobile);
if(!mobileUnits.length) throw new Error('设备感知失败：未识别 移动端 排名（d.mobile 为空）');
if(!R.rank.devices.includes('移动端')) throw new Error('排名设备维度未包含 移动端');
if(!R.rank.diag.some(d=>d.ranks && d.ranks['移动端']!=null)) throw new Error('排名数据未保留 移动端 列');
const mobSample = R.rank.diag.find(d=>d.mobile);
if(mobSample.mobile.dev!=='移动端') throw new Error('移动设备标签应为 移动端，实际='+mobSample.mobile.dev);
console.log('  ✔ 移动端设备键识别: 样本词', mobSample.kw, '→ 移动判定', mobSample.mobile.verdict, '(dev='+mobSample.mobile.dev+')');

/* 断言：renderRankDiag 不崩溃，且 判定(主设备) 列左对齐（verdictCol 指向文本列而非 周期CTR 数字列） */
const before = getEl('diagRank').innerHTML;
renderRankDiag();
const html = getEl('diagRank').innerHTML;
if(!html || !html.includes('判定(主设备)')) throw new Error('renderRankDiag 未产出判定列');
if(!html.includes(mobSample.kw)) throw new Error('renderRankDiag 未包含命中词');
console.log('  ✔ renderRankDiag 正常产出（含判定列与移动端数据）');

/* ---------- 用例 2：无搜索词报告，仅排名文件（自适应降级） ---------- */
const savedFiles = FILES;
const onlyRank = '时间,推广计划,推广组,关键词,展示次数,点击次数,点击率,总费用,平均每次点击费用,平均排名（移动端）,浅层转化数,转化数\n'+
  '2026-07-18,JP,G1,测试词A,100,10,10%,20,2,3,5,6\n'+
  '2026-07-19,JP,G1,测试词A,120,12,10%,24,2,3,6,7';
const rRows = parseCSV(onlyRank);
const rType = detectType(rRows[0], '关键词报告(5).csv');
if(rType!=='rank') throw new Error('合成排名 detectType 应为 rank');
FILES = [{ name:'__only_rank__', type:rType, rows: rowsToObjects(rType, rRows) }];
runAnalysis();
console.log('\n【用例2 仅排名文件·无搜索词·自适应降级】');
console.log('  noSearch=', R.noSearch, '| rank.has=', R.rank.has, '| rank.diag=', R.rank.diag.length, '| 总览转化=', R.tot.conv);
if(!R.noSearch) throw new Error('无搜索时应置 noSearch=true');
if(!R.rank || !R.rank.has || !R.rank.diag.length) throw new Error('仅排名文件时排名诊断应基于浅层/深层转化排序产出');
console.log('  ✔ 降级正常：rank.diag 基于浅层+深层转化排序产出', R.rank.diag.map(d=>d.kw+'→'+(d.primary?d.primary.verdict:'?')).join(' | '));
FILES = savedFiles;

/* ---------- 用例 3：updateAIModeUI 按钮文案（离线/DeepSeek 双模） ---------- */
console.log('\n【用例3 离线/DeepSeek 按钮文案】');
SET.dsKey = '';            // 无 Key
SET.aiMode = 'offline';
updateAIModeUI();
if(getEl('btnGlobalAI').textContent !== '🧠 离线摘要') throw new Error('无Key时按钮应为「🧠 离线摘要」，实际='+getEl('btnGlobalAI').textContent);
console.log('  ✔ 无Key →', getEl('btnGlobalAI').textContent);

SET.dsKey = 'sk-test123';  // 有 Key
SET.aiMode = 'deepseek';
updateAIModeUI();
if(getEl('btnGlobalAI').textContent !== '🤖 AI诊断') throw new Error('DeepSeek模式按钮应为「🤖 AI诊断」，实际='+getEl('btnGlobalAI').textContent);
console.log('  ✔ 有Key+DeepSeek →', getEl('btnGlobalAI').textContent);

SET.aiMode = 'offline';
updateAIModeUI();
if(getEl('btnGlobalAI').textContent !== '🧠 离线摘要') throw new Error('离线模式按钮应为「🧠 离线摘要」');
console.log('  ✔ 有Key+离线 →', getEl('btnGlobalAI').textContent);

console.log('\nSMOKE_PASS');
