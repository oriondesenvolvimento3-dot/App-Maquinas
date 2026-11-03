import 'fake-indexeddb/auto';

if (typeof globalThis.window === 'undefined') {
  const eventTarget = new EventTarget();
  (globalThis as any).window = {
    location: {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/',
    },
    btoa: (str: string) => (globalThis as any).Buffer?.from(str, 'binary').toString('base64'),
    atob: (b64: string) => (globalThis as any).Buffer?.from(b64, 'base64').toString('binary'),
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}
