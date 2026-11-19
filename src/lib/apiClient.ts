import { useAuthStore } from '@/store/authStore'
import { navigateTo } from '@/lib/navigation'

/**
 * Talks to the Django backend (see /backend). Every call sends `Authorization: Bearer <access>`
 * from a real username/password login, or no auth header when signed out. The backend no
 * longer accepts the old X-Demo-Role header, so there is no password-free path.
 *
 * The access token lasts 15 minutes and is kept in memory only. The refresh token (7 days) is
 * an httpOnly cookie that scripts on the page can't read; the browser sends it to /auth/ only.
 * A 401 means the access token ran out: /auth/refresh/ gets a new one with the cookie and the
 * call is sent again, so the user never notices. Only when the refresh is refused (7 days
 * unused, signed out, password changed, account deactivated) is the user sent to /login.
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

/** Only the /auth/ calls need the refresh cookie (login, refresh, logout, change-password set
 * or read it); everything else stays a plain same-origin request. */
const credentialsFor = (path: string): RequestCredentials => (path.startsWith('/auth/') ? 'include' : 'same-origin')

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let refreshing: Promise<boolean> | null = null

/** Gets a new access token (and a new refresh cookie) with the refresh cookie. Calls that hit a
 * 401 at the same time share one request (each refresh token works only once). True when
 * there is a usable access token afterwards. */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response
      try {
        res = await fetch(`${API_BASE}/auth/refresh/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      } catch {
        return false // server unreachable — keep the session, the next call will try again
      }
      if (res.ok) {
        const body = (await res.json()) as { access: string }
        useAuthStore.getState().setAccess(body.access)
        return true
      }
      if (res.status !== 401) return false // server trouble — keep the session
      // Refused. Another tab may have renewed with the same cookie a moment ago; the browser
      // then already holds that tab's new cookie, so one more try after a short pause.
      if (attempt === 0) await wait(400)
    }
    expireSession()
    return false
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** The session is really over: sign out locally and go to the login page. Local only — the
 * server has already refused this session, and a logout call could retire a newer cookie
 * another tab has just received. */
function expireSession() {
  const { isAuthenticated, clearSession } = useAuthStore.getState()
  if (!isAuthenticated) return
  clearSession()
  navigateTo('/login')
}

/** A 401 still standing after a refresh try: the session is gone. */
function handleUnauthorized(status: number, path: string) {
  if (status !== 401 || isSessionCall(path)) return
  expireSession()
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  // After a page reload there is no access token yet (it is never stored): get one from the
  // refresh cookie before the first call instead of letting it fail.
  if (!isSessionCall(path)) {
    const { token, isAuthenticated } = useAuthStore.getState()
    if (!token && isAuthenticated) await refreshSession()
  }
  // FormData bodies (file uploads) must NOT get a manual Content-Type — the browser
  // sets the multipart boundary itself; forcing 'application/json' here would break it.
  const isFormData = options.body instanceof FormData
  const sentToken = useAuthStore.getState().token
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: credentialsFor(path),
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
 * A plain `<a href>` can't carry the `Authorization: Bearer ...` header a download
 * needs, so this fetches the file with the same auth as every other call, then
 * triggers a save via a throwaway object URL.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const { token, isAuthenticated } = useAuthStore.getState()
  if (!token && isAuthenticated) await refreshSession()
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
