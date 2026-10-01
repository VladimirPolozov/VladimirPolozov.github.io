// Поиск по песням: поле над карточкой + выпадающий список совпадений.
// Индекс — search-index.json (генерируется tools/build_search_index.js),
// подгружается лениво при первом фокусе поля.

(function () {
  'use strict';

  // Абсолютный путь: при routerMode:'history' страница может быть
  // /songs/42, и относительный 'search-index.json' ушёл бы в /songs/.
  var INDEX_URL = '/search-index.json';
  var MAX_RESULTS = 20;
  var DEBOUNCE_MS = 120;

  var songs = null;
  var indexPromise = null;
  var items = [];
  var total = 0;
  var active = -1;
  var timer = null;
  var bar = null;
  var ui = {};

  /* ---------------- утилиты ---------------- */

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(q) {
    return norm(q).split(' ').filter(Boolean);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function highlight(text, tokens) {
    var re;
    try {
      re = new RegExp(
        '(' +
          tokens
            .map(function (t) {
              return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]');
            })
            .join('|') +
          ')',
        'gi'
      );
    } catch (e) {
      return escapeHtml(text);
    }
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(text))) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      out += escapeHtml(text.slice(last, m.index)) + '<em>' + escapeHtml(m[0]) + '</em>';
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  }

  /* ---------------- стили ---------------- */

  function injectStyle() {
    if (document.getElementById('ss-style')) return;
    var st = document.createElement('style');
    st.id = 'ss-style';
    st.textContent = [
      '.site-search{position:relative;width:100%;max-width:var(--col,960px);margin:0 0 16px}',
      '.ss-field{display:flex;align-items:center;gap:8px;height:42px;padding:0 10px 0 14px;border-radius:21px;background:var(--bg,#F7F9FA);box-shadow:5px 5px 10px rgba(30,45,55,.18),-5px -5px 10px rgba(255,255,255,.95);transition:box-shadow .15s ease}',
      '.ss-field:focus-within{box-shadow:6px 6px 12px rgba(30,45,55,.20),-6px -6px 12px rgba(255,255,255,.95),0 0 0 3px rgba(86,196,253,.25)}',
      '.ss-ico{flex:0 0 auto;display:flex;color:var(--accent-active,#159FE8)}',
      '.ss-ico svg{width:17px;height:17px;display:block}',
      '.ss-input{flex:1 1 auto;min-width:0;padding:0;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:var(--text,#2C3E50);-webkit-appearance:none;appearance:none}',
      '.ss-input::placeholder{color:var(--text-3,#8FA3B0)}',
      '.ss-input::-webkit-search-cancel-button,.ss-input::-webkit-search-decoration{-webkit-appearance:none;display:none}',
      '.ss-clear{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--text-3,#8FA3B0);cursor:pointer}',
      '.ss-clear:hover{color:var(--accent-dark,#0B8DCE);background:var(--bg-accent,#E8F6FE)}',
      '.ss-clear[hidden]{display:none}',
      '.ss-clear svg{width:11px;height:11px;display:block}',
      '.ss-panel{position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:30;display:flex;flex-direction:column;background:var(--surface,#fff);border:1px solid var(--border,#E4EAEE);border-radius:12px;box-shadow:6px 6px 16px rgba(30,45,55,.18),-6px -6px 16px rgba(255,255,255,.95);overflow:hidden}',
      '.ss-panel[hidden]{display:none}',
      '.ss-list{list-style:none;margin:0;padding:4px;max-height:420px;max-height:min(58vh,420px);overflow-y:auto;overscroll-behavior:contain}',
      '.ss-item>a{display:block;padding:7px 10px;border-radius:9px;text-decoration:none}',
      '.ss-item[aria-selected="true"]>a{background:var(--bg-accent,#E8F6FE)}',
      '.ss-title{display:block;font-size:14px;font-weight:600;line-height:1.25;color:var(--text,#2C3E50);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ss-item[aria-selected="true"] .ss-title{color:var(--accent-dark,#0B8DCE)}',
      '.ss-snip{display:block;margin-top:1px;font-size:11.5px;line-height:1.3;color:var(--text-2,#6B7F8C);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ss-panel em{font-style:normal;background:var(--bg-accent,#E8F6FE);color:var(--accent-dark,#0B8DCE);border-radius:2px}',
      '.ss-foot{flex:0 0 auto;padding:7px 12px;border-top:1px solid var(--border-thin,#EEF2F5);font-size:11px;color:var(--text-3,#8FA3B0)}',
      '.ss-msg{padding:14px 12px;font-size:13px;color:var(--text-3,#8FA3B0)}',
      '@media print{.site-search{display:none}}',
      '@media (max-width:768px){.site-search{max-width:100%;margin:0;padding:12px 20px 8px}.ss-field{height:40px}.ss-panel{left:20px;right:20px}}',
    ].join('');
    document.head.appendChild(st);
  }

  /* ---------------- индекс ---------------- */

  function prepare() {
    for (var i = 0; i < songs.length; i++) {
      var s = songs[i];
      s._t = norm(s.t);
      s._b = s.b ? s.b.split('\n') : [];
      s._l = [];
      for (var j = 0; j < s._b.length; j++) s._l.push(norm(s._b[j]));
    }
  }

  function ensureIndex() {
    if (songs) return Promise.resolve(songs);
    if (!indexPromise) {
      indexPromise = fetch(INDEX_URL)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          songs = (data && data.s) || [];
          prepare();
          return songs;
        })
        .catch(function (err) {
          indexPromise = null;
          throw err;
        });
    }
    return indexPromise;
  }

  function search(tokens) {
    var found = [];
    if (!tokens.length) return { total: 0, items: [] };
    for (var i = 0; i < songs.length; i++) {
      var s = songs[i];
      var inTitle = true;
      var firstLine = -1;
      var score = 0;
      var ok = true;

      for (var k = 0; k < tokens.length; k++) {
        var tok = tokens[k];
        var hit = -1;
        for (var li = 0; li < s._l.length; li++) {
          if (s._l[li].indexOf(tok) >= 0) {
            hit = li;
            break;
          }
        }
        var inT = s._t.indexOf(tok) >= 0;
        if (!inT) inTitle = false;
        if (!inT && hit < 0) {
          ok = false;
          break;
        }
        if (inT) score += 3;
        else {
          score += 1;
          if (firstLine < 0 || hit < firstLine) firstLine = hit;
        }
      }
      if (!ok) continue;
      found.push({ s: s, titleHit: inTitle, line: firstLine, score: score });
    }

    found.sort(function (a, b) {
      if (a.titleHit !== b.titleHit) return a.titleHit ? -1 : 1;
      if (a.line !== b.line) return a.line - b.line;
      if (a.score !== b.score) return b.score - a.score;
      return a.s.t.localeCompare(b.s.t, 'ru');
    });

    return { total: found.length, items: found.slice(0, MAX_RESULTS) };
  }

  /* ---------------- отрисовка ---------------- */

  function openPanel() {
    ui.panel.hidden = false;
    ui.input.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    if (ui.panel) ui.panel.hidden = true;
    active = -1;
    if (ui.input) ui.input.setAttribute('aria-expanded', 'false');
  }

  function showMsg(text) {
    ui.list.innerHTML = '';
    var li = el('li', 'ss-msg');
    li.textContent = text;
    ui.list.appendChild(li);
    ui.foot.textContent = '';
    openPanel();
  }

  function setActive(i) {
    var nodes = ui.list.querySelectorAll('.ss-item');
    if (!nodes.length) return;
    if (i < 0) i = 0;
    if (i >= nodes.length) i = nodes.length - 1;
    for (var k = 0; k < nodes.length; k++) {
      nodes[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
    }
    active = i;
    nodes[i].scrollIntoView({ block: 'nearest' });
    ui.input.setAttribute('aria-activedescendant', nodes[i].id);
  }

  function move(delta) {
    if (!ui.list.querySelectorAll('.ss-item').length) return;
    var next = active < 0 ? (delta > 0 ? 0 : items.length - 1) : active + delta;
    setActive(next);
  }

  function render(tokens) {
    ui.list.innerHTML = '';
    active = -1;

    if (!items.length) {
      showMsg('Ничего не найдено');
      return;
    }

    items.forEach(function (it, i) {
      var li = el('li', 'ss-item');
      li.id = 'ss-opt-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      var a = el('a');
      // routerMode:'history' — обычные адреса, без решётки.
      a.href = it.s.u;

      var t = el('span', 'ss-title');
      t.innerHTML = highlight(it.s.t, tokens);
      a.appendChild(t);

      if (it.line >= 0) {
        var snip = el('span', 'ss-snip');
        snip.innerHTML = highlight(it.s._b[it.line], tokens);
        a.appendChild(snip);
      }

      li.appendChild(a);
      li.addEventListener('mouseenter', function () {
        setActive(i);
      });
      a.addEventListener('click', pick);
      ui.list.appendChild(li);
    });

    ui.foot.textContent =
      'Найдено: ' +
      total +
      (total > MAX_RESULTS ? ' (показаны первые ' + MAX_RESULTS + ')' : '');
    openPanel();
  }

  function run() {
    var tokens = tokenize(ui.input.value);
    if (!tokens.length) {
      closePanel();
      return;
    }
    if (!songs) {
      showMsg('Загрузка…');
      ensureIndex().then(
        function () {
          run();
        },
        function () {
          showMsg('Не удалось загрузить индекс');
        }
      );
      return;
    }
    var res = search(tokens);
    total = res.total;
    items = res.items;
    render(tokens);
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  /* ---------------- события ---------------- */

  function pick(e) {
    if (e) {
      // Ctrl/Cmd/Shift-клик оставляем браузеру (открыть в новой вкладке)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
    var target = items[active >= 0 ? active : 0];
    ui.input.value = '';
    ui.clear.hidden = true;
    closePanel();
    if (!target) return;
    // Навигация в стиле роутера docsify (routerMode:'history'):
    // pushState + popstate, чтобы страница перерисовалась без перезагрузки.
    var url = target.s.u;
    window.history.pushState({ key: url }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { key: url } }));
  }

  function clearField() {
    ui.input.value = '';
    ui.clear.hidden = true;
    closePanel();
    ui.input.focus();
  }

  function onKey(e) {
    var open = !ui.panel.hidden;

    if (e.key === 'ArrowDown') {
      if (!items.length) return;
      e.preventDefault();
      if (!open) run();
      move(1);
    } else if (e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      if (open && items.length) {
        e.preventDefault();
        pick();
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        closePanel();
      } else if (ui.input.value) {
        e.preventDefault();
        clearField();
      }
    } else if (e.key === 'Tab') {
      closePanel();
    }
  }

  function wire() {
    if (!bar || bar.ssWired) return;
    bar.ssWired = true;

    ui.input.addEventListener('focus', function () {
      ensureIndex().catch(function () {});
      if (ui.input.value.trim()) schedule();
    });
    ui.input.addEventListener('input', function () {
      ui.clear.hidden = !ui.input.value;
      schedule();
    });
    ui.clear.addEventListener('click', clearField);
    bar.addEventListener('keydown', onKey);

    // docsify открывает сайдбар на клике по body при ширине <= 600px:
    // гасим клики внутри поиска, иначе печать в поле дёргала бы панель.
    bar.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    bar.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    document.addEventListener('mousedown', function (e) {
      if (!bar || !bar.contains(e.target)) closePanel();
    });
  }

  /* ---------------- разметка ---------------- */

  function cache() {
    ui.input = bar.querySelector('.ss-input');
    ui.clear = bar.querySelector('.ss-clear');
    ui.panel = bar.querySelector('.ss-panel');
    ui.list = bar.querySelector('.ss-list');
    ui.foot = bar.querySelector('.ss-foot');
  }

  function build(content, section) {
    bar = el('div', 'site-search');
    bar.setAttribute('role', 'search');

    var field = el('div', 'ss-field');

    var ico = el('span', 'ss-ico');
    ico.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="16" y1="16" x2="21" y2="21"></line></svg>';

    var input = el('input', 'ss-input');
    input.type = 'search';
    input.placeholder = 'Поиск: название или строка из песни';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Поиск по песням');
    input.setAttribute('aria-controls', 'ss-panel');
    input.setAttribute('aria-expanded', 'false');

    var clear = el('button', 'ss-clear');
    clear.type = 'button';
    clear.title = 'Очистить';
    clear.setAttribute('aria-label', 'Очистить поиск');
    clear.hidden = true;
    clear.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg>';

    field.appendChild(ico);
    field.appendChild(input);
    field.appendChild(clear);

    var panel = el('div', 'ss-panel');
    panel.hidden = true;

    var list = el('ul', 'ss-list');
    list.setAttribute('role', 'listbox');

    var foot = el('div', 'ss-foot');

    panel.appendChild(list);
    panel.appendChild(foot);
    bar.appendChild(field);
    bar.appendChild(panel);

    content.insertBefore(bar, section || null);
    cache();
    wire();
  }

  function mount() {
    var content = document.querySelector('.content');
    if (!content) return;
    var found = content.querySelector('.site-search');
    if (found) {
      if (found !== bar) {
        bar = found;
        cache();
        wire();
      }
      return;
    }
    build(content, content.querySelector('.markdown-section'));
  }

  /* ---------------- регистрация ---------------- */

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = [].concat(window.$docsify.plugins || [], function (hook) {
    hook.doneEach(function () {
      injectStyle();
      mount();
    });
  });
})();