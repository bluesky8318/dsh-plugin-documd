/**
 * Workspace containment for every file the viewer reads.
 *
 * Two rules, both enforced on the real path rather than the requested string:
 *   - the resolved file must exist and be a regular file;
 *   - its realpath must sit inside one of the configured roots.
 *
 * Session-address paths are workspace-relative; absolute-address paths are used
 * verbatim. Both funnel through {@link WorkspacePaths.resolve}.
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

/**
 * Resolve file requests against the configured roots.
 *
 * `workspaceRoot` accepts several roots separated by `;` (Windows-friendly)
 * or `,`; an empty value falls back to `process.cwd()`, which is what `dsh`
 * uses when it is launched from a project directory.
 */
export class WorkspacePaths {
  /** Raw configured value, re-read on each resolve so settings edits apply live. */
  private readonly readRootConfig: () => string

  constructor(readRootConfig: () => string) {
    this.readRootConfig = readRootConfig
  }

  /** The roots in force, absolute and normalized. */
  roots(): string[] {
    const raw = this.readRootConfig().trim()
    const parts = raw
      ? raw.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean)
      : [process.cwd()]
    return parts.map((entry) => path.resolve(entry))
  }

  /**
   * Resolve one requested path.
   * @param requested - workspace-relative (session scope) or absolute (absolute scope).
   * @returns the contained file.
   * @throws OutsideWorkspaceError when the realpath escapes every root.
   * @throws MissingFileError when the target is absent or not a regular file.
   */
  async resolve(requested: string): Promise<ResolvedFile> {
    const cleaned = requested.replace(/\\/g, '/')
    if (!cleaned || cleaned.includes('\0')) throw new MissingFileError('empty path')
    if (cleaned.split('/').includes('..')) throw new OutsideWorkspaceError('parent traversal is not allowed')

    const candidates = path.isAbsolute(cleaned)
      ? [cleaned]
      : this.roots().map((root) => path.join(root, cleaned))

    let realRoots: string[] = []
    for (const root of this.roots()) {
      try {
        realRoots.push(await fs.realpath(root))
      } catch {
        // A root that does not exist yet cannot contain anything.
      }
    }

    for (const candidate of candidates) {
      let realPath: string
      let stat
      try {
        realPath = await fs.realpath(candidate)
        stat = await fs.stat(realPath)
      } catch {
        continue
      }
      if (!stat.isFile()) continue

      const contained = realRoots.some((root) => {
        const relative = path.relative(root, realPath)
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
      })
      if (!contained) throw new OutsideWorkspaceError('path escapes the workspace root')

      return {
        realPath,
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
