import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'browser-extension');
const outputDir = join(sourceDir, 'build');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await cp(join(sourceDir, 'manifest.json'), join(outputDir, 'manifest.json'));

// The source project keeps implementation files under `src`, but the folder
// selected in Chromium must be the folder that directly contains manifest.json.
// Flatten the distributable so users are not tempted to select `src` instead.
for (const entry of await readdir(join(sourceDir, 'src'), { withFileTypes: true })) {
  await cp(join(sourceDir, 'src', entry.name), join(outputDir, entry.name), { recursive: true });
}

const manifestPath = join(outputDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.version = process.env.INSPIRATION_DRAWER_EXTENSION_VERSION || manifest.version;
manifest.background.service_worker = manifest.background.service_worker.replace(/^src\//, '');
for (const contentScript of manifest.content_scripts || []) {
  contentScript.js = (contentScript.js || []).map(file => file.replace(/^src\//, ''));
  if (Array.isArray(contentScript.css)) {
    contentScript.css = contentScript.css.map(file => file.replace(/^src\//, ''));
  }
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Browser extension built: ${outputDir}`);
