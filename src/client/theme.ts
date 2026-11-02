/**
 * Detect whether dsh is drawing its dark palette.
 *
 * There is no theme service in the published client modules, so three
 * defensive signals are consulted in order: an explicit `data-theme` /
 * `data-color-scheme` / `class` marker on `<html>` or `<body>`, the computed
 * page background, and finally the OS-level `prefers-color-scheme` query.
 * The first signal that is unambiguous wins; a transparent background is
 * ignored rather than mistaken for black.
 *
 * @module dsh-plugin-documd/client/theme
 */

const DARK_QUERY = '(prefers-color-scheme: dark)'

function markerSignals(): string {
  const root = document.documentElement
  const body = document.body
  return [
    root.getAttribute('data-theme'),
    root.getAttribute('data-color-scheme'),
    root.getAttribute('data-appearance'),
    root.className,
    body?.getAttribute('data-theme'),
    body?.getAttribute('data-color-scheme'),
    body?.className,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

function parseRgb(value: string): readonly [number, number, number] | undefined {
  const match = /^rgba?\(([^)]+)\)/.exec(value.trim())
  if (!match) return undefined
  const parts = (match[1] ?? '').split(',').map((part) => Number(part.trim()))
  const [r, g, b, alpha] = parts
  if (r === undefined || g === undefined || b === undefined) return undefined
  if (alpha !== undefined && Number.isFinite(alpha) && alpha === 0) return undefined
  if (![r, g, b].every((channel) => Number.isFinite(channel))) return undefined
  return [r, g, b]
}

/**
 * Whether the host surface currently reads as dark.
 * @returns `true` for the dark palette, `false` for light.
 */
export function detectDarkAppearance(): boolean {
  const signals = markerSignals()
  if (/(^|[\s_-])(dark|night)($|[\s_-])/.test(signals)) return true
  if (/(^|[\s_-])(light|day)($|[\s_-])/.test(signals)) return false

  try {
    const background = getComputedStyle(document.body ?? document.documentElement).backgroundColor
    const rgb = parseRgb(background)
    if (rgb) {
      const [r, g, b] = rgb
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      return luminance < 0.45
    }
  } catch {
    // A detached document (tests) has no computed style; fall through.
  }

  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

/**
 * Watch the host's appearance.
 * @param listener - called only when the dark/light verdict flips.
 * @returns a disposer that stops watching.
 */
export function subscribeAppearance(listener: (dark: boolean) => void): () => void {
  let last = detectDarkAppearance()
  const fire = (): void => {
    const next = detectDarkAppearance()
    if (next === last) return
    last = next
    listener(next)
  }

  let media: MediaQueryList | undefined
  try {
    media = window.matchMedia(DARK_QUERY)
    if (typeof media.addEventListener === 'function') media.addEventListener('change', fire)
    else if (typeof media.addListener === 'function') media.addListener(fire)
  } catch {
    media = undefined
  }

  let observer: MutationObserver | undefined
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(fire)
    const attributes = ['class', 'style', 'data-theme', 'data-color-scheme', 'data-appearance']
    observer.observe(document.documentElement, { attributes: true, attributeFilter: attributes })
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: attributes })
  }

  return () => {
    if (media) {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', fire)
      else if (typeof media.removeListener === 'function') media.removeListener(fire)
    }
    observer?.disconnect()
  }
}
