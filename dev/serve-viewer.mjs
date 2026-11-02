#!/usr/bin/env node

/**
 * Bare-browser harness for the viewer, with no dsh in the loop.
 *
 *   npm run build && npm run build:viewer
 *   npm run dev:viewer            → http://127.0.0.1:4318
 *
 * It loads the *built* host half (`lib/index.js`) with a stub Cordis context:
 * `ctx.effect` runs the callback immediately and `ctx.webServer.register`
 * captures the real request handler, so the HTTP surface exercised here is the
 * one a dsh profile would mount. The page at `/` plays the part the browser
 * half plays in dsh: issue a session token, read the document, create the
 * viewer iframe, and hand it OPEN_DOCUMENT once it reports VIEWER_READY.
 *
 * Only the host half is stubbed — no tab registry, no slot system, no React.
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const devRoot = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(devRoot, '..')
const port = Number(process.env.PORT || 4318)

const libEntry = path.join(pluginRoot, 'lib', 'index.js')
if (!fs.existsSync(libEntry)) {
  console.error(`✗ ${libEntry} is missing. Run \`npm run build\` first.`)
  process.exit(1)
}
if (!fs.existsSync(path.join(pluginRoot, 'assets', 'viewer', 'index.html'))) {
  console.error('✗ assets/viewer is missing. Run `npm run build:viewer` first.')
  process.exit(1)
}

const { apply } = await import(new URL('../lib/index.js', import.meta.url).href)

let handler
apply(
  {
    effect(callback) {
      return callback()
    },
    webServer: {
      register({ handler: registered }) {
        handler = registered
        return () => {
          handler = undefined
        }
      },
    },
  },
  {
    workspaceRoot: { get: () => devRoot },
    themeId: { get: () => 'auto' },
    maxPreviewBytes: { get: () => 8 * 1024 * 1024 },
    tokenTtlMs: { get: () => 10 * 60 * 1000 },
  },
)

if (!handler) {
  console.error('✗ the host half did not register a webServer handler')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${port}`}`)

  if (url.pathname === '/' || url.pathname === '/harness.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(fs.readFileSync(path.join(devRoot, 'harness.html')))
    return
  }

  if (url.pathname === '/docu-preview' || url.pathname.startsWith('/docu-preview/')) {
    void handler(req, res).catch((error) => {
      console.error('[dev] handler failed:', error)
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('internal error')
    })
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`▶ documd viewer harness → http://127.0.0.1:${port}/`)
  console.log(`  workspace root: ${devRoot}`)
})
