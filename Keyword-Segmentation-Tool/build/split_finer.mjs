import fs from 'fs';
import path from 'path';

const all = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'finer_industries.json'), 'utf-8'));

// 空泛/重复价值低的标签（作为独立"更细行业"意义不大，剔除以聚焦真正更细的子行业）
const JUNK = new Set(['其他', '其它', '综合', '咨询', '代理', '设计', '认证', '展会', '拍卖', '配音', '公关', '调查', '平台类', '下载类', '硬件', '配件', '耗材', '日常用品', '礼品', '工艺品', '奢侈品', '综合平台', '线下实体', '商业', '零售', '云购', '家教', '游学', '按摩', '开锁', '办证刻章', '生活用品', '饰品礼品', '综合教育', '在线综合教育', '特殊人群培训', '在线信息', '在线代理', '在线设计', '在线策划', '在线商服', '在线检验检测', '在线知识产权', '休闲', '文娱', '投资', '保健', '两性', '占卜', '疾病', '玉石', '资讯', '资讯-其他', '资讯-军事', '娱乐活动', '娱乐休闲', '综合资讯', '常见病资讯', '常见病资讯平台', '金融交流', '金融分析平台', '在线职业教育', '在线学历教育', '在线培训', '机械电子', '美容化妆', '教育培训', '干洗加盟', '出国移民', '咨询策划', '信息服务', '司法鉴定', '广告', '基因检测', '医疗中介', '医疗咨询', '养生', '分类信息', '宗教用品', '各类APP', '微博', '论坛', '直播', '交友', '社交']);

// EXPAND 派生（finer != top）优先级更高：属于真正"深度更细"的子行业
const expanded = all.filter(x => x.finer !== x.top && !JUNK.has(x.finer));
const fallbackMeaningful = all.filter(x => x.finer === x.top && !JUNK.has(x.finer));

// 目标：50000/行业，控制总量在 ~1250 万（约 45 分钟）→ 250 个更细行业
const TARGET = 256;
let list = [...expanded];
for (const it of fallbackMeaningful) { if (list.length >= TARGET) break; list.push(it); }
list = list.slice(0, TARGET);

// 按 finer 去重
const seen = new Set(); const final = [];
for (const it of list) { if (!seen.has(it.finer)) { seen.add(it.finer); final.push(it); } }

// 分成 8 片（8 核并行）
const N = 8;
const slices = Array.from({ length: N }, () => []);
final.forEach((it, i) => slices[i % N].push(it));

const dir = path.join(import.meta.dirname, 'slices_v3');
fs.mkdirSync(dir, { recursive: true });
slices.forEach((s, i) => fs.writeFileSync(path.join(dir, `slice_${i}.json`), JSON.stringify(s), 'utf-8'));

console.log('EXPAND派生更细行业:', expanded.length, ' 有效回退标签:', fallbackMeaningful.length);
console.log('最终更细行业数:', final.length, ' 分片数:', N, ' 每片约:', Math.ceil(final.length / N), '行业');
console.log('预计总关键词:', (final.length * 50000).toLocaleString());
