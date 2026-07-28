// Recon: summarize all xc捷配 CSV files in the download dir
const fs = require('fs');
const path = require('path');

const DIR = "D:/360浏览器下载的文件";
const files = fs.readdirSync(DIR).filter(f => f.startsWith('xc捷配信息') && (f.endsWith('.csv') || !f.includes('.')));

function decode(buf) {
  let s = buf.toString('utf8');
  if (s.indexOf('�') >= 0) {
    try { s = new (require('util').TextDecoder)('gb18030').decode(buf); } catch (e) {}
  }
  return s;
}
function parseLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i+1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(v => v.replace(/^="?|"?$/g, '').trim());
}
function unq(v){ return String(v).replace(/^="?|"?$/g,'').trim(); }
function isDate(v){ return /^\d{4}-\d{2}-\d{2}$/.test(unq(v)); }

console.log('FILE | size | rows | dateCol | dateOK% | dRange | deviceCols | deviceVals | dims(计划/组/省/市/搜索词/关键词/创意/排名/设备列)');
for (const f of files) {
  const fp = path.join(DIR, f);
  const buf = fs.readFileSync(fp);
  const s = decode(buf);
  const lines = s.split(/\r?\n/).filter(l => l.length);
  if (lines.length === 0) { console.log(f, '| EMPTY'); continue; }
  const header = parseLine(lines[0]);
  const rows = lines.slice(1);
  const n = rows.length;
  // date col
  let dateIdx = header.findIndex(h => /^(时间|日期)$/.test(h));
  let dateOK = 0, dmin = null, dmax = null;
  if (dateIdx >= 0) {
    for (const r of rows) {
      const cells = parseLine(r);
      const v = cells[dateIdx];
      if (isDate(v)) { dateOK++; const d = unq(v); if (!dmin || d < dmin) dmin = d; if (!dmax || d > dmax) dmax = d; }
    }
  }
  const datePct = dateIdx >= 0 ? (100 * dateOK / n).toFixed(0) : 'NA';
  // device columns
  const devCols = header.map((h,i)=>[h,i]).filter(([h])=>/设备|投放设备|设备类型/.test(h)).map(([h])=>h);
  let devVals = new Set();
  if (devCols.length) {
    const di = header.findIndex(h => /设备|投放设备|设备类型/.test(h));
    for (const r of rows) { const c = parseLine(r); if (c[di]) devVals.add(unq(c[di])); }
  }
  // filename device signal
  const fnDev = /pc|计算机|pc端/i.test(f) ? 'pc?' : (/移动|无线|移动端/i.test(f) ? 'mob?' : '');
  const dims = {
    计划: header.some(h=>/推广计划/.test(h)),
    组: header.some(h=>/推广组/.test(h)),
    省: header.some(h=>/省级地区/.test(h)),
    市: header.some(h=>/市级地区/.test(h)),
    搜索词: header.some(h=>/搜索词/.test(h)),
    关键词: header.some(h=>/关键词/.test(h)),
    创意: header.some(h=>/创意标题/.test(h)),
    排名: header.some(h=>/平均排名/.test(h)),
  };
  console.log([
    f.replace('xc捷配信息_','').replace('_2026','_2026'),
    buf.length, n,
    dateIdx>=0?header[dateIdx]:'NONE',
    datePct,
    dmin&&dmax?(dmin+'~'+dmax):'',
    devCols.join('|') + (fnDev?(' +'+fnDev):''),
    [...devVals].slice(0,4).join('/'),
    JSON.stringify(dims)
  ].join(' | '));
}
