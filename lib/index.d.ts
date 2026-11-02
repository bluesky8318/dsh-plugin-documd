import Schema from "@deepseek-ai/schemastery";
import { Context, Volatile } from "@deepseek-ai/cordis";
/** 宿主插件名，须与 package.json 的 name 及 cordis.patch.yml 的 id 一致。 */
declare const name = "dsh-plugin-documd";
/** 依赖的服务：webServer 就绪后本插件才会加载。 */
declare const inject: string[];
/**
 * 插件配置。每个字段都是 Volatile 引用，用户改写后无需重启宿主。
 */
interface Config {
  /** viewer 允许读取的工作区根目录；空值以宿主进程的当前目录为准，多个根用 `;` 分隔。 */
  workspaceRoot: Volatile<string>;
  /** 初始主题：`auto`、`vscode`、`vscode-dark`，或 themes/registry.json 里的任意 id。 */
  themeId: Volatile<string>;
  /** 单文件预览上限（字节）。 */
  maxPreviewBytes: Volatile<number>;
  /** 每个标签页签发的能力令牌有效期（毫秒）。 */
  tokenTtlMs: Volatile<number>;
}
/**
 * Schemastery schema：默认值写在这里，cordis.yml 与 GUI 改写都会经过它校验。
 * 不写 `Schema<Config>` 注解——`.volatile()` 的输出类型是解包后的值。
 */
declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
  workspaceRoot: Schema<string, string, "volatile-defined">;
  themeId: Schema<string, string, "volatile-defined">;
  maxPreviewBytes: Schema<number, number, "volatile-defined">;
  tokenTtlMs: Schema<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
  workspaceRoot: Schema<string, string, "volatile-defined">;
  themeId: Schema<string, string, "volatile-defined">;
  maxPreviewBytes: Schema<number, number, "volatile-defined">;
  tokenTtlMs: Schema<number, number, "volatile-defined">;
}>>, "plain">;
/**
 * 插件主体：注册路由，插件停用时撤销路由并吊销所有令牌。
 * @param ctx - 宿主插件上下文。
 * @param config - 经过校验的配置，各字段是 Volatile 引用。
 */
declare function apply(ctx: Context, config: Config): void;
export { Config, apply, inject, name };