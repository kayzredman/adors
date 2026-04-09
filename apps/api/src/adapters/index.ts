/**
 * Adapter factory — returns the correct live adapter or falls back to mock.
 *
 * Selection logic:
 *   1. If connection.credentials_ref is set → use live adapter
 *   2. Otherwise → fall back to mock (existing healthScanner mock functions)
 */

import type { DbAdapter } from './types.js'

export { resolveCredentials } from './credentialResolver.js'
export type { DbAdapter, DbCredentials } from './types.js'

let _oracle: import('./oracleAdapter.js').OracleAdapter  | null = null
let _mssql:  import('./mssqlAdapter.js').MssqlAdapter   | null = null
let _mariadb: import('./mariadbAdapter.js').MariaDbAdapter | null = null

export async function getAdapter(dbType: 'oracle' | 'mssql' | 'mariadb'): Promise<DbAdapter> {
  switch (dbType) {
    case 'oracle': {
      if (!_oracle) {
        const { OracleAdapter } = await import('./oracleAdapter.js')
        _oracle = new OracleAdapter()
      }
      return _oracle
    }
    case 'mssql': {
      if (!_mssql) {
        const { MssqlAdapter } = await import('./mssqlAdapter.js')
        _mssql = new MssqlAdapter()
      }
      return _mssql
    }
    case 'mariadb': {
      if (!_mariadb) {
        const { MariaDbAdapter } = await import('./mariadbAdapter.js')
        _mariadb = new MariaDbAdapter()
      }
      return _mariadb
    }
    default:
      throw new Error(`No adapter for db_type: ${dbType}`)
  }
}
