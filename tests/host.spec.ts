import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRoutes, type RoutesOptions } from '../src/host/routes.ts'
import {
  MissingFileError,
  OutsideWorkspaceError,
  WorkspacePaths,
  parseRange,
} from '../src/host/paths.ts'
import { TokenStore } from '../src/host/tokens.ts'
import { formatFileAddress } from '../src/shared/contract.ts'

let sandbox = ''
let root = ''
let outsideFile = ''
let viewerRoot = ''

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'documd-test-'))
  root = path.join(sandbox, 'workspace')
  viewerRoot = path.join(sandbox, 'viewer')
  const outside = path.join(sandbox, 'outside')
  for (const dir of [path.join(root, 'docs'), viewerRoot, outside]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# hello\n\nbody\n')
  fs.writeFileSync(path.join(root, 'docs', 'pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n')
  outsideFile = path.join(outside, 'secret.md')
  fs.writeFileSync(outsideFile, '# secret\n')
  fs.writeFileSync(path.join(viewerRoot, 'index.html'), '<!doctype html><title>viewer</title>')
})

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe('WorkspacePaths', () => {
  const paths = () => new WorkspacePaths(() => root)

  it('resolves a workspace-relative file', async () => {
    const resolved = await paths().resolve('docs/a.md')
    expect(resolved.displayPath).toBe('docs/a.md')
    expect(resolved.size).toBeGreaterThan(0)
  })

  it('refuses parent traversal before touching the disk', async () => {
    await expect(paths().resolve('../outside/secret.md')).rejects.toBeInstanceOf(OutsideWorkspaceError)
  })

  it('refuses an absolute path outside the root', async () => {
    await expect(paths().resolve(outsideFile)).rejects.toBeInstanceOf(OutsideWorkspaceError)
  })

  it('reports a missing file', async () => {
    await expect(paths().resolve('docs/nope.md')).rejects.toBeInstanceOf(MissingFileError)
    await expect(paths().resolve('')).rejects.toBeInstanceOf(MissingFileError)
  })

  it('refuses a directory', async () => {
    await expect(paths().resolve('docs')).rejects.toBeInstanceOf(MissingFileError)
  })
})

describe('TokenStore', () => {
  it('issues, resolves and revokes', () => {
    const store = new TokenStore()
    const record = store.issue('docs/a.md', 'a.md', 60_000)
    expect(store.get(record.token)?.path).toBe('docs/a.md')
    expect(store.revoke(record.token)).toBe(true)
    expect(store.get(record.token)).toBeUndefined()
  })

  it('expires', () => {
    vi.useFakeTimers()
    try {
      const store = new TokenStore()
      const record = store.issue('docs/a.md', 'a.md', 1_000)
      vi.advanceTimersByTime(2_000)
      expect(store.get(record.token)).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores empty and unknown tokens', () => {
    const store = new TokenStore()
    expect(store.get('')).toBeUndefined()
    expect(store.get('nope')).toBeUndefined()
    expect(store.revoke('nope')).toBe(false)
  })
})

describe('parseRange', () => {
  it('understands the common forms', () => {
    expect(parseRange('bytes=0-3', 10)).toEqual({ start: 0, end: 3 })
    expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 })
    expect(parseRange('bytes=-2', 10)).toEqual({ start: 8, end: 9 })
  })

  it('ignores unusable headers', () => {
    expect(parseRange(undefined, 10)).toBeUndefined()
    expect(parseRange('bytes=-', 10)).toBeUndefined()
    expect(parseRange('bytes=9-2', 10)).toBeUndefined()
    expect(parseRange('items=0-1', 10)).toBeUndefined()
  })
})

describe('createRoutes over HTTP', () => {
  let server: http.Server
  let base = ''
  let tokens: TokenStore

  beforeAll(async () => {
    const options: RoutesOptions = {
      viewerRoot,
      workspaceRoot: () => root,
      maxPreviewBytes: () => 1024 * 1024,
      tokenTtlMs: () => 60_000,
      themeId: () => 'auto',
      log: () => {},
    }
    const routes = createRoutes(options)
    tokens = routes.tokens
    server = http.createServer((req, res) => {
      void routes.handle(req, res)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const issue = async (address: string, init?: RequestInit) => fetch(`${base}/docu-preview/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, dark: false }),
    ...init,
  })

  it('serves the viewer index as static files', async () => {
    const response = await fetch(`${base}/docu-preview/viewer/index.html`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>viewer</title>')
  })

  it('does not serve an encoded path that escapes the viewer root', async () => {
    const response = await fetch(`${base}/docu-preview/viewer/%2e%2e%2f%2e%2e%2fpackage.json`)
    expect(response.status).toBe(404)
  })

  it('issues a session for a workspace file', async () => {
    const response = await issue('dsh-resource://file/session/s1/docs/a.md')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { token: string; category: string; path: string }
    expect(body.category).toBe('viewer')
    expect(body.path).toBe('docs/a.md')
    expect(tokens.get(body.token)).toBeDefined()
  })

  it('refuses an address it cannot parse', async () => {
    const response = await issue('https://example.com/a.md')
    expect(response.status).toBe(400)
  })

  it('refuses a file outside the workspace root', async () => {
    const address = formatFileAddress('dsh-resource://file/absolute/C:/x', outsideFile)
    expect(address).toBeDefined()
    const response = await issue(address ?? '')
    expect(response.status).toBe(403)
  })

  it('refuses a cross-origin token request', async () => {
    const response = await issue('dsh-resource://file/session/s1/docs/a.md', {
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    })
    expect(response.status).toBe(403)
  })

  it('reads the document behind the token', async () => {
    const issued = (await (await issue('dsh-resource://file/session/s1/docs/a.md')).json()) as { token: string }
    const response = await fetch(`${base}/docu-preview/api/file?token=${issued.token}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { content: string; encoding: string }
    expect(body.encoding).toBe('utf8')
    expect(body.content).toContain('# hello')
  })

  it('rejects an unknown token', async () => {
    const response = await fetch(`${base}/docu-preview/api/file?token=deadbeef`)
    expect(response.status).toBe(401)
  })

  it('serves relative assets with Range support', async () => {
    const issued = (await (await issue('dsh-resource://file/session/s1/docs/a.md')).json()) as { token: string }
    const asset = `${base}/docu-preview/api/asset/${issued.token}/docs/pixel.svg`
    const full = await fetch(asset)
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toBe('image/svg+xml')

    const partial = await fetch(asset, { headers: { range: 'bytes=0-3' } })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('content-range')).toMatch(/^bytes 0-3\//)
  })

  it('refuses an asset without a token', async () => {
    const response = await fetch(`${base}/docu-preview/api/asset/docs/pixel.svg`)
    expect(response.status).toBe(401)
  })

  it('resolves the theme for light and dark', async () => {
    const light = (await (await fetch(`${base}/docu-preview/api/theme?dark=0`)).json()) as { themeId: string }
    const dark = (await (await fetch(`${base}/docu-preview/api/theme?dark=1`)).json()) as { themeId: string }
    expect(light.themeId).toBe('vscode')
    expect(dark.themeId).toBe('vscode-dark')
  })

  it('revokes a token on DELETE', async () => {
    const issued = (await (await issue('dsh-resource://file/session/s1/docs/a.md')).json()) as { token: string }
    const revoked = await fetch(`${base}/docu-preview/api/session?token=${issued.token}`, { method: 'DELETE' })
    expect(revoked.status).toBe(200)
    expect(tokens.get(issued.token)).toBeUndefined()
  })

  it('answers unknown routes with a JSON 404', async () => {
    const response = await fetch(`${base}/docu-preview/api/nope`)
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toBe('not_found')
  })
})
