/**
 * Credential resolver — maps a connection's `credentials_ref` field to actual
 * runtime credentials pulled from environment variables.
 *
 * Format: "ENV:PREFIX" → reads  PREFIX_USER / PREFIX_PASSWORD / PREFIX_HOST /
 *                                PREFIX_PORT / PREFIX_DATABASE
 *
 * Example: credentials_ref = "ENV:ORACLE_PROD"
 *   → ORACLE_PROD_USER, ORACLE_PROD_PASSWORD, ORACLE_PROD_HOST,
 *     ORACLE_PROD_PORT (default 1521), ORACLE_PROD_DATABASE
 *
 * This keeps credentials out of the database entirely.
 */

import type { DbCredentials } from './types.js'

export function resolveCredentials(
  credentialsRef: string,
  defaults: { host: string; port: number; database: string },
): DbCredentials {
  if (!credentialsRef.startsWith('ENV:')) {
    throw new Error(`Unsupported credentials_ref format: "${credentialsRef}". Expected "ENV:<PREFIX>".`)
  }

  const prefix = credentialsRef.slice(4)  // strip "ENV:"

  const username = requireEnv(`${prefix}_USER`)
  const password = requireEnv(`${prefix}_PASSWORD`)

  const host     = process.env[`${prefix}_HOST`]     ?? defaults.host
  const portStr  = process.env[`${prefix}_PORT`]     ?? String(defaults.port)
  const database = process.env[`${prefix}_DATABASE`] ?? defaults.database

  const port = parseInt(portStr, 10)
  if (Number.isNaN(port)) throw new Error(`Invalid port in ${prefix}_PORT: "${portStr}"`)

  return { host, port, database, username, password }
}

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}
