import { defineConfig } from 'tsdown'

// tsdown 只做转译与打包，类型检查由 `npm run typecheck` 负责。
// fixedExtension: false —— 包声明 "type": "module"，保持 .js/.d.ts 后缀，
// 与 package.json 的 exports 映射一致。

/**
 * Host 半边要能被**任意加载方式**拉起：profile 安装（依赖会被 pnpm 装进 profile）
 * 和本地 clone / overlay（通常没有 node_modules）。后者解析不到普通 dependency，
 * 所以除宿主提供的 peer 外，一律内联进 lib/index.js。
 *
 * - 内联：`@deepseek-ai/schemastery`（宿主 asar 里是 3.18.5，和本包 devDependency 同版；
 *   它是纯校验器，cordis 只按 StandardSchemaV1 鸭子类型调用，多一份实例不影响行为）。
 * - 外部：`@deepseek-ai/cordis` / `@deepseek-ai/dsh-*`（宿主保证提供，且必须与宿主同一实例）。
 *   tsdown 会自动把 package.json 里的 peer 依赖外部化，不需要手写 external 列表。
 *
 * `scripts/check-packaging.mjs` 会扫描产物，出现「既非 node: 内置、又非 peer」的 import 就失败。
 */

/** Host 半边：Node 库，输出 lib/，由 cordis.patch.yml 的插件行按包名加载。 */
const lib = {
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    // 内联（连同它的传递依赖 cosmokit / @standard-schema/spec 一起进产物）。
    alwaysBundle: ['@deepseek-ai/schemastery'],
    // 关闭「顺带打包了 node_modules 依赖」的提示：这里就是要打包。
    onlyBundle: false,
  },
}

// Client 半边：浏览器 bundle，交给 dsh 的 client-modules 分发。
// 产物必须是 __ModuleLoader__.load 握手格式（banner/footer），并以 CJS 输出。
// externals 只允许浏览器模块表里有的包；react 是唯一运行时外部依赖。
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime']

const client = {
  name: 'dsh-plugin-documd/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  external: CLIENT_EXTERNALS,
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-plugin-documd", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([lib, client])
