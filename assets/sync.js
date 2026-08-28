/* ============================================================
   sync.js — engine dùng chung cho mọi trang checklist
   ------------------------------------------------------------
   Mỗi file HTML checklist khai báo trước 3 biến rồi nạp file này:
     CHECKLIST_ID  — khoá của checklist trong DB (khớp config.js)
     SCORES        — bảng điểm [[tên, điểm 0-10, ghi chú], ...]
     SECTIONS      — dữ liệu hạng mục [{id, tag, title, note, items:[...]}]

   Lưu trữ: Supabase, ghi qua RPC `tick_item` (1 request = 1 hạng mục).
   Mất mạng vẫn tick được: ghi vào hàng đợi trong máy, tự đẩy lên khi có mạng.

   Ba chỗ dễ mất tick, đã xử lý:
   1. Refetch chạy chồng lên lần ghi vừa xong → mỗi hạng mục có mốc `writeAt`;
      dữ liệu server cũ hơn mốc đó bị bỏ qua.
   2. Tab để mở từ sáng, đẩy hàng đợi lúc chiều → gửi kèm `client_ts`, server
      từ chối bản cũ hơn bản đang có.
   3. Hai tab cùng máy ghi đè hàng đợi của nhau → đọc lại localStorage ngay
      trước mỗi lần sửa, và nghe sự kiện `storage`.
   ============================================================ */
'use strict';

const RPC = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/tick_item';
const REST = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/checklist_progress';
const HDRS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

const NAME_KEY = 'chk-user-name';
const QUEUE_KEY = 'chk-queue-' + CHECKLIST_ID;
const CACHE_KEY = 'chk-cache-' + CHECKLIST_ID;

/* Hàng đợi cũ hơn mốc này coi như hết hạn — bỏ đi thay vì đẩy lên ghi đè
   việc người khác đã làm trong lúc máy này ngủ. */
const QUEUE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/* Danh sách id hợp lệ, lấy từ chính dữ liệu trang. Dùng để bỏ qua row rác
   hoặc hạng mục đã đổi tên. */
const VALID_IDS = new Set(SECTIONS.flatMap(s => s.items.map(i => i.id)));

/* state[id]      = {done, by, at}      — bản đang hiển thị
   queue[id]      = {done, by, ts}      — chưa đẩy lên được (ts = lúc người dùng bấm)
   writeAt[id]    = số ms               — lần ghi cục bộ gần nhất
   confirmedAt[id]= số ms               — lần server xác nhận ghi gần nhất
   Hai mốc sau chỉ nhận id thuộc VALID_IDS nên nhiều nhất bằng số hạng mục
   của trang (77), không phình theo thời gian. */
let state = {};
let queue = {};
const writeAt = {};
const confirmedAt = {};
let userName = '';
let flushing = false;
let retryTimer = null;
let lastError = '';

/* ---------- tiện ích ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const $ = id => document.getElementById(id);

const readJSON = (k, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v && typeof v === 'object' ? v : fallback;
  } catch { return fallback; }
};
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* Chữ viết tắt cho avatar: chữ đầu của từ đầu + chữ đầu của từ cuối.
   "Nguyễn Văn Minh" → NM, "Minh" → M. */
function initials(n) {
  const w = String(n).trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  const s = w.length === 1 ? w[0][0] : w[0][0] + w[w.length - 1][0];
  return s.toUpperCase();
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Đọc lại hàng đợi từ localStorage và bỏ mục quá hạn.
   Gọi ngay trước mỗi lần sửa để không ghi đè hàng đợi của tab khác. */
function loadQueue() {
  const raw = readJSON(QUEUE_KEY, {});
  const now = Date.now();
  let dropped = 0;
  queue = {};
  Object.entries(raw).forEach(([id, v]) => {
    if (!v || typeof v !== 'object' || !VALID_IDS.has(id)) return;
    const ts = Date.parse(v.ts);
    if (!ts || now - ts > QUEUE_MAX_AGE_MS) { dropped++; return; }
    queue[id] = { done: !!v.done, by: String(v.by || ''), ts: v.ts };
  });
  if (dropped) writeJSON(QUEUE_KEY, queue);
  return dropped;
}

const saveQueue = () => writeJSON(QUEUE_KEY, queue);
/* ---------- trạng thái kết nối ---------- */
function setStatus(kind, text) {
  const el = $('status');
  if (!el) return;
  el.className = 'status ' + kind;
  el.innerHTML = `<span class="dot"></span>${esc(text)}`;
}

const pendingCount = () => Object.keys(queue).length;

function refreshStatus() {
  const n = pendingCount();
  if (lastError) setStatus('err', lastError);
  else if (n) setStatus('warn', `${n} thay đổi chưa lưu lên server`);
  else setStatus('ok', 'Đã đồng bộ');
}

/* ---------- tên nhân viên ---------- */
function loadName() {
  userName = (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 60);
}

function saveName(v) {
  const clean = String(v || '').trim().slice(0, 60);
  if (!clean) return false;
  localStorage.setItem(NAME_KEY, clean);
  userName = clean;
  return true;
}

function renderIdBar() {
  const bar = $('idbar');
  if (!bar) return;
  if (userName) {
    bar.innerHTML = `
      <span class="who">Đang tick với tên <b>${esc(userName)}</b></span>
      <button class="ghost" id="btnRename">Đổi tên</button>
      <span class="sp"></span>
      <span class="status load" id="status"><span class="dot"></span>Đang tải…</span>
      <button class="ghost" id="btnReload">Tải lại</button>`;
    $('btnRename').onclick = askName;
  } else {
    bar.innerHTML = `
      <span class="who">Nhập tên của bạn để bắt đầu tick:</span>
      <input type="text" id="nameInput" placeholder="Ví dụ: Minh" maxlength="60" autocomplete="name">
      <button id="btnSaveName">Lưu tên</button>
      <span class="sp"></span>
      <span class="status load" id="status"><span class="dot"></span>Đang tải…</span>
      <button class="ghost" id="btnReload">Tải lại</button>`;
    const inp = $('nameInput');
    const commit = () => {
      if (!saveName(inp.value)) { inp.focus(); return; }
      renderIdBar();
      applyLock();
      refreshStatus();
      flush();
    };
    $('btnSaveName').onclick = commit;
    inp.onkeydown = e => { if (e.key === 'Enter') commit(); };
  }
  $('btnReload').onclick = () => pull(true);
}

function askName() {
  if (!saveName(prompt('Tên của bạn (hiện lên cạnh mỗi hạng mục bạn tick):', userName))) return;
  renderIdBar();
  applyLock();
  render();
  refreshStatus();
  flush();
}

function applyLock() {
  document.body.classList.toggle('locked', !userName);
  const warn = $('needname');
  if (warn) warn.style.display = userName ? 'none' : 'block';
  document.querySelectorAll('.item input[type=checkbox]').forEach(c => { c.disabled = !userName; });
}
/* ---------- render một lần ---------- */
function renderScores() {
  const el = $('scores');
  if (!el || typeof SCORES === 'undefined') return;
  el.innerHTML = SCORES.map(([n, v, d]) => {
    const c = v <= 3 ? 'var(--p0)' : v <= 5 ? 'var(--p1)' : v <= 7 ? 'var(--p2)' : 'var(--p3)';
    return `<div class="score" title="${esc(d)}">
      <div class="lbl">${esc(n)}</div><div class="val" style="color:${c}">${v}<span
      style="font-size:13px;color:var(--muted)">/10</span></div>
      <div class="bar"><i style="width:${v * 10}%;background:${c}"></i></div></div>`;
  }).join('');
}

function renderSections() {
  $('content').innerHTML = SECTIONS.map(s => `
<section data-p="${esc(s.id)}">
  <div class="sechead">
    <span class="tag ${esc(s.tag)}">${esc(s.id)}</span>
    <h2>${esc(s.title)}</h2>
    <span class="seccount" data-sec="${esc(s.id)}"></span>
  </div>
  <p class="secnote">${s.note}</p>
  ${s.items.map(i => `
  <div class="item" data-id="${esc(i.id)}" data-p="${esc(s.id)}">
    <div class="row">
      <input type="checkbox">
      <div class="rowtxt">
        <div class="ttl">${esc(i.t)}<span class="effort">${esc(i.e)}</span></div>
        <div class="why">${esc(i.w)}</div>
        <div class="by" data-by="${esc(i.id)}"></div>
      </div>
      <div class="exp">▾</div>
    </div>
    <div class="body">${i.b}</div>
  </div>`).join('')}
</section>`).join('');
}

/* ---------- vẽ lại phần phụ thuộc dữ liệu ---------- */
/* Tên người tick do người dùng tự khai nên coi là dữ liệu KHÔNG tin được:
   dựng bằng textContent, không nhét vào innerHTML. */
function paintBy(el, rec, isDone, pending) {
  el.textContent = '';
  el.classList.toggle('pending', pending);
  if (!rec || !rec.by) return;

  const avt = document.createElement('span');
  avt.className = 'avt';
  avt.textContent = initials(rec.by);
  el.appendChild(avt);

  const label = (isDone ? ' tick' : ' bỏ tick') + (rec.at ? ' · ' + fmtTime(rec.at) : '');
  el.appendChild(document.createTextNode(rec.by + label));

  if (pending) {
    const b = document.createElement('b');
    b.textContent = ' · chưa lưu';
    el.appendChild(b);
  }
}

function render() {
  const items = [...document.querySelectorAll('.item')];
  let done = 0;

  items.forEach(el => {
    const id = el.dataset.id;
    const rec = state[id];
    const isDone = !!(rec && rec.done);
    if (isDone) done++;

    el.classList.toggle('done', isDone);
    const box = el.querySelector('input[type=checkbox]');
    if (box.checked !== isDone) box.checked = isDone;

    paintBy(el.querySelector('[data-by]'), rec, isDone, !!queue[id]);
  });

  const total = items.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  $('progtxt').textContent = `${done} / ${total} hạng mục`;
  $('progpct').textContent = pct + '%';
  $('progbar').style.width = pct + '%';

  SECTIONS.forEach(s => {
    const el = document.querySelector(`[data-sec="${s.id}"]`);
    if (!el) return;
    const d = s.items.filter(i => state[i.id] && state[i.id].done).length;
    el.textContent = `${d}/${s.items.length}`;
  });

  applyFilter();
}
/* ---------- tải từ server ---------- */
/* Quy tắc gộp, theo thứ tự ưu tiên:
   1. Hạng mục đang trong hàng đợi → giữ bản trong máy (chưa đẩy lên được).
   2. Hạng mục có lần ghi cục bộ, HOẶC lần ghi được server xác nhận, xảy ra SAU khi
      request này bắt đầu → giữ bản trong máy. Dữ liệu server trả về là ảnh chụp lúc
      request bắt đầu, có thể chụp trước khi lần ghi đó kịp vào DB.
   3. Còn lại → server là nguồn thật.
   Nếu request lỗi thì GIỮ NGUYÊN bản đang có, không bao giờ coi "rỗng" là sự thật. */
function localWins(id, startedAt) {
  if (queue[id]) return true;
  if (writeAt[id] && writeAt[id] >= startedAt) return true;
  /* Đây là chỗ dễ mất tick nhất: bấm lúc 10:00:00, refetch chạy lúc 10:00:01,
     POST mới vào DB lúc 10:00:02. Ảnh chụp của refetch không có tick đó, mà lúc
     nó về thì hàng đợi đã sạch → nếu chỉ so `writeAt` thì server sẽ bỏ tick. */
  return !!(confirmedAt[id] && confirmedAt[id] >= startedAt);
}

async function pull(manual) {
  const startedAt = Date.now();
  if (manual) setStatus('load', 'Đang tải lại…');
  try {
    const url = `${REST}?select=item_id,done,updated_by,updated_at` +
      `&checklist_id=eq.${encodeURIComponent(CHECKLIST_ID)}`;
    const res = await fetch(url, { headers: HDRS, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('phản hồi không hợp lệ');

    const fresh = {};
    rows.forEach(r => {
      if (!VALID_IDS.has(r.item_id)) return;
      fresh[r.item_id] = { done: !!r.done, by: r.updated_by || '', at: r.updated_at || '' };
    });

    Object.keys(state).forEach(id => {
      if (localWins(id, startedAt)) fresh[id] = state[id];
    });
    Object.keys(queue).forEach(id => {
      if (!fresh[id]) fresh[id] = { done: queue[id].done, by: queue[id].by, at: queue[id].ts };
    });

    state = fresh;
    writeJSON(CACHE_KEY, state);
    lastError = '';
    render();
    refreshStatus();
    flush();
    return true;
  } catch (err) {
    lastError = 'Không tải được từ server — đang xem bản trong máy' +
      (pendingCount() ? ` · ${pendingCount()} chưa lưu` : '');
    refreshStatus();
    return false;
  }
}

/* ---------- đẩy hàng đợi lên server ---------- */
/* Mỗi hạng mục một request RPC. Chạy tuần tự, một lượt flush tại một thời điểm,
   để thứ tự ghi không bị đảo. Lỗi 4xx (trừ 408/429) là lỗi vĩnh viễn → bỏ khỏi
   hàng đợi và báo rõ, không retry vô tận. */
async function flush() {
  if (flushing || !userName) return;
  loadQueue();
  if (!pendingCount()) { render(); refreshStatus(); return; }

  flushing = true;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }

  let networkFail = false;
  let permanentFail = '';

  for (const [id, v] of Object.entries({ ...queue })) {
    let res;
    try {
      res = await fetch(RPC, {
        method: 'POST',
        headers: HDRS,
        body: JSON.stringify({
          p_checklist_id: CHECKLIST_ID,
          p_item_id: id,
          p_done: v.done,
          p_updated_by: v.by,
          p_client_ts: v.ts,
        }),
      });
    } catch {
      networkFail = true;
      break;                                  // mất mạng: giữ nguyên phần còn lại
    }

    if (res.ok) {
      const rows = await res.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      loadQueue();
      if (queue[id] && queue[id].ts === v.ts) { delete queue[id]; saveQueue(); }
      if (row) state[id] = { done: !!row.out_done, by: row.out_updated_by || '', at: row.out_updated_at || '' };
      confirmedAt[id] = Date.now();
      writeJSON(CACHE_KEY, state);
      continue;
    }

    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      networkFail = true;
      break;
    }

    /* Lỗi vĩnh viễn (tên không hợp lệ, id sai định dạng, checklist_id lạ…).
       Giữ lại hàng đợi sẽ làm badge treo mãi → bỏ đi và nói rõ lý do. */
    const body = await res.text().catch(() => '');
    let msg = '';
    try { msg = JSON.parse(body).message || ''; } catch { msg = body.slice(0, 120); }
    permanentFail = `Không lưu được "${id}": ${msg || 'HTTP ' + res.status}`;
    loadQueue();
    delete queue[id];
    saveQueue();
  }

  flushing = false;

  if (permanentFail) lastError = permanentFail;
  else if (networkFail) lastError = `${pendingCount()} thay đổi chưa lưu — sẽ tự thử lại`;
  else lastError = '';

  render();
  refreshStatus();

  if (!pendingCount()) return;
  if (permanentFail) return;
  /* Thành công nhưng hàng đợi vẫn còn: người dùng bấm thêm trong lúc đang đẩy.
     Đẩy tiếp ngay, đừng bắt họ chờ 15 giây. */
  if (!networkFail) { flush(); return; }
  retryTimer = setTimeout(flush, 15000);
}

/* ---------- ghi một thay đổi ---------- */
function setItem(id, done) {
  if (!userName || !VALID_IDS.has(id)) return;
  const ts = new Date().toISOString();
  loadQueue();                                // hoà với thay đổi của tab khác
  queue[id] = { done, by: userName, ts };
  state[id] = { done, by: userName, at: ts };
  writeAt[id] = Date.now();
  saveQueue();
  writeJSON(CACHE_KEY, state);
  lastError = '';
  render();
  refreshStatus();
  flush();
}
/* ---------- lọc ---------- */
let curF = 'all';
function applyFilter() {
  document.querySelectorAll('.item').forEach(i => {
    let show = true;
    if (curF === 'todo') show = !(state[i.dataset.id] && state[i.dataset.id].done);
    else if (curF !== 'all') show = i.dataset.p === curF;
    i.classList.toggle('hidden', !show);
  });
  document.querySelectorAll('section').forEach(s => {
    const any = [...s.querySelectorAll('.item')].some(i => !i.classList.contains('hidden'));
    s.classList.toggle('hidden', !any);
  });
}

/* ---------- sự kiện ---------- */
function wire() {
  $('content').addEventListener('click', e => {
    const item = e.target.closest('.item');
    if (!item) return;

    if (e.target.type === 'checkbox') {
      if (!userName) {
        e.preventDefault();
        e.target.checked = !e.target.checked;
        askName();
        return;
      }
      setItem(item.dataset.id, e.target.checked);
      return;
    }
    if (e.target.closest('.row')) item.classList.toggle('open');
  });

  $('filters').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    document.querySelectorAll('#filters button[data-f]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    curF = b.dataset.f;
    applyFilter();
  });

  $('expandAll').onclick = () => document.querySelectorAll('.item').forEach(i => i.classList.add('open'));
  $('collapseAll').onclick = () => document.querySelectorAll('.item').forEach(i => i.classList.remove('open'));

  /* Bỏ tick MỌI hạng mục là việc ảnh hưởng cả team và không có nút hoàn tác,
     nên bắt gõ đúng tên checklist để xác nhận. Không xoá row: giữ dấu vết ai bỏ tick. */
  $('reset').onclick = () => {
    if (!userName) { askName(); return; }
    const on = Object.keys(state).filter(id => state[id].done && VALID_IDS.has(id));
    if (!on.length) { alert('Chưa có hạng mục nào được tick.'); return; }

    const answer = prompt(
      `Bỏ tick toàn bộ ${on.length} hạng mục của CẢ TEAM (không chỉ máy bạn).\n` +
      `Việc này không hoàn tác được từ trang này.\n\n` +
      `Gõ đúng "${CHECKLIST_ID}" để xác nhận:`
    );
    if (answer === null) return;
    if (answer.trim() !== CHECKLIST_ID) { alert('Gõ không đúng — đã huỷ, không có gì thay đổi.'); return; }

    const ts = new Date().toISOString();
    const now = Date.now();
    loadQueue();
    on.forEach(id => {
      queue[id] = { done: false, by: userName, ts };
      state[id] = { done: false, by: userName, at: ts };
      writeAt[id] = now;
    });
    saveQueue();
    writeJSON(CACHE_KEY, state);
    lastError = '';
    render();
    refreshStatus();
    flush();
  };

  window.addEventListener('online', () => { lastError = ''; flush(); pull(); });
  window.addEventListener('offline', () => {
    lastError = 'Máy đang offline — tick vẫn được, sẽ lưu khi có mạng';
    refreshStatus();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });

  /* Tab khác cùng máy vừa sửa hàng đợi hoặc bộ đệm → hoà lại để hai tab không
     ghi đè lẫn nhau. So theo mốc thời gian, không theo "tab nào ghi trước":
     tab này từng tick hạng mục X không có nghĩa nó được phớt lờ vĩnh viễn việc
     tab kia bỏ tick X sau đó. */
  window.addEventListener('storage', e => {
    if (e.key !== QUEUE_KEY && e.key !== CACHE_KEY) return;
    loadQueue();
    if (e.key === CACHE_KEY) {
      const fresh = readJSON(CACHE_KEY, {});
      Object.entries(fresh).forEach(([id, rec]) => {
        if (!VALID_IDS.has(id) || !rec) return;
        const mine = state[id];
        const theirs = Date.parse(rec.at) || 0;
        const ours = mine ? (Date.parse(mine.at) || 0) : -1;
        if (theirs >= ours) state[id] = rec;
      });
    }
    render();
    refreshStatus();
  });
}

/* ---------- khởi động ---------- */
loadName();
loadQueue();
state = readJSON(CACHE_KEY, {});        // hiện ngay bản trong máy, khỏi nhìn trang trắng
Object.keys(state).forEach(id => { if (!VALID_IDS.has(id)) delete state[id]; });

renderScores();
renderSections();
renderIdBar();
wire();
applyLock();
render();
refreshStatus();
pull();
