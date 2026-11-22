import {
  DEFAULT_GOOGLE_WEB_CLIENT_ID,
  DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
  DRIVE_BACKUP_FILE_NAME,
  DRIVE_BACKUP_FOLDER_NAME,
  DRIVE_FILE_SCOPE,
} from '../config/driveConfig.ts';
import type { AppLanguage } from '../types/ledger.ts';
import { isNativeApp } from './nativePlatform.ts';

interface NativeGoogleDrivePlugin {
  getStatus(): Promise<{
    available: boolean;
    enabled: boolean;
    intervalHours: number;
    email: string;
    fileId: string;
    lastBackupAt: string;
    lastError: string;
    needsReauth: boolean;
  }>;
  connect(options: {
    intervalHours: number;
    snapshotJson?: string;
  }): Promise<{ connected: boolean; email: string }>;
  disconnect(): Promise<{ connected: boolean }>;
  saveSnapshot(options: { json: string }): Promise<{ saved: boolean }>;
  configureSchedule(options: {
    enabled: boolean;
    intervalHours: number;
  }): Promise<{ enabled: boolean; intervalHours: number }>;
  backupNow(options: {
    json: string;
    interactive: boolean;
  }): Promise<{ ok: boolean; fileId: string; backedUpAt: string; email: string }>;
  restoreLatest(): Promise<{
    ok: boolean;
    fileId: string;
    json: string;
    email: string;
  }>;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: '' | 'consent' | 'select_account' }) => void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => GoogleTokenClient;
  revoke?: (token: string, done?: () => void) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

let cachedNativePlugin: NativeGoogleDrivePlugin | null = null;
let cachedWebAccessToken: { token: string; expiresAt: number } | null = null;
let gsiScriptPromise: Promise<void> | null = null;

async function getNativePlugin(): Promise<NativeGoogleDrivePlugin | null> {
  if (!isNativeApp()) return null;
  if (cachedNativePlugin) return cachedNativePlugin;
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isPluginAvailable('GoogleDriveBackup')) {
      return null;
    }
    cachedNativePlugin = registerPlugin<NativeGoogleDrivePlugin>('GoogleDriveBackup');
    return cachedNativePlugin;
  } catch {
    return null;
  }
}

export async function isNativeDrivePluginAvailable(): Promise<boolean> {
  return (await getNativePlugin()) !== null;
}

export function isValidGoogleClientId(raw: string): boolean {
  const clean = raw.trim();
  return /^[0-9a-zA-Z._-]+\.apps\.googleusercontent\.com$/.test(clean);
}

export function isDriveBackupDue(
  lastBackupAt: string | undefined,
  intervalHours = DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
  nowMs: number = Date.now()
): boolean {
  const safeHours = Number.isFinite(intervalHours) && intervalHours >= 1 ? intervalHours : DRIVE_AUTO_BACKUP_INTERVAL_HOURS;
  if (!lastBackupAt) return true;
  const lastMs = Date.parse(lastBackupAt);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= safeHours * 3_600_000;
}

export function computeNextDriveBackupIso(
  lastBackupAt: string | undefined,
  intervalHours = DRIVE_AUTO_BACKUP_INTERVAL_HOURS
): string | null {
  if (!lastBackupAt) return null;
  const lastMs = Date.parse(lastBackupAt);
  if (!Number.isFinite(lastMs)) return null;
  const safeHours = Number.isFinite(intervalHours) && intervalHours >= 1 ? intervalHours : DRIVE_AUTO_BACKUP_INTERVAL_HOURS;
  return new Date(lastMs + safeHours * 3_600_000).toISOString();
}

export function formatDriveError(err: unknown, lang: AppLanguage): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const isAr = lang === 'ar';

  if (raw.includes('AUTH_CANCELLED') || raw.includes('popup_closed')) {
    return isAr
      ? 'تم إلغاء تسجيل الدخول إلى Google Drive.'
      : 'Connexion à Google Drive annulée.';
  }
  if (raw.includes('AUTH_REQUIRED') || raw.includes('interaction_required') || raw.includes('consent_required')) {
    return isAr
      ? 'يرجى إعادة تأكيد الربط مع حساب Google Drive.'
      : 'Veuillez confirmer à nouveau votre connexion Google Drive.';
  }
  if (raw.includes('NO_DRIVE_BACKUP_FOUND')) {
    return isAr
      ? 'لم يتم العثور على أي نسخة احتياطية محفوظة على Google Drive.'
      : 'Aucune sauvegarde n’a été trouvée sur votre Google Drive.';
  }
  if (raw.includes('MISSING_WEB_CLIENT_ID')) {
    return isAr
      ? 'أضف معرّف Google OAuth Client ID أولاً في إعدادات Google Drive.'
      : 'Ajoutez d’abord votre Google OAuth Client ID dans les paramètres Google Drive.';
  }
  if (raw.includes('NATIVE_PLUGIN_UPDATE_REQUIRED')) {
    return isAr
      ? 'يرجى تثبيت أحدث ملف APK (v1.1.0) لتفعيل النسخ التلقائي على Google Drive.'
      : 'Installez la dernière version APK (v1.1.0) pour activer Google Drive sur Android.';
  }
  if (
    raw.includes('Developer Console') ||
    raw.includes('10:') ||
    raw.includes('DEVELOPER_ERROR') ||
    raw.includes('invalid_client')
  ) {
    return isAr
      ? 'يجب تسجيل التطبيق (Package + SHA-1 أو Client ID) في Google Cloud Console أولاً.'
      : 'Configuration Google Cloud Console requise (Package + SHA-1 ou Client ID).';
  }
  if (raw.includes('Failed to fetch') || raw.includes('Unable to resolve host') || raw.includes('offline')) {
    return isAr
      ? 'تعذر الاتصال بالإنترنت. سيعيد التطبيق المحاولة عند عودة الاتصال.'
      : 'Connexion Internet indisponible. Nouvelle tentative dès le retour en ligne.';
  }
  return raw || (isAr ? 'حدث خطأ أثناء الاتصال بـ Google Drive.' : 'Erreur lors de la synchronisation Google Drive.');
}

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Browser environment unavailable'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('offline')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiScriptPromise = null;
      reject(new Error('offline'));
    };
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

async function requestWebAccessToken(
  webClientId: string,
  interactive: boolean
): Promise<string> {
  if (cachedWebAccessToken && Date.now() < cachedWebAccessToken.expiresAt - 60_000) {
    return cachedWebAccessToken.token;
  }

  const cleanClientId = (webClientId || DEFAULT_GOOGLE_WEB_CLIENT_ID).trim();
  if (!isValidGoogleClientId(cleanClientId)) {
    throw new Error('MISSING_WEB_CLIENT_ID');
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services unavailable');
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const client = oauth2.initTokenClient({
      client_id: cleanClientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (resp) => {
        if (settled) return;
        settled = true;
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'AUTH_REQUIRED'));
          return;
        }
        const expiresInSec = Number(resp.expires_in) || 3500;
        cachedWebAccessToken = {
          token: resp.access_token,
          expiresAt: Date.now() + expiresInSec * 1000,
        };
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(err?.type || err?.message || 'AUTH_CANCELLED'));
      },
    });

    client.requestAccessToken({ prompt: interactive ? 'select_account' : '' });
  });
}

async function fetchDriveUserEmailWeb(accessToken: string): Promise<string> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return '';
    const data = (await res.json()) as {
      user?: { emailAddress?: string; displayName?: string };
    };
    return data.user?.emailAddress?.trim() || data.user?.displayName?.trim() || '';
  } catch {
    return '';
  }
}

async function findFolderIdWeb(accessToken: string): Promise<string> {
  const q = `name='${DRIVE_BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=1&fields=files(id)&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return '';
  const data = (await res.json()) as { files?: Array<{ id?: string }> };
  return data.files?.[0]?.id ?? '';
}

async function findOrCreateFolderWeb(accessToken: string): Promise<string> {
  const existing = await findFolderIdWeb(accessToken);
  if (existing) return existing;

  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      name: DRIVE_BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!res.ok) return '';
  const created = (await res.json()) as { id?: string };
  return created.id ?? '';
}

async function findBackupFileIdWeb(
  accessToken: string,
  folderId: string
): Promise<string> {
  const q = folderId
    ? `name='${DRIVE_BACKUP_FILE_NAME}' and '${folderId}' in parents and trashed=false`
    : `name='${DRIVE_BACKUP_FILE_NAME}' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=drive&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id)&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.ok) {
    const data = (await res.json()) as { files?: Array<{ id?: string }> };
    if (data.files?.[0]?.id) return data.files[0].id;
  }
  if (folderId) {
    return findBackupFileIdWeb(accessToken, '');
  }
  return '';
}

async function uploadBackupWeb(
  accessToken: string,
  jsonContent: string,
  cachedFileId?: string
): Promise<{ fileId: string; backedUpAt: string }> {
  const tryPatch = async (fileId: string) => {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonContent,
      }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Drive update error (${res.status})`);
    }
    const data = (await res.json()) as { id?: string; modifiedTime?: string };
    return {
      fileId: data.id || fileId,
      backedUpAt: data.modifiedTime || new Date().toISOString(),
    };
  };

  if (cachedFileId?.trim()) {
    const patched = await tryPatch(cachedFileId.trim());
    if (patched) return patched;
  }

  const folderId = await findOrCreateFolderWeb(accessToken);
  const existingId = await findBackupFileIdWeb(accessToken, folderId);
  if (existingId) {
    const patched = await tryPatch(existingId);
    if (patched) return patched;
  }

  const boundary = `carnet_drive_${Date.now()}`;
  const metadata: Record<string, unknown> = {
    name: DRIVE_BACKUP_FILE_NAME,
    mimeType: 'application/json',
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const multipartBody =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${jsonContent}\r\n` +
    `--${boundary}--`;

  const createRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!createRes.ok) {
    throw new Error(`Drive upload error (${createRes.status})`);
  }
  const created = (await createRes.json()) as { id?: string; modifiedTime?: string };
  return {
    fileId: created.id || '',
    backedUpAt: created.modifiedTime || new Date().toISOString(),
  };
}

async function downloadBackupWeb(
  accessToken: string,
  cachedFileId?: string
): Promise<{ fileId: string; json: string }> {
  if (cachedFileId?.trim()) {
    const direct = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cachedFileId.trim())}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (direct.ok) {
      return { fileId: cachedFileId.trim(), json: await direct.text() };
    }
  }

  const folderId = await findFolderIdWeb(accessToken);
  const fileId = await findBackupFileIdWeb(accessToken, folderId);
  if (!fileId) {
    throw new Error('NO_DRIVE_BACKUP_FOUND');
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Drive download error (${res.status})`);
  }
  return { fileId, json: await res.text() };
}

export async function getNativeDriveStatus() {
  const plugin = await getNativePlugin();
  if (!plugin) return null;
  try {
    return await plugin.getStatus();
  } catch {
    return null;
  }
}

export async function connectGoogleDrive(options: {
  intervalHours: number;
  snapshotJson: string;
  webClientId?: string;
}): Promise<{ email: string }> {
  if (isNativeApp()) {
    const plugin = await getNativePlugin();
    if (!plugin) {
      throw new Error('NATIVE_PLUGIN_UPDATE_REQUIRED');
    }
    const res = await plugin.connect({
      intervalHours: options.intervalHours,
      snapshotJson: options.snapshotJson,
    });
    return { email: res.email || '' };
  }

  const token = await requestWebAccessToken(options.webClientId || '', true);
  const email = await fetchDriveUserEmailWeb(token);
  return { email };
}

export async function disconnectGoogleDrive(): Promise<void> {
  const plugin = await getNativePlugin();
  if (plugin) {
    try {
      await plugin.disconnect();
    } catch {
      // Ignore cleanup errors
    }
    return;
  }

  if (cachedWebAccessToken?.token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(cachedWebAccessToken.token);
    } catch {
      // Ignore revoke errors
    }
  }
  cachedWebAccessToken = null;
}

export async function syncNativeDriveSnapshot(json: string): Promise<void> {
  const plugin = await getNativePlugin();
  if (!plugin) return;
  try {
    await plugin.saveSnapshot({ json });
  } catch {
    // Non-fatal mirror error
  }
}

export async function configureNativeDriveSchedule(
  enabled: boolean,
  intervalHours: number
): Promise<void> {
  const plugin = await getNativePlugin();
  if (!plugin) return;
  try {
    await plugin.configureSchedule({ enabled, intervalHours });
  } catch {
    // Ignore schedule error
  }
}

export async function backupToGoogleDrive(options: {
  json: string;
  interactive: boolean;
  fileId?: string;
  webClientId?: string;
}): Promise<{ fileId: string; backedUpAt: string; email: string }> {
  if (isNativeApp()) {
    const plugin = await getNativePlugin();
    if (!plugin) {
      throw new Error('NATIVE_PLUGIN_UPDATE_REQUIRED');
    }
    const res = await plugin.backupNow({
      json: options.json,
      interactive: options.interactive,
    });
    return {
      fileId: res.fileId || '',
      backedUpAt: res.backedUpAt || new Date().toISOString(),
      email: res.email || '',
    };
  }

  const token = await requestWebAccessToken(
    options.webClientId || '',
    options.interactive
  );
  const uploaded = await uploadBackupWeb(token, options.json, options.fileId);
  const email = await fetchDriveUserEmailWeb(token);
  return { ...uploaded, email };
}

export async function restoreFromGoogleDrive(options: {
  fileId?: string;
  webClientId?: string;
}): Promise<{ fileId: string; json: string; email: string }> {
  if (isNativeApp()) {
    const plugin = await getNativePlugin();
    if (!plugin) {
      throw new Error('NATIVE_PLUGIN_UPDATE_REQUIRED');
    }
    const res = await plugin.restoreLatest();
    return {
      fileId: res.fileId || '',
      json: res.json,
      email: res.email || '',
    };
  }

  const token = await requestWebAccessToken(options.webClientId || '', true);
  const downloaded = await downloadBackupWeb(token, options.fileId);
  const email = await fetchDriveUserEmailWeb(token);
  return { ...downloaded, email };
}
