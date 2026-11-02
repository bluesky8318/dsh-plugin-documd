import { describe, expect, it } from 'vitest'
import {
  THEME_DARK,
  THEME_LIGHT,
  basenameOf,
  classifyPath,
  extensionOf,
  formatFileAddress,
  parseFileAddress,
  patternsForCategory,
  resolveThemeId,
} from '../src/shared/contract.ts'

describe('parseFileAddress', () => {
  it('reads a session-scoped address', () => {
    expect(parseFileAddress('dsh-resource://file/session/s1/docs/notes.md')).toEqual({
      scope: 'session',
      sessionId: 's1',
      path: 'docs/notes.md',
    })
  })

  it('reads an absolute address and keeps the drive letter', () => {
    expect(parseFileAddress('dsh-resource://file/absolute/C:/work/a.md')).toEqual({
      scope: 'absolute',
      path: 'C:/work/a.md',
    })
    expect(parseFileAddress('dsh-resource://file/absolute/etc/hosts')).toEqual({
      scope: 'absolute',
      path: '/etc/hosts',
    })
  })

  it('keeps UNC paths UNC', () => {
    expect(parseFileAddress('dsh-resource://file/absolute//server/share/a.md')).toEqual({
      scope: 'absolute',
      path: '//server/share/a.md',
    })
  })

  it('decodes each segment separately', () => {
    expect(parseFileAddress('dsh-resource://file/session/s1/a%20b/c%23d.md')).toEqual({
      scope: 'session',
      sessionId: 's1',
      path: 'a b/c#d.md',
    })
  })

  it('decodes an encoded drive colon and non-ASCII names', () => {
    expect(parseFileAddress('dsh-resource://file/absolute/C%3A/Users/a.md')).toEqual({
      scope: 'absolute',
      path: 'C:/Users/a.md',
    })
    expect(parseFileAddress('dsh-resource://file/session/s1/%E4%B8%AD%E6%96%87%20a.md')).toEqual({
      scope: 'session',
      sessionId: 's1',
      path: '中文 a.md',
    })
  })

  it('ignores a query or hash tail', () => {
    expect(parseFileAddress('dsh-resource://file/session/s1/a.md?line=3')).toMatchObject({
      path: 'a.md',
    })
  })

  it('rejects anything else', () => {
    expect(parseFileAddress('https://example.com/a.md')).toBeUndefined()
    expect(parseFileAddress('dsh-resource://file/session/s1')).toBeUndefined()
    expect(parseFileAddress('dsh-resource://file/absolute/')).toBeUndefined()
    expect(parseFileAddress('dsh-resource://file/session/s1/%E0%A4%A')).toBeUndefined()
  })
})

describe('basenameOf / extensionOf', () => {
  it('returns the decoded last segment', () => {
    expect(basenameOf('dsh-resource://file/session/s1/docs/a%20b.md')).toBe('a b.md')
  })

  it('treats a dotfile as a name, not an extension', () => {
    expect(extensionOf('.gitignore')).toBe('')
    expect(extensionOf('docs/Notes.MD')).toBe('.md')
    expect(extensionOf('src/a.d.ts')).toBe('.ts')
  })
})

describe('classifyPath', () => {
  it('sends Markdown, code and diagrams to the viewer', () => {
    expect(classifyPath('README.md')).toBe('viewer')
    expect(classifyPath('src/app.tsx')).toBe('viewer')
    expect(classifyPath('types.d.ts')).toBe('viewer')
    expect(classifyPath('flow.mmd')).toBe('viewer')
    expect(classifyPath('notes.markdown')).toBe('viewer')
  })

  it('sends PDF and images to the native pane', () => {
    expect(classifyPath('manual.pdf')).toBe('native')
    expect(classifyPath('shot.PNG')).toBe('native')
    expect(classifyPath('logo.svg')).toBe('native')
  })

  it('never claims a file silently', () => {
    expect(classifyPath('report.docx')).toBe('unsupported')
    expect(classifyPath('sheet.xlsx')).toBe('unsupported')
    expect(classifyPath('archive.zip')).toBe('unsupported')
    expect(classifyPath('LICENSE')).toBe('unsupported')
  })
})

describe('patterns and addresses', () => {
  it('claims every extension of a category as a glob', () => {
    expect(patternsForCategory('viewer')).toContain('*.md')
    expect(patternsForCategory('viewer')).toContain('*.ts')
    expect(patternsForCategory('native')).toContain('*.pdf')
    expect(patternsForCategory('unsupported')).toContain('*.docx')
  })

  it('rebuilds an address in the scope it came from', () => {
    const address = 'dsh-resource://file/session/s1/docs/a.md'
    expect(formatFileAddress(address, 'docs/img/b.png')).toBe(
      'dsh-resource://file/session/s1/docs/img/b.png',
    )
    expect(formatFileAddress('dsh-resource://file/absolute/C:/a.md', 'C:/b c/d.md')).toBe(
      'dsh-resource://file/absolute/C:/b%20c/d.md',
    )
    expect(formatFileAddress('not-an-address', 'a.md')).toBeUndefined()
  })
})

describe('resolveThemeId', () => {
  it('maps auto to the light/dark pair', () => {
    expect(resolveThemeId('auto', false)).toBe(THEME_LIGHT)
    expect(resolveThemeId('auto', true)).toBe(THEME_DARK)
  })

  it('passes an explicit theme through', () => {
    expect(resolveThemeId('github', true)).toBe('github')
  })
})
