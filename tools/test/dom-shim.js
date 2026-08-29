/* ============================================================
   dom-shim.js — DOMParser tối giản để test assets/sanitize.js bằng node
   ------------------------------------------------------------
   Repo cố tình không có dependency, mà node không có DOMParser, nên đây là bản tự
   viết vừa đủ cho những API sanitize.js dùng:
     nodeType, localName/nodeName, childNodes, firstChild, parentNode,
     attributes, getAttribute/setAttribute/removeAttribute,
     insertBefore/removeChild, innerHTML (đọc).

   GIỚI HẠN — đọc trước khi tin vào kết quả test:
   Shim này kiểm được **logic whitelist** (tag nào xoá, tag nào unwrap, attribute nào
   giữ). Nó KHÔNG mô phỏng được các mánh ở tầng parser của browser thật (`<svg><style>`,
   thẻ tự đóng lạ, `<table>` sửa cây, mã hoá entity nhiều lớp). Những thứ đó phải kiểm
   tay trên browser — xem mục Verify trong README.
   ============================================================ */
'use strict';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/* Nội dung của những thẻ này là chữ trần, không phải HTML — `<script>if(a<b)</script>`
   không được hiểu thành thẻ `<b>`. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'noscript']);

/* Thẻ tự đóng khi gặp thẻ cùng loại (hoặc thẻ trong danh sách) — đủ để cây không
   lồng nhau vô lý khi file viết `<li>a<li>b`. */
const IMPLIED_END = {
  li: ['li'], p: ['p', 'div', 'ul', 'ol', 'table', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr'],
  td: ['td', 'th', 'tr'], th: ['td', 'th', 'tr'], tr: ['tr'],
  dt: ['dt', 'dd'], dd: ['dt', 'dd'], option: ['option'],
  thead: ['tbody', 'tfoot'], tbody: ['tbody', 'tfoot'],
};

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const k = body.toLowerCase();
    return k in ENT ? ENT[k] : m;
  });
}

const escText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

class Node {
  constructor(type) {
    this.nodeType = type;
    this.childNodes = [];
    this.parentNode = null;
  }
  get firstChild() { return this.childNodes[0] || null; }

  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    i < 0 ? this.childNodes.push(node) : this.childNodes.splice(i, 0, node);
    node.parentNode = this;
    return node;
  }
  appendChild(node) { return this.insertBefore(node, null); }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) { this.childNodes.splice(i, 1); node.parentNode = null; }
    return node;
  }
}

class Text extends Node {
  constructor(data) { super(3); this.data = data; }
  serialize() { return escText(this.data); }
}

class Comment extends Node {
  constructor(data) { super(8); this.data = data; }
  serialize() { return '<!--' + this.data + '-->'; }
}

class Element extends Node {
  constructor(name) {
    super(1);
    this.localName = name;
    this.nodeName = name.toUpperCase();
    /* Mảng thật: sanitize.js gọi Array.prototype.slice.call(el.attributes). */
    this.attributes = [];
  }
  getAttribute(n) {
    const a = this.attributes.find(x => x.name === String(n).toLowerCase());
    return a ? a.value : null;
  }
  setAttribute(n, v) {
    const name = String(n).toLowerCase();
    const a = this.attributes.find(x => x.name === name);
    a ? (a.value = String(v)) : this.attributes.push({ name, value: String(v) });
  }
  removeAttribute(n) {
    const name = String(n).toLowerCase();
    const i = this.attributes.findIndex(x => x.name === name);
    if (i >= 0) this.attributes.splice(i, 1);
  }
  get innerHTML() { return this.childNodes.map(c => c.serialize()).join(''); }
  serialize() {
    const attrs = this.attributes.map(a => ` ${a.name}="${escAttr(a.value)}"`).join('');
    if (VOID.has(this.localName)) return `<${this.localName}${attrs}>`;
    return `<${this.localName}${attrs}>${this.innerHTML}</${this.localName}>`;
  }
}

const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]*)))?/g;

function parseAttrs(src) {
  const out = [];
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(src)) !== null) {
    const name = m[1].toLowerCase();
    if (name === '/') continue;
    const raw = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '';
    if (!out.some(a => a.name === name)) out.push({ name, value: decode(raw) });
  }
  return out;
}

function parse(html) {
  const body = new Element('body');
  const stack = [body];
  const top = () => stack[stack.length - 1];
  const src = String(html);
  let i = 0;

  const addText = t => { if (t) top().appendChild(new Text(decode(t))); };

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(src.slice(i)); break; }
    addText(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      const stop = end < 0 ? src.length : end + 3;
      top().appendChild(new Comment(src.slice(lt + 4, end < 0 ? src.length : end)));
      i = stop;
      continue;
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {   // doctype, PI
      const end = src.indexOf('>', lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }

    const m = /^<(\/?)([a-zA-Z][^\s/>]*)([^>]*?)(\/?)>/.exec(src.slice(lt));
    if (!m) { addText('<'); i = lt + 1; continue; }

    const [full, slash, rawName, attrSrc, selfClose] = m;
    const name = rawName.toLowerCase();
    i = lt + full.length;

    if (slash) {
      const at = stack.map(e => e.localName).lastIndexOf(name);
      if (at > 0) stack.length = at;                 // đóng cả những thẻ chưa đóng bên trong
      continue;
    }

    /* Thẻ mở mới có thể đóng thẻ đang mở: `<li>a<li>b` là hai li ngang cấp,
       không phải li lồng nhau. */
    const cur = top().localName;    if (IMPLIED_END[cur] && IMPLIED_END[cur].includes(name) && stack.length > 1) stack.pop();

    const el = new Element(name);
    parseAttrs(attrSrc).forEach(a => el.attributes.push(a));
    top().appendChild(el);

    if (VOID.has(name) || selfClose) continue;

    if (RAW_TEXT.has(name)) {
      const close = new RegExp('</' + name + '\\s*>', 'i');
      const rest = src.slice(i);
      const cm = close.exec(rest);
      const raw = cm ? rest.slice(0, cm.index) : rest;
      if (raw) el.appendChild(new Text(raw));        // chữ trần, không decode, không parse
      i += cm ? cm.index + cm[0].length : rest.length;
      continue;
    }
    stack.push(el);
  }

  return body;
}

class DOMParser {
  parseFromString(html) {
    return { body: parse(html) };
  }
}

module.exports = { DOMParser, Element, Text, parse };
