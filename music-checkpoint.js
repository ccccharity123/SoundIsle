// Small position journal, tied to a durable queue snapshot. Old snapshots remain readable.
export function createPlaybackCheckpoint(storage, key) {
  const journalKey = key + ':position:v1';
  let last = null;
  function clear() { last = null; try { storage.removeItem(journalKey); } catch {} }
  function read(snapshot) {
    const fallback = Math.max(0, Number(snapshot?.position) || 0);
    if (!snapshot?.checkpointId) return fallback;
    try {
      const row = JSON.parse(storage.getItem(journalKey) || 'null');
      if (row?.id === snapshot.checkpointId && Number.isFinite(row.position) && row.position >= 0) return row.position;
    } catch {}
    return fallback;
  }
  function write(snapshot, position) {
    if (!snapshot?.checkpointId || !Number.isFinite(position) || position < 0) return false;
    const row = { id: snapshot.checkpointId, position: Math.floor(position * 10) / 10 };
    if (last?.id === row.id && last.position === row.position) return true;
    try { storage.setItem(journalKey, JSON.stringify(row)); last = row; return true; } catch { return false; }
  }
  return { clear, read, write };
}
