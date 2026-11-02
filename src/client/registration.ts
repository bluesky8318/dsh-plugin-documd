/**
 * Two-stage tab registration, following the shape shipped with the product:
 *
 *   1. `ctx.sidebarRightTabs.register(definition)` says *what* a tab type is
 *      (address globs, priority band, chip title);
 *   2. `ctx.slots.register` under `sidebar.right.pane.tab`, keyed by the
 *      definition's `id`, supplies the *body* for every tab of that kind.
 *
 * All three kinds declare `priority: 'extension'`, the highest band, so they
 * beat the official `text` viewer (`fallback`) for the files they claim. Files
 * this plugin does not claim keep the official text preview.
 *
 * @module dsh-plugin-documd/client/registration
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import {
  NATIVE_KIND,
  NATIVE_TAB_ID,
  PLUGIN_ID,
  UNSUPPORTED_KIND,
  UNSUPPORTED_TAB_ID,
  VIEWER_KIND,
  VIEWER_TAB_ID,
  basenameOf,
  classifyPath,
  parseFileAddress,
  patternsForCategory,
  type PreviewCategory,
} from '../shared/contract'
import { LOCALE_NAMESPACE } from './locales'
import { NativeTab } from './native-tab'
import { PreviewTab } from './preview-tab'
import { UnsupportedTab } from './unsupported-tab'

function definitionFor(
  category: PreviewCategory,
  id: string,
  kind: string,
): SidebarRightTabDefinition {
  return {
    id,
    kind,
    // One tab per address: the registry already keys tabs by content id.
    multiple: true,
    patterns: patternsForCategory(category),
    priority: 'extension',
    title: (address: string) => basenameOf(address),
    canOpen: (address: string) => {
      const parsed = parseFileAddress(address)
      return parsed !== undefined && classifyPath(parsed.path) === category
    },
  }
}

/** Kinds this plugin owns, so the unsupported card offers only *other* viewers. */
const OWN_KINDS = new Set([VIEWER_KIND, NATIVE_KIND, UNSUPPORTED_KIND])

/**
 * Register the three types, their bodies, and their small registry bridges.
 * @param ctx - client root context.
 */
export function registerTabs(ctx: Context): void {
  const definitions = [
    definitionFor('viewer', VIEWER_TAB_ID, VIEWER_KIND),
    definitionFor('native', NATIVE_TAB_ID, NATIVE_KIND),
    definitionFor('unsupported', UNSUPPORTED_TAB_ID, UNSUPPORTED_KIND),
  ]

  for (const definition of definitions) {
    ctx.effect(
      () => ctx.sidebarRightTabs.register(definition),
      `${PLUGIN_ID}: ${definition.kind} tab type`,
    )
  }

  ctx.effect(
    () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: VIEWER_TAB_ID,
      locale: LOCALE_NAMESPACE,
      inject: () => ({
        // In-tab links land in the right column through the same controller the
        // conversation's file links use.
        openResource: (address: string) => {
          ctx.sidebarRight.openResource(address)
        },
      }),
    }, PreviewTab)),
    `${PLUGIN_ID}: viewer body`,
  )

  ctx.effect(
    () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: NATIVE_TAB_ID,
      locale: LOCALE_NAMESPACE,
    }, NativeTab)),
    `${PLUGIN_ID}: native body`,
  )

  ctx.effect(
    () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: UNSUPPORTED_TAB_ID,
      locale: LOCALE_NAMESPACE,
      inject: () => ({
        // Extension point for dsh-docx / dsh-pptx / dsh-opensheet-sidebar: any
        // other type that claims this address is offered as a button.
        alternatives: (address: string) => ctx.sidebarRightTabs
          .candidates(address)
          .filter((candidate) => !OWN_KINDS.has(candidate.kind))
          .map((candidate) => ({ kind: candidate.kind, title: candidate.title(address) })),
        openWithKind: (address: string, kind: string) => {
          ctx.sidebarRight.openResource(address, { kind })
        },
      }),
    }, UnsupportedTab)),
    `${PLUGIN_ID}: unsupported body`,
  )
}
