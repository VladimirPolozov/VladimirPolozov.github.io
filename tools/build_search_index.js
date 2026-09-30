// Генератор поискового индекса песен.
// Запуск: node tools/build_search_index.js
// Пишет search-index.json в корень репозитория.
//
// В индекс попадают только заголовки и строки текста песен:
// строки аккордов отсекаются проверенным isChordLine из transpose-core.js,
// служебные строки (frontmatter, комментарии, блок метаданных, заголовки,
// маркеры секций **Куплет**) выбрасываются.

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Core = require('./transpose-core.js');

const SONGS_DIR = path.join(__dirname, '..', 'songs');
const OUT_FILE = path.join(__dirname, '..', 'search-index.json');
const MAX_LINE = 140;

// Аннотации секций: «Куплет (Жили Павел и Тимофей)», «Вступление: по припеву»,
// «Припев 2 р», одиночное «Структура». Слова песен с такими словами в начале
// строки не трогаем: после названия секции допускается только скобка, двоеточие,
// номер повтора или конец строки. \b не используем — в JS он не работает с кириллицей.
const SECTION_ANNOTATION_RE =
  /^(Куплет|Припев|Предприпев|Бридж|Вступление|Проигрыш|Окончание|Тэг|Поворот|Рэп|Структура|Соло|Аутро|Концовка|Первый куплет|Второй куплет)\s*(\d+\s*[рр]?)?\s*(\(|:|$)/i;

function stripMd(s) {
  return String(s)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSkippable(l) {
  if (!l) return true;
  if (/^<!--/.test(l)) return true; // <!-- tg: msg ... -->
  if (/^>/.test(l)) return true; // блок метаданных
  if (/^#{1,6}\s/.test(l)) return true; // ## Слова
  if (/^\*\*[^*]+\*\*$/.test(l)) return true; // **Куплет**
  if (Core.isChordLine(l)) return true; // строка аккордов
  if (SECTION_ANNOTATION_RE.test(stripMd(l))) return true; // Куплет ( … )
  return false;
}

function parseSong(text, file) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let inFm = false;
  let title = null;
  const body = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const l = raw.trim();

    if (l === '---') {
      inFm = !inFm;
      continue;
    }
    if (inFm) continue;

    if (title === null) {
      const m = /^#\s+(.+)$/.exec(l);
      if (m) title = stripMd(m[1]);
    }

    if (isSkippable(l)) continue;

    const clean = stripMd(l);
    if (!clean) continue;
    if (body.length && body[body.length - 1] === clean) continue; // повтор подряд
    body.push(clean.length > MAX_LINE ? clean.slice(0, MAX_LINE - 1) + '…' : clean);
  }

  if (!title) title = file.replace(/\.md$/i, '').replace(/-/g, ' ');
  return {
    t: title,
    u: '/songs/' + file.replace(/\.md$/i, ''),
    b: body.join('\n'),
  };
}

function main() {
  const files = fs
    .readdirSync(SONGS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const songs = files.map((f) =>
    parseSong(fs.readFileSync(path.join(SONGS_DIR, f), 'utf8'), f)
  );

  const json = JSON.stringify({ v: 1, s: songs });
  fs.writeFileSync(OUT_FILE, json + '\n', 'utf8');

  const buf = Buffer.from(json, 'utf8');
  const lineCount = songs.reduce((n, s) => n + (s.b ? s.b.split('\n').length : 0), 0);
  const empty = songs.filter((s) => !s.b).length;

  console.log('песен:', songs.length, '| строк текста:', lineCount, '| без текста:', empty);
  console.log(
    'search-index.json:',
    (buf.length / 1024).toFixed(1) + ' КБ raw,',
    (zlib.gzipSync(buf).length / 1024).toFixed(1) + ' КБ gzip'
  );
}

main();