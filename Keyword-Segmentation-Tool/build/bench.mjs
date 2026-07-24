import { api, classifyBatch } from './test_seg_audit.mjs';
// 生成 50000 条简单关键词
const kws = [];
for (let i=0;i<50000;i++) kws.push('测试词'+i+'空调');
const t0=Date.now();
const r = classifyBatch(kws);
const t1=Date.now();
console.log('classified', r.length, 'in', (t1-t0), 'ms =>', Math.round(r.length/((t1-t0)/1000)), 'kw/s');
