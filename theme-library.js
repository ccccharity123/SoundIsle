// Named CSS snapshots. IndexedDB keeps the collection outside the active settings quota.
import { THEME_LIMIT } from './theme-css.js';
export const PLAYER_CSS_KEYS = ['playerIslandCss', 'playerThemeCss', 'playerCustomCss'];
export function normalizeSnapshot(value = {}) {
  const snapshot = {};
  for (const key of PLAYER_CSS_KEYS) {
    const css = value[key] ?? '';
    if (typeof css !== 'string' || css.length > THEME_LIMIT) throw Error('主题 CSS 超出 100 万字符限制或格式无效');
    snapshot[key] = css;
  }
  const local = value.local ?? {};
  const css = local.css ?? null;
  if (css !== null && (typeof css !== 'string' || css.length > THEME_LIMIT)) throw Error('完整主题 CSS 超出 100 万字符限制或格式无效');
  snapshot.local = { enabled: local.enabled === true, css };
  return snapshot;
}
export function sameSnapshot(a, b) {
  return PLAYER_CSS_KEYS.every(key => a[key] === b[key]) && a.local.enabled === b.local.enabled && a.local.css === b.local.css;
}
export function hasCustomCss(snapshot) {
  return PLAYER_CSS_KEYS.some(key => snapshot[key].trim()) || Boolean(snapshot.local.css?.trim());
}
export function openThemeStore(W, namespace) {
  return new Promise((resolve, reject) => {
    let request;
    try { request = W.indexedDB.open(`${namespace}_css_library_v1`, 1); }
    catch (e) { reject(e); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('themes')) request.result.createObjectStore('themes', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error || Error('主题库无法打开'));
    request.onblocked = () => reject(Error('主题库被其他页面占用，请关闭旧页面后重试'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      const execute = (mode, operation) => new Promise((done, fail) => {
        let tx, req;
        try { tx = db.transaction('themes', mode); req = operation(tx.objectStore('themes')); }
        catch (e) { fail(e); return; }
        tx.oncomplete = () => done(req.result);
        tx.onabort = tx.onerror = () => fail(tx.error || req.error || Error('主题库读写失败'));
      });
      resolve({ list: () => execute('readonly', s => s.getAll()), put: item => execute('readwrite', s => s.put(item)), remove: id => execute('readwrite', s => s.delete(id)), close: () => db.close() });
    };
  });
}
export function mountThemeLibrary({ D, W, host, namespace, current, hasDraft, applySnapshot, confirm, isDisposed }) {
  const panel = D.createElement('div'); panel.className = 'cap-setting-card';
  panel.innerHTML = `<div class="cap-setting-card-title">CSS 主题库</div>
    <p class="cap-css-hint">保存当前已应用的播放器 CSS（含灵动岛、悬浮球及完整主题文件），可随时切换。不会改动音乐、字体或普通外观设置。</p>
    <label>已收藏主题<select data-library-select aria-label="已收藏 CSS 主题"></select></label>
    <label>主题名称<input type="text" maxlength="80" data-library-name placeholder="例如 Natural" autocomplete="off"></label>
    <div class="cap-css-actions"><button type="button" data-library-save>保存当前主题</button><button type="button" data-library-use>使用选中主题</button><button type="button" data-library-rename>重命名</button><button type="button" data-library-delete>删除</button><button type="button" data-library-default>恢复默认 CSS</button></div>
    <p class="cap-css-status" role="status" aria-live="polite" data-library-status></p>`;
  const summary = host.querySelector('summary');
  if (summary) summary.after(panel); else host.prepend(panel);
  const select = panel.querySelector('[data-library-select]');
  const name = panel.querySelector('[data-library-name]');
  const status = panel.querySelector('[data-library-status]');
  const buttons = [...panel.querySelectorAll('button')];
  let store, records = [], busy = true, closed = false;
  const alive = () => !closed && !isDisposed();
  function setBusy(value) { busy = value; for (const b of buttons) b.disabled = value || !store; select.disabled = value || !store; name.disabled = value || !store; }
  function say(message) { if (alive()) status.textContent = message; }
  const selected = () => records.find(r => r.id === select.value);
  const active = () => records.find(r => sameSnapshot(r.snapshot, current()));
  const sort = () => records.sort((a,b) => b.updated - a.updated || a.name.localeCompare(b.name));
  function syncCurrent(preferred) {
    if (!alive()) return;
    sort();
    const activeId = active()?.id;
    const keep = preferred ?? activeId ?? '';
    select.replaceChildren();
    const placeholder = D.createElement('option'); placeholder.value = ''; placeholder.textContent = '选择已收藏主题'; select.append(placeholder);
    for (const r of records) {
      const opt = D.createElement('option'); opt.value = r.id; opt.textContent = `${r.name}${r.id === activeId ? ' · 使用中' : ''}`; select.append(opt);
    }
    select.value = keep;
    name.value = selected()?.name || '';
  }
  function uniqueName(base) {
    let candidate = base, n = 2;
    while (records.some(r => r.name === candidate)) candidate = `${base} ${n++}`;
    return candidate;
  }
  async function add(title, snapshot) {
    const id = Array.from(W.crypto.getRandomValues(new Uint32Array(4)), n=>n.toString(16).padStart(8,'0')).join('');
    const item = { id, name: title, snapshot: normalizeSnapshot(snapshot), updated: Date.now() };
    await store.put(item); records.push(item); return item;
  }
  async function archiveCurrent(title = '自动保留的主题') {
    const snapshot = current();
    if (hasCustomCss(snapshot) && !records.some(r => sameSnapshot(r.snapshot, snapshot))) {
      await add(uniqueName(title), snapshot);
    }
  }
  function action(fn) {
    return async () => {
      if (busy || !store || !alive()) return;
      setBusy(true);
      try { await fn(); }
      catch (e) { say(e?.message || '主题库操作失败（可能存储空间不足）'); }
      finally { if (alive()) setBusy(false); }
    };
  }
  select.onchange = () => { name.value = selected()?.name || ''; };
  panel.querySelector('[data-library-save]').onclick = action(async () => {
    if (hasDraft()) throw Error('请先点击「保存并应用」，再收藏当前 CSS');
    const title = name.value.trim();
    if (!title) throw Error('请输入主题名称');
    const existing = records.find(r => r.name === title);
    const snapshot = current();
    if (!hasCustomCss(snapshot)) throw Error('当前没有自定义 CSS 可收藏');
    if (existing) {
      if (!await confirm(`更新已收藏主题「${title}」？`)) return;
      if (!alive()) return;
      const item = { ...existing, snapshot, updated: Date.now() }; await store.put(item);
      records = records.map(r => r.id === item.id ? item : r); syncCurrent(item.id);
    } else { const item = await add(title, snapshot); syncCurrent(item.id); }
    say(`已保存：${title}`);
  });
  async function switchTo(snapshot, title, id) {
    if (hasDraft() && !await confirm('编辑区有未保存的 CSS，切换将丢弃这些草稿。继续？')) return;
    if (!alive()) return;
    const before = current();
    if (hasCustomCss(before) && !records.some(r => sameSnapshot(r.snapshot, before)) && !await confirm('当前已应用的 CSS 尚未收藏。切换将替换它；如需保留，请取消并先保存当前主题。仍要切换？')) return;
    if (!alive()) return;
    applySnapshot(snapshot);
    syncCurrent(id); say(`已应用：${title}`);
  }
  panel.querySelector('[data-library-use]').onclick = action(async () => {
    const item = selected(); if (!item) throw Error('请先选择主题');
    await switchTo(item.snapshot, item.name, item.id);
  });
  panel.querySelector('[data-library-default]').onclick = action(() => switchTo(normalizeSnapshot(), '默认 CSS', ''));
  panel.querySelector('[data-library-rename]').onclick = action(async () => {
    const item = selected(), title = name.value.trim();
    if (!item || !title) throw Error('请选择主题并输入新名称');
    if (records.some(r => r.id !== item.id && r.name === title)) throw Error('已有同名主题，请换个名称');
    const updated = { ...item, name: title, updated: Date.now() }; await store.put(updated);
    records = records.map(r => r.id === updated.id ? updated : r); syncCurrent(updated.id); say(`已重命名：${title}`);
  });
  panel.querySelector('[data-library-delete]').onclick = action(async () => {
    const item = selected(); if (!item) throw Error('请先选择主题');
    if (!await confirm(`删除收藏「${item.name}」？当前已应用的 CSS 不会被清除。`)) return;
    if (!alive()) return;
    await store.remove(item.id); records = records.filter(r => r.id !== item.id); syncCurrent(); say('已删除收藏，当前外观不变');
  });
  setBusy(true);
  openThemeStore(W, namespace).then(async db => {
    if (!alive()) { db.close(); return; }
    store = db;
    const stored = await db.list();
    records = stored.filter(r => r && r.id !== '__initialized__' && typeof r.id === 'string' && typeof r.name === 'string').flatMap(r => {
      try { return [{ ...r, snapshot: normalizeSnapshot(r.snapshot) }]; } catch { return []; }
    });
    if (!alive()) return;
    if (!stored.some(r => r?.id === '__initialized__')) {
      await archiveCurrent('原有 CSS 主题');
      await db.put({ id: '__initialized__' });
    }
    if (!alive()) return;
    syncCurrent(); say(records.length ? `已收藏 ${records.length} 套主题` : '还没有收藏，保存当前主题即可开始');
    setBusy(false);
  }).catch(e => { store?.close(); store = null; setBusy(true); say(`主题库不可用：${e?.message || '浏览器存储受限'}；现有 CSS 不受影响`); });
  return { syncCurrent: () => { if (store && !busy) syncCurrent(); }, destroy: () => { closed = true; store?.close(); panel.remove(); } };
}
