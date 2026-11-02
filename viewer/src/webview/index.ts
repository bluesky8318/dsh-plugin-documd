/**
 * dsh viewer entry — installs the dsh PlatformAPI on the global the shared
 * renderer reads (`globalThis.platform`) and re-exports it.
 *
 * The chrome/vscode entries do the same in their own platform folders; the
 * difference here is that nothing outside this bundle supplies the services,
 * all of them are local implementations backed by the plugin's HTTP API.
 */

import { dshPlatform } from './api-impl';

globalThis.platform = dshPlatform;

export { dshPlatform, DshPlatformAPI, tokenFromLocation } from './api-impl';
