/* render.js — renderer nhúng vào file HTML xuất ra (khối [3]).
   ------------------------------------------------------------
   KHÔNG khai `const SECTIONS` / `let SECTIONS` / `var SECTIONS` ở đâu trong file này.
   parse-def.js của hub bóc khối `<script>` ĐẦU TIÊN khớp /(?:const|let|var)\s+SECTIONS\s*=/
   rồi chạy nó trong iframe sandbox; khối này phải KHÔNG khớp để nó không bao giờ bị chạy ở
   đó — nhờ vậy nó gọi localStorage thoải mái mà không ném trong origin mờ.

   Chia esc/thô giống assets/sync.js:191-214 của repo: `t`, `e`, `w`, `s.id`, `s.title` đi
   qua esc(); chỉ `b` và `note` được chèn thô. Lệch chỗ này là bản preview và bản hub hiện
   khác nhau với mọi tiêu đề có chứa `<`.

   Chạy được trong node để test: khi có `module.exports` thì chỉ xuất hàm rồi thoát, không
   chạm DOM. */
(function () {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  /* Hàm thuần: cùng dữ liệu vào thì cùng HTML ra, không đọc DOM, không đọc storage. */
  function buildHtml(sections) {
    return sections.map(function (s) {
      return '\n<section data-p="' + esc(s.id) + '">\n' +
        '  <div class="sechead">\n' +
        '    <span class="tag ' + esc(s.tag) + '">' + esc(s.id) + '</span>\n' +
        '    <h2>' + esc(s.title) + '</h2>\n' +
        '    <span class="seccount" data-sec="' + esc(s.id) + '"></span>\n' +
        '  </div>\n' +
        '  <p class="secnote">' + (s.note || '') + '</p>\n' +
        s.items.map(function (i) {
          return '  <div class="item" data-id="' + esc(i.id) + '" data-p="' + esc(s.id) + '">\n' +
            '    <div class="row">\n' +
            '      <input type="checkbox" data-id="' + esc(i.id) + '">\n' +
            '      <div class="rowtxt">\n' +
            '        <div class="ttl">' + esc(i.t) + '<span class="effort">' + esc(i.e) + '</span></div>\n' +
            '        <div class="why">' + esc(i.w) + '</div>\n' +
            '      </div>\n' +
            '      <div class="exp">▾</div>\n' +
            '    </div>\n' +
            '    <div class="body">' + (i.b || '') + '</div>\n' +
            '  </div>';
        }).join('\n') +
        '\n</section>';
    }).join('\n');
  }

  function buildScores(scores) {
    return (scores || []).map(function (row) {
      var v = Math.max(0, Math.min(10, Math.round(Number(row[1]) || 0)));
      var c = v <= 3 ? 'var(--p0)' : v <= 5 ? 'var(--p1)' : v <= 7 ? 'var(--p2)' : 'var(--p3)';
      return '<div class="score"><div class="lbl">' + esc(row[0]) + '</div>' +
        '<div class="val" style="color:' + c + '">' + v + '<span class="progpct">/10</span></div>' +
        '<div class="bar"><i style="width:' + (v * 10) + '%;background:' + c + '"></i></div>' +
        '<div class="note">' + esc(row[2]) + '</div></div>';
    }).join('');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildHtml: buildHtml, buildScores: buildScores, esc: esc };
    return;
  }

  /* ---------- từ đây trở xuống chỉ chạy trên browser ---------- */
  var KEY = 'op-local-' + CHECKLIST_ID;
  var state = {};
  var storageOk = true;

  try {
    var raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') state = raw;
  } catch (e) { storageOk = false; }

  function save() {
    if (!storageOk) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOk = false; note(); }
  }

  var $ = function (id) { return document.getElementById(id); };

  function note() {
    var el = $('storenote');
    if (!el) return;
    el.className = storageOk ? 'localnote' : 'localnote warn';
    el.innerHTML = storageOk
      ? 'Đây là <b>bản xem trước ở máy</b>: tick lưu trong browser này, không đồng bộ với team. ' +
        'Muốn cả team tick chung thì upload file này lên hub.'
      : '<b>Browser không cho ghi localStorage</b> (hay gặp khi mở file bằng Safari qua ' +
        '<code>file://</code>) — tick vẫn dùng được nhưng mất khi tải lại trang.';
  }

  var IDS = [];
  SECTIONS.forEach(function (s) { s.items.forEach(function (i) { IDS.push(i.id); }); });

  function paint() {
    var done = 0;
    SECTIONS.forEach(function (s) {
      var d = 0;
      s.items.forEach(function (i) { if (state[i.id]) d++; });
      done += d;
      var c = document.querySelector('[data-sec="' + s.id + '"]');
      if (c) c.textContent = d + '/' + s.items.length;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (el) {
      var on = !!state[el.getAttribute('data-id')];
      el.classList.toggle('done', on);
      var box = el.querySelector('input[type=checkbox]');
      if (box && box.checked !== on) box.checked = on;
    });
    var pct = IDS.length ? Math.round(done / IDS.length * 100) : 0;
    $('progtxt').textContent = done + ' / ' + IDS.length + ' hạng mục';
    $('progpct').textContent = pct + '%';
    $('progbar').style.width = pct + '%';
    filter();
  }

  var cur = 'all';
  function filter() {
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (el) {
      var show = cur === 'all' ? true
        : cur === 'todo' ? !state[el.getAttribute('data-id')]
          : el.getAttribute('data-p') === cur;
      el.classList.toggle('hidden', !show);
    });
    Array.prototype.forEach.call(document.querySelectorAll('section'), function (s) {
      var any = Array.prototype.some.call(s.querySelectorAll('.item'), function (i) {
        return !i.classList.contains('hidden');
      });
      s.classList.toggle('hidden', !any);
    });
  }

  $('scores').innerHTML = buildScores(SCORES);
  $('content').innerHTML = buildHtml(SECTIONS);

  var bar = $('filters');
  var tools = bar.querySelector('.tools');
  function addBtn(f, label, on) {
    var b = document.createElement('button');
    b.setAttribute('data-f', f);
    b.textContent = label;
    if (on) b.className = 'on';
    bar.insertBefore(b, tools);
  }
  addBtn('all', 'Tất cả', true);
  SECTIONS.forEach(function (s) { addBtn(s.id, s.title.length > 22 ? s.id : s.title); });
  addBtn('todo', 'Chưa xong');

  $('content').addEventListener('click', function (ev) {
    var item = ev.target.closest ? ev.target.closest('.item') : null;
    if (!item) return;
    if (ev.target.type === 'checkbox') {
      var id = item.getAttribute('data-id');
      if (ev.target.checked) state[id] = 1; else delete state[id];
      save();
      paint();
      return;
    }
    if (ev.target.closest('.row')) item.classList.toggle('open');
  });

  bar.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button[data-f]') : null;
    if (!b) return;
    Array.prototype.forEach.call(bar.querySelectorAll('button[data-f]'), function (x) {
      x.classList.remove('on');
    });
    b.classList.add('on');
    cur = b.getAttribute('data-f');
    filter();
  });

  $('expandAll').onclick = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (i) { i.classList.add('open'); });
  };
  $('collapseAll').onclick = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (i) { i.classList.remove('open'); });
  };
  $('reset').onclick = function () {
    if (!confirm('Bỏ tick toàn bộ ở bản xem trước này?')) return;
    state = {};
    save();
    paint();
  };

  note();
  paint();
})();
