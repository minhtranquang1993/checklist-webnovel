/* ============================================================
   parse-def.js — bóc dữ liệu checklist từ file HTML người dùng chọn
   ------------------------------------------------------------
   Hai dạng file được nhận, thử theo thứ tự đó:

   1. File khai dữ liệu — theo khuôn của webnovel-vn.html: một thẻ <script> inline khai
      `const SCORES` và `const SECTIONS` (và có thể cả `const CHECKLIST_ID`). Đó là
      **JS literal**, không phải JSON — key không có ngoặc kép, `b:` dùng backtick
      nhiều dòng. Viết parser tay cho thứ đó thì giòn, nên thay vì đoán, ta cho chính
      browser chạy nó trong iframe sandbox.

   2. File viết tay — hạng mục nằm ngay trong HTML: mỗi hạng mục là một ô
      `<input type="checkbox">` kèm tiêu đề, nhóm là `<section>` hoặc heading đứng
      trước. Không có mảng dữ liệu nào để chạy, nên đường này đọc CẤU TRÚC trong một
      `<template>` inert — xem parseDomChecklist().

   `CHECKLIST_ID` là tuỳ chọn ở cả hai dạng: nhiều file checklist bản cũ (chạy độc lập,
   lưu tick trong localStorage) không có nó, nên trang hub suy mã từ tên file rồi cho
   người dùng sửa. Mã đó là khoá gắn tick trong DB, nên chỉ cần nó ĐÚNG và ỔN ĐỊNH,
   không cần phải nằm trong file.

   Đường 1 chạy ở đâu: <iframe sandbox="allow-scripts">, KHÔNG có allow-same-origin.
   Nghĩa là script chạy trong một origin mờ (opaque):
     - không đọc được DOM của trang hub,
     - không đọc được localStorage → không thấy anon key, không thấy tên nhân viên,
     - không điều hướng được tab, không mở popup.
   Nó chỉ có một đường ra duy nhất: postMessage. Kết quả nhận về được xác thực bằng
   `event.source === iframe.contentWindow` — origin của sandbox là chuỗi "null" nên
   không dùng để so được.

   Chỉ nhét phần script INLINE khai SECTIONS vào srcdoc — không nạp `<script src>`
   nào, nên file có trỏ tới assets/sync.js hay CDN gì cũng không chạy.

   Sau khi bóc xong, cả hai đường đi qua đúng một validateDef(): nó kiểm cấu trúc và
   sanitize toàn bộ HTML. Hàm đó thuần logic, không cần DOM, nên test được bằng node.
   ============================================================ */
'use strict';

/* sanitize.js khai `sanitizeHtml` ra phạm vi global khi nạp bằng thẻ <script>;
   trong node (test) thì require. Giữ một chỗ duy nhất để hai môi trường không
   lệch nhau, và để `validateDef` gọi được ở cả hai. Nạp sanitize.js TRƯỚC file này.

   Đọc qua `globalThis.` chứ không phải `typeof sanitizeHtml`: nếu ở đâu đó có một
   khai báo `const sanitizeHtml` cùng phạm vi global mà chưa chạy tới (TDZ), thì
   `typeof` NÉM ReferenceError, còn truy cập thuộc tính thì chỉ trả về undefined. */
const clean = typeof globalThis.sanitizeHtml === 'function'
  ? globalThis.sanitizeHtml
  : require('./sanitize.js').sanitizeHtml;

const DEF_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TAG_RE = /^[a-z][a-z0-9-]{0,29}$/;

/* Giới hạn để một file lỗi không làm trang treo hoặc DB từ chối sau khi đã chờ lâu.
   Khớp với constraint checklist_defs_shape trong schema.sql. */
const LIMITS = {
  sections: 200,
  items: 5000,
  title: 300,
  note: 20000,
  body: 200000,
  total: 800000,      // tổng độ dài sections sau khi JSON hoá
};

const str = v => (v == null ? '' : String(v));
const cut = (v, n) => str(v).slice(0, n);

/* ---------- bóc giá trị bằng iframe sandbox ---------- */
/* Lấy nội dung thẻ <script> inline có khai SECTIONS. Cố tình KHÔNG dùng DOMParser
   ở đây: chỉ cần đúng một khối script, và cắt bằng chỉ số thì không có đường nào để
   `<script src>` của file lọt vào srcdoc.

   Bắt theo SECTIONS, không theo CHECKLIST_ID: file checklist bản cũ không có
   CHECKLIST_ID, mà SECTIONS thì file nào cũng phải có. */
function extractInlineScript(html) {
  const re = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/(?:const|let|var)\s+SECTIONS\s*=/.test(m[1])) return m[1];
  }
  return '';
}

/* Suy mã checklist từ tên file, dùng khi file không khai CHECKLIST_ID.
   "webnovel-ngon-tinh-checklist.html" → "webnovel-ngon-tinh-checklist"

   Trả về rỗng nếu không còn ký tự nào hợp lệ (tên file toàn tiếng Việt có dấu) —
   lúc đó giao diện bắt người dùng tự nhập, chứ không đoán bừa một mã vô nghĩa. */
function slugFromFilename(name) {
  const base = str(name).replace(/\.html?$/i, '').toLowerCase();
  const slug = base
    .replace(/[^a-z0-9]+/g, '-')      // ký tự lạ và dấu → gạch ngang
    .replace(/-+/g, '-')              // gộp gạch liên tiếp
    .replace(/^-+|-+$/g, '')          // cắt gạch hai đầu
    .slice(0, 40)
    .replace(/-+$/, '');              // cắt lần nữa: slice có thể để lại gạch cuối
  /* DEF_ID_RE bắt buộc ký tự đầu là chữ-số. Tên file kiểu "-abc" đã bị cắt ở trên,
     nhưng kiểm lại cho chắc thay vì trả về một mã mà validateDef sẽ từ chối. */
  return DEF_ID_RE.test(slug) ? slug : '';
}

function runInSandbox(code, timeoutMs) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';

    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      err ? reject(err) : resolve(val);
    };

    const onMsg = ev => {
      /* Origin của sandbox là chuỗi "null", không định danh được ai — nên xác thực
         bằng chính window đã tạo. Message từ tab/extension khác bị bỏ qua. */
      if (!iframe.contentWindow || ev.source !== iframe.contentWindow) return;
      const d = ev.data;
      if (!d || d.__def !== 1) return;
      if (d.error) return finish(new Error(cut(d.error, 300)));
      try {
        finish(null, JSON.parse(d.json));
      } catch {
        finish(new Error('không đọc được dữ liệu trả về từ file'));
      }
    };

    const timer = setTimeout(
      () => finish(new Error('file mất quá lâu để đọc (>5s) — có vòng lặp vô hạn trong script?')),
      timeoutMs
    );

    /* Script của file chạy TRƯỚC, rồi script của mình đọc biến ra. Dùng typeof cho
       cả CHECKLIST_ID và SCORES: file bản cũ không có CHECKLIST_ID, file nào không có
       bảng điểm thì thiếu SCORES — cả hai đều không phải lý do để bỏ cả file.
       SECTIONS thì bắt buộc: không có nó thì không có gì để hiển thị.

       Vì sao đọc được dữ liệu dù script của file NÉM giữa đường: hai thẻ <script>
       classic dùng chung global lexical environment, nên `const` nào đã khởi tạo
       xong vẫn còn dùng được ở thẻ sau. Đây không phải chuyện lý thuyết — file
       checklist bản cũ đọc `localStorage` ở cuối script, mà trong sandbox origin mờ
       thì thao tác đó ném SecurityError. Nhờ cách này, `SECTIONS` khai ở trên vẫn
       bóc ra được.

       `typeof` chứ không phải truy cập trực tiếp là có lý do: nếu file ném TRƯỚC
       khi khai xong `SECTIONS` thì biến còn trong TDZ, và lúc đó `typeof` cũng ném
       ReferenceError. Nên bọc cả khối trong try/catch — người dùng nhận được lý do
       thật ("SECTIONS is not defined") thay vì trang đứng im rồi timeout 5s. */
    const reporter =
      'try{' +
      'if(typeof SECTIONS==="undefined")throw new Error("file không khai const SECTIONS");' +
      'parent.postMessage({__def:1,json:JSON.stringify({' +
      'id:(typeof CHECKLIST_ID!=="undefined"?CHECKLIST_ID:null),' +
      'scores:(typeof SCORES!=="undefined"?SCORES:[]),' +
      'sections:SECTIONS,' +
      'title:(document.title||"")' +
      '})},"*");' +
      '}catch(e){parent.postMessage({__def:1,error:String(e&&e.message||e)},"*");}';

    window.addEventListener('message', onMsg);
    /* srcdoc, không phải src: iframe không load URL nào, không có request ra mạng. */
    iframe.setAttribute(
      'srcdoc',
      '<!DOCTYPE html><meta charset="utf-8"><title></title>' +
      '<script>' + code + '<\/script>' +
      '<script>' + reporter + '<\/script>'
    );
    document.body.appendChild(iframe);
  });
}

/* ---------- bóc từ cấu trúc HTML (file không khai SECTIONS) ---------- */
/* Không phải file checklist nào cũng khai `const SECTIONS`. Một file viết tay hoàn
   toàn hợp lý: mỗi hạng mục là một `<details>` chứa `<input type="checkbox">`, nhóm là
   `<section>` có `<h2>`, và script trong file chỉ lưu tick vào localStorage. Không có
   mảng dữ liệu nào để đọc, nhưng CẤU TRÚC thì có — đủ để suy ra đúng thứ mà SECTIONS
   chứa. Đường này chỉ chạy khi không tìm thấy SECTIONS, nên file dạng cũ đi nguyên
   đường cũ, không đổi một hành vi nào.

   Parse vào `<template>`, không phải iframe `srcdoc` như đường 1: ở đây không cần chạy
   JS nào của file, mà nhét cả file vào `srcdoc` thì kéo theo `<script src>`, ảnh, CDN —
   tức là request ra ngoài. Nội dung của `<template>` là **inert** ở tầng API: nó thuộc
   một "template contents owner document" không có browsing context, nên script không
   chạy và `<img>`/`<iframe>`/`<link>` KHÔNG tải. Cũng không dùng DOMParser cho việc
   này: document của nó cũng rời, nhưng tính chất "không fetch" ở đó phải suy từ điều
   kiện "fully active" thay vì được nói thẳng, mà đây là chỗ nhận cả file lạ.

   Vẫn kiểm tay một lần trên browser (mục "Kiểm tay phần upload" trong README, bước 11):
   dom-shim không chứng minh được chuyện request.

   Chỉ dùng phần API mà tools/test/dom-shim.js cũng có (nodeType, childNodes,
   localName, getAttribute, innerHTML) — KHÔNG querySelector, KHÔNG textContent — để
   cùng một hàm chạy được ở browser và test được bằng node. */

const ITEM_BOX = new Set(['details', 'li', 'tr', 'article', 'fieldset']);
const GRP_BOX = new Set(['section', 'article', 'main', 'fieldset']);
const HEADING = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const NO_TEXT = new Set(['script', 'style', 'template', 'noscript',
  'button', 'select', 'option', 'textarea']);   // nút/điều khiển cạnh ô tick không phải tiêu đề
const PILL_CLS = /^(pill|tag|chip|badge|label)$/;
const ITEM_CLS = /^(item|task|todo)(-.*)?$/;
const GRP_CLS = /^(grp|group|sect|section)(-.*)?$/;
const NOTE_CLS = /^(note|secnote|desc|intro)(-.*)?$/;
const BODY_CLS = /^(body|detail|details|content)(-.*)?$/;
const MAX_UP = 8;          // đi lên xa hơn thì có nguy cơ gộp cả trang thành một hạng mục

const NOT_CHECKLIST =
  'Không bóc được hạng mục nào: file không có thẻ <script> khai `const SECTIONS`, cũng không ' +
  'có ô <input type="checkbox"> nào. Đây có phải file checklist không? (Cần một trong hai: ' +
  'script khai `const SECTIONS`, hoặc mỗi hạng mục là một ô checkbox có tiêu đề.)';

const isEl = n => !!n && n.nodeType === 1;
const attrOf = (el, n) => (isEl(el) && el.getAttribute ? str(el.getAttribute(n)) : '');
const clsOf = el => attrOf(el, 'class').toLowerCase().split(/\s+/).filter(Boolean);
const clsHit = (el, re) => clsOf(el).some(c => re.test(c));
const isCheckbox = el =>
  el.localName === 'input' && attrOf(el, 'type').trim().toLowerCase() === 'checkbox';

/* Chữ của một nhánh, bỏ qua những nhánh trong `skip` — chip số hiệu và ô effort nằm
   trong tiêu đề nhưng không thuộc tiêu đề. */
function textOf(node, skip) {
  let out = '';
  (function go(n) {
    if (!n) return;
    if (n.nodeType === 3) { out += str(n.data); return; }
    if (!isEl(n) || NO_TEXT.has(n.localName) || (skip && skip.has(n))) return;
    (n.childNodes || []).forEach(go);
  })(node);
  return out.replace(/\s+/g, ' ').trim();
}

/* DFS theo đúng thứ tự tài liệu, trả về element đầu tiên khớp `pred`. `stop` chặn
   không cho đi vào một nhánh (dùng để không lấy `<h4>` trong phần hướng dẫn của hạng
   mục làm tiêu đề nhóm). */
function findEl(root, pred, stop) {
  let hit = null;
  (function go(n) {
    (n.childNodes || []).forEach(c => {
      if (hit || !isEl(c) || (stop && stop(c))) return;
      if (pred(c)) { hit = c; return; }
      go(c);
    });
  })(root);
  return hit;
}

function ancestors(el) {
  const out = [];
  let n = el.parentNode;
  for (let i = 0; isEl(n) && i < MAX_UP; i++, n = n.parentNode) out.push(n);
  return out;
}

/* Id hạng mục là KHOÁ GẮN TICK trong DB nên nó phải ổn định giữa hai lần upload. Thứ
   tự ưu tiên: `data-id` → `id` của ô checkbox → chip số hiệu trong tiêu đề
   (`<span class="id">P0-1</span>`) → hash của tiêu đề.

   Vì sao hash tiêu đề chứ không phải vị trí ("hạng mục thứ 3"): chèn một dòng vào giữa
   file rồi upload lại thì mọi id sau đó trượt một bước và tick nhảy sang hạng mục
   khác — sai âm thầm, không ai thấy. Hash thì chỉ hạng mục bị sửa chữ mới mất tick, và
   mất đúng chỗ. */
function normId(v) {
  const s = str(v).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return DEF_ID_RE.test(s) ? s : '';
}

function hashId(text) {
  let h = 5381;
  const s = str(text);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'it-' + h.toString(36);
}

/* Chip màu của nhóm: CSS của trang dùng `.t-p0`, `.t-geo`… nên class phụ của pill
   (`class="pill p0"` → `p0`) được đổi thành `t-p0`. Class nào không có trong CSS thì
   chip vẫn đọc được — `.tag` có màu nền mặc định. */
function tagFromPill(pill) {
  if (!pill) return '';
  const mod = clsOf(pill).find(c => !PILL_CLS.test(c));
  if (!mod) return '';
  const t = /^t-/.test(mod) ? mod : 't-' + mod;
  return TAG_RE.test(t) ? t : '';
}

/* Ô checkbox không có thẻ bọc riêng (`<input> Việc A<br><input> Việc B`): tiêu đề là
   phần chữ đứng ngay sau nó, dừng ở ô checkbox kế tiếp. */
function textAfter(cb) {
  const p = cb.parentNode;
  if (!isEl(p)) return '';
  const sib = p.childNodes || [];
  const parts = [];
  for (let k = Array.prototype.indexOf.call(sib, cb) + 1; k > 0 && k < sib.length; k++) {
    const n = sib[k];
    if (isEl(n) && (isCheckbox(n) || findEl(n, isCheckbox))) break;
    parts.push(textOf(n));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/* Nhóm suy theo heading (file không bọc `<section>`): phần dẫn của nhóm, nếu có, là
   thẻ ngay sau heading. childNodes ở browser là NodeList nên gọi indexOf qua Array. */
function nextNote(head) {
  if (!head || !isEl(head.parentNode)) return null;
  const sib = head.parentNode.childNodes || [];
  for (let k = Array.prototype.indexOf.call(sib, head) + 1; k > 0 && k < sib.length; k++) {
    if (!isEl(sib[k])) continue;
    return clsHit(sib[k], NOTE_CLS) ? sib[k] : null;
  }
  return null;
}

/* `<title>` lấy bằng regex chứ không qua DOM: thuật toán fragment của `<template>` bỏ
   `<head>` (nên không thấy thẻ `<title>` thật), còn dom-shim thì không giải mã entity
   trong thẻ raw-text. Giải mã vài entity hay gặp là đủ cho một cái tên. */
const ENT_MIN = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ',
};
const unent = s => str(s).replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi,
  m => ENT_MIN[m.toLowerCase()] || m);

/* Cây inert để đi: nội dung `<template>` không render, không chạy script, không tải
   subresource — nó nằm trong một document không có browsing context. Template không cần
   gắn vào trang; `innerHTML` của nó parse bằng thuật toán fragment nên các thẻ
   `<html>/<head>/<body>` của file bị bỏ, còn nội dung bên trong thì giữ nguyên. Walker
   bên dưới đi hết cây bằng childNodes nên không phụ thuộc vào chuyện đó. */
function inertTree(html) {
  const doc = typeof document !== 'undefined' ? document : null;
  const tpl = doc && doc.createElement ? doc.createElement('template') : null;
  if (!tpl || !('content' in tpl)) {
    throw new Error('Môi trường này không hỗ trợ <template> nên không đọc được checklist dạng HTML.');
  }
  tpl.innerHTML = html;
  return tpl.content;
}

/* Trả về { raw, warnings }. `raw` cùng hình dạng với thứ iframe sandbox trả về ở đường
   1, để cả hai đường đi qua đúng một validateDef — chỗ duy nhất lọc HTML. */
function parseDomChecklist(html) {
  const src = str(html);
  const root = inertTree(src);
  if (!root) throw new Error('Không đọc được HTML của file.');

  /* Một lượt DFS lấy cả heading lẫn ô checkbox theo đúng thứ tự tài liệu: file không
     bọc `<section>` thì nhóm được suy theo heading đứng trước hạng mục. */
  const flow = [];
  (function go(n) {
    (n.childNodes || []).forEach(c => {
      if (!isEl(c)) return;
      if (HEADING.has(c.localName)) flow.push({ el: c, head: true });
      else if (isCheckbox(c)) flow.push({ el: c, head: false });
      go(c);
    });
  })(root);

  const cbs = flow.filter(f => !f.head).map(f => f.el);
  if (!cbs.length) throw new Error(NOT_CHECKLIST);

  /* Thẻ bọc chứa hai ô checkbox thì không phải "một hạng mục" — đếm trước để biết đi
     lên tới đâu thì phải dừng. */
  const share = new Map();
  cbs.forEach(cb => ancestors(cb).forEach(a => share.set(a, (share.get(a) || 0) + 1)));

  const boxes = new Map();
  cbs.forEach(cb => {
    const up = ancestors(cb);
    /* Thẻ bọc phải là của RIÊNG ô này. `share !== 1` nghĩa là nó bọc nhiều ô — lấy nó
       thì hai hạng mục dính thành một, nên coi như ô trần và đọc chữ đứng sau. */
    if (!up.length || share.get(up[0]) !== 1) return;
    let box = up[0];
    for (let i = 0; i < up.length && share.get(up[i]) === 1; i++) {
      if (ITEM_BOX.has(up[i].localName) || clsHit(up[i], ITEM_CLS)) { box = up[i]; break; }
    }
    boxes.set(cb, box);
  });
  const isItemBox = new Set(boxes.values());
  const stopAtItem = el => isItemBox.has(el);
  const insideItem = el => ancestors(el).some(a => isItemBox.has(a));

  const warnings = ['Đọc theo cấu trúc HTML vì file không khai `const SECTIONS` — ' +
    'kiểm lại số nhóm và số hạng mục bên dưới trước khi upload.'];

  /* Id trùng thì thêm hậu tố thay vì ném: hai hạng mục cùng id nghĩa là tick của chúng
     ghi chồng lên nhau, mà file viết tay rất dễ lặp một dòng. */
  const used = new Set();
  const uniq = base => {
    let id = base;
    for (let n = 2; used.has(id); n++) {
      const tail = '-' + n;
      id = base.slice(0, 40 - tail.length) + tail;
    }
    used.add(id);
    return id;
  };

  let noId = 0, noTitle = 0, dup = 0;
  const groups = new Map();
  let lastHead = null;

  flow.forEach(f => {
    if (f.head) {
      /* `<h4>Sửa thành</h4>` trong phần hướng dẫn của một hạng mục không phải tiêu đề
         nhóm — chỉ heading nằm ngoài mọi thẻ bọc hạng mục mới tính. */
      if (!insideItem(f.el)) lastHead = f.el;
      return;
    }
    const box = boxes.get(f.el) || null;      // null = ô trần, không có thẻ bọc riêng

    const bodyEl = box ? findEl(box, el => clsHit(el, BODY_CLS), stopAtItem) : null;
    const stopHere = el => isItemBox.has(el) || el === bodyEl;

    const titleEl = box
      ? (findEl(box,
          el => el.localName === 'summary' || el.localName === 'label' || clsHit(el, /^(ttl|title)(-.*)?$/),
          stopHere) || box)
      : null;
    const chip = titleEl ? findEl(titleEl, el => clsHit(el, /^(id|num|no|code)(-.*)?$/), stopHere) : null;
    const effEl = box ? findEl(box, el => clsHit(el, /^(effort|eff|est|time)(-.*)?$/), stopHere) : null;
    const whyEl = box ? findEl(box, el => clsHit(el, /^(why|status|state)(-.*)?$/), stopHere) : null;

    const t = titleEl
      ? textOf(titleEl, new Set([chip, effEl, whyEl, bodyEl].filter(Boolean)))
      : textAfter(f.el);
    if (!t) { noTitle++; return; }     // ô "chọn tất cả", ô trong form… — bỏ, không chặn cả file

    const want = normId(attrOf(f.el, 'data-id')) || normId(attrOf(f.el, 'id')) ||
      normId(attrOf(box, 'data-id')) || normId(chip ? textOf(chip) : '');
    if (!want) noId++;
    /* Đếm trùng theo id gốc, kể cả id suy từ tiêu đề: hai hạng mục cùng tiêu đề cho ra
       cùng một hash, và đó đúng là lúc cần cảnh báo nhất. */
    const base = want || hashId(t);
    const id = uniq(base);
    if (id !== base) dup++;

    /* Không có `.body` mà cũng không phải `<details>` thì để trống: đoán phần thân từ
       innerHTML của cả thẻ bọc chỉ nhân đôi tiêu đề. */
    const b = bodyEl ? str(bodyEl.innerHTML)
      : box && box.localName === 'details'
        ? str(box.innerHTML).replace(/<summary\b[\s\S]*?<\/summary\s*>/i, '')
        : '';

    const grp = ancestors(box || f.el)
      .find(a => GRP_BOX.has(a.localName) || clsHit(a, GRP_CLS)) || null;
    const key = grp || lastHead || root;
    if (!groups.has(key)) groups.set(key, { box: grp, head: grp ? null : lastHead, items: [] });
    groups.get(key).items.push({
      id,
      t,
      e: effEl ? textOf(effEl) : attrOf(box, 'data-e'),
      w: whyEl ? textOf(whyEl) : attrOf(box, 'data-w'),
      b,
    });
  });

  if (!groups.size) {
    throw new Error(
      `Có ${cbs.length} ô checkbox nhưng không ô nào có tiêu đề đọc được — mỗi hạng mục cần ` +
      'chữ nằm cạnh ô checkbox (trong `<summary>`, `<label>`, hoặc chính thẻ bọc hạng mục).'
    );
  }

  const sections = [];
  groups.forEach(g => {
    const n = sections.length + 1;
    const head = g.head ||
      (g.box ? findEl(g.box, el => HEADING.has(el.localName), stopAtItem) : null);
    const pill = head ? findEl(head, el => clsHit(el, PILL_CLS)) : null;
    /* Pill dài thì không phải mã nhóm, chỉ là một cái nhãn — bỏ, để mã suy từ tiêu đề. */
    const pillText = pill ? textOf(pill) : '';
    const sid = pillText && pillText.length <= 12 ? pillText : '';
    const title = head ? textOf(head, pill ? new Set([pill]) : null) : '';
    const noteEl = g.box ? findEl(g.box, el => clsHit(el, NOTE_CLS), stopAtItem) : nextNote(head);

    sections.push({
      id: sid || normId(title) || ('nhom-' + n),
      tag: tagFromPill(pill),
      title: title || sid || ('Nhóm ' + n),
      note: noteEl ? str(noteEl.innerHTML) : '',
      items: g.items,
    });
  });

  if (noId) {
    warnings.push(
      `${noId} hạng mục không khai \`data-id\` trên ô checkbox — id suy từ tiêu đề. Sửa tiêu đề ` +
      'về sau là mất tick của đúng hạng mục đó; thêm `data-id` vào ô checkbox thì chắc hơn.'
    );
  }
  if (dup) warnings.push(`${dup} id bị trùng — đã thêm hậu tố để tick không ghi chồng lên nhau.`);
  if (noTitle) {
    warnings.push(`Bỏ ${noTitle} ô checkbox không có tiêu đề (nút chọn tất cả, ô trong form…).`);
  }

  const tt = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src);
  const h1 = findEl(root, el => el.localName === 'h1', stopAtItem);
  const subEl = findEl(root, el => clsHit(el, /^(sub|subtitle|tagline|lede)(-.*)?$/), stopAtItem);

  return {
    raw: {
      id: null,                       // file dạng này không khai mã — hub suy từ tên file
      scores: [],
      sections,
      title: tt ? unent(tt[1]).replace(/\s+/g, ' ').trim() : (h1 ? textOf(h1) : ''),
      sub: subEl ? textOf(subEl) : '',
    },
    warnings,
  };
}

/* ---------- kiểm cấu trúc + lọc HTML ---------- */
/* Trả về { def, warnings } hoặc ném Error với thông báo đọc được bằng tiếng Việt.
   Mọi HTML đi qua sanitizeHtml — kể cả `note` của nhóm, chỗ dễ bị bỏ sót nhất.

   `idFromFile` chỉ đổi câu THÔNG BÁO LỖI, không đổi luật: mã suy từ tên file thì
   bảo người dùng sửa ô mã, mã lấy từ file thì bảo sửa file. Nói sai chỗ cần sửa là
   cách nhanh nhất để người dùng loay hoay. */
function validateDef(raw, idFromFile) {
  if (!raw || typeof raw !== 'object') throw new Error('dữ liệu rỗng');

  const id = str(raw.id).trim();
  if (!DEF_ID_RE.test(id)) {
    const where = idFromFile === false
      ? 'Sửa ô "Mã checklist"'
      : `Sửa \`const CHECKLIST_ID\` trong file`;
    throw new Error(
      (id ? `Mã checklist "${cut(id, 60)}" sai định dạng` : 'Chưa có mã checklist') +
      ` — chỉ chữ thường, số, gạch ngang, tối đa 40 ký tự. ${where}.`
    );
  }

  const sections = Array.isArray(raw.sections) ? raw.sections : null;
  if (!sections || !sections.length) throw new Error('SECTIONS phải là mảng và không được rỗng.');
  if (sections.length > LIMITS.sections) {
    throw new Error(`Quá nhiều nhóm (${sections.length}) — tối đa ${LIMITS.sections}.`);
  }

  const warnings = [];
  const seen = new Set();
  const outSections = [];

  sections.forEach((s, si) => {
    const where = `nhóm thứ ${si + 1}`;
    if (!s || typeof s !== 'object') throw new Error(`${where} không phải một object.`);

    const sid = str(s.id).trim();
    if (!sid) throw new Error(`${where} thiếu \`id\`.`);
    /* Section id đi vào data-p và vào nút filter, không vào DB, nên chỉ cần cắt độ dài. */
    const tag = TAG_RE.test(str(s.tag).trim()) ? str(s.tag).trim() : '';
    if (s.tag && !tag) warnings.push(`${where}: bỏ \`tag\` không hợp lệ ("${cut(s.tag, 30)}").`);

    const items = Array.isArray(s.items) ? s.items : null;
    if (!items || !items.length) throw new Error(`Nhóm "${cut(sid, 40)}" không có hạng mục nào.`);

    const outItems = items.map((it, ii) => {
      const iw = `hạng mục thứ ${ii + 1} của nhóm "${cut(sid, 40)}"`;
      if (!it || typeof it !== 'object') throw new Error(`${iw} không phải một object.`);

      const iid = str(it.id).trim();
      if (!DEF_ID_RE.test(iid)) {
        throw new Error(
          `${iw} có id='${cut(iid, 60)}' sai định dạng — chỉ chữ thường, số, gạch ngang, ` +
          'tối đa 40 ký tự (DB sẽ từ chối tick của hạng mục này).'
        );
      }
      if (seen.has(iid)) {
        throw new Error(
          `id "${iid}" bị dùng cho hai hạng mục — tick của chúng sẽ ghi chồng lên nhau. Đổi một cái.`
        );
      }
      seen.add(iid);

      const t = cut(it.t, LIMITS.title).trim();
      if (!t) throw new Error(`${iw} (id="${iid}") thiếu tiêu đề \`t\`.`);

      return {
        id: iid,
        t,
        e: cut(it.e, 40).trim(),
        w: cut(it.w, LIMITS.title).trim(),
        b: clean(cut(it.b, LIMITS.body)),
      };
    });

    outSections.push({
      id: cut(sid, 40),
      tag,
      title: cut(s.title, LIMITS.title).trim() || cut(sid, 40),
      note: clean(cut(s.note, LIMITS.note)),
      items: outItems,
    });
  });

  if (!seen.size) throw new Error('Không tìm thấy hạng mục nào.');
  if (seen.size > LIMITS.items) {
    throw new Error(`Quá nhiều hạng mục (${seen.size}) — tối đa ${LIMITS.items}.`);
  }

  const size = JSON.stringify(outSections).length;
  if (size > LIMITS.total) {
    throw new Error(
      `Dữ liệu quá lớn (${Math.round(size / 1024)}KB) — tối đa ${Math.round(LIMITS.total / 1024)}KB. ` +
      'Cắt bớt phần hướng dẫn trong `b`.'
    );
  }

  /* SCORES là phần trang trí: méo thì bỏ và cảnh báo, không chặn cả file. */
  let scores = [];
  if (Array.isArray(raw.scores)) {
    scores = raw.scores
      .filter(row => Array.isArray(row) && row.length >= 2 && isFinite(Number(row[1])))
      .slice(0, 24)
      .map(row => [
        cut(row[0], 60),
        Math.max(0, Math.min(10, Math.round(Number(row[1])))),
        cut(row[2], 300),
      ]);
    if (scores.length !== raw.scores.length) {
      warnings.push(`Bỏ ${raw.scores.length - scores.length} dòng SCORES không đúng dạng [tên, điểm, ghi chú].`);
    }
  } else if (raw.scores != null) {
    warnings.push('SCORES không phải mảng — đã bỏ.');
  }

  return {
    def: {
      id,
      scores,
      sections: outSections,
      meta: { title: cut(raw.title, 200).trim(), sub: cut(raw.sub, 300).trim() },
      total: seen.size,
    },
    warnings,
  };
}

/* Đường dùng ở browser: text của file → def đã sạch.

   Hai dạng file được nhận, thử theo thứ tự:
     1. Có thẻ `<script>` khai `const SECTIONS` → chạy script đó trong iframe sandbox.
     2. Không có → đọc cấu trúc HTML (ô checkbox + heading) trong `<template>` inert.
   Thứ tự đó quan trọng: file dạng 1 luôn đi đường 1, nên thêm đường 2 không đổi cách
   đọc file nào đang chạy được.

   `fallbackId` là mã suy từ tên file, chỉ dùng khi file không khai CHECKLIST_ID (dạng 2
   thì không bao giờ khai). Trả về kèm `idFromFile` để giao diện biết nên cho sửa ô mã
   hay khoá nó lại: mã lấy từ file thì để read-only (file là nguồn thật), mã suy ra thì
   cho sửa. */
async function parseChecklistFile(html, fallbackId) {
  const src = str(html);
  const code = extractInlineScript(src);

  let raw, extra = [];
  if (code) {
    raw = await runInSandbox(code, 5000);
  } else {
    const dom = parseDomChecklist(src);      // ném NOT_CHECKLIST nếu cũng không có checkbox
    raw = dom.raw;
    extra = dom.warnings;
  }

  const idFromFile = !!str(raw.id).trim();
  const parsed = validateDef(
    Object.assign({}, raw, { id: idFromFile ? raw.id : str(fallbackId) }),
    idFromFile
  );
  /* Cảnh báo lúc bóc đứng TRƯỚC cảnh báo lúc kiểm: cái đầu nói file được đọc theo cách
     nào, cái sau nói dữ liệu bị cắt gì. */
  parsed.warnings = extra.concat(parsed.warnings);
  parsed.idFromFile = idFromFile;
  return parsed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateDef, extractInlineScript, slugFromFilename, parseDomChecklist, hashId,
    DEF_ID_RE, LIMITS,
  };
}
