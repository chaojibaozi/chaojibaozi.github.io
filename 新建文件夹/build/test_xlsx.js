const fs = require('fs');
const path = require('path');
const XLSX = require('./sheetjs.full.min.js');

const appPath = path.join(__dirname, 'app.html');
const html = fs.readFileSync(appPath, 'utf-8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
let code = m[1];
function makeProxy(){ const t=function(){}; t.style={}; t.dataset={}; t.classList={add(){},remove(){},toggle(){},contains(){return false;}}; t.children=[]; t.files=[]; t.appendChild=c=>c; t.querySelectorAll=()=>[]; t.querySelector=()=>makeProxy(); t.addEventListener=()=>{}; return new Proxy(t,{get(o,p){if(p in o)return o[p]; if(p==='length')return 0; return makeProxy();},set(o,p,v){o[p]=v;return true;}}); }
const documentStub={getElementById:()=>makeProxy(),createElement:()=>makeProxy(),addEventListener:()=>{},body:makeProxy()};
code += '\n;return {parseXLSX, exportXLSX, state, runClassification};';
const api = new Function('document','XLSX','FileReader','window','setTimeout','clearTimeout', code)(documentStub, XLSX, function(){}, {}, setTimeout, clearTimeout);

// 1) build a real xlsx buffer (simulating an uploaded file)
const ws = XLSX.utils.aoa_to_sheet([['关键词','搜索量'],['苹果手机',1234],['华为 怎么样',88],['怎么选空调',50]]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const buf = XLSX.write(wb, {type:'array', bookType:'xlsx'});

// 2) parse it back through the app's parseXLSX
const rows = api.parseXLSX(new Uint8Array(buf));
console.log('PARSED ROWS:', JSON.stringify(rows));
const ok1 = rows.length===4 && rows[0][0]==='关键词' && rows[1][0]==='苹果手机' && rows[3][0]==='怎么选空调';
console.log('XLSX_READ_OK', ok1);

// 3) ingest + classify + export to a real file
api.state.header = rows[0];
api.state.dataRows = rows.slice(1);
api.state.keywordCol = 0;
api.runClassification();
console.log('CLASSIFIED:', api.state.results.map(r=>r.kw+'->'+r.cat).join(', '));

// 4) export path: temporarily redirect XLSX.writeFile to capture
let written=null;
const origWriteFile = XLSX.writeFile.bind(XLSX);
XLSX.writeFile = (w,b)=>{ written = XLSX.write(w,{type:'array',bookType:'xlsx'}); fs.writeFileSync(path.join(__dirname,'_out_test.xlsx'), Buffer.from(written)); };
api.exportXLSX();
XLSX.writeFile = origWriteFile;
// read back exported file
const back = XLSX.read(fs.readFileSync(path.join(__dirname,'_out_test.xlsx')), {type:'buffer'});
const backRows = XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], {header:1});
console.log('EXPORTED ROWS:', JSON.stringify(backRows.slice(0,3)));
const ok2 = backRows[0].includes('分类') && backRows[0].includes('置信度') && backRows[0].includes('命中规则');
console.log('XLSX_EXPORT_OK', ok2);
