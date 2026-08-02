(function () {
  'use strict';

  var LS_KEY = 'rcc_chords_transpose';
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

  function load() {
    try {
      var v = parseInt(localStorage.getItem(LS_KEY), 10);
      offset = isNaN(v) ? 0 : clamp(v);
    } catch (e) {
      offset = 0;
    }
  }

  function save() {
    try {
      localStorage.setItem(LS_KEY, String(offset));
    } catch (e) {}
  }

  function captureBaseKey() {
    var container = getContainer();
    if (!container) return null;
    var ps = container.querySelectorAll('blockquote p');
    for (var i = 0; i < ps.length; i++) {
      if (/Тональность/.test(ps[i].textContent)) {
        return window.TransposeCore.matchKey(ps[i].textContent);
      }
    }
    return null;
  }

  function renderLevel() {
    var btn = document.querySelector('#transpose-bar button[data-d="level"]');
    if (btn) {
      btn.textContent =
        offset === 0 ? '0' : offset > 0 ? '+' + offset : String(offset);
    }
    var keyEl = document.getElementById('transpose-key');
    if (keyEl) {
      keyEl.textContent = baseKey
        ? 'Тон: ' + window.TransposeCore.keyAfter(baseKey, offset)
        : '';
      keyEl.title = 'Текущая тональность после транспонирования';
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
      '#transpose-bar{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:24px;background:rgba(35,39,48,.94);box-shadow:0 2px 12px rgba(0,0,0,.35);font-family:inherit;user-select:none}' +
      '#transpose-bar button{border:none;cursor:pointer;min-width:38px;height:38px;border-radius:50%;font-size:21px;font-weight:600;line-height:1;color:#fff;background:rgba(255,255,255,.14);transition:background .15s}' +
      '#transpose-bar button:hover{background:rgba(255,255,255,.3)}' +
      '#transpose-bar button:active{background:rgba(255,255,255,.45)}' +
      '#transpose-bar button[data-d="level"]{font-size:15px;min-width:56px;border-radius:19px}' +
      '#transpose-key{color:#cfd8dc;font-size:13px;margin:0 6px;white-space:nowrap}';
    document.head.appendChild(st);
  }

  function buildBar() {
    var bar = document.getElementById('transpose-bar');
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'transpose-bar';
    bar.innerHTML =
      '<button type="button" data-d="down" title="Транспонировать вниз (на полтона)">&#8722;</button>' +
      '<button type="button" data-d="level" title="Сброс транспонирования">0</button>' +
      '<button type="button" data-d="up" title="Транспонировать вверх (на полтона)">+</button>' +
      '<span id="transpose-key"></span>';
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
      save();
      applyTranspose();
    });
    document.body.appendChild(bar);
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = window.$docsify.plugins || [];
  window.$docsify.plugins.push(function (hook) {
    hook.doneEach(function () {
      injectStyle();
      buildBar();
      load();
      baseKey = captureBaseKey();
      applyTranspose();
    });
  });
})();
