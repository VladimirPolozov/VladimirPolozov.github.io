#!/usr/bin/env python3
"""Генератор страниц категорий.

Читает поле «Категория» из блоков сведений песен в songs/*.md
(формат: `> **Категория:** [Поклонение](/categories/poklonenie), ...`)
и пересобирает categories/*.md + categories/index.md.

Запуск: python tools/build_categories.py
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / 'songs'
CATS = ROOT / 'categories'

# Базовые категории: slug -> отображаемое имя.
CATEGORIES = {
    'poklonenie': 'Поклонение',
    'proslavlenie': 'Прославление',
    'srednij-temp': 'Средний темп',
    'detskie': 'Детские',
    'evrejskie': 'Еврейские',
    'drugoe': 'Другое',
}

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
    return re.sub(r'-{2,}', '-', ''.join(out)).strip('-') or 'category'


def display_name(path: Path) -> str:
    text = path.read_text(encoding='utf-8', errors='replace')
    m = re.search(r'^#\s+(.+)$', text, re.M)
    return m.group(1).strip() if m else path.stem


def categories_of(path: Path):
    text = path.read_text(encoding='utf-8', errors='replace')
    m = re.search(r'^\s*>\s*\*\*Категория:\*\*\s*(.+)$', text, re.M)
    if not m:
        return []
    names = re.findall(r'\[([^\]]+)\]\(/categories/[^)]+\)', m.group(1))
    return names or [s.strip() for s in m.group(1).split(',')]


def main():
    by_cat = defaultdict(list)
    for p in sorted(SONGS.glob('*.md')):
        for name in categories_of(p):
            by_cat[name].append((display_name(p), p.name))

    CATS.mkdir(exist_ok=True)

    # Страницы категорий.
    for name, items in sorted(by_cat.items(), key=lambda kv: kv[0].casefold()):
        items.sort(key=lambda x: x[0].casefold())
        lines = [f'# {name}', '']
        lines.append(f'В категории {len(items)} песня(ен).')
        lines.append('')
        lines += [f'- [{title}](/songs/{fn})' for title, fn in items]
        lines.append('')
        (CATS / f'{slug(name)}.md').write_text(
            '\n'.join(lines), encoding='utf-8', newline='\n')

    # Индекс категорий: базовые всегда на месте, даже если пусты.
    names = []
    for slug_name, disp in CATEGORIES.items():
        if disp in by_cat:
            n = len(by_cat[disp])
        else:
            n = 0
        names.append((slug_name, disp, n))
    for name in sorted(by_cat):
        if name not in CATEGORIES.values():
            names.append((slug(name), name, len(by_cat[name])))
    names.sort(key=lambda x: x[1].casefold())

    total = sum(1 for p in SONGS.glob('*.md'))
    lines = ['# Категории', '']
    lines.append(f'В архиве {total} песен, распределённых по категориям.')
    lines.append('')
    for slug_name, disp, n in names:
        lines.append(f'- [{disp}](/categories/{slug_name}) — {n} песня(ен)')
    lines.append('')
    (CATS / 'index.md').write_text(
        '\n'.join(lines), encoding='utf-8', newline='\n')

    print(f'Категорий: {len(by_cat)}, страниц: {len(by_cat)}, '
          f'индекс: categories/index.md')


if __name__ == '__main__':
    main()
