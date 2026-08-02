#!/usr/bin/env python3
"""Перенос архива из Telegram в songs/*.md.

Экспорт истории канала: Telegram Desktop -> Настройки -> Дополнительно ->
Экспорт истории сообщений -> формат JSON (можно вместе с HTML/медиа).
Затем: python tools/export_to_md.py <путь/к/result.json>

Ответные сообщения (комментарии с ссылками на туториалы) прикрепляются
к файлу песни блоком цитаты.
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

RUS = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', ' ': '-',
}


def slugify(title: str) -> str:
    title = re.sub(r'\s+-\s+[A-Ha-h][#b]?m?$', '', title)
    out = []
    for ch in title.lower():
        out.append(RUS.get(ch, ch))
    s = ''.join(out)
    s = re.sub(r'[^a-z0-9-]', '', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return (s or 'pesnya')[:60]


def message_text(m) -> str:
    t = m.get('text')
    if isinstance(t, str):
        return t
    if isinstance(t, list):
        return ''.join(e.get('text', '') if isinstance(e, dict) else str(e)
                       for e in t)
    return ''


def first_line(text: str) -> str:
    return next((line.strip() for line in text.splitlines() if line.strip()),
                '')


def main():
    ap = argparse.ArgumentParser(
        description='Конвертация result.json из Telegram в songs/*.md')
    ap.add_argument('json', help='путь к result.json')
    ap.add_argument('--out', default='songs',
                    help='папка для md-файлов (по умолчанию songs)')
    ap.add_argument('--copy-media', action='store_true',
                    help='копировать mp3 из экспорта в audio/')
    args = ap.parse_args()

    data = json.loads(Path(args.json).read_text(encoding='utf-8-sig'))
    messages = [m for m in data.get('messages', [])
                if m.get('type') == 'message']

    replies: dict[int, list[tuple[str, str]]] = {}
    audio_files = set()
    for m in messages:
        rid = m.get('reply_to_message_id')
        if not rid:
            continue
        file = m.get('file', '')
        if file and file.lower().endswith('.mp3'):
            audio_files.add(file)
        txt = message_text(m)
        if txt or file:
            replies.setdefault(rid, []).append((txt, file))

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    seen: dict[str, int] = {}

    for m in messages:
        if m.get('reply_to_message_id'):
            continue
        text = message_text(m)
        if not text.strip():
            continue

        lines = text.splitlines()
        title = first_line(text)
        body = '\n'.join(lines[lines.index(next(
            l for l in lines if l.strip())) + 1:])

        base = slugify(title)
        n = seen.get(base, 0)
        seen[base] = n + 1
        name = base if n == 0 else f'{base}-{n + 1}'
        path = out / f'{name}.md'

        parts = [f'# {title}']
        if body:
            parts.append(body)

        media = []
        if m.get('file') and m['file'].lower().endswith('.mp3'):
            media.append(m['file'])
            audio_files.add(m['file'])

        for txt, file in replies.get(m['id'], []):
            if txt:
                parts.append('\n> ' + txt.replace('\n', '\n> '))
            if file:
                parts.append(f'> Аудио: `{file}`')

        if media:
            parts.append('\n## Аудио')
            parts.extend(f'- `{f}`' for f in media)

        head = f'<!-- tg: msg {m["id"]} | {m.get("date", "")} -->\n'
        path.write_text(head + '\n\n'.join(parts).strip() + '\n',
                        encoding='utf-8')
        print(f'{path.name:45} <- {title}')

    if args.copy_media:
        src = Path(args.json).parent
        audio_dir = Path('audio')
        audio_dir.mkdir(exist_ok=True)
        for f in sorted(audio_files):
            s = src / f
            if s.exists():
                shutil.copy2(s, audio_dir / Path(f).name)
                print('mp3 ->', audio_dir / Path(f).name)
            else:
                print('НЕ НАЙДЕН:', s)


if __name__ == '__main__':
    main()
