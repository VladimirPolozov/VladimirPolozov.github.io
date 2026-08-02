'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./transpose-core.js');

const songsDir = path.join(__dirname, '..', 'songs');
const files = fs.readdirSync(songsDir).filter(f => f.endsWith('.md'));

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error('  FAIL:', msg);
  }
}

// --- Явные проверки транспонирования ---
console.log('Транспонирование отдельных аккордов:');
const cases = [
  ['C', 1, 'C#'],
  ['Hm', 1, 'Cm'],
  ['Bb', 1, 'H'],
  ['G/H', 1, 'G#/C'],
  ['G#m7', 1, 'Am7'],
  ['A/С#', 1, 'Bb/D'], // кириллическая С
  ['Bm7b5', 1, 'Cm7b5'],
  ['E•', 1, 'F•'],
  ['Cadd9', -1, 'Hadd9'],
  ['Ebm/Gb', 1, 'Em/G'],
  ['Am7', 1, 'Bbm7'],
  ['F#m/А', 1, 'Gm/Bb'], // кириллическая А
  ['G/Н', 1, 'G#/C'], // кириллическая Н
  ['С#m', 1, 'Dm'], // кириллическая С
  ['A2/C#', 1, 'Bb2/D'],
  ['E', 0, 'E'],
  ['H', 12, 'H'],
  ['Em7', -1, 'D#m7'],
  ['Ab9 Ab | Eb/G Ab | Eb Bb7/Eb |', -1, 'G9 G | D/F# G | D A7/D |'] // cдвиг вниз
];
for (const [chord, k, expected] of cases) {
  const got = C.scanAndTranspose(chord, k);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${JSON.stringify(chord)} ${k > 0 ? '+' : ''}${k} => ${JSON.stringify(got)} (ожидается ${JSON.stringify(expected)}) ${ok ? 'OK' : 'FAIL'}`);
}

console.log('\nСтроки с тональностью:');
for (const [text, k, expected] of [
  ['Тональность: C#m', 1, 'Тональность: Dm'],
  ['**Тональность:** G major', 1, '**Тональность:** G# major'],
  ['Key: Hm', 1, 'Key: Cm']
]) {
  const got = C.transposeKeyText(text, k);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${JSON.stringify(text)} +${k} => ${JSON.stringify(got)} ${ok ? 'OK' : 'FAIL'}`);
}

console.log('\nkeyAfter:');
for (const [base, k, expected] of [
  ['C#m', 2, 'D#m'],
  ['Hm', 1, 'Cm'],
  ['G', -2, 'F'],
  ['Am', 7, 'Em']
]) {
  const got = C.keyAfter(base, k);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${base} +${k} => ${got} (ожидается ${expected}) ${ok ? 'OK' : 'FAIL'}`);
}

// --- Сбор аккордовых строк по корпусу ---
const chordLines = [];
const linesAfterLyrics = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(songsDir, f), 'utf8');
  const parts = text.split('## Слова');
  const body = parts[0] || text;
  const lyrics = parts.length > 1 ? parts.slice(1).join('## Слова') : '';
  for (const line of body.split('\n')) {
    if (C.isChordLine(line)) chordLines.push({ file: f, line });
  }
  for (const line of lyrics.split('\n')) {
    if (C.isChordLine(line)) linesAfterLyrics.push({ file: f, line });
  }
}
console.log(`\nАккордовых строк всего: ${chordLines.length}`);
console.log(`Аккордовых строк после "## Слова": ${linesAfterLyrics.length}`);

// --- Круговая проверка по питчам: transpose(+k) затем transpose(-k) == тот же набор питчей ---
console.log('\nКруговая проверка по питчам на всех аккордовых строках:');
let broken = 0;
for (const { file, line } of chordLines) {
  const orig = C.parsePitches(line);
  for (let k = -11; k <= 11; k++) {
    if (k === 0) continue;
    const t1 = C.transposeChordTokens(line, k);
    const t2 = C.transposeChordTokens(t1, -k);
    const a = C.parsePitches(line);
    const b = C.parsePitches(t2);
    if (a.length !== b.length || a.some((p, i) => p !== b[i])) {
      broken++;
      if (broken <= 10) {
        console.error(`  FAIL ${file}: ${JSON.stringify(line)} k=${k}`);
        console.error(`    t1=${JSON.stringify(t1)}`);
        console.error(`    t2=${JSON.stringify(t2)}`);
        console.error(`    pitches ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
      }
    }
  }
}
console.log(broken === 0 ? '  OK: питчи стабильны во всех строках' : `  ПРОБЛЕМ: ${broken}`);

// --- Только токены-аккорды должны меняться ---
console.log('\nПроверка: не-аккордовые токены в аккордовых строках не меняются:');
let tokenIssues = 0;
for (const { file, line } of chordLines) {
  for (const k of [1, 3, 7, -4]) {
    const out = C.transposeChordTokens(line, k);
    const srcToks = line.split(/(\s+)/);
    const outToks = out.split(/(\s+)/);
    if (srcToks.length !== outToks.length) {
      tokenIssues++;
      console.error(`  FAIL длина ${file}: ${JSON.stringify(line)}`);
      continue;
    }
    // индексы токенов (чётные)
    const toks = [];
    for (let i = 0; i < srcToks.length; i += 2) toks.push({ i, t: srcToks[i] });
    for (const { i, t } of toks) {
      const cls = C.classifyTokenCtx(
        toks.map(x => x.t),
        Math.floor(i / 2)
      );
      if (cls !== 'chord' && srcToks[i] !== outToks[i]) {
        tokenIssues++;
        if (tokenIssues <= 10) {
          console.error(`  FAIL ${file}: токен ${JSON.stringify(srcToks[i])} -> ${JSON.stringify(outToks[i])} (cls=${cls})`);
        }
      }
    }
  }
}
console.log(tokenIssues === 0 ? '  OK' : `  ПРОБЛЕМ: ${tokenIssues}`);

// --- Гейт не трогает не-аккордовые строки (тексты песен, заметки, URL) ---
console.log('\nПроверка: строки текстов и заметок не меняются:');
let lyricChanged = 0;
let scanned = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(songsDir, f), 'utf8');
  for (const line of text.split('\n')) {
    if (C.isChordLine(line)) continue;
    if (/тональн/i.test(line) || /key:/i.test(line)) continue; // тональность должна меняться
    scanned++;
    const out = C.transformText(line, 3, 'line');
    if (out !== line) {
      lyricChanged++;
      if (lyricChanged <= 10) {
        console.error(`  FAIL ${f}: ${JSON.stringify(line)} => ${JSON.stringify(out)}`);
      }
    }
  }
}
console.log(`  OK, не-аккордовых строк: ${scanned}, изменено: ${lyricChanged}`);

// --- Финальный вывод ---
console.log('\n' + (failures === 0 && broken === 0 && tokenIssues === 0 && lyricChanged === 0 ? 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `ОШИБОК: ${failures + broken + tokenIssues + lyricChanged}`));
process.exit(failures === 0 && broken === 0 && tokenIssues === 0 && lyricChanged === 0 ? 0 : 1);
