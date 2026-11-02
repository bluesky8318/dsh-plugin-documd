/**
 * Shape shared by the host half and the browser half: route names, tab
 * identities, file-address parsing, and the extension classification that
 * decides which viewer a tab gets.
 *
 * This module must stay dependency-free (no `node:` imports) because the client
 * bundle includes it verbatim.
 *
 * @module dsh-plugin-documd/shared/contract
 */

/** Plugin id: package name, cordis row id, and locale namespace. */
export const PLUGIN_ID = 'dsh-plugin-documd'

/** Route prefix registered on `ctx.webServer` by the host half. */
export const ROUTE_PREFIX = '/docu-preview'

/** Static viewer root: `GET /docu-preview/viewer/index.html`. */
export const VIEWER_PREFIX = `${ROUTE_PREFIX}/viewer`

/** JSON/binary API root. */
export const API_PREFIX = `${ROUTE_PREFIX}/api`

/** Tab body id for the docu.md renderer (also the slot key). */
export const VIEWER_TAB_ID = `${PLUGIN_ID}:viewer`
/** Tab kind claimed for Markdown, code and diagram files. */
export const VIEWER_KIND = 'documd'
/** Tab body id for native PDF / image embedding. */
export const NATIVE_TAB_ID = `${PLUGIN_ID}:native`
/** Tab kind claimed for PDF and image files. */
export const NATIVE_KIND = 'documd-native'
/** Tab body id for the "no previewer yet" card. */
export const UNSUPPORTED_TAB_ID = `${PLUGIN_ID}:unsupported`
/** Tab kind claimed for office/archive files this plugin cannot render. */
export const UNSUPPORTED_KIND = 'documd-unsupported'

/** Markdown files the docu.md engine renders as documents. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const

/**
 * Source files rendered through the viewer's code surface. Mirrors
 * `EXT_LANG_MAP` in the vendored engine (`src/utils/extension-categories.ts`);
 * keep the two lists in sync when upgrading the vendor tree.
 */
export const CODE_EXTENSIONS = [
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.mts', '.cts', '.tsx', '.d.ts',
  '.vue', '.svelte',
  '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift', '.dart',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx',
  '.cs', '.php', '.lua', '.r',
  '.scala', '.zig', '.pl', '.perl',
  '.erl', '.hrl', '.escript',
  '.html', '.htm',
  '.css', '.scss', '.sass', '.less',
  '.json', '.jsonc', '.json5',
  '.yaml', '.yml', '.toml',
  '.ini', '.env', '.properties',
  '.xml', '.xsl', '.xslt',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.mdx',
  '.txt', '.log',
  '.tex', '.bib',
  '.csv', '.tsv',
  '.sql',
] as const

/** Diagram files the viewer wraps into the matching render type. */
export const DIAGRAM_EXTENSIONS = [
  '.mermaid', '.mmd',
  '.plantuml', '.puml',
  '.vega', '.vl', '.vega-lite',
  '.gv', '.dot',
  '.infographic',
  '.canvas',
  '.drawio',
  '.echarts',
] as const

/** PDF and raster/vector images shown with the browser's own renderer. */
export const NATIVE_EXTENSIONS = [
  '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico',
  '.svg',
] as const

/**
 * Files that need a dedicated viewer. They are claimed so the tab shows an
 * explicit "install dsh-docx / dsh-pptx / dsh-opensheet-sidebar" card instead of
 * falling through to a text dump.
 */
export const UNSUPPORTED_EXTENSIONS = [
  '.docx', '.doc', '.odt', '.rtf',
  '.xlsx', '.xls', '.xlsm', '.ods', '.csv.gz',
  '.pptx', '.ppt', '.odp',
  '.epub', '.zip', '.gz', '.tar', '.7z',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.jar',
  '.mp3', '.wav', '.mp4', '.mov', '.avi', '.mkv',
  '.ttf', '.otf', '.woff', '.woff2',
] as const

/** Which tab kind a path belongs to. */
export type PreviewCategory = 'viewer' | 'native' | 'unsupported'

/** One parsed `dsh-resource://file/…` address. */
export type FileAddress =
  | { readonly scope: 'session'; readonly sessionId: string; readonly path: string }
  | { readonly scope: 'absolute'; readonly path: string }

const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

function isDriveSegment(segment: string | undefined): boolean {
  return segment !== undefined && /^[A-Za-z]:$/.test(segment)
}

/**
 * Read a file address back into its parts without resolving `.` or `..`.
 * Mirrors the official `parseFileAddress` so both plugins agree on identity.
 * @param address - a candidate address.
 * @returns the parts, or `undefined` when the string is not a file address.
 */
export function parseFileAddress(address: string): FileAddress | undefined {
  try {
    if (!address.startsWith(FILE_ADDRESS_PREFIX)) return undefined
    const queryOrHash = address.slice(FILE_ADDRESS_PREFIX.length).search(/[?#]/)
    const body = address.slice(
      FILE_ADDRESS_PREFIX.length,
      queryOrHash === -1 ? undefined : FILE_ADDRESS_PREFIX.length + queryOrHash,
    )
    const [scope, ...rest] = body.split('/')
    if (scope === 'session') {
      const [id, ...segments] = rest
      if (!id || segments.length === 0) return undefined
      return {
        scope,
        sessionId: decodeURIComponent(id),
        path: segments.map(decodeURIComponent).join('/'),
      }
    }
    if (scope === 'absolute') {
      const unc = rest[0] === '' && rest.length > 1
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent)
      if (segments.length === 0 || segments[0] === '') return undefined
      const joined = segments.join('/')
      if (unc) return { scope, path: `//${joined}` }
      return { scope, path: isDriveSegment(segments[0]) ? joined : `/${joined}` }
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * The last path segment of a file address, decoded.
 * @param address - a file address.
 * @returns the basename, or the address itself when it has no path.
 */
export function basenameOf(address: string): string {
  const parsed = parseFileAddress(address)
  if (!parsed) return address
  const segments = parsed.path.split('/').filter(Boolean)
  return segments[segments.length - 1] || address
}

/**
 * Lower-cased extension of a path, including the leading dot.
 * @param path - file path or address path.
 * @returns `.md`, or `''` when the name has no extension.
 */
export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  // A leading dot (`.gitignore`) is a name, not an extension.
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

function matches(path: string, extensions: readonly string[]): boolean {
  // Compound extensions (`.d.ts`, `.slides.md`) must win over their suffix.
  const ordered = [...extensions].sort((a, b) => b.length - a.length)
  const lower = path.toLowerCase()
  return ordered.some((ext) => lower.endsWith(ext))
}

/**
 * Decide which tab kind a path belongs to.
 * @param path - workspace-relative or absolute path.
 * @returns the category, defaulting to `unsupported` so nothing fails silently.
 */
export function classifyPath(path: string): PreviewCategory {
  if (
    matches(path, MARKDOWN_EXTENSIONS) ||
    matches(path, CODE_EXTENSIONS) ||
    matches(path, DIAGRAM_EXTENSIONS)
  ) {
    return 'viewer'
  }
  if (matches(path, NATIVE_EXTENSIONS)) return 'native'
  return 'unsupported'
}

/** Glob patterns (path form) a given kind claims in the tab registry. */
export function patternsForCategory(category: PreviewCategory): readonly string[] {
  const source = category === 'viewer'
    ? [...MARKDOWN_EXTENSIONS, ...CODE_EXTENSIONS, ...DIAGRAM_EXTENSIONS]
    : category === 'native'
      ? [...NATIVE_EXTENSIONS]
      : [...UNSUPPORTED_EXTENSIONS]
  // A pattern without `:` is matched against the address's path at any depth,
  // so `*.md` covers `…/docs/notes.md` as well.
  return source.map((extension) => `*${extension}`)
}

/**
 * Rebuild a file address for another path in the same scope as `address`.
 *
 * The viewer resolves relative links to a workspace path (`src/../img/a.png`
 * normalized); the host turns that back into the address the tab registry and
 * the official text viewer understand.
 * @param address - the address of the tab doing the navigation.
 * @param path - a workspace-relative (session scope) or absolute path.
 * @returns an address, or `undefined` when `address` is not a file address.
 */
export function formatFileAddress(address: string, path: string): string | undefined {
  const parsed = parseFileAddress(address)
  if (!parsed) return undefined
  const segments = path.replace(/\\/g, '/').split('/').filter((segment) => segment !== '')
  // A drive letter keeps its colon: `C:` is part of the path grammar the
  // official parser reads back, and `%3A` would not match it.
  const encoded = segments
    .map((segment) => (/^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/')
  if (parsed.scope === 'session') {
    return `${FILE_ADDRESS_PREFIX}session/${encodeURIComponent(parsed.sessionId)}/${encoded}`
  }
  return `${FILE_ADDRESS_PREFIX}absolute/${encoded}`
}

/** Theme ids from the vendored `src/themes/registry.json` used for dsh light/dark. */
export const THEME_LIGHT = 'vscode'
export const THEME_DARK = 'vscode-dark'

/**
 * Resolve the viewer theme id from the plugin setting and the host's appearance.
 * @param preference - `auto`, or an explicit theme id.
 * @param dark - whether dsh is currently rendering its dark palette.
 * @returns a theme id understood by the vendored theme registry.
 */
export function resolveThemeId(preference: string, dark: boolean): string {
  if (preference && preference !== 'auto') return preference
  return dark ? THEME_DARK : THEME_LIGHT
}

/** Response of `POST /docu-preview/api/session`. */
export interface SessionResponse {
  readonly token: string
  readonly path: string
  readonly filename: string
  readonly size: number
  readonly category: PreviewCategory
  readonly themeId: string
  readonly expiresAt: number
}

/** Response of `GET /docu-preview/api/file`. */
export interface FileResponse {
  readonly content: string
  readonly encoding: 'utf8' | 'base64'
  readonly path: string
  readonly filename: string
  readonly size: number
  readonly mtimeMs: number
  readonly truncated: boolean
}

/** Error body used by every API route. */
export interface ApiErrorBody {
  readonly error: string
  readonly message: string
}
