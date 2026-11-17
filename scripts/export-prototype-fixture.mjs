// Synthetic source + production renderer/exporter, no production DB or model call.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const out = resolve('outputs/sketch-export-verification');
await mkdir(out, { recursive: true });
await build({ stdin: { contents: "export { makePrototypeFixture } from './src/features/chat/prototypes/prototypeFixture'; export { renderPrototypeHtml } from './src/features/chat/prototypes/prototypeHtml'; export { buildPrototypeSketch } from './src/features/chat/prototypes/prototypeSketch';", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', outfile: resolve(out, 'fixture-lib.mjs') });
const { makePrototypeFixture, renderPrototypeHtml, buildPrototypeSketch } = await import(pathToFileURL(resolve(out, 'fixture-lib.mjs')));
const prototype = makePrototypeFixture();
// A real PNG reference tests the image archive path without rasterizing the UI.
prototype.nodes.push({ id: 'synthetic-photo', parentId: 'detail', kind: 'image', name: '内嵌测试图片', x: 24, y: 300, width: 64, height: 64, radius: 8, imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGO89GTtfwY8gAmf5PBRAAB96ANyQ9uqLgAAAABJRU5ErkJggg==' });
await writeFile(resolve(out, 'prototype.json'), JSON.stringify(prototype, null, 2));
await writeFile(resolve(out, 'preview.html'), renderPrototypeHtml(prototype));
await writeFile(resolve(out, 'sketch-parts.json'), JSON.stringify(buildPrototypeSketch(prototype), null, 2));
console.log('Synthetic prototype + actual Sketch export parts:', out);
