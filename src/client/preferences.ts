/**
 * Remembered "preview method" choice.
 *
 * dsh's tab registry cannot change a type's rank at runtime, so the plugin
 * implements the switch the way the product does: the tab body asks the
 * sidebar controller to reopen the same address with the chosen `kind`
 * (`replaceTab`). A small `localStorage` map keeps that choice per file
 * extension, so reopening a `.md` file does not snap back to the old viewer.
 *
 * @module dsh-plugin-documd/client/preferences
 */

import { extensionOf, OWN_KINDS } from '../shared/contract'

/** One JSON map for all extensions; entries are tab kinds. */
export const CHOICE_STORAGE_KEY = 'dsh-plugin-documd:preview-choice'

/** The subset of `Storage` used here, so tests can pass a plain stub. */
export interface ChoiceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** @returns the browser store, or `undefined` outside a browser. */
function defaultStorage(): ChoiceStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * Key one path falls under.
 * @param path - file path or address.
 * @returns `.md`-style lowercase extension, or `*` for extensionless names.
 */
export function preferenceKeyFor(path: string): string {
  return extensionOf(path) || '*'
}

/**
 * Read the remembered kind for one file.
 * @param path - file path or address.
 * @param storage - injectable store.
 * @returns a kind, or `undefined` when nothing was remembered.
 */
export function readChoice(
  path: string,
  storage: ChoiceStorage | undefined = defaultStorage(),
): string | undefined {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(CHOICE_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed[preferenceKeyFor(path)]
    return typeof value === 'string' && value ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Persist one choice.
 * @param path - file path or address.
 * @param kind - tab kind to open next time.
 * @param storage - injectable store.
 */
export function writeChoice(
  path: string,
  kind: string,
  storage: ChoiceStorage | undefined = defaultStorage(),
): void {
  if (!storage) return
  let parsed: Record<string, unknown> = {}
  try {
    const raw = storage.getItem(CHOICE_STORAGE_KEY)
    const candidate = raw ? JSON.parse(raw) : {}
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      parsed = candidate as Record<string, unknown>
    }
  } catch {
    // A corrupted value is discarded instead of blocking the write.
    parsed = {}
  }
  try {
    parsed[preferenceKeyFor(path)] = kind
    storage.setItem(CHOICE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // A full or blocked store must never break the preview.
  }
}

/**
 * Forget the choice for one extension.
 * @param path - file path or address.
 * @param storage - injectable store.
 */
export function clearChoice(
  path: string,
  storage: ChoiceStorage | undefined = defaultStorage(),
): void {
  if (!storage) return
  try {
    const raw = storage.getItem(CHOICE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    delete parsed[preferenceKeyFor(path)]
    storage.setItem(CHOICE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // Ignore.
  }
}

/**
 * Whether a remembered kind should be re-applied on open.
 * @param kind - remembered tab kind.
 * @returns `true` only for a kind this plugin does not own.
 */
export function shouldReopenWith(kind: string | undefined): kind is string {
  return typeof kind === 'string' && kind !== '' && !OWN_KINDS.includes(kind)
}
