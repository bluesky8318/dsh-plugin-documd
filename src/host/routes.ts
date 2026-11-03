/**
 * The plugin's HTTP surface, mounted on `ctx.webServer` at `/docu-preview`.
 *
 * | route | purpose |
 * | --- | --- |
 * | `GET /docu-preview/viewer/*` | the static docu.md viewer bundle |
 * | `POST /docu-preview/api/session` | issue a per-tab token for one file address |
 * | `DELETE /docu-preview/api/session` | revoke a token when the tab closes |
 * | `GET /docu-preview/api/theme` | resolve the viewer theme id for light/dark |
 * | `GET /docu-preview/api/file` | document text (JSON) |
 * | `GET /docu-preview/api/asset` | binary asset by absolute/relative path |
 * | `GET /docu-preview/api/asset/<token>/<dir>/<name>` | relative image/asset rewrite target |
 * | `GET /docu-preview/api/options` | preview mode/priority the client half registers with |
 * | `GET /docu-preview/api/diagnostics` | the raw resolve chain (only when `debug: true`) |
 *
 * Everything is same-origin: the browser half and the viewer iframe both live on
 * the dsh web origin, so no CORS headers are emitted and cross-site POSTs are
 * rejected by the Origin check below.
 *
 * @module dsh-plugin-documd/host/routes
 */

import { createReadStream, promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import * as path from 'node:path'
import {
  API_PREFIX,
  ASSET_VERSION,
  VIEWER_PREFIX,
  classifyPath,
  parseFileAddress,
  resolveThemeId,
  type ApiErrorBody,
  type FileResponse,
  type PreviewMode,
  type PriorityBand,
  type SessionResponse,
} from '../shared/contract'
import {
  MissingFileError,
  OutsideWorkspaceError,
  WorkspacePaths,
  mimeFor,
  parseRange,
  type PathAttempt,
  type RootResolver,
} from './paths'
import { TokenStore } from './tokens'

/** Settings read at request time, so GUI edits apply without a reload. */
export interface RoutesOptions {
  /** Absolute directory holding the built viewer (`assets/viewer`). */
  readonly viewerRoot: string
  readonly workspaceRoot: () => string
  /** Roots dsh reports for a session (cwd), falling back to the deployment root. */
  readonly rootForSession: RootResolver
  readonly maxPreviewBytes: () => number
  readonly tokenTtlMs: () => number
  readonly themeId: () => string
  readonly mode: () => PreviewMode
  readonly priority: () => PriorityBand
  readonly rememberChoice: () => boolean
  readonly debug: () => boolean
  readonly log: (message: string) => void
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(payload)
}

function sendError(res: ServerResponse, status: number, error: string, message: string): void {
  const body: ApiErrorBody = { error, message }
  sendJson(res, status, body)
}

/**
 * Reject cross-site state changes.
 *
 * A browser always sends `Origin` on POST/DELETE from another origin; same-origin
 * requests may omit it. Requests without `Origin` are therefore only the local
 * CLI/curl path, which cannot be reached cross-origin by a web page.
 */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  const host = req.headers.host
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Read a small JSON body; refuses anything larger than 64 KiB. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    total += buffer.length
    if (total > 64 * 1024) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (total === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  const parsed: unknown = JSON.parse(raw)
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
}

function joinUrlPath(...segments: string[]): string {
  const parts = segments.flatMap((segment) => segment.split('/')).filter(Boolean)
  return parts.join('/')
}

/**
 * Build the request handler and the token table it uses.
 * @param options - live settings and the viewer root.
 * @returns the handler plus the store so the plugin can clear it on unload.
 */
export function createRoutes(options: RoutesOptions): {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  tokens: TokenStore
  paths: WorkspacePaths
} {
  const tokens = new TokenStore()
  const paths = new WorkspacePaths(options.workspaceRoot, options.rootForSession)

  /**
   * Ring buffer of the client/viewer timing reports (`POST /api/metrics`).
   *
   * Surfaced through `/api/diagnostics` while `debug: true` so a slow tab can
   * be reported with numbers instead of "feels slow".
   */
  const metrics: Array<Record<string, unknown>> = []
  const METRICS_KEEP = 8

  async function serveViewerAsset(
    relative: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    let requested = relative || 'index.html'
    if (requested.includes('\0')) return sendError(res, 400, 'bad_path', 'invalid asset path')

    // Versioned subtree: `/viewer/<ASSET_VERSION>/...` is immutable, and a
    // request for another version is a stale URL rather than a file.
    let versioned = false
    const versionMatch = /^([^/]+)\/(.*)$/.exec(requested)
    if (versionMatch && /^\d+\.\d+\.\d+/.test(versionMatch[1] ?? '')) {
      if (versionMatch[1] !== ASSET_VERSION) {
        return sendError(res, 404, 'stale_asset', `viewer ${versionMatch[1]} is not this build`)
      }
      versioned = true
      requested = versionMatch[2] || 'index.html'
    }

    const normalized = path.posix.normalize(requested.replace(/\\/g, '/'))
    if (normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
      return sendError(res, 403, 'outside_viewer', 'asset path escapes the viewer root')
    }

    const root = path.resolve(options.viewerRoot)
    const target = path.resolve(root, normalized)
    const relativeToRoot = path.relative(root, target)
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      return sendError(res, 403, 'outside_viewer', 'asset path escapes the viewer root')
    }

    let stat
    try {
      stat = await fs.stat(target)
    } catch {
      return sendError(res, 404, 'not_found', 'asset not found')
    }
    if (!stat.isFile()) return sendError(res, 404, 'not_found', 'asset not found')

    const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`
    const cacheControl = versioned
      ? 'public, max-age=31536000, immutable'
      : normalized === 'index.html'
        ? 'no-cache'
        : 'public, max-age=300'

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag, 'cache-control': cacheControl, 'x-content-type-options': 'nosniff' })
      res.end()
      return
    }

    res.writeHead(200, {
      'content-type': mimeFor(target),
      'content-length': stat.size,
      etag,
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    })
    createReadStream(target).pipe(res)
  }

  async function handleSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'DELETE') {
      const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token') ?? ''
      tokens.revoke(token)
      return sendJson(res, 200, { revoked: true })
    }
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'use POST or DELETE')
    if (!sameOrigin(req)) return sendError(res, 403, 'cross_origin', 'cross-origin token requests are refused')

    const body = await readJsonBody(req)
    const address = typeof body.address === 'string' ? body.address : ''
    const dark = body.dark === true
    if (!address) return sendError(res, 400, 'bad_address', 'address is required')

    const parsed = parseFileAddress(address)
    if (!parsed) return sendError(res, 400, 'bad_address', 'not a dsh-resource://file/ address')

    const sessionId = parsed.scope === 'session' ? parsed.sessionId : undefined
    const trace: PathAttempt[] = []
    let resolved
    try {
      resolved = await paths.resolve(parsed.path, sessionId, trace)
    } catch (error) {
      return sendPathError(res, error, { address, sessionId, trace })
    }

    if (options.debug()) {
      options.log(JSON.stringify({
        event: 'resolve',
        address,
        scope: parsed.scope,
        sessionId,
        path: parsed.path,
        roots: paths.roots(sessionId),
        trace,
        realPath: resolved.realPath,
      }))
    }

    const limit = Math.max(1, options.maxPreviewBytes())
    if (resolved.size > limit) {
      return sendError(
        res,
        413,
        'preview_limit',
        `file is ${resolved.size} bytes, above the ${limit}-byte preview limit`,
      )
    }

    const filename = path.posix.basename(parsed.path.replace(/\\/g, '/'))
    const record = tokens.issue(resolved.displayPath, filename, options.tokenTtlMs(), sessionId)
    const session: SessionResponse = {
      token: record.token,
      path: resolved.displayPath,
      filename,
      size: resolved.size,
      category: classifyPath(parsed.path),
      themeId: resolveThemeId(options.themeId(), dark),
      expiresAt: record.expiresAt,
    }
    sendJson(res, 200, session)
  }

  async function handleFile(url: URL, res: ServerResponse): Promise<void> {
    const record = tokens.get(url.searchParams.get('token') ?? '')
    if (!record) return sendError(res, 401, 'bad_token', 'missing or expired preview token')

    const requested = url.searchParams.get('path') || record.path
    const binary = url.searchParams.get('binary') === '1'

    const trace: PathAttempt[] = []
    let resolved
    try {
      resolved = await paths.resolve(requested, record.sessionId, trace)
    } catch (error) {
      return sendPathError(res, error, { address: record.path, sessionId: record.sessionId, trace })
    }

    const limit = Math.max(1, options.maxPreviewBytes())
    if (resolved.size > limit) {
      return sendError(
        res,
        413,
        'preview_limit',
        `file is ${resolved.size} bytes, above the ${limit}-byte preview limit`,
      )
    }

    const raw = await fs.readFile(resolved.realPath)
    const response: FileResponse = {
      content: binary ? raw.toString('base64') : raw.toString('utf8'),
      encoding: binary ? 'base64' : 'utf8',
      path: resolved.displayPath,
      filename: path.posix.basename(resolved.displayPath.replace(/\\/g, '/')),
      size: resolved.size,
      mtimeMs: resolved.mtimeMs,
      truncated: false,
    }
    sendJson(res, 200, response)
  }

  async function handleAsset(req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> {
    const queryToken = url.searchParams.get('token') ?? ''
    const pathTail = url.pathname.slice(`${API_PREFIX}/asset`.length)
    let segments: string[]
    try {
      segments = pathTail.split('/').filter(Boolean).map(decodeURIComponent)
    } catch {
      return sendError(res, 400, 'bad_path', 'asset path is not validly encoded')
    }

    let token = queryToken
    let requested = url.searchParams.get('path') ?? ''
    if (segments.length >= 2) {
      token = segments[0] ?? ''
      const dir = segments[1] ?? ''
      const rest = segments.slice(2).join('/')
      if (dir.startsWith('/') || /^[A-Za-z]:/.test(dir)) {
        requested = rest ? `${dir.replace(/\/+$/, '')}/${rest}` : dir
      } else {
        requested = joinUrlPath(dir, rest)
      }
    }

    const record = tokens.get(token)
    if (!record) return sendError(res, 401, 'bad_token', 'missing or expired preview token')
    if (!requested) return sendError(res, 400, 'bad_path', 'asset path is required')

    const trace: PathAttempt[] = []
    let resolved
    try {
      resolved = await paths.resolve(requested, record.sessionId, trace)
    } catch (error) {
      return sendPathError(res, error, { address: record.path, sessionId: record.sessionId, trace })
    }

    const range = parseRange(req.headers.range, resolved.size)
    const headers: Record<string, string> = {
      'content-type': mimeFor(resolved.realPath),
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=60',
      'x-content-type-options': 'nosniff',
    }

    if (range) {
      res.writeHead(206, {
        ...headers,
        'content-range': `bytes ${range.start}-${range.end}/${resolved.size}`,
        'content-length': range.end - range.start + 1,
      })
      createReadStream(resolved.realPath, { start: range.start, end: range.end }).pipe(res)
      return
    }

    res.writeHead(200, { ...headers, 'content-length': resolved.size })
    createReadStream(resolved.realPath).pipe(res)
  }

  function sendPathError(
    res: ServerResponse,
    error: unknown,
    context?: { address: string; sessionId: string | undefined; trace: PathAttempt[] },
  ): void {
    if (context && options.debug()) {
      options.log(JSON.stringify({
        event: 'resolve_failed',
        address: context.address,
        sessionId: context.sessionId,
        roots: paths.roots(context.sessionId),
        trace: context.trace,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }))
    }
    if (error instanceof OutsideWorkspaceError) {
      sendError(res, 403, 'outside_workspace', error.message)
      return
    }
    if (error instanceof MissingFileError) {
      sendError(res, 404, 'not_found', error.message)
      return
    }
    options.log(`[${'dsh-plugin-documd'}] unexpected path error: ${String(error)}`)
    sendError(res, 500, 'internal', 'could not resolve the requested path')
  }

  function handleOptions(res: ServerResponse): void {
    sendJson(res, 200, {
      mode: options.mode(),
      priority: options.priority(),
      rememberChoice: options.rememberChoice(),
      assetVersion: ASSET_VERSION,
    })
  }

  /**
   * Expose the whole resolve chain.
   *
   * This is the "print the real inputs" surface for bug reports: raw address,
   * parsed path, session, roots, per-candidate realpath/stat/containment. It
   * only exists while `debug: true`, so a production install does not leak
   * filesystem layout.
   */
  async function handleDiagnostics(url: URL, res: ServerResponse): Promise<void> {
    if (!options.debug()) return sendError(res, 404, 'not_found', 'diagnostics are disabled (set debug: true)')

    const address = url.searchParams.get('address') ?? ''
    const parsed = address ? parseFileAddress(address) : undefined
    const requested = parsed?.path ?? url.searchParams.get('path') ?? ''
    const sessionId = parsed?.scope === 'session'
      ? parsed.sessionId
      : url.searchParams.get('session') ?? undefined
    if (!requested) return sendError(res, 400, 'bad_path', 'address or path is required')

    const trace: PathAttempt[] = []
    let outcome: 'resolved' | 'outside' | 'missing' = 'missing'
    let realPath: string | undefined
    try {
      const resolved = await paths.resolve(requested, sessionId, trace)
      outcome = 'resolved'
      realPath = resolved.realPath
    } catch (error) {
      outcome = error instanceof OutsideWorkspaceError ? 'outside' : 'missing'
    }

    sendJson(res, 200, {
      outcome,
      address: address || undefined,
      scope: parsed?.scope,
      sessionId,
      requested,
      roots: paths.roots(sessionId),
      trace,
      realPath,
      assetVersion: ASSET_VERSION,
      metrics,
    })
  }

  /** `POST /api/metrics` — open-per-tab timings, kept in memory while debugging. */
  async function handleMetrics(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'use POST')
    if (!sameOrigin(req)) return sendError(res, 403, 'bad_origin', 'metrics must come from the app origin')

    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      return sendError(res, 400, 'bad_json', 'metrics body must be JSON')
    }
    if (!body || typeof body !== 'object') {
      return sendError(res, 400, 'bad_json', 'metrics body must be a JSON object')
    }

    metrics.push({ receivedAt: Date.now(), ...(body as Record<string, unknown>) })
    while (metrics.length > METRICS_KEEP) metrics.shift()
    sendJson(res, 200, { ok: true, kept: metrics.length, debug: options.debug() })
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawUrl = req.url ?? '/'
    const parsed = new URL(rawUrl, `http://${req.headers.host ?? '127.0.0.1'}`)
    const pathname = parsed.pathname

    if (pathname.startsWith(`${VIEWER_PREFIX}/`)) {
      return serveViewerAsset(pathname.slice(`${VIEWER_PREFIX}/`.length), req, res)
    }
    if (pathname === VIEWER_PREFIX) {
      return serveViewerAsset('index.html', req, res)
    }
    if (pathname === `${API_PREFIX}/session`) {
      return handleSession(req, res)
    }
    if (pathname === `${API_PREFIX}/metrics`) {
      return handleMetrics(req, res)
    }
    if (pathname === `${API_PREFIX}/options`) {
      if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'use GET')
      return handleOptions(res)
    }
    if (pathname === `${API_PREFIX}/diagnostics`) {
      if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'use GET')
      return handleDiagnostics(parsed, res)
    }
    if (pathname === `${API_PREFIX}/theme`) {
      if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'use GET')
      const dark = parsed.searchParams.get('dark') === '1'
      return sendJson(res, 200, { themeId: resolveThemeId(options.themeId(), dark) })
    }
    if (pathname === `${API_PREFIX}/file`) {
      if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'use GET')
      return handleFile(parsed, res)
    }
    if (pathname === `${API_PREFIX}/asset` || pathname.startsWith(`${API_PREFIX}/asset/`)) {
      if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'use GET')
      return handleAsset(req, parsed, res)
    }

    sendError(res, 404, 'not_found', 'unknown docu-preview route')
  }

  return { handle, tokens, paths }
}
