/**
 * The one stylesheet the tab bodies inject.
 *
 * Slot components render inside host-owned markup, so scope comes from a
 * `dm-` prefix rather than a root element. Colours are host theme aliases;
 * geometry follows the host's 12/13/14px type scale.
 *
 * @module dsh-plugin-documd/client/styles
 */

import { PLUGIN_ID } from '../shared/contract'

const CSS = `
.dm-pane {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2023);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dm-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dm-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-sizing: border-box;
  height: 100%;
  min-height: 120px;
  padding: 24px;
  color: var(--dsw-alias-label-secondary, #5f6368);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}
.dm-status-error { color: var(--dsw-alias-state-error-primary, #d93025); }
.dm-card {
  box-sizing: border-box;
  max-width: 420px;
  padding: 16px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-1, #f6f7f9);
  box-shadow: var(--dsw-elevation-panel, none);
  text-align: left;
}
.dm-card-title {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
.dm-card-detail {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-secondary, #5f6368);
}
.dm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.dm-button {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.18));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-1, #f6f7f9);
  color: var(--dsw-alias-label-primary, #1f2023);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.dm-button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.dm-native-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dm-native-image {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 16px;
  overflow: auto;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dm-native-image img {
  max-width: 100%;
  height: auto;
  object-fit: contain;
}
.dm-native-actions {
  flex: none;
  justify-content: flex-end;
  margin: 0;
  padding: 6px 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
}
.dm-native-actions a { text-decoration: none; }
`

/**
 * Inject the tab stylesheet.
 * @returns the disposer that removes the style node when the plugin unloads.
 */
export function injectStyles(): () => void {
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}
