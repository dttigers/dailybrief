const STORAGE_KEY = 'vigil_api_key'
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.vigilhub.io'

export const getStoredKey = (): string | null => localStorage.getItem(STORAGE_KEY)

export const storeKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY, key)
}

export const clearKey = (): void => {
  localStorage.removeItem(STORAGE_KEY)
}

export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

/**
 * Validate an API key by calling an authenticated endpoint.
 *
 * IMPORTANT: Do NOT use /v1/health — it is explicitly excluded from bearer auth
 * in vigil-core/src/index.ts and returns 200 for any request, even without a key.
 * Use /v1/summary which requires a valid bearer token.
 */
export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/summary`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    return res.ok
  } catch {
    return false
  }
}
