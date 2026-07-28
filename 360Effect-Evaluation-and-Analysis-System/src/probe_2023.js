// 探针：只读 2023 批次每个文件头部，摸清 schema，定位解析风险。复用引擎 decodeCsv/parseCSV，单文件 try/catch。
const fs = require('fs');

function dummyEl(){return new Proxy({style:{},classList:{add(){},remove(){},contains(){return false}},dataset:{},options:[],value:'',innerHTML:'',textContent:'',addEventListener(){},appendChild(){},querySelector(){return dummyEl()},querySelectorAll(){return[]}},{get(t,k){if(k in t)return t[k];return t[k]=typeof k==='string'&&k.startsWith('on')?null:t[k];},set(t,k,v){t[k]=v;return true;}});}
global.document={getElementById:()=>dummyEl(),querySelector:()=>dummyEl(),querySelectorAll:()=>[],createElement:()=>dummyEl(),body:dummyEl()};
global.window={scrollTo(){}};
global.localStorage={_s:{},getItem(k){return this._s[k]||null},setItem(k,v){this._s[k]=v},removeItem(k){delete this._s[k]}};
global.navigator={clipboard:{writeText:()=>Promise.resolve()}};
global.confirm=()=>true; global.fetch=()=>Promise.reject(new Error('off'));

function loadScript(p){let c=fs.readFileSync(p,'utf8');c=c.replace(/^(let|const) /gm,'var ');(0,eval)(c);}
loadScript('src/part3_core.js'); // decodeCsv, parseCSV, detectType, detectDevice, findDateCol, isSingleDate, cleanDate

const dir = 'testdata/';
const files = fs.readdirSync(dir).filter(f=>f.includes('2023-08-01')).sort();
const MAX_BYTES = 200*1024;
const MAX_LINES = 80;

for(const f of files){
  try{
    const fp = dir+f;
    const st = fs.statSync(fp);
    const end = Math.min(MAX_BYTES, st.size);
    const buf = fs.readFileSync(fp, {start:0, end});
    const s = decodeCsv(buf);                  // 引擎自带 GB18030 回退
    // 截断到最近换行，最多 MAX_LINES 行
    let text = s;
    const nl = text.indexOf('\n');
    const lines = text.split('\n');
    text = lines.slice(0, MAX_LINES).join('\n');
    const rows = parseCSV(text);
    const header = rows[0]||[];
    const dateCol = findDateCol(header);
    const sampleRows = rows.slice(1,6);
    const dateSamples = dateCol>=0 ? sampleRows.map(r=>r[dateCol]).filter(Boolean).slice(0,3) : [];
    const type = detectType(header, f);
    const dev = detectDevice(f, sampleRows);
    const singleCnt = dateSamples.filter(d=>isSingleDate(String(d).trim())).length;
    const sizeMB = (st.size/1048576).toFixed(1);
    console.log(`\n### ${f}  [${sizeMB}MB] type=${type} dev=${dev}`);
    console.log(`  日期列#${dateCol}=${header[dateCol]||'?'} | 单日样本 ${singleCnt}/${dateSamples.length} | 样本: ${dateSamples.join(' | ')}`);
    console.log(`  表头(${header.length}): ${header.slice(0,16).join(', ')}${header.length>16?' …':''}`);
  }catch(e){
    console.log(`\n### ${f}  [ERROR] ${e.message}`);
  }
}
console.log('\n=== 探针完成，无 OOM ===');
