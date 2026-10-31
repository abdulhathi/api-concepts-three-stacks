export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/** RFC 3339 UTC with milliseconds and a Z suffix, the only timestamp format the API emits. */
export function isoTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/** Resolves after `ms`, or rejects with the signal's reason as soon as the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
