import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = String(process.env.UPDATE_VERSION || packageJson.version || '').trim();
const bundleRoot = path.resolve(
  process.env.MACOS_BUNDLE_ROOT
    || path.join(repoRoot, 'src-tauri', 'target', 'aarch64-apple-darwin', 'release', 'bundle', 'macos'),
);
const previewZipPath = path.resolve(
  process.env.MACOS_PREVIEW_ZIP
    || path.join(repoRoot, 'Inspiration-Drawer-macOS-Preview.zip'),
);
const outputDir = path.join(repoRoot, 'dist-macos-updater');
const bucket = String(process.env.COS_BUCKET || '').trim();
const region = String(process.env.COS_REGION || '').trim();
const secretId = String(process.env.TENCENTCLOUD_SECRET_ID || '').trim();
const secretKey = String(process.env.TENCENTCLOUD_SECRET_KEY || '').trim();
const dryRun = process.env.MACOS_UPDATER_DRY_RUN === '1';

const requireValue = (value, name) => {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
};

const updaterArchives = walk(bundleRoot)
  .filter(file => file.endsWith('.app.tar.gz'))
  .sort((left, right) => left.localeCompare(right));
if (updaterArchives.length !== 1) {
  throw new Error(`Expected exactly one .app.tar.gz under ${bundleRoot}, found ${updaterArchives.length}`);
}

const sourceArchive = updaterArchives[0];
const sourceSignature = `${sourceArchive}.sig`;
if (!fs.isFileSync(sourceSignature)) {
  throw new Error(`Updater signature is missing: ${sourceSignature}`);
}
if (!fs.isFileSync(previewZipPath)) {
  throw new Error(`Preview ZIP is missing: ${previewZipPath}`);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid updater version: ${version}`);
}

const archiveName = `Inspiration.Drawer_${version}_aarch64.app.tar.gz`;
const signatureName = `${archiveName}.sig`;
const versionPrefix = `downloads/macos/preview/updates/v${version}`;
const archiveKey = `${versionPrefix}/${archiveName}`;
const signatureKey = `${versionPrefix}/${signatureName}`;
const manifestKey = 'downloads/macos/preview/latest.json';
const previewKey = 'downloads/macos/preview/Inspiration-Drawer-macOS-Preview.zip';
const cosHost = requireValue(
  process.env.COS_HOST || (bucket && region ? `${bucket}.cos.${region}.myqcloud.com` : ''),
  'COS_BUCKET/COS_REGION or COS_HOST',
);
const publicBaseUrl = String(process.env.COS_PUBLIC_BASE_URL || `https://${cosHost}`)
  .replace(/\/+$/, '');
const objectUrl = key => `${publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;

const archiveBytes = fs.readFileSync(sourceArchive);
const signature = fs.readFileSync(sourceSignature, 'utf8').trim();
if (!signature) throw new Error(`Updater signature is empty: ${sourceSignature}`);
const sha256 = crypto.createHash('sha256').update(archiveBytes).digest('hex').toUpperCase();
const notes = String(process.env.UPDATE_NOTES || `Inspiration Drawer macOS ${version}`);
const archiveUrl = objectUrl(archiveKey);
const signatureUrl = objectUrl(signatureKey);
const manifestUrl = objectUrl(manifestKey);
const previewUrl = objectUrl(previewKey);
const urls = [{ name: '腾讯云 COS', url: archiveUrl }];
const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature,
      url: archiveUrl,
      sha256,
      size: archiveBytes.length,
      urls,
    },
  },
};
const manifestBytes = Buffer.from(`${JSON.stringify(latest, null, 2)}\n`, 'utf8');

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(sourceArchive, path.join(outputDir, archiveName));
fs.copyFileSync(sourceSignature, path.join(outputDir, signatureName));
fs.writeFileSync(path.join(outputDir, 'latest.json'), manifestBytes);

const encodeRfc3986 = value => encodeURIComponent(value).replace(/[!'()*]/g, character => (
  `%${character.charCodeAt(0).toString(16).toUpperCase()}`
));
const encodedObjectPath = key => `/${key.split('/').map(encodeRfc3986).join('/')}`;
const hmacSha1 = (key, value) => crypto.createHmac('sha1', key).update(value).digest('hex');
const sha1 = value => crypto.createHash('sha1').update(value).digest('hex');

const createAuthorization = ({ method, key }) => {
  const start = Math.floor(Date.now() / 1000) - 60;
  const end = start + 3600;
  const keyTime = `${start};${end}`;
  const canonicalHeaders = `host=${encodeRfc3986(cosHost.toLowerCase())}`;
  const httpString = `${method.toLowerCase()}\n${encodedObjectPath(key)}\n\n${canonicalHeaders}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signKey = hmacSha1(secretKey, keyTime);
  const signatureValue = hmacSha1(signKey, stringToSign);
  return [
    'q-sign-algorithm=sha1',
    `q-ak=${encodeRfc3986(secretId)}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signatureValue}`,
  ].join('&');
};

const putObject = ({ key, bytes, contentType, cacheControl, contentDisposition }) => (
  new Promise((resolve, reject) => {
    const headers = {
      Authorization: createAuthorization({ method: 'PUT', key }),
      'Cache-Control': cacheControl,
      'Content-Length': bytes.length,
      'Content-Type': contentType,
      Host: cosHost,
    };
    if (contentDisposition) headers['Content-Disposition'] = contentDisposition;
    const request = https.request({
      hostname: cosHost,
      method: 'PUT',
      path: encodedObjectPath(key),
      headers,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').trim();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }
        reject(new Error(`COS PUT ${key} failed with HTTP ${response.statusCode}: ${body.slice(0, 500)}`));
      });
    });
    request.on('error', reject);
    request.end(bytes);
  })
);

const verifyPublicObject = ({ key, expectedLength }) => new Promise((resolve, reject) => {
  const verificationUrl = `${objectUrl(key)}?verify=${Date.now()}`;
  const request = https.request(verificationUrl, { method: 'HEAD' }, response => {
    response.resume();
    response.on('end', () => {
      if (response.statusCode !== 200) {
        reject(new Error(`Public HEAD ${key} returned HTTP ${response.statusCode}`));
        return;
      }
      const actualLength = Number(response.headers['content-length'] || 0);
      if (expectedLength > 0 && actualLength !== expectedLength) {
        reject(new Error(`Public HEAD ${key} length mismatch: expected ${expectedLength}, received ${actualLength}`));
        return;
      }
      resolve();
    });
  });
  request.on('error', reject);
  request.end();
});

console.log(`Prepared macOS updater ${version}:`);
console.log(`- ${path.relative(repoRoot, path.join(outputDir, archiveName))}`);
console.log(`- ${path.relative(repoRoot, path.join(outputDir, signatureName))}`);
console.log(`- ${path.relative(repoRoot, path.join(outputDir, 'latest.json'))}`);
console.log(`- sha256: ${sha256}`);
console.log(`- size: ${archiveBytes.length}`);

if (!dryRun) {
  requireValue(secretId, 'TENCENTCLOUD_SECRET_ID');
  requireValue(secretKey, 'TENCENTCLOUD_SECRET_KEY');

  // Publish immutable, versioned payloads first. The manifest goes last so a
  // client can never observe a release whose package has not finished uploading.
  await putObject({
    key: archiveKey,
    bytes: archiveBytes,
    contentType: 'application/gzip',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  await putObject({
    key: signatureKey,
    bytes: fs.readFileSync(sourceSignature),
    contentType: 'text/plain; charset=utf-8',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  await putObject({
    key: previewKey,
    bytes: fs.readFileSync(previewZipPath),
    contentType: 'application/zip',
    cacheControl: 'public, max-age=300',
    contentDisposition: 'attachment; filename="Inspiration-Drawer-macOS-Preview.zip"',
  });
  await putObject({
    key: manifestKey,
    bytes: manifestBytes,
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'no-cache, no-store, must-revalidate',
  });

  await verifyPublicObject({ key: archiveKey, expectedLength: archiveBytes.length });
  await verifyPublicObject({ key: signatureKey, expectedLength: fs.statSync(sourceSignature).size });
  await verifyPublicObject({ key: previewKey, expectedLength: fs.statSync(previewZipPath).size });
  await verifyPublicObject({ key: manifestKey, expectedLength: manifestBytes.length });
  console.log('Published and publicly verified all COS objects.');
} else {
  console.log('Dry run: COS upload skipped.');
}

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  fs.appendFileSync(githubOutput, [
    `archive_url=${archiveUrl}`,
    `signature_url=${signatureUrl}`,
    `manifest_url=${manifestUrl}`,
    `preview_url=${previewUrl}`,
    `version=${version}`,
    '',
  ].join('\n'));
}

console.log(`Updater manifest: ${manifestUrl}`);
console.log(`Preview ZIP: ${previewUrl}`);
