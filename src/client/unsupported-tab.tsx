/**
 * The explicit "no previewer" card for office/archive/binary files.
 *
 * Claiming these extensions is deliberate: without a claim the official text
 * viewer would dump a DOCX or an archive as mojibake. The card also lists any
 * other tab type that *does* claim the address (for example a `dsh-docx`), and
 * opens it through the same tab registry, which is the extension point future
 * office viewers plug into.
 *
 * @module dsh-plugin-documd/client/unsupported-tab
 */

import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { extensionOf } from '../shared/contract'
import { LOCALE_NAMESPACE } from './locales'
import { MessageCard } from './panes'

/** One other tab type that claims the address. */
export interface AlternativeViewer {
  readonly kind: string
  readonly title: string
}

/** The registry bridge the registration injects. */
export interface UnsupportedTabInjected {
  /**
   * Every tab type, other than this plugin's own, that claims the address.
   * @param address - the file address.
   * @returns the alternatives in registry rank order.
   */
  readonly alternatives: (address: string) => readonly AlternativeViewer[]
  /**
   * Open the address with a named tab kind.
   * @param address - the file address.
   * @param kind - the kind chosen from {@link UnsupportedTabInjected.alternatives}.
   */
  readonly openWithKind: (address: string, kind: string) => void
}

/** Composed props of the unsupported body. */
export type UnsupportedTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<UnsupportedTabInjected>
  & PropsLocale<typeof LOCALE_NAMESPACE>

/**
 * Explain what is missing instead of failing silently.
 * @param props - tab information, copy, and the registry bridge.
 * @returns the card.
 */
export function UnsupportedTab(props: UnsupportedTabProps): ReactElement {
  const { useTabInfo, t, alternatives, openWithKind } = props
  const info = useTabInfo()
  const address = info.tab.navigation.address
  const [available, setAvailable] = useState<readonly AlternativeViewer[]>([])

  useEffect(() => {
    setAvailable(address ? alternatives(address) : [])
  }, [address, alternatives])

  const extension = extensionOf(address) || address

  return (
    <MessageCard
      title={t('unsupported.title')}
      detail={t('unsupported.detail', { ext: extension })}
    >
      <p className="dm-card-detail">{t('unsupported.install')}</p>
      {available.length > 0 ? (
        <div className="dm-actions">
          {available.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              className="dm-button"
              onClick={() => {
                openWithKind(address, entry.kind)
              }}
            >
              {t('unsupported.useViewer', { title: entry.title })}
            </button>
          ))}
        </div>
      ) : null}
    </MessageCard>
  )
}
