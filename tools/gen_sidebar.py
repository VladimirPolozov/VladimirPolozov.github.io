#!/usr/bin/env python3
"""Устаревший скрипт: используйте tools/build.py (учитывает метаданные
из tools/song_meta.py и генерирует ещё страницы исполнителей)."""
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / 'songs'


def display_name(p: Path) -> str:
    text = p.read_text(encoding='utf-8', errors='replace')
    m = re.search(r'^#\s+(.+)$', text, re.M)
    return m.group(1).strip() if m else p.stem


def main():
    items = sorted(SONGS.glob('*.md'),
                   key=lambda p: display_name(p).casefold())
    lines = ['- [Главная](/)']
    if items:
        lines.append('**Песни**')
        lines += [f'  - [{display_name(p)}](songs/{p.name})' for p in items]
    (ROOT / '_sidebar.md').write_text('\n'.join(lines) + '\n',
                                      encoding='utf-8')
    print(f'Сайдбар обновлён: {len(items)} песня(ен)')


if __name__ == '__main__':
    main()
