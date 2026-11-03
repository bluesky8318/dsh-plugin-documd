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
    // The host resolver reads optional services through `ctx.reflect`; the
    // dev harness has neither, so it falls back to the configured root.
    reflect: {
      get() {
        return undefined
      },
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
    mode: { get: () => 'auto' },
    priority: { get: () => 'builtin' },
    rememberChoice: { get: () => true },
    debug: { get: () => true },
  },
)

if (!handler) {
  console.error('✗ the host half did not register a webServer handler')
  process.exit(1)
}

const reportFile = path.join(devRoot, '.report.json')

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${port}`}`)

  // The harness posts its measurements back so a head-driven run can be
  // inspected as a file on disk instead of scraped out of console output.
  if (url.pathname === '/__harness-report' && req.method === 'POST') {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8')
        const parsed = JSON.parse(body)
        fs.writeFileSync(reportFile, JSON.stringify(parsed, null, 2))
        console.log(`[dev] harness report → ${reportFile} (${parsed.state})`)
        res.writeHead(204)
        res.end()
      } catch (error) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end(`bad report: ${error}`)
      }
    })
    return
  }

  if (url.pathname === '/__harness-report') {
    try {
      const body = fs.readFileSync(reportFile)
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(body)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('no report yet')
    }
    return
  }

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
