/**
 * AES-256-GCM symmetric encryption for DB credentials stored in Postgres.
 *
 * Key lifecycle:
 *   - ENCRYPTION_KEY must be a 64-character hex string (256-bit key)
 *   - Generate once: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   - Store in apps/api/.env — never commit to source control
 *
 * Each encrypt() call generates a fresh random IV (nonce), so the same
 * plaintext produces a different ciphertext every time.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set')
  const buf = Buffer.from(key, 'hex')
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hex characters (256-bit)')
  return buf
}

export interface Encrypted {
  enc: string   // base64 AES-256-GCM ciphertext
  iv:  string   // base64 12-byte IV / nonce
  tag: string   // base64 16-byte GCM authentication tag
}

export function encrypt(plaintext: string): Encrypted {
  const key    = getKey()
  const iv     = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    enc: enc.toString('base64'),
    iv:  iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

export function decrypt({ enc, iv, tag }: Encrypted): string {
  const key      = getKey()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(enc, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
