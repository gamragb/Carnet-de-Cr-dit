import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const configPath = path.join(root, 'src', 'config', 'updateConfig.ts');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(root, 'release');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = String(pkg.version || '1.0.0').trim();
const baseUrlArg = process.argv[2]?.trim()?.replace(/\/+$/, '') || '';

// Keep APP_VERSION in src/config/updateConfig.ts synced with package.json
const configSrc = readFileSync(configPath, 'utf8');
const syncedConfig = configSrc.replace(
  /export const APP_VERSION = '[^']+';/,
  `export const APP_VERSION = '${version}';`
);
if (syncedConfig !== configSrc) {
  writeFileSync(configPath, syncedConfig, 'utf8');
  console.log(`Synced APP_VERSION -> ${version}`);
}

console.log(`Building web bundle for v${version}...`);
execSync('npm run build', { stdio: 'inherit', cwd: root });

mkdirSync(releaseDir, { recursive: true });
const zipName = `bundle-${version}.zip`;
const zipPath = path.join(releaseDir, zipName);
if (existsSync(zipPath)) {
  rmSync(zipPath, { force: true });
}

if (process.platform === 'win32') {
  // Archive contents of dist/ with POSIX forward slashes so index.html sits directly at zip root
  const psScript = [
    'Add-Type -AssemblyName System.IO.Compression',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$src = (Resolve-Path '${distDir.replace(/'/g, "''")}').Path`,
    `$zip = [System.IO.Compression.ZipFile]::Open('${zipPath.replace(/'/g, "''")}', 'Create')`,
    'try {',
    '  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {',
    '    $rel = $_.FullName.Substring($src.Length).TrimStart([char]92, [char]47).Replace([char]92, [char]47)',
    '    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null',
    '  }',
    '} finally {',
    '  $zip.Dispose()',
    '}',
  ].join('\n');
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encoded], {
    stdio: 'inherit',
    cwd: root,
  });
} else {
  execSync(`cd "${distDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
}

const existingUpdatePath = path.join(root, 'public', 'update.json');
let baseManifest = {};
if (existsSync(existingUpdatePath)) {
  try {
    baseManifest = JSON.parse(readFileSync(existingUpdatePath, 'utf8'));
  } catch {
    baseManifest = {};
  }
}

const checksum = createHash('sha256').update(readFileSync(zipPath)).digest('hex');

const manifest = {
  ...baseManifest,
  version,
  minNativeVersion: baseManifest.minNativeVersion || '1.0.0',
  bundleUrl: baseUrlArg
    ? `${baseUrlArg}/${zipName}`
    : `https://gamragb.github.io/Carnet-de-Cr-dit/${zipName}`,
  checksum,
  playStoreUrl:
    baseManifest.playStoreUrl ||
    'https://play.google.com/store/apps/details?id=ma.carnetcredit.app',
  mandatory: false,
  notesFr: baseManifest.notesFr || `Mise à jour v${version} : améliorations et corrections.`,
  notesAr: baseManifest.notesAr || `تحديث جديد v${version}: تحسينات وإصلاحات.`,
};

const manifestOutPath = path.join(releaseDir, 'update.json');
const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(manifestOutPath, manifestJson, 'utf8');
const distUpdatePath = path.join(distDir, 'update.json');
if (existsSync(distDir)) {
  writeFileSync(distUpdatePath, manifestJson, 'utf8');
}

console.log('');
console.log('OTA release package generated successfully:');
console.log(`  - ${zipPath}`);
console.log(`  - ${manifestOutPath}`);
console.log(`  - SHA-256: ${checksum}`);
console.log('Upload BOTH files to your HTTPS host (Netlify / GitHub Pages / Releases).');
