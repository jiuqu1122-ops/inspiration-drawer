#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareRemainingGiteeUploads, uploadRemainingGiteePlans } from './gitee-remaining-assets.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const distDir = path.resolve(repoRoot, (process.env.GITEE_DIST_DIR || '').trim() || 'dist-updater');
const latestPath = path.join(distDir, 'latest.json');
const apiBase = (process.env.GITEE_API_BASE_URL || 'https://gitee.com/api/v5').replace(/\/+$/, '');
const dryRun = process.argv.includes('--dry-run') || process.env.GITEE_DRY_RUN === '1';

const requiredEnv = (name) => {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error('Missing environment variable: ' + name);
  return value;
};

const optionalEnv = (name) => (process.env[name] || '').trim();

const detectTargetCommitish = () => {
  const explicit = optionalEnv('GITEE_TARGET_COMMITISH') || optionalEnv('GITEE_BRANCH');
  if (explicit) return explicit;

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (branch && branch !== 'HEAD') return branch;
  } catch {
    // fall through to commit hash
  }

  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (commit) return commit;
  } catch {
    // fall through to a conventional default
  }

  return 'master';
};

const parseRepository = () => {
  const explicitOwner = optionalEnv('GITEE_OWNER');
  const explicitRepo = optionalEnv('GITEE_REPO');
  if (explicitOwner && explicitRepo) return { owner: explicitOwner, repo: explicitRepo };

  const repository = optionalEnv('GITEE_REPOSITORY');
  if (repository.includes('/')) {
    const [owner, repo] = repository.split('/');
    if (owner && repo) return { owner, repo };
  }

  const baseUrl = optionalEnv('GITEE_RELEASE_BASE_URL') || optionalEnv('UPDATE_GITEE_BASE_URL');
  if (baseUrl) {
    const parsed = new URL(baseUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  }

  throw new Error('Missing Gitee repository. Set GITEE_OWNER + GITEE_REPO, or GITEE_REPOSITORY=owner/repo.');
};

const parseReleaseTagFromBaseUrl = () => {
  const baseUrl = optionalEnv('GITEE_RELEASE_BASE_URL') || optionalEnv('UPDATE_GITEE_BASE_URL');
  if (!baseUrl) return '';
  const parsed = new URL(baseUrl);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const downloadIndex = parts.findIndex(part => part === 'download');
  return downloadIndex >= 0 ? parts[downloadIndex + 1] || '' : '';
};

const readLatestJson = () => {
  if (!fs.existsSync(latestPath)) {
    throw new Error('Missing ' + path.relative(repoRoot, latestPath) + '. Prepare the matching release assets or set GITEE_DIST_DIR to their directory.');
  }
  return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
};

const walkDistUpdaterAssets = () => {
  if (!fs.existsSync(distDir)) throw new Error('Missing ' + path.relative(repoRoot, distDir) + '.');
  return fs.readdirSync(distDir)
    .map(name => path.join(distDir, name))
    .filter(file => fs.statSync(file).isFile());
};

const encodeAssetName = (name) => encodeURIComponent(name).replace(/%20/g, '.');

const decodeUrlAssetName = (value) => {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const raw = parsed.pathname.split('/').pop() || '';
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
};

const getPlatform = (latestJson) => {
  const platforms = latestJson.platforms || {};
  return platforms['windows-x86_64-nsis']
    || platforms['windows-x86_64']
    || platforms['windows-x86_64-msi']
    || Object.values(platforms)[0]
    || null;
};

const containsVersion = (name, version) => {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^0-9.])' + escaped + '(?![0-9]|\\.[0-9])').test(name);
};

const validateReleaseVersion = (latestJson, tag, baseUrl) => {
  const version = String(latestJson.version || '').trim();
  if (!version) throw new Error('latest.json is missing its release version.');
  if (tag.replace(/^v/, '') !== version) {
    throw new Error(
      `Release tag ${tag} does not match latest.json version ${version} in ${distDir}. `
      + 'Changing GITEE_RELEASE_TAG does not build or select new installer files. '
      + 'Set GITEE_DIST_DIR to the matching release assets; nothing was uploaded.',
    );
  }
  const parts = new URL(baseUrl).pathname.split('/').filter(Boolean);
  const downloadIndex = parts.indexOf('download');
  const baseTag = downloadIndex >= 0 ? decodeURIComponent(parts[downloadIndex + 1] || '') : '';
  if (baseTag && baseTag !== tag) {
    throw new Error(`Release download URL tag ${baseTag} does not match requested tag ${tag}.`);
  }
};

const validateInstallerContents = (latestJson, installerUploadName, bytes, signature) => {
  const version = String(latestJson.version).trim();
  if (!containsVersion(installerUploadName, version)) {
    throw new Error(`Installer upload name ${installerUploadName} does not match release version ${version}.`);
  }
  const platform = getPlatform(latestJson);
  if (!signature || signature !== String(platform?.signature || '').trim()) {
    throw new Error('Installer signature file does not match latest.json.');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const hashes = [latestJson.sha256, platform?.sha256].filter(value => value !== undefined && value !== null);
  if (!hashes.length || hashes.some(value => String(value).toUpperCase() !== sha256)) {
    throw new Error('Installer SHA256 does not match latest.json.');
  }
  const sizes = [latestJson.size, platform?.size].filter(value => value !== undefined && value !== null);
  if (!sizes.length || sizes.some(value => Number(value) !== bytes.length)) {
    throw new Error('Installer size does not match latest.json.');
  }
};

const validateInstaller = (latestJson, installerPath, installerUploadName, sigPath) => {
  if (!fs.existsSync(sigPath)) throw new Error('Missing installer signature: ' + sigPath);
  validateInstallerContents(latestJson, installerUploadName, fs.readFileSync(installerPath), fs.readFileSync(sigPath, 'utf8').trim());
};

const getInstallerLocalPath = (files, latestJson) => {
  const candidates = files
    .filter(file => path.basename(file) !== 'latest.json')
    .filter(file => !file.endsWith('.sig'))
    .filter(file => /\.(exe|msi|zip)$/i.test(file));
  if (candidates.length === 0) throw new Error('No installer asset found in dist-updater.');

  // dist-updater can contain artifacts from several releases. Never let a
  // stale installer win merely because it sorts first by filename: the
  // selected artifact must match the version advertised by latest.json.
  const expectedVersion = String(latestJson?.version || '').trim();
  const matchingCandidates = expectedVersion
    ? candidates.filter(file => containsVersion(path.basename(file), expectedVersion))
    : candidates;
  if (expectedVersion && matchingCandidates.length === 0) {
    throw new Error(
      `No installer asset for latest.json version ${expectedVersion}. `
      + `Found: ${candidates.map(file => path.basename(file)).join(', ')}`,
    );
  }

  const selectableCandidates = matchingCandidates.length > 0 ? matchingCandidates : candidates;
  selectableCandidates.sort((left, right) => {
    const score = (file) => {
      const name = path.basename(file).toLowerCase();
      if (name.includes('-setup.exe')) return 0;
      if (name.endsWith('.exe')) return 1;
      if (name.endsWith('.msi')) return 2;
      if (name.endsWith('.zip')) return 3;
      return 9;
    };
    return score(left) - score(right) || left.localeCompare(right);
  });
  return selectableCandidates[0];
};

const uniqueUrls = (urls) => {
  const seen = new Set();
  return urls.filter(entry => {
    if (!entry || !entry.url || seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
};

const normalizeLatestJsonForGitee = (latestJson, giteeBaseUrl, installerUploadName) => {
  const giteeInstallerUrl = giteeBaseUrl + '/' + encodeURIComponent(installerUploadName);
  const platform = getPlatform(latestJson);
  const existingUrls = [
    ...(Array.isArray(latestJson.urls) ? latestJson.urls : []),
    ...(Array.isArray(platform && platform.urls) ? platform.urls : []),
  ].filter(entry => entry && typeof entry.url === 'string');
  const giteeEntry = { name: 'Gitee 国内镜像', url: giteeInstallerUrl };
  const githubEntries = existingUrls.filter(entry => /github\.com/i.test(entry.url));
  const nonGiteeEntries = existingUrls.filter(entry => !/gitee\.com/i.test(entry.url) && !/github\.com/i.test(entry.url));
  const nextUrls = uniqueUrls([
    giteeEntry,
    ...githubEntries,
    ...nonGiteeEntries,
  ]);

  latestJson.urls = nextUrls;
  if (platform) {
    platform.urls = nextUrls;
    // Keep legacy single-url field unchanged when it already points to GitHub,
    // so older clients that do not understand urls keep the previous GitHub behavior.
    if (!platform.url) platform.url = giteeInstallerUrl;
  }

  return latestJson;
};

const request = async (method, pathname, { token, body, formData, query } = {}) => {
  const url = new URL(apiBase + pathname);
  if (token) url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers = {};
  const options = { method, headers };
  if (formData) {
    options.body = formData;
  } else if (body) {
    headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    options.body = new URLSearchParams(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(method + ' ' + url.pathname + ' failed: HTTP ' + response.status + ' ' + (detail || ''));
  }
  return data;
};

const fetchRepositoryInfo = async ({ owner, repo, token }) => {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  return await request('GET', '/repos/' + encodedOwner + '/' + encodedRepo, { token });
};

const listRepositoryBranches = async ({ owner, repo, token }) => {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  try {
    const branches = await request('GET', '/repos/' + encodedOwner + '/' + encodedRepo + '/branches', {
      token,
      query: { page: 1, per_page: 100 },
    });
    return Array.isArray(branches) ? branches : [];
  } catch (error) {
    console.warn('Could not list Gitee branches: ' + error.message);
    return [];
  }
};

const resolveTargetCommitish = async ({ owner, repo, token }) => {
  const explicit = optionalEnv('GITEE_TARGET_COMMITISH') || optionalEnv('GITEE_BRANCH');
  if (explicit) return explicit;

  try {
    const repository = await fetchRepositoryInfo({ owner, repo, token });
    const defaultBranch = repository && (
      repository.default_branch
      || repository.defaultBranch
      || repository.default_branch_name
    );
    if (typeof defaultBranch === 'string' && defaultBranch.trim()) {
      return defaultBranch.trim();
    }
  } catch (error) {
    console.warn('Could not read Gitee repository info: ' + error.message);
  }

  const branches = await listRepositoryBranches({ owner, repo, token });
  const branchNames = branches
    .map(branch => branch && (branch.name || branch.branch_name))
    .filter(Boolean);
  if (branchNames.length > 0) return branchNames[0];

  return detectTargetCommitish();
};

const findReleaseByTag = async ({ owner, repo, tag, token }) => {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const encodedTag = encodeURIComponent(tag);

  try {
    return await request('GET', '/repos/' + encodedOwner + '/' + encodedRepo + '/releases/tags/' + encodedTag, { token });
  } catch (error) {
    if (!/HTTP 404/.test(String(error))) {
      console.warn('Could not fetch release by tag directly: ' + error.message);
    }
  }

  const releases = await request('GET', '/repos/' + encodedOwner + '/' + encodedRepo + '/releases', {
    token,
    query: { page: 1, per_page: 100 },
  });
  return Array.isArray(releases)
    ? releases.find(release => release && (release.tag_name === tag || release.tag === tag))
    : null;
};

const createRelease = async ({ owner, repo, tag, latestJson, token }) => {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const name = optionalEnv('GITEE_RELEASE_NAME') || tag;
  const body = optionalEnv('GITEE_RELEASE_BODY') || latestJson.notes || ('Inspiration Drawer ' + (latestJson.version || tag));
  const targetCommitish = await resolveTargetCommitish({ owner, repo, token });
  console.log('Creating release from target_commitish: ' + targetCommitish);
  return await request('POST', '/repos/' + encodedOwner + '/' + encodedRepo + '/releases', {
    token,
    body: {
      tag_name: tag,
      target_commitish: targetCommitish,
      name,
      body,
      prerelease: optionalEnv('GITEE_PRERELEASE') || 'false',
    },
  });
};

const getReleaseId = (release) => release && (release.id || release.release_id || release.number);

const listReleaseAttachments = async ({ owner, repo, releaseId, token }) => {
  const pathname = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
    + '/releases/' + releaseId + '/attach_files';
  const attachments = [];
  for (let page = 1; ; page++) {
    const batch = await request('GET', pathname, { token, query: { page, per_page: 100 } });
    if (!Array.isArray(batch)) throw new Error('Gitee attachment list response was not an array.');
    attachments.push(...batch);
    if (batch.length < 100) return attachments;
  }
};

const updateRelease = async ({ owner, repo, releaseId, tag, latestJson, token }) => {
  await request('PATCH', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
    + '/releases/' + releaseId, {
    token,
    body: {
      tag_name: tag,
      name: optionalEnv('GITEE_RELEASE_NAME') || tag,
      body: optionalEnv('GITEE_RELEASE_BODY') || latestJson.notes || ('Inspiration Drawer ' + latestJson.version),
      prerelease: optionalEnv('GITEE_PRERELEASE') || 'false',
    },
  });
};

const getAttachmentName = (attachment) => (
  (attachment && (attachment.name || attachment.filename || attachment.file_name))
  || decodeUrlAssetName(attachment && (attachment.browser_download_url || attachment.download_url || ''))
  || ''
);

const deleteAttachment = async ({ owner, repo, releaseId, attachmentId, token }) => {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  await request('DELETE', '/repos/' + encodedOwner + '/' + encodedRepo + '/releases/' + releaseId + '/attach_files/' + attachmentId, { token });
};

const uploadAsset = async ({ owner, repo, releaseId, filePath, uploadName, token, contents }) => {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const form = new FormData();
  const bytes = contents ?? fs.readFileSync(filePath);
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), uploadName);
  return await request('POST', '/repos/' + encodedOwner + '/' + encodedRepo + '/releases/' + releaseId + '/attach_files', {
    token,
    formData: form,
  });
};

const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const isNewerVersion = (left, right) => {
  const leftParts = left.split('.').map(BigInt);
  const rightParts = right.split('.').map(BigInt);
  const differingPart = leftParts.findIndex((part, index) => part !== rightParts[index]);
  return differingPart >= 0 && leftParts[differingPart] > rightParts[differingPart];
};

const fetchPublicReleaseAsset = async (url, allowMissing = false) => {
  const fresh = new URL(url);
  fresh.searchParams.set('sync', Date.now().toString());
  const response = await fetch(fresh, { signal: AbortSignal.timeout(60_000), cache: 'no-store' });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Cannot read published ${fresh.pathname}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const syncLatestDesktopIndex = async ({ owner, repo, token, expectedTag }) => {
  const repository = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
  let release;
  for (let attempt = 0; attempt < (expectedTag ? 6 : 1); attempt++) {
    release = await request('GET', repository + '/releases/latest', { query: { _: Date.now() } });
    const published = release?.tag_name?.slice(1);
    if (!expectedTag || release?.tag_name === expectedTag
      || stableVersionPattern.test(published || '') && isNewerVersion(published, expectedTag.slice(1))) break;
    if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 3000));
    else throw new Error(`Gitee published ${expectedTag}, but release discovery has not picked it up. Retry with --sync-latest.`);
  }
  const tag = release?.tag_name;
  const version = typeof tag === 'string' && tag.startsWith('v') ? tag.slice(1) : '';
  if (release?.prerelease !== false || !stableVersionPattern.test(version)) {
    throw new Error('Gitee latest release is not a stable desktop version.');
  }

  const downloadRoot = new URL(`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/download/`, apiBase);
  const versionRoot = new URL(tag + '/', downloadRoot);
  const fixedUrl = new URL('latest/latest.json', downloadRoot);
  const manifest = JSON.parse(await fetchPublicReleaseAsset(new URL('latest.json', versionRoot)));
  validateReleaseVersion(manifest, tag, versionRoot);
  const platform = getPlatform(manifest);
  const installer = decodeUrlAssetName(platform?.url);
  const names = new Set(release.assets?.map(getAttachmentName));
  if (!/\.(exe|msi|zip)$/i.test(installer) || !names.has(installer) || !names.has(installer + '.sig')) {
    throw new Error(`Gitee ${tag} is missing the installer or its signature; the fixed index was not changed.`);
  }

  normalizeLatestJsonForGitee(manifest, versionRoot.href.replace(/\/$/, ''), installer);
  const contents = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const previous = await fetchPublicReleaseAsset(fixedUrl, true);
  let alreadyCurrent = false;
  if (previous) {
    const previousManifest = JSON.parse(previous);
    if (!stableVersionPattern.test(previousManifest.version)) throw new Error('Published fixed index has an invalid version.');
    if (isNewerVersion(previousManifest.version, version)) {
      console.log(`Fixed index is already newer (${previousManifest.version}); skipping ${version}.`);
      return;
    }
    alreadyCurrent = JSON.stringify(previousManifest) === JSON.stringify(manifest);
    if (alreadyCurrent && !dryRun) {
      console.log(`Gitee desktop index is already current (${version}).`);
      return;
    }
  }

  const [installerContents, signature] = await Promise.all([
    fetchPublicReleaseAsset(new URL(encodeURIComponent(installer), versionRoot)),
    fetchPublicReleaseAsset(new URL(encodeURIComponent(installer) + '.sig', versionRoot)),
  ]);
  validateInstallerContents(manifest, installer, installerContents, signature.toString('utf8').trim());
  if (dryRun) {
    console.log(`Verified Gitee ${tag} installer and signature.`);
    console.log(alreadyCurrent ? `Fixed index already serves ${version}.` : `Would update latest/latest.json to ${version}.`);
    return;
  }

  const fixed = await request('GET', repository + '/releases/tags/latest', { token });
  const releaseId = getReleaseId(fixed);
  if (!releaseId) throw new Error('Gitee fixed update release is missing.');
  const target = { owner, repo, releaseId, token };
  const indexAttachments = async () => (await listReleaseAttachments(target)).filter(asset => getAttachmentName(asset) === 'latest.json');
  const attachments = await indexAttachments();
  const current = await fetchPublicReleaseAsset(fixedUrl, true);
  const indexUnchanged = previous && current ? previous.equals(current) : previous === current;
  if (attachments.length > 1 || Boolean(current) !== Boolean(attachments.length) || !indexUnchanged) {
    throw new Error('The fixed index changed during verification. Run synchronization again.');
  }
  if (attachments.length && optionalEnv('GITEE_OVERWRITE').toLowerCase() === 'false') {
    throw new Error('GITEE_OVERWRITE=false prevents replacing latest/latest.json.');
  }
  const old = attachments[0];
  if (old) {
    const attachmentId = old.id || old.attach_file_id;
    if (!attachmentId) throw new Error('Gitee fixed index attachment ID is missing.');
    await deleteAttachment({ ...target, attachmentId });
  }
  try {
    await uploadAsset({ ...target, uploadName: 'latest.json', contents });
  } catch (error) {
    if (current && !(await indexAttachments()).length) {
      await uploadAsset({ ...target, uploadName: 'latest.json', contents: current });
      console.warn('Restored the previous Gitee desktop index.');
    }
    throw error;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const publishedIndex = await fetchPublicReleaseAsset(fixedUrl, true);
    if (publishedIndex?.equals(contents)) {
      console.log(`Published and verified Gitee desktop index ${version}.`);
      return;
    }
    if (attempt < 4) await delay(2000);
  }
  throw new Error(`Gitee accepted the upload, but latest/latest.json has not returned ${version} yet.`);
};

const explainReleaseCreateFailure = async ({ owner, repo, token, error }) => {
  const message = String(error && (error.message || error));
  if (!/创建标签失败|target_commitish|target commitish|tag/i.test(message)) return;

  console.error('');
  console.error('Gitee could not create the release tag. This usually means the Gitee repository has no matching branch/commit yet.');
  const branches = await listRepositoryBranches({ owner, repo, token });
  const branchNames = branches
    .map(branch => branch && (branch.name || branch.branch_name))
    .filter(Boolean);
  if (branchNames.length > 0) {
    console.error('Branches visible on Gitee: ' + branchNames.join(', '));
    console.error('Try one of them, for example:');
    console.error('$env:GITEE_TARGET_COMMITISH="' + branchNames[0] + '"');
    console.error('npm run updater:sync:gitee');
  } else {
    console.error('No branches were visible on Gitee. Push this project to the Gitee repository first, then run upload again.');
    console.error('Example:');
    console.error('git remote add gitee https://gitee.com/' + owner + '/' + repo + '.git');
    console.error('git push gitee HEAD:master');
  }
  console.error('');
};

const main = async () => {
  const token = dryRun ? optionalEnv('GITEE_TOKEN') : requiredEnv('GITEE_TOKEN');
  const { owner, repo } = parseRepository();
  if (process.argv.includes('--sync-latest')) {
    await syncLatestDesktopIndex({ owner, repo, token });
    return;
  }
  if (process.argv.includes('--remaining')) {
    const channel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'integrations/rhino/update-channel.json'), 'utf8'));
    const plans = prepareRemainingGiteeUploads({ directory: distDir, owner, repo, channel });
    console.log('Verified remaining Gitee uploads; version-tag settings are not used in this mode.');
    for (const plan of plans) for (const file of plan.assets) console.log(`${path.relative(repoRoot, file.filePath)} -> ${plan.tag}/${file.uploadName}`);
    if (dryRun) { console.log('Dry run only. No files changed and no network requests performed.'); return; }
    await uploadRemainingGiteePlans(plans, {
      release: tag => findReleaseByTag({ owner, repo, tag, token }),
      attachments: releaseId => listReleaseAttachments({ owner, repo, releaseId, token }),
      name: getAttachmentName,
      remove: (releaseId, attachmentId) => deleteAttachment({ owner, repo, releaseId, attachmentId, token }),
      upload: (releaseId, file) => uploadAsset({ owner, repo, releaseId, token, ...file }),
      matches: async file => {
        const response = await fetch(file.mirrorUrl, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error('Cannot verify existing Rhino component: HTTP ' + response.status);
        return createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') === file.sha256;
      },
      overwrite: optionalEnv('GITEE_OVERWRITE').toLowerCase() !== 'false', log: console.log,
    });
    console.log('Remaining Gitee update channels uploaded successfully.');
    return;
  }
  const latestJson = readLatestJson();
  const tag = optionalEnv('GITEE_RELEASE_TAG')
    || parseReleaseTagFromBaseUrl()
    || (latestJson.version ? 'v' + latestJson.version : '');
  if (!tag) throw new Error('Missing release tag. Set GITEE_RELEASE_TAG.');

  const giteeBaseUrl = (
    optionalEnv('GITEE_RELEASE_BASE_URL')
    || optionalEnv('UPDATE_GITEE_BASE_URL')
    || ('https://gitee.com/' + owner + '/' + repo + '/releases/download/' + tag)
  ).replace(/\/+$/, '');

  validateReleaseVersion(latestJson, tag, giteeBaseUrl);

  const files = walkDistUpdaterAssets();
  const installerPath = getInstallerLocalPath(files, latestJson);
  const platform = getPlatform(latestJson);
  const giteeUrlFromManifest = Array.isArray(platform && platform.urls)
    ? ((platform.urls.find(entry => entry && /gitee\.com/i.test(entry.url)) || {}).url || '')
    : '';
  const installerUploadName = optionalEnv('GITEE_INSTALLER_ASSET_NAME')
    || decodeUrlAssetName(giteeUrlFromManifest)
    || decodeUrlAssetName(platform && platform.url)
    || encodeAssetName(path.basename(installerPath));
  const sigPath = installerPath + '.sig';
  validateInstaller(latestJson, installerPath, installerUploadName, sigPath);

  normalizeLatestJsonForGitee(latestJson, giteeBaseUrl, installerUploadName);

  const assets = [
    { filePath: installerPath, uploadName: installerUploadName },
    { filePath: sigPath, uploadName: installerUploadName + '.sig' },
    // Publish update metadata only after both signed installer assets are available.
    { filePath: latestPath, uploadName: 'latest.json' },
  ];

  console.log('Release assets directory: ' + distDir);
  console.log('Verified asset version: ' + latestJson.version);
  console.log('Gitee repository: ' + owner + '/' + repo);
  console.log('Gitee release tag: ' + tag);
  console.log('Gitee release base URL: ' + giteeBaseUrl);
  console.log('Assets to upload:');
  for (const asset of assets) {
    console.log('- ' + path.relative(repoRoot, asset.filePath) + ' -> ' + asset.uploadName);
  }

  if (dryRun) {
    console.log('Dry run only. No files changed and no network requests performed.');
    return;
  }

  fs.writeFileSync(latestPath, JSON.stringify(latestJson, null, 2) + '\n', 'utf8');

  let release = await findReleaseByTag({ owner, repo, tag, token });
  if (!release) {
    console.log('Release ' + tag + ' not found; creating it...');
    try {
      release = await createRelease({ owner, repo, tag, latestJson, token });
    } catch (error) {
      await explainReleaseCreateFailure({ owner, repo, token, error });
      throw error;
    }
  } else {
    console.log('Found existing release ' + tag + '.');
  }

  const releaseId = getReleaseId(release);
  if (!releaseId) throw new Error('Gitee release response did not include an id.');

  const overwrite = optionalEnv('GITEE_OVERWRITE').toLowerCase() !== 'false';
  const existingAttachments = await listReleaseAttachments({ owner, repo, releaseId, token });
  for (const asset of assets) {
    if (overwrite) {
      const existing = existingAttachments.filter(attachment => getAttachmentName(attachment) === asset.uploadName);
      for (const attachment of existing) {
        const attachmentId = attachment && (attachment.id || attachment.attach_file_id);
        if (!attachmentId) continue;
        console.log('Deleting existing attachment ' + asset.uploadName + '...');
        await deleteAttachment({ owner, repo, releaseId, attachmentId, token });
      }
    }

    console.log('Uploading ' + asset.uploadName + '...');
    await uploadAsset({ owner, repo, releaseId, filePath: asset.filePath, uploadName: asset.uploadName, token });
  }

  await updateRelease({ owner, repo, releaseId, tag, latestJson, token });
  console.log('Gitee Release upload complete.');
  if (optionalEnv('GITEE_PRERELEASE').toLowerCase() !== 'true' && stableVersionPattern.test(latestJson.version)) {
    await syncLatestDesktopIndex({ owner, repo, token, expectedTag: tag });
  }
};

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
