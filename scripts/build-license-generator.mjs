import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function stopRunningGenerator() {
  if (process.platform !== 'win32') return;

  const result = spawnSync('taskkill.exe', ['/IM', 'license-generator-app.exe', '/F', '/T'], {
    cwd: root,
    stdio: 'ignore',
  });

  if (result.status === 0) {
    console.log('Stopped running license-generator-app.exe before rebuilding.');
  }
}

stopRunningGenerator();

if (process.platform === 'win32') {
  run('cmd.exe', ['/d', '/s', '/c', 'npm run license-generator:frontend']);
} else {
  run('npm', ['run', 'license-generator:frontend']);
}

const generatorConfigPath = resolve(root, 'src-tauri', 'tauri.generator.conf.json');
const tauriConfig = readFileSync(generatorConfigPath, 'utf8');
const generatorTargetDir = resolve(root, 'src-tauri', 'target', 'license-generator-cargo');

run('cargo', [
  'build',
  '--manifest-path',
  resolve(root, 'src-tauri', 'Cargo.toml'),
  '--target-dir',
  generatorTargetDir,
  '--profile',
  'generator',
  '--bin',
  'license-generator-app',
  '--features',
  'tauri/custom-protocol,license-generator-app',
], {
  env: {
    ...process.env,
    TAURI_CONFIG: tauriConfig,
  },
});

const builtExe = resolve(generatorTargetDir, 'generator', 'license-generator-app.exe');
const stableExe = resolve(root, 'src-tauri', 'target', 'generator', 'license-generator-app.exe');
const releaseMirrorExe = resolve(root, 'src-tauri', 'target', 'release', 'license-generator-app.exe');
mkdirSync(dirname(stableExe), { recursive: true });
mkdirSync(dirname(releaseMirrorExe), { recursive: true });

copyFileSync(builtExe, stableExe);
console.log('\nBuilt stable license generator at src-tauri\\target\\generator\\license-generator-app.exe');

try {
  copyFileSync(builtExe, releaseMirrorExe);
  console.log('Mirrored convenience exe to src-tauri\\target\\release\\license-generator-app.exe');
} catch (error) {
  console.warn(
    'Could not mirror to src-tauri\\target\\release\\license-generator-app.exe. ' +
    'Use the stable src-tauri\\target\\generator\\license-generator-app.exe path instead.'
  );
  console.warn(error.message);
}
