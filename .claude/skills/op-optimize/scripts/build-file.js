#!/usr/bin/env node
/* build-file.js — dựng file HTML checklist từ một file JSON dữ liệu.
   ------------------------------------------------------------
   Vì sao có script này thay vì để agent tự viết cả file HTML: các ràng buộc làm file
   upload được là ràng buộc CƠ HỌC (key object literal không ngoặc kép, `tag:` ngay sau
   `id:`, `b`/`note` là giá trị JSON.stringify, nội dung phải sanitize-stable). Viết tay
   60-90 hạng mục mà không lệch một lần là chuyện không xảy ra; dựng bằng script thì đúng
   theo cấu trúc, agent chỉ cần lo NỘI DUNG.

   Dùng:
     node build-file.js audit.json                # ghi ra đường dẫn trong audit.json
     node build-file.js audit.json --out=/tmp/a.html
     node build-file.js audit.json --repo=/path/to/checklist-webnovel

   audit.json:
     { id, host, url, date, title, sub, chips:[], method:[], cannot:[],
       scores:[[ten,diem,ghichu]], sections:[{id,tag,title,note,items:[{id,t,w,e,b}]}] }
*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadRepo, scanLiterals, LIMITS } = require('./contract.js');

const args = process.argv.slice(2);
const flag = n => {
  const hit = args.find(a => a.startsWith('--' + n + '='));
  return hit ? hit.slice(n.length + 3) : '';
};
const specPath = args.find(a => !a.startsWith('--'));
if (!specPath) {
  console.error('FAIL: thiếu file JSON. Dùng: node build-file.js audit.json [--out=…] [--repo=…]');
  process.exit(2);
}

const { repo, sanitizeHtml } = loadRepo(flag('repo'), __dirname);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const SKILL = path.resolve(__dirname, '..');

const errors = [];
const fixed = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };

/* ---------- 1. kiểm phần khung ---------- */
need(/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(spec.id || '')),
  `id "${spec.id}" sai định dạng — chỉ chữ thường/số/gạch ngang, tối đa 40 ký tự`);
need(spec.host, 'thiếu `host` (dùng cho dấu "Audit host:" và cho tên hiển thị)');
need(Array.isArray(spec.sections) && spec.sections.length, 'thiếu `sections`');
need(Array.isArray(spec.scores) && spec.scores.length, 'thiếu `scores`');

const TAGS = new Set(['t-p0', 't-p1', 't-p2', 't-p3', 't-geo', 't-bl']);
const seen = new Set();

(spec.sections || []).forEach((s, si) => {
  const where = `nhóm ${si + 1} (${s && s.id})`;
  need(s && /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(String(s.id || '')), `${where}: \`id\` thiếu hoặc lạ`);
  need(TAGS.has(String(s.tag)), `${where}: tag "${s.tag}" không thuộc 6 giá trị có màu trong CSS`);
  need(Array.isArray(s.items) && s.items.length,
    `${where}: không có hạng mục — validateDef của hub NÉM với nhóm rỗng, bỏ hẳn nhóm này đi`);
  (s.items || []).forEach((i, ii) => {
    const iw = `${where} · hạng mục ${ii + 1} (${i && i.id})`;
    need(/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(i.id || '')), `${iw}: id sai định dạng`);
    need(!seen.has(i.id), `${iw}: id trùng — tick của hai hạng mục sẽ ghi chồng lên nhau`);
    seen.add(i.id);
    need(String(i.t || '').trim(), `${iw}: thiếu tiêu đề \`t\``);
    need(String(i.t || '').length <= LIMITS.title, `${iw}: \`t\` dài ${String(i.t).length} > ${LIMITS.title} — hub cắt âm thầm`);
    need(String(i.w || '').length <= LIMITS.title, `${iw}: \`w\` dài quá ${LIMITS.title} — hub cắt âm thầm`);
    need(String(i.e || '').length <= LIMITS.effort, `${iw}: \`e\` dài quá ${LIMITS.effort} — hub cắt âm thầm`);
  });
});

(spec.scores || []).forEach((row, ri) => {
  need(Array.isArray(row) && row.length >= 2 && isFinite(Number(row[1])),
    `scores[${ri}] phải là [tên, điểm 0-10, ghi chú]`);
  need(String(row[0] || '').length <= LIMITS.scoreName, `scores[${ri}]: tên trục dài quá ${LIMITS.scoreName}`);
  need(String(row[2] || '').length <= LIMITS.scoreNote, `scores[${ri}]: ghi chú dài quá ${LIMITS.scoreNote}`);
  need(!String(row[2] || '').includes('"'),
    `scores[${ri}]: ghi chú có dấu " — sync.js:184 render title="\${esc(d)}" mà esc không escape dấu ", attribute sẽ đóng sớm`);
});

/* ---------- 2. chuẩn hoá + kiểm nội dung HTML ---------- */
/* Chạy sanitizeHtml rồi GHI BẢN ĐÃ CHUẨN HOÁ: hạng mục carried-over đọc từ DB là byte do
   sanitize của browser sinh, không đảm bảo ổn định dưới dom-shim. Ghi bản chuẩn hoá thì
   file ổn định theo cấu trúc, không phải theo may mắn. */
function normalize(html, where) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
  const lit = scanLiterals(src);
  lit.forEach(m => errors.push(`${where}: ${m}`));
  const out = sanitizeHtml(src);
  if (out !== src) fixed.push(where);
  return out;
}

const sections = (spec.sections || []).map((s, si) => ({
  id: String(s.id),
  tag: String(s.tag),
  title: String(s.title || s.id),
  note: normalize(s.note, `nhóm ${s.id} · note`),
  items: (s.items || []).map(i => ({
    id: String(i.id),
    t: String(i.t || ''),
    w: String(i.w || ''),
    e: String(i.e || ''),
    b: normalize(i.b, `hạng mục ${i.id} · b`),
  })),
}));

/* Dấu nhận origin cho lần audit sau. Đặt ở nhóm VFY vì nhóm đó luôn có hạng mục; P0 có thể
   không có findings, mà validateDef ném với nhóm rỗng. */
const MARK = 'Audit host: ' + String(spec.host || '');
const vfy = sections.find(s => s.id === 'VFY') || sections[sections.length - 1];
if (vfy && !vfy.note.includes(MARK)) {
  vfy.note = '<p>' + MARK + ' · đo ' + String(spec.date || '') + '</p>' + vfy.note;
}
need(sections.some(s => s.note.includes(MARK)),
  'không gắn được dấu "Audit host:" — lần audit sau sẽ không xác nhận được cùng site');

if (errors.length) {
  console.error('FAIL — ' + errors.length + ' lỗi, không dựng file:');
  errors.forEach(e => console.error('  • ' + e));
  process.exit(1);
}

/* ---------- 3. dựng khối DATA ---------- */
/* Object literal key TRẦN, chỉ giá trị qua JSON.stringify. JSON.stringify cả object sẽ sinh
   key có ngoặc kép, và ITEM_RE của tools/verify.py (`\{\s*id:"…"(?!\s*,\s*tag:")`) đếm ra 0
   hạng mục → file copy vào gốc repo là verify.py exit 1. */
const J = JSON.stringify;
const itemLit = i => `{id:${J(i.id)},t:${J(i.t)},w:${J(i.w)},e:${J(i.e)},b:${J(i.b)}}`;
const secLit = s => `{id:${J(s.id)},tag:${J(s.tag)},title:${J(s.title)},note:${J(s.note)},items:[\n ` +
  s.items.map(itemLit).join(',\n ') + '\n]}';

const dataBlock = [
  'const CHECKLIST_ID = ' + J(spec.id) + ';',
  'const SCORES = [' + spec.scores.map(r =>
    `[${J(String(r[0]))},${Math.max(0, Math.min(10, Math.round(Number(r[1]))))},${J(String(r[2] == null ? '' : r[2]))}]`
  ).join(',\n ') + '];',
  'const SECTIONS=[',
  sections.map(secLit).join(',\n'),
  '];',
].join('\n');

/* ---------- 4. dựng file ---------- */
const css = fs.readFileSync(path.join(SKILL, 'templates/preview.css'), 'utf8');
const render = fs.readFileSync(path.join(SKILL, 'templates/render.js'), 'utf8');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nItems = sections.reduce((n, s) => n + s.items.length, 0);
const title = String(spec.title || ('Audit on-page — ' + spec.host));
const ul = arr => (arr && arr.length ? '<ul>' + arr.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '');

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${css.trim()}
</style>
</head>
<body>
<div class="wrap">

<header class="hero">
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(spec.sub || 'Bản làm việc kèm số đo thật và lệnh verify từng hạng mục.')}</p>
  <div class="meta">
${(spec.chips || []).map(c => '    <span class="chip">' + esc(c) + '</span>').join('\n')}
  </div>
  <div class="localnote" id="storenote"></div>
  <div class="scores" id="scores"></div>
</header>

<div class="progwrap">
  <div class="progtop">
    <b id="progtxt">0 / ${nItems} hạng mục</b>
    <span class="progpct" id="progpct">0%</span>
  </div>
  <div class="progbar"><i id="progbar"></i></div>
  <div class="filters" id="filters">
    <div class="tools">
      <button id="expandAll">Mở hết</button>
      <button id="collapseAll">Thu hết</button>
      <button id="reset">Xoá tick</button>
    </div>
  </div>
</div>

<div id="content"></div>

<footer>
  <p><b>File này dùng được ở hai chỗ.</b> Mở trực tiếp ở máy: xem và tick ngay, tick lưu trong
  browser này. Upload lên hub (nút <b>⬆ Upload file HTML</b> ở <code>index.html</code>): cả team
  tick chung, tiến độ lưu trên server. Mã checklist: <code>${esc(spec.id)}</code>.</p>
  <p><b>Tên hiển thị nên dán khi upload:</b> ${esc(String(spec.host || '').slice(0, 80))}</p>
  <p><b>Phương pháp đo${spec.date ? ' (' + esc(spec.date) + ')' : ''}:</b></p>
  ${ul(spec.method)}
  <p><b>Không đo được bằng bộ script này</b> — cần công cụ có quyền:</p>
  ${ul(spec.cannot)}
</footer>
</div>

<script>
${dataBlock}
</script>

<script>
${render.trim()}
</script>
</body>
</html>
`;

const out = flag('out') || spec.out ||
  path.join(os.homedir(), 'Downloads', 'onpage', `${spec.id}-${spec.date || 'nodate'}.html`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');

console.log('OK — đã dựng file');
console.log('  file            ' + out);
console.log('  mã checklist    ' + spec.id);
console.log('  nhóm            ' + sections.length + ' (' + sections.map(s => s.id + ':' + s.items.length).join(', ') + ')');
console.log('  hạng mục        ' + nItems);
console.log('  nút filter      ' + (sections.length + 2) + ' (Tất cả + ' + sections.length + ' nhóm + Chưa xong)');
console.log('  KB dữ liệu      ' + Math.round(JSON.stringify(sections).length / 1024) + 'KB / trần 800KB');
console.log('  repo dùng để lọc HTML: ' + repo);
if (fixed.length) {
  console.log('  đã chuẩn hoá lại HTML của: ' + fixed.length + ' chỗ (' + fixed.slice(0, 5).join(', ') +
    (fixed.length > 5 ? '…' : '') + ')');
}
console.log('\nBước tiếp: node ' + path.relative(process.cwd(), path.join(__dirname, 'check-out.js')) + ' "' + out + '"');
