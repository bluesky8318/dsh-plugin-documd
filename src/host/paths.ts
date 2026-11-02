/**
 * Workspace containment for every file the viewer reads.
 *
 * Two rules, both enforced on the real path rather than the requested string:
 *   - the resolved file must exist and be a regular file;
 *   - its realpath must sit inside one of the roots that apply to the request.
 *
 * Roots are **per address scope**, mirroring dsh itself
 * (`@deepseek-ai/dsh-api-workspace-files`): a `session` address names a live
 * session whose workspace is `session.header.cwd`, falling back to
 * `sandboxPolicy.workspaceRoot`; an `absolute` address uses the deployment
 * default. Relative paths are joined to those roots, absolute ones are used
 * verbatim.
 *
 * Comparison normalizes both sides (`path.resolve`, which is case-insensitive
 * for drive letters on Windows) and additionally compares against the
 * `realpath` of every root, so a workspace reached through a symlink still
 * contains its files. When `realpath` fails but `stat` succeeds, the normalized
 * path is used instead of guessing.
 *
 * @module dsh-plugin-documd/host/paths
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

/** Raised when a request names something outside the allowed roots. */
export class OutsideWorkspaceError extends Error {
  readonly code = 'outside_workspace'
}

/** Raised when the path does not exist, is a directory, or cannot be stat'ed. */
export class MissingFileError extends Error {
  readonly code = 'missing_file'
}

/** A resolved, contained file plus the metadata the API echoes back. */
export interface ResolvedFile {
  /** Absolute, symlink-resolved path. */
  readonly realPath: string
  /** Path as returned to the viewer (relative for session scope, absolute otherwise). */
  readonly displayPath: string
  readonly size: number
  readonly mtimeMs: number
}

/** One attempted candidate, kept for the diagnostics route and failure logs. */
export interface PathAttempt {
  readonly candidate: string
  readonly realPath?: string
  /** `true` when `realpath` failed and the normalized path was used instead. */
  readonly fallback?: boolean
  readonly stat?: 'file' | 'other' | 'error'
  readonly contained?: boolean
}

/** The full chain behind one resolution: what came in, what was tried, what won. */
export interface PathTrace {
  readonly requested: string
  readonly sessionId?: string
  readonly roots: readonly string[]
  readonly candidates: readonly string[]
  readonly attempts: readonly PathAttempt[]
  readonly outcome: 'resolved' | 'outside' | 'missing'
}

/**
 * Resolve the roots that apply to one address scope.
 *
 * @param sessionId - the session named by a `session` address, if any.
 * @returns absolute roots; an empty result means "use the deployment default".
 */
export type RootResolver = (sessionId: string | undefined) => readonly string[]

/**
 * Is `target` at or below `root` after normalizing both?
 * @param root - absolute root.
 * @param target - absolute path.
 * @returns whether the target is contained.
 */
export function isContained(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

/** Split a `;`/`,` separated root list. */
function splitRoots(raw: string): string[] {
  return raw.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean)
}

/**
 * Resolve file requests against the roots that apply to their address scope.
 *
 * `workspaceRoot` in the config is an optional extra root list (`;`/`,`
 * separated); an empty value means "use what dsh reports", which is the
 * session cwd for session addresses and `sandboxPolicy.workspaceRoot` /
 * `process.cwd()` otherwise.
 */
export class WorkspacePaths {
  /** Raw configured value, re-read on each resolve so settings edits apply live. */
  private readonly readRootConfig: () => string
  /** Host-provided roots, keyed by the session an address names. */
  private readonly rootsForSession: RootResolver | undefined

  constructor(readRootConfig: () => string, rootsForSession?: RootResolver) {
    this.readRootConfig = readRootConfig
    this.rootsForSession = rootsForSession
  }

  /**
   * The roots in force for one address scope, absolute and normalized.
   * @param sessionId - the session named by the address, if any.
   * @returns every applicable root, in priority order (session first).
   */
  roots(sessionId?: string): string[] {
    const provided = this.rootsForSession?.(sessionId) ?? []
    const configured = splitRoots(this.readRootConfig())
    const combined = [...provided, ...configured]
    if (combined.length === 0) combined.push(process.cwd())
    return [...new Set(combined.map((entry) => path.resolve(entry)))]
  }

  /**
   * Resolve one requested path.
   * @param requested - workspace-relative (session scope) or absolute (absolute scope).
   * @param sessionId - the session named by a session-scoped address.
   * @param trace - optional array that receives the candidate attempts.
   * @returns the contained file.
   * @throws OutsideWorkspaceError when the resolved path escapes every root.
   * @throws MissingFileError when the target is absent or not a regular file.
   */
  async resolve(requested: string, sessionId?: string, trace?: PathAttempt[]): Promise<ResolvedFile> {
    const cleaned = requested.replace(/\\/g, '/')
    if (!cleaned || cleaned.includes('\0')) throw new MissingFileError('empty path')

    const roots = this.roots(sessionId)
    const candidates = path.isAbsolute(cleaned)
      ? [path.resolve(cleaned)]
      : roots.map((root) => path.resolve(root, cleaned))

    const rootVariants: string[] = []
    for (const root of roots) {
      rootVariants.push(path.resolve(root))
      try {
        rootVariants.push(path.resolve(await fs.realpath(root)))
      } catch {
        // A root that does not exist yet cannot contain anything, but the
        // normalized form still covers roots whose ACL denies realpath.
      }
    }

    for (const candidate of candidates) {
      let effective: string
      let fallback = false
      try {
        effective = await fs.realpath(candidate)
      } catch {
        // realpath can fail on a locked/ACL-restricted parent while the file
        // itself is readable; compare the normalized path instead of giving up.
        effective = path.resolve(candidate)
        fallback = true
      }

      let stat
      try {
        stat = await fs.stat(effective)
      } catch {
        trace?.push({ candidate, fallback, stat: 'error' })
        continue
      }
      if (!stat.isFile()) {
        trace?.push({ candidate, realPath: effective, fallback, stat: 'other' })
        continue
      }

      const contained = rootVariants.some((root) => isContained(root, effective))
      trace?.push({ candidate, realPath: effective, fallback, stat: 'file', contained })
      if (!contained) throw new OutsideWorkspaceError('path escapes the workspace root')

      return {
        realPath: effective,
        displayPath: cleaned,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      }
    }

    throw new MissingFileError('no such file in the workspace')
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/**
 * Content type for a static asset path.
 * @param filePath - any path with an extension.
 * @returns a MIME type, defaulting to `application/octet-stream`.
 */
export function mimeFor(filePath: string): string {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Split a `Range: bytes=…` header into a concrete window.
 * @param header - the raw header value.
 * @param size - full body length.
 * @returns inclusive start/end offsets, or `undefined` when the header is absent or unusable.
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | undefined {
  if (!header) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return undefined
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return undefined

  let start: number
  let end: number
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return undefined
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Number(rawEnd)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return undefined
  return { start, end: Math.min(end, size - 1) }
}
