// ==== 最底层：直接解析 TSV，完全透明 ====
const raw = '时间\t推广账户\t推广计划\t创意标题\t触发模式\t关键词\t搜索词\t展示次数\t点击次数\t点击率\t总费用\t平均每次点击费用\t转化数\t一句话咨询转化数\t三句话咨询转化数\n'
    + '2026/5/22\t测试账户\tA05-行业--小周「hy」\t医院-全部\t{温州肿瘤科哪家医院好}-点击查看\t短语-核心包含\t全国肿瘤医院排名\t福州市第二中医院是几级医院\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA12-行业--黑/浙/安「hy」\t黑/安/浙/湖-医院\t{自贡肿瘤科医院}?-预约挂号\t短语-核心包含\t医院肿瘤医院\t川投西昌医院\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA05-行业--小周「hy」\t医院-全部\t{温州肿瘤科哪家医院好}-点击查看\t短语-核心包含\t医科肿瘤医院\t保定裕东医院\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA05-行业--小周「hy」\t药三新建-医院词-大周边\t{肿瘤科哪家医院好}-点击查看\t短语-核心包含\t全国肿瘤医院排名前十名的医院\t西安医学院附属汉江医院\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA05-行业--小周「hy」\t药三新建-医院词-大周边\t{肿瘤科哪家医院好}-点击查看\t短语-核心包含\t全国肿瘤医院排名前十名的医院\t合肥三甲医院有哪些\t9\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA05-行业--小周「hy」\t药三新建-医院词-大周边\t{肿瘤科哪家医院好}-点击查看\t短语-核心包含\t全国肿瘤医院排名前十名的医院\t石家庄顺康医院是几级医院\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tD15-技术--靶向「bxy」\t2-7加靶向药-综合3\t{治瘤方法大全}?_10种治瘤方法详解\t短语-核心包含\t依托泊甙\t阿帕替尼 依托泊苷功效\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tD06-技术--质子「zz」\t技术-质子\t{质子重离子治疗需要多少钱}?\t短语-核心包含\t国内质子重离子治疗医院有哪几个\t国科离子医疗科技有限公司\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA04-行业--小周「hy」\t药三新疆-医院词-周边\t集结专业力量-{杭州中西结合医院}?-点击预约挂号\t短语-核心包含\t全国中医肿瘤医院前十名\t梅州市中医院\t6\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA12-行业--黑/浙/安「hy」\t黑/安/浙/湖-医院\t{杭州治瘤}?-结合现代医生技术\t短语-核心包含\t河北一洲肿瘤医院\t河北燕达医院\t4\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tC09-治疗--其他「zl」\t治疗-杂1\t{杭州治瘤医院}?,新一代技术\t短语-核心包含\t中医治疗肿瘤医院\t河南省中医药大学\t4\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tC09-治疗--其他「zl」\t治疗-杂1\t{杭州治瘤医院}?,新一代技术\t短语-核心包含\t放射治疗\t左侧放射冠区\t4\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA04-行业--小周「hy」\t药三新疆-医院词-周边\t集结专业力量-{杭州中西结合医院}?-点击预约挂号\t短语-核心包含\t在线问诊\t弋矶山网上预约专家号\t21\t4\t19.05%\t22.66\t5.67\t1\t1\t0\n'
    + '2026/5/22\t测试账户\tA06-行业--全国「hy」\t病种-医院\t{浙江省杭州市肿瘤科医院}-点击查看\t短语-核心包含\t排名前十的肿瘤医院\tvx2肿瘤\t4\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA05-行业--小周「hy」\t药三新建-医院词-大周边\t{肿瘤科哪家医院好}-点击查看\t短语-核心包含\t全国肿瘤医院排名前十名的医院\t沈阳燕京医院是正规医院吗\t3\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA04-行业--小周「hy」\t药三新疆-医院词-周边\t{杭州治瘤专业医院}?-杭州中西医结合\t智能短语\t在线问诊\t问医\t36\t3\t8.33%\t18.29\t6.1\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA04-行业--小周「hy」\t药三新疆-医院词-周边\t{杭州治瘤}?-结合现代医生技术\t短语-核心包含\t在线问诊\t快速问医生\t119\t0\t0%\t0\t0\t0\t0\t0\n'
    + '2026/5/22\t测试账户\tA05-行业--小周「hy」\t药三新建-医院词-大周边\t{肿瘤科哪家医院好}-点击查看\t短语-核心包含\t中医肿瘤科医院\t台州市中西医结合医院医共体\t3\t0\t0%\t0\t0\t0\t0\t0';

const lines = raw.split('\n');
const headers = lines[0].split('\t');
console.log('【列名位置】');
headers.forEach((h, i) => console.log('  [' + i + '] ' + h));

const data = [];
for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    if (cells.length === headers.length) {
        const row = {};
        headers.forEach((h, j) => row[h] = cells[j]);
        data.push(row);
    }
}
console.log('\n【总行数】', data.length);

// ==== 手工加总 ====
let sumShow = 0, sumClick = 0, sumCost = 0, sumConv = 0;
console.log('\n【逐行明细】');
data.forEach((row, idx) => {
    const show = parseInt(row['展示次数']) || 0;
    const click = parseInt(row['点击次数']) || 0;
    const cost = parseFloat(row['总费用']) || 0;
    const conv = parseInt(row['转化数']) || 0;
    const cpcRaw = parseFloat(row['平均每次点击费用']) || 0;
    sumShow += show; sumClick += click; sumCost += cost; sumConv += conv;
    const expectCpc = click > 0 ? (cost / click).toFixed(2) : '0.00';
    const match = click > 0 ? (Math.abs(cost / click - cpcRaw) < 0.05 ? '✓' : '⚠ 原始CPC=' + cpcRaw + ' 计算=' + expectCpc) : '';
    console.log('  ' + String(idx+1).padStart(2, ' ') + '. 关键词="' + row['关键词'] + '" 展示=' + show + ' 点击=' + click + ' 费用=' + cost.toFixed(2) + ' 转化=' + conv + ' ' + match);
});

console.log('\n【手工总合计】');
console.log('  展示次数=' + sumShow);
console.log('  点击次数=' + sumClick);
console.log('  总费用=' + sumCost.toFixed(2));
console.log('  转化数=' + sumConv);
console.log('  平均CPC=' + (sumClick > 0 ? (sumCost / sumClick).toFixed(2) : '0.00'));
console.log('  转化率=' + (sumClick > 0 ? (sumConv / sumClick * 100).toFixed(2) + '%' : '0%'));

// ==== 按关键词去重 ====
const byKeyword = {};
data.forEach(row => {
    const kw = row['关键词'];
    if (!byKeyword[kw]) byKeyword[kw] = { show: 0, click: 0, cost: 0, conv: 0, rows: 0 };
    byKeyword[kw].show += parseInt(row['展示次数']) || 0;
    byKeyword[kw].click += parseInt(row['点击次数']) || 0;
    byKeyword[kw].cost += parseFloat(row['总费用']) || 0;
    byKeyword[kw].conv += parseInt(row['转化数']) || 0;
    byKeyword[kw].rows++;
});

const sorted = Object.values(byKeyword).sort((a, b) => b.conv - a.conv);
const distinctKws = Object.keys(byKeyword).length;

console.log('\n【按关键词聚合（去重后共 ' + distinctKws + ' 个）】');
sorted.forEach((k, i) => {
    const avgCpc = k.click > 0 ? (k.cost / k.click).toFixed(2) : '0.00';
    const convCost = k.conv > 0 ? (k.cost / k.conv).toFixed(2) : 'N/A';
    const rate = k.click > 0 ? (k.conv / k.click * 100).toFixed(2) + '%' : '0%';
    console.log('  ' + (i+1) + '. ' + Object.keys(byKeyword).find(name => byKeyword[name] === k) + ' [rows=' + k.rows + '] 展示=' + k.show + ' 点击=' + k.click + ' 费用=' + k.cost.toFixed(2) + ' 转化=' + k.conv + ' 平均CPC=' + avgCpc + ' 转化成本=' + convCost + ' 转化率=' + rate);
});

// ==== 二次校验 ====
console.log('\n【交叉校验】');
let sum2Cost = 0, sum2Click = 0, sum2Conv = 0, sum2Show = 0;
sorted.forEach(k => { sum2Cost += k.cost; sum2Click += k.click; sum2Conv += k.conv; sum2Show += k.show; });
console.log('  逐行加总  费用=' + sumCost.toFixed(2) + ' 点击=' + sumClick + ' 转化=' + sumConv + ' 展示=' + sumShow);
console.log('  关键词再汇总 费用=' + sum2Cost.toFixed(2) + ' 点击=' + sum2Click + ' 转化=' + sum2Conv + ' 展示=' + sum2Show);
console.log('  一致性：' + (Math.abs(sumCost - sum2Cost) < 0.01 && sumClick === sum2Click && sumConv === sum2Conv ? '✓ 通过' : '✗ 失败'));

// ==== Top 20 ====
const top20 = sorted.slice(0, 20);
console.log('\n【图表中展示的 Top ' + top20.length + ' 个关键词】');
console.log('  (按转化倒序排列，取前20；当前只有 ' + sorted.length + ' 个关键词，全部展示)');

// ==== 页面最终显示 ====
console.log('\n============================================');
console.log('【页面顶部 4 个统计卡片的正确数值】');
console.log('  总费用：¥' + sumCost.toFixed(2));
console.log('  总转化：' + sumConv);
console.log('  平均CPC：¥' + (sumClick > 0 ? (sumCost / sumClick).toFixed(2) : '0.00'));
console.log('  关键词数量：' + distinctKws);
console.log('============================================');

// ==== 表格（按关键词） ====
console.log('\n【页面底部表格：按关键词排名】');
console.log('  # | 关键词 | 转化 | 费用 | 点击 | 平均CPC | 转化率 | 评估');
console.log('  ----+------------------------+-----+-------+------+---------+-------+------');
top20.forEach((k, idx) => {
    const name = Object.keys(byKeyword).find(n => byKeyword[n] === k);
    const avgCpc = k.click > 0 ? (k.cost / k.click).toFixed(2) : '0.00';
    const rate = k.click > 0 ? (k.conv / k.click * 100).toFixed(2) + '%' : '0%';
    let rating = '低效';
    if (k.conv >= 5) rating = '高效';
    else if (k.conv >= 2) rating = '中效';
    console.log('  ' + (idx+1) + ' | ' + name.substring(0,20).padEnd(20) + ' | ' + String(k.conv).padStart(3) + ' | ' + k.cost.toFixed(2).padStart(5) + ' | ' + String(k.click).padStart(4) + ' | ' + avgCpc.padStart(7) + ' | ' + rate.padStart(5) + ' | ' + rating);
});

// ==== 图表日数据 ====
console.log('\n【图表每日数据（全部为 2026-05-22）】');
console.log('  当前测试数据全部是同一天：2026/5/22 → 图表中每个关键词只有 1 个数据点');
console.log('  每个关键词的每日数据 = 该关键词这一天的所有行累加');
console.log('  例如：在线问诊 在 2026-05-22 共 3 行，费用 22.66+18.29+0 = 40.95，点击 4+3+0=7，转化 1');
