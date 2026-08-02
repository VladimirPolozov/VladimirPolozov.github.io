'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./transpose-core.js');

const dir = path.join(__dirname, '..', 'songs');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

let added = 0;
let skipped = [];
for (const f of files) {
  const fp = path.join(dir, f);
  let text = fs.readFileSync(fp, 'utf8');
  if (/^\uFEFF?---\r?\n/.test(text)) {
    skipped.push(f + ' (already has frontmatter)');
    continue;
  }
  const lines = text.split(/\r?\n/);
  let keyLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/Тональность/i.test(lines[i])) {
      keyLine = lines[i];
      break;
    }
  }
  if (keyLine === null) {
    skipped.push(f + ' (no Тональность)');
    continue;
  }
  const after = keyLine.slice(keyLine.search(/Тональность/i) + 'Тональность'.length);
  const key = C.matchKey(after);
  if (!key) {
    skipped.push(f + ' (no key in: ' + keyLine + ')');
    continue;
  }
  fs.writeFileSync(fp, '---\nkey: ' + key + '\n---\n' + text, 'utf8');
  added++;
}
console.log('Added frontmatter to:', added);
console.log('Skipped:', skipped.length ? skipped.join('\n') : 'none');
