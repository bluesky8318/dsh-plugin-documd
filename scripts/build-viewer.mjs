#!/usr/bin/env node

/**
 * Build the offline docu.md viewer into `assets/viewer/`.
 *
 * `node scripts/build-viewer.mjs`         — run `viewer/build.js`
 * `node scripts/build-viewer.mjs --check` — verify the committed artifacts only
 *
 * The build reads the engine from `vendor/markdown-viewer/` (which needs
 * `npm install` there — see `scripts/vendor-install.mjs`) and writes everything
 * the host half serves under `/docu-preview/viewer/`.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outdir = path.join(pluginRoot, 'assets', 'viewer')
const vendorRoot = path.join(pluginRoot, 'vendor', 'markdown-viewer')

/** Files (and one directory) a usable viewer build must contain. */
const REQUIRED = [
  'index.html',
  'viewer.js',
  'styles.css',
  'iframe-render.html',
  'toc-panel.css',
  'themes/registry.json',
  'themes/bundles/vscode.json',
  'themes/bundles/vscode-dark.json',
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json',
]

const REQUIRED_DIRECTORIES = ['stencils']

function check() {
  let failures = 0
  const problems = []

  for (const relative of REQUIRED) {
    const target = path.join(outdir, relative)
    let size = 0
    try {
      size = fs.statSync(target).size
    } catch {
      problems.push(`missing ${relative}`)
      failures += 1
      continue
    }
    if (size === 0) {
      problems.push(`empty ${relative}`)
      failures += 1
    }
  }

  for (const relative of REQUIRED_DIRECTORIES) {
    const target = path.join(outdir, relative)
    try {
      if (!fs.statSync(target).isDirectory()) throw new Error('not a directory')
    } catch {
      problems.push(`missing directory ${relative}`)
      failures += 1
    }
  }

  if (failures > 0) {
    console.error('✗ viewer build is incomplete:')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('\nRun `npm run build:viewer` (after `npm run vendor:install`).')
    process.exit(1)
  }

  console.log(`✅ viewer build complete → ${outdir}`)
}

if (process.argv.includes('--check')) {
  if (!fs.existsSync(outdir)) {
    console.error(`✗ ${outdir} does not exist. Run \`npm run build:viewer\` first.`)
    process.exit(1)
  }
  check()
} else {
  // Only rebuilds need the upstream engine. Installing the plugin never does:
  // `assets/viewer/` is committed and served as-is.
  if (!fs.existsSync(path.join(vendorRoot, 'src'))) {
    console.error(
      `✗ ${vendorRoot} is empty.\n`
        + '  The engine is a git submodule and codeload tarballs do not include it.\n'
        + '  Checkout this repo as a developer and run:\n'
        + '    git submodule update --init && npm run vendor:install\n'
        + '  Installing the plugin itself does NOT need this step — the committed\n'
        + '  `assets/viewer/` is used as-is.',
    )
    process.exit(1)
  }
  if (!fs.existsSync(path.join(vendorRoot, 'node_modules', 'mermaid'))) {
    console.error(
      `✗ ${path.join(vendorRoot, 'node_modules')} is not installed.\n`
        + 'Run `npm run vendor:install` first (it installs the pinned engine dependencies).',
    )
    process.exit(1)
  }

  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'viewer', 'build.js')], {
    cwd: pluginRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)

  check()
}
