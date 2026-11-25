const messagesPerSlice = 256;
const charactersPerSlice = 256 * 1024;

export function createBgmIndex(parse, hash) {
  let scope = null;
  let length = -1;
  let newest = -1;
  let revision = 0;
  const rows = new Map();

  function prepare(key, chat, ids) {
    const full = key !== scope || ids === null || length < 0 || chat.length < length;
    if (full) return { full, positions: null, visited: chat.length, changed: new Map() };
    const dirty = new Set(ids);
    for (let index = length; index < chat.length; index++) dirty.add(index);
    return { full, positions: [...dirty], visited: dirty.size, changed: new Map() };
  }

  function collect(chat, { full, positions, changed }, index) {
    const position = positions?.[index] ?? index;
    const previous = full ? undefined : rows.get(position);
    const message = chat[position];
    if (!message || message.is_user || message.is_system) {
      if (previous) changed.set(position, null);
      return 0;
    }
    const body = String(message.message ?? message.mes ?? message.content ?? message.text ?? '');
    const found = parse(body);
    if (!found.length) {
      if (previous) changed.set(position, null);
      return body.length;
    }
    const row = { id: String(message.message_id ?? message.id ?? position), signature: hash(body), found };
    if (previous?.id !== row.id || previous.signature !== row.signature) changed.set(position, row);
    return body.length;
  }

  function apply(key, nextLength, { full, visited, changed }) {
    if (full) {
      rows.clear();
      newest = -1;
    }
    for (const [position, row] of changed) {
      if (row) {
        rows.set(position, row);
        newest = Math.max(newest, position);
      } else rows.delete(position);
    }
    if (newest >= 0 && !rows.has(newest)) {
      newest = -1;
      for (const position of rows.keys()) newest = Math.max(newest, position);
    }
    scope = key;
    length = nextLength;
    revision++;
    return { full, visited, changed };
  }

  function update(key, chat, ids = null) {
    const plan = prepare(key, chat, ids);
    for (let index = 0; index < plan.visited; index++) collect(chat, plan, index);
    return apply(key, chat.length, plan);
  }

  async function prepareChunked(key, chat, ids, { check, yieldControl }) {
    const version = revision;
    const nextLength = chat.length;
    const plan = prepare(key, chat, ids);
    const verify = () => {
      check();
      if (revision !== version || chat.length !== nextLength) throw new DOMException('剧情音乐已更新', 'AbortError');
    };
    let slices = 0;
    for (let index = 0; index < plan.visited;) {
      verify();
      let characters = 0;
      const end = Math.min(plan.visited, index + messagesPerSlice);
      while (index < end && characters < charactersPerSlice) characters += collect(chat, plan, index++);
      slices++;
      if (index < plan.visited) await yieldControl();
    }
    return () => {
      verify();
      return { ...apply(key, nextLength, plan), slices };
    };
  }

  return {
    update, prepareChunked,
    latest: () => rows.get(newest) ?? null,
    entries: () => [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row),
    clear() {
      scope = null;
      length = -1;
      newest = -1;
      revision++;
      rows.clear();
    },
  };
}
