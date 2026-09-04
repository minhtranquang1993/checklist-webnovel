#!/usr/bin/env node
/* check-out.js — cửa gác trước khi upload file checklist lên hub.
   ------------------------------------------------------------
   Mọi luật ở đây là luật THẬT của hub, lấy bằng cách `require` chính
   assets/parse-def.js + assets/sanitize.js của repo (xem contract.js). Script này chỉ thêm
   những phép kiểm mà hai module đó không làm: quét ký tự browser sẽ đổi, đối chiếu với DB,
   và kiểm những field validateDef cắt ÂM THẦM (cắt mà không warning thì bản local hiện đủ
   chữ còn bản hub bị cụt).

   Dùng:
     node check-out.js file.html                      # kiểm trước khi upload
     node check-out.js file.html --offline            # bỏ 2 bước cần mạng
     node check-out.js file.html --after-upload       # so bản đã lưu trên DB với file
     node check-out.js file.html --repo=/path/to/repo

   Exit 0 = upload được. Exit 1 = có lỗi chặn. Exit 2 = sai cách gọi.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('./contract.js');

const args = process.argv.slice(2);
const has = n => args.includes('--' + n);
const flag = n => {
  const hit = args.find(a => a.startsWith('--' + n + '='));
  return hit ? hit.slice(n.length + 3) : '';
};
const file = args.find(a => !a.startsWith('--'));
if (!file) {
  console.error('FAIL: thiếu file. Dùng: node check-out.js file.html [--offline] [--after-upload] [--repo=…]');
  process.exit(2);
}

const fails = [];
const warns = [];
const notes = [];
const bad = (step, msg) => fails.push(`[${step}] ${msg}`);

let repo, sanitizeHtml, validateDef;
try {
  const loaded = C.loadRepo(flag('repo'), __dirname);
  repo = loaded.repo;
  sanitizeHtml = loaded.sanitizeHtml;
  validateDef = loaded.validateDef;
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}

const html = fs.readFileSync(file, 'utf8');

/* ---------- 1. bóc khối DATA đúng cách hub bóc ---------- */
const blocks = C.extractDataBlock(html);
if (blocks.length !== 1) {
  bad(1, blocks.length === 0
    ? 'không có khối <script> inline nào khai `const SECTIONS` — hub sẽ rơi xuống đường đọc ' +
      'checkbox và ném NOT_CHECKLIST (file render bằng JS không có checkbox tĩnh nào)'
    : `có ${blocks.length} khối inline cùng khai SECTIONS — hub chỉ lấy khối ĐẦU TIÊN, ` +
      'phần còn lại bị bỏ im lặng');
}
const code = blocks[0] || '';
if (code && !/CHECKLIST_ID/.test(code)) {
  bad(1, 'khối DATA không khai `CHECKLIST_ID` — hub sẽ suy mã từ TÊN FILE ' +
    '(parse-def.js:88-99), tức là mỗi lần đổi tên file là một checklist mới, 0 tick');
}

/* ---------- 2. chuỗi phá tokenizer + template literal ---------- */
C.scanScriptHazards(code).forEach(m => bad(2, m));

/* ---------- 3. chạy khối DATA như sandbox của hub ---------- */
/* Context RỖNG: không document/window/localStorage. Chặt hơn sandbox thật của browser (ở
   đó `document` có, chỉ localStorage ném) nên nó chứng minh "khối DATA thuần dữ liệu",
   không phải "browser chạy được". */
let raw = null;
if (code) {
  try {
    const ctx = vm.createContext({});
    vm.runInContext(code, ctx);
    /* Phải đọc bằng lần chạy THỨ HAI: top-level `const` nằm ở global lexical environment
       của context, không thành thuộc tính của nó — `ctx.SECTIONS` là undefined. */
    raw = JSON.parse(vm.runInContext(
      'JSON.stringify({id:(typeof CHECKLIST_ID!=="undefined"?CHECKLIST_ID:null),' +
      'scores:(typeof SCORES!=="undefined"?SCORES:[]),sections:SECTIONS,title:""})', ctx));
  } catch (err) {
    bad(3, 'khối DATA ném khi chạy: ' + err.message +
      (/is not defined/.test(err.message)
        ? ' — nếu là `${…}` trong body thì đó là nội suy template literal; mọi giá trị phải là chuỗi JSON'
        : ''));
  }
}

/* Không dừng sớm ở đây kể cả khi khối DATA ném: các bước dưới đều chịu được `raw` rỗng
   (validateDef sẽ báo "dữ liệu rỗng"), và báo cáo một lần ở cuối thì dễ đọc hơn là hai
   đường thoát khác nhau. */

/* ---------- 4. luật cấu trúc thật của hub ---------- */
let def = null;
try {
  const parsed = validateDef(raw, true);
  def = parsed.def;
  parsed.warnings.forEach(w => warns.push('[4] validateDef: ' + w));
} catch (err) {
  bad(4, 'validateDef từ chối file: ' + err.message);
}

const sections = (raw && Array.isArray(raw.sections)) ? raw.sections : [];
const items = [];
sections.forEach(s => (s.items || []).forEach(i => items.push({ sec: s.id, ...i })));

/* ---------- 2b. khuôn object literal (để file dùng được cả khi nằm ở gốc repo) ---------- */
const hits = code.match(C.ITEM_RE) || [];
if (items.length && hits.length !== items.length) {
  bad('2b', `ITEM_RE của tools/verify.py đếm ra ${hits.length} hạng mục nhưng file có ` +
    `${items.length}. Nguyên nhân hay gặp: JSON.stringify cả object nên key có ngoặc kép ` +
    '("id": thay vì id:). Hệ quả: copy file vào gốc repo thì verify.py exit 1 và form ' +
    '"Đăng ký file trong repo" từ chối');
}
const secIds = new Set(sections.map(s => String(s.id)));
hits.filter(h => secIds.has((h.match(/id:"([^"]+)"/) || [])[1]))
  .forEach(h => bad('2b', `section bị ITEM_RE đếm thành hạng mục (${h.trim()}) — trong mỗi ` +
    'section, `tag:` phải là key đứng NGAY SAU `id:`'));

/* ---------- 2c + 5 + 5b: nội dung từng hạng mục ---------- */
const CUT = C.LIMITS;
sections.forEach(s => {
  C.scanLiterals(String(s.note || '')).forEach(m => bad('2c', `nhóm ${s.id} · note: ${m}`));
  const n = String(s.note || '');
  if (n && sanitizeHtml(n) !== n) bad(5, diffMsg(`nhóm ${s.id} · note`, n, sanitizeHtml(n)));
});
items.forEach(i => {
  const b = String(i.b || '');
  C.scanLiterals(b).forEach(m => bad('2c', `hạng mục ${i.id} · b: ${m}`));
  if (b && sanitizeHtml(b) !== b) bad(5, diffMsg(`hạng mục ${i.id} · b`, b, sanitizeHtml(b)));
  if (String(i.t || '').length > CUT.title) bad('5b', `hạng mục ${i.id}: \`t\` dài ${String(i.t).length} > ${CUT.title} — hub cắt âm thầm`);
  if (String(i.w || '').length > CUT.title) bad('5b', `hạng mục ${i.id}: \`w\` dài ${String(i.w).length} > ${CUT.title} — hub cắt âm thầm`);
  if (String(i.e || '').length > CUT.effort) bad('5b', `hạng mục ${i.id}: \`e\` dài ${String(i.e).length} > ${CUT.effort} — hub cắt âm thầm`);
});

function diffMsg(where, src, out) {
  let at = 0;
  while (at < src.length && at < out.length && src[at] === out[at]) at++;
  return `${where}: sanitize của hub sẽ đổi nội dung (bản local và bản hub sẽ khác nhau). ` +
    `Lệch từ ký tự ${at}:\n      file: ${JSON.stringify(src.slice(Math.max(0, at - 60), at + 90))}` +
    `\n      hub : ${JSON.stringify(out.slice(Math.max(0, at - 60), at + 90))}`;
}

/* ---------- 6. mã checklist ---------- */
const ID = raw ? String(raw.id || '') : '';
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(ID)) {
  bad(6, `CHECKLIST_ID "${ID}" sai định dạng — chỉ chữ thường/số/gạch ngang, tối đa 40 ký tự ` +
    '(cả parse-def.js:50 và schema.sql:377-379 đều chặn)');
}

/* ---------- 9. SCORES ---------- */
(raw && Array.isArray(raw.scores) ? raw.scores : []).forEach((row, ri) => {
  if (!Array.isArray(row) || row.length < 2 || !isFinite(Number(row[1]))) {
    warns.push(`[9] scores[${ri}] không đúng dạng [tên, điểm, ghi chú] — hub bỏ dòng này`);
    return;
  }
  if (String(row[2] == null ? '' : row[2]).includes('"')) {
    bad(9, `scores[${ri}] ("${String(row[0]).slice(0, 40)}") có dấu " trong ghi chú — ` +
      'sync.js:184 render title="${esc(d)}" mà esc() không escape dấu ", attribute đóng sớm');
  }
  if (String(row[0]).length > CUT.scoreName) bad('5b', `scores[${ri}]: tên trục dài quá ${CUT.scoreName} — hub cắt âm thầm`);
  if (String(row[2] == null ? '' : row[2]).length > CUT.scoreNote) bad('5b', `scores[${ri}]: ghi chú dài quá ${CUT.scoreNote} — hub cắt âm thầm`);
});

/* Điểm cao mà nhóm P0 lại có hạng mục của trục đó là mâu thuẫn — chỉ cảnh báo, vì việc gán
   hạng mục vào trục nào là suy đoán theo chữ, không phải dữ liệu. */
const p0 = sections.filter(s => String(s.id).toUpperCase() === 'P0');
const nP0 = p0.reduce((n, s) => n + (s.items || []).length, 0);
(raw && Array.isArray(raw.scores) ? raw.scores : []).forEach(row => {
  if (Array.isArray(row) && Number(row[1]) >= 8 && nP0 > 0) {
    const key = String(row[0]).toLowerCase().split(/[^a-zà-ỹ]+/).filter(w => w.length > 3)[0] || '';
    const touched = key && p0.some(s => (s.items || []).some(i =>
      (String(i.t) + ' ' + String(i.w)).toLowerCase().includes(key)));
    if (touched) warns.push(`[9] trục "${row[0]}" được ${row[1]}/10 mà nhóm P0 có hạng mục nhắc tới nó — xem lại điểm`);
  }
});

/* ---------- 10. kích thước ---------- */
const size = JSON.stringify(sections).length;
if (size > CUT.total) {
  bad(10, `dữ liệu ${Math.round(size / 1024)}KB > trần ${Math.round(CUT.total / 1024)}KB ` +
    '(parse-def.js:61 và constraint checklist_defs_shape) — DB sẽ từ chối');
} else if (size > CUT.warnTotal) {
  bad(10, `dữ liệu ${Math.round(size / 1024)}KB, gần trần ${Math.round(CUT.total / 1024)}KB. ` +
    'Cách thoát: cắt `b` của các hạng mục ĐÃ XONG xuống còn số đo kết thúc — giữ id nên giữ tick');
}

/* ---------- 7 + 8: đối chiếu DB (cần mạng) ---------- */
function supabase() {
  const cfg = fs.readFileSync(path.join(repo, 'assets/config.js'), 'utf8');
  const url = (cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
  const key = (cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('không đọc được SUPABASE_URL / anon key trong assets/config.js');
  return { url: url.replace(/\/+$/, ''), key };
}

async function get(sb, pathAndQuery) {
  const res = await fetch(`${sb.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: sb.key, Authorization: 'Bearer ' + sb.key },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

const MARK_RE = /Audit host:\s*([^<·\n]+)/;
const markOf = secs => {
  for (const s of secs || []) {
    const m = MARK_RE.exec(String(s.note || ''));
    if (m) return m[1].trim();
  }
  return '';
};

async function checkDb() {
  const sb = supabase();
  const rows = await get(sb, `checklists?id=eq.${encodeURIComponent(ID)}&select=id,kind,name,total`);
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row) {
    notes.push(`mã "${ID}" chưa có trên hub — đây là checklist MỚI, upload sẽ tạo nó`);
    return;
  }
  if (row.kind === 'file') {
    bad(7, `mã "${ID}" đang thuộc một checklist dạng FILE trong repo (${row.name}). ` +
      'upload_checklist_def (schema.sql:386-390) sẽ raise 23505. Chạy lại với id= khác');
    return;
  }

  const defs = await get(sb, `checklist_defs?id=eq.${encodeURIComponent(ID)}&select=sections`);
  const oldSections = (Array.isArray(defs) && defs[0] && defs[0].sections) || [];
  const oldMark = markOf(oldSections);
  const newMark = markOf(sections);

  if (!oldMark) {
    if (!has('force-id')) {
      bad(7, `mã "${ID}" đã có trên hub nhưng bản đang lưu KHÔNG có dấu "Audit host:" — ` +
        'không xác nhận được nó có phải cùng site hay không. Nếu chắc là cùng site, chạy lại ' +
        'với --force-id (tick hiện có vẫn giữ nguyên)');
    } else {
      warns.push(`[7] bản đang lưu không có dấu "Audit host:", đi tiếp vì có --force-id`);
    }
  } else if (oldMark !== newMark) {
    if (!has('force-id')) {
      bad(7, `mã "${ID}" đang giữ audit của host "${oldMark}", còn file này là của "${newMark}". ` +
        'Upload sẽ ghi đè nội dung của site kia. Đổi id= hoặc dùng --force-id nếu đúng là cùng site đổi tên');
    } else {
      warns.push(`[7] host lưu "${oldMark}" ≠ host file "${newMark}", đi tiếp vì có --force-id`);
    }
  }

  const prog = await get(sb, `checklist_progress?checklist_id=eq.${encodeURIComponent(ID)}&select=item_id,done`);
  const before = new Set();
  (Array.isArray(prog) ? prog : []).forEach(r => before.add(r.item_id));
  oldSections.forEach(s => (s.items || []).forEach(i => before.add(i.id)));
  const now = new Set(items.map(i => i.id));
  const gone = [...before].filter(id => !now.has(id)).sort();
  const goneTicked = (Array.isArray(prog) ? prog : []).filter(r => r.done && !now.has(r.item_id)).map(r => r.item_id);

  if (goneTicked.length) {
    bad(8, `bản mới thiếu ${goneTicked.length} hạng mục ĐÃ ĐƯỢC TICK: ${goneTicked.join(', ')}. ` +
      'schema.sql:410-415 sẽ chặn (và nút force trên hub thì XOÁ tick đó). Giữ lại hạng mục, ' +
      'chỉ đổi `w` thành "ĐÃ XONG — {số đo mới}"');
  } else if (gone.length) {
    bad(8, `bản mới thiếu ${gone.length} hạng mục từng có trên hub: ${gone.slice(0, 12).join(', ')}` +
      (gone.length > 12 ? '…' : '') + '. Chưa ai tick nên DB không chặn, nhưng đó là mất lịch sử ' +
      'audit — giữ lại và đổi `w` thành "ĐÃ XONG"');
  } else {
    notes.push(`audit lần ${oldSections.length ? '2+' : '1'}: giữ đủ ${before.size} id đã từng có trên hub`);
  }
}

async function afterUpload() {
  const sb = supabase();
  const defs = await get(sb, `checklist_defs?id=eq.${encodeURIComponent(ID)}&select=sections`);
  const stored = (Array.isArray(defs) && defs[0] && defs[0].sections) || null;
  if (!stored) {
    bad('after', `chưa có bản nào của "${ID}" trên hub — upload trước rồi chạy lại`);
    return;
  }
  const map = new Map();
  stored.forEach(s => {
    map.set('note:' + s.id, String(s.note || ''));
    (s.items || []).forEach(i => {
      map.set('b:' + i.id, String(i.b || ''));
      map.set('t:' + i.id, String(i.t || ''));
      map.set('w:' + i.id, String(i.w || ''));
      map.set('e:' + i.id, String(i.e || ''));
    });
  });
  let diff = 0;
  const cmp = (key, mine) => {
    if (!map.has(key)) { bad('after', `hub không có ${key} — hạng mục bị bỏ hoặc đổi id`); diff++; return; }
    if (map.get(key) !== mine) { bad('after', diffMsg('hub vs file · ' + key, mine, map.get(key))); diff++; }
  };
  sections.forEach(s => cmp('note:' + s.id, String(s.note || '')));
  items.forEach(i => {
    cmp('b:' + i.id, String(i.b || ''));
    cmp('t:' + i.id, String(i.t || ''));
    cmp('w:' + i.id, String(i.w || ''));
    cmp('e:' + i.id, String(i.e || ''));
  });
  if (!diff) {
    notes.push('bản trên hub khớp BYTE với file local trên toàn bộ ' + (sections.length + items.length * 4) +
      ' trường — đây là bằng chứng thật cho "preview = bản hub", vì bản trên hub đã đi qua ' +
      'sanitize của browser thật, không phải dom-shim');
  }
}

/* ---------- 11. báo cáo ---------- */
function report() {
  const nSec = sections.length;
  console.log('');
  console.log('contract-version  ' + C.CONTRACT_VERSION + '   · repo: ' + repo);
  console.log('file              ' + file);
  console.log('mã checklist      ' + (ID || '(không có)'));
  if (nSec) {
    console.log('nhóm              ' + nSec + ' (' + sections.map(s => s.id + ':' + (s.items || []).length).join(', ') + ')');
    console.log('hạng mục          ' + items.length);
    console.log('nút filter        ' + (nSec + 2) + ' (Tất cả + ' + nSec + ' nhóm + Chưa xong)');
    console.log('KB dữ liệu        ' + Math.round(size / 1024) + 'KB / trần ' + Math.round(CUT.total / 1024) + 'KB');
    console.log('dấu host          ' + (markOf(sections) || '(chưa gắn)'));
  }
  notes.forEach(n => console.log('· ' + n));
  if (warns.length) {
    console.log('\nCẢNH BÁO (' + warns.length + ') — upload được nhưng nên xem:');
    warns.forEach(w => console.log('  • ' + w));
  }
  if (fails.length) {
    console.log('\nFAIL (' + fails.length + ') — KHÔNG upload cho tới khi sửa hết:');
    fails.forEach(f => console.log('  • ' + f));
  } else {
    console.log('\nOK — file upload được. Mở index.html của repo → ⬆ Upload file HTML → chọn file này.');
  }
}

(async () => {
  const online = !has('offline');
  if (online) {
    try {
      if (has('after-upload')) await afterUpload(); else await checkDb();
    } catch (err) {
      warns.push('[7-8] không kiểm được với DB (' + err.message + ') — hai lỗi nguy hiểm nhất ' +
        '(mã thuộc file trong repo, bỏ hạng mục đã tick) CHƯA được kiểm');
    }
  } else {
    warns.push('[7-8] --offline: chưa đối chiếu với DB, có thể bị từ chối lúc upload');
  }
  report();
  process.exit(fails.length ? 1 : 0);
})();

