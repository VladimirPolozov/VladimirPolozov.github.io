(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TransposeCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEMI = {
    C: 0, 'C#': 1, Db: 1,
    D: 2, 'D#': 3, Eb: 3,
    E: 4,
    F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8,
    A: 9, 'A#': 10, Bb: 10, Hb: 10,
    B: 11, H: 11
  };
  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'H'];

  var CYR_MAP = {
    '\u0410': 'A',
    '\u0412': 'B',
    '\u0421': 'C',
    '\u0415': 'E',
    '\u041D': 'H'
  };

  function toLatin(s) {
    return String(s).replace(/[\u0410\u0412\u0421\u0415\u041D]/g, function (c) {
      return CYR_MAP[c];
    });
  }

  function rootPitch(root) {
    var idx = SEMI[toLatin(root)];
    return idx === undefined ? null : idx;
  }

  // Корень: латинская A-H или похожие кириллические буквы + необязательный #/b
  var ATOM = '[A-H\u0410\u0412\u0421\u0415\u041D][#b]?';
  var QUAL = '(?:maj|min|sus|dim|aug|add|m)';
  var SUFFIX = '(?:' + QUAL + ')*(?:\\d+)?(?:[b#]\\d+)?';
  var BASS = '(?:\\/' + ATOM + SUFFIX + ')*';
  var PAREN = '(?:\\([A-H\u0410\u0412\u0421\u0415\u041D][#b]?(?:' + QUAL + ')*(?:\\d+)?(?:[b#]\\d+)?\\))';

  // Токен целиком является аккордом (допускаются аккорды в скобках).
  // Без внешнего +: последовательность одиночных букв (напр. "ВСЕ") — не аккорд.
  var CHORD_RE = new RegExp('^(?:' + ATOM + SUFFIX + BASS + '|' + PAREN + ')$');

  var NEUTRAL_PUNCT = /^[|\u2022*():l\-.\u2026\u2013\u2014\u00B7]+$/;
  var NEUTRAL_REPEAT = /^[\(\[|]*[x\u0445\u00D7]+\d+[\)\]|]*$/;
  var NEUTRAL_TIMESIG = /^\(?\d+\/\d+\)?$/;
  var NEUTRAL_SUPER = /^[\u00B9\u00B2\u00B3\u2074]+$/;

  // Сканер: находит корни аккордов в строке и транспонирует их, оставляя суффиксы.
  // Негативный просмотр вперёд не даёт сработать на обычных словах (Amazing, major и т.п.)
  var ROOT_RE = new RegExp(
    ATOM +
      '(?=' + SUFFIX + BASS + '(?![A-Za-z\\u0400-\\u04FF0-9]))',
    'g'
  );

  function transposeRoot(root, offset) {
    var idx = SEMI[toLatin(root)];
    if (idx === undefined) return root;
    return NAMES[(idx + offset + 120) % 12];
  }

  function scanAndTranspose(text, offset) {
    if (!text || offset % 12 === 0) return text;
    return String(text).replace(ROOT_RE, function (m) {
      return transposeRoot(m, offset);
    });
  }

  // Транспонирование строки с тональностью ("Тональность: C#m", "Key: H major")
  var KEY_RE = new RegExp('(' + ATOM + ')(?=(?:' + QUAL + ')*\\d*)', 'g');

  function transposeKeyText(text, offset) {
    if (!text || offset % 12 === 0) return text;
    return String(text).replace(KEY_RE, function (m, root) {
      return transposeRoot(root, offset);
    });
  }

  function matchKey(text) {
    var m = String(text).match(new RegExp('(' + ATOM + ')((?:' + QUAL + ')*\\d*)'));
    return m ? m[1] + m[2] : null;
  }

  function keyAfter(baseKey, offset) {
    if (!baseKey) return '';
    var m = String(baseKey).match(/^([A-H\u0410\u0412\u0421\u0415\u041D][#b]?)(.*)$/);
    if (!m) return baseKey;
    return transposeRoot(m[1], offset) + m[2];
  }

  function stripDeco(t) {
    return String(t).replace(/[|\u2022*]+$/g, '').replace(/^[|\u2022]+/g, '');
  }

  var CYR_SINGLE = /^[\u0410\u0412\u0421\u0415\u041D]$/;

  function classifyToken(token) {
    var t = String(token);
    if (!t) return null;
    if (NEUTRAL_PUNCT.test(t)) return 'neutral';
    if (NEUTRAL_REPEAT.test(t)) return 'neutral';
    if (NEUTRAL_TIMESIG.test(t)) return 'neutral';
    if (NEUTRAL_SUPER.test(t)) return 'neutral';
    var core = stripDeco(t);
    // Одиночная кириллическая буква неоднозначна (русское "В", "А", "С") —
    // классифицируется контекстом, см. classifyTokenCtx
    if (CYR_SINGLE.test(core)) return null;
    if (CHORD_RE.test(core)) return 'chord';
    return null;
  }

  // Классификация токена с учётом соседей в строке:
  // одиночная кириллическая буква считается аккордом, только если рядом
  // стоит аккорд/разделитель (в "В конце: Hb |" "В" — русское слово)
  function classifyTokenCtx(tokens, index) {
    var t = tokens[index];
    var cls = classifyToken(t);
    if (cls) return cls;
    var core = stripDeco(t);
    if (!CYR_SINGLE.test(core)) return null;
    var prev = index > 0 ? tokens[index - 1] : null;
    var next = index < tokens.length - 1 ? tokens[index + 1] : null;
    var neighbors = [];
    if (prev !== null) neighbors.push(prev);
    if (next !== null) neighbors.push(next);
    for (var i = 0; i < neighbors.length; i++) {
      var k = classifyToken(neighbors[i]);
      if (k === 'chord' || k === 'neutral') return 'chord';
      var nc = stripDeco(neighbors[i]);
      if (CYR_SINGLE.test(nc)) return 'chord';
    }
    return null;
  }

  // Строка является аккордовой, если большинство токенов — аккорды/разделители.
  // Строка, начинающаяся с аккорда (даже с комментарием в конце) — тоже аккордовая.
  function isChordLine(fragment) {
    var s = String(fragment).trim();
    if (!s) return false;
    var toks = s.split(/\s+/);
    var c = 0;
    var n = 0;
    for (var i = 0; i < toks.length; i++) {
      var k = classifyTokenCtx(toks, i);
      if (k === 'chord') c++;
      else if (k === 'neutral') n++;
    }
    if (c === 0) return false;
    if (classifyTokenCtx(toks, 0) === 'chord') {
      return c >= 2 || toks.length <= 3;
    }
    if ((c + n) / toks.length < 0.5) return false;
    if (c >= 2) return true;
    return toks.length <= 3;
  }

  // Транспонирует только токены-аккорды, остальное (включая русские слова,
  // разделители, повторы) оставляет нетронутым
  function transposeChordTokens(line, offset) {
    if (!line || offset % 12 === 0) return line;
    var pieces = String(line).split(/(\s+)/);
    var toks = [];
    for (var i = 0; i < pieces.length; i += 2) toks.push(pieces[i]);
    for (var i = 0; i < toks.length; i++) {
      if (classifyTokenCtx(toks, i) === 'chord') {
        pieces[i * 2] = scanAndTranspose(toks[i], offset);
      }
    }
    return pieces.join('');
  }

  function hasChordToken(text, allowCyrSingle) {
    var toks = String(text).split(/\s+/);
    for (var i = 0; i < toks.length; i++) {
      if (classifyToken(toks[i]) === 'chord') return true;
      if (allowCyrSingle && CYR_SINGLE.test(stripDeco(toks[i]))) return true;
    }
    return false;
  }

  // Питы всех корней аккордов в строке (для проверки эквивалентности)
  function parsePitches(text) {
    var res = [];
    var toks = String(text).split(/\s+/);
    for (var i = 0; i < toks.length; i++) {
      if (classifyTokenCtx(toks, i) === 'chord') {
        var re = new RegExp(ATOM, 'g');
        var m;
        while ((m = re.exec(toks[i]))) {
          var p = rootPitch(m[0]);
          if (p !== null) res.push(p);
        }
      }
    }
    return res;
  }

  function transformText(text, offset, mode) {
    if (offset % 12 === 0) return text;
    if (mode === 'key') return transposeKeyText(text, offset);
    if (mode === 'cell') return scanAndTranspose(text, offset);
    var parts = String(text).split('\n');
    for (var i = 0; i < parts.length; i++) {
      if (isChordLine(parts[i])) {
        parts[i] = transposeChordTokens(parts[i], offset);
      }
    }
    return parts.join('\n');
  }

  // --- DOM-часть (используется в браузере) ---
  var ORIG = typeof WeakMap === 'function' ? new WeakMap() : null;

  function transposeTextNodes(el, offset, mode) {
    if (!ORIG || typeof document === 'undefined') return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.data) continue;
      var o = ORIG.get(n);
      if (o === undefined) {
        o = n.data;
        ORIG.set(n, o);
      }
      var out = transformText(o, offset, mode);
      if (out !== n.data) n.data = out;
    }
  }

  // Транспонирует только узлы, начиная с узла, содержащего «Тональность»/«Key:».
  // В блоке метаданных весь блок-цитаты рендерится одним <p> с <br>,
  // и применять mode 'key' ко всему абзацу нельзя — он зацепит
  // «Исполнитель: Jesus Culture» (C -> C# -> D ...).
  function transposeKeyTextNodes(p, offset) {
    if (!ORIG || typeof document === 'undefined') return;
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var node;
    var start = -1;
    while ((node = walker.nextNode())) {
      nodes.push(node);
      if (start < 0 && node.data && /Тональность|Key\s*[:=]/i.test(node.data)) {
        start = nodes.length - 1;
      }
    }
    if (start < 0) return;
    for (var i = start; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.data) continue;
      var o = ORIG.get(n);
      if (o === undefined) {
        o = n.data;
        ORIG.set(n, o);
      }
      var out = transformText(o, offset, 'key');
      if (out !== n.data) n.data = out;
    }
  }

  function transposeParagraph(p, offset) {
    if (p.closest && p.closest('blockquote')) {
      transposeKeyTextNodes(p, offset);
      return;
    }
    transposeTextNodes(p, offset, 'line');
  }

  function applyTo(container, offset) {
    if (!container || typeof document === 'undefined') return;
    var cells = container.querySelectorAll('table td, table th');
    for (var i = 0; i < cells.length; i++) {
      if (hasChordToken(cells[i].textContent, true)) {
        transposeTextNodes(cells[i], offset, 'cell');
      }
    }
    var ps = container.querySelectorAll('p');
    for (var j = 0; j < ps.length; j++) {
      transposeParagraph(ps[j], offset);
    }
  }

  return {
    transposeRoot: transposeRoot,
    scanAndTranspose: scanAndTranspose,
    transposeKeyText: transposeKeyText,
    transposeChordTokens: transposeChordTokens,
    matchKey: matchKey,
    keyAfter: keyAfter,
    pitchOf: rootPitch,
    classifyToken: classifyToken,
    classifyTokenCtx: classifyTokenCtx,
    isChordLine: isChordLine,
    parsePitches: parsePitches,
    transformText: transformText,
    applyTo: applyTo
  };
});
