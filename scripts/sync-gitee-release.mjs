#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const distDir = path.join(repoRoot, 'dist-updater');
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
    throw new Error('Missing ' + path.relative(repoRoot, latestPath) + '. Run npm run updater:prepare first.');
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

const getInstallerLocalPath = (files) => {
  const candidates = files
    .filter(file => path.basename(file) !== 'latest.json')
    .filter(file => !file.endsWith('.sig'))
    .filter(file => /\.(exe|msi|zip)$/i.test(file));
  if (candidates.length === 0) throw new Error('No installer asset found in dist-updater.');
  candidates.sort((left, right) => {
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
  return candidates[0];
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

  fs.writeFileSync(latestPath, JSON.stringify(latestJson, null, 2) + '\n', 'utf8');
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

const getReleaseAttachments = (release) => {
  const arrays = [
    release && release.assets,
    release && release.attach_files,
    release && release.attachments,
  ].filter(Array.isArray);
  return arrays.flat();
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

const uploadAsset = async ({ owner, repo, releaseId, filePath, uploadName, token }) => {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const form = new FormData();
  const bytes = fs.readFileSync(filePath);
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), uploadName);
  return await request('POST', '/repos/' + encodedOwner + '/' + encodedRepo + '/releases/' + releaseId + '/attach_files', {
    token,
    formData: form,
  });
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
  const token = requiredEnv('GITEE_TOKEN');
  const { owner, repo } = parseRepository();
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

  const files = walkDistUpdaterAssets();
  const installerPath = getInstallerLocalPath(files);
  const platform = getPlatform(latestJson);
  const giteeUrlFromManifest = Array.isArray(platform && platform.urls)
    ? ((platform.urls.find(entry => entry && /gitee\.com/i.test(entry.url)) || {}).url || '')
    : '';
  const installerUploadName = optionalEnv('GITEE_INSTALLER_ASSET_NAME')
    || decodeUrlAssetName(giteeUrlFromManifest)
    || decodeUrlAssetName(platform && platform.url)
    || encodeAssetName(path.basename(installerPath));
  const sigPath = installerPath + '.sig';
  if (!fs.existsSync(sigPath)) throw new Error('Missing installer signature: ' + path.relative(repoRoot, sigPath));

  normalizeLatestJsonForGitee(latestJson, giteeBaseUrl, installerUploadName);

  const assets = [
    { filePath: latestPath, uploadName: 'latest.json' },
    { filePath: installerPath, uploadName: installerUploadName },
    { filePath: sigPath, uploadName: installerUploadName + '.sig' },
  ];

  console.log('Gitee repository: ' + owner + '/' + repo);
  console.log('Gitee release tag: ' + tag);
  console.log('Gitee release base URL: ' + giteeBaseUrl);
  console.log('Assets to upload:');
  for (const asset of assets) {
    console.log('- ' + path.relative(repoRoot, asset.filePath) + ' -> ' + asset.uploadName);
  }

  if (dryRun) {
    console.log('Dry run only. No network mutation performed.');
    return;
  }

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
  const existingAttachments = getReleaseAttachments(release);
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

  console.log('Gitee Release upload complete.');
};

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
