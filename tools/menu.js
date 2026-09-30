(function () {
  'use strict';

  var ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/>' +
    '<line x1="4" y1="17" x2="20" y2="17"/></svg>';

  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  function injectStyle() {
    if (document.getElementById('sidebar-toggle-style')) return;
    var st = document.createElement('style');
    st.id = 'sidebar-toggle-style';
    st.textContent =
      '#sidebar-toggle{position:fixed;bottom:16px;left:16px;width:36px;height:36px;display:flex;' +
      'align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;cursor:pointer;' +
      'color:#159FE8;background:#F7F9FA;box-shadow:5px 5px 10px rgba(30,45,55,.18),-5px -5px 10px rgba(255,255,255,.95);' +
      'z-index:9998;transition:box-shadow .15s,color .15s,opacity .2s}' +
      '#sidebar-toggle:hover{color:#0B8DCE;box-shadow:6px 6px 12px rgba(30,45,55,.22),-6px -6px 12px rgba(255,255,255,.95)}' +
      '#sidebar-toggle:active{color:#0B8DCE;box-shadow:inset 3px 3px 6px rgba(30,45,55,.22),inset -3px -3px 6px rgba(255,255,255,.95)}' +
      '#sidebar-toggle svg{line-height:0}' +
      /* Панель открыта — кнопка прячется, чтобы не перекрывать меню.
         body.close на мобильном = сайдбар выехал (у docsify на пк наоборот). */
      '@media (max-width:768px){#sidebar-toggle{bottom:14px;left:14px;width:34px;height:34px}' +
      'body.close #sidebar-toggle{opacity:0;pointer-events:none}}';
    document.head.appendChild(st);
  }

  // Класс close на body — это штатное состояние docsify:
  // body.close .sidebar{transform:translateX(-300px)} (пк, сайдбар свёрнут) и
  // body.close .sidebar{transform:translateX(300px)} (мобильный, панель выехала).
  function toggle() {
    document.body.classList.toggle('close');
  }

  // Штатное автозакрытие docsify работает только если при загрузке
  // document.body.clientWidth <= 600, поэтому на 601–768px панель после
  // выбора песни оставалась бы открытой. Дублируем закрытие явно.
  // Именно remove, а не toggle: обработчик docsify (<=600px) делает то же
  // самое, двойное переключение сбило бы состояние.
  function closeDrawerOnNav() {
    document.addEventListener('click', function (e) {
      var a =
        e.target && e.target.closest
          ? e.target.closest('.sidebar-nav a, aside.sidebar a')
          : null;
      if (!a) return;
      if (window.matchMedia('(max-width: 768px)').matches) {
        document.body.classList.remove('close');
      }
    });
  }

  function build() {
    if (document.getElementById('sidebar-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sidebar-toggle';
    btn.title = 'Открыть/закрыть список песен';
    btn.setAttribute('aria-label', 'Открыть или закрыть список песен');
    btn.innerHTML = ICON;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
    document.body.appendChild(btn);
  }

  function refresh() {
    var btn = document.getElementById('sidebar-toggle');
    if (!btn) return;
    var closed = document.body.classList.contains('close');
    btn.innerHTML = closed ? ICON_CLOSE : ICON;
    btn.title = closed ? 'Открыть список песен' : 'Скрыть список песен';
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = window.$docsify.plugins || [];
  window.$docsify.plugins.push(function (hook) {
    hook.mounted(function () {
      injectStyle();
      build();
      closeDrawerOnNav();
    });
    hook.doneEach(function () {
      refresh();
    });
  });
})();
