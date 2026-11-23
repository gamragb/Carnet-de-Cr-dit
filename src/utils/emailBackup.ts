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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`SocketTimeoutException: ${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (val) => {
        globalThis.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        globalThis.clearTimeout(timer);
        reject(err);
      }
    );
  });
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
    await withTimeout(plugin.configureEmailBackup(options), 4_000, 'configureEmailBackup');
  } catch {
    // Non-fatal on older native shell
  }
}

export async function getNativeEmailBackupStatus() {
  const plugin = await getNativeEmailPlugin();
  if (!plugin?.getEmailStatus) return null;
  try {
    return await withTimeout(plugin.getEmailStatus(), 3_500, 'getEmailStatus');
  } catch {
    return null;
  }
}

export async function clearAllNativeBackups(): Promise<void> {
  const plugin = await getNativeEmailPlugin();
  if (plugin?.clearAllBackups) {
    try {
      await withTimeout(plugin.clearAllBackups(), 4_000, 'clearAllBackups');
      return;
    } catch {
      // Fallback below
    }
  }
  if (plugin?.configureEmailBackup) {
    try {
      await withTimeout(
        plugin.configureEmailBackup({
          enabled: false,
          email: '',
          intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
          payloadJson: '',
          attachmentJson: '',
        }),
        4_000,
        'configureEmailBackupClear'
      );
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

async function postFormSubmitJsonViaFetch(
  endpoint: string,
  payloadJson: string,
  timeoutMs = 8_000
): Promise<{ ok: boolean; needsActivation: boolean; message: string; status: number }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? globalThis.setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // Ignore abort error
        }
      }, timeoutMs)
    : null;

  try {
    const res = await withTimeout(
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payloadJson,
        signal: controller?.signal,
      }),
      timeoutMs + 500,
      'fetchFormSubmit'
    );
    let rawData: unknown = {};
    try {
      rawData = await withTimeout(res.text(), 4_000, 'readResponseText');
    } catch {
      rawData = {};
    }
    return parseFormSubmitResponse(res.status, rawData);
  } finally {
    if (timer !== null) {
      globalThis.clearTimeout(timer);
    }
  }
}

async function sendViaCapacitorHttpJson(
  endpoint: string,
  payload: Record<string, string>,
  timeoutMs = 8_000
): Promise<{ ok: boolean; needsActivation: boolean; message: string; status: number }> {
  const resBody = await withTimeout(
    CapacitorHttp.post({
      url: endpoint,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
        Origin: 'https://gamragb.github.io',
        Referer: 'https://gamragb.github.io/Carnet-de-Cr-dit/',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
      },
      data: payload,
      connectTimeout: 6_000,
      readTimeout: 7_000,
    }),
    timeoutMs,
    'CapacitorHttp.post'
  );
  return parseFormSubmitResponse(resBody.status, resBody.data);
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
  const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(cleanEmail)}`;

  let lastError: unknown = null;

  // Path 1: Fast direct JSON fetch (works in <1.5s on Web, PWA, and Android WebView with Happy Eyeballs IPv4/IPv6)
  try {
    const fetchResult = await postFormSubmitJsonViaFetch(endpoint, payloadJson, 8_000);
    if (fetchResult.ok) {
      const sentAt = new Date().toISOString();
      // Sync native status silently on Android if plugin available
      if (isNativeApp()) {
        void syncNativeEmailBackupConfig({
          enabled: Boolean(options.db.settings.emailBackup?.enabled ?? true),
          email: cleanEmail,
          intervalHours:
            options.db.settings.emailBackup?.intervalHours ||
            EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
          payloadJson,
        });
      }
      return {
        sentAt,
        email: cleanEmail,
        needsActivation: fetchResult.needsActivation,
      };
    }
    lastError = new Error(
      fetchResult.message || `Email delivery error (${fetchResult.status})`
    );
  } catch (fetchErr) {
    lastError = fetchErr;
  }

  // Path 2: Native Android fallbacks (CapacitorHttp JSON + custom Java GoogleDriveBackup plugin)
  if (isNativeApp()) {
    try {
      const capResult = await sendViaCapacitorHttpJson(endpoint, payload, 8_500);
      if (capResult.ok) {
        return {
          sentAt: new Date().toISOString(),
          email: cleanEmail,
          needsActivation: capResult.needsActivation,
        };
      }
      lastError = new Error(
        capResult.message || `Email delivery error (${capResult.status})`
      );
    } catch (capErr) {
      lastError = capErr;
    }

    const nativePlugin = await getNativeEmailPlugin();
    if (nativePlugin?.sendEmailNow) {
      try {
        const nativeRes = await withTimeout(
          nativePlugin.sendEmailNow({
            email: cleanEmail,
            payloadJson,
          }),
          8_500,
          'GoogleDriveBackup.sendEmailNow'
        );
        return {
          sentAt: nativeRes.sentAt || new Date().toISOString(),
          email: nativeRes.email || cleanEmail,
          needsActivation: Boolean(nativeRes.needsActivation),
        };
      } catch (nativeErr) {
        const errMsg =
          nativeErr instanceof Error ? nativeErr.message : String(nativeErr ?? '');
        if (!/not implemented|UNIMPLEMENTED/i.test(errMsg)) {
          lastError = nativeErr;
        }
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError ?? 'Email delivery failed'));
}
