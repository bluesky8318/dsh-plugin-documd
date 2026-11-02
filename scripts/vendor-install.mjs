#!/usr/bin/env node

/**
 * Vendor the docu.md engine at a pinned SHA.
 *
 * Layout: `vendor/markdown-viewer/` is a git submodule pinned to the upstream
 * `markdown-viewer/markdown-viewer-extension` commit (GPL-3.0-only). This script
 * materializes it (or refreshes it) and applies the two-token `dsh` patch from
 * `scripts/patch-vendor.mjs`. The dsh platform implementation itself lives in
 * this repo under `viewer/`, never inside the vendor tree, so re-vendoring can
 * replace the tree wholesale.
 *
 * `git submodule update --init`       — primary route (uses the pinned gitlink)
 * `npm run vendor:install`            — install vendor deps + apply the patch
 * `npm run vendor:install -- --force` — re-download the tarball even if present
 *
 * Upgrading: bump VENDOR_SHA below, run with `--force`, then `npm run build:viewer`.
 * Expect `scripts/patch-vendor.mjs` to fail if upstream moved the two patched
 * lines; fix the anchors there rather than hand-editing the vendor tree.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Upstream repository and the exact commit this repo vendors. */
const VENDOR_REPO = 'markdown-viewer/markdown-viewer-extension'
const VENDOR_SHA = 'eca66a1dd07f2cc8d9bac16337d120aae67ff834'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendorRoot = path.join(pluginRoot, 'vendor', 'markdown-viewer')
// Kept outside the vendor tree: inside a checked-out submodule it would show up
// as dirty content in the parent repository.
const markerPath = path.join(pluginRoot, 'vendor', '.markdown-viewer.sha')
const archivePath = path.join(pluginRoot, 'vendor', '.markdown-viewer.tgz')

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} exited with ${result.status}`)
  }
}

/** npm's CLI entry next to the running node; falls back to PATH lookup. */
function npmArgs(args) {
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (fs.existsSync(cli)) return { command: process.execPath, args: [cli, ...args] }
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args }
}

function readMarker() {
  try {
    return fs.readFileSync(markerPath, 'utf8').trim()
  } catch {
    return ''
  }
}

async function download() {
  const url = `https://codeload.github.com/${VENDOR_REPO}/tar.gz/${VENDOR_SHA}`
  console.log(`⬇ ${url}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status} ${response.statusText}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  fs.mkdirSync(path.dirname(archivePath), { recursive: true })
  fs.writeFileSync(archivePath, bytes)
  console.log(`  ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
}

function extract() {
  fs.mkdirSync(vendorRoot, { recursive: true })
  // Windows ships bsdtar as `tar`; `--strip-components=1` drops the
  // `<repo>-<sha>/` wrapper the GitHub tarball carries.
  run('tar', ['-xzf', archivePath, '-C', vendorRoot, '--strip-components=1'], pluginRoot)
}

function installDependencies() {
  const options = ['--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps']
  const install = npmArgs(['install', ...options])
  run(install.command, install.args, vendorRoot)
  // `redoc` (pulled in by the OpenAPI renderer) lists mobx as a peer that the
  // upstream lockfile does not pin; without it esbuild cannot resolve the import.
  const mobx = npmArgs(['install', '--no-save', 'mobx@^6.13.0', ...options])
  run(mobx.command, mobx.args, vendorRoot)
}

async function main() {
  const force = process.argv.includes('--force')
  const marker = readMarker()
  const hasPackage = fs.existsSync(path.join(vendorRoot, 'package.json'))
  const isSubmodule = fs.existsSync(path.join(vendorRoot, '.git'))

  if (marker === VENDOR_SHA && hasPackage && !force) {
    console.log(`• vendor already at ${VENDOR_SHA.slice(0, 7)} (pass --force to re-download)`)
  } else if (isSubmodule && hasPackage && !force) {
    // Checked out by `git submodule update --init`; the gitlink already pins the
    // exact commit, so there is nothing to download.
    console.log('• vendor submodule checked out; using the gitlink SHA')
    fs.writeFileSync(markerPath, `${VENDOR_SHA}\n`)
  } else {
    await download()
    extract()
    fs.rmSync(archivePath, { force: true })
    fs.writeFileSync(markerPath, `${VENDOR_SHA}\n`)
    console.log(`✅ vendored ${VENDOR_SHA}`)
  }

  if (!fs.existsSync(path.join(vendorRoot, 'node_modules', 'mermaid'))) {
    console.log('📦 installing vendor dependencies (this takes a while)…')
    installDependencies()
  } else {
    console.log('• vendor dependencies already installed')
  }

  const patch = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'patch-vendor.mjs')], {
    cwd: pluginRoot,
    stdio: 'inherit',
  })
  if (patch.status !== 0) process.exit(patch.status ?? 1)
}

main().catch((error) => {
  console.error('\n❌ vendor install failed:', error)
  process.exit(1)
})
