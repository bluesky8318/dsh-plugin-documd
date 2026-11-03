/**
 * Browser-half entry: register dictionaries and styles, then the tab types and
 * their bodies.
 *
 * Dependency discipline: no host (`node:`) module is imported here, harness
 * client packages appear as `import type` only, and `react` / `react/jsx-runtime`
 * are the only runtime externals (the browser module table provides them).
 *
 * @module dsh-plugin-documd/client
 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
// `ctx.slots` is declared by the renderer package; without this import the
// slot registry is not part of the `Context` declaration merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Declares `ctx.documentPreviews` (the `打开方式` registry) on `Context`.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { PLUGIN_ID, VIEWER_PREFIX } from '../shared/contract'
import { LOCALE_NAMESPACE, en, zh } from './locales'
import { loadPreviewOptions } from './options'
import { registerTabs } from './registration'
import { injectStyles } from './styles'

/** Services that must exist before this half mounts. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'documentPreviews']

/**
 * Warm the HTTP cache for the viewer bundle.
 *
 * The iframe loads `viewer.js` (~3.7 MB) on every fresh tab open; that subtree
 * is served `immutable`, so a preload here means later opens read it from the
 * browser cache instead of the plugin's HTTP route. Only assets are preloaded —
 * the iframe itself is not created until a document actually opens.
 *
 * @param assetVersion - version segment from `/api/options`.
 * @returns disposer that removes the preload hints.
 */
function preloadViewer(assetVersion: string): () => void {
  const hints: HTMLLinkElement[] = []
  const assets: ReadonlyArray<readonly [string, string]> = [
    [`${VIEWER_PREFIX}/${assetVersion}/viewer.js`, 'script'],
    [`${VIEWER_PREFIX}/${assetVersion}/styles.css`, 'style'],
  ]
  for (const [href, as] of assets) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = as
    link.href = href
    link.dataset.plugin = PLUGIN_ID
    document.head.appendChild(link)
    hints.push(link)
  }
  return () => {
    for (const link of hints) link.remove()
  }
}

/**
 * Mount the browser half.
 *
 * Registration depends on the host's `mode` / `priority`, which only the host
 * half can read, so the tabs are registered after `/api/options` answers.
 * Failure falls back to the default (no claims), never to a takeover.
 *
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    `${PLUGIN_ID}: dictionaries`,
  )
  ctx.effect(() => injectStyles())

  ctx.effect(() => {
    const controller = new AbortController()
    let cancelled = false
    let disposePreload: (() => void) | undefined
    void loadPreviewOptions(globalThis.fetch, controller.signal).then((options) => {
      if (cancelled) return
      registerTabs(ctx, options)
      disposePreload = preloadViewer(options.assetVersion)
    })
    return () => {
      cancelled = true
      controller.abort()
      disposePreload?.()
    }
  }, `${PLUGIN_ID}: tab registration`)
}
