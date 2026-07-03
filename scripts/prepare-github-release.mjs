import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const bundleRoot = path.join(repoRoot, 'src-tauri', 'target', 'release', 'bundle');
const outputDir = path.join(repoRoot, 'dist-updater');

const version = process.argv[2] || process.env.UPDATE_VERSION;
if (!version) {
  console.error('Usage: node scripts/prepare-github-release.mjs <version>');
  process.exit(1);
}

const detectGitHubRepo = () => {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  if (process.env.UPDATE_GITHUB_REPO) return process.env.UPDATE_GITHUB_REPO;

  try {
    const remote = execSync('git remote get-url origin', { cwd: repoRoot, encoding: 'utf8' }).trim();
    const match = remote.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/i);
    if (match) return match[1];
  } catch {
    // fall through to the explicit default below
  }

  return 'jiuqu1122-ops/inspiration-drawer';
};

const githubRepo = detectGitHubRepo();
const releaseTag = process.env.GITHUB_RELEASE_TAG || `v${version}`;
const baseUrl = (process.env.GITHUB_RELEASE_BASE_URL || `https://github.com/${githubRepo}/releases/download/${releaseTag}`).replace(/\/+$/, '');
const giteeBaseUrl = (
  process.env.GITEE_RELEASE_BASE_URL
  || process.env.UPDATE_GITEE_BASE_URL
  || ''
).replace(/\/+$/, '');
const notes = process.env.UPDATE_NOTES || `Inspiration Drawer ${version}`;

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
};

const files = walk(bundleRoot);
const signatureFiles = files
  .filter(file => file.endsWith('.sig'))
  .sort((left, right) => {
    const score = (file) => {
      const normalized = file.replaceAll('\\', '/').toLowerCase();
      const versionScore = path.basename(normalized).includes(version.toLowerCase()) ? 0 : 100;
      if (normalized.includes('/nsis/') && normalized.includes('.nsis.zip.sig')) return versionScore + 0;
      if (normalized.includes('/nsis/')) return versionScore + 1;
      if (normalized.includes('/msi/')) return versionScore + 2;
      return versionScore + 3;
    };
    return score(left) - score(right) || left.localeCompare(right);
  });

if (signatureFiles.length === 0) {
  console.error(`No updater signature files found under ${bundleRoot}. Run a signed Tauri build first.`);
  process.exit(1);
}

const signaturePath = signatureFiles[0];
const artifactPath = signaturePath.slice(0, -'.sig'.length);
if (!fs.existsSync(artifactPath)) {
  console.error(`Signature found but artifact is missing: ${artifactPath}`);
  process.exit(1);
}

const artifactName = path.basename(artifactPath);
const githubAssetName = artifactName.replace(/\s+/g, '.');
const artifactUrlName = encodeURIComponent(githubAssetName);
const signature = fs.readFileSync(signaturePath, 'utf8').trim();
const artifactBytes = fs.readFileSync(artifactPath);
const sha256 = crypto.createHash('sha256').update(artifactBytes).digest('hex').toUpperCase();
const size = artifactBytes.length;
const urls = [
  ...(giteeBaseUrl
    ? [{
        name: 'Gitee 国内镜像',
        url: `${giteeBaseUrl}/${artifactUrlName}`,
      }]
    : []),
  {
    name: 'GitHub Release',
    url: `${baseUrl}/${artifactUrlName}`,
  },
];
const latestJson = {
  version,
  notes,
  sha256,
  size,
  urls,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `${baseUrl}/${artifactUrlName}`,
      sha256,
      size,
      urls,
    },
  },
};

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(artifactPath, path.join(outputDir, artifactName));
fs.copyFileSync(signaturePath, path.join(outputDir, `${artifactName}.sig`));
fs.writeFileSync(path.join(outputDir, 'latest.json'), `${JSON.stringify(latestJson, null, 2)}\n`, 'utf8');

console.log(`Prepared updater files in ${path.relative(repoRoot, outputDir)}:`);
console.log(`- latest.json`);
console.log(`- ${artifactName}`);
console.log(`- ${artifactName}.sig`);
console.log(`- sha256: ${sha256}`);
console.log(`- size: ${size}`);
console.log('');
console.log(`Create or edit GitHub Release ${releaseTag}, then upload these assets:`);
console.log(`- dist-updater/latest.json`);
console.log(`- dist-updater/${artifactName} (GitHub asset name will be ${githubAssetName})`);
console.log(`- dist-updater/${artifactName}.sig (GitHub asset name will be ${githubAssetName}.sig)`);
console.log('');
if (giteeBaseUrl) {
  console.log('Gitee Release mirror is included in latest.json:');
  console.log(`- ${giteeBaseUrl}/${artifactUrlName}`);
  console.log('Upload the same installer asset to that Gitee Release URL.');
} else {
  console.log('Optional Gitee Release mirror: set GITEE_RELEASE_BASE_URL before running this script, e.g.');
  console.log('- GITEE_RELEASE_BASE_URL=https://gitee.com/<owner>/<repo>/releases/download/v' + version);
}
console.log('');
console.log('Optional China metadata mirror: upload dist-updater/latest.json to:');
console.log('- http://theh8grtf.hn-bkt.clouddn.com/inspiration-drawer/latest.json');
