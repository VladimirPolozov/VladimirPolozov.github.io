(function () {
  'use strict';

  // Страница сета: /set?song_id=225&key=E&song_id=12&song_id=100&key=F
  //
  // song_id и key читаются парами по порядку (N-й song_id — N-му key);
  // если key для песни не задан, она остаётся в своей тональности.
  // Общий сдвиг кнопками «−/0/+» живёт только в отображении: адрес не меняется.
  // Сейчас панель транспониции сета не выводится (buildBar не вызывается) —
  // весь её код, включая копирование ссылки, сохранён на будущее.
  //
  // Песни склеиваются в один markdown и отдаются штатному компилятору docsify —
  // аккорды рендерятся тем же движком с теми же breaks:true, что и на странице
  // песни, а ссылки в блоке сведений docsify переписывает сам. Транспонирует
  // каждый блок существующий TransposeCore.applyTo.

  var state = { shift: 0, items: [] };
  // Режим «только аккорды»: всё, что ниже заголовка «## Слова», скрыто.
  var hideLyrics = false;
  var copyTimer = null;

  function getSection() {
    return document.querySelector('.markdown-section');
  }

  function isSetPage(vm) {
    var path = vm && vm.route && vm.route.path;
    return path === '/set';
  }

  function queryString() {
    var s = window.location.search || '';
    return s.charAt(0) === '?' ? s.slice(1) : s;
  }

  // Песни сета в порядке ссылки: [{ id: '225', key: 'E' }, …].
  // Параметры читаются в порядке следования: song_id начинает новую песню,
  // а key — если он идёт сразу после song_id — задаёт тональность этой
  // песни. Ключ без пары или песня без ключа оставляют тональность как есть:
  //   song_id=225&key=E&song_id=12&song_id=100&key=F
  //   → 225 в E, 12 в своей тональности, 100 в F.
  function parseSet() {
    var qs = queryString();
    if (!qs) return null;
    var items = [];
    var params = new URLSearchParams(qs);
    params.forEach(function (value, name) {
      if (name === 'song_id') {
        var id = String(value).trim();
        if (id) items.push({ id: id, key: null });
      } else if (name === 'key' && items.length) {
        var k = String(value).trim();
        if (k) items[items.length - 1].key = k;
      }
    });
    return items.length ? items : null;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clamp(n) {
    return Math.max(-11, Math.min(11, n));
  }

  // key из YAML-frontmatter песни: «Тональность» берём из неё, DOM — запасной путь.
  function parseFrontmatter(text) {
    var s = String(text).replace(/^\uFEFF/, '');
    var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
    if (!m) return { key: null, rest: s };
    var key = null;
    var lines = m[1].split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var kv = /^key\s*:\s*(.+)$/.exec(lines[i]);
      if (kv) key = kv[1].trim();
    }
    return { key: key, rest: s.slice(m[0].length) };
  }

  function rootOf(key) {
    var m = String(key || '').match(/^([A-Ha-hАВСЕН])([#b]?)/);
    if (!m) return null;
    return m[1].toUpperCase() + (m[2] || '');
  }

  // Сдвиг, при котором базовая тональность песни становится целевой.
  function offsetBetween(base, target) {
    var b = rootOf(base);
    var t = rootOf(target);
    if (!b || !t) return null;
    var pb = window.TransposeCore.pitchOf(b);
    var pt = window.TransposeCore.pitchOf(t);
    if (pb === null || pt === null) return null;
    var o = ((pt - pb) % 12 + 12) % 12;
    if (o > 6) o -= 12;
    return o;
  }

  // Тело песни без служебного frontmatter и служебного комментария tg,
  // с номером в заголовке: «# Название» → «# 3. Название».
  function prepareBody(raw, number) {
    var fm = parseFrontmatter(raw);
    var body = fm.rest
      .replace(/<!--\s*tg:[\s\S]*?-->/g, '')
      .replace(/^\n+/, '')
      .replace(/\s+$/, '');
    var titled = false;
    body = body.replace(/^(#{1,6})[ \t]+(.+)$/m, function (all, hashes, title) {
      if (titled) return all;
      titled = true;
      return hashes + ' ' + number + '. ' + title.trim();
    });
    if (!titled) body = '# ' + number + '. ' + fm.key + '\n\n' + body;
    return { key: fm.key, body: body };
  }

  function fetchSong(id) {
    return fetch('/songs/' + id + '.md').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function buildMarkdown(items) {
    var jobs = items.map(function (item, i) {
      if (!/^\d+$/.test(item.id)) {
        return Promise.resolve({ item: item, error: 'не числовой номер' });
      }
      return fetchSong(item.id)
        .then(function (text) {
          return { item: item, song: prepareBody(text, i + 1) };
        })
        .catch(function () {
          return { item: item, error: 'не найдена' };
        });
    });

    return Promise.all(jobs).then(function (done) {
      var out = [];
      state.items = [];
      done.forEach(function (d) {
        if (d.error) {
          out.push(
            '<div class="set-song set-song-error">Песня ' +
              esc(d.item.id) +
              ' — ' +
              d.error +
              '</div>'
          );
          return;
        }
        out.push('<div class="set-song" data-set-id="' + esc(d.item.id) + '"></div>');
        out.push(d.song.body);
        state.items.push({
          id: d.item.id,
          key: d.song.key,
          target: d.item.key,
          node: null,
          baseOffset: 0,
          badKey: false
        });
      });
      return out.join('\n\n---\n\n');
    });
  }

  function injectStyle() {
    if (document.getElementById('set-style')) return;
    var st = document.createElement('style');
    st.id = 'set-style';
    st.textContent =
      '#set-bar{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:24px;' +
      'background:#F7F9FA;box-shadow:8px 8px 16px rgba(30,45,55,.20),-8px -8px 16px rgba(255,255,255,.95);' +
      'font-family:inherit;user-select:none}' +
      '#set-bar button{border:none;cursor:pointer;min-width:38px;height:38px;border-radius:50%;font-size:21px;' +
      'font-weight:600;line-height:1;color:#159FE8;background:#F7F9FA;font-family:inherit;' +
      'box-shadow:5px 5px 10px rgba(30,45,55,.18),-5px -5px 10px rgba(255,255,255,.95);transition:box-shadow .15s,color .15s}' +
      '#set-bar button:hover{box-shadow:6px 6px 12px rgba(30,45,55,.22),-6px -6px 12px rgba(255,255,255,.95);color:#0B8DCE}' +
      '#set-bar button:active{box-shadow:inset 3px 3px 6px rgba(30,45,55,.22),inset -3px -3px 6px rgba(255,255,255,.95);color:#0B8DCE}' +
      '#set-bar button[data-d="level"]{font-size:15px;width:58px;border-radius:19px;text-align:center;color:#0B8DCE}' +
      '#set-bar button[data-d="copy"]{min-width:0;width:auto;height:32px;padding:0 14px;border-radius:16px;' +
      'font-size:13px;font-weight:600;color:#0B8DCE}' +
      '#set-lyrics-toggle{margin:0 0 8px;padding:7px 14px;border:none;border-radius:20px;cursor:pointer;font-family:inherit;' +
      'font-size:13px;font-weight:600;color:#0B8DCE;background:#F7F9FA;user-select:none;' +
      'box-shadow:5px 5px 10px rgba(30,45,55,.18),-5px -5px 10px rgba(255,255,255,.95);transition:box-shadow .15s,color .15s}' +
      '#set-lyrics-toggle:hover{box-shadow:6px 6px 12px rgba(30,45,55,.22),-6px -6px 12px rgba(255,255,255,.95);color:#0B8DCE}' +
      '#set-lyrics-toggle:active{box-shadow:inset 3px 3px 6px rgba(30,45,55,.22),inset -3px -3px 6px rgba(255,255,255,.95);color:#0B8DCE}' +
      '.set-lyrics.hidden{display:none}' +
      '.set-song-body > h1:first-child{margin-top:8px}' +
      '.markdown-section hr{border:0;border-top:1px solid #EEF1F3;margin:22px 0}' +
      '.set-song-error{padding:10px 12px;border-radius:8px;background:#FDF2F2;color:#B3261E;font-size:13px;line-height:1.4}' +
      '.set-warn{margin-left:8px;font-size:12px;font-weight:400;color:#B3261E}';
    document.head.appendChild(st);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('copy failed'));
    });
  }

  // Чистый вид ссылки — без решётки: origin + /set?… . Так она выглядит
  // в закладках и в сообщениях, а открытие проходит через 404.html.
  function setUrl() {
    var qs = queryString();
    return window.location.origin + '/set' + (qs ? '?' + qs : '');
  }

  function applyAll() {
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it.node) window.TransposeCore.applyTo(it.node, it.baseOffset + state.shift);
    }
  }

  function renderShift() {
    var el = document.querySelector('#set-bar button[data-d="level"]');
    if (!el) return;
    el.textContent =
      state.shift > 0 ? '+' + state.shift : state.shift < 0 ? String(state.shift) : '0';
  }

  function onBarClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[data-d]') : null;
    if (!btn) return;
    var d = btn.getAttribute('data-d');
    if (d === 'copy') {
      copyText(setUrl()).then(
        function () {
          flash(btn, 'Скопировано');
        },
        function () {
          flash(btn, 'Не вышло');
        }
      );
      return;
    }
    if (d === 'up') state.shift = clamp(state.shift + 1);
    else if (d === 'down') state.shift = clamp(state.shift - 1);
    else state.shift = 0;
    applyAll();
    renderShift();
  }

  function flash(btn, text) {
    if (copyTimer) clearTimeout(copyTimer);
    var original = 'Ссылка';
    btn.textContent = text;
    copyTimer = setTimeout(function () {
      btn.textContent = original;
    }, 1600);
  }

  // Панель транспониции сета. Пока не используется: doneEach её не вызывает.
  // Кнопка «Ссылка» убрана из разметки, но обработчик d === 'copy' в
  // onBarClick и функция setUrl() остались на случай возврата.
  function buildBar(section) {
    if (document.getElementById('set-bar')) return;
    injectStyle();
    var bar = document.createElement('div');
    bar.id = 'set-bar';
    bar.innerHTML =
      '<button type="button" data-d="down" title="Весь сет ниже на полтона">&#8722;</button>' +
      '<button type="button" data-d="level" title="Сбросить общий сдвиг">0</button>' +
      '<button type="button" data-d="up" title="Весь сет выше на полтона">+</button>';
    bar.addEventListener('click', onBarClick);
    document.body.appendChild(bar);
    renderShift();
  }

  function removeBar() {
    var bar = document.getElementById('set-bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

// Всё, что ниже заголовка «## Слова», вместе с самим заголовком уезжает в
  // отдельный блок .set-lyrics, чтобы его можно было скрыть целиком.
  // Транспонирование обходит потомков через querySelectorAll('p'),
  // поэтому вложенность ему не мешает.
  function wrapLyrics(body) {
    var heads = body.querySelectorAll('h1, h2, h3');
    var head = null;
    for (var i = 0; i < heads.length; i++) {
      if ((heads[i].textContent || '').trim() === 'Слова') {
        head = heads[i];
        break;
      }
    }
    if (!head) return;
    var wrap = document.createElement('div');
    wrap.className = 'set-lyrics';
    body.insertBefore(wrap, head);
    var node = head;
    while (node) {
      var next = node.nextSibling;
      wrap.appendChild(node);
      node = next;
    }
  }

  function renderLyricsLabel() {
    var btn = document.getElementById('set-lyrics-toggle');
    if (btn) btn.textContent = hideLyrics ? 'Показать слова' : 'Скрыть слова';
  }

  function applyLyricsMode() {
    var wraps = document.querySelectorAll('.markdown-section .set-lyrics');
    for (var i = 0; i < wraps.length; i++) {
      if (hideLyrics) wraps[i].classList.add('hidden');
      else wraps[i].classList.remove('hidden');
    }
  }

  function buildLyricsToggle(section) {
    if (!document.getElementById('set-lyrics-toggle')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'set-lyrics-toggle';
      btn.addEventListener('click', function () {
        hideLyrics = !hideLyrics;
        applyLyricsMode();
        renderLyricsLabel();
      });
      section.insertBefore(btn, section.firstChild);
    }
    renderLyricsLabel();
  }

  function removeLyricsToggle() {
    var btn = document.getElementById('set-lyrics-toggle');
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }

  // Разделители <div class="set-song"> режут отрендеренный сек на блоки песен:
  // всё после маркера и до следующего — DOM одной песни. Разделители <hr> и
  // сообщения об ошибке остаются на месте — они не часть песни.
  function splitByMarkers(section) {
    var groups = [];
    var cur = null;
    var nodes = Array.prototype.slice.call(section.childNodes);
    nodes.forEach(function (node) {
      if (node.nodeType === 1 && node.classList && node.classList.contains('set-song')) {
        if (cur) groups.push(cur);
        if (node.classList.contains('set-song-error')) {
          cur = null;
          return;
        }
        cur = { marker: node, nodes: [] };
        return;
      }
      if (!cur) return;
      var isDivider = node.nodeType === 1 && node.tagName === 'HR';
      if (!isDivider) cur.nodes.push(node);
    });
    if (cur) groups.push(cur);
    return groups;
  }

  function groupDom(groups) {
    groups.forEach(function (g) {
      var body = document.createElement('div');
      body.className = 'set-song-body';
      g.marker.parentNode.insertBefore(body, g.marker);
      for (var i = 0; i < g.nodes.length; i++) body.appendChild(g.nodes[i]);
      g.marker.parentNode.removeChild(g.marker);
      g.body = body;
      wrapLyrics(body);
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = window.$docsify.plugins || [];
  window.$docsify.plugins.push(function (hook, vm) {
    // ВАЖНО: docsify ждёт только колбэк-форму (arity 2).
    //   callHook: if (2 === e.length) e(t, cb); else { var o = e(t); t = o; }
    // Однопараметричный beforeEach с Promise возвращается в рендерер как
    // содержимое — из-за этого страница сета не рендерилась вовсе.
    hook.beforeEach(function (content, next) {
      state.shift = 0;
      state.items = [];
      if (!isSetPage(vm)) return next(content);
      var items = parseSet();
      if (!items) return next(content);
      buildMarkdown(items).then(
        function (md) {
          next(md);
        },
        function () {
          next(content);
        }
      );
    });

    hook.doneEach(function () {
      var section = getSection();
      if (!section) return;
      if (!isSetPage(vm) || !state.items.length) {
        removeBar();
        removeLyricsToggle();
        hideLyrics = false;
        return;
      }

      var groups = splitByMarkers(section);
      groupDom(groups);

      groups.forEach(function (g, i) {
        var it = state.items[i];
        if (!it) return;
        it.node = g.body;
        if (it.target) {
          var off = offsetBetween(it.key, it.target);
          if (off === null) {
            it.badKey = true;
            it.baseOffset = 0;
          } else {
            it.baseOffset = off;
          }
        }
        window.TransposeCore.applyTo(g.body, it.baseOffset + state.shift);

        if (it.badKey) {
          var h = g.body.querySelector('h1, h2, h3');
          if (h) {
            var warn = document.createElement('span');
            warn.className = 'set-warn';
            warn.textContent = 'тональность «' + it.target + '» не распознана';
            h.appendChild(warn);
          }
        }
      });

      // Панель транспониции сета намеренно не строится (buildBar ниже).
      // Если понадобится — вернуть вызов buildBar(section).
      injectStyle();
      buildLyricsToggle(section);
      applyLyricsMode();
    });
  });
})();