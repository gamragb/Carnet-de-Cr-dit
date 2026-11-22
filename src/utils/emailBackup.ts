import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { EMAIL_AUTO_BACKUP_INTERVAL_HOURS } from '../config/driveConfig.ts';
import type { AppLanguage, LedgerDatabase } from '../types/ledger.ts';
import { buildJSONBackup, extractBackupJsonFromText } from './exportImport.ts';
import { formatDateTimeFR, formatMAD, getTodayISODate } from './formatters.ts';
import { computeAllLedgers } from './ledgerMath.ts';
import { isNativeApp } from './nativePlatform.ts';

export { EMAIL_AUTO_BACKUP_INTERVAL_HOURS, extractBackupJsonFromText };
const MAX_EMAIL_JSON_BYTES = 180_000;
const MAX_EMAIL_ATTACHMENT_BYTES = 4_000_000;

interface NativeEmailBackupPlugin {
  configureEmailBackup?: (options: {
    enabled: boolean;
    email: string;
    intervalHours: number;
    payloadJson: string;
    attachmentJson?: string;
  }) => Promise<{ enabled: boolean; email: string; intervalHours: number }>;
  getEmailStatus?: () => Promise<{
    enabled: boolean;
    email: string;
    intervalHours: number;
    lastBackupAt: string;
    lastError: string;
    needsActivation: boolean;
  }>;
  sendEmailNow?: (options: {
    email: string;
    payloadJson: string;
    attachmentJson?: string;
  }) => Promise<{ sentAt: string; email: string; needsActivation: boolean }>;
  clearAllBackups?: () => Promise<{ cleared: boolean }>;
}

let cachedNativePlugin: NativeEmailBackupPlugin | null = null;

async function getNativeEmailPlugin(): Promise<NativeEmailBackupPlugin | null> {
  if (!isNativeApp()) return null;
  if (cachedNativePlugin) return cachedNativePlugin;
  try {
    if (!Capacitor.isPluginAvailable('GoogleDriveBackup')) {
      return null;
    }
    cachedNativePlugin = registerPlugin<NativeEmailBackupPlugin>('GoogleDriveBackup');
    return cachedNativePlugin;
  } catch {
    return null;
  }
}

export function isValidEmailAddress(raw: string): boolean {
  const clean = raw.trim();
  if (clean.length < 5 || clean.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

export function isEmailBackupDue(
  lastBackupAt: string | undefined,
  intervalHours = EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
  nowMs: number = Date.now()
): boolean {
  const safeHours =
    Number.isFinite(intervalHours) && intervalHours >= 1
      ? intervalHours
      : EMAIL_AUTO_BACKUP_INTERVAL_HOURS;
  if (!lastBackupAt) return true;
  const lastMs = Date.parse(lastBackupAt);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= safeHours * 3_600_000;
}

export function computeNextEmailBackupIso(
  lastBackupAt: string | undefined,
  intervalHours = EMAIL_AUTO_BACKUP_INTERVAL_HOURS
): string | null {
  if (!lastBackupAt) return null;
  const lastMs = Date.parse(lastBackupAt);
  if (!Number.isFinite(lastMs)) return null;
  const safeHours =
    Number.isFinite(intervalHours) && intervalHours >= 1
      ? intervalHours
      : EMAIL_AUTO_BACKUP_INTERVAL_HOURS;
  return new Date(lastMs + safeHours * 3_600_000).toISOString();
}

/**
 * Builds a complete restorable JSON backup suitable for email body transport.
 * If inline base64 receipt photos exceed email relay limits (>180 KB), strips only
 * the raw base64 data URLs while preserving 100% of contacts, transactions, amounts,
 * notes, dates, references, and account settings.
 */
export function buildEmailSafeJSONBackup(db: LedgerDatabase): string {
  const full = buildJSONBackup(db);
  if (full.length <= MAX_EMAIL_JSON_BYTES) {
    return full;
  }
  const lightDb: LedgerDatabase = {
    ...db,
    transactions: db.transactions.map((tx) =>
      tx.attachmentDataUrl ? { ...tx, attachmentDataUrl: undefined } : tx
    ),
  };
  return buildJSONBackup(lightDb);
}

/**
 * Builds the downloadable `.json` backup file attached directly to the email.
 * Keeps receipt images when total size fits safely under the email attachment limit (~4 MB).
 */
export function buildEmailAttachmentJSONBackup(db: LedgerDatabase): string {
  const full = buildJSONBackup(db);
  if (full.length <= MAX_EMAIL_ATTACHMENT_BYTES) {
    return full;
  }
  const lightDb: LedgerDatabase = {
    ...db,
    transactions: db.transactions.map((tx) =>
      tx.attachmentDataUrl ? { ...tx, attachmentDataUrl: undefined } : tx
    ),
  };
  return buildJSONBackup(lightDb);
}

export function buildEmailBackupFileName(dateISO: string = getTodayISODate()): string {
  return `carnet-credit-backup-${dateISO}.json`;
}

export function buildEmailBackupPayload(
  db: LedgerDatabase,
  targetEmail: string,
  lang: AppLanguage = db.settings.language
): Record<string, string> {
  const isAr = lang === 'ar';
  const nowIso = new Date().toISOString();
  const todayISO = getTodayISODate();
  const { date, time } = formatDateTimeFR(nowIso, lang);
  const stamp = time ? `${date} • ${time}` : date;

  const accountName =
    db.settings.account?.fullName?.trim() ||
    db.settings.businessName?.trim() ||
    (isAr ? 'دفتر الكريدي' : 'Carnet de Crédit');
  const shopName = db.settings.businessName?.trim() || '-';
  const phone = db.settings.account?.phone?.trim() || '-';

  const { summaries, totals } = computeAllLedgers(db.contacts, db.transactions, todayISO);
  const activeSummaries = summaries.filter((s) => !s.contact.archived);

  const fmt = (amt: number) =>
    formatMAD(amt, { lang, hideDecimals: db.settings.hideDecimals });

  const balancesLines = activeSummaries.slice(0, 60).map((s) => {
    const status =
      s.balance > 0
        ? isAr
          ? `لك ${fmt(s.balance)}`
          : `Vous doit ${fmt(s.balance)}`
        : s.balance < 0
          ? isAr
            ? `عليك ${fmt(Math.abs(s.balance))}`
            : `Vous devez ${fmt(Math.abs(s.balance))}`
          : isAr
            ? 'خالص (0 درهم)'
            : 'Soldé (0 DH)';
    const phonePart = s.contact.phone ? ` (${s.contact.phone})` : '';
    return `• ${s.contact.name}${phonePart} : ${status}`;
  });

  if (activeSummaries.length > 60) {
    balancesLines.push(
      isAr
        ? `... و ${activeSummaries.length - 60} أشخاص آخرين داخل كود النسخة الكاملة أدناه.`
        : `... et ${activeSummaries.length - 60} autre(s) contact(s) dans le code JSON ci-dessous.`
    );
  }

  const contactsDigest =
    balancesLines.length > 0
      ? balancesLines.join('\n')
      : isAr
        ? 'لا يوجد أشخاص مسجلون حالياً.'
        : 'Aucun contact enregistré pour le moment.';

  const backupJson = buildEmailSafeJSONBackup(db);

  if (isAr) {
    return {
      _subject: `دفتر الكريدي — نسخة احتياطية (${accountName}) — ${todayISO}`,
      _template: 'box',
      _captcha: 'false',
      'الحساب / الاسم': accountName,
      'المحل / النشاط': shopName,
      'رقم الهاتف': phone,
      'البريد الإلكتروني المسجل': targetEmail.trim(),
      'تاريخ ووقت النسخة': stamp,
      'إحصائيات الدفتر': `${db.contacts.length} شخص • ${db.transactions.length} عملية`,
      'مجموع ما لك (كتسالهم)': fmt(totals.totalReceivable),
      'مجموع ما عليك (كيسالوك)': fmt(totals.totalPayable),
      'الرصيد الصافي': fmt(totals.netBalance),
      'ملخص الأرصدة والحسابات': contactsDigest,
      'كود الاسترجاع الكامل (انسخه للاسترجاع في التطبيق)': backupJson,
    };
  }

  return {
    _subject: `Carnet de Crédit — Sauvegarde (${accountName}) — ${todayISO}`,
    _template: 'box',
    _captcha: 'false',
    'Compte / Nom complet': accountName,
    'Commerce / Activité': shopName,
    Téléphone: phone,
    'Email enregistré': targetEmail.trim(),
    'Date & Heure de sauvegarde': stamp,
    'Statistiques du carnet': `${db.contacts.length} personne(s) • ${db.transactions.length} opération(s)`,
    'Total à recevoir (Créances)': fmt(totals.totalReceivable),
    'Total à payer (Dettes)': fmt(totals.totalPayable),
    'Solde Net': fmt(totals.netBalance),
    'Résumé des comptes & soldes': contactsDigest,
    'Code JSON complet (à copier-coller pour restaurer dans l’application)': backupJson,
  };
}

export function formatEmailBackupError(err: unknown, lang: AppLanguage): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const isAr = lang === 'ar';

  if (raw.includes('INVALID_EMAIL')) {
    return isAr
      ? 'المرجو إدخال بريد إلكتروني صحيح (مثال: name@gmail.com).'
      : 'Veuillez saisir une adresse email valide (ex : nom@gmail.com).';
  }
  if (
    /Failed to fetch|NetworkError|Unable to resolve host|UnknownHostException|No address associated|ConnectException|SocketTimeoutException|timeout|offline/i.test(
      raw
    )
  ) {
    return isAr
      ? 'تعذر الاتصال بالإنترنت لإرسال النسخة. تحقق من الشبكة وسيرسلها التطبيق تلقائياً فور توفر الإنترنت.'
      : 'Connexion Internet indisponible ou lente. La copie sera envoyée automatiquement dès le retour en ligne.';
  }
  if (/not implemented|UNIMPLEMENTED/i.test(raw)) {
    return isAr
      ? 'تعذر الإرسال عبر الإضافة القديمة، أعد المحاولة الآن.'
      : "Échec de l'envoi natif, veuillez réessayer.";
  }
  return (
    raw ||
    (isAr
      ? 'تعذر إرسال النسخة الاحتياطية إلى البريد الإلكتروني حالياً.'
      : "Impossible d'envoyer la sauvegarde par email pour le moment.")
  );
}

export async function syncNativeEmailBackupConfig(options: {
  enabled: boolean;
  email: string;
  intervalHours: number;
  payloadJson: string;
  attachmentJson?: string;
}): Promise<void> {
  const plugin = await getNativeEmailPlugin();
  if (!plugin?.configureEmailBackup) return;
  try {
    await plugin.configureEmailBackup(options);
  } catch {
    // Non-fatal on older native shell
  }
}

export async function getNativeEmailBackupStatus() {
  const plugin = await getNativeEmailPlugin();
  if (!plugin?.getEmailStatus) return null;
  try {
    return await plugin.getEmailStatus();
  } catch {
    return null;
  }
}

export async function clearAllNativeBackups(): Promise<void> {
  const plugin = await getNativeEmailPlugin();
  if (plugin?.clearAllBackups) {
    try {
      await plugin.clearAllBackups();
      return;
    } catch {
      // Fallback below
    }
  }
  if (plugin?.configureEmailBackup) {
    try {
      await plugin.configureEmailBackup({
        enabled: false,
        email: '',
        intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
        payloadJson: '',
        attachmentJson: '',
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}

function parseFormSubmitResponse(
  status: number,
  rawData: unknown
): { ok: boolean; needsActivation: boolean; message: string; status: number } {
  let data: { success?: boolean | string; message?: string } = {};
  if (rawData && typeof rawData === 'object') {
    data = rawData as { success?: boolean | string; message?: string };
  } else if (typeof rawData === 'string') {
    try {
      data = JSON.parse(rawData) as { success?: boolean | string; message?: string };
    } catch {
      data = { message: rawData.slice(0, 200) };
    }
  }
  const msg = String(data.message ?? '');
  const needsActivation =
    /activat/i.test(msg) || /confirm/i.test(msg) || /verify/i.test(msg);
  const explicitFalse = data.success === false || data.success === 'false';
  const httpOk = status >= 200 && status < 300;
  const ok = (httpOk && !explicitFalse) || needsActivation;
  return { ok, needsActivation, message: msg, status };
}

async function postFormSubmitRequest(
  endpoint: string,
  init: RequestInit
): Promise<{ ok: boolean; needsActivation: boolean; message: string; status: number }> {
  const res = await fetch(endpoint, init);
  let rawData: unknown = {};
  try {
    rawData = await res.text();
  } catch {
    rawData = {};
  }
  return parseFormSubmitResponse(res.status, rawData);
}

function buildRawMultipartBody(
  payload: Record<string, string>,
  attachmentJson: string,
  fileName: string,
  mimeType: string,
  boundary: string
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const safeKey = key.replace(/"/g, "'").replace(/[\r\n]/g, '');
    parts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${safeKey}"\r\n\r\n` +
        `${value}\r\n`
    );
  }
  parts.push(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="attachment"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
      `${attachmentJson}\r\n`
  );
  parts.push(`--${boundary}--\r\n`);
  return parts.join('');
}

async function sendViaCapacitorHttp(
  endpoint: string,
  payload: Record<string, string>,
  attachmentJson: string,
  jsonFileName: string
): Promise<{ ok: boolean; needsActivation: boolean; message: string; status: number }> {
  const baseHeaders = {
    Accept: 'application/json',
    Origin: 'https://gamragb.github.io',
    Referer: 'https://gamragb.github.io/Carnet-de-Cr-dit/',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
  };

  // 1. Primary: native multipart/form-data with `.json` file attachment
  const boundaryJson = `----CarnetCapJson${Date.now()}`;
  const resJson = await CapacitorHttp.post({
    url: endpoint,
    headers: {
      ...baseHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundaryJson}`,
    },
    data: buildRawMultipartBody(
      payload,
      attachmentJson,
      jsonFileName,
      'application/json',
      boundaryJson
    ),
    connectTimeout: 20_000,
    readTimeout: 30_000,
  });
  const parsedJson = parseFormSubmitResponse(resJson.status, resJson.data);
  if (parsedJson.ok) return parsedJson;

  // 2. Fallback: native multipart/form-data with `.txt` attachment
  const boundaryTxt = `----CarnetCapTxt${Date.now()}`;
  const txtFileName = jsonFileName.replace(/\.json$/i, '.txt');
  const resTxt = await CapacitorHttp.post({
    url: endpoint,
    headers: {
      ...baseHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundaryTxt}`,
    },
    data: buildRawMultipartBody(
      payload,
      attachmentJson,
      txtFileName,
      'text/plain',
      boundaryTxt
    ),
    connectTimeout: 20_000,
    readTimeout: 30_000,
  });
  const parsedTxt = parseFormSubmitResponse(resTxt.status, resTxt.data);
  if (parsedTxt.ok) return parsedTxt;

  // 3. Final native fallback: standard JSON body
  const resBody = await CapacitorHttp.post({
    url: endpoint,
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    data: payload,
    connectTimeout: 20_000,
    readTimeout: 30_000,
  });
  const parsedBody = parseFormSubmitResponse(resBody.status, resBody.data);
  return parsedBody.ok || parsedBody.message ? parsedBody : parsedJson;
}

function buildFormSubmitMultipart(
  payload: Record<string, string>,
  attachmentJson: string,
  fileName: string,
  mimeType: string
): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    formData.append(key, value);
  }
  const blob = new Blob([attachmentJson], { type: mimeType });
  formData.append('attachment', blob, fileName);
  return formData;
}

export async function sendBackupToEmail(options: {
  db: LedgerDatabase;
  email: string;
  lang: AppLanguage;
}): Promise<{ sentAt: string; email: string; needsActivation: boolean }> {
  const cleanEmail = options.email.trim();
  if (!isValidEmailAddress(cleanEmail)) {
    throw new Error('INVALID_EMAIL');
  }

  const payload = buildEmailBackupPayload(options.db, cleanEmail, options.lang);
  const payloadJson = JSON.stringify(payload);
  const attachmentJson = buildEmailAttachmentJSONBackup(options.db);
  const jsonFileName = buildEmailBackupFileName();
  const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(cleanEmail)}`;

  if (isNativeApp()) {
    // Path 1: Custom Java plugin `GoogleDriveBackup.sendEmailNow` (present on APK v1.2.0+)
    const nativePlugin = await getNativeEmailPlugin();
    if (nativePlugin?.sendEmailNow) {
      try {
        const nativeRes = await nativePlugin.sendEmailNow({
          email: cleanEmail,
          payloadJson,
          attachmentJson,
        });
        return {
          sentAt: nativeRes.sentAt || new Date().toISOString(),
          email: nativeRes.email || cleanEmail,
          needsActivation: Boolean(nativeRes.needsActivation),
        };
      } catch (nativeErr) {
        const errMsg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr ?? '');
        // Only abort immediately when clearly offline; otherwise fall back to CapacitorHttp
        // (crucial when an older APK received an OTA update and lacks sendEmailNow in Java!)
        if (/Unable to resolve host|UnknownHostException|No address associated/i.test(errMsg)) {
          throw nativeErr;
        }
      }
    }

    // Path 2: Built-in CapacitorHttp native Android HTTP (present on ALL APKs v1.0.0+)
    try {
      const capResult = await sendViaCapacitorHttp(
        endpoint,
        payload,
        attachmentJson,
        jsonFileName
      );
      if (capResult.ok) {
        return {
          sentAt: new Date().toISOString(),
          email: cleanEmail,
          needsActivation: capResult.needsActivation,
        };
      }
      throw new Error(capResult.message || `Email delivery error (${capResult.status})`);
    } catch (capErr) {
      const errMsg = capErr instanceof Error ? capErr.message : String(capErr ?? '');
      if (/Unable to resolve host|UnknownHostException|No address associated/i.test(errMsg)) {
        throw capErr;
      }
      // Last resort: try WebView fetch below before surfacing error
    }
  }

  // Path 3: Web / PWA (or last-resort fallback) via FormData + Blob attachment
  let result = await postFormSubmitRequest(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: buildFormSubmitMultipart(
      payload,
      attachmentJson,
      jsonFileName,
      'application/json;charset=utf-8'
    ),
  });

  if (!result.ok) {
    const txtFileName = jsonFileName.replace(/\.json$/i, '.txt');
    const txtResult = await postFormSubmitRequest(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: buildFormSubmitMultipart(
        payload,
        attachmentJson,
        txtFileName,
        'text/plain;charset=utf-8'
      ),
    });
    if (txtResult.ok) {
      result = txtResult;
    } else {
      const jsonOnlyResult = await postFormSubmitRequest(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payloadJson,
      });
      if (jsonOnlyResult.ok) {
        result = jsonOnlyResult;
      } else {
        result = jsonOnlyResult.message ? jsonOnlyResult : result;
      }
    }
  }

  if (!result.ok) {
    throw new Error(result.message || `Email delivery error (${result.status})`);
  }

  const sentAt = new Date().toISOString();
  return {
    sentAt,
    email: cleanEmail,
    needsActivation: result.needsActivation,
  };
}
