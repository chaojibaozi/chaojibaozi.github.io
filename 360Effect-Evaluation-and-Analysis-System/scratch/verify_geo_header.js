// 只读验证：对比地域报告表头列名，确认「市级地区」vs「城市」列名差异
const fs = require('fs');
const path = require('path');
const TD = path.join(__dirname, '..', 'testdata');

function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('gb18030').decode(buf); }
}

const files = [
  'xc捷配信息_2026-04-28至2026-07-27_地域分析报告 (1).csv',
  'xc捷配信息_2026-04-28至2026-07-27_地域分析报告.csv',
  '2023-08-01至2024-01-31搜索组pc端搜索类市级地域报告43262585.csv',
  '2023-08-01至2024-01-31搜索计划移动端搜索类市级地域报告43262584.csv',
];

for (const f of files) {
  const p = path.join(TD, f);
  if (!fs.existsSync(p)) { console.log('[缺失] ' + f); continue; }
  const txt = decode(fs.readFileSync(p));
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  console.log('=== ' + f);
  console.log('表头: ' + lines[0].slice(0, 300));
  console.log('首行: ' + (lines[1] || '').slice(0, 300));
  // 模拟 part3_core.js 的 idx 匹配
  const header = lines[0].replace(/^\uFEFF/, '').split(',').map(x => x.trim().replace(/^"|"$/g, ''));
  const idx = n => header.findIndex(h => h.includes(n));
  console.log('idx(城市)=' + idx('城市') + '  idx(市级地区)=' + idx('市级地区') + '  idx(省级地区)=' + idx('省级地区'));
  console.log('');
}
