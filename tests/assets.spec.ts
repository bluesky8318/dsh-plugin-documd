import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ASSET_VERSION } from '../src/shared/contract.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8')
}

describe('viewer asset version', () => {
  it('matches package.json so a release invalidates the immutable subtree', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string }
    expect(ASSET_VERSION).toBe(pkg.version)
  })
})

describe('viewer document scroll chain', () => {
  const html = read('assets/viewer/index.html')

  it('wraps the viewer root in #markdown-wrapper', () => {
    // `integration/element.ts` resolves its scroll container with
    // `target.closest('#markdown-wrapper')`; without the wrapper it falls back
    // to #markdown-content, which has no height/overflow, and body's
    // `overflow: hidden` clips the tail of long documents (no scrollbar).
    expect(html).toContain('id="markdown-wrapper"')
    const wrapper = html.indexOf('id="markdown-wrapper"')
    const root = html.indexOf('id="docu-preview-root"')
    expect(root).toBeGreaterThan(wrapper)
  })

  it('gives the wrapper a definite height and its own scroll area', () => {
    expect(html).toMatch(/#markdown-wrapper\s*\{[^}]*height:\s*100%/)
    expect(html).toMatch(/#markdown-wrapper\s*\{[^}]*overflow-y:\s*auto/)
    expect(html).toMatch(/#markdown-wrapper\s*\{[^}]*margin:\s*0\s*!important/)
  })

  it('keeps the style-gate placeholder the first paint waits for', () => {
    // `element.ts` polls for #mv-content-styles for up to 1500 ms before its
    // first reveal; this host links styles.css instead of injecting that tag.
    expect(html).toContain('<style id="mv-content-styles"></style>')
  })
})

describe('tab pane scroll chain', () => {
  const css = read('src/client/styles.ts')

  it('lets the iframe fill a shrinking flex column', () => {
    expect(css).toMatch(/\.dm-pane\s*\{[^}]*flex-direction:\s*column/s)
    expect(css).toMatch(/\.dm-pane\s*\{[^}]*min-height:\s*0/s)
    // The pane must not become a second scroll container around the frame.
    expect(css).toMatch(/\.dm-pane\s*\{[^}]*overflow:\s*hidden/s)
    expect(css).toMatch(/\.dm-frame\s*\{[^}]*flex:\s*1 1 auto/s)
    expect(css).toMatch(/\.dm-frame\s*\{[^}]*min-height:\s*0/s)
    expect(css).toMatch(/\.dm-frame\s*\{[^}]*height:\s*100%/s)
  })
})
