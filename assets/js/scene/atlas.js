// Builds lettering textures off the main thread when the browser allows it.

let worker = null, serial = 0;
const pending = new Map();

function startWorker() {
  if (worker !== null) return worker;
  worker = false;
  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') return worker;
  try {
    // OffscreenCanvas text needs a 2D context inside the worker; probe once.
    if (!new OffscreenCanvas(1, 1).getContext('2d')) return worker;
    worker = new Worker(new URL('./text-atlas.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error)); else job.resolve(data);
    };
    worker.onerror = () => {
      for (const job of pending.values()) job.fallback();
      pending.clear();
      worker.terminate(); worker = false;
    };
  } catch { worker = false; }
  return worker;
}

const idle = () => new Promise(resolve => (window.requestIdleCallback || setTimeout)(resolve, { timeout: 600 }));

async function onMainThread(kind, options) {
  await idle();
  const module = await import('./text-atlas.js');
  return kind === 'sea' ? { pixels: module.buildSeaAtlas(options) } : module.buildQuoteAtlas(options);
}

export function buildAtlas(kind, options) {
  const w = startWorker();
  if (!w) return onMainThread(kind, options);
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject, fallback: () => onMainThread(kind, options).then(resolve, reject) });
    w.postMessage({ id, kind, options });
  }).catch(() => onMainThread(kind, options));
}
