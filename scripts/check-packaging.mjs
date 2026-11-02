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

/**
 * 运行时依赖守卫：产物里除了 `node:` 内置和宿主提供的 peer，不能再有裸引用。
 *
 * 本地 clone / overlay 加载时没有 node_modules，任何普通 dependency 都会在
 * `import lib/index.js` 阶段炸掉（ERR_MODULE_NOT_FOUND）；所以要内联进 bundle，
 * 而不是留在 package.json 的 dependencies 里。
 *
 * - `lib/index.js`（宿主半边，Node 解析）：允许 `node:` + peerDependencies。
 * - `lib/client.js`（浏览器半边）：只允许浏览器模块表里的 react 两个入口。
 */
const CLIENT_ALLOWED = new Set(['react', 'react/jsx-runtime'])

function bareSpecifiers(source) {
  const specs = new Set()
  const patterns = [
    /from\s*["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.add(match[1])
  }
  return [...specs].filter((spec) => !spec.startsWith('.') && !spec.startsWith('/'))
}

function checkExternals(file, allowed) {
  const source = fs.readFileSync(path.join(pluginRoot, file), 'utf8')
  for (const spec of bareSpecifiers(source)) {
    if (spec.startsWith('node:')) continue
    if (allowed.has(spec)) continue
    problems.push(
      `${file} imports "${spec}", which is neither a node builtin nor host-provided; ` +
        'inline it in tsdown.config.ts (noExternal) instead of shipping it as a dependency',
    )
  }
}

checkExternals('lib/index.js', new Set(Object.keys(manifest.peerDependencies ?? {})))
checkExternals('lib/client.js', CLIENT_ALLOWED)

if (problems.length > 0) {
  console.error('✗ packaging is not install-ready:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nRun `npm run build:release` and commit lib/ + assets/viewer/ before tagging.')
  process.exit(1)
}

console.log('✅ packaging is install-ready: no install-time scripts, lib/ and assets/viewer/ present')
