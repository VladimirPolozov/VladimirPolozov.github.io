#!/usr/bin/env python3
"""Миграция аккордного архива из двух экспортов Telegram в songs/*.md.

Источники:
  - channel_export/result.json   — канал с аккордами (основной источник песен)
  - channel_export/result_2.json — группа "Оригиналы, Туториалы, Тексты"
    (пересылки аккордов + комментарии: тексты песен, ссылки, примечания)

Песни берутся из основного канала. По совпадению названия к ним
прикрепляются слова (реплаи-тексты), ссылки (YouTube и др.) и примечания
из группы. Несопоставившиеся пересылки и служебные сообщения попадают
в отчёт в консоль.
"""
import difflib
import json
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

MAIN = Path('channel_export/result.json')
GROUP = Path('channel_export/result_2.json')
OUT = Path('songs')

NON_SONG_TITLES = {
    'Всем привет! 👋🏻',
    'Сайт для транспонирования аккордов. В 99% случаев транспонирует правильно',
}

# Пересылки, не совпадающие по названию, но это те же песни.
# ключ — название пересылки из группы, значение — заголовок песни в канале.
OVERRIDES = {
    'Великий Бог (Тогда поёт мой дух, Господь, Тебе) - G':
        'Как Ты велик (Hymn - How Great Thou Art) - G',
    'Мы нужны друг другу, Бог нас спас не зря - Е':
        'Мы одна семья - Е',
    'Hashem Melech (Derech - Hashem Melech) - Am':
        'Ашэм мэлэх (Derech) - A',
    'Noel - 3/4 - G':
        'Tommee Profitt - Noel (He is born) - 3/4 - A',
}

RUS = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', ' ': '-',
}


def slugify(title: str) -> str:
    s = re.sub(r'\s+-\s+[A-Ha-h][#b]?m?(\s+\d+/\d+)?$', '', title)
    out = []
    for ch in s.lower():
        out.append(RUS.get(ch, ch))
    s = ''.join(out)
    s = re.sub(r'[^a-z0-9-]', '', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return (s or 'pesnya')[:60]


def text_of(m) -> str:
    t = m.get('text')
    if isinstance(t, str):
        return t
    if isinstance(t, list):
        return ''.join(e.get('text', '') if isinstance(e, dict) else str(e)
                       for e in t)
    return ''


def first_line(text: str) -> str:
    return next((line.strip() for line in text.splitlines()
                 if line.strip()), '')


def strip_key(title: str) -> str:
    s = title.strip()
    parts = re.split(r'\s+-\s+', s)
    if len(parts) >= 2 and re.fullmatch(
            r'[a-h][#b]?(m|min|maj|sus|dim|aug)?[0-9/()\s]*', parts[-1]):
        s = ' - '.join(parts[:-1])
    s = re.sub(r'\(\s*[a-h][#b]?(m|min|maj)?\s*\)\s*$', '', s, flags=re.I)
    s = re.sub(r'\(\s*[0-9]+/[0-9]+\s*\)\s*$', '', s)
    return s.strip()


def norm(title: str) -> str:
    s = strip_key(title)
    for ch in '«»“”"’\'':
        s = s.replace(ch, '')
    s = s.replace('–', '-').replace('—', '-')
    s = re.sub(r'[^\w\s]', '', s, flags=re.UNICODE)
    s = re.sub(r'\s+', ' ', s).strip()
    return s.lower()


URL_RE = re.compile(r'https?://[^\s<>]+')


def extract_urls(text: str) -> list:
    return URL_RE.findall(text)


def norm_tokens(title: str) -> str:
    return ' '.join(sorted(norm(title).split()))


def main():
    main_data = json.loads(Path(MAIN).read_text(encoding='utf-8-sig'))
    group_data = json.loads(Path(GROUP).read_text(encoding='utf-8-sig'))

    songs, skipped = [], []
    for m in main_data['messages']:
        if m.get('type') != 'message':
            continue
        text = text_of(m).strip()
        if not text:
            continue
        title = first_line(text)
        if title in NON_SONG_TITLES:
            skipped.append((m['id'], title))
            continue
        lines = text.splitlines()
        idx = next(i for i, l in enumerate(lines) if l.strip())
        songs.append({
            'id': m['id'],
            'date': m.get('date', ''),
            'title': title,
            'body': '\n'.join(lines[idx + 1:]).strip(),
        })

    gmsgs = [m for m in group_data['messages'] if m.get('type') == 'message']
    fwd = [m for m in gmsgs if m.get('forwarded_from')]
    replies = {}
    for m in gmsgs:
        if m.get('reply_to_message_id'):
            replies.setdefault(m['reply_to_message_id'], []).append(m)

    fwdinfo = []
    for f in fwd:
        text = text_of(f).strip()
        if not text:
            continue
        lyrics, links, notes = [], [], []
        for r in replies.get(f['id'], []):
            t = text_of(r).strip()
            urls = extract_urls(t)
            if urls:
                links.extend(urls)
                rest = re.sub(r'https?://\S+', '', t).strip()
                if len(rest) > 120:
                    notes.append(rest)
            elif len(t) >= 100:
                lyrics.append(t)
            elif t:
                notes.append(t)
        fwdinfo.append({
            'id': f['id'],
            'title': first_line(text),
            'lyrics': lyrics,
            'links': links,
            'notes': notes,
        })

    fwdinfo = [f for f in fwdinfo if f['title'] not in NON_SONG_TITLES]

    norms = [norm_tokens(s['title']) for s in songs]
    name_norms = [norm_tokens(s['title'].split('(', 1)[0]) for s in songs]
    override_idx = {norm_tokens(t): next(
        i for i, s in enumerate(songs) if s['title'] == OVERRIDES[t])
        for t in OVERRIDES}

    def find_best(n: str, nn: str):
        best, bi = 0.0, -1
        for i, (sn, snn) in enumerate(zip(norms, name_norms)):
            r = max(difflib.SequenceMatcher(None, n, sn).ratio(),
                    difflib.SequenceMatcher(None, nn, snn).ratio())
            if r > best:
                best, bi = r, i
        return best, bi

    matched = {i: {'lyrics': [], 'links': [], 'notes': []} for i in range(len(songs))}
    unmatched, review = [], []
    for f in fwdinfo:
        if norm_tokens(f['title']) in override_idx:
            e = matched[override_idx[norm_tokens(f['title'])]]
            e['lyrics'] += f['lyrics']
            e['links'] += f['links']
            e['notes'] += f['notes']
            continue
        ratio, bi = find_best(norm_tokens(f['title']),
                              norm_tokens(f['title'].split('(', 1)[0]))
        if bi < 0:
            unmatched.append(f)
        elif ratio >= 0.75:
            e = matched[bi]
            e['lyrics'] += f['lyrics']
            e['links'] += f['links']
            e['notes'] += f['notes']
        elif ratio >= 0.6:
            review.append((f['title'], songs[bi]['title'], round(ratio, 2)))
        else:
            unmatched.append(f)

    def dedupe(items):
        seen = set()
        out = []
        for x in items:
            k = x.strip().lower()
            if k not in seen:
                seen.add(k)
                out.append(x)
        return out

    used = {}
    for i, s in enumerate(songs):
        e = matched[i]
        parts = [f'<!-- tg: msg {s["id"]} | {s["date"]} -->', f'# {s["title"]}']
        if s['body']:
            parts.append(s['body'])
        if e['lyrics']:
            parts.append('## Слова')
            parts.append('\n\n'.join(dedupe(e['lyrics'])))
        if e['links']:
            parts.append('## Слушать')
            parts.extend(f'- {u}' for u in dedupe(e['links']))
        if e['notes']:
            parts.append('## Примечания')
            parts.append('\n\n'.join(dedupe(e['notes'])))
        path = OUT / f"{slugify(s['title'])}.md"
        path.write_text('\n\n'.join(parts).strip() + '\n', encoding='utf-8')
        print(f'записан: {path.name}')

    print()
    print(f'--- ИТОГО: песен {len(songs)}, служебных пропущено {len(skipped)}')
    print(f'пересылок в группе {len(fwdinfo)}, из них совпало '
          f'{len(songs) - len(review) - len(unmatched)}')

    if review:
        print()
        print('--- ТРЕБУЮТ ПРОВЕРКИ (совпадение по названию ~60-75%) ---')
        for f, m, r in sorted(review, key=lambda x: x[2]):
            print(f'  {r:>5} | ГРУППА: {f!r}')
            print(f'        | КАНАЛ: {m!r}')

    if unmatched:
        print()
        print('--- НЕ СОПОСТАВЛЕНО (пересылка без совпадения в канале) ---')
        for f in unmatched:
            print(f'  {f["title"]!r} (id {f["id"]})')


if __name__ == '__main__':
    main()
