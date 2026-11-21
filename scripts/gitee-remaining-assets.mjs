import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey, verify } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const asset = (filePath, extra = {}) => ({ filePath, uploadName: path.basename(filePath), sha256: digest(fs.readFileSync(filePath)), ...extra });

export function prepareRemainingGiteeUploads({ directory, owner, repo, channel }) {
  const root = read(path.join(directory, 'latest.json'));
  const fixedFile = path.join(directory, 'gitee-latest/latest.json');
  const fixed = read(fixedFile);
  if (JSON.stringify(root) !== JSON.stringify(fixed)) throw new Error('gitee-latest/latest.json does not match the desktop release manifest. Nothing was uploaded.');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(root.version || '')) throw new Error('Invalid desktop release version.');
  const desktopTag = 'v' + root.version;
  const platform = root.platforms?.['windows-x86_64-nsis'] || root.platforms?.['windows-x86_64'];
  const expectedBase = `https://gitee.com/${owner}/${repo}/releases/download/${desktopTag}/`;
  const mirrors = [...(root.urls || []), ...(platform?.urls || [])].filter(entry => typeof entry?.url === 'string' && new URL(entry.url).hostname === 'gitee.com');
  if (!mirrors.length || mirrors.some(entry => !entry.url.startsWith(expectedBase))) throw new Error('Desktop metadata targets a different Gitee repository or release.');
  const installerName = decodeURIComponent(new URL(mirrors[0].url).pathname.split('/').pop());
  const versionPattern = new RegExp('(^|[^0-9.])' + root.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![0-9]|\\.[0-9])');
  if (path.basename(installerName) !== installerName || !versionPattern.test(installerName) || !installerName.endsWith('-setup.exe')) throw new Error('Invalid desktop installer filename.');
  const installer = fs.readFileSync(path.join(directory, installerName));
  const signature = fs.readFileSync(path.join(directory, installerName + '.sig'), 'utf8').trim();
  if (!signature || signature !== platform?.signature || [root.sha256, platform.sha256].some(hash => String(hash).toLowerCase() !== digest(installer))
    || root.size !== installer.length || platform.size !== installer.length) throw new Error('Desktop installer, signature or checksum does not match its metadata.');

  const rhinoDirectory = path.join(directory, 'rhino-updates');
  const rhinoIndex = path.join(rhinoDirectory, 'latest.json');
  const envelope = read(rhinoIndex);
  const signed = Buffer.from(envelope.signed || '', 'base64');
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(channel.publicKey, 'base64')]), type: 'spki', format: 'der' });
  if (!verify(null, signed, key, Buffer.from(envelope.signature || '', 'base64'))) throw new Error('Rhino catalog signature is invalid. Nothing was uploaded.');
  const catalog = JSON.parse(signed);
  if (catalog.schema !== 1 || catalog.hostApi !== 1 || catalog.channel !== channel.channel || !Array.isArray(catalog.components)
    || !catalog.components.length || catalog.components.length > 3 || new Set(catalog.components.map(item => item.id)).size !== catalog.components.length) throw new Error('Invalid Rhino catalog.');
  const bundles = catalog.components.map(component => {
    if (!['runtime', 'plugin8', 'plugin9'].includes(component.id) || !Number.isSafeInteger(component.revision) || component.revision < 1
      || !Number.isSafeInteger(component.size) || component.size < 1 || component.size > 48 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(component.sha256 || '')) throw new Error('Invalid Rhino component metadata.');
    const filename = decodeURIComponent(new URL(component.url).pathname.split('/').pop());
    if (!/^[A-Za-z0-9][A-Za-z0-9.+_-]*\.bundle\.json$/.test(filename)) throw new Error('Unsafe Rhino artifact filename.');
    const mirrorUrl = `https://gitee.com/${owner}/${repo}/releases/download/rhino-updates/${filename}`;
    if (![component.url, ...(component.urls || [])].includes(mirrorUrl)) throw new Error('Signed Rhino component targets a different Gitee repository or tag.');
    const file = path.join(rhinoDirectory, filename);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== component.size || digest(bytes) !== component.sha256.toLowerCase()) throw new Error('Rhino component checksum/size mismatch: ' + filename);
    return asset(file, { immutable: true, mirrorUrl });
  });
  return [
    { tag: 'rhino-updates', assets: [...bundles, asset(rhinoIndex)] },
    { tag: 'latest', assets: [asset(fixedFile)], requiresArtifacts: { tag: desktopTag, names: [installerName, installerName + '.sig'] } },
  ];
}

export async function uploadRemainingGiteePlans(plans, client) {
  // Resolve both targets and validate existing artifacts before changing either.
  const states = await Promise.all(plans.map(async plan => {
    const release = await client.release(plan.tag);
    if (!release?.id) throw new Error('Create the existing Gitee release page first: ' + plan.tag);
    const attachments = await client.attachments(release.id);
    if (plan.requiresArtifacts) {
      const published = await client.release(plan.requiresArtifacts.tag);
      if (!published?.id) throw new Error('Desktop version release does not exist: ' + plan.requiresArtifacts.tag);
      const names = new Set((await client.attachments(published.id)).map(item => client.name(item)));
      if (plan.requiresArtifacts.names.some(name => !names.has(name))) throw new Error('Upload the versioned installer and signature before publishing the fixed desktop index.');
    }
    const skip = new Set();
    for (const file of plan.assets) {
      const existing = attachments.filter(item => client.name(item) === file.uploadName);
      if (existing.length && file.immutable) {
        if (!await client.matches(file)) throw new Error('Existing immutable component differs; publish a new component revision: ' + file.uploadName);
        skip.add(file.uploadName);
      } else if (existing.length && client.overwrite === false) throw new Error('GITEE_OVERWRITE=false prevents replacing ' + plan.tag + '/' + file.uploadName);
    }
    return { plan, release, attachments, skip };
  }));
  for (const { plan, release, attachments, skip } of states) {
    for (const file of plan.assets) {
      if (digest(fs.readFileSync(file.filePath)) !== file.sha256) throw new Error('Local file changed after validation: ' + file.uploadName);
      if (skip.has(file.uploadName)) { client.log('Already current: ' + plan.tag + '/' + file.uploadName); continue; }
      for (const existing of attachments.filter(item => client.name(item) === file.uploadName)) await client.remove(release.id, existing.id || existing.attach_file_id);
      client.log('Uploading ' + plan.tag + '/' + file.uploadName + '...');
      await client.upload(release.id, file);
    }
  }
}
