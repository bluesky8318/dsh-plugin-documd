/**
 * 宿主半边：把 `/docu-preview` 挂到 dsh 的 HTTP 服务上（静态 viewer + 文件/资产 API）。
 *
 * 服务名提醒：`@deepseek-ai/dsh-host-webserver` 在 0.0.1-rc.1 里注册为
 * `httpServer`，从 0.1.x 起注册为 `webServer`。本插件按 0.2.1-rc.5（当前锁定的
 * dsh 运行时）的 `webServer` 注入；若 profile 里装的是 0.0.x 的 dsh，请把 inject 改成
 * `httpServer`（README 的「兼容性」一节有说明）。
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
import {
  DEFAULT_PREVIEW_MODE,
  DEFAULT_PRIORITY,
  PLUGIN_ID,
  PRIORITY_BANDS,
  PREVIEW_MODES,
  ROUTE_PREFIX,
  isPreviewMode,
  isPriorityBand,
  type PreviewMode,
  type PriorityBand,
} from './shared/contract.ts'

/** 宿主插件名，须与 package.json 的 name 及 cordis.patch.yml 的 id 一致。 */
export const name = PLUGIN_ID

/** 依赖的服务：webServer 就绪后本插件才会加载。 */
export const inject = ['webServer']

/**
 * 插件配置。每个字段都是 Volatile 引用，用户改写后无需重启宿主。
 */
export interface Config {
  /**
   * 额外允许的工作区根目录；空值表示完全跟随 dsh 自己报告的根
   * （session 地址用 `session.header.cwd`，其余用 `sandboxPolicy.workspaceRoot`）。
   * 多个根用 `;` 或 `,` 分隔。
   */
  workspaceRoot: Volatile<string>
  /** 初始主题：`auto`、`vscode`、`vscode-dark`，或 themes/registry.json 里的任意 id。 */
  themeId: Volatile<string>
  /** 单文件预览上限（字节）。 */
  maxPreviewBytes: Volatile<number>
  /** 每个标签页签发的能力令牌有效期（毫秒）。 */
  tokenTtlMs: Volatile<number>
  /**
   * 预览接管策略：`manual`（默认）只在 dsh 的「打开方式」里出现，不抢标签页；
   * `auto` 额外注册标签页类型（按 `priority` 竞争）；`off` 什么都不注册。
   */
  mode: Volatile<PreviewMode>
  /** `auto` 下的竞争档位：`extension` > `builtin` > `fallback`。 */
  priority: Volatile<PriorityBand>
  /** 预览页里的「预览方式」选择是否按扩展名记住（默认记住）。 */
  rememberChoice: Volatile<boolean>
  /** 打开路径诊断日志与 `/docu-preview/api/diagnostics`。 */
  debug: Volatile<boolean>
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
  mode: Schema.union([...PREVIEW_MODES]).default(DEFAULT_PREVIEW_MODE).volatile(),
  priority: Schema.union([...PRIORITY_BANDS]).default(DEFAULT_PRIORITY).volatile(),
  rememberChoice: Schema.boolean().default(true).volatile(),
  debug: Schema.boolean().default(false).volatile(),
})

/** `assets/viewer` 与 lib/index.js 同属包根，装进 profile 后路径不变。 */
const VIEWER_ROOT = fileURLToPath(new URL('../assets/viewer', import.meta.url))

/** The slice of `@deepseek-ai/dsh-session` the root resolver needs. */
interface SessionLike {
  readonly header?: { readonly cwd?: string }
}
interface SessionsLike {
  get(id: string): SessionLike | undefined
}

/** The slice of `@deepseek-ai/dsh-sandbox-policy` the root resolver needs. */
interface SandboxPolicyLike {
  readonly workspaceRoot?: string
}

/**
 * The workspace roots dsh itself would use for an address.
 *
 * Mirrors `@deepseek-ai/dsh-api-workspace-files`: a session address is scoped by
 * `session.header.cwd` (falling back to the sandbox-policy default), and
 * everything else uses the deployment default. Services are looked up lazily,
 * so this also works in profiles that do not mount session storage.
 *
 * @param ctx - host context.
 * @returns a resolver for `WorkspacePaths`.
 */
function createRootResolver(ctx: Context): (sessionId: string | undefined) => readonly string[] {
  return (sessionId) => {
    if (sessionId) {
      const sessions = ctx.reflect.get('sessions', false) as SessionsLike | undefined
      const cwd = sessions?.get(sessionId)?.header?.cwd
      if (cwd) return [cwd]
    }
    const sandbox = ctx.reflect.get('sandboxPolicy', false) as SandboxPolicyLike | undefined
    return sandbox?.workspaceRoot ? [sandbox.workspaceRoot] : []
  }
}

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
      rootForSession: createRootResolver(ctx),
      maxPreviewBytes: () => config.maxPreviewBytes.get(),
      tokenTtlMs: () => config.tokenTtlMs.get(),
      themeId: () => config.themeId.get(),
      mode: () => {
        const value = config.mode.get()
        return isPreviewMode(value) ? value : DEFAULT_PREVIEW_MODE
      },
      priority: () => {
        const value = config.priority.get()
        return isPriorityBand(value) ? value : DEFAULT_PRIORITY
      },
      rememberChoice: () => config.rememberChoice.get() !== false,
      debug: () => config.debug.get() === true,
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
