/* ============================================================
   parse-def.js — bóc dữ liệu checklist từ file HTML người dùng chọn
   ------------------------------------------------------------
   File upload theo khuôn của webnovel-vn.html: một thẻ <script> inline khai
   `const SCORES` và `const SECTIONS` (và có thể cả `const CHECKLIST_ID`). Đó là
   **JS literal**, không phải JSON — key không có ngoặc kép, `b:` dùng backtick
   nhiều dòng. Viết parser tay cho thứ đó thì giòn, nên thay vì đoán, ta cho chính
   browser chạy nó.

   Thứ BẮT BUỘC phải có trong file là `SECTIONS` — đó là dữ liệu hạng mục, không
   suy ra từ đâu được. `CHECKLIST_ID` thì tuỳ chọn: nhiều file checklist bản cũ
   (chạy độc lập, lưu tick trong localStorage) không có nó, nên trang hub suy mã từ
   tên file rồi cho người dùng sửa. Mã đó là khoá gắn tick trong DB, nên chỉ cần nó
   ĐÚNG và ỔN ĐỊNH, không cần phải nằm trong file.

   Chạy ở đâu: <iframe sandbox="allow-scripts">, KHÔNG có allow-same-origin.
   Nghĩa là script chạy trong một origin mờ (opaque):
     - không đọc được DOM của trang hub,
     - không đọc được localStorage → không thấy anon key, không thấy tên nhân viên,
     - không điều hướng được tab, không mở popup.
   Nó chỉ có một đường ra duy nhất: postMessage. Kết quả nhận về được xác thực bằng
   `event.source === iframe.contentWindow` — origin của sandbox là chuỗi "null" nên
   không dùng để so được.

   Chỉ nhét phần script INLINE khai SECTIONS vào srcdoc — không nạp `<script src>`
   nào, nên file có trỏ tới assets/sync.js hay CDN gì cũng không chạy.

   Sau khi bóc xong, validateDef() kiểm cấu trúc và sanitize toàn bộ HTML. Hàm đó
   thuần logic, không cần DOM, nên test được bằng node.
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

   `fallbackId` là mã suy từ tên file, chỉ dùng khi file không khai CHECKLIST_ID.
   Trả về kèm `idFromFile` để giao diện biết nên cho sửa ô mã hay khoá nó lại: mã
   lấy từ file thì để read-only (file là nguồn thật), mã suy ra thì cho sửa. */
async function parseChecklistFile(html, fallbackId) {
  const code = extractInlineScript(str(html));
  if (!code) {
    throw new Error(
      'Không tìm thấy thẻ <script> nào khai `const SECTIONS` — đây có phải file checklist không? ' +
      '(Copy webnovel-vn.html rồi sửa dữ liệu hạng mục.)'
    );
  }

  const raw = await runInSandbox(code, 5000);
  const idFromFile = !!str(raw.id).trim();
  const parsed = validateDef(
    Object.assign({}, raw, { id: idFromFile ? raw.id : str(fallbackId) }),
    idFromFile
  );
  parsed.idFromFile = idFromFile;
  return parsed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateDef, extractInlineScript, slugFromFilename, DEF_ID_RE, LIMITS,
  };
}
