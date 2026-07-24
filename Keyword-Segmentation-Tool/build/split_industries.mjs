import fs from 'fs';
import path from 'path';

const raw = fs.readFileSync(path.join(import.meta.dirname, 'industries_raw.txt'), 'utf-8');
const seen = new Set();
const list = [];
for (const line of raw.split(/\r?\n/)) {
  for (const part of line.split(/[,，]/)) {
    const t = part.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    list.push(t);
  }
}

const N = 10;
const slices = Array.from({ length: N }, () => []);
list.forEach((name, i) => slices[i % N].push(name));

const outDir = path.join(import.meta.dirname, 'slices');
fs.mkdirSync(outDir, { recursive: true });
slices.forEach((s, i) => {
  fs.writeFileSync(path.join(outDir, `slice_${i}.json`), JSON.stringify(s, null, 0));
});

console.log(`Total unique industries: ${list.length}`);
console.log(`Slices: ${N}, sizes: ${slices.map(s => s.length).join(', ')}`);
console.log(`Slice files written to ${outDir}`);
