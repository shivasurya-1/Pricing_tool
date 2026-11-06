import { useAuthStore } from '@/store/authStore'
import { navigateTo } from '@/lib/navigation'

/**
 * Talks to the Django backend (see /backend). Every call sends `Authorization: Token <token>`
 * from a real username/password login, or no auth header when signed out. The backend no
 * longer accepts the old X-Demo-Role header, so there is no password-free path.
 *
 * A 401 from any call (other than the login/logout calls themselves) means the session is
 * gone: the store is cleared and the user is sent to /login.
 *
 * If the backend isn't reachable (not running locally, or not deployed yet), every
 * call here rejects and callers fall back to the existing static frontend data —
 * this file never throws past its own boundary in a way that would break a screen
 * that has a static fallback.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

export class ApiError extends Error {
  status: number
  /** Every message of a save error ({ detail, errors: [...] }), when the backend sends them. */
  errors: string[]
  constructor(status: number, message: string, errors: string[] = []) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

function authHeaders(): Record<string, string> {
  const { token } = useAuthStore.getState()
  return token ? { Authorization: `Token ${token}` } : {}
}

/** A 401 on a call that needed a session: sign out locally and go to the login page. */
function handleUnauthorized(status: number, path: string) {
  if (status !== 401 || path.startsWith('/auth/login') || path.startsWith('/auth/logout')) return
  const { isAuthenticated, logout } = useAuthStore.getState()
  if (!isAuthenticated) return
  logout()
  navigateTo('/login')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // FormData bodies (file uploads) must NOT get a manual Content-Type — the browser
  // sets the multipart boundary itself; forcing 'application/json' here would break it.
  const isFormData = options.body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...options.headers,
    },
  })
  if (!res.ok) {
    handleUnauthorized(res.status, path)
    let detail = res.statusText
    let errors: string[] = []
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
      if (Array.isArray(body.errors)) errors = body.errors.map(String)
    } catch {
      /* response wasn't JSON */
    }
    throw new ApiError(res.status, detail, errors)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData }),
}

/**
 * A plain `<a href>` can't carry the `Authorization: Token ...` header a download
 * needs, so this fetches the file with the same auth as every other call, then
 * triggers a save via a throwaway object URL.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    handleUnauthorized(res.status, path)
    throw new ApiError(res.status, res.statusText)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
