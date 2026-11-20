import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const channelPath = path.join(root, 'integrations/rhino/update-channel.json');
const keyPath = () => process.env.RHINO_UPDATE_SIGNING_KEY_PATH || path.join(os.homedir(), '.tauri/inspiration-drawer-rhino-updates.pem');
const pluginFiles = ['InspirationDrawer.Rhino.rhp', 'InspirationDrawer.Rhino.deps.json', 'InspirationDrawer.Rhino.runtimeconfig.json', 'InspirationDrawer.Rhino.rui', 'InspirationDrawer.Rhino.svg'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

export function initKey() {
  const file = keyPath();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const pair = generateKeyPairSync('ed25519');
    fs.writeFileSync(file, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const key = createPrivateKey(fs.readFileSync(file));
  const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
  const existing = fs.existsSync(channelPath) ? JSON.parse(fs.readFileSync(channelPath, 'utf8')) : null;
  if (existing?.publicKey && existing.publicKey !== publicKey) throw new Error('Existing channel key differs. Key rotation requires a host release; refusing to overwrite it.');
  writeJson(channelPath, { schema: 1, channel: 'rhino-v1', publicKey, endpoints: [
    'https://gitee.com/zibinyou/inspiration-drawer/releases/download/rhino-updates/latest.json',
    'https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/rhino-updates/latest.json',
  ] });
  return { publicKey, privateKeyPath: file };
}

export async function buildRuntime(outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const result = await build({
    absWorkingDir: root, entryPoints: ['src/features/rhino/runtime/entry.ts'],
    outfile: path.join(outputDirectory, 'runtime.js'), bundle: true, format: 'esm',
    platform: 'browser', target: 'es2022', minify: true, metafile: true, legalComments: 'none',
    plugins: [{ name: 'raw-assets', setup(builder) {
      builder.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-assets' }));
      builder.onLoad({ filter: /.*/, namespace: 'raw-assets' }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
    } }],
  });
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
  if (imports.length || Object.keys(result.metafile.inputs).some(file => /node_modules|rhinoRuntime\.ts|useChatRuntime/.test(file))) {
    throw new Error('Independent runtime must be self-contained and must not include desktop IPC, React or shared Chat runtime');
  }
  return path.join(outputDirectory, 'runtime.js');
}

/** A bounded, flat JSON container avoids platform-dependent ZIP tools. Files are
 * base64 encoded, and the complete container is hashed by the signed catalog. */
export function packComponent({ id, version, revision, directory, outputDirectory, baseUrl }) {
  if (!['runtime', 'plugin8', 'plugin9'].includes(id) || !/^[A-Za-z0-9][A-Za-z0-9.+-]{0,79}$/.test(version)
    || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid independent component identity/revision');
  const names = id === 'runtime' ? ['runtime.js'] : pluginFiles;
  if (id !== 'runtime') {
    const deps = JSON.parse(fs.readFileSync(path.join(directory, pluginFiles[1]), 'utf8'));
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, pluginFiles[2]), 'utf8'));
    if (!deps.libraries?.[`InspirationDrawer.Rhino/${version}`] || runtime.runtimeOptions?.tfm !== (id === 'plugin8' ? 'net7.0' : 'net8.0')) {
      throw new Error('Plugin version/Rhino framework does not match the compiled payload; build the plugin first');
    }
  }
  const files = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(directory, name)).toString('base64')]));
  const bytes = Buffer.from(JSON.stringify({ schema: 1, id, files }) + '\n');
  if (bytes.length > 48 * 1024 * 1024) throw new Error('Component bundle exceeds 48 MiB');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const file = `rhino-${id}-${version}-${revision}.bundle.json`;
  fs.writeFileSync(path.join(outputDirectory, file), bytes);
  const url = new URL(file, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Release base URL must use HTTPS');
  const channel = JSON.parse(fs.readFileSync(channelPath, 'utf8'));
  const urls = [...new Set([...channel.endpoints.map(endpoint => new URL(file, endpoint).href), url.href])];
  return { id, version, revision, url: url.href, urls, sha256: digest(bytes), size: bytes.length };
}

export function signCatalog(components, outputDirectory, options = {}) {
  const channel = options.channel || JSON.parse(fs.readFileSync(channelPath, 'utf8'));
  const key = createPrivateKey(fs.readFileSync(options.keyPath || keyPath()));
  if (createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64') !== channel.publicKey) throw new Error('Signing key does not match the pinned channel public key');
  if (new Set(components.map(item => item.id)).size !== components.length) throw new Error('Duplicate catalog component');
  const bytes = Buffer.from(JSON.stringify({ schema: 1, channel: channel.channel, hostApi: 1, components }));
  const envelope = { signed: bytes.toString('base64'), signature: sign(null, bytes, key).toString('base64') };
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeJson(path.join(outputDirectory, 'latest.json'), envelope);
  return envelope;
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    out: { type: 'string' }, version: { type: 'string' }, revision: { type: 'string' },
    component: { type: 'string' }, source: { type: 'string' }, 'base-url': { type: 'string' }, 'merge': { type: 'string' },
  } });
  const output = path.resolve(values.out || 'outputs/rhino-updates');
  if (positionals[0] === 'init-key') { console.log(JSON.stringify(initKey(), null, 2)); return; }
  if (positionals[0] === 'build-runtime') { console.log(await buildRuntime(output)); return; }
  if (positionals[0] !== 'pack') throw new Error('Use init-key, build-runtime, or pack --component runtime|plugin8|plugin9|all --version VERSION --revision N --base-url HTTPS_URL [--merge existing-latest.json]');
  const selected = values.component || 'runtime';
  let components = [];
  if (values.merge) {
    const { verify } = await import('node:crypto');
    const envelope = JSON.parse(fs.readFileSync(values.merge, 'utf8'));
    const channel = JSON.parse(fs.readFileSync(channelPath, 'utf8'));
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(channel.publicKey, 'base64')]), type: 'spki', format: 'der' });
    const bytes = Buffer.from(envelope.signed, 'base64');
    if (!verify(null, bytes, key, Buffer.from(envelope.signature, 'base64'))) throw new Error('Cannot merge an unsigned/untrusted catalog');
    const old = JSON.parse(bytes);
    if (old.schema !== 1 || old.channel !== channel.channel || old.hostApi !== 1) throw new Error('Catalog channel/API mismatch');
    components = old.components;
  }
  for (const id of selected === 'all' ? ['runtime', 'plugin8', 'plugin9'] : [selected]) {
    if (id === 'runtime' && !values.version) throw new Error('Provide --version for the independent runtime release');
    const directory = values.source ? path.resolve(values.source) : id === 'runtime' ? path.join(output, 'runtime') : path.join(root, 'src-tauri/resources/rhino', id.slice(-1));
    if (id === 'runtime' && !values.source) await buildRuntime(directory);
    const version = (selected !== 'all' || id === 'runtime' ? values.version : undefined) || fs.readFileSync(path.join(root, 'integrations/rhino/InspirationDrawer.Rhino/InspirationDrawer.Rhino.csproj'), 'utf8').match(/<Version>([^<]+)<\/Version>/)?.[1];
    const item = packComponent({ id, version, revision: Number(values.revision), directory, outputDirectory: output, baseUrl: values['base-url'] || 'https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/rhino-updates/' });
    const previous = components.find(old => old.id === id);
    if (previous && item.revision <= previous.revision) throw new Error(`Revision must increase for ${id}`);
    components = [...components.filter(old => old.id !== id), item];
  }
  signCatalog(components, output);
  console.log(`Prepared ${components.map(item => item.id + '@' + item.version).join(', ')} in ${output}. No desktop build or upload was performed.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
