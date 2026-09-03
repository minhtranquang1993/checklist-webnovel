const load = require('./harness.js');
const ANON = 'test-anon-key';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Bo dem fetch: ghi lai moi request, tra ve phan hoi theo kich ban. */
function recorder(handlers) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init = {}) => {
      const rec = { url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
      calls.push(rec);
      for (const h of handlers) {
        const r = await h(rec);
        if (r) return r;
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    },
  };
}
const jres = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });

(async () => {
console.log('\nTEST 1 — refetch dang bay khong duoc bo tick vua ghi (ISSUE-1)');
{
  let pullResolve;
  const r = recorder([
    async rec => {
      if (rec.method === 'GET') return new Promise(res => { pullResolve = () => res(jres([])); });   // server chua co row
      return null;
    },
    async rec => (rec.url.includes('rpc/tick_item')
      ? jres([{ out_item_id: rec.body.p_item_id, out_done: rec.body.p_done, out_updated_by: rec.body.p_updated_by, out_updated_at: new Date().toISOString() }])
      : null),
  ]);
  const { ctx, vm } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(20);
  vm.runInContext("setItem('p0-1d', true)", ctx);   // tick trong luc GET dang bay
  await sleep(60);
  pullResolve();                                     // GET cu tra ve rong SAU khi ghi xong
  await sleep(80);
  const st = vm.runInContext("JSON.stringify(state['p0-1d']||null)", ctx);
  ok(st !== 'null' && JSON.parse(st).done === true, 'tick con nguyen sau khi GET cu tra ve rong: ' + st);
}

console.log('\nTEST 2 — hang doi qua han bi bo, khong ghi de viec nguoi khac (ISSUE-2)');
{
  const old = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const r = recorder([async rec => (rec.method === 'GET' ? jres([{ item_id: 'p1-4c', done: true, updated_by: 'B', updated_at: new Date().toISOString() }]) : null)]);
  const { ctx, vm, store } = load({
    anonKey: ANON, fetch: r.fetch,
    localStorage: { 'chk-user-name': 'A', 'chk-queue-webnovel-vn': JSON.stringify({ 'p1-4c': { done: false, by: 'A', ts: old } }) },
  });
  await sleep(120);
  const rpcCalls = r.calls.filter(c => c.url.includes('rpc/tick_item'));
  ok(rpcCalls.length === 0, 'khong day ban ghi qua han len server (rpc calls=' + rpcCalls.length + ')');
  ok(JSON.parse(store['chk-queue-webnovel-vn'] || '{}')['p1-4c'] === undefined, 'da xoa khoi hang doi');
  ok(vm.runInContext("state['p1-4c'] && state['p1-4c'].done===true && state['p1-4c'].by==='B'", ctx), 'giu tick moi cua B');
}

console.log('\nTEST 3 — GET loi thi KHONG duoc coi la rong (ISSUE-10)');
{
  const r = recorder([async rec => (rec.method === 'GET' ? { ok: false, status: 503, json: async () => [], text: async () => 'err' } : null)]);
  const { ctx, vm } = load({
    anonKey: ANON, fetch: r.fetch,
    localStorage: { 'chk-user-name': 'A', 'chk-cache-webnovel-vn': JSON.stringify({ 'p0-1a': { done: true, by: 'Minh', at: '2026-08-24T00:00:00Z' } }) },
  });
  await sleep(120);
  ok(vm.runInContext("state['p0-1a'] && state['p0-1a'].done===true", ctx), 'van giu bo dem trong may, khong xoa tick');
  ok(vm.runInContext('lastError', ctx).includes('Không tải được'), 'bao loi ro rang: ' + vm.runInContext('lastError', ctx));
}

console.log('\nTEST 4 — loi 4xx vinh vien: bo khoi hang doi, khong retry mai (ISSUE-10)');
{
  const r = recorder([
    async rec => (rec.method === 'GET' ? jres([]) : null),
    async rec => (rec.url.includes('rpc/tick_item') ? jres({ code: '22023', message: 'ten nguoi tick phai dai 1-60 ky tu' }, 400) : null),
  ]);
  const { ctx, vm, store } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(20);
  vm.runInContext("setItem('geo-3', true)", ctx);
  await sleep(120);
  ok(Object.keys(JSON.parse(store['chk-queue-webnovel-vn'] || '{}')).length === 0, 'hang doi da rong (khong treo badge)');
  ok(vm.runInContext('lastError', ctx).includes('geo-3'), 'bao ro hang muc nao loi: ' + vm.runInContext('lastError', ctx));
}

console.log('\nTEST 5 — moi hang muc 1 request rieng, chay tuan tu (ISSUE-3)');
{
  const order = [];
  const r = recorder([
    async rec => (rec.method === 'GET' ? jres([]) : null),
    async rec => { order.push(rec.body.p_item_id); await sleep(15); return jres([{ out_item_id: rec.body.p_item_id, out_done: rec.body.p_done, out_updated_by: rec.body.p_updated_by, out_updated_at: new Date().toISOString() }]); },
  ]);
  const { ctx, vm } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(20);
  vm.runInContext("setItem('geo-3', true); setItem('geo-4', true); setItem('geo-5', true);", ctx);
  await sleep(300);
  const rpc = r.calls.filter(c => c.url.includes('rpc/tick_item'));
  ok(rpc.every(c => c.body.p_item_id && c.body.p_client_ts), 'moi request co p_item_id + p_client_ts');
  ok(new Set(order).size === order.length, 'khong gui trung mot hang muc: ' + JSON.stringify(order));
  ok(vm.runInContext('pendingCount()', ctx) === 0, 'hang doi da sach');
}

console.log('\nTEST 6 — item_id rac trong DB bi bo qua (ISSUE-6)');
{
  const r = recorder([async rec => (rec.method === 'GET' ? jres([
    { item_id: 'p0-1a', done: true, updated_by: 'Minh', updated_at: '2026-08-24T00:00:00Z' },
    { item_id: 'khong-ton-tai-99', done: true, updated_by: 'attacker', updated_at: '2026-08-28T00:00:00Z' },
  ]) : null)]);
  const { ctx, vm } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(120);
  ok(vm.runInContext("state['khong-ton-tai-99']===undefined", ctx), 'row rac khong vao state');
  ok(vm.runInContext("Object.keys(state).length===1", ctx), 'chi con 1 hang muc that');
}

console.log('\nTEST 7 — chua nhap ten thi khong ghi duoc gi');
{
  const r = recorder([async rec => (rec.method === 'GET' ? jres([]) : null)]);
  const { ctx, vm } = load({ anonKey: ANON, fetch: r.fetch, localStorage: {} });
  await sleep(20);
  vm.runInContext("setItem('geo-3', true)", ctx);
  await sleep(80);
  ok(vm.runInContext('pendingCount()', ctx) === 0, 'khong ghi vao hang doi');
  ok(r.calls.filter(c => c.url.includes('rpc/tick_item')).length === 0, 'khong goi server');
}

console.log('\nTEST 8 — ten nguoi tick khong bi chen vao innerHTML (ISSUE-7)');
{
  const payload = '<img src=x onerror=alert(1)>';
  const r = recorder([async rec => (rec.method === 'GET' ? jres([{ item_id: 'p0-1a', done: true, updated_by: payload, updated_at: '2026-08-28T00:00:00Z' }]) : null)]);
  const { ctx, vm, items } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(120);
  const el = items.find(i => i.dataset.id === 'p0-1a')._by;
  ok(el.innerHTML === '', 'khong dung innerHTML (rong)');
  const txt = el.children.map(c => c.textContent || c.nodeValue || '').join('');
  ok(txt.includes(payload), 'ten hien nguyen van bang textContent (an toan)');
}


console.log('\nTEST 9 — tab khac ghi cache: ban moi hon thang, ban cu bi bo qua (ISSUE-4)');
{
  const r = recorder([async rec => (rec.method === 'GET' ? jres([]) : null)]);
  const { ctx, vm, store } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(120);
  // tab nay tick geo-6 luc T
  vm.runInContext("setItem('geo-6', true)", ctx);
  await sleep(60);
  const mine = vm.runInContext("state['geo-6'].at", ctx);

  // tab khac bo tick geo-6 SAU do -> phai thang
  const newer = new Date(Date.parse(mine) + 5000).toISOString();
  store['chk-cache-webnovel-vn'] = JSON.stringify({ 'geo-6': { done: false, by: 'B', at: newer } });
  vm.runInContext("__storage({key:'chk-cache-webnovel-vn'})", ctx);
  ok(vm.runInContext("state['geo-6'].done===false && state['geo-6'].by==='B'", ctx),
     'ban moi hon cua tab khac thang: ' + vm.runInContext("JSON.stringify(state['geo-6'])", ctx));

  // tab khac gui ban CU hon -> phai bi bo qua
  const older = new Date(Date.parse(newer) - 60000).toISOString();
  store['chk-cache-webnovel-vn'] = JSON.stringify({ 'geo-6': { done: true, by: 'C', at: older } });
  vm.runInContext("__storage({key:'chk-cache-webnovel-vn'})", ctx);
  ok(vm.runInContext("state['geo-6'].by==='B'", ctx),
     'ban cu hon bi bo qua: ' + vm.runInContext("JSON.stringify(state['geo-6'])", ctx));
}

console.log('\nTEST 10 — nut Xoa tick: go sai ten thi khong doi gi (ISSUE-9)');
{
  const r = recorder([async rec => (rec.method === 'GET' ? jres([
    { item_id: 'p0-1a', done: true, updated_by: 'Minh', updated_at: '2026-08-24T00:00:00Z' },
    { item_id: 'p0-1b', done: true, updated_by: 'Minh', updated_at: '2026-08-24T00:00:00Z' },
  ]) : null)]);
  let answer = 'sai-ten';
  const { ctx, vm, els } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' }, prompt: () => answer });
  await sleep(120);
  els.reset.onclick();
  await sleep(60);
  ok(vm.runInContext("state['p0-1a'].done===true && state['p0-1b'].done===true", ctx), 'go sai -> khong doi gi');
  ok(r.calls.filter(c => c.url.includes('rpc/tick_item')).length === 0, 'khong goi server');

  answer = 'webnovel-vn';
  els.reset.onclick();
  await sleep(200);
  ok(vm.runInContext("state['p0-1a'].done===false && state['p0-1b'].done===false", ctx), 'go dung -> bo tick');
  const rpc = r.calls.filter(c => c.url.includes('rpc/tick_item'));
  ok(rpc.length === 2 && rpc.every(c => c.body.p_done === false), 'gui 2 request done=false');
}


console.log('\nTEST 11 — refetch giua luc POST da xong nhung DB chua kip: khong duoc bo tick');
{
  /* Trinh tu thuc te:
     t0 bam tick -> hang doi = {geo-7}
     t1 POST bay
     t2 refetch BAT DAU (anh chup chua co geo-7)
     t3 POST tra 200 -> hang doi sach, confirmedAt[geo-7] = t3
     t4 refetch tra ve rong
     Neu chi so writeAt thi t4 > t2 nen writeAt van chan duoc.
     Nhung neu refetch bat dau SAU khi bam (writeAt < startedAt) va POST xac nhan
     sau do, chi confirmedAt moi chan duoc. */
  let releasePull, releasePost;
  const r = recorder([
    async rec => (rec.method === 'GET' && rec.url.includes('checklist_progress?select')
      ? new Promise(res => { releasePull = () => res(jres([])); }) : null),
    async rec => (rec.url.includes('rpc/tick_item')
      ? new Promise(res => { releasePost = () => res(jres([{ out_item_id: rec.body.p_item_id, out_done: rec.body.p_done, out_updated_by: rec.body.p_updated_by, out_updated_at: new Date().toISOString() }])); })
      : null),
  ]);
  const { ctx, vm } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(20);
  vm.runInContext("setItem('geo-7', true)", ctx);      // POST bay, giu lai
  await sleep(20);
  vm.runInContext('writeAt["geo-7"] = 1', ctx);        // gia lap: lan ghi cuc bo da lau
  await sleep(10);
  releasePost();                                        // server xac nhan -> hang doi sach
  await sleep(60);
  ok(vm.runInContext('pendingCount()', ctx) === 0, 'hang doi da sach sau khi server xac nhan');
  releasePull();                                        // anh chup cu ve SAU do
  await sleep(80);
  const st = vm.runInContext("JSON.stringify(state['geo-7']||null)", ctx);
  ok(st !== 'null' && JSON.parse(st).done === true, 'tick con nguyen (confirmedAt chan duoc): ' + st);
}

console.log('\nTEST 12 — writeAt/confirmedAt chi nhan id hop le, khong phinh vo han');
{
  const r = recorder([async rec => (rec.method === 'GET' ? jres([]) : null)]);
  const { ctx, vm } = load({ anonKey: ANON, fetch: r.fetch, localStorage: { 'chk-user-name': 'A' } });
  await sleep(100);
  vm.runInContext("setItem('khong-ton-tai-1', true); setItem('khong-ton-tai-2', true);", ctx);
  await sleep(60);
  ok(vm.runInContext('Object.keys(writeAt).length', ctx) === 0, 'id la khong vao writeAt');
  const total = vm.runInContext('VALID_IDS.size', ctx);
  vm.runInContext("SECTIONS.forEach(s=>s.items.forEach(i=>setItem(i.id,true)))", ctx);
  await sleep(200);
  ok(vm.runInContext('Object.keys(writeAt).length', ctx) === total,
     'writeAt bi chan boi so hang muc: ' + vm.runInContext('Object.keys(writeAt).length', ctx) + '/' + total);
}

console.log('\n' + '='.repeat(50));
console.log('PHAN 2 — sanitize.js + parse-def.js (checklist upload tu trang hub)');

/* Node khong co DOM. tools/test/dom-shim.js la ban tu viet vua du cho sanitize.js
   (DOMParser) va parse-def.js (document.createElement('template')). Gan vao global
   TRUOC khi require sanitize.js, vi module do doc `typeof DOMParser` luc chay ham. */
global.DOMParser = require('./dom-shim.js').DOMParser;
global.document = require('./dom-shim.js').document;
const { sanitizeHtml } = require('../../assets/sanitize.js');
const {
  validateDef, extractInlineScript, slugFromFilename, parseDomChecklist,
} = require('../../assets/parse-def.js');

/* Def toi thieu, hop le. Moi test sua mot cho de kiem dung mot luat. */
const defOf = over => Object.assign({
  id: 'test-up',
  scores: [['Crawlability', 7, 'ghi chu']],
  sections: [{
    id: 'P0', tag: 't-p0', title: 'Nhom mot', note: 'ghi chu nhom',
    items: [{ id: 'p0-1a', t: 'Viec mot', e: '1h', w: 'ly do', b: '<b>huong dan</b>' }],
  }],
}, over);

const throws = (fn, re, label) => {
  try { fn(); ok(false, label + ' (khong nem loi)'); } catch (e) {
    ok(re.test(e.message), label + ': ' + e.message.slice(0, 90));
  }
};

console.log('\nTEST 13 — sanitize: bo script/style/on*/javascript: nhung GIU chu va dinh dang');
{
  const s = sanitizeHtml;
  ok(s('<b>giu</b>') === '<b>giu</b>', 'giu <b>');
  ok(s('<script>alert(1)</script>sau') === 'sau', 'xoa <script> ca noi dung');
  ok(s('<style>p{}</style>sau') === 'sau', 'xoa <style> ca noi dung');
  ok(s('<iframe src="x"></iframe>sau') === 'sau', 'xoa <iframe>');
  ok(s('<img src=x onerror=alert(1)>') === '', 'xoa <img> (duong gui request ra ngoai)');
  ok(s('<p onclick="evil()">t</p>') === '<p>t</p>', 'bo onclick, giu <p>');
  ok(s('<div style="color:red">t</div>') === '<div>t</div>', 'bo style attr');
  ok(s('<!-- x -->text') === 'text', 'xoa comment');
  ok(s('<div class="callout good"><b>ok</b></div>') === '<div class="callout good"><b>ok</b></div>',
     'giu class (style trang dua vao no)');
  ok(s('<marquee>chu</marquee>') === 'chu', 'tag ngoai whitelist: bo the, GIU chu');
  ok(s('<h1>Tieu de</h1>') === 'Tieu de', 'h1 bi unwrap (trung cap voi tieu de trang)');
  ok(s('<a href="javascript:alert(1)">x</a>') === '<a>x</a>', 'bo href javascript:');
  ok(s('<a href="  javascript:alert(1)">x</a>') === '<a>x</a>', 'bo href javascript: co khoang trang');
  ok(s('<a href="data:text/html,x">x</a>') === '<a>x</a>', 'bo href data:');
  ok(/target="_blank"/.test(s('<a href="https://a.com">x</a>')), 'link http duoc mo tab moi');
  ok(/rel="noopener noreferrer"/.test(s('<a href="https://a.com">x</a>')), 'link http co noopener');
  ok(s('<td colspan="2">c</td>') === '<td colspan="2">c</td>', 'giu colspan hop le');
  ok(s('<td colspan="abc">c</td>') === '<td>c</td>', 'bo colspan khong phai so');
  ok(s('') === '' && s(null) === '' && s(undefined) === '', 'rong/null tra ve rong');

  /* Cho de bao dong gia: webnovel-vn.html co doan huong dan in ra the <link
     onload=...> BEN TRONG <pre><code>, da escape thanh &lt;link. Do la CHU, khong
     phai attribute — sanitize phai giu nguyen chu do, khong duoc coi la handler. */
  const inCode = s('<pre><code>&lt;link rel="preload" onload="x()"&gt;</code></pre>');
  ok(!/<link/i.test(inCode), 'chu &lt;link&gt; trong <code> khong thanh the that');
  ok(!/<[a-z]+[^>]* onload=/i.test(inCode), 'onload trong <code> chi la chu, khong phai handler');
  ok(/&lt;link/.test(inCode), 'giu nguyen doan huong dan de doc');
}

console.log('\nTEST 14 — extractInlineScript: bat theo SECTIONS, bo qua <script src>');
{
  const html = '<script src="assets/sync.js"></script>' +
    '<script>var x=1;</script>' +
    '<script>\nconst CHECKLIST_ID = "abc";\nconst SECTIONS=[];\n</script>';
  const code = extractInlineScript(html);
  ok(/CHECKLIST_ID/.test(code), 'lay dung khoi co du lieu');
  ok(!/sync\.js/.test(code) && !/var x=1/.test(code), 'khong lay khoi khac, khong lay <script src>');
  ok(extractInlineScript('<script src="a.js"></script>') === '', 'file khong co khoi nao -> rong');

  /* HOI QUY cho dung loi Minh gap: file checklist ban cu chi co SCORES + SECTIONS,
     KHONG co CHECKLIST_ID. Truoc day bi tu choi thang. */
  const legacy = '<script>\nconst SCORES=[["A",7,"x"]];\nconst SECTIONS=[{id:"P0"}];\n</script>';
  ok(/SECTIONS/.test(extractInlineScript(legacy)), 'file KHONG co CHECKLIST_ID van boc duoc');

  ok(/SECTIONS/.test(extractInlineScript('<script>let SECTIONS=[];</script>')), 'nhan ca `let`');
  ok(extractInlineScript('<script>const SCORES=[];</script>') === '',
     'chi co SCORES, khong co SECTIONS -> rong (khong co du lieu hang muc)');
}

console.log('\nTEST 14b — slugFromFilename: suy ma tu ten file khi file khong khai');
{
  const s = slugFromFilename;
  ok(s('webnovel-ngon-tinh-checklist.html') === 'webnovel-ngon-tinh-checklist', 'ten file thuong');
  ok(s('DND-SEO.HTML') === 'dnd-seo', 'ha chu thuong, nhan .HTML');
  ok(s('checklist_2026.htm') === 'checklist-2026', 'gach duoi -> gach ngang, nhan .htm');
  ok(s('my file (1).html') === 'my-file-1', 'khoang trang va ngoac -> gach ngang, khong gach doi');
  ok(s('a'.repeat(60) + '.html').length === 40, 'cat con 40 ky tu');
  ok(s('---.html') === '', 'ten toan gach -> rong (bat nguoi dung tu nhap)');
  ok(s('') === '', 'ten rong -> rong');
  /* Tieng Viet co dau: khong tu y bo dau thanh chu khong dau, chi doi thanh gach.
     Ket qua van la ma hop le, va nguoi dung sua duoc. */
  ok(/^[a-z0-9][a-z0-9-]*$/.test(s('Truyện ngôn tình.html')), 'ten co dau van ra ma hop le');
}

console.log('\nTEST 14c — parseDomChecklist: file viet tay (hang muc nam trong HTML, khong khai SECTIONS)');
{
  const domFile = [
    '<!DOCTYPE html><html><head><title>Checklist ngon tinh &amp; hon the</title></head><body>',
    '<h1>Checklist</h1><p class="sub">Ban rut gon</p>',
    '<section class="grp">',
    '  <h2><span class="pill p0">P0</span> Blocker phan trang</h2>',
    '  <p class="note">Lam <b>truoc</b> nhom nay.</p>',
    '  <details class="item p0"><summary><input type="checkbox" data-id="p0-1">',
    '    <span class="ttl"><span class="id">P0-1</span> Phan trang rong</span></summary>',
    '    <div class="body"><h4>Sua thanh</h4><p>Phat link trang.</p><script>alert(1)</script></div>',
    '  </details>',
    '  <details class="item p0"><summary><input type="checkbox" data-id="p0-2">',
    '    <span class="ttl">Thieu canonical</span></summary>',
    '    <div class="body"><p>Them canonical.</p></div>',
    '  </details>',
    '</section>',
    '<section class="grp">',
    '  <h2><span class="pill p4">P4</span> Server</h2>',
    '  <details class="item"><summary><input type="checkbox"> Bat brotli</summary>',
    '    <div class="body">x</div></details>',
    '</section>',
    '</body></html>',
  ].join('\n');

  const d = parseDomChecklist(domFile);
  const r = validateDef(Object.assign({}, d.raw, { id: 'ngon-tinh' }), false);
  const S = r.def.sections;

  ok(S.length === 2, '2 nhom (h4 trong phan huong dan khong thanh nhom): ' + S.length);
  ok(r.def.total === 3, 'dem dung 3 hang muc: ' + r.def.total);
  ok(S[0].id === 'P0' && S[1].id === 'P4', 'ma nhom lay tu chip pill');
  ok(S[0].tag === 't-p0' && S[1].tag === 't-p4', 'tag suy tu class phu cua pill');
  ok(S[0].title === 'Blocker phan trang', 'tieu de nhom bo chu trong pill: ' + S[0].title);
  ok(S[0].note === 'Lam <b>truoc</b> nhom nay.', 'note cua nhom giu dinh dang: ' + S[0].note);
  ok(S[0].items.map(i => i.id).join(',') === 'p0-1,p0-2', 'id lay tu data-id cua o checkbox');
  ok(S[0].items[0].t === 'Phan trang rong', 'tieu de bo chip so hieu: ' + S[0].items[0].t);
  ok(/Phat link trang/.test(S[0].items[0].b), 'giu phan huong dan lam body');
  ok(!/<script/i.test(S[0].items[0].b), 'script trong body bi loc');
  ok(!/Phan trang rong/.test(S[0].items[0].b), 'body khong lap lai tieu de');
  ok(r.def.meta.title === 'Checklist ngon tinh & hon the',
     'ten lay tu <title>, giai ma entity: ' + r.def.meta.title);
  ok(r.def.meta.sub === 'Ban rut gon', 'mo ta lay tu .sub');

  /* O checkbox khong khai data-id: id suy tu HASH TIEU DE, khong phai vi tri. */
  ok(/^it-/.test(S[1].items[0].id), 'khong co data-id -> id suy ra: ' + S[1].items[0].id);
  ok(d.warnings.some(w => /data-id/.test(w)), 'co canh bao ve id suy ra');
  ok(d.warnings.some(w => /SECTIONS/.test(w)), 'noi ro file duoc doc theo cau truc HTML');

  /* Dinh tuyen: file co CA SECTIONS lan checkbox thi phai di duong 1 (chay script). */
  const both = '<script>const SECTIONS=[];</script>' + domFile;
  ok(extractInlineScript(both) !== '', 'file co SECTIONS van di duong sandbox, khong doc DOM');
}

console.log('\nTEST 14d — parseDomChecklist: nhom theo heading, id trung, o khong co tieu de');
{
  const flat = [
    '<body><h2>Nhom A</h2><p class="note">Dan nhap.</p>',
    '<ul><li><label><input type="checkbox"> Viec A</label></li>',
    '<li><label><input type="checkbox"> Viec A</label></li></ul>',
    '<h2>Nhom B</h2>',
    '<div class="item"><label><input type="checkbox"> Viec B</label>',
    '  <div class="body"><p>chi tiet</p></div></div>',
    '<div class="tools"><input type="checkbox"><button>chon het</button></div>',
    '</body>',
  ].join('\n');

  const d = parseDomChecklist(flat);
  const S = d.raw.sections;
  ok(S.length === 2, 'file khong bpc <section> van tach nhom theo <h2>: ' + S.length);
  ok(S[0].id === 'nhom-a' && S[0].title === 'Nhom A', 'ma nhom suy tu tieu de: ' + S[0].id);
  ok(S[0].note === 'Dan nhap.', 'note la the ngay sau heading: ' + S[0].note);
  ok(S[1].items[0].b === '<p>chi tiet</p>', 'body lay tu .body: ' + S[1].items[0].b);

  const ids = S[0].items.map(i => i.id);
  ok(ids.length === 2 && ids[0] !== ids[1], 'hai hang muc trung tieu de van ra 2 id khac nhau');
  ok(d.warnings.some(w => /id bị trùng/.test(w)), 'co canh bao id trung');
  ok(d.warnings.some(w => /không có tiêu đề/.test(w)), 'bo o checkbox trong thanh cong cu + canh bao');
  ok(d.raw.sections.reduce((n, s) => n + s.items.length, 0) === 3, 'o trong .tools khong thanh hang muc');

  /* Id phai ON DINH: chen mot hang muc moi len dau roi upload lai KHONG duoc lam
     doi id cua hang muc cu — neu doi thi tick nhay sang cho khac ma khong ai thay. */
  const again = parseDomChecklist(flat);
  ok(again.raw.sections[1].items[0].id === S[1].items[0].id, 'doc lai file -> id khong doi');
  const inserted = parseDomChecklist(flat.replace(
    '<h2>Nhom A</h2>',
    '<h2>Nhom A</h2><div class="item"><label><input type="checkbox"> Viec moi</label></div>'
  ));
  const findT = (def, t) => def.sections.reduce((hit, s) =>
    hit || s.items.find(i => i.t === t) || null, null);
  ok(findT(inserted.raw, 'Viec B').id === findT(d.raw, 'Viec B').id,
     'chen hang muc moi -> id hang muc cu giu nguyen');

  /* O tick tran, khong co the boc rieng: tieu de la chu dung ngay sau no. */
  const bare = '<body><h2>Nhom</h2><p><input type="checkbox" data-id="a"> Viec A<br>' +
    '<input type="checkbox" data-id="b"> Viec B</p></body>';
  const B = parseDomChecklist(bare).raw.sections;
  ok(B.length === 1 && B[0].id === 'nhom', 'nhom suy tu <h2> khi khong co <section>: ' + B[0].id);
  ok(B[0].items.map(i => i.id).join(',') === 'a,b', 'id van lay tu data-id');
  ok(B[0].items.map(i => i.t).join('|') === 'Viec A|Viec B',
     'tieu de doc tu chu sau o tick: ' + B[0].items.map(i => i.t).join('|'));
}

console.log('\nTEST 14e — parseDomChecklist: file khong phai checklist -> noi ro can gi');
{
  throws(() => parseDomChecklist('<html><body><h1>Bao cao</h1><p>xin chao</p></body></html>'),
    /SECTIONS/, 'khong co SECTIONS lan checkbox -> nem loi noi ca hai dang');
  throws(() => parseDomChecklist('<body><p>x</p></body>'), /checkbox/,
    'thong bao nhac toi o checkbox');
  throws(() => parseDomChecklist('<body><input type="checkbox"></body>'), /không ô nào có tiêu đề/,
    'co o tick nhung khong co chu -> noi thieu tieu de');
}

console.log('\nTEST 15 — validateDef: def hop le -> dem dung, HTML da duoc loc');
{
  const r = validateDef(defOf({
    sections: [{
      id: 'P0', tag: 't-p0', title: 'Nhom mot',
      note: 'ghi chu <script>alert(1)</script>',
      items: [
        { id: 'p0-1a', t: 'Viec mot', b: '<div class="callout good"><b>ok</b></div>' },
        { id: 'p0-1b', t: 'Viec hai', b: '<p onclick="x()">t</p>' },
      ],
    }],
  }));
  ok(r.def.total === 2, 'dem dung so hang muc: ' + r.def.total);
  ok(r.def.sections[0].note === 'ghi chu ', 'note cua NHOM cung duoc loc (cho de bo sot)');
  ok(r.def.sections[0].items[0].b === '<div class="callout good"><b>ok</b></div>', 'body giu dinh dang');
  ok(r.def.sections[0].items[1].b === '<p>t</p>', 'body bi bo onclick');
  ok(r.warnings.length === 0, 'khong co canh bao voi def sach');
}

console.log('\nTEST 16 — validateDef: chan cac loi lam mat tick hoac lam DB tu choi');
{
  throws(() => validateDef(defOf({ id: 'Test_Up' })), /sai định dạng/, 'CHECKLIST_ID chu hoa/gach duoi');
  throws(() => validateDef(defOf({ id: '' })), /Chưa có mã checklist/, 'ma rong');
  throws(() => validateDef(defOf({ sections: [] })), /không được rỗng/, 'SECTIONS rong');
  throws(() => validateDef(defOf({ sections: 'x' })), /phải là mảng/, 'SECTIONS khong phai mang');
  throws(() => validateDef(defOf({
    sections: [{ id: 'P0', title: 'x', items: [] }],
  })), /không có hạng mục/, 'nhom khong co hang muc');
  throws(() => validateDef(defOf({
    sections: [{ id: 'P0', title: 'x', items: [{ id: 'AB_1', t: 'x' }] }],
  })), /sai định dạng/, 'item id sai dinh dang (DB se tu choi tick)');
  throws(() => validateDef(defOf({
    sections: [{ id: 'P0', title: 'x', items: [{ id: 'p0-1a', t: 'x' }, { id: 'p0-1a', t: 'y' }] }],
  })), /hai hạng mục/, 'item id trung -> tick ghi chong len nhau');
  throws(() => validateDef(defOf({
    sections: [{ id: 'P0', title: 'x', items: [{ id: 'p0-1a', t: '  ' }] }],
  })), /thiếu tiêu đề/, 'item thieu tieu de');
  throws(() => validateDef(null), /rỗng/, 'du lieu rong');
}

console.log('\nTEST 17 — validateDef: SCORES meo thi canh bao, KHONG chan ca file');
{
  const r = validateDef(defOf({ scores: [['Tot', 8, 'ok'], ['Thieu diem'], 'khong phai mang'] }));
  ok(r.def.scores.length === 1, 'chi giu dong dung dang: ' + r.def.scores.length);
  ok(r.warnings.length === 1, 'co canh bao thay vi nem loi');
  const r2 = validateDef(defOf({ scores: 'x' }));
  ok(r2.def.scores.length === 0 && r2.warnings.length === 1, 'SCORES khong phai mang -> bo + canh bao');
  const r3 = validateDef(defOf({ scores: [['Qua cao', 99, '']] }));
  ok(r3.def.scores[0][1] === 10, 'diem bi ep vao 0-10: ' + r3.def.scores[0][1]);
}

console.log('\nTEST 18 — thong bao loi chi dung cho can sua (o ma vs trong file)');
{
  /* Noi sai cho can sua la cach nhanh nhat de nguoi dung loay hoay: ma suy tu ten
     file thi sua o tren trang, ma lay tu file thi phai sua file. */
  throws(() => validateDef(defOf({ id: 'Bad_Id' }), false), /Sửa ô "Mã checklist"/,
    'ma suy ra -> bao sua o tren trang');
  throws(() => validateDef(defOf({ id: 'Bad_Id' }), true), /CHECKLIST_ID` trong file/,
    'ma tu file -> bao sua file');
  throws(() => validateDef(defOf({ id: '' }), false), /Chưa có mã checklist/,
    'ma rong -> noi ro la chua co, khong in ma rong');
  /* Ma hop le thi idFromFile khong doi gi. */
  ok(validateDef(defOf({}), false).def.id === 'test-up', 'ma hop le: idFromFile khong anh huong');
}

console.log('\nTEST 19 — const van doc duoc sau khi script cua file NEM giua duong');
{
  /* Day la ly do file checklist ban cu upload duoc: engine cua no doc localStorage
     o cuoi script, ma trong iframe sandbox (origin mo) thao tac do nem
     SecurityError. Hai the <script> classic dung chung global lexical environment
     nen SECTIONS khai o tren van con.

     vm.runInContext mo phong dung chuyen do — hai lan runInContext tren cung mot
     context hanh xu nhu hai the <script> cung document. */
  const vm2 = require('vm');
  const sb = { JSON, Object, Array, String, Number, Math, Date, Set, isNaN, parseInt };
  Object.defineProperty(sb, 'localStorage', {
    get() { const e = new Error('Access is denied for this document.'); e.name = 'SecurityError'; throw e; },
  });
  sb.globalThis = sb;
  const c = vm2.createContext(sb);

  let fileThrew = false;
  try {
    vm2.runInContext('const SECTIONS=[{id:"P0",title:"x",items:[{id:"p0-1a",t:"y"}]}];' +
      'const KEY="wnv-seo-checklist-v1";' +
      'let state=JSON.parse(localStorage.getItem(KEY)||"{}");', c);
  } catch { fileThrew = true; }
  ok(fileThrew, 'script cua file nem khi doc localStorage (giong sandbox that)');

  const raw = vm2.runInContext('({id:(typeof CHECKLIST_ID!=="undefined"?CHECKLIST_ID:null),' +
    'scores:(typeof SCORES!=="undefined"?SCORES:[]),sections:SECTIONS,title:""})', c);
  ok(raw.sections.length === 1, 'reporter VAN doc duoc SECTIONS sau khi file nem');
  ok(raw.id === null, 'khong co CHECKLIST_ID -> tra null cho fallback lo');

  const parsed = validateDef(
    Object.assign({}, raw, { id: slugFromFilename('webnovel-ngon-tinh-checklist.html') }), false);
  ok(parsed.def.id === 'webnovel-ngon-tinh-checklist', 'ma lay tu ten file: ' + parsed.def.id);
  ok(parsed.def.total === 1, 'du lieu hang muc con nguyen');
}

console.log('\n' + '='.repeat(50));
console.log(`PASS ${pass} · FAIL ${fail}`);
if (fail) console.log('LUU Y: sanitize.js duoc test bang DOM tu viet (tools/test/dom-shim.js).');
process.exit(fail ? 1 : 0);
})();
