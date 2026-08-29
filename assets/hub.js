/* ============================================================
   hub.js — trang danh sách checklist
   ------------------------------------------------------------
   Danh sách đọc từ bảng `checklists` trên Supabase, không hardcode trong repo,
   nên thêm checklist mới không cần sửa file nào.

   Nút "+ Thêm checklist" chỉ ĐĂNG KÝ một file HTML đã có trong repo. Trang static
   không ghi được file vào repo — file phải được push lên trước.
   ============================================================ */
'use strict';

const REST = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
const NAME_KEY = 'chk-user-name';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FILE_RE = /^[a-z0-9][a-z0-9-]{0,59}\.html$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

let userName = '';

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function setStatus(kind, text) {
  $('status').className = 'status ' + kind;
  $('status').innerHTML = `<span class="dot"></span>${esc(text)}`;
}

/* ---------- tên người dùng ---------- */
function loadName() {
  userName = (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 60);
  $('whoami').innerHTML = userName
    ? `Bạn đang tick với tên <b>${esc(userName)}</b>`
    : 'Chưa nhập tên';
}

function askName() {
  const v = (prompt('Tên của bạn:', userName) || '').trim().slice(0, 60);
  if (!v) return false;
  localStorage.setItem(NAME_KEY, v);
  loadName();
  return true;
}

$('btnName').onclick = askName;
/* ---------- vẽ thẻ ---------- */
function card(c, stat) {
  const done = stat ? stat.done : 0;
  const total = c.total || 0;
  const pct = total ? Math.round(done / total * 100) : 0;
  const col = pct >= 80 ? 'var(--p3)' : pct >= 40 ? 'var(--p2)' : pct > 0 ? 'var(--p1)' : 'var(--muted)';
  const last = stat && stat.at
    ? `Mới nhất: ${esc(stat.by)} · ${esc(fmtTime(stat.at))}`
    : 'Chưa có ai tick';
  const count = total
    ? `<span><b>${done}</b> / ${total} hạng mục</span><span style="color:${col}">${pct}%</span>`
    : `<span><b>${done}</b> hạng mục đã tick</span><span style="color:var(--muted)">—</span>`;

  return `<a class="card" href="${esc(c.file)}">
    <h3>${esc(c.name)}</h3>
    <p class="desc">${esc(c.descr || '')}</p>
    <div class="num">${count}</div>
    <div class="bar"><i style="width:${pct}%;background:${col}"></i></div>
    <div class="last">${last}</div>
  </a>`;
}

function paint(list, stats) {
  if (!list.length) {
    $('hub').innerHTML =
      '<p class="empty">Chưa có checklist nào. Bấm <b>+ Thêm checklist</b> để đăng ký một file HTML đã có trong repo.</p>';
    return;
  }
  $('hub').innerHTML = list.map(c => card(c, stats[c.id])).join('');
}

/* ---------- tải danh sách + tiến độ ---------- */
let checklists = [];

async function load() {
  try {
    const [resList, resProg] = await Promise.all([
      fetch(`${REST}/checklists?select=id,name,file,descr,total&order=created_at`,
        { headers: SB_HEADERS, cache: 'no-store' }),
      fetch(`${REST}/checklist_progress?select=checklist_id,done,updated_by,updated_at&done=is.true`,
        { headers: SB_HEADERS, cache: 'no-store' }),
    ]);
    if (!resList.ok) throw new Error('HTTP ' + resList.status);
    if (!resProg.ok) throw new Error('HTTP ' + resProg.status);

    const list = await resList.json();
    const rows = await resProg.json();
    if (!Array.isArray(list) || !Array.isArray(rows)) throw new Error('phản hồi không hợp lệ');

    /* Chỉ hiện checklist có tên file hợp lệ. `file` là thứ duy nhất đi vào href,
       và nó do người dùng nhập, nên kiểm lại ở client chứ không chỉ tin DB. */
    checklists = list.filter(c => c.file && FILE_RE.test(c.file));

    const stats = {};
    rows.forEach(r => {
      const s = stats[r.checklist_id] || (stats[r.checklist_id] = { done: 0, by: '', at: '' });
      s.done++;
      if (!s.at || r.updated_at > s.at) { s.at = r.updated_at; s.by = r.updated_by || ''; }
    });

    paint(checklists, stats);
    setStatus('ok', 'Tiến độ mới nhất từ server');
  } catch (err) {
    setStatus('err', 'Không tải được danh sách — thử tải lại trang');
  }
}
/* ---------- form thêm checklist ---------- */
function msg(kind, text) {
  const el = $('fMsg');
  el.className = 'fmsg ' + kind;
  el.textContent = text;
}

/* Gợi ý mã checklist từ tên file, nhưng chỉ khi người dùng chưa tự nhập. */
let idTouched = false;
$('fId').oninput = () => { idTouched = true; };
$('fFile').oninput = () => {
  if (idTouched) return;
  const v = $('fFile').value.trim().toLowerCase().replace(/\.html?$/, '');
  $('fId').value = v.slice(0, 40);
};

function openForm() {
  $('addbox').hidden = false;
  msg('', '');
  $('fFile').focus();
}

function closeForm() {
  $('addbox').hidden = true;
  ['fFile', 'fId', 'fName', 'fTotal', 'fDescr'].forEach(k => { $(k).value = ''; });
  idTouched = false;
  msg('', '');
}

$('btnAdd').onclick = () => ($('addbox').hidden ? openForm() : closeForm());
$('btnCancel').onclick = closeForm;

/* Đọc file HTML trong repo để lấy CHECKLIST_ID và số hạng mục thật.
   Nhờ vậy sai lệch giữa file và DB bị bắt NGAY lúc đăng ký, không phải sau
   khi nhân viên đã tick vào một chỗ sai. */
async function inspectFile(file) {
  const res = await fetch(file, { cache: 'no-store' });
  if (!res.ok) throw new Error(`không mở được ${file} (HTTP ${res.status}) — file đã push lên chưa?`);
  const html = await res.text();

  const m = /const\s+CHECKLIST_ID\s*=\s*['"]([^'"]+)['"]/.exec(html);
  if (!m) throw new Error(`${file} không khai \`const CHECKLIST_ID\` — đây có phải file checklist không?`);

  /* Section cũng có dạng `{id:"..."` nhưng kèm `tag:` ngay sau — loại ra để không
     đếm nhóm thành hạng mục. Giữ khớp với ITEM_RE trong tools/verify.py. */
  const ids = html.match(/\{\s*id:"[^"]+"(?!\s*,\s*tag:")/g) || [];
  return { id: m[1], total: ids.length };
}

async function save() {
  if (!userName && !askName()) return;

  const file = $('fFile').value.trim().toLowerCase();
  const id = $('fId').value.trim().toLowerCase();
  const name = $('fName').value.trim();
  const descr = $('fDescr').value.trim();
  const totalRaw = $('fTotal').value.trim();

  if (!FILE_RE.test(file)) return msg('err', 'Tên file phải dạng "ten-file.html": chữ thường, số, gạch ngang.');
  if (!ID_RE.test(id)) return msg('err', 'Mã checklist chỉ gồm chữ thường, số và gạch ngang.');
  if (!name) return msg('err', 'Nhập tên hiển thị.');
  if (totalRaw && !/^\d{1,4}$/.test(totalRaw)) return msg('err', 'Số hạng mục phải là số.');
  if (checklists.some(c => c.id === id)) return msg('err', `Mã "${id}" đã có trong danh sách.`);
  if (checklists.some(c => c.file === file)) return msg('err', `File "${file}" đã được đăng ký.`);

  $('btnSave').disabled = true;
  try {
    msg('', `Đang đọc ${file}…`);
    const found = await inspectFile(file);

    if (found.id !== id) {
      throw new Error(
        `${file} khai CHECKLIST_ID='${found.id}' nhưng bạn nhập '${id}'. ` +
        'Hai giá trị phải giống nhau, nếu không tick sẽ ghi vào sai chỗ.'
      );
    }

    const total = totalRaw ? parseInt(totalRaw, 10) : found.total;
    if (totalRaw && total !== found.total) {
      throw new Error(`${file} có ${found.total} hạng mục, không phải ${total}. Để trống ô này cho chắc.`);
    }
    if (!total) throw new Error(`Không tìm thấy hạng mục nào trong ${file}.`);

    msg('', 'Đang đăng ký…');
    const res = await fetch(`${REST}/rpc/register_checklist`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify({
        p_id: id, p_name: name, p_file: file,
        p_descr: descr, p_total: total, p_created_by: userName,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let m2 = '';
      try { m2 = JSON.parse(body).message || ''; } catch { m2 = body.slice(0, 160); }
      throw new Error(m2 || 'HTTP ' + res.status);
    }

    closeForm();
    setStatus('load', 'Đang tải lại…');
    await load();
  } catch (err) {
    msg('err', err.message);
  } finally {
    $('btnSave').disabled = false;
  }
}

$('btnSave').onclick = save;
$('addbox').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); save(); }
  if (e.key === 'Escape') closeForm();
});

/* ---------- khởi động ---------- */
loadName();
paint([], {});
load();
