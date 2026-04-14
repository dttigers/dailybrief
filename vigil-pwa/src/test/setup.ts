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
