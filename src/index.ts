/**
 * 宿主半边：把 `/docu-preview` 挂到 dsh 的 HTTP 服务上（静态 viewer + 文件/资产 API）。
 *
 * 服务名提醒：`@deepseek-ai/dsh-host-webserver` 在 0.0.1-rc.1 里注册为
 * `httpServer`，从 0.1.x 起注册为 `webServer`。本插件与模板一致，按 0.1.7-rc.2
 * 的 `webServer` 注入；若 profile 里装的是 0.0.x 的 dsh，请把 inject 改成
 * `httpServer`（README 的「版本兼容」一节有说明）。
 *
 * 浏览器半边在 src/client/，注册三种右侧栏 tab 类型（viewer / native / unsupported）。
 *
 * @module dsh-plugin-documd
 */

import { fileURLToPath } from 'node:url'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createRoutes } from './host/routes.ts'
import { PLUGIN_ID, ROUTE_PREFIX } from './shared/contract.ts'

/** 宿主插件名，须与 package.json 的 name 及 cordis.patch.yml 的 id 一致。 */
export const name = PLUGIN_ID

/** 依赖的服务：webServer 就绪后本插件才会加载。 */
export const inject = ['webServer']

/**
 * 插件配置。每个字段都是 Volatile 引用，用户改写后无需重启宿主。
 */
export interface Config {
  /** viewer 允许读取的工作区根目录；空值以宿主进程的当前目录为准，多个根用 `;` 分隔。 */
  workspaceRoot: Volatile<string>
  /** 初始主题：`auto`、`vscode`、`vscode-dark`，或 themes/registry.json 里的任意 id。 */
  themeId: Volatile<string>
  /** 单文件预览上限（字节）。 */
  maxPreviewBytes: Volatile<number>
  /** 每个标签页签发的能力令牌有效期（毫秒）。 */
  tokenTtlMs: Volatile<number>
}

/**
 * Schemastery schema：默认值写在这里，cordis.yml 与 GUI 改写都会经过它校验。
 * 不写 `Schema<Config>` 注解——`.volatile()` 的输出类型是解包后的值。
 */
export const Config = Schema.object({
  workspaceRoot: Schema.string().default('').volatile(),
  themeId: Schema.string().default('auto').volatile(),
  maxPreviewBytes: Schema.number().default(8 * 1024 * 1024).volatile(),
  tokenTtlMs: Schema.number().default(10 * 60 * 1000).volatile(),
})

/** `assets/viewer` 与 lib/index.js 同属包根，装进 profile 后路径不变。 */
const VIEWER_ROOT = fileURLToPath(new URL('../assets/viewer', import.meta.url))

/**
 * 插件主体：注册路由，插件停用时撤销路由并吊销所有令牌。
 * @param ctx - 宿主插件上下文。
 * @param config - 经过校验的配置，各字段是 Volatile 引用。
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => {
    const routes = createRoutes({
      viewerRoot: VIEWER_ROOT,
      workspaceRoot: () => config.workspaceRoot.get(),
      maxPreviewBytes: () => config.maxPreviewBytes.get(),
      tokenTtlMs: () => config.tokenTtlMs.get(),
      themeId: () => config.themeId.get(),
      log: (message) => console.debug(message),
    })

    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: routes.handle,
    })

    return () => {
      dispose()
      routes.tokens.clear()
    }
  }, 'dsh-plugin-documd: routes')
}
