#!/usr/bin/env node

/**
 * Packaging guard for the "install with zero build" contract.
 *
 * pnpm 11 refuses git-hosted dependencies that need to run build scripts unless
 * the profile allow-lists them (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`). codeload
 * tarballs also skip submodules. So the published tree must already contain
 * everything the plugin needs at runtime, and the manifest must not declare any
 * install-time lifecycle script. This script fails the build when that drifts.
 *
 * Run it before committing a release: `npm run check:packaging`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'))

/** Lifecycle scripts pnpm/npm would run while installing a git dependency. */
const FORBIDDEN_SCRIPTS = ['prepare', 'preinstall', 'install', 'postinstall', 'prepublish', 'prepack']

/** Runtime artifacts that must ship inside the tarball. */
const REQUIRED = [
  'lib/index.js',
  'lib/index.d.ts',
  'lib/client.js',
  'assets/viewer/index.html',
  'assets/viewer/viewer.js',
  'assets/viewer/styles.css',
  'cordis.patch.yml',
  'icon.svg',
]

const problems = []

for (const name of FORBIDDEN_SCRIPTS) {
  const value = manifest.scripts?.[name]
  if (value) problems.push(`package.json still declares the install-time script "${name}": ${value}`)
}

for (const relative of REQUIRED) {
  if (!fs.existsSync(path.join(pluginRoot, relative))) problems.push(`missing committed artifact ${relative}`)
}

const exportsMap = manifest.exports ?? {}
for (const [key, target] of [['.', manifest.main], ['./client', exportsMap['./client']]]) {
  const file = typeof target === 'string' ? target : target?.default
  if (!file) problems.push(`missing "${key}" entry point in package.json`)
  else if (!fs.existsSync(path.join(pluginRoot, file))) problems.push(`"${key}" points at missing ${file}`)
}

if (!manifest.dsh?.bundle?.patch || !manifest.dsh?.client?.platform) {
  problems.push('manifest is missing dsh.bundle.patch / dsh.client.platform')
}

if (problems.length > 0) {
  console.error('✗ packaging is not install-ready:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nRun `npm run build:release` and commit lib/ + assets/viewer/ before tagging.')
  process.exit(1)
}

console.log('✅ packaging is install-ready: no install-time scripts, lib/ and assets/viewer/ present')
