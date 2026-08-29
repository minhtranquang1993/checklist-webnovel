/* ============================================================
   hub.js — trang danh sách checklist
   ------------------------------------------------------------
   Danh sách đọc từ bảng `checklists` trên Supabase, không hardcode trong repo,
   nên thêm checklist mới không cần sửa file nào.

   Hai loại checklist, phân biệt bằng cột `kind`:
     'file' — nội dung nằm trong một file .html trong repo, thẻ trỏ thẳng vào file
              đó. Thêm bằng nút "+ Đăng ký file trong repo" (file phải push trước).
     'def'  — nội dung nằm trong bảng `checklist_defs`, thẻ trỏ vào
              checklist.html?id=<id>. Thêm bằng nút "⬆ Upload file HTML", không
              cần push repo.
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
/* href là thứ duy nhất do dữ liệu quyết định. Với 'file' nó là tên file trong repo
   (đã qua FILE_RE), với 'def' nó là checklist.html?id=<id> (id đã qua ID_RE). Hai
   regex đó là lý do không nhét được `../` hay URL ngoài vào đây. */
function hrefOf(c) {
  return c.kind === 'def'
    ? 'checklist.html?id=' + encodeURIComponent(c.id)
    : esc(c.file);
}

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
  const kind = c.kind === 'def'
    ? '<span class="kind def" title="Nội dung lưu trên server — sửa bằng cách upload lại file">upload</span>'
    : '<span class="kind" title="Nội dung nằm trong file HTML trong repo">repo</span>';

  /* Nút xoá nằm NGOÀI thẻ <a>, không lồng trong: <a> bọc cả thẻ nên nút bên trong
     sẽ vừa xoá vừa mở checklist. Chỉ vẽ cho dạng `def` — dạng `file` xoá từ web là
     vô nghĩa (file vẫn trong repo, đăng ký lại là hiện lại, nhưng tick đã mất). */
  const del = c.kind === 'def'
    ? `<button class="card-del" data-id="${esc(c.id)}" type="button"
         title="Xoá checklist này khỏi hub" aria-label="Xoá ${esc(c.name)}">Xoá</button>`
    : '';

  return `<div class="card-wrap">
    <a class="card" href="${hrefOf(c)}">
      <h3>${esc(c.name)}${kind}</h3>
      <p class="desc">${esc(c.descr || '')}</p>
      <div class="num">${count}</div>
      <div class="bar"><i style="width:${pct}%;background:${col}"></i></div>
      <div class="last">${last}</div>
    </a>${del}
  </div>`;
}

function paint(list, stats) {
  if (!list.length) {
    $('hub').innerHTML =
      '<p class="empty">Chưa có checklist nào. Bấm <b>⬆ Upload file HTML</b> để thêm một checklist từ file ở máy.</p>';
    return;
  }
  $('hub').innerHTML = list.map(c => card(c, stats[c.id])).join('');
}

/* ---------- tải danh sách + tiến độ ---------- */
let checklists = [];
/* Tiến độ của lần load gần nhất. removeChecklist() cần nó để nói đúng số tick sắp
   mất — con số đó là thứ quyết định người dùng có bấm tiếp hay không. */
let lastStats = {};

async function load() {
  try {
    const [resList, resProg] = await Promise.all([
      fetch(`${REST}/checklists?select=id,name,file,descr,total,kind&order=created_at`,
        { headers: SB_HEADERS, cache: 'no-store' }),
      fetch(`${REST}/checklist_progress?select=checklist_id,done,updated_by,updated_at&done=is.true`,
        { headers: SB_HEADERS, cache: 'no-store' }),
    ]);
    if (!resList.ok) throw new Error('HTTP ' + resList.status);
    if (!resProg.ok) throw new Error('HTTP ' + resProg.status);

    const list = await resList.json();
    const rows = await resProg.json();
    if (!Array.isArray(list) || !Array.isArray(rows)) throw new Error('phản hồi không hợp lệ');

    /* Chỉ hiện checklist mà mình dựng được href an toàn cho nó. Kiểm lại ở client
       chứ không chỉ tin DB, vì href là thứ duy nhất do dữ liệu người dùng quyết định:
         'def'  → id phải sạch (nó đi vào ?id=)
         'file' → tên file phải sạch (nó đi vào href)
       Row thiếu `kind` (DB chưa chạy schema mới) được coi là 'file' như trước. */
    checklists = list.filter(c => (c.kind === 'def'
      ? ID_RE.test(String(c.id || ''))
      : c.file && FILE_RE.test(c.file)));

    const stats = {};
    rows.forEach(r => {
      const s = stats[r.checklist_id] || (stats[r.checklist_id] = { done: 0, by: '', at: '' });
      s.done++;
      if (!s.at || r.updated_at > s.at) { s.at = r.updated_at; s.by = r.updated_by || ''; }
    });

    lastStats = stats;
    paint(checklists, stats);
    setStatus('ok', 'Tiến độ mới nhất từ server');
  } catch (err) {
    setStatus('err', 'Không tải được danh sách — thử tải lại trang');
  }
}
/* ---------- form đăng ký file trong repo (cách cũ) ---------- */
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
  closeUpload();                              // hai form không mở cùng lúc
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

/* ---------- form upload file HTML ---------- */
/* Khác form trên ở chỗ căn bản: form trên chỉ trỏ tới một file đã có trong repo,
   form này ĐỌC file ở máy rồi lưu nội dung lên server. Nhờ vậy không phải push repo
   và không phải chờ Vercel deploy.

   Nội dung được bóc trong iframe sandbox và lọc bằng sanitizeHtml — xem
   assets/parse-def.js. Ở đây chỉ lo phần giao diện và gọi RPC. */
function uMsg(kind, text) {
  const el = $('uMsg');
  el.className = 'fmsg ' + kind;
  el.textContent = text;
}

/* def của file vừa chọn, đã validate + sanitize. null = chưa có gì để upload.
   `idLocked` = mã do file tự khai (read-only), false = mã suy từ tên file (cho sửa). */
let pending = null;
let idLocked = false;

function setInfo(html, warn) {
  const box = $('uInfo');
  box.hidden = !html;
  box.className = 'upinfo' + (warn ? ' warn' : '');
  box.innerHTML = html || '';
}

function closeUpload() {
  $('upbox').hidden = true;
  ['uFile', 'uId', 'uName', 'uDescr'].forEach(k => { $(k).value = ''; });
  $('uId').readOnly = false;
  pending = null;
  idLocked = false;
  $('btnUpSave').disabled = true;
  setInfo('');
  uMsg('', '');
}

function openUpload() {
  closeForm();                                // hai form không mở cùng lúc
  $('upbox').hidden = false;
  uMsg('', '');
  $('uFile').focus();
}

$('btnUpload').onclick = () => ($('upbox').hidden ? openUpload() : closeUpload());
$('btnUpCancel').onclick = closeUpload;

/* Vẽ lại hộp tóm tắt theo mã đang có trong ô. Gọi sau khi đọc file và mỗi lần
   người dùng sửa ô mã — trùng mã là thứ phải biết TRƯỚC khi bấm Upload, không phải
   sau khi server từ chối. */
function refreshUploadInfo(warnings) {
  if (!pending) return;
  const id = $('uId').value.trim().toLowerCase();

  let warn = false;
  let extra = '';

  if (!ID_RE.test(id)) {
    warn = true;
    extra = `<br><span class="k">Mã không hợp lệ</span> — chỉ chữ thường, số và gạch ngang,
      bắt đầu bằng chữ hoặc số.`;
  } else {
    /* Ba trường hợp khác nhau hoàn toàn, nên nói rõ từng cái. */
    const clash = checklists.find(c => c.id === id);
    if (clash && clash.kind === 'def') {
      warn = true;
      extra = `<br><span class="k">Mã này đã có</span> — upload sẽ <b>cập nhật nội dung</b> của
        "${esc(clash.name)}". Tick đã có vẫn giữ nguyên.`;
    } else if (clash) {
      warn = true;
      extra = `<br><span class="k">Mã này đang thuộc file trong repo</span>
        (<b>${esc(clash.file || '')}</b>) — server sẽ <b>từ chối</b>. Đổi sang mã khác.`;
    }
  }

  const warns = (warnings && warnings.length)
    ? '<ul>' + warnings.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>'
    : '';

  setInfo(
    `<span class="k">Mã checklist:</span> <b>${esc(id || '(chưa có)')}</b> ·
     <b>${pending.sections.length}</b> nhóm ·
     <b>${pending.total}</b> hạng mục${extra}${warns}`,
    warn || !!(warnings && warnings.length)
  );

  $('btnUpSave').disabled = !ID_RE.test(id);
}

/* Người dùng sửa ô mã → kiểm lại ngay. Chỉ có tác dụng khi mã là suy từ tên file;
   mã do file khai thì ô đang readOnly nên sự kiện này không chạy. */
let lastWarnings = [];
$('uId').oninput = () => refreshUploadInfo(lastWarnings);

/* Chọn file → đọc → bóc → validate → hiện tóm tắt. Chưa gửi gì lên server ở bước
   này, để người dùng thấy trước cái mình sắp upload. */
$('uFile').onchange = async () => {
  const f = $('uFile').files && $('uFile').files[0];
  pending = null;
  idLocked = false;
  lastWarnings = [];
  $('uId').readOnly = false;
  $('btnUpSave').disabled = true;
  setInfo('');
  if (!f) return uMsg('', '');

  if (f.size > 3 * 1024 * 1024) {
    return uMsg('err', `File ${Math.round(f.size / 1024)}KB — quá lớn (tối đa 3MB).`);
  }

  uMsg('', `Đang đọc ${f.name}…`);
  try {
    /* Mã suy từ tên file chỉ được dùng khi file không tự khai — parseChecklistFile
       quyết định chuyện đó và báo lại qua `idFromFile`. */
    const parsed = await parseChecklistFile(await f.text(), slugFromFilename(f.name));
    pending = parsed.def;
    idLocked = parsed.idFromFile;
    lastWarnings = parsed.warnings;

    $('uId').value = pending.id;
    $('uId').readOnly = idLocked;
    $('uIdHint').innerHTML = idLocked
      ? 'Lấy từ <code>CHECKLIST_ID</code> khai trong file. Sau khi upload thì <b>đừng đổi</b>.'
      : 'File không khai <code>CHECKLIST_ID</code> — mã này suy từ tên file. Sửa được, nhưng ' +
        'sau khi upload thì <b>đừng đổi</b> (đổi là mất tick).';

    if (!$('uName').value.trim()) {
      $('uName').value = (pending.meta.title || pending.id).slice(0, 80);
    }

    refreshUploadInfo(lastWarnings);
    uMsg('ok', idLocked
      ? 'Đọc xong — kiểm lại rồi bấm Upload.'
      : 'Đọc xong — kiểm mã checklist rồi bấm Upload.');
  } catch (err) {
    uMsg('err', err.message);
  }
};

async function upload(force) {
  if (!pending) return uMsg('err', 'Chọn file HTML trước.');
  if (!userName && !askName()) return;

  /* Mã đọc từ ô, không từ `pending.id`: khi file không tự khai, người dùng có thể
     đã sửa nó sau khi file được đọc. */
  const id = $('uId').value.trim().toLowerCase();
  if (!ID_RE.test(id)) return uMsg('err', 'Mã checklist chỉ gồm chữ thường, số và gạch ngang.');

  const name = $('uName').value.trim();
  if (!name) return uMsg('err', 'Nhập tên hiển thị.');

  $('btnUpSave').disabled = true;
  try {
    uMsg('', 'Đang upload…');
    const res = await fetch(`${REST}/rpc/upload_checklist_def`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify({
        p_id: id,
        p_name: name,
        p_descr: $('uDescr').value.trim(),
        p_scores: pending.scores,
        p_sections: pending.sections,
        p_meta: pending.meta,
        p_total: pending.total,
        p_by: userName,
        p_force: !!force,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let m2 = '';
      try { m2 = JSON.parse(body).message || ''; } catch { m2 = body.slice(0, 300); }

      /* Server chặn vì bản mới thiếu hạng mục ĐÃ ĐƯỢC TICK. Đây là chỗ duy nhất
         hỏi lại người dùng: mất tick là việc không hoàn tác được từ trang này, nên
         không tự ý force, cũng không im lặng bỏ qua. */
      if (!force && /DA DUOC TICK/.test(m2)) {
        if (confirm(m2 + '\n\nVẫn upload và bỏ những tick đó?')) return upload(true);
        uMsg('err', 'Đã huỷ — không có gì thay đổi trên server.');
        return;
      }
      throw new Error(m2 || 'HTTP ' + res.status);
    }

    const rows = await res.json().catch(() => []);
    const created = Array.isArray(rows) && rows[0] ? rows[0].out_created : true;
    closeUpload();
    setStatus('load', 'Đang tải lại…');
    await load();
    setStatus('ok', created ? 'Đã thêm checklist mới' : 'Đã cập nhật nội dung checklist');
  } catch (err) {
    uMsg('err', err.message);
  } finally {
    $('btnUpSave').disabled = !pending;
  }
}

$('btnUpSave').onclick = () => upload(false);
$('upbox').addEventListener('keydown', e => {
  if (e.key === 'Escape') closeUpload();
});

/* ---------- xoá checklist ---------- */
/* Chỉ xoá được checklist dạng `def`. Dạng `file` không xoá từ đây: file HTML vẫn
   nằm trong repo, xoá row xong lần sau ai đăng ký lại là nó hiện lại — nhưng tick
   thì đã mất. Server cũng chặn, đây chỉ là lớp đầu.

   Bắt gõ đúng mã để xác nhận, giống nút "Xoá tick" trong sync.js: việc này ảnh
   hưởng cả team và không hoàn tác được từ trang này. Bảng checklist_history vẫn giữ
   mọi thay đổi nên khôi phục được bằng SQL. */
async function removeChecklist(id) {
  const c = checklists.find(x => x.id === id);
  if (!c || c.kind !== 'def') return;
  if (!userName && !askName()) return;

  const stat = lastStats[id];
  const ticked = stat ? stat.done : 0;

  const answer = prompt(
    `Xoá checklist "${c.name}" khỏi hub — của CẢ TEAM, không chỉ máy bạn.\n` +
    `Mất: ${c.total || 0} hạng mục` + (ticked ? ` và ${ticked} tick đã có` : ' (chưa ai tick)') + '.\n' +
    'Việc này không hoàn tác được từ trang này.\n\n' +
    `Gõ đúng "${id}" để xác nhận:`
  );
  if (answer === null) return;
  if (answer.trim() !== id) {
    setStatus('err', 'Gõ không đúng — đã huỷ, không có gì thay đổi.');
    return;
  }

  setStatus('load', 'Đang xoá…');
  try {
    const res = await fetch(`${REST}/rpc/delete_checklist_def`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify({ p_id: id, p_by: userName, p_confirm: answer.trim() }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let m2 = '';
      try { m2 = JSON.parse(body).message || ''; } catch { m2 = body.slice(0, 300); }
      throw new Error(m2 || 'HTTP ' + res.status);
    }
    const rows = await res.json().catch(() => []);
    const gone = Array.isArray(rows) && rows[0] ? rows[0].out_ticks_deleted : 0;
    await load();
    setStatus('ok', `Đã xoá "${c.name}"` + (gone ? ` và ${gone} tick` : ''));
  } catch (err) {
    setStatus('err', 'Không xoá được: ' + err.message);
  }
}

/* Uỷ quyền sự kiện trên #hub: thẻ được vẽ lại mỗi lần load() nên gắn onclick vào
   từng nút sẽ mất sau lần vẽ đầu. */
$('hub').addEventListener('click', e => {
  const btn = e.target.closest('.card-del');
  if (!btn) return;
  /* Nút nằm cạnh thẻ <a>, không nằm trong — nhưng chặn cả hai cho chắc, vì thẻ
     bọc ngoài có thể đổi cấu trúc về sau. */
  e.preventDefault();
  e.stopPropagation();
  removeChecklist(btn.dataset.id);
});

/* ---------- khởi động ---------- */
loadName();
paint([], {});
load();
