import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'browser-extension');
const outputDir = join(sourceDir, 'build');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of ['manifest.json', 'src']) {
  await cp(join(sourceDir, entry), join(outputDir, entry), { recursive: true });
}

const manifestPath = join(outputDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.version = process.env.INSPIRATION_DRAWER_EXTENSION_VERSION || manifest.version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Browser extension built: ${outputDir}`);
