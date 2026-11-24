import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixtureDirectories = [];
const servers = [];
const assetName = (version = '8.0.28') => `Inspiration.Drawer_${version}_x64-setup.exe`;

const fixture = (version = '8.0.28') => {
  const directory = mkdtempSync(path.join(tmpdir(), 'inspiration-gitee-release-'));
  fixtureDirectories.push(directory);
  const bytes = Buffer.from(`test installer ${version}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const manifest = {
    version, notes: `# Inspiration Drawer ${version}`, sha256, size: bytes.length,
    platforms: { 'windows-x86_64': {
      signature: 'fixture-signature', sha256, size: bytes.length,
      url: `https://github.com/example/app/releases/download/v${version}/${assetName(version)}`,
    } },
  };
  writeFileSync(path.join(directory, assetName(version)), bytes);
  writeFileSync(path.join(directory, assetName(version) + '.sig'), 'fixture-signature\n');
  const saveManifest = () => writeFileSync(path.join(directory, 'latest.json'), JSON.stringify(manifest));
  saveManifest();
  return { directory, manifest, saveManifest };
};

const runSync = (directory, overrides = {}, dryRun = true, args = []) => {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith('GITEE_') && key !== 'UPDATE_GITEE_BASE_URL'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/sync-gitee-release.mjs', ...args, ...(dryRun ? ['--dry-run'] : [])], {
      cwd: repoRoot,
      env: {
        ...env, GITEE_OWNER: 'fixture-owner', GITEE_REPO: 'fixture-repo',
        GITEE_RELEASE_TAG: 'v8.0.28', GITEE_DIST_DIR: directory,
        GITEE_API_BASE_URL: 'http://127.0.0.1:1/api/v5', ...overrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
  for (const directory of fixtureDirectories.splice(0)) {
    const absolute = path.resolve(directory);
    if (path.dirname(absolute) !== path.resolve(tmpdir()) || !path.basename(absolute).startsWith('inspiration-gitee-release-')) {
      throw new Error('Refusing to remove a directory outside the generated test fixtures.');
    }
    rmSync(absolute, { recursive: true, force: true });
  }
});

describe('Gitee release asset preflight', () => {
  it('refuses to put the previous version installer under a new tag before any local or remote mutation', async () => {
    const f = fixture('8.0.27');
    const before = readFileSync(path.join(f.directory, 'latest.json'), 'utf8');
    const result = await runSync(f.directory);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('v8.0.28 does not match latest.json version 8.0.27');
    expect(result.stderr).toContain('GITEE_DIST_DIR');
    expect(result.stdout).not.toContain('Uploading');
    expect(readFileSync(path.join(f.directory, 'latest.json'), 'utf8')).toBe(before);
  });

  it('also rejects a mismatched tag inferred from the mirror URL', async () => {
    const f = fixture('8.0.27');
    const result = await runSync(f.directory, {
      GITEE_RELEASE_TAG: '', GITEE_RELEASE_BASE_URL: 'https://gitee.com/owner/repo/releases/download/v8.0.28',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('does not match latest.json version 8.0.27');
  });

  it('refuses a stale mirror base URL even when the selected files match the tag', async () => {
    const f = fixture();
    const result = await runSync(f.directory, {
      GITEE_RELEASE_BASE_URL: 'https://gitee.com/owner/repo/releases/download/v8.0.27',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('URL tag v8.0.27 does not match requested tag v8.0.28');
  });

  it('does not confuse version 8.0.280 with 8.0.28', async () => {
    const f = fixture();
    renameSync(path.join(f.directory, assetName()), path.join(f.directory, assetName('8.0.280')));
    const result = await runSync(f.directory);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No installer asset for latest.json version 8.0.28');
  });

  it('rejects a stale upload filename override', async () => {
    const f = fixture();
    const result = await runSync(f.directory, { GITEE_INSTALLER_ASSET_NAME: assetName('8.0.27') });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('does not match release version 8.0.28');
  });

  it('rejects a signature file from a different release', async () => {
    const f = fixture();
    writeFileSync(path.join(f.directory, assetName() + '.sig'), 'old-signature');
    const result = await runSync(f.directory);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('signature file does not match latest.json');
  });

  it('rejects modified installer bytes', async () => {
    const f = fixture();
    writeFileSync(path.join(f.directory, assetName()), 'corrupted installer');
    const result = await runSync(f.directory);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('SHA256 does not match latest.json');
  });

  it('checks both top-level and platform checksums', async () => {
    const f = fixture();
    f.manifest.platforms['windows-x86_64'].sha256 = '0'.repeat(64);
    f.saveManifest();
    const result = await runSync(f.directory);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('SHA256 does not match latest.json');
  });

  it('rejects a stale manifest size', async () => {
    const f = fixture();
    f.manifest.size++;
    f.saveManifest();
    const result = await runSync(f.directory);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('size does not match latest.json');
  });

  it('previews a valid release without a token, network access or modifying latest.json', async () => {
    const f = fixture();
    const before = readFileSync(path.join(f.directory, 'latest.json'), 'utf8');
    const result = await runSync(f.directory);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Verified asset version: 8.0.28');
    expect(result.stdout).toContain('No files changed and no network requests performed');
    expect(readFileSync(path.join(f.directory, 'latest.json'), 'utf8')).toBe(before);
    expect(result.stdout.indexOf(' -> latest.json')).toBeGreaterThan(result.stdout.indexOf(' -> ' + assetName() + '.sig'));
  });

  it('selects the matching installer from a directory containing several releases', async () => {
    const f = fixture();
    writeFileSync(path.join(f.directory, assetName('8.0.27')), 'old');
    const result = await runSync(f.directory);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(assetName());
    expect(result.stdout).not.toContain(assetName('8.0.27'));
  });
});

const startApi = async (failInstaller = false) => {
  const requests = [];
  const prefix = '/api/v5/repos/fixture-owner/fixture-repo/releases';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    const method = req.method || 'GET';
    requests.push({ method, pathname: url.pathname, body });
    res.setHeader('content-type', 'application/json');
    if (method === 'GET' && url.pathname === prefix + '/tags/v8.0.28') {
      res.end(JSON.stringify({ id: 17, tag_name: 'v8.0.28', body: '# Inspiration Drawer 8.0.27' }));
    } else if (method === 'GET' && url.pathname === prefix + '/17/attach_files') {
      res.end(JSON.stringify([{ id: 7, name: assetName('8.0.27') }, { id: 8, name: 'latest.json' }]));
    } else if (method === 'DELETE' && url.pathname === prefix + '/17/attach_files/8') {
      res.statusCode = 204; res.end();
    } else if (method === 'POST' && url.pathname === prefix + '/17/attach_files') {
      res.statusCode = failInstaller && body.includes(`filename="${assetName()}"`) ? 500 : 201;
      res.end(JSON.stringify({ id: 21 }));
    } else if (method === 'PATCH' && url.pathname === prefix + '/17') {
      res.end(JSON.stringify({ id: 17 }));
    } else {
      res.statusCode = 500; res.end(JSON.stringify({ message: 'Unexpected test API call' }));
    }
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock server did not get a TCP port.');
  return { requests, apiBase: `http://127.0.0.1:${address.port}/api/v5` };
};

describe('Gitee release upload sequencing (local mock API only)', () => {
  it('lists real release attachments, replaces matching metadata last and refreshes existing release notes', async () => {
    const f = fixture();
    const api = await startApi();
    const result = await runSync(f.directory, { GITEE_TOKEN: 'local-test-only', GITEE_API_BASE_URL: api.apiBase }, false);
    expect(result.code, result.stderr).toBe(0);
    const uploads = api.requests.filter(r => r.method === 'POST');
    expect(uploads.map(r => r.body.match(/filename="([^"]+)"/)?.[1])).toEqual([assetName(), assetName() + '.sig', 'latest.json']);
    const manifestUpload = uploads[2].body;
    expect(manifestUpload).toContain('"version": "8.0.28"');
    expect(manifestUpload).toContain('/releases/download/v8.0.28/');
    expect(api.requests.filter(r => r.method === 'DELETE').map(r => r.pathname.split('/').pop())).toEqual(['8']);
    const update = api.requests.find(r => r.method === 'PATCH');
    expect(update).toBeDefined();
    const fields = new URLSearchParams(update.body);
    expect(fields.get('tag_name')).toBe('v8.0.28');
    expect(fields.get('body')).toBe('# Inspiration Drawer 8.0.28');
    expect(api.requests[api.requests.length - 1]?.method).toBe('PATCH');
  });

  it('does not replace published update metadata when the installer upload fails', async () => {
    const f = fixture();
    const api = await startApi(true);
    const result = await runSync(f.directory, { GITEE_TOKEN: 'local-test-only', GITEE_API_BASE_URL: api.apiBase }, false);
    expect(result.code).toBe(1);
    expect(api.requests.filter(r => r.method === 'POST')).toHaveLength(1);
    expect(api.requests.some(r => r.method === 'DELETE' || r.method === 'PATCH')).toBe(false);
  });
});

const startIndexApi = async (f, { previousVersion = '8.0.27', corrupt = false, prerelease = false, failOnce = false } = {}) => {
  let previous = JSON.stringify({ version: previousVersion });
  const writes = [];
  const prefix = '/api/v5/repos/fixture-owner/fixture-repo/releases';
  const downloads = '/fixture-owner/fixture-repo/releases/download/';
  const files = [assetName(), assetName() + '.sig', 'latest.json'];
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET') {
      if (pathname === prefix + '/latest') {
        return res.end(JSON.stringify({ tag_name: 'v8.0.28', prerelease, assets: files.map(name => ({ name })) }));
      }
      if (pathname === prefix + '/tags/latest') return res.end(JSON.stringify({ id: 42 }));
      if (pathname === prefix + '/42/attach_files') return res.end(JSON.stringify(previous ? [{ id: 3, name: 'latest.json' }] : []));
      if (pathname === downloads + 'latest/latest.json') return res.writeHead(previous ? 200 : 404).end(previous);
      const file = pathname.slice((downloads + 'v8.0.28/').length);
      if (pathname.startsWith(downloads + 'v8.0.28/') && files.includes(file)) {
        return res.end(corrupt && file === assetName() ? 'corrupted' : readFileSync(path.join(f.directory, file)));
      }
    }
    if (req.method === 'DELETE' && pathname === prefix + '/42/attach_files/3') {
      writes.push('delete');
      previous = null;
      return res.writeHead(204).end();
    }
    if (req.method === 'POST' && pathname === prefix + '/42/attach_files') {
      writes.push('upload');
      let body = '';
      for await (const chunk of req) body += chunk.toString();
      if (failOnce && writes.length === 2) return res.writeHead(500).end();
      previous = body.split('\r\n\r\n')[1].split('\r\n')[0];
      return res.writeHead(201).end(JSON.stringify({ id: 3 }));
    }
    res.writeHead(500).end('Unexpected test request: ' + pathname);
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const run = () => runSync(f.directory, {
    GITEE_TOKEN: 'local-test-only', GITEE_API_BASE_URL: `http://127.0.0.1:${server.address().port}/api/v5`,
  }, false, ['--sync-latest']);
  return { run, writes, current: () => JSON.parse(previous) };
};

describe('Gitee fixed index follows the manually published stable release', () => {
  it('only writes the fixed index, puts Gitee first, and skips an unchanged index', async () => {
    const api = await startIndexApi(fixture());
    const result = await api.run();
    expect(result.code, result.stderr).toBe(0);
    expect(api.current().version).toBe('8.0.28');
    expect(api.current().urls[0].url).toContain('/fixture-owner/fixture-repo/releases/download/v8.0.28/');
    expect(api.current().platforms['windows-x86_64'].signature).toBe('fixture-signature');
    expect((await api.run()).stdout).toContain('already current');
    expect(api.writes).toEqual(['delete', 'upload']);
  });

  it.each([{ corrupt: true }, { prerelease: true }])('leaves the current index when the version is invalid (%o)', async options => {
    const api = await startIndexApi(fixture(), options);
    expect((await api.run()).code).toBe(1);
    expect(api.writes).toEqual([]);
  });

  it('never moves the fixed index back to an older version', async () => {
    const api = await startIndexApi(fixture(), { previousVersion: '9.0.0' });
    expect((await api.run()).stdout).toContain('already newer');
    expect(api.writes).toEqual([]);
  });

  it('restores the previous index when replacing the attachment fails', async () => {
    const api = await startIndexApi(fixture(), { failOnce: true });
    expect((await api.run()).code).toBe(1);
    expect(api.writes).toEqual(['delete', 'upload', 'upload']);
    expect(api.current().version).toBe('8.0.27');
  });
});
