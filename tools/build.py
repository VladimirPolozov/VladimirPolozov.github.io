#!/usr/bin/env python3
"""Сборка сайта по метаданным tools/song_meta.py:

  1. приводит заголовок каждой песни к названию (RU, иначе EN) и добавляет
     под ним блок справки: исполнители, оригинал, тональность;
  2. генерирует страницу на каждого исполнителя (artists/<slug>.md);
  3. генерирует индекс исполнителей (artists/index.md);
  4. пересобирает _sidebar.md (только названия песен + ссылка на исполнителей).

Запуск: python tools/build.py
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

from song_meta import SONG_META

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / 'songs'
ARTISTS = ROOT / 'artists'

RUS = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', ' ': '-',
}


def slug(s: str) -> str:
    s = s.lower().replace('&', ' and ').replace("'", '').replace('’', '')
    out = []
    for ch in s:
        out.append(RUS.get(ch, ch if ch.isalnum() else '-'))
    s = re.sub(r'-{2,}', '-', ''.join(out)).strip('-')
    return s[:60] or 'artist'


def title_of(meta) -> str:
    return meta.get('title_ru') or meta.get('title_en') or ''


def ref_block(meta) -> str:
    parts = []
    artists = [a for a in meta.get('artists', []) if a]
    if artists:
        parts.append(f"**Исполнитель:** {', '.join(artists)}")
    if meta.get('title_en'):
        parts.append(f"**Оригинал:** {meta['title_en']}")
    if meta.get('alt_titles'):
        parts.append(f"**Также:** {', '.join(meta['alt_titles'])}")
    if meta.get('key'):
        parts.append(f"**Тональность:** {meta['key']}")
    return [f'> {p}' for p in parts]


def enrich_song(path: Path, meta):
    text = path.read_text(encoding='utf-8', errors='replace')
    lines = text.splitlines()
    hi = next(i for i, l in enumerate(lines) if l.startswith('# '))
    head = f"# {title_of(meta)}"
    ref = ref_block(meta)
    k = hi + 1
    while k < len(lines) and not lines[k].strip():
        k += 1
    while k < len(lines) and lines[k].lstrip().startswith('>'):
        k += 1
    body = lines[k:]
    new = lines[:hi] + [head, ''] + ref + ['', ''] + body
    path.write_text('\n'.join(new).strip() + '\n', encoding='utf-8',
                    newline='\n')


def main():
    by_artist = defaultdict(list)
    for fn, meta in SONG_META.items():
        for a in meta.get('artists', []):
            by_artist[a].append((fn, meta))

    # 1. заголовки и блок справки в песнях
    for fn, meta in SONG_META.items():
        p = SONGS / fn
        if not p.exists():
            print(f'! нет файла: {fn}')
            continue
        enrich_song(p, meta)

    # 2. страницы исполнителей
    ARTISTS.mkdir(exist_ok=True)
    total_artist_songs = 0
    for artist, items in sorted(by_artist.items()):
        items.sort(key=lambda x: title_of(x[1]).casefold())
        lines = [f'# {artist}', '']
        n = len(items)
        lines.append(f'В архиве {n} песня(ен).')
        lines.append('')
        for fn, meta in items:
            lines.append(f'- [{title_of(meta)}](/songs/{fn})')
        lines.append('')
        (ARTISTS / f'{slug(artist)}.md').write_text(
            '\n'.join(lines), encoding='utf-8', newline='\n')
        total_artist_songs += n

    # 3. индекс исполнителей
    artists_sorted = sorted(by_artist, key=lambda a: a.casefold())
    lines = ['# Исполнители', '']
    lines.append(
        f'В архиве {len(artists_sorted)} исполнителей '
        f'({len(SONG_META)} песен).')
    lines.append('')
    for artist in artists_sorted:
        lines.append(f'- [{artist}](/artists/{slug(artist)})')
    lines.append('')
    (ARTISTS / 'index.md').write_text('\n'.join(lines), encoding='utf-8',
                                      newline='\n')

    # 4. сайдбар
    song_items = sorted(SONG_META.items(),
                        key=lambda kv: title_of(kv[1]).casefold())
    sb = ['- [Главная](/)', '- [Исполнители](/artists/index)', '**Песни**']
    sb += [f'  - [{title_of(meta)}](/songs/{fn})'
           for fn, meta in song_items]
    (ROOT / '_sidebar.md').write_text('\n'.join(sb) + '\n',
                                      encoding='utf-8', newline='\n')

    print(f'Песен: {len(SONG_META)}')
    print(f'Исполнителей: {len(by_artist)} '
          f'(записей в страницах: {total_artist_songs})')
    print('Сайдбар, страницы исполнителей и заголовки песен обновлены.')


if __name__ == '__main__':
    main()
