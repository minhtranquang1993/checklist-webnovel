/* ============================================================
   sanitize.js — lọc HTML do người dùng upload
   ------------------------------------------------------------
   Nội dung checklist dạng `def` được upload từ trang hub và **chèn vào trang của
   cả team** qua innerHTML (phần `note` của nhóm và `b` của hạng mục). Trang là
   public, ai có link cũng upload được, nên nội dung đó là DỮ LIỆU KHÔNG TIN ĐƯỢC:
   một file nhét `<script>` vào là chạy được JS trên máy mọi người, đọc được
   localStorage và anon key.

   Cách lọc: parse bằng DOMParser (không phải regex — regex trên HTML luôn có
   đường lách), rồi đi hết cây và áp whitelist:
     - Thẻ trong DROP_TAGS  → xoá cả thẻ lẫn nội dung.
     - Thẻ ngoài SAFE_TAGS  → bỏ thẻ, GIỮ nội dung (unwrap), để không mất chữ.
     - Thẻ trong SAFE_TAGS  → giữ, nhưng chỉ còn các attribute được phép.
   DOMParser tạo document rời, không gắn vào trang, nên `<img onerror>` trong đó
   không chạy và không có request nào được gửi.

   Chỉ dùng cho checklist dạng `def`. Các file .html trong repo (như
   webnovel-vn.html) vẫn render thô như trước — nội dung của chúng do repo quyết
   định, mà repo thì chỉ người có quyền push mới sửa được.
   ============================================================ */
'use strict';

/* Xoá cả nội dung: những thẻ này không có gì đáng giữ, và giữ chữ bên trong
   `<style>` hay `<title>` thì ra rác. */
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'noscript', 'template',
  'svg', 'math', 'link', 'meta', 'base', 'title', 'head',
  'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'fieldset',
  'audio', 'video', 'source', 'track', 'canvas', 'map', 'area',
  'frame', 'frameset', 'portal', 'dialog',
]);

/* Giữ nguyên thẻ. Đủ để viết hướng dẫn: nhấn mạnh, code, bảng, danh sách, callout.
   Cố tình KHÔNG có h1/h2/h3 (trùng cấp với tiêu đề trang) và img (không cần cho
   checklist, mà lại là đường gửi request ra ngoài). Thẻ nào không có ở đây thì bị
   bỏ thẻ nhưng chữ vẫn còn. */
const SAFE_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'code', 'pre', 'kbd', 'samp', 'var',
  'br', 'hr', 'p', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'div', 'span', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'a',
]);

/* Chỉ nhận link http/https/mailto và anchor trong trang.
   `javascript:`, `data:`, `vbscript:`, `blob:` đều bị loại.

   Ký tự điều khiển bị cắt trước khi so: `java\tscript:alert(1)` là một URL hợp lệ
   với browser nhưng không khớp regex nếu để nguyên tab. Entity (`&#106;avascript:`)
   không phải lo — DOMParser đã giải mã xong trước khi hàm này thấy giá trị. */
function safeHref(value) {
  const v = String(value == null ? '' : value).replace(/[\u0000-\u0020\u007f-\u009f]/g, '').trim();
  if (!v) return '';
  return /^(?:https?:\/\/|mailto:|#)/i.test(v) ? v : '';
}

/* Class được giữ vì style của trang dựa vào nó (`callout good`, `bad`, `t-p0`).
   Chỉ nhận token dạng tên class thường — không nhận ngoặc, dấu cách lạ, ký tự lạ.
   Xấu nhất là ai đó dùng class có sẵn làm layout lệch: chuyện thẩm mỹ, không phải
   chuyện an toàn. */
function safeClass(value) {
  return String(value == null ? '' : value)
    .split(/\s+/)
    .filter(t => /^[a-z][a-z0-9_-]{0,29}$/i.test(t))
    .slice(0, 6)
    .join(' ');
}

const SPAN_ATTR_RE = /^\d{1,2}$/;

function scrubAttrs(el, tag) {
  /* Copy danh sách trước: removeAttribute làm NamedNodeMap co lại ngay giữa vòng lặp,
     đi trực tiếp trên nó sẽ bỏ sót attribute. */
  Array.prototype.slice.call(el.attributes).forEach(attr => {
    const name = String(attr.name).toLowerCase();

    if (name === 'class') {
      const cls = safeClass(attr.value);
      if (cls) el.setAttribute('class', cls);
      else el.removeAttribute(attr.name);
      return;
    }
    if ((name === 'colspan' || name === 'rowspan') && (tag === 'td' || tag === 'th')) {
      if (!SPAN_ATTR_RE.test(String(attr.value).trim())) el.removeAttribute(attr.name);
      return;
    }
    if (name === 'href' && tag === 'a') {
      const href = safeHref(attr.value);
      if (href) el.setAttribute('href', href);
      else el.removeAttribute(attr.name);
      return;
    }
    /* Còn lại bỏ hết: mọi `on*`, `style`, `srcdoc`, `data-*`, `id`, `target`… */
    el.removeAttribute(attr.name);
  });

  /* Link ra ngoài mở tab mới, và `noopener` để trang đích không với được
     `window.opener` của trang mình. */
  if (tag === 'a' && el.getAttribute('href')) {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  }
}

function unwrap(node) {
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  parent.removeChild(node);
}

function walk(parent) {
  /* Snapshot: unwrap chèn thêm node vào parent ngay giữa vòng lặp. Đi theo bản
     copy thì mỗi node gốc vẫn được xử lý đúng một lần, và node vừa được nâng lên
     đã sạch rồi (đã walk trước khi unwrap). */
  Array.prototype.slice.call(parent.childNodes).forEach(node => {
    if (node.nodeType === 3) return;                                  // text: giữ
    if (node.nodeType !== 1) {                                        // comment, PI…
      if (node.parentNode) node.parentNode.removeChild(node);
      return;
    }
    const tag = String(node.localName || node.nodeName).toLowerCase();
    if (DROP_TAGS.has(tag)) {
      if (node.parentNode) node.parentNode.removeChild(node);
      return;
    }
    walk(node);                                                        // vào trong trước
    if (!SAFE_TAGS.has(tag)) { unwrap(node); return; }
    scrubAttrs(node, tag);
  });
}

function sanitizeHtml(html) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
  if (typeof DOMParser === 'undefined') {
    /* Không có DOMParser thì KHÔNG đoán — trả về chữ trần. Thà mất định dạng
       còn hơn chèn HTML chưa lọc. */
    return src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  const doc = new DOMParser().parseFromString(src, 'text/html');
  if (!doc || !doc.body) return '';
  walk(doc.body);
  return doc.body.innerHTML;
}

/* Chạy được cả trong browser (script thẻ) và trong node (test). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitizeHtml, safeHref, safeClass, SAFE_TAGS, DROP_TAGS };
}
