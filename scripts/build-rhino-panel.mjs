import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  configFile: false, root, publicDir: false, logLevel: 'warn',
  build: { emptyOutDir: false, outDir: 'integrations/rhino/InspirationDrawer.Rhino/Panel',
    lib: { entry: 'src/features/rhino/panelMarkdown.ts', name: 'rhinoMarkdown', formats: ['iife'], fileName: () => 'markdown.js' },
    minify: true, sourcemap: false, target: 'es2020' },
});
