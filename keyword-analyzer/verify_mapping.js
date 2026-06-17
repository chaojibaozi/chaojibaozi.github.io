// 验证 normalizeKey 修复后，Keyword 和 Keyword ID 不再冲突
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

console.log('=== normalizeKey 修复验证 ===');
console.log('"Keyword"    → "' + normalizeKey('Keyword') + '"');
console.log('"Keyword ID" → "' + normalizeKey('Keyword ID') + '"');
console.log('"Campaign name" → "' + normalizeKey('Campaign name') + '"');
console.log('"Ad group"   → "' + normalizeKey('Ad group') + '"');
console.log('"Avg. CPC"   → "' + normalizeKey('Avg. CPC') + '"');
console.log('"Top impression rate" → "' + normalizeKey('Top impression rate') + '"');
console.log();
console.log('冲突检查:');
console.log('  "Keyword" vs "Keyword ID": ' + (normalizeKey('Keyword') === normalizeKey('Keyword ID') ? '冲突 ✗' : '不冲突 ✓'));
console.log();

// 模拟用户的英文表头列名
const headers = ['Account name', 'Campaign name', 'Ad group', 'Keyword ID', 'Keyword', 'Bid match type',
    'Ad distribution', 'Current maximum CPC', 'Impressions', 'Clicks', 'CTR', 'Avg. CPC',
    'Spend', 'Top impression rate', 'Absolute top impression rate', 'Conversions', 'CPA', 'Conversion rate'];

// 模拟一行数据
const row = {};
headers.forEach(h => {
    if (h === 'Keyword') row[h] = 'pushplus';
    else if (h === 'Keyword ID') row[h] = '[82945799304067]';
    else if (h === 'Spend') row[h] = '318.26';
    else if (h === 'Conversions') row[h] = '20';
    else if (h === 'Clicks') row[h] = '91';
    else if (h === 'Impressions') row[h] = '309';
    else if (h === 'Avg. CPC') row[h] = '3.5';
    else if (h === 'CTR') row[h] = '29.45%';
    else if (h === 'Campaign name') row[h] = '个推';
    else if (h === 'Ad group') row[h] = '次核心词';
    else if (h === 'Account name') row[h] = '玉联/杭州同华';
    else if (h === 'CPA') row[h] = '15.91';
    else row[h] = '-';
});

const keyIndex = new Map();
Object.keys(row).forEach(k => {
    const norm = normalizeKey(k);
    if (norm && !keyIndex.has(norm)) keyIndex.set(norm, k);
});

console.log('=== 标准化后的列名索引 ===');
console.log(Array.from(keyIndex.entries()).map(([k, v]) => k + ' → ' + v).join('\n'));
console.log();

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
    return parseFloat(s) || 0;
}

console.log('=== 字段提取测试（按用户提供的映射）===');
const tests = [
    ['Keyword', '关键词', 'pushplus'],
    ['Keyword ID', '关键词ID（不干扰）', '[82945799304067]'],
    ['Campaign name', '计划', '个推'],
    ['Ad group', '推广组', '次核心词'],
    ['Account name', '账户', '玉联/杭州同华'],
    ['Impressions', '展现', '309'],
    ['Clicks', '点击', '91'],
    ['CTR', '点击率', '29.45%'],
    ['Avg. CPC', '平均点击单价', '3.5'],
    ['Spend', '关键词消费', '318.26'],
    ['Conversions', '转化数', '20'],
    ['CPA', '转化成本', '15.91'],
];

let allPass = true;
tests.forEach(t => {
    const got = getValue(row, [t[0]], keyIndex);
    const parsed = parseNumber(got);
    const expectedParsed = parseNumber(t[2]);
    const ok = got === t[2] && Math.abs(parsed - expectedParsed) < 0.01;
    if (!ok) allPass = false;
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + t[0] + ' (' + t[1] + ')');
    console.log('      原始值: "' + got + '" (期望: "' + t[2] + '")');
    console.log('      解析数: ' + parsed + ' (期望: ' + expectedParsed + ')');
});

console.log();
console.log('全部字段测试: ' + (allPass ? '✓ 通过' : '✗ 有失败'));

// CPC 校验
const cost = parseNumber(getValue(row, ['Spend'], keyIndex));
const clicks = parseNumber(getValue(row, ['Clicks'], keyIndex));
const cpc = parseNumber(getValue(row, ['Avg. CPC'], keyIndex));
const expectedCpc = clicks > 0 ? cost / clicks : 0;
console.log('\nCPC 校验:');
console.log('  费用 / 点击 = ' + cost + ' / ' + clicks + ' = ' + expectedCpc.toFixed(2));
console.log('  原始 Avg.CPC = ' + cpc);
console.log('  差值 = ' + Math.abs(expectedCpc - cpc).toFixed(3) + ' ' + (Math.abs(expectedCpc - cpc) < 0.05 ? '✓' : '✗'));
