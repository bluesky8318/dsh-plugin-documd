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
import { PLUGIN_ID } from '../shared/contract'
import { LOCALE_NAMESPACE, en, zh } from './locales'
import { loadPreviewOptions } from './options'
import { registerTabs } from './registration'
import { injectStyles } from './styles'

/** Services that must exist before this half mounts. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'documentPreviews']

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
    void loadPreviewOptions(globalThis.fetch, controller.signal).then((options) => {
      if (!cancelled) registerTabs(ctx, options)
    })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, `${PLUGIN_ID}: tab registration`)
}
