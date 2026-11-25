// Shared IndexedDB asset store for custom fonts (.ttf/.otf/.woff/.woff2) and player background images
const DB_NAME = 'capricorn_assets_v1';
const DB_VERSION = 1;
const STORE_FONTS = 'fonts';
const STORE_IMAGES = 'images';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FONTS)) {
        db.createObjectStore(STORE_FONTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('无法打开字体与资源数据库'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('数据库写入失败'));
    tx.onabort = () => reject(tx.error || new Error('数据库操作被中止'));
  });
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('数据库读取失败'));
  });
}

const loadedFamilies = new Map();
let activeBgUrl = '';

export function fontFamilyFor(id) {
  if (!id) return '';
  return `CapricornFont_${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export async function listFonts() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_FONTS, 'readonly');
    const all = await reqPromise(tx.objectStore(STORE_FONTS).getAll());
    return (all || [])
      .map(({ id, name, fileName, size, addedAt }) => ({ id, name, fileName, size, addedAt }))
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } catch (e) {
    console.warn('[Capricorn] listFonts failed:', e);
    return [];
  }
}

export async function saveFontFile(file) {
  if (!file) throw new Error('未选择字体文件');
  const fileName = String(file.name || 'custom.ttf');
  if (!/\.(ttf|otf|woff2?|ttc)$/i.test(fileName)) {
    throw new Error('请导入 .ttf（或 .otf / .woff / .woff2）格式字体文件');
  }
  const buffer = await file.arrayBuffer();
  if (!buffer || buffer.byteLength < 64) {
    throw new Error('字体文件内容无效或为空');
  }
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || '自定义字体';
  const id = 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const family = fontFamilyFor(id);

  const face = new FontFace(family, buffer.slice(0));
  await face.load();
  document.fonts.add(face);
  loadedFamilies.set(id, family);

  const db = await openDb();
  const tx = db.transaction(STORE_FONTS, 'readwrite');
  tx.objectStore(STORE_FONTS).put({
    id,
    name: baseName,
    fileName,
    size: buffer.byteLength,
    buffer,
    addedAt: Date.now()
  });
  await txDone(tx);
  return { id, name: baseName, fileName, family };
}

export async function ensureFontLoaded(id) {
  if (!id) return '';
  if (loadedFamilies.has(id)) return loadedFamilies.get(id);
  const db = await openDb();
  const tx = db.transaction(STORE_FONTS, 'readonly');
  const record = await reqPromise(tx.objectStore(STORE_FONTS).get(id));
  if (!record?.buffer) return '';
  const family = fontFamilyFor(id);
  const face = new FontFace(family, record.buffer.slice(0));
  await face.load();
  document.fonts.add(face);
  loadedFamilies.set(id, family);
  return family;
}

export async function deleteFont(id) {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE_FONTS, 'readwrite');
  tx.objectStore(STORE_FONTS).delete(id);
  await txDone(tx);
  loadedFamilies.delete(id);
}

export async function saveBgImage(file) {
  if (!file) throw new Error('未选择图片文件');
  if (!file.type?.startsWith('image/')) {
    throw new Error('请选择有效的图片文件（PNG / JPG / WebP / GIF）');
  }
  const db = await openDb();
  const tx = db.transaction(STORE_IMAGES, 'readwrite');
  tx.objectStore(STORE_IMAGES).put({
    id: 'player_bg',
    name: file.name || 'background',
    blob: file,
    addedAt: Date.now()
  });
  await txDone(tx);
  return loadBgImageUrl();
}

export async function loadBgImageUrl() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const rec = await reqPromise(tx.objectStore(STORE_IMAGES).get('player_bg'));
    if (activeBgUrl) {
      URL.revokeObjectURL(activeBgUrl);
      activeBgUrl = '';
    }
    if (!rec?.blob) return '';
    activeBgUrl = URL.createObjectURL(rec.blob);
    return activeBgUrl;
  } catch (e) {
    console.warn('[Capricorn] loadBgImageUrl failed:', e);
    return '';
  }
}

export async function clearBgImage() {
  if (activeBgUrl) {
    URL.revokeObjectURL(activeBgUrl);
    activeBgUrl = '';
  }
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    tx.objectStore(STORE_IMAGES).delete('player_bg');
    await txDone(tx);
  } catch {}
}