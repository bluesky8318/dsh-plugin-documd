import { describe, expect, it } from 'vitest'
import {
  NATIVE_KIND,
  UNSUPPORTED_KIND,
  VIEWER_KIND,
  isPreviewMode,
  isPriorityBand,
  renderableExtensions,
} from '../src/shared/contract.ts'
import { FALLBACK_OPTIONS, loadPreviewOptions } from '../src/client/options.ts'
import {
  CHOICE_STORAGE_KEY,
  clearChoice,
  preferenceKeyFor,
  readChoice,
  shouldReopenWith,
  writeChoice,
  type ChoiceStorage,
} from '../src/client/preferences.ts'
import { planRegistrations } from '../src/client/registration.ts'

function memoryStorage(): ChoiceStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe('planRegistrations', () => {
  it('registers nothing when off', () => {
    expect(planRegistrations({ ...FALLBACK_OPTIONS, mode: 'off' })).toEqual({
      viewer: false,
      native: false,
      unsupported: false,
      documentPreviews: false,
      priority: 'builtin',
    })
  })

  it('never claims a tab in manual mode', () => {
    const plan = planRegistrations({ ...FALLBACK_OPTIONS, mode: 'manual', priority: 'extension' })
    expect(plan.viewer).toBe(false)
    expect(plan.native).toBe(false)
    // The office/archive card still beats the official text dump.
    expect(plan.unsupported).toBe(true)
    expect(plan.documentPreviews).toBe(true)
    expect(plan.priority).toBe('builtin')
  })

  it('claims renderable types in auto mode with the configured band', () => {
    const plan = planRegistrations({ ...FALLBACK_OPTIONS, mode: 'auto', priority: 'fallback' })
    expect(plan.viewer).toBe(true)
    expect(plan.native).toBe(true)
    expect(plan.unsupported).toBe(true)
    expect(plan.priority).toBe('fallback')
  })
})

describe('loadPreviewOptions', () => {
  it('reads the host answer', async () => {
    const fetcher = async () => new Response(JSON.stringify({
      mode: 'auto',
      priority: 'extension',
      rememberChoice: false,
    }), { status: 200 })
    expect(await loadPreviewOptions(fetcher as typeof fetch)).toEqual({
      mode: 'auto',
      priority: 'extension',
      rememberChoice: false,
    })
  })

  it('falls back to "available, never claims" on garbage', async () => {
    const fetcher = async () => new Response(JSON.stringify({ mode: 'nope', priority: 7 }), { status: 200 })
    expect(await loadPreviewOptions(fetcher as typeof fetch)).toEqual(FALLBACK_OPTIONS)
  })

  it('falls back when the request fails', async () => {
    const fetcher = async () => {
      throw new Error('offline')
    }
    expect(await loadPreviewOptions(fetcher as typeof fetch)).toEqual(FALLBACK_OPTIONS)
  })

  it('falls back when fetch is unavailable', async () => {
    expect(await loadPreviewOptions(undefined)).toEqual(FALLBACK_OPTIONS)
  })
})

describe('preview-method preferences', () => {
  it('keys choices by extension', () => {
    expect(preferenceKeyFor('docs/README.MD')).toBe('.md')
    expect(preferenceKeyFor('LICENSE')).toBe('*')
  })

  it('remembers per extension and forgets independently', () => {
    const storage = memoryStorage()
    writeChoice('docs/a.md', 'text', storage)
    writeChoice('docs/b.MD', 'text', storage)
    writeChoice('src/a.ts', 'text', storage)

    expect(readChoice('docs/c.md', storage)).toBe('text')
    expect(readChoice('src/b.ts', storage)).toBe('text')
    expect(readChoice('assets/a.pdf', storage)).toBeUndefined()

    clearChoice('docs/a.md', storage)
    expect(readChoice('docs/a.md', storage)).toBeUndefined()
    expect(readChoice('src/a.ts', storage)).toBe('text')
    expect(storage.getItem(CHOICE_STORAGE_KEY)).toContain('.ts')
  })

  it('survives a corrupted store', () => {
    const storage = memoryStorage()
    storage.setItem(CHOICE_STORAGE_KEY, 'not json')
    expect(readChoice('a.md', storage)).toBeUndefined()
    expect(() => writeChoice('a.md', 'text', storage)).not.toThrow()
    expect(readChoice('a.md', storage)).toBe('text')
  })

  it('never reopens with one of this plugin’s own kinds', () => {
    expect(shouldReopenWith(VIEWER_KIND)).toBe(false)
    expect(shouldReopenWith(NATIVE_KIND)).toBe(false)
    expect(shouldReopenWith(UNSUPPORTED_KIND)).toBe(false)
    expect(shouldReopenWith('text')).toBe(true)
    expect(shouldReopenWith(undefined)).toBe(false)
    expect(shouldReopenWith('')).toBe(false)
  })
})

describe('mode and band guards', () => {
  it('accepts only known values', () => {
    expect(isPreviewMode('manual')).toBe(true)
    expect(isPreviewMode('always')).toBe(false)
    expect(isPriorityBand('extension')).toBe(true)
    expect(isPriorityBand(3)).toBe(false)
  })

  it('lists dot-less extensions for the document registry', () => {
    expect(renderableExtensions()).toContain('md')
    expect(renderableExtensions()).toContain('tsx')
    expect(renderableExtensions()).toContain('mmd')
    expect(renderableExtensions()).not.toContain('.md')
  })
})
