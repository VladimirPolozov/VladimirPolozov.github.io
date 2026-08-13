(function () {
  'use strict';

  var offset = 0;
  var baseKey = null;

  function getContainer() {
    return (
      document.querySelector('.markdown-section') ||
      document.querySelector('#main') ||
      document.querySelector('main') ||
      document.body
    );
  }

  function clamp(n) {
    return Math.max(-11, Math.min(11, n));
  }

  function reset() {
    offset = 0;
  }

  function captureBaseKey() {
    var container = getContainer();
    if (!container) return null;
    var ps = container.querySelectorAll('blockquote p');
    for (var i = 0; i < ps.length; i++) {
      var txt = ps[i].textContent || '';
      var idx = txt.indexOf('Тональность');
      if (idx >= 0) {
        // Ключ берём только из части строки после «Тональность:»,
        // иначе matchKey поймает первую букву исполнителя (Bethel -> B).
        return window.TransposeCore.matchKey(txt.slice(idx));
      }
    }
    return null;
  }

  // Извлекает key из YAML-frontmatter в начале файла:
  //   ---
  //   key: G
  //   ---
  // Возвращает { key, rest } — ключ и текст без frontmatter.
  function parseFrontmatter(content) {
    var s = String(content).replace(/^\uFEFF/, '');
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

  function renderLevel() {
    var btn = document.querySelector('#transpose-bar button[data-d="level"]');
    if (btn) {
      btn.textContent = baseKey
        ? window.TransposeCore.keyAfter(baseKey, offset)
        : '—';
    }
  }

  function applyTranspose() {
    var container = getContainer();
    if (container) {
      window.TransposeCore.applyTo(container, offset);
    }
    renderLevel();
  }

  function injectStyle() {
    if (document.getElementById('transpose-style')) return;
    var st = document.createElement('style');
    st.id = 'transpose-style';
    st.textContent =
      '#transpose-bar{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:24px;background:#F7F9FA;box-shadow:6px 6px 12px rgba(30,45,55,.08),-6px -6px 12px rgba(255,255,255,.90);font-family:inherit;user-select:none}' +
      '#transpose-bar button{border:none;cursor:pointer;min-width:38px;height:38px;border-radius:50%;font-size:21px;font-weight:600;line-height:1;color:#159FE8;background:#F7F9FA;box-shadow:4px 4px 8px rgba(30,45,55,.08),-4px -4px 8px rgba(255,255,255,.90);transition:box-shadow .15s,color .15s}' +
      '#transpose-bar button:hover{box-shadow:5px 5px 10px rgba(30,45,55,.08),-5px -5px 10px rgba(255,255,255,.90);color:#0B8DCE}' +
      '#transpose-bar button:active{box-shadow:inset 3px 3px 6px rgba(30,45,55,.08),inset -3px -3px 6px rgba(255,255,255,.90);color:#0B8DCE}' +
      '#transpose-bar button[data-d="level"]{font-size:15px;width:58px;border-radius:19px;text-align:center;color:#0B8DCE}';
    document.head.appendChild(st);
  }

  function buildBar() {
    var bar = document.getElementById('transpose-bar');
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'transpose-bar';
    bar.innerHTML =
      '<button type="button" data-d="down" title="Транспонировать вниз (на полтона)">&#8722;</button>' +
      '<button type="button" data-d="level" title="Сброс транспонирования (текущая тональность)">—</button>' +
      '<button type="button" data-d="up" title="Транспонировать вверх (на полтона)">+</button>';
    bar.addEventListener('click', function (e) {
      var btn =
        e.target && e.target.closest
          ? e.target.closest('button[data-d]')
          : null;
      if (!btn) return;
      var d = btn.getAttribute('data-d');
      if (d === 'up') offset = clamp(offset + 1);
      else if (d === 'down') offset = clamp(offset - 1);
      else offset = 0;
      applyTranspose();
    });
    document.body.appendChild(bar);
  }

  function removeBar() {
    var bar = document.getElementById('transpose-bar');
    if (bar) bar.parentNode.removeChild(bar);
  }

  function isSongPage(vm) {
    var path = vm && vm.route && vm.route.path;
    if (!path) return false;
    return /^\/songs\//.test(path);
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = window.$docsify.plugins || [];
  window.$docsify.plugins.push(function (hook, vm) {
    // Читаем тональность из frontmatter и убираем его из отображаемого текста.
    // baseKey хранится между рендерами SPA.
    hook.beforeEach(function (content) {
      var fm = parseFrontmatter(content);
      baseKey = fm.key || null;
      return fm.rest;
    });
    hook.doneEach(function () {
      if (!isSongPage(vm)) {
        removeBar();
        reset();
        return;
      }
      injectStyle();
      buildBar();
      reset();
      if (!baseKey) baseKey = captureBaseKey();
      applyTranspose();
    });
  });
})();
