const XLSX = require('xlsx');

// ========== 模拟用户文件的完整结构：先元数据行，再真实数据行 ==========
const fileText =
`Report Name: 关键词
Report Time: 6/10/2026,6/16/2026
Time Zone: (GMT+08:00) Beijing, Chongqing, Hong Kong SAR, Urumqi
Last Completed Available Day: 6/17/2026 7:20:00 AM (GMT)
Last Completed Available Hour: 6/17/2026 7:20:00 AM (GMT)

Account name\tCampaign name\tAd group\tKeyword ID\tKeyword\tBid match type\tAd distribution\tCurrent maximum CPC\tImpressions\tClicks\tCTR\tAvg. CPC\tSpend\tTop impression rate\tAbsolute top impression rate\tConversions\tCPA\tConversion rate
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t次核心词\t[82945799304067]\tpushplus\tPhrase\tSearch\t7.62\t309\t91\t29.45%\t3.5\t318.26\t98.69%\t98.69%\t20\t15.91\t21.98%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t品牌词\t常规词\t[82121165260284]\t个推\tExact\tSearch\t2.25\t115\t28\t24.35%\t0.83\t23.3\t95.65%\t95.65%\t1\t23.3\t3.57%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t核心词\t[83014521198066]\t消息推送\tPhrase\tSearch\t11.07\t342\t13\t3.80%\t5.89\t76.53\t81.55%\t77.38%\t0\t\t0.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t长尾词\t[83083237886306]\tpush-plus\tPhrase\tSearch\t3.66\t55\t10\t18.18%\t2.09\t20.87\t90.57%\t88.68%\t1\t20.87\t10.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t核心词\t[83014521198075]\tuniapp消息推送\tPhrase\tSearch\t10.06\t40\t7\t17.50%\t5.02\t35.12\t90.00%\t90.00%\t0\t\t0.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t品牌词\t常规词\t[82121165260289]\t个推官网\tExact\tSearch\t2.25\t21\t7\t33.33%\t0.14\t1.01\t90.48%\t90.48%\t0\t\t0.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t长尾词\t[83083237886314]\tbark消息推送\tPhrase\tSearch\t3.66\t24\t6\t25.00%\t2.62\t15.74\t91.67%\t83.33%\t0\t\t0.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t次核心词\t[82945799304055]\t推送服务\tPhrase\tSearch\t7.62\t40\t4\t10.00%\t5.08\t20.32\t82.50%\t62.50%\t1\t20.32\t25.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t核心词\t[83014521198076]\tunipush\tExact\tSearch\t10.06\t40\t3\t7.50%\t3.95\t11.86\t95.00%\t95.00%\t0\t\t0.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t次核心词\t[82945799304075]\t个推sdk\tExact\tSearch\t7.62\t3\t3\t100.00%\t2.84\t8.53\t100.00%\t100.00%\t0\t\t0.00%
玉联/杭州同华/每日互动/商务服务-其他/getui.com\t个推\t常规词\t[82808366964338]\t推送平台\tPhrase\tSearch\t5.49\t14\t2\t14.29%\t3.51\t7.02\t78.57%\t71.43%\t0\t\t0.00%`;

// ========== 与 index.html 一致的辅助函数 ==========
function normalizeKey(k) {
    if (k === undefined || k === null) return '';
    return String(k)
        .replace(/\ufeff/g, '')
        .replace(/\u3000/g, '')
        .replace(/[：:（）()【】\[\]"'""']/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function buildJsonFromRows(rows) {
    if (!rows || rows.length === 0) return [];

    const knownHeaders = [
        'account name', 'campaign name', 'ad group', 'keyword', 'keyword id',
        '关键词', '搜索词', '时间', '日期', '推广计划', '推广组', '推广账户',
        'spend', 'cost', 'impressions', 'clicks', 'ctr', 'avg. cpc', 'cpc',
        'conversions', 'cpa', '总费用', '消费', '费用', '展现', '展示次数', '点击',
        '点击次数', '点击率', '平均每次点击费用', '转化数', '转化', '转化成本'
    ];

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        let matches = 0;
        let nonEmpty = 0;
        for (let cell of row) {
            if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
                nonEmpty++;
                const norm = normalizeKey(cell);
                for (let h of knownHeaders) {
                    if (norm === h || norm.includes(h) || h.includes(norm)) {
                        matches++;
                        break;
                    }
                }
            }
        }
        if (nonEmpty >= 2 && matches >= 2 && matches / nonEmpty >= 0.3) {
            headerIdx = i;
            break;
        }
    }

    if (headerIdx === -1) {
        console.warn('未通过智能检测找到表头行，默认使用第一行作为表头');
        headerIdx = 0;
    }

    console.log('智能检测到表头行在第 ' + (headerIdx + 1) + ' 行:', rows[headerIdx]);

    const headers = rows[headerIdx];
    const result = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        let hasData = false;
        for (let c of row) {
            if (c !== undefined && c !== null && String(c).trim() !== '') {
                hasData = true;
                break;
            }
        }
        if (!hasData) continue;
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            const key = headers[j] !== undefined && headers[j] !== null ? String(headers[j]).trim() : 'col_' + j;
            obj[key] = row[j] !== undefined ? row[j] : '';
        }
        result.push(obj);
    }
    return result;
}

function buildKeyIndex(row) {
    const keys = Object.keys(row);
    const index = new Map();
    for (let k of keys) {
        const norm = normalizeKey(k);
        if (norm && !index.has(norm)) index.set(norm, k);
    }
    return index;
}

function getValue(row, keys, keyIndex) {
    const idx = keyIndex || buildKeyIndex(row);
    for (let key of keys) {
        const norm = normalizeKey(key);
        if (idx.has(norm)) {
            const v = row[idx.get(norm)];
            if (v !== undefined && v !== null && v !== '') return v;
        }
    }
    for (let key of keys) {
        const norm = normalizeKey(key);
        for (let [n, orig] of idx.entries()) {
            if (n.includes(norm) || norm.includes(n)) {
                const v = row[orig];
                if (v !== undefined && v !== null && v !== '') return v;
            }
        }
    }
    return null;
}

function parseNumber(val) {
    if (val === undefined || val === null || val === '') return NaN;
    if (typeof val === 'number') return val;
    let s = String(val).trim();
    s = s.replace(/[,\s¥$￥€£]/g, '').replace(/%$/, '');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
}

// ========== 解析流程 ==========
console.log('========== 步骤 1: 用 XLSX 读取文件为数组行 ==========');
const wb = XLSX.read(fileText, { type: 'string', raw: true, FS: '\t' });
const firstSheet = wb.Sheets[wb.SheetNames[0]];
const rowsArr = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', FS: '\t' });
console.log('总行数: ' + rowsArr.length);
console.log('前 7 行预览:');
for (let i = 0; i < Math.min(7, rowsArr.length); i++) {
    console.log('  [' + i + '] ' + JSON.stringify(rowsArr[i].slice(0, 5)));
}

console.log('\n========== 步骤 2: buildJsonFromRows 检测真正表头 ==========');
const jsonData = buildJsonFromRows(rowsArr);
console.log('解析后的数据行数: ' + jsonData.length);
console.log('第一行列名: ' + Object.keys(jsonData[0]).join(', '));

console.log('\n========== 步骤 3: 逐行提取验证 ==========');
const keyIndex = buildKeyIndex(jsonData[0]);
console.log('标准化后的列名索引:');
for (let [k, v] of keyIndex) console.log('  ' + k + ' → ' + v);

let totalCost = 0, totalConv = 0, totalClicks = 0, totalImp = 0;
const byKw = {};

console.log('\n逐行数据:');
jsonData.forEach((row, i) => {
    const kw = getValue(row, ['Keyword', '关键词', '搜索词'], keyIndex);
    const cost = parseNumber(getValue(row, ['Spend', 'Cost', '总费用'], keyIndex)) || 0;
    const conv = parseNumber(getValue(row, ['Conversions', '转化数'], keyIndex)) || 0;
    const clicks = parseNumber(getValue(row, ['Clicks', '点击次数', '点击'], keyIndex)) || 0;
    const imp = parseNumber(getValue(row, ['Impressions', '展现', '展示次数'], keyIndex)) || 0;
    const camp = getValue(row, ['Campaign name', '推广计划'], keyIndex) || '';
    const ag = getValue(row, ['Ad group', '推广组'], keyIndex) || '';
    const acct = getValue(row, ['Account name', '推广账户'], keyIndex) || '';

    totalCost += cost; totalConv += conv; totalClicks += clicks; totalImp += imp;

    if (!byKw[kw]) byKw[kw] = { cost: 0, conv: 0, click: 0, imp: 0 };
    byKw[kw].cost += cost; byKw[kw].conv += conv; byKw[kw].click += clicks; byKw[kw].imp += imp;

    console.log('  [' + (i + 1) + '] 关键词=' + (kw || '(空)') + ' | 计划=' + camp.slice(0, 8) + ' | 推广组=' + ag.slice(0, 8) +
        ' | 展现=' + imp + ' | 点击=' + clicks + ' | CTR=' + getValue(row, ['CTR'], keyIndex) +
        ' | CPC=' + getValue(row, ['Avg. CPC', 'CPC'], keyIndex) +
        ' | 消费=' + cost + ' | 转化=' + conv + ' | CPA=' + getValue(row, ['CPA', '转化成本'], keyIndex));
});

console.log('\n========== 步骤 4: 汇总结果 ==========');
console.log('总展现: ' + totalImp);
console.log('总点击: ' + totalClicks);
console.log('总消费: ¥' + totalCost.toFixed(2));
console.log('总转化: ' + totalConv);
console.log('平均 CPC: ¥' + (totalClicks > 0 ? (totalCost / totalClicks).toFixed(2) : '0.00'));
console.log('去重关键词数: ' + Object.keys(byKw).length);

console.log('\n========== 步骤 5: 按关键词聚合 ==========');
const sorted = Object.keys(byKw).map(k => ({ keyword: k, ...byKw[k] }))
    .sort((a, b) => b.conv - a.conv || b.cost - a.cost);
sorted.forEach((k, i) => {
    const cpc = k.click > 0 ? (k.cost / k.click).toFixed(2) : '0.00';
    const cpa = k.conv > 0 ? (k.cost / k.conv).toFixed(2) : '-';
    console.log('  ' + (i + 1).toString().padStart(2, '0') + '. ' + k.keyword.padEnd(18) +
        ' 展现=' + String(k.imp).padStart(4) + ' 点击=' + String(k.click).padStart(3) +
        ' 消费=¥' + k.cost.toFixed(2).padStart(7) + ' 转化=' + String(k.conv).padStart(2) +
        ' CPC=¥' + cpc + ' CPA=¥' + cpa);
});

console.log('\n========== 步骤 6: CPC 交叉校验 ==========');
let cpcOK = 0, cpcBad = 0;
jsonData.forEach((row, i) => {
    const clicks = parseNumber(getValue(row, ['Clicks'], keyIndex));
    const cost = parseNumber(getValue(row, ['Spend'], keyIndex));
    const cpc = parseNumber(getValue(row, ['Avg. CPC'], keyIndex));
    if (clicks > 0) {
        const expected = cost / clicks;
        if (Math.abs(expected - cpc) > 0.05) {
            cpcBad++;
            console.log('  ⚠ 行 ' + (i + 1) + ': 计算CPC=' + expected.toFixed(2) + ' ≠ 原始Avg.CPC=' + cpc);
        } else cpcOK++;
    }
});
console.log('  CPC一致: ' + cpcOK + ' 行, 不一致: ' + cpcBad + ' 行' + (cpcBad === 0 ? ' ✓' : ''));

console.log('\n========== 最终验证 ==========');
// 手动计算已知数据的期望值
const expCost = 318.26 + 23.3 + 76.53 + 20.87 + 35.12 + 1.01 + 15.74 + 20.32 + 11.86 + 8.53 + 7.02;
const expConv = 20 + 1 + 0 + 1 + 0 + 0 + 0 + 1 + 0 + 0 + 0;
const expClick = 91 + 28 + 13 + 10 + 7 + 7 + 6 + 4 + 3 + 3 + 2;
const expImp = 309 + 115 + 342 + 55 + 40 + 21 + 24 + 40 + 40 + 3 + 14;

console.log('预期总展现: ' + expImp + ' | 实际: ' + totalImp + ' | ' + (expImp === totalImp ? '✓' : '✗'));
console.log('预期总点击: ' + expClick + ' | 实际: ' + totalClicks + ' | ' + (expClick === totalClicks ? '✓' : '✗'));
console.log('预期总消费: ¥' + expCost.toFixed(2) + ' | 实际: ¥' + totalCost.toFixed(2) + ' | ' + (Math.abs(expCost - totalCost) < 0.01 ? '✓' : '✗'));
console.log('预期总转化: ' + expConv + ' | 实际: ' + totalConv + ' | ' + (expConv === totalConv ? '✓' : '✗'));
