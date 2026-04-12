import { supabase } from '../config/supabase.js'

interface LogActivityParams {
  actorId:    string
  actorName:  string
  action:     string
  targetType: string
  targetId?:  string
  payload?:   Record<string, unknown>
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  const { error } = await supabase.from('activity_log').insert({
    actor_id:    params.actorId,
    actor_name:  params.actorName,
    action:      params.action,
    target_type: params.targetType,
    target_id:   params.targetId ?? null,
    payload:     params.payload ?? {},
  })

  if (error) {
    // Non-fatal — log but don't throw
    console.error('[activity] Failed to log activity:', error.message)
  }
}

export async function getRecentActivity(limit = 20) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data
}

interface SearchParams {
  limit:       number
  offset:      number
  action?:     string
  targetType?: string
  actorName?:  string
  search?:     string
}

export async function searchActivity(params: SearchParams) {
  let query = supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1)

  if (params.action) {
    query = query.ilike('action', `%${params.action}%`)
  }
  if (params.targetType) {
    query = query.eq('target_type', params.targetType)
  }
  if (params.actorName) {
    query = query.ilike('actor_name', `%${params.actorName}%`)
  }
  if (params.search) {
    query = query.or(`action.ilike.%${params.search}%,actor_name.ilike.%${params.search}%,target_type.ilike.%${params.search}%`)
  }

  const { data, error, count } = await query

  if (error) throw new Error(error.message)
  return { data: data ?? [], total: count ?? 0 }
}
