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
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { PLUGIN_ID } from '../shared/contract'
import { LOCALE_NAMESPACE, en, zh } from './locales'
import { registerTabs } from './registration'
import { injectStyles } from './styles'

/** Services that must exist before this half mounts. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']

/**
 * Mount the browser half.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    `${PLUGIN_ID}: dictionaries`,
  )
  ctx.effect(() => injectStyles())
  registerTabs(ctx)
}
