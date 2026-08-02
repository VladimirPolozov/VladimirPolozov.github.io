'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'songs');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

let removed = 0;
let skipped = [];
for (const f of files) {
  const fp = path.join(dir, f);
  const text = fs.readFileSync(fp, 'utf8');
  const idx = text.indexOf('## Примечания');
  if (idx < 0) continue;
  let rest = text.slice(idx).trim();
  if (rest === '## Примечания') {
    skipped.push(f);
    continue;
  }
  const head = text.slice(0, idx).replace(/\n+\s*$/, '\n');
  fs.writeFileSync(fp, head, 'utf8');
  removed++;
}
console.log('Removed notes in:', removed);
console.log('Skipped (empty):', skipped.length ? skipped.join(', ') : 'none');
