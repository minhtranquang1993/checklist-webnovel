/* Nap sync.js that trong Node voi DOM/localStorage/fetch gia lap,
   de kiem tra logic hang doi + quy tac gop bang cac tinh huong dua thuc te. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

function makeEl(tag = 'div') {
  const el = {
    tagName: tag, className: '', _text: '', _html: '', dataset: {}, style: {}, children: [],
    checked: false, disabled: false, value: '', type: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); },
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this.children = []; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    onclick: null, onkeydown: null,
  };
  return el;
}

module.exports = function load(opts) {
  const store = Object.assign({}, opts.localStorage || {});
  const els = {};
  const ids = ['scores', 'content', 'idbar', 'needname', 'status', 'progtxt', 'progpct', 'progbar', 'filters', 'expandAll', 'collapseAll', 'reset'];
  ids.forEach(id => { els[id] = makeEl(); });

  const items = [];
  const handlers = {};
  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: {
      body: makeEl('body'),
      getElementById: id => (els[id] || (els[id] = makeEl())),
      querySelector: sel => {
        const m = /\[data-sec="([^"]+)"\]/.exec(sel);
        if (m) { els['sec-' + m[1]] = els['sec-' + m[1]] || makeEl(); return els['sec-' + m[1]]; }
        return null;
      },
      querySelectorAll: sel => {
        if (sel === '.item') return items;
        if (sel.startsWith('.item input')) return items.map(i => i._box);
        return [];
      },
      addEventListener() {},
      createElement: makeEl,
      createTextNode: t => ({ nodeValue: t, textContent: t }),
      hidden: false,
    },
    window: {
      addEventListener(ev, fn) { if (ev === 'storage') handlers.storage = fn; },
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout,
    fetch: opts.fetch,
    prompt: opts.prompt || (() => null),
    alert: () => {},
    confirm: () => true,
    Date, JSON, Object, Array, String, Number, Boolean, Math, Set, Map, Promise, Error, isNaN, encodeURIComponent, parseInt,
  };
  sandbox.globalThis = sandbox;

  // Dung SECTIONS that tu file HTML de VALID_IDS giong ban chay that.
  const html = fs.readFileSync(path.join(ROOT, 'webnovel-vn.html'), 'utf8');
  const dataStart = html.indexOf('const SCORES=[');
  const dataEnd = html.indexOf('</script>', dataStart);
  const dataSrc = html.slice(dataStart, dataEnd);

  const vm = require('vm');
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`const SUPABASE_URL='https://sczmmxorxivfbpwmkvqh.supabase.co';
    const SUPABASE_ANON_KEY='${opts.anonKey}';
    const CHECKLIST_ID='webnovel-vn';
    ${dataSrc}`, ctx);

  // Dung .item gia lap khop voi SECTIONS
  const secs = vm.runInContext('SECTIONS', ctx);
  secs.forEach(s => s.items.forEach(i => {
    const el = makeEl();
    el.dataset.id = i.id; el.dataset.p = s.id;
    el._box = makeEl('input'); el._box.type = 'checkbox';
    el._by = makeEl();
    el.querySelector = sel => (sel.includes('checkbox') ? el._box : el._by);
    items.push(el);
  }));

  const syncSrc = fs.readFileSync(path.join(ROOT, 'assets/sync.js'), 'utf8');
  vm.runInContext(syncSrc, ctx);
  sandbox.__storage = e => (handlers.storage ? handlers.storage(e) : undefined);
  return { ctx, store, vm, els, items };
};
