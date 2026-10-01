(function () {
  'use strict';

  // Фиксированная кнопка «вверх» — на всех страницах, в нижнем правом углу.
  // Видна только после прокрутки, иначе висит в углу без надобности.
  //
  // На страницах песни в этом же углу стоит #transpose-bar, поэтому при его
  // наличии кнопка поднимается выше (правило с :has() в injectStyle).
  //
  // docsify при навигации прокручивает страницу вверх сам (auto2top),
  // поэтому синхронизировать кнопку с роутером не нужно.

  function injectStyle() {
    if (document.getElementById('totop-style')) return;
    var st = document.createElement('style');
    st.id = 'totop-style';
    st.textContent =
      '#to-top{position:fixed;right:16px;bottom:16px;z-index:9999;width:38px;height:38px;padding:0;' +
      'border:none;border-radius:50%;cursor:pointer;color:#159FE8;background:#F7F9FA;font-family:inherit;' +
      'font-size:19px;line-height:1;display:flex;align-items:center;justify-content:center;' +
      'box-shadow:5px 5px 10px rgba(30,45,55,.18),-5px -5px 10px rgba(255,255,255,.95);' +
      'transition:box-shadow .15s,color .15s,opacity .15s;opacity:0;pointer-events:none;user-select:none}' +
      'body:has(#transpose-bar) #to-top{bottom:72px}' +
      '#to-top.show{opacity:1;pointer-events:auto}' +
      '#to-top:hover{box-shadow:6px 6px 12px rgba(30,45,55,.22),-6px -6px 12px rgba(255,255,255,.95);color:#0B8DCE}' +
      '#to-top:active{box-shadow:inset 3px 3px 6px rgba(30,45,55,.22),inset -3px -3px 6px rgba(255,255,255,.95);color:#0B8DCE}';
    document.head.appendChild(st);
  }

  function build() {
    if (document.getElementById('to-top')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'to-top';
    btn.title = 'Наверх';
    btn.setAttribute('aria-label', 'Наверх');
    btn.innerHTML = '&#8593;';
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(btn);
  }

  function sync() {
    var btn = document.getElementById('to-top');
    if (!btn) return;
    var scrolled = window.pageYOffset > 200;
    if (scrolled) btn.classList.add('show');
    else btn.classList.remove('show');
  }

  injectStyle();
  build();
  sync();
  window.addEventListener('scroll', sync, { passive: true });
})();