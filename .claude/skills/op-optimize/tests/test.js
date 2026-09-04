#!/usr/bin/env node
/* test.js — test cho op-optimize. Chạy: node .claude/skills/op-optimize/tests/test.js
   ------------------------------------------------------------
   Ba phần:
     1. BẰNG CHỨNG — file do build-file.js dựng đi qua ĐÚNG đường upload của hub
        (extractInlineScript → vm như sandbox → validateDef → sanitizeHtml).
     2. RENDERER — buildHtml() của templates/render.js chia esc/thô giống assets/sync.js.
     3. CỬA GÁC — 16 kiểu file sai, mỗi kiểu phải làm check-out.js fail ĐÚNG BƯỚC nó nhắm.
        Chạy check-out.js như tiến trình con để test đúng cái sẽ chạy thật, kể cả exit code.

   Không cần mạng: mọi lần gọi check-out.js đều có --offline. */
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const SKILL = path.resolve(__dirname, '..');
const C = require(path.join(SKILL, 'scripts/contract.js'));
const { repo, sanitizeHtml, validateDef } = C.loadRepo(
  (process.argv.slice(2).find(a => a.startsWith('--repo=')) || '').slice(7), __dirname);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m)); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'op-test-'));

/* ---------- dữ liệu mẫu ---------- */
/* Body cố tình chứa đủ thứ hay làm vỡ tầng chuỗi JS và tầng sanitize: ${, backtick, \d,
   \ nối dòng, &lt;script&gt; dạng entity, bảng có thead/tbody, link đủ target/rel. */
const BODY = [
  '<h4>Số đo hiện tại</h4>',
  '<table><thead><tr><th>Chỉ số</th><th>Đo được</th><th>Nên là</th></tr></thead>',
  '<tbody><tr><td>TTFB</td><td class="bad">2,41s</td><td class="good">&lt; 0,8s</td></tr>',
  '<tr><td colspan="2"><code>content-encoding</code> thiếu</td><td>br hoặc gzip</td></tr></tbody></table>',
  '<p>HTML thô trả <code>document.body</code> rỗng, GTM đẩy qua <code>window.dataLayer</code>,',
  'banner cookie ghi <code>localStorage</code> — nội dung chỉ có sau khi chạy JS.</p>',
  '<h4>Cách làm</h4>',
  '<pre><code>&lt;script type="application/ld+json"&gt;{"@type":"Article"}&lt;/script&gt;</code></pre>',
  '<h4>Lệnh verify</h4>',
  '<pre><code>curl -sS -o /dev/null -w "code=%{http_code} ttfb=%{time_starttransfer}s\\n" \\',
  '  -A "OAI-SearchBot/1.0" https://example.vn/ &gt; /tmp/a.txt',
  'grep -oE "^[0-9]{3}" /tmp/a.txt | head -3',
  'echo "${HOST} và `date` là chữ trần"</code></pre>',
  '<p><b>Đạt khi:</b> code = 200 và ttfb &lt; 0,8s, nén ≥ 70%.</p>',
  '<ul><li>bot có trả link: <code>OAI-SearchBot</code><ul><li>bot training: <code>GPTBot</code></li></ul></li></ul>',
  '<div class="callout warn"><b>Bẫy:</b> sửa <code>robots.txt</code> không gỡ được chặn 403 → <a href="https://developers.google.com/search/docs" target="_blank" rel="noopener noreferrer">tài liệu Google</a>.</div>',
].join('\n');

const spec = () => ({
  id: 'op-test-example-vn-0001',
  host: 'example.vn',
  url: 'https://example.vn/',
  date: '2026-09-04',
  title: 'Audit on-page — example.vn',
  sub: 'test',
  chips: ['Ngày audit: 04/09/2026'],
  method: ['<code>bash probe.sh https://example.vn/</code>'],
  cannot: ['Core Web Vitals thật → PageSpeed Insights'],
  scores: [['Technical SEO', 7, 'canonical self, còn 4 biến thể URL trả 200'],
    ['GEO / AIO', 3, '9/18 user-agent nhận 403']],
  sections: [
    { id: 'P0', tag: 't-p0', title: 'P0 — 1 lỗi chặn traffic', note: '<p>Làm trong 48h.</p>',
      items: [{ id: 'bot-ai-403', t: 'Gỡ chặn 403 cho bot AI search', w: 'Mất 3 kênh AI search', e: '1–3h', b: BODY }] },
    { id: 'VFY', tag: 't-bl', title: 'Bộ lệnh verify', note: '<p>Chạy lại sau khi sửa.</p>',
      items: [{ id: 'vfy-bots', t: 'Chạy lại bảng status theo user-agent', w: '', e: '5 phút',
        b: '<h4>Lệnh</h4>\n<pre><code>bash probe.sh https://example.vn/</code></pre>' }] },
  ],
});

function build(s, name) {
  const jsonPath = path.join(TMP, name + '.json');
  const htmlPath = path.join(TMP, name + '.html');
  fs.writeFileSync(jsonPath, JSON.stringify(s), 'utf8');
  const out = execFileSync('node', [path.join(SKILL, 'scripts/build-file.js'), jsonPath,
    '--out=' + htmlPath, '--repo=' + repo], { encoding: 'utf8' });
  return { html: fs.readFileSync(htmlPath, 'utf8'), htmlPath, out };
}

function gate(html, name, extra) {
  const p = path.join(TMP, name + '.html');
  fs.writeFileSync(p, html, 'utf8');
  const r = spawnSync('node', [path.join(SKILL, 'scripts/check-out.js'), p, '--offline',
    '--repo=' + repo].concat(extra || []), { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* ---------- 1. bằng chứng: đi đúng đường upload của hub ---------- */
console.log('\n1 — file do build-file.js dựng đi qua đường upload của hub');
const good = build(spec(), 'good');
const blocks = C.extractDataBlock(good.html);
ok(blocks.length === 1, 'có đúng 1 khối inline khai SECTIONS (khối RENDER không bị bóc)');
ok(!/buildHtml|addEventListener/.test(blocks[0]),
  'khối DATA không chứa code của renderer (chữ "localStorage" trong body hạng mục thì được — ' +
  'cửa gác cố tình không grep prose)');


const ctx = vm.createContext({});
vm.runInContext(blocks[0], ctx);
ok(ctx.SECTIONS === undefined, 'ctx.SECTIONS là undefined — phải đọc bằng lần chạy thứ hai');
const raw = JSON.parse(vm.runInContext(
  'JSON.stringify({id:(typeof CHECKLIST_ID!=="undefined"?CHECKLIST_ID:null),' +
  'scores:(typeof SCORES!=="undefined"?SCORES:[]),sections:SECTIONS,title:""})', ctx));
const gotB = raw.sections[0].items[0].b;
ok(gotB === BODY, 'body khớp BYTE sau vm + JSON round-trip');
ok((gotB.match(/\\/g) || []).length === (BODY.match(/\\/g) || []).length, 'không mất backslash nào');
ok(gotB.includes('${HOST}') && gotB.includes('`date`'), '${ và backtick còn nguyên trong chuỗi');
ok(sanitizeHtml(gotB) === gotB, 'sanitizeHtml(b) === b — bản local và bản hub giống nhau');

const parsed = validateDef(raw, true);
ok(parsed.def.total === 2 && parsed.warnings.length === 0, 'validateDef không ném, 0 warning');
ok(parsed.def.sections[0].items[0].b === BODY, 'b sau khi hub sanitize vẫn khớp byte');

const hits = good.html.match(C.ITEM_RE) || [];
ok(hits.length === 2, `ITEM_RE của tools/verify.py đếm đúng 2 hạng mục (đếm ${hits.length})`);
ok(!hits.some(h => /"(P0|VFY)"/.test(h)), 'không section nào bị ITEM_RE đếm thành hạng mục');
ok(/Audit host: example\.vn/.test(good.html), 'dấu "Audit host:" được gắn vào note của nhóm VFY');
ok(gate(good.html, 'good-gate').code === 0, 'check-out.js cho file đúng → exit 0');

/* ---------- 2. renderer chia esc/thô giống sync.js ---------- */
console.log('\n2 — renderer: chia esc/thô giống assets/sync.js:191-214');
const R = require(path.join(SKILL, 'templates/render.js'));
const html = R.buildHtml([{ id: 'P0', tag: 't-p0', title: 'a<b>&c', note: '<p>thô</p>',
  items: [{ id: 'x-1', t: 'tiêu <b>đề</b>', w: 'vì & sao', e: '<1h', b: '<p>thân bài thô</p>' }] }]);
ok(html.includes('a&lt;b&gt;&amp;c'), 'section.title bị escape');
ok(html.includes('tiêu &lt;b&gt;đề&lt;/b&gt;'), 'item.t bị escape');
ok(html.includes('vì &amp; sao'), 'item.w bị escape');
ok(html.includes('&lt;1h'), 'item.e bị escape');
ok(html.includes('<p>thô</p>') && html.includes('<p>thân bài thô</p>'), 'note và b chèn THÔ');
ok(html.includes('data-p="P0"') && html.includes('data-id="x-1"'),
  'giữ data-p / data-id để filter và tick chạy được');
ok(!/(const|let|var)\s+SECTIONS\s*=/.test(fs.readFileSync(path.join(SKILL, 'templates/render.js'), 'utf8')),
  'render.js không khai SECTIONS — nếu khai thì hub có thể bóc nhầm khối này');

/* ---------- 3. cửa gác: mỗi kiểu sai phải fail ĐÚNG BƯỚC ---------- */
console.log('\n3 — cửa gác: 16 kiểu file sai, mỗi kiểu fail đúng bước nó nhắm');

/* Mỗi case trả về HTML đã bị bẻ, kèm bước mong đợi. Bẻ trên file ĐÃ dựng (không đi qua
   build-file.js) vì build-file.js chặn phần lớn lỗi này ngay từ đầu — mà cửa gác vẫn phải
   độc lập bắt được, kể cả với file người khác đưa. */
const brk = (find, repl) => good.html.replace(find, repl);

const cases = [
  ['1', 'không có khối nào khai SECTIONS',
    () => brk(/const SECTIONS=\[/, 'window.SECTIONS=[')],
  ['1', 'hai khối cùng khai SECTIONS',
    () => good.html.replace('<div id="content"></div>',
      '<div id="content"></div>\n<script>const SECTIONS=[];<\/script>')],
  ['1', 'thiếu CHECKLIST_ID',
    () => brk(/const CHECKLIST_ID = "[^"]+";\n/, '')],
  ['2', 'giá trị là template literal (backtick)',
    () => brk(/b:"<h4>Lệnh<\/h4>[^"]*"/, 'b:`<h4>L\u1ec7nh<\/h4>`')],
  ['2', 'chuỗi `</script` không có dấu > — regex của hub bỏ qua, browser thật thì đóng thẻ',
    () => brk(/w:"Mất 3 kênh AI search"/, 'w:"đóng bằng </script foo"')],

  ['2', 'chuỗi <!-- trong khối DATA',
    () => brk(/w:"Mất 3 kênh AI search"/, 'w:"<!-- ghi chú -->"')],
  ['2b', 'JSON.stringify cả object (key có ngoặc kép)',
    () => brk(/const SECTIONS=\[[\s\S]*?\n\];/,
      'const SECTIONS=' + JSON.stringify(raw.sections) + ';')],
  ['2b', 'tag không đứng ngay sau id trong section',
    () => brk('{id:"P0",tag:"t-p0"', '{id:"P0",title:"x",tag:"t-p0"')],
  ['2c', 'ký tự U+00A0 trần trong body',
    () => brk('<h4>Số đo hiện tại</h4>', '<h4>Số\u00a0đo hiện tại</h4>')],
  ['2c', 'newline ngay sau <pre>',
    () => brk('<pre><code>bash probe.sh', '<pre>\\n<code>bash probe.sh')],
  ['3', 'khối DATA chạm localStorage',
    () => brk('const SECTIONS=[', 'localStorage.getItem("x");\nconst SECTIONS=[')],
  ['3', '${...} trong body làm khối DATA ném',
    () => brk(/b:"<h4>Lệnh<\/h4>[^"]*"/, 'b:`${HOST}`')],
  ['4', 'hai hạng mục cùng id',
    () => brk('{id:"vfy-bots"', '{id:"bot-ai-403"')],
  ['5', '<h2> trong body (hub unwrap thành chữ trần)',
    () => brk('<h4>Số đo hiện tại</h4>', '<h2>Số đo hiện tại</h2>')],
  ['5', 'style= trong body (hub xoá attribute)',
    () => brk('<p><b>Đạt khi:</b>', '<p style=\\"color:red\\"><b>Đạt khi:</b>')],
  ['5b', 'item.e dài quá 40 ký tự',
    () => brk('e:"1–3h"', 'e:"' + 'x'.repeat(41) + '"')],
  ['9', 'ghi chú SCORES có dấu ngoặc kép',
    () => brk('"canonical self, còn 4 biến thể URL trả 200"',
      '"canonical tro ve \\"/\\" thay vi \\"/vi\\""')],
];

cases.forEach(([step, name, mk], n) => {
  const r = gate(mk(), 'bad-' + n);
  const hitStep = new RegExp('\\[' + step.replace('b', 'b') + '\\]').test(r.out);
  ok(r.code === 1 && hitStep, `[${step}] ${name}`);
  if (!(r.code === 1 && hitStep)) {
    console.log('       exit=' + r.code + ' · out: ' + r.out.split('\n').filter(l => l.includes('•')).slice(0, 2).join(' | '));
  }
});

console.log(`\nPASS ${pass} · FAIL ${fail}   (tmp: ${TMP})`);
if (!fail) fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

