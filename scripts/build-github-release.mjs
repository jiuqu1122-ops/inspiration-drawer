import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
  || path.join(os.homedir(), '.tauri', 'inspiration-drawer-updater.key');

if (!fs.existsSync(keyPath)) {
  console.error(`Updater signing key not found: ${keyPath}`);
  console.error('Generate it first with: npm run tauri -- signer generate --ci -w "%USERPROFILE%\\.tauri\\inspiration-drawer-updater.key"');
  process.exit(1);
}

const run = (command, args, options = {}) => {
  const isWindowsNpm = process.platform === 'win32' && command === 'npm';
  const executable = isWindowsNpm ? `npm.cmd ${args.join(' ')}` : command;
  const result = spawnSync(executable, isWindowsNpm ? [] : args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: isWindowsNpm,
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY_PATH: keyPath,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '',
      CI: process.env.CI || 'true',
      ...options.env,
    },
  });

  if (result.error) {
    console.error(`Failed to run ${command}:`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = process.argv[2] || process.env.UPDATE_VERSION || pkg.version;
const privateKey = fs.readFileSync(keyPath, 'utf8');

run('npm', ['run', 'tauri', '--', 'build'], {
  env: {
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
  },
});
run(process.execPath, ['scripts/prepare-github-release.mjs', version]);
