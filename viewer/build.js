#!/usr/bin/env node

/**
 * dsh (DeepSeek Harness) viewer build.
 *
 * Forked from `vscode/build.js`: same esbuild pipeline (iife webview bundle,
 * separately bundled render worker, standalone CSS build, asset copy), but
 * everything lands in the plugin's `assets/viewer/` directory so the dsh host
 * half can serve it as static files under `/docu-preview/viewer/`. The entry
 * lives in this plugin's `viewer/` tree, not in the vendored upstream copy.
 *
 * Differences from the VS Code build:
 * - no extension-host build (the dsh host half is the plugin's own TS code);
 * - no vsce packaging step;
 * - MV_PLATFORM = "dsh", MV_RUNTIME = "webview";
 * - writes a self-contained `index.html` (the iframe document the dsh tab
 *   loads) instead of a webview shell.
 */

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dagreShimPlugin } from '../vendor/markdown-viewer/scripts/dagre-shim-plugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file lives in `<plugin>/viewer/`; the upstream engine is vendored next to
// it at `<plugin>/vendor/markdown-viewer/` and the built output is served from
// `<plugin>/assets/viewer/`.
const pluginRoot = path.resolve(__dirname, '..');
const projectRoot = path.join(pluginRoot, 'vendor', 'markdown-viewer');
const outdir = path.join(pluginRoot, 'assets', 'viewer')

/**
 * esbuild resolves relative entry points and `inject` paths against
 * `absWorkingDir`, which it captures from `process.cwd()` when the module loads.
 * Passing it explicitly keeps the upstream-relative entry names
 * (`mobile/src/...`, `src/ui/styles.css`) working without a `chdir`.
 */
const esbuildWorkingDir = {
  absWorkingDir: projectRoot,
  inject: [path.join(projectRoot, 'scripts', 'buffer-shim.js')],
};

function copyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
  return true;
}

function generateThemeBundles() {
  const themesRoot = path.join(projectRoot, 'src', 'themes');
  const registryPath = path.join(themesRoot, 'registry.json');
  if (!fs.existsSync(registryPath)) {
    return 0;
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const bundlesDir = path.join(outdir, 'themes', 'bundles');
  fs.mkdirSync(bundlesDir, { recursive: true });

  let bundleCount = 0;
  for (const entry of registry.themes || []) {
    const presetPath = path.join(themesRoot, 'presets', entry.file);
    if (!fs.existsSync(presetPath)) continue;

    const theme = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    const bundle = {
      theme,
      layoutScheme: JSON.parse(fs.readFileSync(path.join(themesRoot, 'layout-schemes', `${theme.layoutScheme}.json`), 'utf8')),
      colorScheme: JSON.parse(fs.readFileSync(path.join(themesRoot, 'color-schemes', `${theme.colorScheme}.json`), 'utf8')),
      tableStyle: JSON.parse(fs.readFileSync(path.join(themesRoot, 'table-styles', `${theme.tableStyle}.json`), 'utf8')),
      codeTheme: JSON.parse(fs.readFileSync(path.join(themesRoot, 'code-themes', `${theme.codeTheme}.json`), 'utf8')),
    };

    fs.writeFileSync(path.join(bundlesDir, `${theme.id}.json`), JSON.stringify(bundle));
    bundleCount += 1;
  }
  return bundleCount;
}

async function buildViewer() {
  await build({
    ...esbuildWorkingDir,
    entryPoints: [path.join(pluginRoot, 'viewer', 'src', 'workspace', 'viewer-embed.ts')],
    bundle: true,
    outfile: path.join(outdir, 'viewer.js'),
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    sourcemap: false,
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
      MV_PLATFORM: '"dsh"',
      MV_RUNTIME: '"webview"',
      global: 'globalThis',
    },
    loader: {
      '.css': 'empty',
      '.woff2': 'empty',
      '.woff': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
    },
    assetNames: '[name]',
    plugins: [dagreShimPlugin],
  });
}

async function buildRenderWorker() {
  await build({
    ...esbuildWorkingDir,
    entryPoints: {
      'iframe-render-worker': 'mobile/src/webview/iframe-render-worker.ts',
    },
    bundle: true,
    outdir,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
      MV_PLATFORM: '"dsh"',
      MV_RUNTIME: '"worker"',
      global: 'globalThis',
    },
    loader: {
      '.css': 'css',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      '.ttf': 'dataurl',
    },
    external: ['mermaid', 'web-worker'],
    plugins: [dagreShimPlugin],
  });
}

async function buildStyles() {
  await build({
    ...esbuildWorkingDir,
    entryPoints: ['src/ui/styles.css'],
    bundle: true,
    outfile: path.join(outdir, 'styles.css'),
    loader: {
      '.css': 'css',
      '.woff2': 'file',
      '.woff': 'file',
      '.ttf': 'file',
      '.eot': 'empty',
    },
    assetNames: '[name]',
    minify: true,
  });
}

function writeViewerHtml() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>docu.md preview</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    html, body { height: 100%; margin: 0; padding: 0; }
    body {
      background: var(--md-page-bg, var(--color-bg-surface, #ffffff));
      font-family: var(--ds-font-family, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    #docu-preview-root { min-height: 100%; }
  </style>
</head>
<body class="mv-panel">
  <div id="docu-preview-root" mode="inline"></div>
  <script src="viewer.js"></script>
</body>
</html>`;
  fs.writeFileSync(path.join(outdir, 'index.html'), html);
}

function writeRenderFrameHtml() {
  const mermaidJs = fs.readFileSync(path.join(projectRoot, 'node_modules/mermaid/dist/mermaid.min.js'), 'utf8');
  const workerJs = fs.readFileSync(path.join(outdir, 'iframe-render-worker.js'), 'utf8');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:;">
  <title>Render Frame</title>
  <style>
    * { margin: 0; padding: 0; }
    html, body { background: transparent; width: 1400px; min-height: 600px; }
  </style>
</head>
<body>
  <div id="render-container"></div>
  <canvas id="png-canvas"></canvas>
  <script>${mermaidJs}</script>
  <script>${workerJs}</script>
</body>
</html>`;
  fs.writeFileSync(path.join(outdir, 'iframe-render.html'), html);
  fs.unlinkSync(path.join(outdir, 'iframe-render-worker.js'));
}

function copyAssets() {
  copyDirectory(path.join(projectRoot, 'src', '_locales'), path.join(outdir, '_locales'));
  copyDirectory(path.join(projectRoot, 'src', 'themes'), path.join(outdir, 'themes'));
  const themeBundleCount = generateThemeBundles();
  copyDirectory(
    path.join(projectRoot, 'node_modules', '@markdown-viewer', 'drawio2svg', 'resources', 'stencils'),
    path.join(outdir, 'stencils'),
  );
  // styles.css already @imports toc-panel.css at build time; the copy stays for
  // hosts that inject it separately (same as the VS Code build).
  const tocPanel = path.join(projectRoot, 'src', 'ui', 'toc-panel.css');
  if (fs.existsSync(tocPanel)) {
    fs.copyFileSync(tocPanel, path.join(outdir, 'toc-panel.css'));
  }
  console.log(`  • ${themeBundleCount} theme bundles`);

  writeRenderFrameHtml();
  writeViewerHtml();
}

async function main() {
  console.log(`🔨 Building dsh viewer…\n`);

  if (fs.existsSync(outdir)) {
    fs.rmSync(outdir, { recursive: true, force: true });
  }
  fs.mkdirSync(outdir, { recursive: true });

  try {
    console.log('📦 viewer.js');
    await buildViewer();
    console.log('📦 iframe-render-worker');
    await buildRenderWorker();
    console.log('📦 styles.css');
    await buildStyles();
    console.log('📦 assets');
    copyAssets();
    console.log(`\n✅ dsh viewer built → ${outdir}`);
  } catch (error) {
    console.error('\n❌ dsh viewer build failed:', error);
    process.exit(1);
  }
}

main();
