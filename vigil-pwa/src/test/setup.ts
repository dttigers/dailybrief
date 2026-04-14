import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// JSDOM stubs used across tests
if (!globalThis.fetch) {
  globalThis.fetch = () => Promise.reject(new Error('fetch not mocked'))
}

// jsdom 25's localStorage surface is flaky under vitest — provide a deterministic
// in-memory Storage shim so tests can rely on `localStorage.setItem/getItem`.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
  return storage
}

const memoryLocalStorage = createMemoryStorage()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryLocalStorage,
})
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryLocalStorage,
  })
}
