/**
 * A tiny bridge between the document-slot body and the tab controller.
 *
 * The document slot (`sidebar.right.tab.document`) declares no extra injection
 * points, so a body registered there cannot ask for `ctx.sidebarRight`. The
 * registration stores the same helpers the pane-tab body receives, and the
 * document body reads them. Type-only import: no runtime cycle.
 *
 * @module dsh-plugin-documd/client/document-bridge
 */

import type { PreviewTabInjected } from './preview-tab'

let current: PreviewTabInjected | undefined

/**
 * Publish the sidebar helpers for document-slot bodies.
 * @param actions - helpers bound to the client context.
 */
export function setDocumentActions(actions: PreviewTabInjected): void {
  current = actions
}

/**
 * Read the helpers published by the registration.
 * @returns the helpers, or `undefined` before registration.
 */
export function getDocumentActions(): PreviewTabInjected | undefined {
  return current
}
