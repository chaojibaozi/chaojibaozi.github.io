const ATTR_WORDS=['智能','变频','实木','不锈钢','防水','节能','无痛','微创','进口','高端','便携','大功率','静音','环保','全自动','多功能','轻奢','定制','新款','折叠','防爆','高速','大容量','超薄'];
const TRIGGERS=['论坛','社区','平台','自媒体','直播','网店','资讯','电商','网站','APP','软件','系统','游戏','媒体','社交','网络','店铺','商城','短视频','公众号','社群','网','官网','手机端','PC端','小程序','门户','频道','中心','基地'];
const PRICE_WORDS=['价格','多少钱','报价','价格表','多少钱一台','多少钱一盒','多少钱一疗程','费用','收费标准','一套多少钱','批发价','出厂价'];
const QUESTION_WORDS=['怎么样','好不好','哪家好','哪个好','怎么选','怎么办','如何选择','哪里有','哪家靠谱','好用吗','有用吗','靠谱吗','正规吗','哪家专业'];
const GEO=['北京','上海','广州','深圳','朝阳','南开','河东','花都','杭州','成都','武汉','西安','南京','重庆','天津','苏州','青岛','海淀','浦东','望京','鼓楼','福田','越秀','徐汇','宝山','长安'];
const BRANDS=['某某','XX','优选','惠选','严选','康美','华美','恒信','德邦','欧派'];
const AUDIENCE=['儿童','老人','女性','男士','孕妇','婴儿','学生','家用','商用','工业','医用'];
const VERB_WORDS=['安装','维修','保养','清洗','定制','设计','加盟','批发','出租','回收','培训','咨询','代办','预约','办理','治疗','检测','租赁'];
const REPUTATION_WORDS=['排行榜','十大品牌','口碑','测评','对比','推荐','哪个品牌好','排名','评价','哪家好一点'];
const PROMO_WORDS=['优惠','促销','活动','优惠券','打折','特价','团购','秒杀','双11','618'];
const COMPANY_SUFFIX=['有限公司','股份有限公司','集团','公司'];
const FACTORY_SUFFIX=['厂家','厂商','工厂','制造厂','生产厂家'];
const PHONE_WORDS=['电话','联系方式','客服电话','咨询电话','热线'];
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function pick(a,r){return a[Math.floor(r()*a.length)];}
function makeCore(name){let base=name.replace(/^(专科-|在线|淘宝天猫类-)/,'').replace(/（.*?）/g,'').replace(/\//g,'').replace(/类$/,'');const c=new Set([base]);if(base.length>=4)c.add(base.slice(-3));if(base.length>=3)c.add(base.slice(-2));for(const s of['设备','产品','服务','机构','材料','用品','系统','仪器','厂'])if((base+s).length>=3)c.add(base+s);return[...c].filter(x=>x.length>=2);}
const T=[r=>pick(r.core,r.rng),r=>pick(ATTR_WORDS,r.rng)+pick(r.core,r.rng),r=>pick(r.core,r.rng)+pick(TRIGGERS,r.rng),r=>pick(TRIGGERS,r.rng)+pick(r.core,r.rng),r=>pick(r.core,r.rng)+pick(PRICE_WORDS,r.rng),r=>pick(r.core,r.rng)+pick(QUESTION_WORDS,r.rng),r=>pick(r.core,r.rng)+pick(REPUTATION_WORDS,r.rng),r=>pick(r.core,r.rng)+pick(PROMO_WORDS,r.rng),r=>pick(VERB_WORDS,r.rng)+pick(r.core,r.rng),r=>pick(r.core,r.rng)+pick(VERB_WORDS,r.rng),r=>pick(GEO,r.rng)+pick(r.core,r.rng),r=>pick(GEO,r.rng)+pick(BRANDS,r.rng)+pick(r.core,r.rng)+pick(COMPANY_SUFFIX,r.rng),r=>pick(GEO,r.rng)+pick(r.core,r.rng)+pick(FACTORY_SUFFIX,r.rng),r=>pick(BRANDS,r.rng)+pick(r.core,r.rng),r=>pick(AUDIENCE,r.rng)+pick(r.core,r.rng),r=>pick(r.core,r.rng)+pick(COMPANY_SUFFIX,r.rng),r=>pick(r.core,r.rng)+pick(FACTORY_SUFFIX,r.rng),r=>pick(r.core,r.rng)+pick(PHONE_WORDS,r.rng),r=>pick(TRIGGERS,r.rng)+pick(r.core,r.rng)+pick(FACTORY_SUFFIX,r.rng),r=>pick(ATTR_WORDS,r.rng)+pick(r.core,r.rng)+pick(TRIGGERS,r.rng),r=>pick(GEO,r.rng)+pick(ATTR_WORDS,r.rng)+pick(r.core,r.rng),r=>pick(r.core,r.rng)+pick(ATTR_WORDS,r.rng)+pick(QUESTION_WORDS,r.rng),r=>pick(GEO,r.rng)+pick(r.core,r.rng)+pick(TRIGGERS,r.rng)+pick(PRICE_WORDS,r.rng),r=>pick(AUDIENCE,r.rng)+pick(r.core,r.rng)+pick(PRICE_WORDS,r.rng)];
function gen(name,n){const rng=mulberry32(hashStr(name));const core=makeCore(name);const out=new Set();let g=0;const mg=n*60;while(out.size<n&&g<mg){g++;const kw=T[Math.floor(rng()*T.length)]({core,rng});if(kw&&kw.length>=2)out.add(kw);}return{count:out.size,guard:g,core};}
for(const nm of ['妇科炎症','双眼皮整形','其他','综合','数控机床','奶茶加盟','个人信用贷','贷款']){const t0=Date.now();const r=gen(nm,50000);console.log(nm.padEnd(10),'core=',r.core.length,'unique=',r.count,'guard=',r.guard,(Date.now()-t0)+'ms');}
