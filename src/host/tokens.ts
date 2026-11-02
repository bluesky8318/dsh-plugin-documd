/**
 * Per-tab capability tokens.
 *
 * A tab asks the host for a token once; the viewer iframe then carries it in its
 * URL and uses it for every file/asset request. Tokens are random, bound to one
 * document path, expire after `tokenTtlMs`, and are revoked when the tab closes
 * or the plugin unloads — the viewer never holds a session credential.
 *
 * @module dsh-plugin-documd/host/tokens
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'

/** One issued capability. */
export interface TokenRecord {
  readonly token: string
  /** Path the token was issued for (workspace-relative or absolute). */
  readonly path: string
  readonly filename: string
  readonly expiresAt: number
}

/**
 * Validate a token string without leaking comparison timing.
 * @param left - candidate token.
 * @param right - issued token.
 * @returns whether both are the same string.
 */
function sameToken(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** In-memory token table owned by one plugin instance. */
export class TokenStore {
  private readonly records = new Map<string, TokenRecord>()

  /**
   * Issue a token for one document.
   * @param path - path the viewer may read.
   * @param filename - basename shown in the UI.
   * @param ttlMs - lifetime in milliseconds.
   * @returns the record, including the token string.
   */
  issue(path: string, filename: string, ttlMs: number): TokenRecord {
    const token = randomBytes(24).toString('hex')
    const record: TokenRecord = {
      token,
      path,
      filename,
      expiresAt: Date.now() + Math.max(1_000, ttlMs),
    }
    this.records.set(token, record)
    this.prune()
    return record
  }

  /**
   * Look a token up.
   * @param token - candidate token.
   * @returns the record, or `undefined` when absent or expired.
   */
  get(token: string): TokenRecord | undefined {
    if (!token) return undefined
    const record = this.records.get(token)
    if (!record) return undefined
    if (record.expiresAt <= Date.now()) {
      this.records.delete(token)
      return undefined
    }
    return record
  }

  /**
   * Revoke one token.
   * @param token - candidate token.
   * @returns whether a live record was removed.
   */
  revoke(token: string): boolean {
    if (!token) return false
    const record = this.records.get(token)
    if (!record || !sameToken(record.token, token)) return false
    this.records.delete(token)
    return true
  }

  /** Drop expired records; called on every issue so the table cannot grow unbounded. */
  private prune(): void {
    const now = Date.now()
    for (const [token, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(token)
    }
  }

  /** Revoke everything (plugin unload). */
  clear(): void {
    this.records.clear()
  }
}
