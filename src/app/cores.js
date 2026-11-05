// A small pool of module workers. Jobs fall back to this thread if workers are missing or a worker dies.
import { runJob } from "./core-jobs.js";

export function coreCount(hardware = 2) {
  const n = Number(hardware) || 1;
  return Math.max(1, Math.min(2, n > 1 ? n - 1 : 1));
}

export function createCores({ url = null, count = null, WorkerImpl = globalThis.Worker, inline = runJob } = {}) {
  const workers = [];
  const pending = new Map();
  let seq = 1;
  let alive = 0;
  const n = url && typeof WorkerImpl === "function" ? (count ?? coreCount(globalThis.navigator?.hardwareConcurrency)) : 0;
  const settle = (worker, error) => {
    worker.dead = true;
    alive = workers.filter((item) => !item.dead).length;
    for (const [id, job] of pending) {
      if (job.worker !== worker) continue;
      pending.delete(id);
      try { job.resolve(inline(job.name, job.payload)); } catch (cause) { job.reject(error || cause); }
    }
  };
  for (let i = 0; i < n; i += 1) {
    try {
      const worker = new WorkerImpl(url, { type: "module" });
      worker.onmessage = (event) => {
        const { id, ok, result, error } = event.data || {};
        const job = pending.get(id);
        if (!job) return;
        pending.delete(id);
        if (ok) job.resolve(result);
        else {
          try { job.resolve(inline(job.name, job.payload)); } catch (cause) { job.reject(new Error(error || cause.message)); }
        }
      };
      worker.onerror = () => settle(worker, new Error("worker"));
      workers.push(worker);
      alive += 1;
    } catch {
      // This browser will not start a module worker. The inline path covers it.
    }
  }
  return {
    get count() { return alive; },
    run(name, payload, transfer) {
      const worker = workers.find((item) => !item.dead);
      if (!worker) return Promise.resolve().then(() => inline(name, payload));
      const id = seq;
      seq += 1;
      // Rotate so a later job prefers a different core.
      workers.push(workers.shift());
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, worker, name, payload });
        try { worker.postMessage({ id, name, payload }, transfer || []); }
        catch (error) {
          pending.delete(id);
          try { resolve(inline(name, payload)); } catch (cause) { reject(cause || error); }
        }
      });
    },
    close() {
      for (const worker of workers) worker.terminate?.();
      workers.length = 0;
      alive = 0;
      pending.clear();
    },
  };
}
