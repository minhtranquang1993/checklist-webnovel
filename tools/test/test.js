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
    async rec => (rec.url.includes('rpc') ? jres({ code: '22023', message: 'ten nguoi tick phai dai 1-60 ky tu' }, 400) : null),
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
  const rpc = r.calls.filter(c => c.url.includes('rpc'));
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
  ok(r.calls.filter(c => c.url.includes('rpc')).length === 0, 'khong goi server');
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
  ok(r.calls.filter(c => c.url.includes('rpc')).length === 0, 'khong goi server');

  answer = 'webnovel-vn';
  els.reset.onclick();
  await sleep(200);
  ok(vm.runInContext("state['p0-1a'].done===false && state['p0-1b'].done===false", ctx), 'go dung -> bo tick');
  const rpc = r.calls.filter(c => c.url.includes('rpc'));
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
    async rec => (rec.url.includes('rpc')
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
console.log(`PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
})();
