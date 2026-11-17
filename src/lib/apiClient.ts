import { useAuthStore } from '@/store/authStore'
import { navigateTo } from '@/lib/navigation'

/**
 * Talks to the Django backend (see /backend). Every call sends `Authorization: Bearer <access>`
 * from a real username/password login, or no auth header when signed out. The backend no
 * longer accepts the old X-Demo-Role header, so there is no password-free path.
 *
 * The access token lasts 15 minutes. A 401 means it ran out: the refresh token (7 days) gets a
 * new pair from /auth/refresh/ and the call is sent again, so the user never notices. Only when
 * the refresh token is no good either (7 days unused, signed out, password changed) is the
 * store cleared and the user sent to /login.
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
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Calls whose 401 says nothing about the session (no access token involved). */
const isSessionCall = (path: string) =>
  path.startsWith('/auth/login') || path.startsWith('/auth/logout') || path.startsWith('/auth/refresh')

/** The refresh token another tab last saved — it may have renewed the pair moments ago. */
function storedRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem(useAuthStore.persist.getOptions().name ?? '')
    const t = raw ? JSON.parse(raw)?.state?.refreshToken : null
    return typeof t === 'string' && t ? t : null
  } catch {
    return null
  }
}

let refreshing: Promise<boolean> | null = null

/** Gets a new access + refresh pair with the stored refresh token. Calls that hit a 401 at the
 * same time share one request (each refresh token works only once). True when there is a
 * usable access token afterwards. */
function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const used = useAuthStore.getState().refreshToken
    if (!used) return false
    try {
      const res = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: used }),
      })
      if (res.ok) {
        const body = (await res.json()) as { access: string; refresh?: string }
        useAuthStore.getState().setTokens(body.access, body.refresh ?? used)
        return true
      }
      if (res.status !== 401 && res.status !== 400) return false // server trouble — keep the session
    } catch {
      return false // server unreachable — keep the session, the next call will try again
    }
    // Refused. Another tab may have just renewed with this same refresh token: take its pair.
    const other = storedRefreshToken()
    if (other && other !== used) {
      useAuthStore.setState({ refreshToken: other })
      refreshing = null
      return refreshSession()
    }
    expireSession()
    return false
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** The session is really over: sign out locally and go to the login page. */
function expireSession() {
  const { isAuthenticated, logout } = useAuthStore.getState()
  if (!isAuthenticated) return
  logout()
  navigateTo('/login')
}

/** A 401 still standing after a refresh try: the session is gone. */
function handleUnauthorized(status: number, path: string) {
  if (status !== 401 || isSessionCall(path)) return
  const { isAuthenticated, logout } = useAuthStore.getState()
  if (!isAuthenticated) return
  logout()
  navigateTo('/login')
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  // FormData bodies (file uploads) must NOT get a manual Content-Type — the browser
  // sets the multipart boundary itself; forcing 'application/json' here would break it.
  const isFormData = options.body instanceof FormData
  const sentToken = useAuthStore.getState().token
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...options.headers,
    },
  })
  if (res.status === 401 && !retried && !isSessionCall(path) && sentToken) {
    // The token was replaced while this call was in flight (renewed by another call, or a
    // password change): just send it again. Otherwise the access token ran out — renew it.
    const current = useAuthStore.getState().token
    if (current && current !== sentToken) return request<T>(path, options, true)
    if (await refreshSession()) return request<T>(path, options, true)
  }
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
  const sentToken = useAuthStore.getState().token
  let res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } })
  if (res.status === 401 && sentToken) {
    const current = useAuthStore.getState().token
    if ((current && current !== sentToken) || (await refreshSession())) {
      res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } })
    }
  }
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
