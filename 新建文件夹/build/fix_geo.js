const fs = require('fs');
const s = fs.readFileSync('D:/BianCheng/分词工具/build/app.html', 'utf8');

// Extract geo array text between geo: [ and the next ], at the right nesting level
// The geo array is one massive line, find it by looking for  geo: [  pattern
const m = s.match(/(geo:\s*\[)([^\]]+)(\])/);
const prefix = m[1], geoText = m[2], suffix = m[3];

// Parse quoted entries
const entries = [];
const re = /"([^"]+)"/g;
let match;
while ((match = re.exec(geoText)) !== null) entries.push(match[1]);

console.log('Total geo entries:', entries.length);

// Find ALL 2-char entries
const twoChar = entries.filter(e => e.length === 2);
console.log('2-char entries:', twoChar.length);

// These are 2-char entries that are clearly NOT primarily geographic words
// They are common Chinese words, brand names, or other non-geographic terms
// that happen to match short place names
const REMOVE = new Set([
  // 麒麟区→曲靖, 但"麒麟"本身是神兽/啤酒/芯片品牌
  '麒麟',
  // 合作市→甘南, 但"合作"是超级常用词
  '合作',
  // 公安县→湖北, 但"公安"是警察
  '公安',
  // 海盐县→浙江, 但"海盐"是调味品
  '海盐',
  // 无为市→安徽, 但"无为"是道家概念
  '无为',
  // 商城县→河南, 但"商城"是购物网站
  '商城',
  // 通道县→湖南, 但"通道"是常用词
  '通道',
  // 双峰县→湖南, 但"双峰"是敏感词/常用词
  '双峰',
  // 蓝山县→湖南, 但"蓝山咖啡"更出名
  '蓝山',
  // 中方县→湖南, 但"中方"作为"中国方面"极常用
  '中方',
  // 仙桃市→湖北, 但"仙桃"是神话水果
  '仙桃',
  // 龙泉市→浙江, 但"龙泉剑"更出名
  '龙泉',
  // 芙蓉区→长沙, 但"芙蓉"是花/芙蓉王
  '芙蓉',
  // 衡山县→湖南, 但"衡山"是五岳名山(非地域属性)
  // Actually 衡山 is both a geo name AND a mountain. Keep it ambiguous.
  // But remove these clearly wrong ones:
  // 武功县→陕西, 但"武功"是武术/常用词
  '武功',
  // 友谊县→黑龙江, 但"友谊"是常用词
  '友谊',
  // 四方台区→双鸭山, 但"四方"是常用词
  '四方',
  // 工农区→鹤岗, 但"工农"是政治术语
  '工农',
  // 前进区→佳木斯, 但"前进"是常用词
  '前进',
  // 爱民区→牡丹江, 但"爱民"是常用词
  '爱民',
  // 向阳区→鹤岗, 但"向阳"是常用词
  '向阳',
  // 新兴区→七台河/云浮, 但"新兴"是常用词
  '新兴',
  // 友好区→伊春, 但"友好"是常用词
  '友好',
  // 大同区→大庆, 但"大同"是社会理想/常用词
  // Actually 大同 is also a major city (Datong, Shanxi) - keep, it's primarily geographic
  // 大同 is in the safe list above
]);

// Count how many of these are actually in the geo dict
let found = [];
for (const name of REMOVE) {
  if (twoChar.includes(name)) {
    found.push(name);
  }
}
console.log('\nEntries to remove:', found.join(', '));

if (found.length === 0) {
  console.log('Nothing to remove.');
  process.exit(0);
}

// Rebuild geo text without those entries
// Need to handle both "麒麟" and "麒麟区" - only remove the exact 2-char match
const newEntries = entries.filter(e => !(e.length === 2 && REMOVE.has(e)));
console.log(`\nRemoved ${entries.length - newEntries.length} entries`);
console.log(`New total: ${newEntries.length}`);

// Rebuild the geo array text
const newGeoText = newEntries.map(e => '"' + e + '"').join(',');
const newContent = s.replace(/(geo:\s*\[)([^\]]+)(\])/, '$1' + newGeoText + '$3');

fs.writeFileSync('D:/BianCheng/分词工具/build/app.html', newContent, 'utf8');
console.log('File updated successfully.');
