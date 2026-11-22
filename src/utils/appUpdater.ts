import {
  APP_VERSION,
  DEFAULT_PLAY_STORE_URL,
  NATIVE_BINARY_VERSION,
} from '../config/updateConfig.ts';
import type { AppLanguage } from '../types/ledger.ts';
import { isNativeApp } from './nativePlatform.ts';

export interface UpdateManifest {
  version: string;
  minNativeVersion?: string;
  bundleUrl?: string;
  checksum?: string;
  apkUrl?: string;
  playStoreUrl?: string;
  mandatory?: boolean;
  notesFr?: string;
  notesAr?: string;
}

export type UpdateInstallMode = 'ota' | 'external' | 'pwa' | 'none';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  installMode: UpdateInstallMode;
  manifest: UpdateManifest;
  externalUrl?: string;
}

function parseSemverParts(raw: string): [number, number, number] | null {
  const cleaned = raw.trim().replace(/^v/i, '').split('-')[0];
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * Returns > 0 if `a > b`, < 0 if `a < b`, 0 if equal (or invalid).
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

export function isValidUpdateUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function parseUpdateManifest(
  raw: unknown,
  lang: AppLanguage = 'fr'
): UpdateManifest {
  const isAr = lang === 'ar';
  if (!raw || typeof raw !== 'object') {
    throw new Error(
      isAr ? 'ملف التحديث update.json غير صالح.' : 'Manifeste update.json invalide.'
    );
  }
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === 'string' ? obj.version.trim() : '';
  if (!version || !parseSemverParts(version)) {
    throw new Error(
      isAr
        ? 'رقم الإصدار في ملف التحديث غير صحيح.'
        : 'Numéro de version invalide dans le manifeste.'
    );
  }

  const bundleUrl =
    typeof obj.bundleUrl === 'string' && isValidUpdateUrl(obj.bundleUrl)
      ? obj.bundleUrl.trim()
      : undefined;
  const rawChecksum =
    typeof obj.checksum === 'string' ? obj.checksum.trim().toLowerCase() : '';
  const checksum = /^[a-f0-9]{64}$/.test(rawChecksum) ? rawChecksum : undefined;
  const apkUrl =
    typeof obj.apkUrl === 'string' && isValidUpdateUrl(obj.apkUrl)
      ? obj.apkUrl.trim()
      : undefined;
  const playStoreUrl =
    typeof obj.playStoreUrl === 'string' && isValidUpdateUrl(obj.playStoreUrl)
      ? obj.playStoreUrl.trim()
      : undefined;

  return {
    version,
    minNativeVersion:
      typeof obj.minNativeVersion === 'string' && parseSemverParts(obj.minNativeVersion)
        ? obj.minNativeVersion.trim()
        : undefined,
    bundleUrl,
    checksum,
    apkUrl,
    playStoreUrl,
    mandatory: Boolean(obj.mandatory),
    notesFr: typeof obj.notesFr === 'string' ? obj.notesFr.trim() : undefined,
    notesAr: typeof obj.notesAr === 'string' ? obj.notesAr.trim() : undefined,
  };
}

/**
 * Must be called shortly after boot inside Capacitor so `@capgo/capacitor-updater`
 * confirms the active OTA bundle booted successfully and does not roll back.
 */
export async function notifyNativeAppReady(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // Ignore outside native shell
  }
}

export async function getRunningAppVersion(): Promise<string> {
  if (!isNativeApp()) return APP_VERSION;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const current = await CapacitorUpdater.current();
    const bundleVer = current?.bundle?.version;
    if (bundleVer && bundleVer !== 'builtin' && parseSemverParts(bundleVer)) {
      return compareSemver(bundleVer, APP_VERSION) >= 0 ? bundleVer : APP_VERSION;
    }
  } catch {
    // Fallback to compiled APP_VERSION
  }
  return APP_VERSION;
}

export async function checkForAppUpdate(
  manifestUrl: string,
  currentVersion: string = APP_VERSION,
  lang: AppLanguage = 'fr'
): Promise<UpdateCheckResult> {
  const isAr = lang === 'ar';
  const cleanUrl = manifestUrl.trim();
  if (!isValidUpdateUrl(cleanUrl)) {
    throw new Error(
      isAr
        ? 'رابط التحديث غير صالح (يجب أن يبدأ بـ https://).'
        : 'URL de mise à jour invalide (doit commencer par https://).'
    );
  }

  const sep = cleanUrl.includes('?') ? '&' : '?';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  let response: Response;
  try {
    response = await fetch(`${cleanUrl}${sep}t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      isAr
        ? 'تعذر الاتصال بخادم التحديثات. تحقق من الإنترنت والرابط.'
        : 'Impossible de joindre le serveur de mise à jour. Vérifiez votre connexion.'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      isAr
        ? `فشل تحميل ملف التحديث (HTTP ${response.status}).`
        : `Échec du chargement du manifeste (HTTP ${response.status}).`
    );
  }

  const raw = (await response.json()) as unknown;
  const manifest = parseUpdateManifest(raw, lang);
  const hasUpdate = compareSemver(manifest.version, currentVersion) > 0;

  let installMode: UpdateInstallMode = 'none';
  let externalUrl: string | undefined;

  if (hasUpdate) {
    const native = isNativeApp();
    const nativeCompatible =
      !manifest.minNativeVersion ||
      compareSemver(NATIVE_BINARY_VERSION, manifest.minNativeVersion) >= 0;

    if (native && manifest.bundleUrl && nativeCompatible) {
      installMode = 'ota';
    } else if (native && (manifest.playStoreUrl || manifest.apkUrl)) {
      installMode = 'external';
      externalUrl = manifest.playStoreUrl || manifest.apkUrl || DEFAULT_PLAY_STORE_URL;
    } else if (!native) {
      installMode = 'pwa';
      externalUrl = manifest.playStoreUrl || manifest.apkUrl;
    } else if (manifest.bundleUrl) {
      // Fallback when minNativeVersion requires newer shell but no store link provided
      installMode = 'external';
      externalUrl = DEFAULT_PLAY_STORE_URL;
    }
  }

  return {
    currentVersion,
    latestVersion: manifest.version,
    hasUpdate,
    installMode,
    manifest,
    externalUrl,
  };
}

async function computeRemoteBundleSha256(bundleUrl: string): Promise<string> {
  const sep = bundleUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${bundleUrl}${sep}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('SHA-256 checksum missing in update.json');
}

export async function installNativeOtaUpdate(
  bundleUrl: string,
  version: string,
  checksum?: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (!isNativeApp()) {
    throw new Error('OTA native update is only available on mobile devices.');
  }
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

  const listener = await CapacitorUpdater.addListener('updaterEvent', (event) => {
    if (event.type === 'download' && typeof event.data?.percent === 'number') {
      onProgress?.(Math.min(100, Math.max(0, Math.round(event.data.percent))));
    }
  });

  try {
    onProgress?.(5);
    const resolvedChecksum =
      checksum && /^[a-f0-9]{64}$/i.test(checksum.trim())
        ? checksum.trim().toLowerCase()
        : await computeRemoteBundleSha256(bundleUrl);

    const bundle = await CapacitorUpdater.download({
      url: bundleUrl,
      version,
      checksum: resolvedChecksum,
    });
    onProgress?.(100);
    await CapacitorUpdater.set({ id: bundle.id });
  } finally {
    await listener.remove().catch(() => undefined);
  }
}
