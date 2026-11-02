import { defineConfig } from 'tsdown'

// tsdown 只做转译与打包，类型检查由 `npm run typecheck` 负责。
// fixedExtension: false —— 包声明 "type": "module"，保持 .js/.d.ts 后缀，
// 与 package.json 的 exports 映射一致。

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
