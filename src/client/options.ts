/**
 * Registration options, fetched from the host half once at mount.
 *
 * The host owns the config (`mode`, `priority`, `rememberChoice`) because the
 * browser half cannot read cordis config. Fetching instead of hard-coding keeps
 * a single source of truth; if the route is unreachable the defaults below make
 * the plugin behave like a fresh install.
 *
 * @module dsh-plugin-documd/client/options
 */

import {
  API_PREFIX,
  ASSET_VERSION,
  DEFAULT_PREVIEW_MODE,
  DEFAULT_PRIORITY,
  isPreviewMode,
  isPriorityBand,
  type PreviewMode,
  type PriorityBand,
} from '../shared/contract'

/** Settings the tab registrations depend on. */
export interface PreviewOptions {
  readonly mode: PreviewMode
  readonly priority: PriorityBand
  readonly rememberChoice: boolean
  /**
   * Version segment the viewer iframe is served under. The host serves that
   * subtree with `immutable`, so the bundle is cached across tabs until the
   * plugin version changes.
   */
  readonly assetVersion: string
}

/** What a fresh install does: available in `打开方式`, never claims a tab. */
export const FALLBACK_OPTIONS: PreviewOptions = {
  mode: DEFAULT_PREVIEW_MODE,
  priority: DEFAULT_PRIORITY,
  rememberChoice: true,
  assetVersion: ASSET_VERSION,
}

/**
 * Read `/docu-preview/api/options`.
 * @param fetcher - injectable `fetch` (defaults to the global one).
 * @param signal - aborts the request when the plugin unloads.
 * @returns validated options, or {@link FALLBACK_OPTIONS} on any failure.
 */
export async function loadPreviewOptions(
  fetcher: typeof fetch | undefined = globalThis.fetch,
  signal?: AbortSignal,
): Promise<PreviewOptions> {
  if (!fetcher) return FALLBACK_OPTIONS
  try {
    const response = await fetcher(`${API_PREFIX}/options`, {
      ...(signal ? { signal } : {}),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return FALLBACK_OPTIONS
    const body = (await response.json()) as Record<string, unknown>
    return {
      mode: isPreviewMode(body.mode) ? body.mode : FALLBACK_OPTIONS.mode,
      priority: isPriorityBand(body.priority) ? body.priority : FALLBACK_OPTIONS.priority,
      rememberChoice: typeof body.rememberChoice === 'boolean'
        ? body.rememberChoice
        : FALLBACK_OPTIONS.rememberChoice,
      assetVersion: typeof body.assetVersion === 'string' && /^\d+\.\d+\.\d+/.test(body.assetVersion)
        ? body.assetVersion
        : FALLBACK_OPTIONS.assetVersion,
    }
  } catch {
    return FALLBACK_OPTIONS
  }
}
