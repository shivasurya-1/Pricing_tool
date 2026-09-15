import { useAuthStore } from '@/store/authStore'

/**
 * Talks to the Django backend (see /backend). Uses the frontend's existing demo-role
 * login (no real credentials yet) via an X-Demo-Role header, matched by the backend's
 * DemoRoleAuthentication bridge — see backend/accounts/authentication.py for why.
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const role = useAuthStore.getState().role
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { 'X-Demo-Role': role } : {}),
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
}
