// Tracks admitted HTTP work and detached jobs. No provider replay or DB recovery.
export function createWorkLifecycle() {
  let stopping = false;
  let shutdown;
  let active = 0;
  const idleListeners = new Set();
  function lease() {
    active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      if (!active) for (const listener of idleListeners) listener();
    };
  }
  function track(work) {
    const release = lease();
    return Promise.resolve().then(work).finally(release);
  }
  function middleware(req, res, next) {
    if (stopping) {
      res.setHeader('Connection', 'close');
      res.setHeader('Retry-After', '30');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ code: 'SERVER_DRAINING', error: 'Server sedang diperbarui. Coba lagi sebentar.' });
    }
    const release = lease();
    res.once('finish', release);
    res.once('close', release);
    next();
  }
  const handler = fn => (req, res, next) => track(() => fn(req, res, next)).catch(next);
  function waitForIdle() {
    if (!active) return Promise.resolve();
    return new Promise(resolve => {
      const onIdle = () => { idleListeners.delete(onIdle); resolve(); };
      idleListeners.add(onIdle);
    });
  }
  function stop({ server, closeResources, timeoutMs = 300000 }) {
    if (shutdown) return shutdown;
    stopping = true;
    shutdown = (async () => {
      let timer, expired = false;
      const deadline = new Promise(resolve => { timer = setTimeout(() => { expired = true; resolve(false); }, timeoutMs); });
      const drain = (async () => {
        const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await Promise.all([closed, (async () => {
          await waitForIdle();
          // A proxy/client can leave an idle replacement socket after an abort.
          // Close only idle sockets, never active SSE or admitted HTTP work.
          server.closeIdleConnections?.();
        })()]);
        // Child jobs are registered before their tracked parent handler settles.
        await waitForIdle();
        if (expired) return false;
        await closeResources();
        return true;
      })();
      try {
        const drained = await Promise.race([drain, deadline]);
        return { drained, active };
      } finally { clearTimeout(timer); }
    })();
    return shutdown;
  }
  return { track, handler, middleware, stop, get active() { return active; }, get stopping() { return stopping; } };
}
