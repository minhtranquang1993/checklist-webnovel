/* contract.js — luật dùng chung cho build-file.js và check-out.js.
   ------------------------------------------------------------
   Nguyên tắc: KHÔNG viết lại luật của hub. `parse-def.js` và `sanitize.js` trong repo
   checklist-webnovel là bản luật thật (123 test bảo vệ), nên hai script của skill này
   `require` chính chúng. Việc của file này chỉ là:
     - tìm repo,
     - nạp hai module đó với DOM giả lập (tools/test/dom-shim.js),
     - và giữ những phép quét mà sanitize KHÔNG thấy được.

   Vì sao phải có dom-shim: `sanitizeHtml` không có DOMParser thì rơi vào nhánh
   sanitize.js:139-142 và escape sạch mọi thứ — báo cáo sẽ nói "hub lọc hết", sai mà không
   có một dòng lỗi nào. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONTRACT_VERSION = 1;

/* Khớp với LIMITS trong parse-def.js:55-62 và các chỗ cut() của validateDef. */
const LIMITS = {
  title: 300,        // item.t, item.w  (parse-def.js:578,584)
  effort: 40,        // item.e          (parse-def.js:584)
  scoreName: 60,     // scores[i][0]    (parse-def.js:618)
  scoreNote: 300,    // scores[i][2]    (parse-def.js:620)
  note: 20000,
  body: 200000,
  total: 800000,
  warnTotal: 600000, // ngưỡng tự đặt: còn kịp cắt trước khi đụng trần thật
};

/* Đúng regex tools/verify.py:47 và hub.js:199 dùng để đếm hạng mục trong file ở gốc repo.
   Lookahead loại section ra vì section có `tag:` ngay sau `id:`. */
const ITEM_RE = /\{\s*id:"([^"]+)"(?!\s*,\s*tag:")/g;

/* Đúng regex parse-def.js:75 dùng để bóc khối script inline. */
const SCRIPT_RE = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;
const DECL_RE = /(?:const|let|var)\s+SECTIONS\s*=/;

const KNOWN_REPOS = [
  path.join(os.homedir(), 'Downloads', 'checklist-webnovel'),
  path.join(os.homedir(), 'checklist-webnovel'),
];

function isRepo(dir) {
  return fs.existsSync(path.join(dir, 'assets/parse-def.js')) &&
    fs.existsSync(path.join(dir, 'assets/sanitize.js')) &&
    fs.existsSync(path.join(dir, 'tools/test/dom-shim.js'));
}

/* Tìm repo: --repo= → đi ngược lên từ script → vị trí đã biết. Không bundle bản copy của
   parse-def.js/sanitize.js: chúng LÀ luật, mà muốn upload lên hub thì đằng nào cũng cần repo. */
function findRepo(explicit, startDir) {
  if (explicit) {
    const p = path.resolve(explicit);
    if (isRepo(p)) return p;
    throw new Error(`--repo=${explicit} không phải repo checklist-webnovel ` +
      '(cần assets/parse-def.js, assets/sanitize.js, tools/test/dom-shim.js)');
  }
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (isRepo(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const hit = KNOWN_REPOS.find(isRepo);
  if (hit) return hit;
  throw new Error('không tìm thấy repo checklist-webnovel. Đã thử: đi ngược lên từ ' +
    startDir + ', rồi ' + KNOWN_REPOS.join(', ') + '. Truyền --repo=/duong/dan để chỉ thẳng.');
}

function loadRepo(explicit, startDir) {
  const repo = findRepo(explicit, startDir);
  const shim = require(path.join(repo, 'tools/test/dom-shim.js'));
  global.DOMParser = shim.DOMParser;
  global.document = shim.document;
  const { sanitizeHtml } = require(path.join(repo, 'assets/sanitize.js'));
  const parseDef = require(path.join(repo, 'assets/parse-def.js'));
  /* Self-test: nếu DOMParser không vào được thì sanitizeHtml escape sạch mọi thứ. Bắt ở đây
     thay vì để nó hiện ra thành một loạt diff không hiểu nổi ở bước so byte. */
  if (sanitizeHtml('<b>x</b>') !== '<b>x</b>') {
    throw new Error('sanitizeHtml không hoạt động đúng (DOMParser chưa vào được) — dừng, ' +
      'vì mọi so sánh byte sau đây sẽ sai.');
  }
  return { repo, sanitizeHtml, validateDef: parseDef.validateDef, parseDef };
}

/* 4 luật mà dom-shim KHÔNG thấy: shim báo yên nhưng browser thật đổi byte, nên phải quét
   bằng ký tự. Đo được từng cái, không phải phòng xa:
     - U+00A0 trần: shim giữ nguyên, browser serialize thành &nbsp;
     - \r: browser chuẩn hoá CRLF→LF ngay ở tầng input stream
     - newline ngay sau <pre>: parser bỏ nó, serializer không thêm lại
     - text (khác khoảng trắng) nằm trực tiếp trong <table>: browser đẩy nó ra NGOÀI bảng */
function scanLiterals(html) {
  const out = [];
  if (/\u00a0/.test(html)) out.push('có ký tự U+00A0 trần — browser lưu thành &nbsp; nên byte lệch; dùng khoảng trắng thường');
  if (/\r/.test(html)) out.push('có ký tự \\r — browser chuẩn hoá CRLF thành LF nên byte lệch');
  if (/<pre>\n/.test(html)) out.push('có newline ngay sau <pre> — parser bỏ nó, byte lệch');
  if (/<table[^>]*>\s*[^\s<]/.test(html)) out.push('có text nằm trực tiếp trong <table> — browser đẩy text ra ngoài bảng');
  if (/<!--/.test(html)) out.push('có comment HTML — sanitize xoá comment, byte lệch');
  return out;
}

/* Những chuỗi làm HỎNG khối script khi browser đọc file, mà node thì thấy bình thường:
   tokenizer của browser kết thúc script ở `</script` + khoảng trắng/`/`/`>`, còn regex của
   hub chỉ nhận `</script\s*>`. `<!--` mở script-data-double-escaped state. */
function scanScriptHazards(code) {
  const out = [];
  if (/<!--/.test(code)) out.push('khối DATA có chuỗi `<!--` — đổi tokenizer HTML, reporter của hub bị nuốt');
  if (/<script/i.test(code)) out.push('khối DATA có chuỗi `<script` — viết ví dụ HTML bằng &lt;script&gt;');
  if (/<\/script/i.test(code)) out.push('khối DATA có chuỗi `</script` — viết bằng &lt;/script&gt;');
  if (/[:=]\s*`/.test(code)) {
    out.push('khối DATA có giá trị là template literal (backtick) — backtick ăn mất `\\` ' +
      '(`\\d{3}` thành `d{3}`) và `${` làm cả khối ném; mọi giá trị phải là chuỗi JSON.stringify');
  }
  return out;
}

function extractDataBlock(html) {
  const blocks = [];
  let m;
  SCRIPT_RE.lastIndex = 0;
  while ((m = SCRIPT_RE.exec(String(html))) !== null) {
    if (DECL_RE.test(m[1])) blocks.push(m[1]);
  }
  return blocks;
}

module.exports = {
  CONTRACT_VERSION, LIMITS, ITEM_RE, SCRIPT_RE, DECL_RE,
  isRepo, findRepo, loadRepo, scanLiterals, scanScriptHazards, extractDataBlock,
};
