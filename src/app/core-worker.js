import { runJob } from "./core-jobs.js";

self.onmessage = (event) => {
  const { id, name, payload } = event.data || {};
  try {
    const result = runJob(name, payload);
    if (result instanceof Uint8ClampedArray) self.postMessage({ id, ok: true, result }, [result.buffer]);
    else self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message || error) });
  }
};
