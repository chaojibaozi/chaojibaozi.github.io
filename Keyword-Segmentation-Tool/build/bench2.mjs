import { api } from './test_seg_audit.mjs';
api.buildRegexCache?.();
const kws=[]; for(let i=0;i<50000;i++) kws.push('测试词'+(i%2000)+'空调论坛');
const t0=Date.now();
let c=0; for(const k of kws){ const r=api.classify(k); if(r&&r.cat) c++; }
const t1=Date.now();
console.log('classify() single-call', c, 'in',(t1-t0),'ms =>',Math.round(c/((t1-t0)/1000)),'kw/s');
