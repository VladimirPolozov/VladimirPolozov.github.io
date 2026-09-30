(function () {
  'use strict';

  var ICON =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
    '<line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/>' +
    '</svg>';

  var toastTimer = null;

  function injectStyle() {
    if (document.getElementById('song-share-style')) return;
    var st = document.createElement('style');
    st.id = 'song-share-style';
    st.textContent =
      '#song-share{position:absolute;top:24px;right:24px;width:36px;height:36px;display:flex;' +
      'align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;cursor:pointer;' +
      'color:#159FE8;background:#F7F9FA;box-shadow:5px 5px 10px rgba(30,45,55,.18),-5px -5px 10px rgba(255,255,255,.95);' +
      'transition:box-shadow .15s,color .15s}' +
      '#song-share:hover{color:#0B8DCE;box-shadow:6px 6px 12px rgba(30,45,55,.22),-6px -6px 12px rgba(255,255,255,.95)}' +
      '#song-share:active{color:#0B8DCE;box-shadow:inset 3px 3px 6px rgba(30,45,55,.22),inset -3px -3px 6px rgba(255,255,255,.95)}' +
      '#song-share[data-done="1"]{color:#0B8DCE}' +
      '.markdown-section.song-page > h1:first-of-type{padding-right:46px}' +
      '#song-share-toast{position:absolute;top:66px;right:24px;padding:6px 10px;border-radius:8px;' +
      'background:#0B8DCE;color:#fff;font-size:12px;line-height:1.2;white-space:nowrap;pointer-events:none;' +
      'opacity:0;transition:opacity .2s}' +
      '#song-share-toast[data-show="1"]{opacity:1}' +
      '@media (max-width:768px){#song-share{top:18px;right:18px;width:34px;height:34px}' +
      '#song-share-toast{top:58px;right:18px}}';
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

  function showToast(toast, btn, text) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = text;
    toast.setAttribute('data-show', '1');
    btn.setAttribute('data-done', '1');
    toastTimer = setTimeout(function () {
      toast.setAttribute('data-show', '0');
      btn.removeAttribute('data-done');
    }, 1600);
  }

  function build(section) {
    if (section.querySelector('#song-share')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'song-share';
    btn.title = 'Скопировать ссылку на песню';
    btn.setAttribute('aria-label', 'Скопировать ссылку на песню');
    btn.innerHTML = ICON;

    var toast = document.createElement('div');
    toast.id = 'song-share-toast';

    btn.addEventListener('click', function () {
      copyText(window.location.href).then(
        function () {
          showToast(toast, btn, 'Ссылка скопирована');
        },
        function () {
          showToast(toast, btn, 'Не удалось скопировать');
        }
      );
    });

    section.appendChild(btn);
    section.appendChild(toast);
  }

  function isSongPage(vm) {
    var path = vm && vm.route && vm.route.path;
    if (!path) return false;
    return /^\/songs\//.test(path);
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = window.$docsify.plugins || [];
  window.$docsify.plugins.push(function (hook, vm) {
    hook.doneEach(function () {
      var section = document.querySelector('.markdown-section');
      if (!section) return;
      if (!isSongPage(vm)) {
        section.classList.remove('song-page');
        return;
      }
      injectStyle();
      section.classList.add('song-page');
      build(section);
    });
  });
})();
