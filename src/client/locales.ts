/**
 * Copy for the three tab bodies. Every string a user can see lives here; the
 * `locale` option on each slot registration turns these dictionaries into the
 * typed `t` seat.
 *
 * @module dsh-plugin-documd/client/locales
 */

/** Locale namespace of the browser half (also the `locale` option on registrations). */
export const LOCALE_NAMESPACE = 'documd'

/** Keys used by the tab bodies. */
export type DocumdLocaleKey =
  | 'viewer.loading'
  | 'viewer.error'
  | 'viewer.retry'
  | 'native.openExternal'
  | 'native.pdf'
  | 'unsupported.title'
  | 'unsupported.detail'
  | 'unsupported.binary'
  | 'unsupported.install'
  | 'unsupported.useViewer'

/** English copy. */
export const en: Record<DocumdLocaleKey, string> = {
  'viewer.loading': 'Rendering with docu.md…',
  'viewer.error': 'Preview failed: {message}',
  'viewer.retry': 'Retry',
  'native.openExternal': 'Open in a new tab',
  'native.pdf': 'PDF preview',
  'unsupported.title': 'This file type is not previewed yet',
  'unsupported.detail': '{ext} files need a dedicated viewer.',
  'unsupported.binary': 'This file is binary and has no registered previewer.',
  'unsupported.install': 'Install dsh-docx, dsh-pptx or dsh-opensheet-sidebar to open it in the sidebar.',
  'unsupported.useViewer': 'Open with {title}',
}

/** Simplified Chinese copy. */
export const zh: Record<DocumdLocaleKey, string> = {
  'viewer.loading': '正在用 docu.md 渲染…',
  'viewer.error': '预览失败：{message}',
  'viewer.retry': '重试',
  'native.openExternal': '在新标签页打开',
  'native.pdf': 'PDF 预览',
  'unsupported.title': '暂不支持预览该文件类型',
  'unsupported.detail': '{ext} 文件需要专用预览器。',
  'unsupported.binary': '这是二进制文件，没有注册的预览器。',
  'unsupported.install': '安装 dsh-docx、dsh-pptx 或 dsh-opensheet-sidebar 后可在右侧栏打开。',
  'unsupported.useViewer': '用 {title} 打开',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy contributed by this plugin's browser half. */
    documd: DocumdLocaleKey
  }
}
