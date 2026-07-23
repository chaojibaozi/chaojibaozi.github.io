const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'app.html');
const html = fs.readFileSync(appPath, 'utf-8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script found'); process.exit(1); }
let code = m[1];

function makeProxy() {
  const target = function(){};
  target.style = {}; target.dataset = {};
  target.classList = { add(){}, remove(){}, toggle(){}, contains(){return false;} };
  target.children = []; target.files = []; target.value=''; target.textContent=''; target.innerHTML=''; target.checked=false;
  target.appendChild = (c) => c; target.querySelectorAll = () => []; target.querySelector = () => makeProxy();
  target.addEventListener = () => {}; target.setAttribute = () => {}; target.getContext = () => null;
  return new Proxy(target, { get(t,p){ if(p in t) return t[p]; if(p==='length') return 0; return makeProxy(); }, set(t,p,v){ t[p]=v; return true; } });
}
const documentStub = { getElementById: () => makeProxy(), createElement: () => makeProxy(), addEventListener: () => {}, body: makeProxy() };

code += '\n;return {state, runClassification, classify, CATEGORIES, CAT_NAME, parseCSV, detectHeader};';
const factory = new Function('document','XLSX','FileReader','window','setTimeout','clearTimeout', code);
const api = factory(documentStub, {}, function(){}, {}, setTimeout, clearTimeout);

/* 模拟真实数据集：同一品类(空调/家电为主)大量关键词，产品根反复出现，
   用于复现「产品词占比过高」并验证优化后分布是否均衡。 */
const sample = [
  // 纯品类/核心词（应为 核心词）
  "空调","冰箱","洗衣机","热水器","油烟机","扫地机器人","破壁机",
  // 型号词（应为 型号词）
  "格力 云佳 空调","美的 酷省电 空调","iPhone 15","华为 Mate 60","小米 空调 Pro","海尔 BCD-470 冰箱",
  // 价格/交易词（应为 价格词）
  "空调 多少钱","变频空调 价格","中央空调 报价","二手空调 回收","空调 批发 厂家","洗衣机 性价比","冰箱 便宜",
  // 疑问词
  "空调 怎么选","空调 怎么清洗","变频空调 是什么","空调 e1 是什么故障","洗衣机 哪个好",
  // 口碑/比较词
  "格力空调 怎么样","美的空调 好评","空调 避坑","空调 质量","大金空调 对比 格力","空调 口碑",
  // 活动词
  "空调 618 满减","空调 双11 优惠","空调 以旧换新 补贴","空调 优惠券",
  // 属性/功能词
  "变频 空调","一级能效 空调","静音 空调","空调 3匹","超薄 空调","空调 白色",
  // 人群/场景词
  "老人 空调","母婴 空调","出租房 空调","卧室 空调",
  // 地域词
  "北京 空调 维修","上海 空调 安装","广州 中央空调",
  // 品牌词（纯品牌+品类）
  "格力空调","美的冰箱","海尔洗衣机","苏泊尔","九阳",
  // 长尾（产品根+未识别修饰，应为 长尾词或落到修饰类）
  "空调 遥控器 万能款","空调 挂机 卧室 用","冰箱 除味 小妙招"
];
api.state.header = null;
api.state.dataRows = sample.map(k => [k]);
api.state.keywordCol = 0;
api.runClassification();
const results = api.state.results;

console.log('TOTAL', results.length, 'LEARNED(品类词根):', [...api.state.learned].join(','));
results.forEach(r => console.log(`${r.kw.padEnd(20)} => ${api.CAT_NAME[r.cat].padEnd(5)} ${String(r.conf).padStart(3)}%  [${r.rule[0]||''}]`));

// 分布统计
const dist = {};
results.forEach(r => dist[r.cat] = (dist[r.cat]||0)+1);
console.log('\n===== 分类分布 =====');
api.CATEGORIES.forEach(c => { const n=dist[c.id]||0; if(n) console.log(`${c.name.padEnd(6)} ${String(n).padStart(3)}  ${'█'.repeat(n)} ${(n/results.length*100).toFixed(1)}%`); });
const prodShare = ((dist.core||0)+(dist.model||0)+(dist.longtail||0))/results.length*100;
console.log(`\n产品类合计(核心+型号+长尾) 占比: ${prodShare.toFixed(1)}%  （旧版单一产品词曾达 80%+）`);

// 关键断言：验证意图优先与细分正确
const expect = {
  "空调":"core","冰箱":"core","扫地机器人":"core",
  "iPhone 15":"model","华为 Mate 60":"model","海尔 BCD-470 冰箱":"model",
  "空调 多少钱":"price","变频空调 价格":"price","中央空调 报价":"price","二手空调 回收":"price","空调 批发 厂家":"price","冰箱 便宜":"price",
  "空调 怎么选":"question","变频空调 是什么":"question","洗衣机 哪个好":"question",
  "格力空调 怎么样":"question","美的空调 好评":"reputation","空调 避坑":"reputation","空调 质量":"reputation","空调 口碑":"reputation",
  "空调 618 满减":"promo","空调 双11 优惠":"promo","空调 优惠券":"promo",
  "变频 空调":"attribute","一级能效 空调":"attribute","静音 空调":"attribute","超薄 空调":"attribute","空调 白色":"attribute",
  "老人 空调":"audience","母婴 空调":"audience",
  "北京 空调 维修":"geo","上海 空调 安装":"geo","广州 中央空调":"geo",
  "格力空调":"brand","美的冰箱":"brand","海尔洗衣机":"brand"
};
let pass=0, fail=0;
for (const [kw, exp] of Object.entries(expect)) {
  const r = results.find(x => x.kw === kw);
  if (r && r.cat === exp) pass++;
  else { fail++; console.log('MISMATCH', kw, 'expected', exp, 'got', r?r.cat:'?'); }
}
console.log(`\nASSERT pass=${pass} fail=${fail}`);

const csv = '关键词,搜索量\n苹果手机,1234\n"华为, mate",999\n怎么选空调,88\n';
const rows = api.parseCSV(csv);
console.log('CSV rows:', JSON.stringify(rows));
console.log('CSV_OK', rows.length===4 && rows[2][0]==='华为, mate');
