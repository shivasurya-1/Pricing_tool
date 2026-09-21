import { useAuthStore } from '@/store/authStore'

/**
 * Talks to the Django backend (see /backend). A real per-person session (token,
 * obtained via a real username/password login) sends `Authorization: Token <token>`.
 * The old instant demo-role bridge (`X-Demo-Role` header, see
 * backend/accounts/authentication.py) only exists as a fallback when running in dev
 * (`import.meta.env.DEV`) without a real token — the production build never sends it,
 * and the backend only accepts it when DEBUG=True either way (belt and suspenders).
 *
 * If the backend isn't reachable (not running locally, or not deployed yet), every
 * call here rejects and callers fall back to the existing static frontend data —
 * this file never throws past its own boundary in a way that would break a screen
 * that has a static fallback.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function authHeaders(): Record<string, string> {
  const { token, role } = useAuthStore.getState()
  if (token) return { Authorization: `Token ${token}` }
  if (import.meta.env.DEV && role) return { 'X-Demo-Role': role }
  return {}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      /* response wasn't JSON */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
