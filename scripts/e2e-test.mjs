/**
 * ADORS End-to-End API test suite
 * Usage: node scripts/e2e-test.mjs
 */

const API  = 'http://localhost:4000'
const AUTH = 'http://localhost:9999'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYxMzUzMTk4NSwiZXhwIjo0NzY5MjA1OTg1fQ.ormcGpjFdRpxNcW3LBpNRvOAr1yDjVkuP6yumJSVgnc'

let token = ''
let passed = 0
let failed = 0
const results = []

async function req(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  let data
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

function check(label, condition, detail = '') {
  const pass = Boolean(condition)
  pass ? passed++ : failed++
  results.push({ label, pass, detail })
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`)
}

async function run() {
  console.log('\n═══════════════════════════════════════')
  console.log('  ADORS End-to-End Test Suite')
  console.log('═══════════════════════════════════════\n')

  // ── 1. Infrastructure ──────────────────────────────────────────
  console.log('1. Infrastructure & Auth')

  const health = await req('GET', `${API}/health`)
  check('API health endpoint', health.status === 200, `status=${health.status}`)
  check('API reports ok',      health.data?.status === 'ok')

  // Auth
  const authRes = await req('POST', `${AUTH}/token?grant_type=password`, {
    email: 'admin@adors.local',
    password: 'changeme123',
  })
  check('Auth returns 200',       authRes.status === 200, `status=${authRes.status}`)
  check('Auth returns token',     !!authRes.data?.access_token)
  token = authRes.data?.access_token ?? ''

  if (!token) {
    console.log('\n  ⚠ No token — skipping authenticated tests\n')
    printSummary()
    return
  }

  // ── 2. /api/me ─────────────────────────────────────────────────
  console.log('\n2. /api/me')
  const me = await req('GET', `${API}/api/me`)
  check('/api/me returns 200',        me.status === 200, `status=${me.status}`)
  check('/api/me returns email',      !!me.data?.data?.email)
  check('/api/me returns role',       !!me.data?.data?.role, `role=${me.data?.data?.role}`)
  check('/api/me returns onboarded',  'onboarded' in (me.data?.data ?? {}), `onboarded=${me.data?.data?.onboarded}`)
  check('role is super_admin',        me.data?.data?.role === 'super_admin')

  // ── 3. Connections ─────────────────────────────────────────────
  console.log('\n3. Connections')
  const conns = await req('GET', `${API}/api/connections`)
  check('GET /api/connections 200',   conns.status === 200, `status=${conns.status}`)
  check('Returns array',              Array.isArray(conns.data?.data))
  const connCount = conns.data?.data?.length ?? 0
  check(`Has connections (${connCount})`, connCount > 0)

  const firstConn = conns.data?.data?.[0]
  let connId = firstConn?.id

  if (connId) {
    const detail = await req('GET', `${API}/api/connections/${connId}`)
    check('GET /api/connections/:id 200',  detail.status === 200, `status=${detail.status}`)
    check('Detail has snapshot',           !!detail.data?.data?.snapshot)
  }

  // Unauthorised — viewer role would be blocked from DBA routes; test with wrong method
  const delUnauth = await req('DELETE', `${API}/api/connections/00000000-0000-0000-0000-000000000000`)
  check('DELETE non-existent returns 404', delUnauth.status === 404, `status=${delUnauth.status}`)

  // ── 4. Alerts ──────────────────────────────────────────────────
  console.log('\n4. Alerts')
  const alerts = await req('GET', `${API}/api/alerts`)
  check('GET /api/alerts 200',   alerts.status === 200, `status=${alerts.status}`)
  check('Alerts returns array',  Array.isArray(alerts.data?.data))
  const counts = await req('GET', `${API}/api/alerts/counts`)
  check('GET /api/alerts/counts 200', counts.status === 200, `status=${counts.status}`)
  check('Counts has critical field',  'critical' in (counts.data?.data ?? {}))

  // ── 5. Scripts ─────────────────────────────────────────────────
  console.log('\n5. Scripts')
  const scripts = await req('GET', `${API}/api/scripts`)
  check('GET /api/scripts 200',  scripts.status === 200, `status=${scripts.status}`)
  check('Scripts returns array', Array.isArray(scripts.data?.data))
  const scriptCount = scripts.data?.data?.length ?? 0
  check(`Has scripts (${scriptCount})`, scriptCount > 0)

  // Test execute-prod on non-existent script → 404
  const execProdFail = await req('POST', `${API}/api/scripts/00000000-0000-0000-0000-000000000000/execute-prod`, {
    connection_id: '00000000-0000-0000-0000-000000000001',
  })
  check('execute-prod on bad script → 404', execProdFail.status === 404, `status=${execProdFail.status}`)

  // Test execute-prod on unverified script (if we have one)
  const unverified = scripts.data?.data?.find(s => !s.verified_at)
  if (unverified && connId) {
    const uvRes = await req('POST', `${API}/api/scripts/${unverified.id}/execute-prod`, {
      connection_id: connId,
    })
    check('execute-prod unverified → 422', uvRes.status === 422, `status=${uvRes.status}`)
  }

  // ── 6. Sandbox ─────────────────────────────────────────────────
  console.log('\n6. Sandbox')
  const envs = await req('GET', `${API}/api/sandbox/envs`)
  check('GET /api/sandbox/envs 200',  envs.status === 200, `status=${envs.status}`)
  check('Sandbox envs is array',      Array.isArray(envs.data?.data))
  const runs = await req('GET', `${API}/api/sandbox/runs`)
  check('GET /api/sandbox/runs 200',  runs.status === 200, `status=${runs.status}`)

  // ── 7. Admin routes ────────────────────────────────────────────
  console.log('\n7. Admin / User Management')
  const users = await req('GET', `${API}/api/admin/users`)
  check('GET /api/admin/users 200',   users.status === 200, `status=${users.status}`)
  check('Users is array',             Array.isArray(users.data?.data))
  const userCount = users.data?.data?.length ?? 0
  check(`Has users (${userCount})`,   userCount > 0)

  // Attempt invite with bad email → 400
  const badInvite = await req('POST', `${API}/api/admin/users/invite`, {
    email: 'not-an-email',
    role: 'analyst',
  })
  check('Invite bad email → 400',     badInvite.status === 400, `status=${badInvite.status}`)

  // Attempt self-demotion → 403
  const myId = me.data?.data?.id
  if (myId) {
    const selfDemote = await req('PATCH', `${API}/api/admin/users/${myId}/role`, { role: 'analyst' })
    check('Self-demotion → 403',      selfDemote.status === 403, `status=${selfDemote.status}`)
  }

  // ── 8. Analytics ───────────────────────────────────────────────
  console.log('\n8. Analytics')
  const fleet = await req('GET', `${API}/api/analytics/fleet?days=7`)
  check('GET /api/analytics/fleet 200', fleet.status === 200, `status=${fleet.status}`)

  // ── 9. Activity log ────────────────────────────────────────────
  console.log('\n9. Activity Log')
  const activity = await req('GET', `${API}/api/activity`)
  check('GET /api/activity 200', activity.status === 200, `status=${activity.status}`)

  // ── 10. Role enforcement — unauthenticated ─────────────────────
  console.log('\n10. Auth guards')
  const savedToken = token
  token = ''  // no token
  const noAuth = await req('GET', `${API}/api/me`)
  check('No-token → 401',            noAuth.status === 401, `status=${noAuth.status}`)
  const noAuthAdmin = await req('GET', `${API}/api/admin/users`)
  check('No-token admin → 401',      noAuthAdmin.status === 401, `status=${noAuthAdmin.status}`)
  token = savedToken

  // Viewer role guard: create a viewer token if possible (skip if no viewer user in seed)
  // Just verify DBA-only routes reject a viewer (we'd need a viewer token; skip for now)

  printSummary()
}

function printSummary() {
  console.log('\n═══════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('═══════════════════════════════════════')
  if (failed > 0) {
    console.log('\n  Failed tests:')
    results.filter(r => !r.pass).forEach(r => console.log(`    ✗ ${r.label} ${r.detail ? '(' + r.detail + ')' : ''}`))
  }
  console.log()
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
