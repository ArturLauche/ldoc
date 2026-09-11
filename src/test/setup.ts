import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
  });
});

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  clear() {
    this.items.clear();
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

function resolveTestStorage(): Storage {
  try {
    if (window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Fall through to the memory implementation for opaque origins.
  }

  Object.defineProperty(globalThis, 'Storage', {
    configurable: true,
    value: MemoryStorage,
  });
  Object.defineProperty(window, 'Storage', {
    configurable: true,
    value: MemoryStorage,
  });

  return new MemoryStorage();
}

const testStorage = resolveTestStorage();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testStorage,
});

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: testStorage,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom has no layout/scroll implementation. Browser QA covers route scrolling.
window.scrollTo = vi.fn();
