import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { prepareRemainingGiteeUploads, uploadRemainingGiteePlans } from '../gitee-remaining-assets.mjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith('gitee-remaining-')) throw new Error('Unexpected test cleanup path');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitee-remaining-')); directories.push(directory);
  const mirror = 'https://gitee.com/fixture-owner/fixture-repo/releases/download/';
  const installerName = 'Inspiration.Drawer_8.0.35_x64-setup.exe', installer = Buffer.from('signed installer fixture');
  const urls = [{ url: mirror + 'v8.0.35/' + installerName }];
  const platform = { signature: 'matching-signature-fixture', size: installer.length, sha256: digest(installer), urls };
  const desktop = { version: '8.0.35', size: installer.length, sha256: digest(installer), urls, platforms: { 'windows-x86_64': platform } };
  fs.writeFileSync(path.join(directory, installerName), installer); fs.writeFileSync(path.join(directory, installerName + '.sig'), platform.signature);
  fs.mkdirSync(path.join(directory, 'gitee-latest')); fs.mkdirSync(path.join(directory, 'rhino-updates'));
  write(path.join(directory, 'latest.json'), desktop); write(path.join(directory, 'gitee-latest/latest.json'), desktop);
  const pair = generateKeyPairSync('ed25519');
  const channel = { channel: 'rhino-v1', publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64') };
  const components = ['runtime', 'plugin8', 'plugin9'].map(id => {
    const name = `rhino-${id}-fixture-1.bundle.json`, bytes = Buffer.from(JSON.stringify({ schema: 1, id, files: {} }));
    fs.writeFileSync(path.join(directory, 'rhino-updates', name), bytes);
    return { id, revision: 1, version: 'fixture', size: bytes.length, sha256: digest(bytes), url: mirror + 'rhino-updates/' + name };
  });
  const bytes = Buffer.from(JSON.stringify({ schema: 1, hostApi: 1, channel: 'rhino-v1', components }));
  write(path.join(directory, 'rhino-updates/latest.json'), { signed: bytes.toString('base64'), signature: sign(null, bytes, pair.privateKey).toString('base64') });
  const options = { directory, owner: 'fixture-owner', repo: 'fixture-repo', channel };
  return { directory, options, installerName, plan: () => prepareRemainingGiteeUploads(options) };
}
function fakeClient(f, { failName, existingBundles = false, matching = true, versionMissing = false } = {}) {
  const events = [];
  const plans = f.plan();
  return { events, client: {
    release: async tag => { events.push(['read-release', tag]); return { id: tag === 'rhino-updates' ? 1 : tag === 'latest' ? 2 : 3 }; },
    attachments: async id => {
      events.push(['read-assets', id]);
      if (id === 3) return versionMissing ? [] : [{ name: f.installerName }, { name: f.installerName + '.sig' }];
      return [{ id: id * 10, name: 'latest.json' }, { id: id * 10 + 1, name: 'preserved-old-asset' },
        ...(id === 1 && existingBundles ? plans[0].assets.filter(asset => asset.immutable).map((asset, index) => ({ id: 100 + index, name: asset.uploadName })) : [])];
    },
    name: value => value.name, matches: async () => matching,
    remove: async (id, attachment) => { events.push(['delete', id, attachment]); },
    upload: async (id, asset) => { events.push(['upload', id, asset.uploadName]); if (asset.uploadName === failName) throw new Error('upload failed'); },
    log: () => {}, overwrite: true,
  } };
}

describe('remaining Gitee update artifacts', () => {
  it('verifies the signed catalog and sends each index to its own fixed tag without installer uploads', () => {
    const f = fixture(), plans = f.plan();
    expect(plans.map(plan => plan.tag)).toEqual(['rhino-updates', 'latest']);
    expect(plans[0].assets.map(asset => asset.uploadName)).toEqual(['rhino-runtime-fixture-1.bundle.json', 'rhino-plugin8-fixture-1.bundle.json', 'rhino-plugin9-fixture-1.bundle.json', 'latest.json']);
    expect(plans[1].assets.map(asset => asset.uploadName)).toEqual(['latest.json']);
    expect(plans.flatMap(plan => plan.assets).some(asset => asset.uploadName.endsWith('.exe'))).toBe(false);
  });
  it('rejects a damaged catalog signature', () => {
    const f = fixture(), file = path.join(f.directory, 'rhino-updates/latest.json'), value = JSON.parse(fs.readFileSync(file));
    value.signature = Buffer.alloc(64).toString('base64'); write(file, value);
    expect(f.plan).toThrow('signature is invalid');
  });
  it('rejects a modified component even when its catalog is signed correctly', () => {
    const f = fixture(); fs.appendFileSync(path.join(f.directory, 'rhino-updates/rhino-plugin9-fixture-1.bundle.json'), 'changed');
    expect(f.plan).toThrow('checksum/size mismatch');
  });
  it('rejects a different fixed desktop manifest or upload repository', () => {
    const f = fixture();
    expect(() => prepareRemainingGiteeUploads({ ...f.options, repo: 'wrong-repository' })).toThrow('different Gitee repository');
    write(path.join(f.directory, 'gitee-latest/latest.json'), { version: '8.0.34' });
    expect(f.plan).toThrow('does not match the desktop release');
  });
  it('rejects modified installer bytes before publishing a fixed index', () => {
    const f = fixture(); fs.appendFileSync(path.join(f.directory, f.installerName), 'changed');
    expect(f.plan).toThrow('checksum does not match');
  });
  it('uploads all components before either index and preserves unrelated attachments', async () => {
    const f = fixture(), { client, events } = fakeClient(f);
    await uploadRemainingGiteePlans(f.plan(), client);
    const uploads = events.filter(event => event[0] === 'upload');
    expect(uploads.map(event => event.slice(1))).toEqual([[1, 'rhino-runtime-fixture-1.bundle.json'], [1, 'rhino-plugin8-fixture-1.bundle.json'], [1, 'rhino-plugin9-fixture-1.bundle.json'], [1, 'latest.json'], [2, 'latest.json']]);
    expect(events.filter(event => event[0] === 'delete')).toEqual([['delete', 1, 10], ['delete', 2, 20]]);
    expect(events.findIndex(event => event[0] === 'delete')).toBeGreaterThan(events.indexOf(uploads[2]));
  });
  it('keeps both published indexes when a component upload fails', async () => {
    const f = fixture(), { client, events } = fakeClient(f, { failName: 'rhino-plugin8-fixture-1.bundle.json' });
    await expect(uploadRemainingGiteePlans(f.plan(), client)).rejects.toThrow('upload failed');
    expect(events.some(event => event[0] === 'delete' || event[0] === 'upload' && event[2] === 'latest.json')).toBe(false);
  });
  it('checks already published immutable components and skips identical files', async () => {
    const f = fixture(), { client, events } = fakeClient(f, { existingBundles: true });
    await uploadRemainingGiteePlans(f.plan(), client);
    expect(events.filter(event => event[0] === 'upload').map(event => event.slice(1))).toEqual([[1, 'latest.json'], [2, 'latest.json']]);
  });
  it('refuses conflicting immutable files or a missing versioned installer before any mutation', async () => {
    for (const options of [{ existingBundles: true, matching: false }, { versionMissing: true }]) {
      const f = fixture(), { client, events } = fakeClient(f, options);
      await expect(uploadRemainingGiteePlans(f.plan(), client)).rejects.toThrow();
      expect(events.some(event => ['upload', 'delete'].includes(event[0]))).toBe(false);
    }
  });
});
