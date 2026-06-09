// 模拟测试：验证 normalizeKey / getValue / parseNumber / normalizeDate 逻辑
// 模拟用户CSV的列名
const columns = ['时间', '推广账户', '推广计划', '推广组', '创意标题', '触发模式',
    '关键词', '搜索词', '展示次数', '点击次数', '点击率', '总费用',
    '平均每次点击费用', '转化数', '一句话咨询转化数', '三句话咨询转化数'];

function normalizeKey(k) {
    if (k === undefined || k === null) return '';
    return String(k)
        .replace(/\ufeff/g, '')
        .replace(/\s+/g, '')
        .replace(/[\u3000]/g, '')
        .replace(/[：:（）()【】\[\]"'"'"'""'"]/g, '')
        .toLowerCase();
}

function buildKeyIndex(row) {
    const keys = Object.keys(row);
    const index = new Map();
    for (let k of keys) {
        const norm = normalizeKey(k);
        if (norm && !index.has(norm)) {
            index.set(norm, k);
        }
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
    s = s.replace(/[,\s¥$￥€£]/g, '');
    s = s.replace(/%$/, '');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
}

function normalizeDate(dateStr) {
    if (!dateStr) return '';
    if (typeof dateStr === 'object' && dateStr instanceof Date) {
        return dateStr.getFullYear() + '-' + String(dateStr.getMonth() + 1).padStart(2, '0') + '-' + String(dateStr.getDate()).padStart(2, '0');
    }
    let s = String(dateStr).trim();
    s = s.replace(/年|月/g, '-').replace(/日/g, '');
    const m1 = s.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (m1) return m1[1] + '-' + String(parseInt(m1[2])).padStart(2, '0') + '-' + String(parseInt(m1[3])).padStart(2, '0');
    const m2 = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
    if (m2) return m2[3] + '-' + String(parseInt(m2[1])).padStart(2, '0') + '-' + String(parseInt(m2[2])).padStart(2, '0');
    const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m3) return m3[1] + '-' + m3[2] + '-' + m3[3];
    return s;
}

// 模拟一行数据
const row = {
    '时间': '2026/5/22',
    '关键词': '全国肿瘤医院排名',
    '搜索词': '福州市第二中医院是几级医院',
    '展示次数': '21',
    '点击次数': '4',
    '点击率': '19.05%',
    '总费用': '22.66',
    '平均每次点击费用': '5.67',
    '转化数': '1'
};

const keyIndex = buildKeyIndex(row);
console.log('标准化后的列名:', Array.from(keyIndex.keys()));

const candidates = ['关键词', '搜索词', 'SearchTerm', 'Keyword', 'search_term', 'searchWord'];
console.log('\n关键词值:', getValue(row, candidates, keyIndex));

const candidates2 = ['时间', '日期', 'Date', 'date', '统计日期'];
console.log('日期值:', getValue(row, candidates2, keyIndex));
console.log('标准化日期:', normalizeDate(getValue(row, candidates2, keyIndex)));

const candidates3 = ['总费用', '消费', '费用', 'Cost', 'cost'];
console.log('总费用值:', getValue(row, candidates3, keyIndex));
console.log('解析数字:', parseNumber(getValue(row, candidates3, keyIndex)));

const candidates4 = ['点击率', 'CTR', 'ctr'];
console.log('点击率值:', getValue(row, candidates4, keyIndex));
console.log('解析点击率:', parseNumber(getValue(row, candidates4, keyIndex)));

// 测试所有列名是否都能匹配
const allTests = [
    ['时间', ['时间', '日期', 'Date', 'date', '统计日期', '日期范围', '投放日期', '时间范围', 'Day', 'day']],
    ['关键词', ['关键词', '搜索词', '搜索词(搜索关键词)', '搜索关键词', 'SearchTerm', 'Search term', 'Keyword', 'Keyword(搜索关键词)', 'search_term', 'searchWord', '搜索关键词列表']],
    ['搜索词', ['关键词', '搜索词', '搜索词(搜索关键词)', '搜索关键词', 'SearchTerm']],
    ['展示次数', ['展示次数', '展现', '展现量', '展示', 'Impressions', 'impressions', '曝光', '总展现量', '总展示次数']],
    ['点击次数', ['点击次数', '点击', 'Clicks', 'clicks', '点击量', '总点击次数']],
    ['点击率', ['点击率', 'CTR', 'ctr', '点击转化率', '点击率(CTR)']],
    ['总费用', ['总费用', '消费', '费用', 'Cost', 'cost', '总消费', '花费', '金额', '消费金额', '消耗金额', '消耗', 'Spend', 'spend', '总费用(人民币)', '费用(人民币)']],
    ['平均每次点击费用', ['平均每次点击费用', 'CPC', 'cpc', '平均CPC', '每次点击费用', '平均每次点击成本', 'Avg. CPC', '平均CPC(人民币)']],
    ['转化数', ['转化数', '转化', '转化量', '转化次数', 'Conversions', 'conversions', '转化目标数', '转化数(全部)']],
    ['推广计划', ['推广计划', '计划', 'Campaign', 'campaign', '计划名称', '广告计划', '广告系列']]
];

console.log('\n=== 所有列匹配测试 ===');
for (const [colName, candidates] of allTests) {
    const v = getValue(row, candidates, keyIndex);
    console.log(`${colName}: ${v !== null ? '✓ ' + v : '✗ 未找到'}`);
}

console.log('\n=== 测试 parseNumber 特殊格式 ===');
console.log('"19.05%":', parseNumber('19.05%'));
console.log('"22.66":', parseNumber('22.66'));
console.log('"1,234.56":', parseNumber('1,234.56'));
console.log('"¥100":', parseNumber('¥100'));
console.log('"0":', parseNumber('0'));

console.log('\n=== 测试 normalizeDate ===');
console.log('"2026/5/22":', normalizeDate('2026/5/22'));
console.log('"2026-05-22":', normalizeDate('2026-05-22'));
console.log('"2026年5月22日":', normalizeDate('2026年5月22日'));
