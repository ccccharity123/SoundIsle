// 独立声屿：只处理音乐库。绝不访问或修改拾忆数据库。
const KEY = 'sound_isle_v01_library';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const dangerous = new Set(['__proto__', 'prototype', 'constructor']);
function verify(source) {
  if (!isRecord(source) || !isRecord(source.playlists || {}) ||
      !Array.isArray(source.favorites || []) || !Array.isArray(source.recent || []))
    throw Error('音乐备份结构无效');
  if (Object.keys(source.playlists || {}).some(key => dangerous.has(key)))
    throw Error('音乐备份含非法歌单标识');
  for (const [id, playlist] of Object.entries(source.playlists || {})) {
    if (!isRecord(playlist) || !Array.isArray(playlist.songs)) throw Error('歌单格式无效：' + id);
    for (const song of playlist.songs) if (!isRecord(song) || typeof song.id !== 'string')
      throw Error('歌曲格式无效：' + id);
  }
  return source;
}
const unique = (before, incoming, id) => {
  const output = Array.isArray(before) ? before.slice() : [];
  const seen = new Set(output.map(id));
  for (const value of incoming || []) if (!seen.has(id(value))) {
    output.push(value); seen.add(id(value));
  }
  return output;
};
export function commitMusicBackup(storage, current, incoming) {
  verify(incoming); verify(current);
  const raw = storage.getItem(KEY);
  if (raw !== null && JSON.stringify(JSON.parse(raw)) !== JSON.stringify(current))
    throw Error('音乐库已在其他窗口修改，请刷新页面重试');
  const playlists = { ...current.playlists };
  for (const [id, playlist] of Object.entries(incoming.playlists || {})) {
    const prior = playlists[id];
    playlists[id] = prior ? { ...prior, songs: unique(prior.songs, playlist.songs, song => song.id) }
      : { ...playlist, songs: unique([], playlist.songs, song => song.id) };
  }
  const merged = {
    ...current, version: 1, playlists,
    favorites: unique(current.favorites, incoming.favorites, item => typeof item === 'string' ? item : item?.id),
    recent: unique(current.recent, incoming.recent, item => item?.id),
    processed: current.processed || {},
    settings: { ...(incoming.settings || {}), ...(current.settings || {}) },
  };
  if (JSON.stringify(merged) === JSON.stringify(current)) return current;
  const recovery = 'sound_isle_before_import_backup';
  const oldBackup = storage.getItem(recovery);
  storage.setItem(recovery, JSON.stringify({at: Date.now(), db: current}));
  try { storage.setItem(KEY, JSON.stringify(merged)); }
  catch (error) {
    if (oldBackup === null) storage.removeItem(recovery);
    else storage.setItem(recovery, oldBackup);
    throw error;
  }
  return merged;
}
