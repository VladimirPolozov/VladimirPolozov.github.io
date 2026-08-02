#!/usr/bin/env python3
"""Извлекает метаданные песен (название RU/EN, исполнители, тональность)
из заголовков songs/*.md в tools/song_meta.py.

Правит только новые файлы: существующие записи в song_meta.py сохраняются,
поэтому ручные правки не теряются при повторном запуске.

В конце печатает список сомнительных случаев для ручной проверки.
"""
import json
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / 'songs'
OUT = ROOT / 'tools' / 'song_meta.py'

# --- известные исполнители (для распознавания внутри скобок) ---
KNOWN_ARTISTS = [
    'Bethel Music', 'Nuteki Worship', 'Derech', 'Paul Wilbur',
    'Jesus Culture', 'Third Day', 'Слово Жизни', 'Слово Жизни Music',
    'Валерий Короп', 'Виктор Лавриненко', 'SokolovBrothers',
    'Hillsong', 'Hillsong Worship', 'Hillsong United', 'Hillsong Kids',
    'Hillsong Y&F', 'Краеугольный камень', 'RCC Worship', 'Unknown artist',
    'Israel Houghton', 'Jeremy Riddle', 'Onething Live', 'Keith Green',
    'Sonicflood', 'Селах', 'Ольга Марина', 'Not an Idol',
    'Carleigh Conant', 'Don Moen', 'Reallife band', 'Hungrygen Worship',
    'Michael W. Smith', 'Generacion 12', 'ARK WORSHIP', 'Elevation Worship',
    'Филипп Реннер', 'Shekinah Glory', 'Виталий Ефремочкин', 'Chris Tomlin',
    'Misty Edwards', 'Matt Redman', '4U Band', 'Voice of Children\u2019s Choir',
    'Crowder', 'Delirious', 'Martin Smith', 'Phil Driscoll', 'Subcultura',
    'Planetshakers', 'Terry MacAlmon', 'Mosaic MSC', 'Roy Fields',
    'Yancy & Little Praise Party', 'John Thurlow', 'Александр Тихомиров',
    'Элиза Белосевич-Дириенко', 'Vineyard Worship', 'Brian Johnson',
    'Crest Music', 'David Brymer', 'Lenny LeBlanc', 'Carpen Diaz',
    'Ryan Ellis', 'New Life Worship', 'Phil Wickham', 'Deluge',
    'Charlie LeBlanc', 'Kirk Franklin', 'Галим Хусаинов', 'Oasis Worship',
    'GONG', 'MercyMe', 'Josh Groban', 'Tommee Profitt', 'Аргам Хачатрян',
    'Дмитрий Притула', 'Церковь Божья в Царицыно',
]

# унификация написания имён исполнителей
NORMALIZE_ARTIST = {
    'RCC WORSHIP': 'RCC Worship',
    'Sokolovbrothers': 'SokolovBrothers',
    'Unknown Artist': 'Unknown artist',
    'Краеугольный Камень': 'Краеугольный камень',
}

# ручные правки, которые не удаётся вывести эвристикой.
# ключ — имя файла, значение — словарь с полями для переопределения.
MANUAL = {
    'kak-ty-velik-hymn-how-great-thou-art.md': {
        'artists': [], 'title_en': 'How Great Thou Art'},
    'carstvuet-nash-gospod-agnus-dei.md': {
        'title_ru': 'Царствует наш Господь', 'title_en': 'Agnus Dei',
        'artists': []},
    'svyataya-noch-o-holy-night-68.md': {'artists': []},
    'radujsya-mir-joy-to-world.md': {'artists': []},
    'slava-v-vyshnih-bogu-angels-we-had-heard-on-high.md': {'artists': []},
    'o-etot-den-voice-of-childrens-choir-oh-happy-day.md': {
        'artists': ['Voice of Children\u2019s Choir'], 'title_en': 'Oh, Happy Day'},
    'zvezd-divnye-almazy-dmitrij-pritula-cerkov-bozhya-v-caricyno.md': {
        'artists': ['Дмитрий Притула', 'Церковь Божья в Царицыно']},
    'iisus-moj-drug-not-an-idol.md': {
        'artists': ['Not an Idol'], 'title_en': 'Not an Idol'},
    'krov-hrista-krov-krov-chto-omyla-nas.md': {
        'artists': [], 'alt_titles': ['Кровь, кровь что омыла нас']},
    'zhertvoj-iisusa-hrista-blagoslovi-dusha-moya-gospoda.md': {
        'artists': [], 'alt_titles': ['Благослови душа моя, Господа']},
    'uzok-put-moj-gospod-iisus-hristos.md': {
        'artists': [], 'alt_titles': ['Мой Господь — Иисус Христос']},
    'yahve-slavu-nam-yavlyaj-oasis-worship-yahweh-se-manifestara.md': {
        'title_en': 'Yahweh Se Manifestará', 'alt_titles': []},
}

CYR = r'[А-ЯЁа-яё]'


def norm_seg(t: str) -> str:
    s = re.sub(r'[«»“”"\'’\u2019`.,?!:;()\[\]&/+]', ' ', t)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s


KNOWN = {norm_seg(x) for x in KNOWN_ARTISTS}


def is_known(x: str) -> bool:
    return norm_seg(x) in KNOWN


def has_cyr(x: str) -> bool:
    return bool(re.search(CYR, x))


K = r'[a-hA-HА-ЯЁа-яё][#b]?[a-z]*'
KEY_PATTERNS = [
    rf'\s+-\s+[0-9]+\s*/\s*[0-9]+\s+-\s+{K}\s*$',
    rf'\s+-\s+{K}\s+[0-9]+\s*/\s*[0-9]+\s*$',
    rf'\s+-\s+{K}\s+\([^()]*\)\s*$',
    rf'\s+-\s+{K}\*?\s*$',
    rf'\s+\([0-9]+\s*/\s*[0-9]+\)\s+-\s+{K}\s*$',
    rf'\s+\([0-9]+\s*/\s*[0-9]+\)\s*$',
    rf'\s+\(({K})\)\s*$',
    rf'\s+-\s+[0-9]+\s*/\s*[0-9]+\s*$',
]


def strip_key(s: str):
    for pat in KEY_PATTERNS:
        m = re.search(pat, s)
        if m:
            key = m.group(0).strip()
            s = s[:m.start()].strip()
            key = re.sub(r'^-\s*', '', key).strip()
            if key.startswith('(') and key.endswith(')'):
                key = key[1:-1].strip()
            return s, key
    return s, ''


def normalize_key(key: str) -> str:
    for old, new in [('А', 'A'), ('Е', 'E'), ('Н', 'H')]:
        key = key.replace(old, new)
    return key


def split_paren_groups(s: str):
    groups, depth, start = [], 0, None
    for i, ch in enumerate(s):
        if ch == '(':
            if depth == 0:
                start = i
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                groups.append((start, i))
    return groups


def split_artists(c: str):
    parts = [p.strip() for p in re.split(r'(?:\s*,\s*|\s+feat\.\s+)', c)]
    return [NORMALIZE_ARTIST.get(p, p) for p in parts if p]


def classify(content: str):
    """Классифицирует содержимое скобочной группы."""
    c = content.strip()
    if re.fullmatch(r'[0-9]+\s*/\s*[0-9]+', c):
        return 'meter', None
    if ' - ' in c:
        parts = [p.strip() for p in c.split(' - ')]
        known_idx = [i for i, p in enumerate(parts) if is_known(p)]
        if known_idx:
            art = [NORMALIZE_ARTIST.get(parts[i], parts[i])
                   for i in known_idx]
            other = [parts[i] for i in range(len(parts)) if i not in known_idx]
            return 'art_title', (art, other)
        cyr = [has_cyr(p) for p in parts]
        if all(cyr):
            return 'art_title', ([parts[0]], parts[1:])
        if any(cyr):
            en = [p for p, cy in zip(parts, cyr) if not cy]
            ru = [p for p, cy in zip(parts, cyr) if cy]
            return 'art_title', (en, ru)
        return 'en_en_unknown', parts
    if is_known(c):
        return 'artist', [NORMALIZE_ARTIST.get(c, c)]
    if has_cyr(c):
        if ',' in c or ' feat.' in c.lower():
            return 'artist', split_artists(c)
        return 'ru_alt', c
    return 'en_title', c


def looks_like_name(x: str) -> bool:
    if has_cyr(x):
        return False
    words = x.split()
    return 0 < len(words) <= 4 and words[0][:1].isupper()


def join_en(main: str, subs: list) -> str:
    s = main or ''
    for sub in subs:
        if sub.strip().lower() not in s.lower():
            s = f'{s} ({sub})'.strip()
    return s


def parse_title(raw: str):
    s = raw.strip().replace('–', '-').replace('—', '-')
    s, key = strip_key(s)
    key = normalize_key(key)

    groups = split_paren_groups(s)
    artists, en_parts, ru_alts = [], [], []
    flags = []
    for a, b in reversed(groups):
        content = s[a + 1:b]
        s = s[:a] + s[b + 1:]
        kind, val = classify(content)
        if kind == 'meter':
            pass
        elif kind == 'artist':
            artists = val + artists
        elif kind == 'art_title':
            art, other = val
            artists = art + artists
            for p in other:
                if has_cyr(p):
                    ru_alts.append(p)
                else:
                    en_parts.append(p)
        elif kind == 'en_en_unknown':
            artists = [val[0]] + artists
            en_parts.append(val[1])
            flags.append('en-en группа без известного исполнителя')
        elif kind == 'ru_alt':
            ru_alts.append(val)
        elif kind == 'en_title':
            en_parts.append(val)

    base = s.strip().rstrip('- ').strip()
    base_main = base
    if ' - ' in base:
        head, rest = base.split(' - ', 1)
        if is_known(head) or (not has_cyr(head) and looks_like_name(head)):
            artists = [NORMALIZE_ARTIST.get(head, head)] + artists
            if not is_known(head):
                flags.append('автор в начале (не из списка)')
            base_main = rest.strip()

    title_ru = ''
    title_en = ''
    if base_main and has_cyr(base_main):
        title_ru = base_main
        title_en = join_en(en_parts[0] if en_parts else '', en_parts[1:])
    else:
        if base_main:
            title_en = join_en(base_main, en_parts)
        elif en_parts:
            title_en = join_en(en_parts[0], en_parts[1:])

    if '/' in title_ru:
        flags.append('два названия через /')

    return {
        'title_ru': title_ru,
        'title_en': title_en,
        'artists': artists,
        'key': key,
        'alt_titles': ru_alts,
    }, flags


def main():
    existing = {}
    if OUT.exists():
        try:
            ns = {}
            exec(OUT.read_text(encoding='utf-8'), ns)
            existing = ns.get('SONG_META', {})
        except Exception as e:
            print(f'не удалось прочитать старый song_meta.py: {e}')

    meta = dict(existing)
    changed = []
    review = []
    for p in sorted(SONGS.glob('*.md')):
        if p.name in existing:
            continue
        text = p.read_text(encoding='utf-8', errors='replace')
        m = re.search(r'^#\s+(.+)$', text, re.M)
        title = m.group(1).strip() if m else p.stem
        parsed, flags = parse_title(title)
        if p.name in MANUAL:
            parsed.update(MANUAL[p.name])
            parsed.setdefault('alt_titles', [])
            flags = ['ручная правка'] + flags
        meta[p.name] = parsed
        changed.append((p.name, title, parsed, flags))

    # запись в song_meta.py
    lines = [
        '# -*- coding: utf-8 -*-',
        '"""Метаданные песен (название RU/EN, исполнители, тональность).',
        '',
        'Генерируется tools/extract_meta.py, затем правится вручную.',
        'Ключ — имя файла в songs/.',
        '"""',
        '',
        'SONG_META = {',
    ]
    for fn in sorted(meta):
        v = meta[fn]
        lines.append(f"    {fn!r}: {{")
        for k in ('title_ru', 'title_en', 'key'):
            lines.append(f"        {k!r}: {v.get(k, '')!r},")
        lines.append(f"        'artists': {v.get('artists', [])!r},")
        lines.append(f"        'alt_titles': {v.get('alt_titles', [])!r},")
        lines.append('    },')
    lines.append('}')
    OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')

    print(f'Всего песен: {len(meta)}, новых: {len(changed)}')
    if changed:
        print()
        print('=== НОВЫЕ/ИЗМЕНЁННЫЕ ===')
        for fn, title, parsed, flags in changed:
            print(f'{fn}')
            print(f'  было:  {title!r}')
            print(f"  стало: RU={parsed['title_ru']!r} EN={parsed['title_en']!r} "
                  f"арт={parsed['artists']} ключ={parsed['key']} "
                  f"alt={parsed['alt_titles']}")
            if flags:
                print(f"  прим.:  {'; '.join(flags)}")

    amb = [(fn, t, p, f) for fn, t, p, f in changed if f]
    if amb:
        print()
        print('=== НА ПРОВЕРКУ (сомнительные случаи) ===')
        for fn, title, parsed, flags in amb:
            print(f'{fn}')
            print(f'  {title!r}  ->  RU={parsed["title_ru"]!r} '
                  f'EN={parsed["title_en"]!r} арт={parsed["artists"]}')
            for f in flags:
                print(f'    - {f}')


if __name__ == '__main__':
    main()
