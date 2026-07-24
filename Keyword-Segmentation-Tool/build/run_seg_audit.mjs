import { classifyBatch } from './test_seg_audit.mjs';
import fs from 'fs';
import path from 'path';

/* ============================================================
   构造 1000+ 关键词测试集（覆盖 40+ 行业）
   每条: {kw, expect: 理想类, bad:[绝不应命中的类]}
   评测两条主线:
   1) 网络/社交/媒体/电商/游戏等“网络词” 是否被误判为 company/factory/phone
   2) 各行业产品词占比 & 常见误分
   ============================================================ */

const CASES = [];
const add = (kw, expect, bad = []) => CASES.push({ kw, expect, bad });

// —— 网络/互联网 核心词（重点排查：绝不应为 company/factory/phone）——
const NET_NO_COMPANY = ['company', 'factory', 'phone'];
[
  '游戏平台','游戏论坛','游戏社区','游戏资讯','游戏攻略','游戏媒体','游戏视频','游戏直播',
  '直播平台','直播带货','短视频','短视频运营','短视频推广','短视频剪辑',
  '社交平台','社交软件','社区团购','兴趣社区','母婴社区','汽车论坛','篮球论坛','数码论坛',
  '母婴论坛','装修论坛','摄影论坛','钓鱼论坛','育儿社区','美妆社区','健身社区',
  '资讯平台','资讯网站','新闻资讯','行业资讯','财经资讯','科技资讯','娱乐资讯',
  '自媒体','自媒体运营','新媒体运营','公众号','公众号代运营','公众号涨粉',
  '网店','网店转让','网店代运营','淘宝店','天猫店','跨境电商','电商代运营','电商培训',
  '直播带货培训','抖音代运营','抖音运营','小红书运营','小红书推广','视频号运营',
  '交友软件','相亲平台','婚恋网站','语音房','陪聊','脱单','红娘',
  '论坛推广','社区运营','平台推广','媒体投放','软文发布','新闻源发布','媒体发布',
  '涨粉','刷粉','引流','私域流量','社群运营','社群营销','裂变营销',
  '小程序','小程序开发','小程序商城','APP开发','APP推广','网站建设','网页设计',
  '直播软件','直播系统','直播源码','短视频源码','社交源码','商城系统','点餐系统',
  '游戏加速器','网游加速器','游戏代练','游戏陪玩','游戏账号','游戏币','游戏装备','游戏点卡','游戏充值',
  '棋牌游戏','手游','网游','端游','页游','单机游戏','电竞','电竞馆',
].forEach(k => add(k, 'core/longtail/其它非公司', NET_NO_COMPANY));

// —— 常见“行业名+平台/网站/APP”长尾（网络词，易误判 company）——
['旅游网站','旅游平台','旅游APP','招聘网站','招聘平台','求职APP','房产网站','房产平台',
 '二手车平台','二手车网站','汽车之家','教育平台','在线教育平台','学习APP','外卖平台',
 '本地生活平台','团购网站','团购平台','医疗资讯网站','健康资讯平台','母婴电商平台',
 '生鲜电商','社区电商','直播电商','内容电商','私域电商','短视频电商',
].forEach(k => add(k, 'core/longtail/brand', NET_NO_COMPANY));

// —— 品牌词（互联网品牌，应为 brand，绝不应 company）——
['抖音','快手','小红书','哔哩哔哩','拼多多','淘宝','京东','美团','饿了么','滴滴',
 '知乎','豆瓣','微博','虎扑','斗鱼','虎牙','爱奇艺','优酷','芒果TV','BOSS直聘',
].forEach(k => add(k, 'brand', ['company', 'factory', 'phone']));

// —— 医疗（含真实公司词，用于确认 company 仍能正确命中）——
['妇科医院','男科医院','整形医院','口腔诊所','眼科医院','体检中心','月子中心','康复中心']
  .forEach(k => add(k, 'company', []));
['牙齿矫正','种植牙','近视手术','双眼皮','隆鼻','水光针','祛斑','脱毛','妇科检查','无痛人流',
 '割包皮','怎么治疗鼻炎','鼻炎怎么根治','近视手术多少钱','种植牙价格','洗牙多少钱']
  .forEach(k => add(k, 'core/longtail/question/price', ['company']));

// —— 机械（含真实厂家/公司词）——
['空压机厂家','数控机床厂家','叉车厂家','发电机厂家','机械设备公司','模具厂']
  .forEach(k => add(k, 'factory/company', []));
['空压机','数控机床','激光切割机','注塑机','挖掘机','变频器','伺服电机','空压机价格',
 '空压机多少钱','空压机型号','螺杆空压机','空压机怎么选','空压机保养','二手空压机']
  .forEach(k => add(k, 'core/longtail/price/model/question', ['company']));

// —— 电子/化工/农业/家电/食品/汽配 产品核心词（不应 company/phone）——
['电阻','电容','芯片','二极管','三极管','电路板','连接器','传感器','继电器','断路器',
 '橡胶','树脂','环氧树脂','固化剂','钛白粉','碳酸钙','玻璃纤维','活性炭','聚氨酯',
 '种子','化肥','农药','兽药','饲料','鱼苗','大棚','滴灌','收割机','拖拉机',
 '空调','冰箱','洗衣机','热水器','油烟机','净水器','空气炸锅','扫地机器人',
 '零食','坚果','大米','食用油','奶粉','蜂蜜','枸杞','燕窝','火锅底料',
 '刹车片','机油','轮胎','火花塞','蓄电池','雨刮器','行车记录仪',
].forEach(k => add(k, 'core/longtail', ['company', 'factory', 'phone']));

// —— 价格/疑问/口碑/促销修饰词优先级验证 ——
['空调多少钱','冰箱价格','洗衣机报价','手机价格','笔记本多少钱'].forEach(k => add(k, 'price', []));
['空调怎么选','冰箱哪个牌子好','洗衣机怎么样','手机哪款好'].forEach(k => add(k, 'question/reputation', []));
['空调优惠','冰箱促销','双11活动','618优惠券'].forEach(k => add(k, 'promo', []));
['空调好评','冰箱口碑','洗衣机测评','手机对比'].forEach(k => add(k, 'reputation', []));

// —— 地域词误命中排查（含易误短地名子串）——
['朝阳产业','河东狮吼','和平精英','长安汽车','南开大学','宝山钢铁','花都汽车城']
  .forEach(k => add(k, '非geo(brand/core/longtail)', ['geo']));
['北京装修公司','上海律师','广州搬家','深圳留学中介'].forEach(k => add(k, 'geo/company', []));

// —— 属性词误命中排查（core 应压过 attribute）——
['变频器','变频空调','智能门锁','节能灯','防水涂料','实木家具']
  .forEach(k => add(k, 'core/longtail', ['attribute']));

// —— 批量生成：40 行业 × 产品词 × 修饰，凑足 1000+ ——
const INDUSTRY_PRODUCTS = {
  '教育': ['考研','雅思','托福','留学','编程培训','公务员培训','会计培训','少儿英语','美术培训','驾校'],
  '法律': ['离婚律师','债务律师','刑事律师','劳动仲裁','工伤赔偿','合同纠纷','法律咨询','交通事故'],
  '金融': ['信用卡','消费贷','抵押贷款','企业贷款','车险','重疾险','基金定投','POS机','融资','征信'],
  '装修': ['家装','全屋定制','旧房改造','别墅装修','水电改造','防水补漏','装修设计','室内设计'],
  '旅游': ['跟团游','自由行','自驾游','出境游','度假村','温泉','邮轮','研学游','旅游线路','签证'],
  '电子': ['变压器','电缆','LED灯珠','伺服电机','步进电机','电磁阀','配电柜','稳压器','万用表'],
  '化工': ['溶剂','胶粘剂','密封胶','催化剂','染料','润滑油','防锈剂','表面活性剂','工程塑料'],
  '农业': ['树苗','果苗','苗木','农膜','温室','养殖设备','孵化机','种猪','牧草','园林绿化'],
  '家电': ['中央空调','燃气灶','消毒柜','洗碗机','破壁机','加湿器','除湿机','新风系统','按摩椅'],
  '食品': ['月饼','粽子','螺蛳粉','自热锅','蛋白粉','维生素','钙片','鱼油','叶黄素','阿胶'],
  '安防': ['监控安装','门禁系统','报警器','消防器材','安检门','车牌识别','人脸识别','弱电工程'],
  '环保': ['污水处理','废气处理','除尘设备','环保工程','光伏发电','垃圾处理','脱硫','环境监测'],
  '成人': ['情趣用品','避孕套','延时喷剂','润滑剂','情趣内衣','飞机杯','按摩棒','两性用品'],
  '美妆': ['面膜','精华液','眼霜','防晒霜','粉底液','口红','卸妆水','香水','美容仪','洗发水'],
  '房产': ['新房','楼盘','商品房','公寓','商铺','写字楼','厂房','车位','二手房','租房'],
  '通信': ['宽带','流量卡','手机卡','话费','靓号','物联网卡','企业宽带','400电话','视频会议'],
  '办公': ['办公家具','会议设备','墨盒','硒鼓','碳粉','标书制作','文件柜','保险柜','打卡机'],
  '招聘': ['招聘','求职','兼职','猎头','劳务派遣','灵活用工','社保代缴','蓝领招聘','简历'],
  '汽配': ['轮胎','机油','刹车片','火花塞','蓄电池','行车记录仪','车膜','导航仪','脚垫'],
  '母婴': ['奶粉','纸尿裤','婴儿车','安全座椅','奶瓶','辅食','益生菌','吸奶器','待产包','绘本'],
};
const MODS = ['', '价格', '多少钱', '哪家好', '怎么选', '厂家', '公司', '批发', '推荐', '排名'];
for (const [ind, prods] of Object.entries(INDUSTRY_PRODUCTS)) {
  for (const p of prods) {
    for (const m of MODS) {
      const kw = p + m;
      let expect = 'core/longtail', bad = [];
      if (m === '价格' || m === '多少钱' || m === '批发') expect = 'price';
      else if (m === '哪家好' || m === '推荐' || m === '排名') expect = 'reputation/question';
      else if (m === '怎么选') expect = 'question';
      else if (m === '厂家') expect = 'factory';
      else if (m === '公司') expect = 'company';
      else { expect = 'core/longtail'; bad = ['company', 'factory', 'phone']; }
      add(kw, expect, bad);
    }
  }
}

/* ============ 运行分类 ============ */
const keywords = CASES.map(c => c.kw);
const results = classifyBatch(keywords);
const byKw = new Map(results.map(r => [r.kw, r]));

/* ============ 评测 ============ */
let total = 0, badHit = 0;
const netCompanyErrors = [];   // 网络词→公司/厂家/电话 的误判
const otherBadErrors = [];     // 其它 bad 命中
const catDist = {};

for (const c of CASES) {
  const r = byKw.get(c.kw);
  if (!r) continue;
  total++;
  catDist[r.cat] = (catDist[r.cat] || 0) + 1;
  if (c.bad.includes(r.cat)) {
    badHit++;
    const rec = { kw: c.kw, got: r.catName, gotId: r.cat, rule: r.rule, expect: c.expect };
    if (['company', 'factory', 'phone'].includes(r.cat) && c.bad.includes(r.cat) &&
        NET_NO_COMPANY.every(x => c.bad.includes(x))) {
      // 属于“网络/产品词不应进公司/厂家/电话”这一大类
    }
    if (r.cat === 'company' || r.cat === 'factory' || r.cat === 'phone') netCompanyErrors.push(rec);
    else otherBadErrors.push(rec);
  }
}

/* ============ 网络词专项统计 ============ */
const netCases = CASES.filter(c => c.bad.includes('company') && c.bad.includes('factory'));
let netTotal = 0, netWrong = 0;
const netWrongList = [];
for (const c of netCases) {
  const r = byKw.get(c.kw); if (!r) continue;
  netTotal++;
  if (['company', 'factory', 'phone'].includes(r.cat)) { netWrong++; netWrongList.push({ kw: c.kw, got: r.catName, rule: r.rule }); }
}

const out = {
  total, badHit, badRate: (badHit / total * 100).toFixed(1),
  netTotal, netWrong, netWrongRate: (netWrong / netTotal * 100).toFixed(1),
  catDist,
  netWrongList, netCompanyErrors, otherBadErrors,
};
fs.writeFileSync(path.join(import.meta.dirname, 'audit_result.json'), JSON.stringify(out, null, 2), 'utf-8');

console.log('总用例:', total);
console.log('bad命中(明显误分):', badHit, `(${out.badRate}%)`);
console.log('---网络/产品词专项---');
console.log('网络/产品词样本:', netTotal, ' 被误判为公司/厂家/电话:', netWrong, `(${out.netWrongRate}%)`);
console.log('\n分类分布:');
Object.entries(catDist).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ', k.padEnd(12), v));
console.log('\n网络词误判为公司/厂家 示例(前40):');
netWrongList.slice(0, 40).forEach(e => console.log(`  「${e.kw}」→ ${e.got}  [${e.rule}]`));
