import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25 has its own localStorage global, which is unusable without
// --localstorage-file and hides jsdom's. Swap in an in-memory Storage.
if (typeof globalThis.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage });
}

// The live practice test runs in Node, with no window.
if (typeof window !== 'undefined') {
  // jsdom does not implement scrolling.
  window.scrollTo = () => {};

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.location.hash = '';
  });
}
