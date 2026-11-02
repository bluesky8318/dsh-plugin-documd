#!/usr/bin/env node

/**
 * Idempotent patch of the vendored docu.md engine.
 *
 * The engine's platform union and its runtime allow-list do not know about dsh,
 * so two upstream files are widened. Both edits are anchored on the exact
 * upstream text: re-running this script on an already patched tree changes
 * nothing, and an unrecognised tree (a new upstream layout) fails loudly instead
 * of silently building an engine whose `'dsh'` platform is rejected.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendorRoot = path.join(pluginRoot, 'vendor', 'markdown-viewer')

const PATCHES = [
  {
    file: path.join(vendorRoot, 'src', 'types', 'platform.ts'),
    name: 'PlatformType',
    from: "export type PlatformType = 'chrome' | 'firefox' | 'mobile' | 'vscode' | 'obsidian';",
    to: "export type PlatformType = 'chrome' | 'firefox' | 'mobile' | 'vscode' | 'obsidian' | 'dsh';",
  },
  {
    file: path.join(vendorRoot, 'src', 'utils', 'platform-info.ts'),
    name: 'PLATFORM_SET',
    from: "const PLATFORM_SET = new Set<PlatformType>(['chrome', 'firefox', 'mobile', 'vscode', 'obsidian']);",
    to: "const PLATFORM_SET = new Set<PlatformType>(['chrome', 'firefox', 'mobile', 'vscode', 'obsidian', 'dsh']);",
  },
]

let failures = 0

for (const patch of PATCHES) {
  if (!fs.existsSync(patch.file)) {
    console.error(`✗ ${patch.name}: ${patch.file} is missing (vendor tree not installed?)`)
    failures += 1
    continue
  }
  const source = fs.readFileSync(patch.file, 'utf8')
  if (source.includes(patch.to)) {
    console.log(`• ${patch.name}: already patched`)
    continue
  }
  if (!source.includes(patch.from)) {
    console.error(`✗ ${patch.name}: upstream text not found, refusing to guess`)
    failures += 1
    continue
  }
  fs.writeFileSync(patch.file, source.replace(patch.from, patch.to))
  console.log(`✓ ${patch.name}: patched`)
}

if (failures > 0) {
  console.error(`\n${failures} patch(es) failed. Check whether the vendored SHA still matches the one pinned in scripts/vendor-install.mjs.`)
  process.exit(1)
}

console.log('\n✅ vendor patches applied')
