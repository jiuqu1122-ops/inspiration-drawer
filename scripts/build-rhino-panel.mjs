import { readFile, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowUp, Check, ChevronDown, Image, Layers, Paperclip, SlidersHorizontal, Square } from 'lucide-react';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  configFile: false, root, publicDir: false, logLevel: 'warn',
  build: { emptyOutDir: false, outDir: 'integrations/rhino/InspirationDrawer.Rhino/Panel',
    lib: { entry: 'src/features/rhino/panelMarkdown.ts', name: 'rhinoMarkdown', formats: ['iife'], fileName: () => 'markdown.js' },
    minify: true, sourcemap: false, target: 'es2020' },
});

// Generate real inline Lucide geometry. External SVG <use> URLs are blocked
// by the panel's deliberate img-src data: policy; do not weaken that policy.
const icons = { 'arrow-up': ArrowUp, check: Check, 'chevron-down': ChevronDown, image: Image, layers: Layers, paperclip: Paperclip, sliders: SlidersHorizontal, square: Square };
const inlineIcon = (id, className = '') => {
  if (!icons[id]) throw new Error('Unknown panel icon: ' + id);
  return renderToStaticMarkup(createElement(icons[id], {
    size: 24, strokeWidth: 1.75, 'aria-hidden': true, focusable: false,
    'data-panel-icon': id, className,
  }));
};
const htmlPath = new URL('../integrations/rhino/InspirationDrawer.Rhino/Panel/index.html', import.meta.url);
let html = await readFile(htmlPath, 'utf8');
html = html.replace(/<svg\b([^>]*\bdata-panel-icon="([^"]+)"[^>]*)>[\s\S]*?<\/svg>/g,
  (_match, attributes, id) => inlineIcon(id, attributes.match(/\bclass="([^"]*)"/)?.[1]?.split(/\s+/).filter(name => name && name !== 'lucide' && !name.startsWith('lucide-')).join(' ') || ''));
const templates = '<!-- panel-icon-templates:start -->\n' + Object.keys(icons)
  .map(id => `<template id="panel-icon-${id}">${inlineIcon(id)}</template>`).join('\n')
  + '\n<!-- panel-icon-templates:end -->';
if (html.includes('<!-- panel-icon-templates:start -->')) {
  html = html.replace(/<!-- panel-icon-templates:start -->[\s\S]*?<!-- panel-icon-templates:end -->/, templates);
} else {
  html = html.replace('  <script src="/panel-pickers.js"></script>', templates + '\n  <script src="/panel-pickers.js"></script>');
}
if (/<use\b|icons\.svg/.test(html)) throw new Error('Panel icons must not depend on external SVG references.');
await writeFile(htmlPath, html);
