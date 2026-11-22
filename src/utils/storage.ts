import {
  DEFAULT_GOOGLE_WEB_CLIENT_ID,
  DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
} from '../config/driveConfig.ts';
import { DEFAULT_UPDATE_MANIFEST_URL } from '../config/updateConfig.ts';
import type {
  AccountUsageType,
  AppLanguage,
  AppSettings,
  Contact,
  ContactCategory,
  DriveBackupSettings,
  EmailBackupSettings,
  LedgerDatabase,
  PaymentMethod,
  Transaction,
  TransactionType,
  UserAccountProfile,
} from '../types/ledger.ts';
import { EMAIL_AUTO_BACKUP_INTERVAL_HOURS } from './emailBackup.ts';
import { roundMoney } from './formatters.ts';

const LS_KEY = 'carnet_credit_maroc_v1';
const LS_IDB_AHEAD_KEY = 'carnet_credit_idb_ahead_v1';
const IDB_NAME = 'carnet_credit_maroc_db';
const IDB_STORE = 'ledger_state';
const IDB_RECORD_KEY = 'main';

const SAFE_RASTER_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

const VALID_CATEGORIES = new Set<ContactCategory>([
  'Client',
  'Fournisseur',
  'Famille/Ami',
  'Autre',
]);

const VALID_TYPES = new Set<TransactionType>([
  'credit_given',
  'payment_received',
  'credit_taken',
  'payment_made',
]);

const VALID_METHODS = new Set<PaymentMethod>([
  'Espèces',
  'Virement CIH/Banque',
  'Chèque',
  'Marchandise',
]);

export const DEFAULT_EMAIL_BACKUP: EmailBackupSettings = {
  enabled: false,
  email: '',
  intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
};

export const DEFAULT_DRIVE_BACKUP: DriveBackupSettings = {
  enabled: false,
  connected: false,
  email: '',
  intervalHours: DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
  webClientId: DEFAULT_GOOGLE_WEB_CLIENT_ID,
};

export const DEFAULT_SETTINGS: AppSettings = {
  pinHash: null,
  pinEnabled: false,
  pinRecoveryQuestion: '',
  pinRecoveryHash: null,
  autoLockMinutes: 0,
  hideAmounts: false,
  businessName: '',
  language: 'fr',
  theme: 'light',
  hideDecimals: false,
  csvDelimiter: ';',
  whatsAppTemplate: '',
  notificationsEnabled: false,
  updateManifestUrl: DEFAULT_UPDATE_MANIFEST_URL,
  accountRegistered: false,
  accountSignedOut: false,
  emailBackup: { ...DEFAULT_EMAIL_BACKUP },
  driveBackup: { ...DEFAULT_DRIVE_BACKUP },
};

function offsetDaysISO(daysOffset: number, time = '10:30'): { date: string; datetime: string } {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;
  return { date, datetime: `${date}T${time}` };
}

export function createSampleSeedData(lang: AppLanguage = 'fr'): {
  contacts: Contact[];
  transactions: Transaction[];
} {
  const nowISO = new Date().toISOString();
  const isAr = lang === 'ar';

  const contacts: Contact[] = [
    {
      id: 'sample-contact-1',
      name: isAr ? 'كريم بناني' : 'Karim Bennani',
      phone: '06 61 48 23 90',
      category: 'Client',
      note: isAr ? 'زبون دائم — حي المعاريف' : 'Client régulier — Quartier Maarif',
      creditLimit: 5000,
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'sample-contact-2',
      name: isAr ? 'شركة أطلس للجملة' : 'Grossiste Atlas SARL',
      phone: '06 62 15 74 08',
      category: 'Fournisseur',
      note: isAr ? 'المورد الرئيسي للبضاعة' : 'Fournisseur principal marchandise',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'sample-contact-3',
      name: isAr ? 'يوسف المنصوري' : 'Youssef El Mansouri',
      phone: '07 08 32 19 45',
      category: 'Famille/Ami',
      note: isAr ? 'سلف شخصي' : 'Prêt personnel',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
  ];

  const dMinus10 = offsetDaysISO(-10, '11:15');
  const dMinus4 = offsetDaysISO(-4, '16:40');
  const dMinus2 = offsetDaysISO(-2, '18:00');

  const dMinus8 = offsetDaysISO(-8, '09:30');
  const dMinus1 = offsetDaysISO(-1, '14:20');
  const dPlus3 = offsetDaysISO(3, '18:00');

  const dMinus15 = offsetDaysISO(-15, '19:05');
  const dMinus5 = offsetDaysISO(-5, '12:10');
  const dPlus12 = offsetDaysISO(12, '18:00');

  const transactions: Transaction[] = [
    {
      id: 'sample-tx-1',
      contactId: 'sample-contact-1',
      type: 'credit_given',
      amount: 3500,
      occurredAt: dMinus10.datetime,
      dueDate: dMinus2.date,
      dueResolved: false,
      paymentMethod: 'Marchandise',
      reference: 'BL-014',
      note: isAr ? 'تسليم بضاعة الدفعة #14' : 'Livraison marchandise lot #14',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'sample-tx-2',
      contactId: 'sample-contact-1',
      type: 'payment_received',
      amount: 1200,
      occurredAt: dMinus4.datetime,
      paymentMethod: 'Espèces',
      note: isAr ? 'تسبيق / أداء جزئي' : 'Acompte / règlement partiel',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'sample-tx-3',
      contactId: 'sample-contact-2',
      type: 'credit_taken',
      amount: 4800,
      occurredAt: dMinus8.datetime,
      dueDate: dPlus3.date,
      dueResolved: false,
      paymentMethod: 'Marchandise',
      reference: 'FAC-402',
      note: isAr ? 'مخزون سلعة فاتورة #402' : 'Stock fournitures facture #402',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'sample-tx-4',
      contactId: 'sample-contact-2',
      type: 'payment_made',
      amount: 1800,
      occurredAt: dMinus1.datetime,
      paymentMethod: 'Virement CIH/Banque',
      note: isAr ? 'تسبيق عبر تحويل بنكي CIH' : 'Avance virement CIH',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'sample-tx-5',
      contactId: 'sample-contact-3',
      type: 'credit_given',
      amount: 1500,
      occurredAt: dMinus15.datetime,
      dueDate: dPlus12.date,
      dueResolved: false,
      paymentMethod: 'Espèces',
      note: isAr ? 'سلف مستعجل' : 'Dépannage urgent',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'sample-tx-6',
      contactId: 'sample-contact-3',
      type: 'payment_received',
      amount: 500,
      occurredAt: dMinus5.datetime,
      paymentMethod: 'Virement CIH/Banque',
      note: isAr ? 'استرجاع الدفعة الأولى' : 'Remboursement 1ère tranche',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
  ];

  return { contacts, transactions };
}

export function createInitialDatabase(lang: AppLanguage = 'fr'): LedgerDatabase {
  return {
    version: 1,
    initialized: true,
    contacts: [],
    transactions: [],
    settings: { ...DEFAULT_SETTINGS, language: lang, accountRegistered: false },
  };
}

export function createEmptyDatabase(preserveSettings?: AppSettings): LedgerDatabase {
  return {
    version: 1,
    initialized: true,
    contacts: [],
    transactions: [],
    settings: preserveSettings ? { ...preserveSettings } : { ...DEFAULT_SETTINGS },
  };
}

export function normalizeLoadedDb(raw: unknown): LedgerDatabase | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<LedgerDatabase>;
  if (!Array.isArray(data.contacts) || !Array.isArray(data.transactions)) {
    return null;
  }

  const nowISO = new Date().toISOString();
  const seenContacts = new Set<string>();
  const contacts: Contact[] = [];

  for (const item of data.contacts) {
    if (!item || typeof item !== 'object') continue;
    const c = item as unknown as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id.trim()) continue;
    const id = c.id.trim();
    if (seenContacts.has(id)) continue;
    if (typeof c.name !== 'string' || !c.name.trim()) continue;
    seenContacts.add(id);

    const creditLimit =
      typeof c.creditLimit === 'number' && Number.isFinite(c.creditLimit) && c.creditLimit > 0
        ? roundMoney(c.creditLimit)
        : undefined;

    contacts.push({
      id,
      name: c.name.trim(),
      phone: typeof c.phone === 'string' ? c.phone.trim() : '',
      category: VALID_CATEGORIES.has(c.category as ContactCategory)
        ? (c.category as ContactCategory)
        : 'Autre',
      note: typeof c.note === 'string' && c.note.trim() ? c.note.trim() : undefined,
      creditLimit,
      archived: Boolean(c.archived),
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : nowISO,
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : nowISO,
    });
  }

  const seenTx = new Set<string>();
  const transactions: Transaction[] = [];
  for (const item of data.transactions) {
    if (!item || typeof item !== 'object') continue;
    const t = item as unknown as Record<string, unknown>;
    if (typeof t.id !== 'string' || !t.id.trim()) continue;
    const id = t.id.trim();
    if (seenTx.has(id)) continue;
    if (typeof t.contactId !== 'string' || !seenContacts.has(t.contactId)) continue;
    if (!VALID_TYPES.has(t.type as TransactionType)) continue;
    const amountNum = Number(t.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) continue;
    seenTx.add(id);

    transactions.push({
      id,
      contactId: t.contactId,
      type: t.type as TransactionType,
      amount: roundMoney(amountNum),
      occurredAt:
        typeof t.occurredAt === 'string' && t.occurredAt.trim()
          ? t.occurredAt.trim()
          : nowISO.slice(0, 16),
      dueDate:
        typeof t.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)
          ? t.dueDate
          : undefined,
      dueResolved: Boolean(t.dueResolved),
      paymentMethod: VALID_METHODS.has(t.paymentMethod as PaymentMethod)
        ? (t.paymentMethod as PaymentMethod)
        : 'Espèces',
      note: typeof t.note === 'string' ? t.note.trim() : '',
      reference:
        typeof t.reference === 'string' && t.reference.trim()
          ? t.reference.trim()
          : undefined,
      isDiscount: Boolean(t.isDiscount),
      attachmentDataUrl:
        typeof t.attachmentDataUrl === 'string' &&
        SAFE_RASTER_DATA_URL_RE.test(t.attachmentDataUrl)
          ? t.attachmentDataUrl
          : undefined,
      attachmentName:
        typeof t.attachmentName === 'string' ? t.attachmentName : undefined,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowISO,
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : nowISO,
    });
  }

  const rawSettings = (data.settings ?? {}) as Partial<AppSettings>;
  const rawAccount =
    rawSettings.account && typeof rawSettings.account === 'object'
      ? (rawSettings.account as Partial<UserAccountProfile>)
      : undefined;

  const account: UserAccountProfile | undefined =
    rawAccount && typeof rawAccount.fullName === 'string' && rawAccount.fullName.trim()
      ? {
          fullName: rawAccount.fullName.trim(),
          phone: typeof rawAccount.phone === 'string' ? rawAccount.phone.trim() : '',
          email:
            typeof rawAccount.email === 'string' && rawAccount.email.trim()
              ? rawAccount.email.trim()
              : undefined,
          usageType:
            rawAccount.usageType === 'personal'
              ? ('personal' as AccountUsageType)
              : ('business' as AccountUsageType),
          createdAt: typeof rawAccount.createdAt === 'string' ? rawAccount.createdAt : nowISO,
        }
      : undefined;

  const inferredRegistered =
    typeof rawSettings.accountRegistered === 'boolean'
      ? rawSettings.accountRegistered
      : Boolean(
          account ||
            contacts.length > 0 ||
            transactions.length > 0 ||
            (typeof rawSettings.businessName === 'string' && rawSettings.businessName.trim()) ||
            (rawSettings.pinEnabled && rawSettings.pinHash)
        );

  const rawEmailBackup =
    rawSettings.emailBackup && typeof rawSettings.emailBackup === 'object'
      ? (rawSettings.emailBackup as Partial<EmailBackupSettings>)
      : undefined;

  const resolvedEmailAddr =
    typeof rawEmailBackup?.email === 'string' && rawEmailBackup.email.trim()
      ? rawEmailBackup.email.trim()
      : account?.email ?? '';

  const emailBackup: EmailBackupSettings = {
    enabled:
      typeof rawEmailBackup?.enabled === 'boolean'
        ? Boolean(rawEmailBackup.enabled && resolvedEmailAddr)
        : Boolean(resolvedEmailAddr),
    email: resolvedEmailAddr,
    intervalHours:
      typeof rawEmailBackup?.intervalHours === 'number' &&
      Number.isFinite(rawEmailBackup.intervalHours) &&
      rawEmailBackup.intervalHours >= 1
        ? Math.round(rawEmailBackup.intervalHours)
        : EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
    lastBackupAt:
      typeof rawEmailBackup?.lastBackupAt === 'string' && rawEmailBackup.lastBackupAt.trim()
        ? rawEmailBackup.lastBackupAt.trim()
        : undefined,
    lastError:
      typeof rawEmailBackup?.lastError === 'string' && rawEmailBackup.lastError.trim()
        ? rawEmailBackup.lastError.trim()
        : undefined,
    needsActivation: Boolean(rawEmailBackup?.needsActivation),
  };

  const rawDrive =
    rawSettings.driveBackup && typeof rawSettings.driveBackup === 'object'
      ? (rawSettings.driveBackup as Partial<DriveBackupSettings>)
      : undefined;

  const driveBackup: DriveBackupSettings = {
    enabled: Boolean(rawDrive?.enabled && rawDrive?.connected),
    connected: Boolean(rawDrive?.connected),
    email: typeof rawDrive?.email === 'string' ? rawDrive.email.trim() : '',
    intervalHours:
      typeof rawDrive?.intervalHours === 'number' &&
      Number.isFinite(rawDrive.intervalHours) &&
      rawDrive.intervalHours >= 1
        ? Math.round(rawDrive.intervalHours)
        : DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
    fileId: typeof rawDrive?.fileId === 'string' && rawDrive.fileId.trim() ? rawDrive.fileId.trim() : undefined,
    lastBackupAt:
      typeof rawDrive?.lastBackupAt === 'string' && rawDrive.lastBackupAt.trim()
        ? rawDrive.lastBackupAt.trim()
        : undefined,
    lastError:
      typeof rawDrive?.lastError === 'string' && rawDrive.lastError.trim()
        ? rawDrive.lastError.trim()
        : undefined,
    needsReauth: Boolean(rawDrive?.needsReauth),
    webClientId:
      typeof rawDrive?.webClientId === 'string'
        ? rawDrive.webClientId.trim()
        : DEFAULT_GOOGLE_WEB_CLIENT_ID,
  };

  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    language: rawSettings.language === 'ar' ? 'ar' : 'fr',
    theme: rawSettings.theme === 'dark' ? 'dark' : 'light',
    csvDelimiter: rawSettings.csvDelimiter === ',' ? ',' : ';',
    autoLockMinutes:
      typeof rawSettings.autoLockMinutes === 'number' &&
      [0, 1, 5, 15].includes(rawSettings.autoLockMinutes)
        ? rawSettings.autoLockMinutes
        : 0,
    hideAmounts: Boolean(rawSettings.hideAmounts),
    hideDecimals: Boolean(rawSettings.hideDecimals),
    pinEnabled: Boolean(rawSettings.pinEnabled && rawSettings.pinHash),
    pinHash: typeof rawSettings.pinHash === 'string' ? rawSettings.pinHash : null,
    pinRecoveryQuestion:
      typeof rawSettings.pinRecoveryQuestion === 'string'
        ? rawSettings.pinRecoveryQuestion
        : '',
    pinRecoveryHash:
      typeof rawSettings.pinRecoveryHash === 'string' ? rawSettings.pinRecoveryHash : null,
    businessName: typeof rawSettings.businessName === 'string' ? rawSettings.businessName : '',
    whatsAppTemplate:
      typeof rawSettings.whatsAppTemplate === 'string' ? rawSettings.whatsAppTemplate : '',
    notificationsEnabled: Boolean(rawSettings.notificationsEnabled),
    lastBackupAt:
      typeof rawSettings.lastBackupAt === 'string' ? rawSettings.lastBackupAt : undefined,
    updateManifestUrl:
      typeof rawSettings.updateManifestUrl === 'string'
        ? rawSettings.updateManifestUrl.trim()
        : DEFAULT_UPDATE_MANIFEST_URL,
    lastUpdateCheckAt:
      typeof rawSettings.lastUpdateCheckAt === 'string'
        ? rawSettings.lastUpdateCheckAt
        : undefined,
    accountRegistered: inferredRegistered,
    accountSignedOut: Boolean(inferredRegistered && rawSettings.accountSignedOut),
    account,
    emailBackup,
    driveBackup,
  };

  return {
    version: 1,
    initialized: data.initialized ?? true,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    contacts,
    transactions,
    settings,
  };
}

export function loadDatabaseSync(): {
  db: LedgerDatabase;
  fromLocalStorage: boolean;
  idbAhead: boolean;
} {
  let idbAhead = false;
  try {
    idbAhead = window.localStorage.getItem(LS_IDB_AHEAD_KEY) === '1';
  } catch {
    idbAhead = false;
  }

  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = normalizeLoadedDb(JSON.parse(raw));
      if (parsed) return { db: parsed, fromLocalStorage: true, idbAhead };
    }
  } catch {
    // Ignore LocalStorage parse/quota errors
  }

  const initial = createInitialDatabase('fr');
  return { db: initial, fromLocalStorage: false, idbAhead: true };
}

let idbWriteQueue: Promise<void> = Promise.resolve();

export function saveDatabaseSync(db: LedgerDatabase): void {
  const persisted: LedgerDatabase = {
    ...db,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(persisted));
    window.localStorage.removeItem(LS_IDB_AHEAD_KEY);
  } catch {
    // LocalStorage (~5MB) exceeded, likely from receipt images:
    // Save a lightweight attachment-free mirror so PIN/settings remain instant,
    // and mark IndexedDB as authoritative until storage fits again.
    try {
      const compact: LedgerDatabase = {
        ...persisted,
        transactions: persisted.transactions.map((tx) =>
          tx.attachmentDataUrl ? { ...tx, attachmentDataUrl: undefined } : tx
        ),
      };
      window.localStorage.setItem(LS_KEY, JSON.stringify(compact));
      window.localStorage.setItem(LS_IDB_AHEAD_KEY, '1');
    } catch {
      try {
        window.localStorage.setItem(LS_IDB_AHEAD_KEY, '1');
      } catch {
        // Storage completely locked
      }
    }
  }

  idbWriteQueue = idbWriteQueue.then(() => writeToIndexedDB(persisted));
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB non disponible'));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeToIndexedDB(dbState: LedgerDatabase): Promise<void> {
  try {
    const idb = await openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(dbState, IDB_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    idb.close();
  } catch {
    // IndexedDB fallback fails silently when unavailable
  }
}

export async function loadFromIndexedDB(): Promise<LedgerDatabase | null> {
  try {
    const idb = await openIDB();
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_RECORD_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    idb.close();
    return normalizeLoadedDb(result);
  } catch {
    return null;
  }
}

export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
