import { createClient } from '@/lib/supabase/browser'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function getToken(): Promise<string | null> {
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token ?? null
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken()

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `API error ${res.status}`)
  }

  return res.json()
}

export const api = {
  me: () => apiFetch<{ data: { id: string; email: string; role: string } }>('/api/me'),
  connections: {
    list:   (withHealth = false) =>
      apiFetch<{ data: unknown[] }>(`/api/connections${withHealth ? '?health=true' : ''}`),
    get:    (id: string) =>
      apiFetch<{ data: unknown }>(`/api/connections/${id}`),
    scan:   (id: string) =>
      apiFetch<{ data: unknown }>(`/api/connections/${id}/scan`, { method: 'POST' }),
    delete: (id: string) =>
      apiFetch<{ message: string }>(`/api/connections/${id}`, { method: 'DELETE' }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ data: unknown }>(`/api/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    test:   (body: Record<string, unknown>) =>
      apiFetch<{ data: { ok: boolean; latency_ms: number } }>('/api/connections/test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    create: (body: Record<string, unknown>) =>
      apiFetch<{ data: unknown }>('/api/connections', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  alerts: {
    list:        (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiFetch<{ data: unknown[] }>(`/api/alerts${qs}`)
    },
    counts:      () => apiFetch<{ data: Record<string, number> }>('/api/alerts/counts'),
    acknowledge: (id: string) =>
      apiFetch<{ data: unknown }>(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' }),
    resolve:     (id: string) =>
      apiFetch<{ data: unknown }>(`/api/alerts/${id}/resolve`, { method: 'PATCH' }),
  },
  activity: {
    list: (limit = 20) => apiFetch<{ data: unknown[] }>(`/api/activity?limit=${limit}`),
  },
  snapshots: {
    latest: (connectionId: string) =>
      apiFetch<{ data: unknown }>(`/api/connections/${connectionId}/snapshots/latest`),
  },
  scripts: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiFetch<{ data: unknown[] }>(`/api/scripts${qs}`)
    },
    get: (id: string) => apiFetch<{ data: unknown }>(`/api/scripts/${id}`),
  },
  sandbox: {
    envs: () => apiFetch<{ data: unknown[] }>('/api/sandbox/envs'),
    runs: () => apiFetch<{ data: unknown[] }>('/api/sandbox/runs'),
    run:  (scriptId: string, connectionId: string) =>
      apiFetch<{ data: unknown; message: string }>('/api/sandbox/run', {
        method: 'POST',
        body: JSON.stringify({ script_id: scriptId, connection_id: connectionId }),
      }),
  },
  analytics: {
    fleet: (days = 7) =>
      apiFetch<{ data: any }>(`/api/analytics/fleet?days=${days}`),
    connection: (id: string, days = 30) =>
      apiFetch<{ data: any }>(`/api/analytics/${id}?days=${days}`),
  },
}
