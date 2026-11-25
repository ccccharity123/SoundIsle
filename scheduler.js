export const maintenancePriority = Object.freeze({ audio: 30, memory: 20, index: 10, vector: 0 });

const defaultMaxBytes = 16 * 1024 * 1024;

export function createScheduler(host, hidden = () => false, { maxBytes = defaultMaxBytes } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw RangeError('无效的后台缓存预算');
  const jobs = new Map();
  const stats = new Map();
  const running = new Map();
  const runningKeys = new Set();
  let closed = false;
  let handle = null;
  let scope;
  let version;
  let foreground = 0;
  let reserved = 0;
  const clock = () => host.performance?.now?.() ?? Date.now();

  function nextJob() {
    let next;
    for (const [key, job] of jobs) {
      if (running.has(job.lane) || runningKeys.has(key) || foreground && !job.duringForeground) continue;
      if (!next || job.priority > next[1].priority) next = [key, job];
    }
    return next;
  }

  function cancelHandle() {
    if (handle?.type === 'idle') host.cancelIdleCallback?.(handle.id);
    if (handle?.type === 'timer') host.clearTimeout(handle.id);
    handle = null;
  }

  function arm() {
    if (closed || jobs.size === 0 || hidden()) return;
    const next = nextJob();
    if (!next) return;
    const type = next[1].lane === 'audio' || typeof host.requestIdleCallback !== 'function' ? 'timer' : 'idle';
    if (handle?.type === type) return;
    cancelHandle();
    const pending = { type };
    handle = pending;
    const run = () => {
      if (handle !== pending) return;
      handle = null;
      void drain();
    };
    pending.id = type === 'idle' ? host.requestIdleCallback(run, { timeout: 1500 }) : host.setTimeout(run, 0);
  }

  function createTask() {
    const controller = new AbortController();
    const { signal } = controller;
    const releases = new Set();
    let finished = false;
    const check = () => {
      if (signal.aborted) throw signal.reason;
      if (finished) throw new DOMException('后台任务已结束', 'AbortError');
    };
    return {
      abort: () => controller.abort(),
      release() {
        finished = true;
        for (const release of releases) release();
      },
      context: {
        signal, maxBytes, check,
        reserve(bytes) {
          check();
          if (!Number.isSafeInteger(bytes) || bytes < 0) throw RangeError('无效的后台缓存预算');
          if (reserved + bytes > maxBytes) return null;
          reserved += bytes;
          const release = () => {
            if (releases.delete(release)) reserved -= bytes;
          };
          releases.add(release);
          return release;
        },
        async yield() {
          check();
          await new Promise((resolve, reject) => {
            const abort = () => {
              host.clearTimeout(timer);
              reject(signal.reason);
            };
            const timer = host.setTimeout(() => {
              signal.removeEventListener('abort', abort);
              resolve();
            }, 0);
            signal.addEventListener('abort', abort, { once: true });
          });
          check();
        },
      },
    };
  }

  async function drain() {
    if (closed || hidden()) return;
    const next = nextJob();
    if (!next) return;
    const [key, job] = next;
    jobs.delete(key);
    const task = createTask();
    running.set(job.lane, { key, job, task });
    runningKeys.add(key);
    const result = stats.get(key) ?? { runs: 0, errors: 0, lastMs: 0 };
    const start = clock();
    try {
      const operation = job.fn(task.context);
      arm();
      await operation;
    } catch (error) {
      if (!task.context.signal.aborted) {
        result.errors++;
        console.warn('[Capricorn maintenance]', key, error);
      }
    } finally {
      if (task.context.signal.aborted) result.cancelled = (result.cancelled || 0) + 1;
      task.release();
      result.runs++;
      result.lastMs = Math.round(clock() - start);
      stats.set(key, result);
      running.delete(job.lane);
      runningKeys.delete(key);
      arm();
    }
  }

  return {
    enqueue(key, fn, priority = 0, { lane = 'maintenance', scoped = false, duringForeground = false } = {}) {
      if (closed) return;
      jobs.set(key, { fn, priority, lane, scoped, duringForeground });
      arm();
    },
    setContext(nextScope, nextVersion) {
      if (scope === nextScope && version === nextVersion) return;
      scope = nextScope;
      version = nextVersion;
      for (const [key, job] of jobs) if (job.scoped) jobs.delete(key);
      for (const { job, task } of running.values()) if (job.scoped) task.abort();
      arm();
    },
    beginForeground() {
      foreground++;
      for (const { job, task } of running.values()) if (!job.duringForeground) task.abort();
      arm();
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        foreground--;
        arm();
      };
    },
    cancel(key) {
      jobs.delete(key);
      for (const active of running.values()) if (active.key === key) active.task.abort();
      arm();
    },
    resume: arm,
    status: () => ({ pending: jobs.size, running: running.size > 0, stats: Object.fromEntries(stats) }),
    budget: () => ({ reserved, maxBytes }),
    close() {
      closed = true;
      jobs.clear();
      for (const { task } of running.values()) task.abort();
      cancelHandle();
    },
  };
}
