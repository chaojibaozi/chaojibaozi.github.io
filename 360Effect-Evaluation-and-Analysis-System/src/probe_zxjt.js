/* 探查中信建投 12 文件：编码 / 表头 / 日期列 / 设备信号 / 行数 */
const fs = require('fs');
const path = require('path');
const dir = __dirname + '/../testdata/中信建投/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));

function detectEncoding(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'UTF-8(BOM)';
  // 无BOM：试utf8，看是否含替换符
  const tryU = buf.toString('utf8');
  if (tryU.indexOf('�') === -1) return 'UTF-8(无BOM)';
  return 'GBK/GB18030';
}
// 简易CSV行解析（仅取首行表头 + 首数据行）
function firstRows(text, n) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length && out.length < n; i++) {
    const l = lines[i].trim();
    if (l) out.push(l);
  }
  return out;
}
function splitCSVLine(line) {
  const cells = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

files.sort().forEach(name => {
  const buf = fs.readFileSync(dir + name);
  const enc = detectEncoding(buf);
  const text = enc.startsWith('UTF') ? buf.toString('utf8') : buf.toString('gb18030');
  const rows = firstRows(text, 3);
  const header = rows[0] ? splitCSVLine(rows[0]) : [];
  const firstData = rows[1] ? splitCSVLine(rows[1]) : [];
  // 估算行数（不含表头）
  let est = text.split(/\r?\n/).length - 1;
  // 设备信号
  const headerStr = header.join(',');
  const devSig = [];
  if (/平均排名\s*[（(]/.test(headerStr)) devSig.push('排名含设备括号:' + (headerStr.match(/平均排名\s*[（(][^）)]*[）)]/g) || []).join('/'));
  if (/计算机|PC|电脑/.test(headerStr)) devSig.push('列含计算机/PC');
  if (/移动端|移动|无线/.test(headerStr)) devSig.push('列含移动端');
  if (/设备/.test(headerStr)) devSig.push('列含设备');
  const nameDev = /PC|电脑|计算机/.test(name) ? '文件名含PC/计算机' : (/移动|无线/.test(name) ? '文件名含移动' : '文件名无设备');
  console.log('========================================');
  console.log('文件:', name);
  console.log('  编码:', enc, '| 估算行数:', est);
  console.log('  列数:', header.length);
  console.log('  表头:', header.join(' | '));
  if (firstData.length) console.log('  首数据:', firstData.slice(0, 6).map((v, i) => (header[i] || '?') + '=' + v).join(' | '));
  console.log('  设备信号:', devSig.length ? devSig.join('；') : '（无）', '|', nameDev);
});
console.log('\n探查完成，共', files.length, '个文件');
