export function createLatestTask() {
  let current;
  function cancel() {
    current?.abort();
    current = undefined;
  }
  return {
    start() {
      cancel();
      const controller = new AbortController();
      current = controller;
      return { signal: controller.signal, active: () => current === controller && !controller.signal.aborted };
    },
    cancel,
  };
}

export async function withMusicTimeout(run, timeout, ...signals) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  }
  let fallbackReason = new DOMException('请求已取消', 'AbortError');
  const timer = setTimeout(() => {
    fallbackReason = new DOMException('请求超时', 'AbortError');
    controller.abort(fallbackReason);
  }, timeout);
  const abortReason = () => controller.signal.reason || fallbackReason;
  let rejectAborted;
  try {
    if (controller.signal.aborted) throw new DOMException('请求已取消', 'AbortError');
    const interruption = new Promise((_, reject) => {
      rejectAborted = () => reject(abortReason());
      controller.signal.addEventListener('abort', rejectAborted, { once: true });
    });
    const operation = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw abortReason();
      return run(controller.signal);
    });
    return await Promise.race([operation, interruption]);
  } finally {
    clearTimeout(timer);
    if (rejectAborted) controller.signal.removeEventListener('abort', rejectAborted);
    for (const signal of signals) signal?.removeEventListener('abort', abort);
  }
}
