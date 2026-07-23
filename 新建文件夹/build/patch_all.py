#!/usr/bin/env python3
"""
全行业百度SEM关键词分类系统 —— 一站式补丁脚本
实现7项改进：
1. 双向最大匹配(BMM)分词
2. 行业词义标签（医疗/商务/法律/机械/教育/IT/金融）
3. 搜索意图层（交易/商业调查/信息/导航）
4. 购买阶段层（认知/考虑/决策/购买）
5. 关键词质量评分
6. 百度账户结构建议
7. 新增SEM列：意图/阶段/质量/账户结构
"""
import re

with open('app.html', 'r', encoding='utf-8') as f:
    html = f.read()

# ============ Edit 1: Add SEM JS constants after DIM_THRESH (line ~263) ============
js_constants = '''
/* ============ SEM 扩展分析常量 ============ */
const INTENT_NAMES = {transactional:'交易型', commercial:'商业调查型', informational:'信息型', navigational:'导航型'};
const INTENT_ORDER = ['transactional','commercial','informational','navigational'];
const STAGE_NAMES = {awareness:'认知期', consideration:'考虑期', decision:'决策期', purchase:'购买期'};
const QLABEL = ['极低','低','中','高','极高'];
const ACCOUNT_PLANS = {
  medical:['医疗-疾病词','医疗-症状词','医疗-费用词','医疗-治疗词','医疗-医院词','医疗-地域词'],
  'business-svc':['商务-服务词','商务-费用词','商务-流程词','商务-材料词','商务-地域词'],
  legal:['法律-案件词','法律-费用词','法律-流程词','法律-律师词','法律-地域词'],
  machinery:['机械-产品词','机械-型号词','机械-厂家词','机械-采购词','机械-地域词'],
  education:['教育-课程词','教育-费用词','教育-机构词','教育-考试词','教育-地域词'],
  'it-services':['IT-技术词','IT-产品词','IT-方案词','IT-开发词','IT-地域词'],
  finance:['金融-产品词','金融-费用词','金融-条件词','金融-地域词'],
  default:['通用-品牌词','通用-产品词','通用-通用词','通用-长尾词','通用-地域词']
};
const INDUSTRY_TAGS = {
  medical: {
    symptoms:['头疼','头晕','发烧','咳嗽','感冒','失眠','疼痛','肿胀','瘙痒','出血','发炎','溃疡','便秘','腹泻','呕吐','恶心','乏力','麻木','耳鸣','眼花','鼻塞','流鼻涕','咽痛','胸痛','腹痛','腰痛','关节痛','胃痛','牙痛','头痛','肌肉痛','骨折','扭伤','烫伤','过敏','皮疹','痘痘','斑','皱纹','脱发','白发','近视','远视','散光','弱视','斜视','干眼','白内障','青光眼','牙结石','龋齿','牙周炎','口臭','打呼噜','磨牙','高血压','糖尿病','高血脂','脂肪肝','痛风','结石','肿瘤','癌症','囊肿','结节','增生','息肉','痔疮','静脉曲张','甲状腺','乳腺','前列腺','阳痿','早泄','不孕不育'],
    fee:['多少钱','价格','费用','收费','多少钱一次','价钱','价位','报价','花多少钱','需要多少钱'],
    treatment:['手术','治疗','疗法','药物','药','针','注射','介入','放射','化疗','中医','西医','理疗','康复','针灸','推拿','按摩','拔罐','刮痧','艾灸','正骨','牵引','微波','激光'],
    examination:['检查','检测','化验','血常规','尿常规','CT','核磁','X光','B超','彩超','心电图','胃镜','肠镜','造影','活检','筛查','体检','拍片'],
    hospital:['医院','三甲','二甲','专科医院','人民医院','中医院','妇幼','卫生院','诊所','门诊部','医师','医生','专家','教授','主任'],
    disease:['炎','症','病','瘤','癌','综合征','症候群','中毒','感染','损伤','畸形','障碍'],
    method:['方法','办法','方式','怎么做','怎么治','怎么治疗','如何治疗'],
    time:['多久','多长时间','几天','几个月','几年','疗程','周期','长期','短期'],
  },
  'business-svc': {
    service_type:['公司注册','代理记账','商标注册','专利申请','版权登记','资质办理','建筑资质','食品经营许可','ISO认证','高新认定','ICP许可证','EDI许可证','营业执照','刻章','审计','验资','评估','公证','翻译'],
    fee:['多少钱','费用','收费','价格','报价','多少钱一次','代理费','服务费','官费','年费'],
    process:['流程','步骤','条件','要求','材料','资料','证件','证明','文件','清单','准备','办理时间','多久','周期','几天'],
    material:['需要什么','所需材料','提交材料','准备资料','证件','证明','盖章'],
    condition:['条件','要求','资格','资质','标准','规定','满足'],
  },
  legal: {
    case_type:['离婚','债务','借贷','合同','劳动','工伤','交通事故','刑事','民事','行政','房产','继承','股权','知识产权','侵权','婚姻','抚养权','名誉','肖像','人身损害','医疗纠纷','物业','工程款','货款','加盟','诈骗','集资','非法'],
    fee:['律师费','诉讼费','代理费','多少钱','费用','价格','收费','标准','怎么收'],
    process:['流程','步骤','怎么打官司','怎么起诉','如何上诉','需要多久','时间','材料','证据','立案','开庭','判决','执行','上诉','申诉'],
    lawyer:['律师','律师事务所','法律顾问','刑事律师','离婚律师','债务律师'],
    compensation:['赔偿','赔偿标准','赔偿金','赔偿多少','赔偿怎么算','赔偿计算','金额','索赔'],
  },
  machinery: {
    specs:['型号','参数','规格','尺寸','功率','压力','流量','转速','精度','容量','重量','电压','电流','频率'],
    brand_mech:['厂家','品牌','生产厂家','制造商','生产商','原厂','进口','国产'],
    deal:['采购','购买','批发','厂家直销','直接厂家','订购','订货','询价','询盘','报价单','价格表','租赁','出租','二手','转让','处理','回收'],
    procurement:['价格','多少钱','报价','报价单','批发价','出厂价','优惠','便宜','性价比','预算'],
    aftermarket:['配件','易损件','零件','维修','保养','售后','维修服务','技术支持','安装','调试','培训'],
  },
  education: {
    course:['课程','培训班','培训','辅导','网课','在线课','直播课','面授','一对一','家教'],
    exam:['考研','考公','国考','省考','考试','资格证','证书','认证','执业','职称','测试','真题','题库','试卷','模拟'],
    fee:['学费','多少钱','价格','费用','收费','报价','课时费','培训费','报名费','优惠','打折'],
    institution:['机构','学校','学院','大学','中心','教育','培训中心','哪家好','推荐','排名','靠谱','正规'],
    material:['教材','资料','网盘','PDF','讲义','笔记','书本','图书','辅导书','真题','题库'],
    method_study:['学习方法','怎么学','如何学','技巧','经验','攻略','心得','时间安排','计划','速成'],
  },
  'it-services': {
    technology:['技术','架构','框架','方案','平台','系统','引擎','算法','协议','标准'],
    product_it:['ERP','CRM','OA','WMS','MES','SCM','SaaS','PaaS','IaaS','软件','系统','平台','网站','小程序','APP','公众号','H5','后台','前端','后端','数据库','服务器'],
    solution:['解决方案','集成','定制开发','外包','二次开发','实施','部署','运维','咨询','规划'],
    dev:['开发','编程','编码','设计','UI','UX','接口','API','对接','集成','测试','上线','维护'],
    price_it:['报价','多少钱','费用','价格','预算','报价方案','收费','年费'],
  },
  finance: {
    product_fin:['贷款','房贷','车贷','经营贷','消费贷','信用贷','抵押贷','质押贷','过桥','垫资','融资','担保','保理','租赁','理财','基金','信托','保险','股票','证券','期货','外汇','黄金'],
    rate:['利率','利息','费率','年化','月息','日息','手续费','管理费','收益','回报','分红'],
    condition_fin:['条件','要求','资格','征信','流水','收入证明','抵押物','担保人','额度'],
    fee_fin:['多少钱','额度多少','能贷多少','怎么算','费用','价格','收费','报价'],
  },
};
'''

# Insert after DIM_THRESH line
html = html.replace(
    'const DIM_THRESH = 30;\n',
    'const DIM_THRESH = 30;\n' + js_constants
)

# ============ Edit 2: Add BMM + SEM analysis functions after buildRegex ============
sem_functions = '''

/* ============ 双向最大匹配(BMM)分词 ============ */
function segmentFMM(text, dictSet) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    let longest = text[i];
    for (let j = i + 1; j <= text.length; j++) {
      const sub = text.slice(i, j);
      if (dictSet.has(sub) && sub.length > longest.length) longest = sub;
    }
    tokens.push(longest);
    i += longest.length;
  }
  return tokens;
}
function segmentBMM(text, dictSet) {
  const tokens = [];
  let i = text.length;
  while (i > 0) {
    let longest = text[i - 1];
    for (let j = i - 1; j >= 0; j--) {
      const sub = text.slice(j, i);
      if (dictSet.has(sub) && sub.length > longest.length) longest = sub;
    }
    tokens.unshift(longest);
    i -= longest.length;
  }
  return tokens;
}
function segment(text, dictSet) {
  const fmm = segmentFMM(text, dictSet);
  const bmm = segmentBMM(text, dictSet);
  // Prefer fewer tokens (BMM handles suffix prefixes better)
  return fmm.length <= bmm.length ? fmm : bmm;
}

/* ============ 行业检测（基于品类词根） ============ */
function detectIndustry(prodTerm) {
  if (!prodTerm) return 'default';
  const industryMap = [
    ['论文查重|查重|降重|论文检测|代写|论文辅导|毕业论文', 'education'],
    ['公司注册|代理记账|商标注册|知识产权|资质|审计|验资|记账报税|工商|营业执照', 'business-svc'],
    ['律师|律所|法律咨询|诉讼|打官司|离婚|债务|劳动仲裁|劳动合同|工伤赔偿', 'legal'],
    ['机床|空压机|发电机|数控|设备|机械|工业|制造|加工|模具|流水线|自动化设备', 'machinery'],
    ['ERP|CRM|OA|软件|系统开发|小程序|APP开发|SaaS|云服务|服务器|IT服务|软件开发', 'it-services'],
    ['贷款|保险|理财|基金|股票|融资|投资|信用卡|抵押|担保|金融|证券|期货', 'finance'],
    ['医院|医疗|手术|治疗|体检|挂号|医生|诊所|眼科|口腔|妇科|男科|皮肤|中医|整形|医美', 'medical'],
  ];
  for (const [pattern, industry] of industryMap) {
    const re = new RegExp(pattern);
    if (re.test(prodTerm)) return industry;
  }
  return 'default';
}

/* ============ 行业词义标签 ============ */
function detectIndustryTags(kw, industry) {
  const tags = [];
  const tagDict = INDUSTRY_TAGS[industry];
  if (!tagDict) return tags;
  for (const [tagId, words] of Object.entries(tagDict)) {
    for (const w of words) {
      if (kw.includes(w)) { tags.push(tagId); break; }
    }
  }
  return tags;
}

/* ============ 搜索意图检测 ============ */
function detectIntent(result) {
  const {cat, dimLabel, matched, industryTags} = result;
  const dims = dimLabel.split('+');
  
  // 交易型：有价格/促销信号，或包含交易词
  if (dims.includes('价格') || dims.includes('促销') || cat === 'price' || cat === 'promo')
    return 'transactional';
  
  // 导航型：纯品牌词（无品类/产品词）
  if (dims.includes('品牌') && !dims.includes('产品') && !dims.includes('型号') && !dims.includes('属性'))
    return 'navigational';
  
  // 商业调查型：口碑/对比/评测 信号
  if (dims.includes('口碑') || cat === 'reputation')
    return 'commercial';
  
  // 信息型：疑问/咨询
  if (dims.includes('咨询') || cat === 'question' || cat === 'core')
    return 'informational';
  
  // 有产品词+价格 = 交易型
  if ((dims.includes('产品') || dims.includes('型号')) && dims.includes('价格'))
    return 'transactional';
  
  // 默认按分类推断
  if (cat === 'longtail' || cat === 'attribute' || cat === 'audience')
    return 'informational';
  
  return 'informational';
}

/* ============ 购买阶段检测 ============ */
function detectBuyingStage(result) {
  const intent = result.intent;
  const dims = (result.dimLabel || '').split('+');
  const cat = result.cat;
  
  // 购买期：价格+品牌/产品
  if (dims.includes('价格') && (dims.includes('产品') || dims.includes('品牌') || dims.includes('型号')))
    return 'purchase';
  if (dims.includes('促销') && (dims.includes('产品') || dims.includes('品牌')))
    return 'purchase';
  if (intent === 'transactional' && (dims.includes('产品') || dims.includes('品牌')))
    return 'purchase';
  if (intent === 'transactional') return 'decision';
  
  // 决策期：品牌+疑问/口碑, 或商业调查型
  if (intent === 'commercial') return 'decision';
  if (dims.includes('品牌') && dims.includes('口碑')) return 'decision';
  if (dims.includes('品牌') && dims.includes('价格')) return 'decision';
  if (dims.includes('产品') && dims.includes('口碑')) return 'decision';
  
  // 考虑期：疑问/口碑/属性/人群
  if (dims.includes('咨询') || dims.includes('口碑')) return 'consideration';
  if (dims.includes('属性') || dims.includes('人群')) return 'consideration';
  if (cat === 'question' || cat === 'reputation') return 'consideration';
  
  // 认知期：通用词/纯疑问/纯长尾
  return 'awareness';
}

/* ============ 关键词质量评分 ============ */
function computeQualityScore(result) {
  const dims = (result.dimLabel || '').split('+');
  const cat = result.cat;
  const intent = result.intent;
  const stage = result.stage;
  let score = 5; // 基准5分
  
  const boosts = [
    [dims.includes('品牌') && dims.includes('产品'), 2],
    [dims.includes('品牌') && dims.includes('价格'), 2.5],
    [dims.includes('产品') && dims.includes('价格') && dims.includes('地域'), 3],
    [dims.includes('产品') && dims.includes('价格'), 2],
    [dims.includes('型号'), 1.5],
    [dims.includes('竞品'), 1],
    [cat === 'brand' && dims.includes('产品'), 2],
    [cat === 'brand', 1.5],
    [intent === 'purchase', 2],
    [intent === 'decision', 1],
    [intent === 'awareness', -1.5],
    [cat === 'generic', -2],
    [dims.includes('长尾'), 0],
    [dims.includes('咨询'), -1],
    [cat === 'question' && !dims.includes('产品') && !dims.includes('品牌'), -1.5],
  ];
  
  for (const [cond, delta] of boosts) {
    if (cond) score += delta;
  }
  
  return Math.max(1, Math.min(10, Math.round(score)));
}

/* ============ 百度账户结构建议 ============ */
function suggestAccountStructure(kw, result) {
  const industry = result.industry || 'default';
  const intent = result.intent;
  const stage = result.stage;
  const dims = (result.dimLabel || '').split('+');
  const cat = result.cat;
  
  // 账户结构层级
  let plan = '', unit = '';
  
  // 计划匹配
  if (industry !== 'default') {
    const plans = ACCOUNT_PLANS[industry] || ACCOUNT_PLANS.default;
    if (dims.includes('地域')) {
      const geoPlans = plans.filter(p => p.includes('地域'));
      plan = geoPlans.length > 0 ? geoPlans[0] : plans[plans.length - 1];
    } else if (dims.includes('价格') || cat === 'price') {
      const feePlans = plans.filter(p => p.includes('费用') || p.includes('采购'));
      plan = feePlans.length > 0 ? feePlans[0] : plans[0];
    } else if (cat === 'brand') {
      const brandPlans = plans.filter(p => p.includes('品牌'));
      plan = brandPlans.length > 0 ? brandPlans[0] : plans[0];
    } else if (cat === 'competitor') {
      plan = plans[0] + '(竞品)';
    } else if (cat === 'question' || cat === 'reputation') {
      plan = plans.length > 2 ? plans[2] : plans[0];
    } else if (cat === 'generic' || cat === 'longtail') {
      plan = plans.length > 3 ? plans[3] : plans[0];
    } else {
      plan = plans[0];
    }
  } else {
    plan = ACCOUNT_PLANS.default[0];
  }
  
  // 单元按意图细分
  unit = intent === 'transactional' ? '转化词' 
       : intent === 'commercial' ? '调查词'
       : intent === 'navigational' ? '品牌词'
       : stage === 'awareness' ? '引流词'
       : '通用词';
  
  // 匹配建议
  let matchType = '短语匹配';
  if (result.quality >= 8 && dims.includes('品牌') && dims.includes('产品')) matchType = '精确匹配';
  else if (result.quality <= 4) matchType = '智能匹配';
  else if (dims.includes('地域') && cat !== 'generic') matchType = '精确匹配';
  
  // 出价建议
  let bidAdvice = '中';
  if (result.quality >= 8) bidAdvice = '高';
  else if (result.quality <= 4) bidAdvice = '低';
  if (dims.includes('竞品')) bidAdvice = '中高';
  
  return `计划:${plan} | 单元:${unit} | ${matchType} | 出价:${bidAdvice}`;
}
'''

# Insert after line 364 (after buildRegex function)
html = html.replace(
    'function buildRegex(arr){\n  if(!arr.length) return /(?!)/;\n  return new RegExp(\'(\'+arr.map(escapeRegex).join(\'|\')+\')\');\n}\n',
    'function buildRegex(arr){\n  if(!arr.length) return /(?!)/;\n  return new RegExp(\'(\'+arr.map(escapeRegex).join(\'|\')+\')\');\n}\n' + sem_functions
)

# ============ Edit 3: Modify classify() return to include new fields ============
# Change the return statement at line 627
old_return = "  return {cat:best, dimLabel, conf, rule, matched:order.filter(c=>ruleMap[c])};"
new_return = """  const result = {cat:best, dimLabel, conf, rule, matched:order.filter(c=>ruleMap[c])};
  // SEM 扩展分析（在 postProcessResults 中统一计算）
  result.industry = detectIndustry(prodTerm);
  result.industryTags = detectIndustryTags(k, result.industry);
  result.intent = detectIntent(result);
  result.stage = detectBuyingStage(result);
  result.quality = computeQualityScore(result);
  result.accountSuggestion = suggestAccountStructure(k, result);
  return result;"""
html = html.replace(old_return, new_return)

# ============ Edit 4: Modify runClassification() to populate new fields ============
# Change runClassification to add post-processing
old_run = """  const results=items.map(it=>{
    const r=classify(it.kw);
    return {...r, kw:it.kw, row:it.row, source:'离线'};
  });"""

new_run = """  const results=items.map(it=>{
    const r=classify(it.kw);
    return {...r, kw:it.kw, row:it.row, source:'离线'};
  });
  // 集体后处理：行业标签需要整体感知
  results.forEach(r => {
    r.industry = detectIndustry(r.kw.match(/[一-龥A-Za-z]{2,}/g)?.join('') || '');
    r.industryTags = detectIndustryTags(r.kw, r.industry);
    r.intent = detectIntent(r);
    r.stage = detectBuyingStage(r);
    r.quality = computeQualityScore(r);
    r.accountSuggestion = suggestAccountStructure(r.kw, r);
  });"""

html = html.replace(old_run, new_run)

# ============ Edit 5: Modify table header ============
# Change the table header to add new columns
old_header = '<thead><tr><th style="width:22%">关键词</th><th style="width:90px">分类</th><th style="width:70px">置信度</th><th>命中规则</th><th style="width:60px">来源</th></tr></thead>'
new_header = '<thead><tr><th style="width:15%">关键词</th><th style="width:72px">分类</th><th style="width:36px">质</th><th style="width:50px">意图</th><th style="width:44px">阶段</th><th style="width:48px">信号</th><th>命中规则</th><th style="width:60px">来源</th></tr></thead>'
html = html.replace(old_header, new_header)

# ============ Edit 6: Modify renderTable() to show new SEM columns ============
old_tr = """    const tr=document.createElement('tr');
    const review = r.conf<state.confTh;
    const dimInfo = r.dimLabel ? `<span class="dims">${r.dimLabel}</span>` : '';
    const tag=`<span class="tag" style="background:${CAT_COLOR[r.cat]}">${CAT_NAME[r.cat]}</span>${dimInfo}`;
    const conf=`<span class="conf${review?' review':''}">${r.conf}%${review?' <span class="badge">复核</span>':''}</span>`;
    const rule=`<div class="rule-cell">${escapeHtml(r.rule.join('；'))}</div>`;
    const src=`<span class="src">${r.source||'离线'}</span>`;
    tr.innerHTML=`<td>${escapeHtml(r.kw)}</td><td>${tag}</td><td>${conf}</td><td>${rule}</td><td>${src}</td>`;
    body.appendChild(tr);"""

new_tr = """    const tr=document.createElement('tr');
    const review = r.conf<state.confTh;
    const qual = r.quality ? `<span class="dims" style="font-weight:600;color:${r.quality>=8?'#059669':r.quality>=5?'#B4571D':'#DC2626'}">${r.quality}/10</span>` : '';
    const intentName = r.intent ? INTENT_NAMES[r.intent]||'' : '';
    const stageName = r.stage ? STAGE_NAMES[r.stage]||'' : '';
    const dimInfo = r.dimLabel ? `<span class="dims">${r.dimLabel}</span>` : '';
    const tag=`<span class="tag" style="background:${CAT_COLOR[r.cat]}">${CAT_NAME[r.cat]}</span>`;
    const conf=`<span class="conf${review?' review':''}">${r.conf}%${review?' <span class="badge">复核</span>':''}</span>`;
    const rule=`<div class="rule-cell">${escapeHtml(r.rule.join('；'))}</div>`;
    const src=`<span class="src">${r.source||'离线'}</span>`;
    const intentTag = intentName ? `<span class="dims" style="border-color:#93C5FD;color:#1E40AF;">${intentName}</span>` : '';
    const stageTag = stageName ? `<span class="dims" style="border-color:#FDE68A;color:#92400E;">${stageName}</span>` : '';
    tr.innerHTML=`<td style="font-size:12px;">${escapeHtml(r.kw)}</td><td>${tag}</td><td>${qual}</td><td>${intentTag}</td><td>${stageTag}</td><td>${dimInfo}</td><td>${rule}</td><td>${src}</td>`;
    body.appendChild(tr);"""

html = html.replace(old_tr, new_tr)

# ============ Edit 7: Modify exportXLSX() to include new columns ============
old_export_head = 'const aoa=[ [...head,\'一级分类\',\'信号维度\',\'置信度\',\'命中规则\',\'来源\'] ];'
new_export_head = 'const aoa=[ [...head,\'一级分类\',\'信号维度\',\'搜索意图\',\'购买阶段\',\'质量评分\',\'账户结构建议\',\'置信度\',\'命中规则\',\'来源\'] ];'
html = html.replace(old_export_head, new_export_head)

old_export_row = 'aoa.push([ ...(r.row||[r.kw]), CAT_NAME[r.cat], r.dimLabel||\'\', r.conf+\'%\', r.rule.join(\'；\'), r.source||\'离线\' ]);'
new_export_row = 'aoa.push([ ...(r.row||[r.kw]), CAT_NAME[r.cat], r.dimLabel||\'\', INTENT_NAMES[r.intent]||\'\', STAGE_NAMES[r.stage]||\'\', r.quality||\'\', r.accountSuggestion||\'\', r.conf+\'%\', r.rule.join(\'；\'), r.source||\'离线\' ]);'
html = html.replace(old_export_row, new_export_row)

# ============ Edit 8: Fix limit row colspan ============
html = html.replace(
    'if(rows.length>limit){ const tr=document.createElement(\'tr\'); tr.innerHTML=`<td colspan="5" class="hint"',
    'if(rows.length>limit){ const tr=document.createElement(\'tr\'); tr.innerHTML=`<td colspan="8" class="hint"'
)

# ============ Write back ============
with open('app.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Patch applied successfully.")
print("File size:", len(html), "bytes")
