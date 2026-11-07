/**
 * Tab registration, driven by the host's `mode` / `priority` settings.
 *
 * dsh resolves file tabs in `sidebar.right` by collecting every registered type
 * whose `canOpen(address)` is true and ranking the claims:
 *
 *   1. priority band — `extension` (3) > `builtin` (2) > `fallback` (1);
 *   2. the length of the pattern that matched;
 *   3. registration order.
 *
 * The official text preview is a `fallback` type, so *any* `builtin` claim wins
 * over it. That is why the default mode is `manual`: the plugin does not claim
 * addresses at all and instead registers a renderer into dsh's own document
 * preview registry, which is the `打开方式` list inside the built-in tab.
 *
 * @module dsh-plugin-documd/client/registration
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import {
  DOCUMENT_BODY_ID,
  NATIVE_KIND,
  NATIVE_TAB_ID,
  OWN_KINDS,
  PLUGIN_ID,
  UNSUPPORTED_KIND,
  UNSUPPORTED_TAB_ID,
  VIEWER_KIND,
  VIEWER_TAB_ID,
  basenameOf,
  classifyPath,
  parseFileAddress,
  patternsForCategory,
  renderableExtensions,
  type PreviewCategory,
  type PriorityBand,
} from '../shared/contract'
import { setDocumentActions } from './document-bridge'
import { LOCALE_NAMESPACE } from './locales'
import { NativeTab } from './native-tab'
import type { PreviewOptions } from './options'
import { DocumdDocumentBody, PreviewTab } from './preview-tab'
import { UnsupportedTab } from './unsupported-tab'

/** Which registrations a mode performs. Pure, so it is unit-tested. */
export interface RegistrationPlan {
  /** Claim markdown/code/diagram addresses at tab level. */
  readonly viewer: boolean
  /** Claim PDF/image addresses at tab level. */
  readonly native: boolean
  /** Claim office/archive addresses with the "install a viewer" card. */
  readonly unsupported: boolean
  /** Offer the viewer inside dsh's own document preview (`打开方式`). */
  readonly documentPreviews: boolean
  /** Band used by the claims above. */
  readonly priority: PriorityBand
}

/**
 * Decide what to register.
 *
 * - `off` registers nothing.
 * - `manual` (default) only offers the viewer through dsh's `打开方式`; the
 *   unsupported card still claims formats that have no real previewer.
 * - `auto` claims markdown/code/diagram and PDF/images at `priority`.
 *
 * @param options - validated host options.
 * @returns the plan.
 */
export function planRegistrations(options: PreviewOptions): RegistrationPlan {
  if (options.mode === 'off') {
    return { viewer: false, native: false, unsupported: false, documentPreviews: false, priority: options.priority }
  }
  if (options.mode === 'auto') {
    return {
      viewer: true,
      native: true,
      unsupported: true,
      documentPreviews: true,
      priority: options.priority,
    }
  }
  // manual: `builtin` beats the official `fallback` text dump for office files
  // while never claiming anything dsh already previews.
  return { viewer: false, native: false, unsupported: true, documentPreviews: true, priority: 'builtin' }
}

/**
 * Band for one category's claim, given the plan's band.
 *
 * The "install a viewer" card must never outrank another extension's real
 * viewer: dsh ranks `extension` above `builtin`, so at `extension` the card
 * would steal formats it cannot render (`.zip`, `.mp3`, …) from editors like
 * dsh-better-sidebar's. Demoting it to `builtin` keeps exactly its original
 * behavior — beat the official text fallback, yield to every extension-band
 * claim — regardless of the configured `priority`.
 *
 * @param plan - the registration plan.
 * @param category - the category whose band is needed.
 * @returns the band the definition should register at.
 */
export function bandForCategory(plan: RegistrationPlan, category: PreviewCategory): PriorityBand {
  if (category !== 'unsupported') return plan.priority
  return plan.priority === 'extension' ? 'builtin' : plan.priority
}

function definitionFor(
  category: PreviewCategory,
  id: string,
  kind: string,
  priority: PriorityBand,
): SidebarRightTabDefinition {
  return {
    id,
    kind,
    // One tab per address: the registry already keys tabs by content id.
    multiple: true,
    patterns: patternsForCategory(category),
    priority,
    title: (address: string) => basenameOf(address),
    canOpen: (address: string) => {
      const parsed = parseFileAddress(address)
      return parsed !== undefined && classifyPath(parsed.path) === category
    },
  }
}

/**
 * Register the planned types and bodies.
 *
 * @param ctx - client root context.
 * @param options - validated host options.
 */
export function registerTabs(ctx: Context, options: PreviewOptions): void {
  const plan = planRegistrations(options)

  const alternatives = (address: string): { kind: string; title: string }[] => ctx.sidebarRightTabs
    .candidates(address)
    .filter((candidate) => !OWN_KINDS.includes(candidate.kind))
    .map((candidate) => ({ kind: candidate.kind, title: candidate.title(address) }))

  const openWithKind = (address: string, kind: string, tabId?: string): void => {
    ctx.sidebarRight.openResource(address, {
      kind,
      ...(tabId ? { replaceTab: tabId as TabId } : {}),
    })
  }

  const injected = {
    // In-tab links land in the right column through the same controller the
    // conversation's file links use.
    openResource: (address: string) => {
      ctx.sidebarRight.openResource(address)
    },
    alternatives,
    openWithKind,
    rememberChoice: options.rememberChoice,
    assetVersion: options.assetVersion,
  }
  setDocumentActions(injected)

  if (plan.viewer || plan.native || plan.unsupported) {
    const definitions: SidebarRightTabDefinition[] = []
    if (plan.viewer) definitions.push(definitionFor('viewer', VIEWER_TAB_ID, VIEWER_KIND, plan.priority))
    if (plan.native) definitions.push(definitionFor('native', NATIVE_TAB_ID, NATIVE_KIND, plan.priority))
    if (plan.unsupported) {
      definitions.push(definitionFor('unsupported', UNSUPPORTED_TAB_ID, UNSUPPORTED_KIND, bandForCategory(plan, 'unsupported')))
    }

    for (const definition of definitions) {
      ctx.effect(
        () => ctx.sidebarRightTabs.register(definition),
        `${PLUGIN_ID}: ${definition.kind} tab type`,
      )
    }
  }

  if (plan.viewer) {
    ctx.effect(
      () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: VIEWER_TAB_ID,
        locale: LOCALE_NAMESPACE,
        inject: () => injected,
      }, PreviewTab)),
      `${PLUGIN_ID}: viewer body`,
    )
  }

  if (plan.native) {
    ctx.effect(
      () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: NATIVE_TAB_ID,
        locale: LOCALE_NAMESPACE,
      }, NativeTab)),
      `${PLUGIN_ID}: native body`,
    )
  }

  if (plan.unsupported) {
    ctx.effect(
      () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: UNSUPPORTED_TAB_ID,
        locale: LOCALE_NAMESPACE,
        inject: () => ({
          // Extension point for dsh-docx / dsh-pptx / dsh-opensheet-sidebar:
          // any other type that claims this address is offered as a button.
          alternatives,
          openWithKind,
        }),
      }, UnsupportedTab)),
      `${PLUGIN_ID}: unsupported body`,
    )
  }

  if (plan.documentPreviews) {
    // `builtin` keeps the product's own renderer first; this viewer shows up as
    // an alternative in the tab's `打开方式` list instead of taking over.
    ctx.effect(
      () => ctx.documentPreviews.register({
        id: DOCUMENT_BODY_ID,
        extensions: renderableExtensions(),
        priority: 'builtin',
        title: () => 'docu.md',
        loading: 'text-pages',
        wrap: false,
      }),
      `${PLUGIN_ID}: document preview`,
    )
    ctx.effect(
      () => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
        name: 'sidebar.right.tab.document',
        key: DOCUMENT_BODY_ID,
        locale: LOCALE_NAMESPACE,
      }, DocumdDocumentBody)),
      `${PLUGIN_ID}: document body`,
    )
  }
}
