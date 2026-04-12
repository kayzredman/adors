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
    const error: any = new Error(err.error ?? `API error ${res.status}`)
    if (err.code) error.code = err.code
    throw error
  }

  return res.json()
}

export const api = {
  me: () => apiFetch<{ data: { id: string; email: string; role: string; onboarded: boolean } }>('/api/me'),
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
      apiFetch<{ data: { id: string } }>('/api/connections', {
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
    get:         (id: string) => apiFetch<{ data: unknown }>(`/api/scripts/${id}`),
    create: (body: Record<string, unknown>) =>
      apiFetch<{ data: unknown }>('/api/scripts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ data: unknown }>(`/api/scripts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<{ message: string }>(`/api/scripts/${id}`, { method: 'DELETE' }),
    executeProd: (id: string, connectionId: string) =>
      apiFetch<{ data: { exec_ms: number; row_count: number; columns: string[]; rows: Record<string, unknown>[]; script_name: string; connection_name: string } }>(
        `/api/scripts/${id}/execute-prod`,
        { method: 'POST', body: JSON.stringify({ connection_id: connectionId }) },
      ),
  },
  sandbox: {
    envs:   () => apiFetch<{ data: unknown[] }>('/api/sandbox/envs'),
    runs:   () => apiFetch<{ data: unknown[] }>('/api/sandbox/runs'),
    getRun: (id: string) => apiFetch<{ data: unknown }>(`/api/sandbox/runs/${id}`),
    run:    (scriptId: string, connectionId: string) =>
      apiFetch<{ data: { id: string }; message: string }>('/api/sandbox/run', {
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
  admin: {
    listUsers: () =>
      apiFetch<{ data: { id: string; email: string; full_name: string; role: string; onboarded: boolean; deactivated_at: string | null; created_at: string }[] }>('/api/admin/users'),
    invite: (body: { email: string; role: string; full_name?: string }) =>
      apiFetch<{ data: unknown; message: string; inviteLink?: string }>('/api/admin/users/invite', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateRole: (id: string, role: string) =>
      apiFetch<{ data: unknown; message: string }>(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    deactivate: (id: string) =>
      apiFetch<{ data: unknown; message: string }>(`/api/admin/users/${id}/deactivate`, {
        method: 'PATCH',
      }),
    reactivate: (id: string) =>
      apiFetch<{ data: unknown; message: string }>(`/api/admin/users/${id}/reactivate`, {
        method: 'PATCH',
      }),
    updateName: (id: string, full_name: string) =>
      apiFetch<{ data: unknown; message: string }>(`/api/admin/users/${id}/name`, {
        method: 'PATCH',
        body: JSON.stringify({ full_name }),
      }),
    reinvite: (id: string) =>
      apiFetch<{ message: string; inviteLink?: string }>(`/api/admin/users/${id}/reinvite`, {
        method: 'POST',
      }),
    completeProfile: (full_name: string) =>
      apiFetch<{ data: unknown; message: string }>('/api/admin/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name }),
      }),
  },
  settings: {
    updateProfile: (full_name: string, userId?: string) =>
      apiFetch<{ data: unknown; message: string }>(`/api/settings/profile${userId ? `?user_id=${userId}` : ''}`, {
        method: 'PATCH',
        body: JSON.stringify({ full_name }),
      }),
    changePassword: (password: string, userId?: string) =>
      apiFetch<{ message: string }>(`/api/settings/password${userId ? `?user_id=${userId}` : ''}`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    getMfa: (userId?: string) =>
      apiFetch<{ data: { enrolled: boolean; factor_id: string | null; created_at: string | null } }>(`/api/settings/mfa${userId ? `?user_id=${userId}` : ''}`),
    removeMfa: (factor_id: string, userId?: string) =>
      apiFetch<{ message: string }>(`/api/settings/mfa${userId ? `?user_id=${userId}` : ''}`, {
        method: 'DELETE',
        body: JSON.stringify({ factor_id }),
      }),
    getThresholds: () =>
      apiFetch<{ data: { metric_key: string; label: string; warning_threshold: number; critical_threshold: number; unit: string }[] }>('/api/settings/thresholds'),
    updateThresholds: (thresholds: { metric_key: string; warning_threshold: number; critical_threshold: number }[]) =>
      apiFetch<{ message: string }>('/api/settings/thresholds', {
        method: 'PUT',
        body: JSON.stringify({ thresholds }),
      }),
  },
  notifications: {
    listChannels: () =>
      apiFetch<{ data: any[] }>('/api/notifications/channels'),
    createChannel: (body: { type: string; name: string; config?: Record<string, unknown>; enabled?: boolean }) =>
      apiFetch<{ data: any }>('/api/notifications/channels', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateChannel: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ data: any }>(`/api/notifications/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteChannel: (id: string) =>
      apiFetch<{ message: string }>(`/api/notifications/channels/${id}`, {
        method: 'DELETE',
      }),
    testChannel: (id: string) =>
      apiFetch<{ message: string }>(`/api/notifications/channels/${id}/test`, {
        method: 'POST',
      }),
  },
  services: {
    overview: () =>
      apiFetch<{ data: any }>('/api/admin/services/overview'),
  },
  dr: {
    listPairs: () =>
      apiFetch<{ data: any[] }>('/api/dr/pairs'),
    getPair: (id: string) =>
      apiFetch<{ data: any }>(`/api/dr/pairs/${id}`),
    createPair: (body: { prod_connection_id: string; dr_connection_id: string; rpo_target_minutes?: number; rto_target_minutes?: number; notes?: string }) =>
      apiFetch<{ data: any }>('/api/dr/pairs', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updatePair: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ data: any }>(`/api/dr/pairs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deletePair: (id: string) =>
      apiFetch<{ message: string }>(`/api/dr/pairs/${id}`, { method: 'DELETE' }),
    listDrills: (pairId?: string) => {
      const qs = pairId ? `?pair_id=${pairId}` : ''
      return apiFetch<{ data: any[] }>(`/api/dr/drills${qs}`)
    },
    createDrill: (body: { pair_id: string; result: string; started_at: string; completed_at?: string; duration_min?: number; rpo_actual_min?: number; rto_actual_min?: number; notes?: string }) =>
      apiFetch<{ data: any }>('/api/dr/drills', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateDrill: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ data: any }>(`/api/dr/drills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteDrill: (id: string) =>
      apiFetch<{ message: string }>(`/api/dr/drills/${id}`, { method: 'DELETE' }),
  },
  reports: {
    capacity: (days = 30) =>
      apiFetch<{ data: any }>(`/api/reports/capacity?days=${days}`),
    fleet: () =>
      apiFetch<{ data: any }>('/api/reports/fleet'),
    drReadiness: () =>
      apiFetch<{ data: any[] }>('/api/reports/dr-readiness'),
    incidents: (days = 30) =>
      apiFetch<{ data: any }>(`/api/reports/incidents?days=${days}`),
    audit: (days = 30, limit = 200, action?: string) => {
      const params = new URLSearchParams({ days: String(days), limit: String(limit) })
      if (action) params.set('action', action)
      return apiFetch<{ data: any }>(`/api/reports/audit?${params}`)
    },
  },
}
