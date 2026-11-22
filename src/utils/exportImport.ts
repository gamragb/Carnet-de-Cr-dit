import {
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  TX_TYPE_LABELS,
} from '../i18n/translations.ts';
import type {
  AccountUsageType,
  AppLanguage,
  Contact,
  ContactCategory,
  DueItemStatus,
  LedgerDatabase,
  PaymentMethod,
  Transaction,
  TransactionType,
  UserAccountProfile,
} from '../types/ledger.ts';
import {
  formatDateTimeFR,
  formatMoroccanPhone,
  getTodayISODate,
  normalizeSearchPhone,
  parseMoneyInput,
  roundMoney,
} from './formatters.ts';
import { computeAllLedgers, TRANSACTION_TYPE_META } from './ledgerMath.ts';
import { isNativeApp, shareOrSaveNativeTextFile } from './nativePlatform.ts';
import { generateId } from './storage.ts';

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

export interface BackupPayload {
  app: 'carnet-de-credit';
  version: 1;
  exportedAt: string;
  contacts: Contact[];
  transactions: Transaction[];
  settings?: {
    businessName?: string;
    hideAmounts?: boolean;
    language?: AppLanguage;
    hideDecimals?: boolean;
    csvDelimiter?: ';' | ',';
    whatsAppTemplate?: string;
    account?: UserAccountProfile;
  };
}

export interface ParsedBackupResult {
  contacts: Contact[];
  transactions: Transaction[];
  businessName?: string;
  language?: AppLanguage;
  hideDecimals?: boolean;
  csvDelimiter?: ';' | ',';
  whatsAppTemplate?: string;
  account?: UserAccountProfile;
}

export function buildJSONBackup(db: LedgerDatabase): string {
  const payload: BackupPayload = {
    app: 'carnet-de-credit',
    version: 1,
    exportedAt: new Date().toISOString(),
    contacts: db.contacts,
    transactions: db.transactions,
    settings: {
      businessName: db.settings.businessName,
      hideAmounts: db.settings.hideAmounts,
      language: db.settings.language,
      hideDecimals: db.settings.hideDecimals,
      csvDelimiter: db.settings.csvDelimiter,
      whatsAppTemplate: db.settings.whatsAppTemplate,
      account: db.settings.account,
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function parseAndValidateBackupJSON(
  rawText: string,
  lang: AppLanguage = 'fr'
): ParsedBackupResult {
  const isAr = lang === 'ar';
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(
      isAr
        ? 'الملف المحدد ليس ملف JSON صالحاً.'
        : 'Le fichier sélectionné n’est pas un JSON valide.'
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      isAr ? 'تنسيق ملف النسخة الاحتياطية غير صالح.' : 'Format de sauvegarde invalide.'
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.contacts) || !Array.isArray(obj.transactions)) {
    throw new Error(
      isAr
        ? 'بنية الملف غير صالحة: قائمتا "contacts" و"transactions" مطلوبتان.'
        : 'Structure invalide : listes "contacts" et "transactions" requises.'
    );
  }

  const nowISO = new Date().toISOString();
  const seenContactIds = new Set<string>();
  const contacts: Contact[] = obj.contacts.map((raw, index) => {
    const rowNum = index + 1;
    if (!raw || typeof raw !== 'object') {
      throw new Error(
        isAr ? `بيانات الشخص رقم ${rowNum} غير صالحة.` : `Contact #${rowNum} invalide.`
      );
    }
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id.trim()) {
      throw new Error(
        isAr
          ? `الشخص رقم ${rowNum}: المعرّف مفقود.`
          : `Contact #${rowNum} : identifiant manquant.`
      );
    }
    const cleanId = c.id.trim();
    if (seenContactIds.has(cleanId)) {
      throw new Error(
        isAr
          ? `الشخص رقم ${rowNum}: معرّف مكرر.`
          : `Contact #${rowNum} : identifiant dupliqué.`
      );
    }
    seenContactIds.add(cleanId);

    if (typeof c.name !== 'string' || !c.name.trim()) {
      throw new Error(
        isAr
          ? `الشخص رقم ${rowNum}: الاسم مفقود.`
          : `Contact #${rowNum} : nom manquant.`
      );
    }
    const category = VALID_CATEGORIES.has(c.category as ContactCategory)
      ? (c.category as ContactCategory)
      : 'Autre';

    const creditLimit =
      typeof c.creditLimit === 'number' && Number.isFinite(c.creditLimit) && c.creditLimit > 0
        ? roundMoney(c.creditLimit)
        : undefined;

    return {
      id: cleanId,
      name: c.name.trim(),
      phone: typeof c.phone === 'string' ? c.phone.trim() : '',
      category,
      note: typeof c.note === 'string' && c.note.trim() ? c.note.trim() : undefined,
      creditLimit,
      archived: Boolean(c.archived),
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : nowISO,
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : nowISO,
    };
  });

  const contactIds = new Set(contacts.map((c) => c.id));
  const seenTxIds = new Set<string>();

  const transactions: Transaction[] = obj.transactions.map((raw, index) => {
    const rowNum = index + 1;
    if (!raw || typeof raw !== 'object') {
      throw new Error(
        isAr
          ? `العملية رقم ${rowNum} غير صالحة.`
          : `Opération #${rowNum} invalide.`
      );
    }
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== 'string' || !t.id.trim()) {
      throw new Error(
        isAr
          ? `العملية رقم ${rowNum}: المعرّف مفقود.`
          : `Opération #${rowNum} : identifiant manquant.`
      );
    }
    const cleanTxId = t.id.trim();
    if (seenTxIds.has(cleanTxId)) {
      throw new Error(
        isAr
          ? `العملية رقم ${rowNum}: معرّف مكرر.`
          : `Opération #${rowNum} : identifiant dupliqué.`
      );
    }
    seenTxIds.add(cleanTxId);

    if (typeof t.contactId !== 'string' || !contactIds.has(t.contactId)) {
      throw new Error(
        isAr
          ? `العملية رقم ${rowNum}: الشخص المرتبط غير موجود.`
          : `Opération #${rowNum} : contact associé introuvable.`
      );
    }
    if (!VALID_TYPES.has(t.type as TransactionType)) {
      throw new Error(
        isAr
          ? `العملية رقم ${rowNum}: نوع العملية غير معروف.`
          : `Opération #${rowNum} : type d'opération inconnu.`
      );
    }
    const amountNum = Number(t.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new Error(
        isAr
          ? `العملية رقم ${rowNum}: المبلغ غير صالح.`
          : `Opération #${rowNum} : montant invalide.`
      );
    }

    const paymentMethod = VALID_METHODS.has(t.paymentMethod as PaymentMethod)
      ? (t.paymentMethod as PaymentMethod)
      : 'Espèces';

    const rawOccurred =
      typeof t.occurredAt === 'string' && t.occurredAt.trim()
        ? t.occurredAt.trim()
        : nowISO.slice(0, 16);
    const occurredAt = /^\d{4}-\d{2}-\d{2}/.test(rawOccurred)
      ? rawOccurred
      : nowISO.slice(0, 16);

    return {
      id: cleanTxId,
      contactId: t.contactId,
      type: t.type as TransactionType,
      amount: roundMoney(amountNum),
      occurredAt,
      dueDate:
        typeof t.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)
          ? t.dueDate
          : undefined,
      dueResolved: Boolean(t.dueResolved),
      paymentMethod,
      note: typeof t.note === 'string' ? t.note.trim() : '',
      reference:
        typeof t.reference === 'string' && t.reference.trim()
          ? t.reference.trim()
          : undefined,
      isDiscount: Boolean(t.isDiscount),
      attachmentDataUrl:
        typeof t.attachmentDataUrl === 'string' &&
        /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(t.attachmentDataUrl)
          ? t.attachmentDataUrl
          : undefined,
      attachmentName:
        typeof t.attachmentName === 'string' ? t.attachmentName : undefined,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowISO,
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : nowISO,
    };
  });

  const settingsObj =
    obj.settings && typeof obj.settings === 'object'
      ? (obj.settings as Record<string, unknown>)
      : undefined;

  const rawAccount =
    settingsObj && settingsObj.account && typeof settingsObj.account === 'object'
      ? (settingsObj.account as Record<string, unknown>)
      : undefined;

  const account: UserAccountProfile | undefined =
    rawAccount && typeof rawAccount.fullName === 'string' && rawAccount.fullName.trim()
      ? {
          fullName: rawAccount.fullName.trim(),
          phone: typeof rawAccount.phone === 'string' ? rawAccount.phone.trim() : '',
          usageType:
            rawAccount.usageType === 'personal'
              ? ('personal' as AccountUsageType)
              : ('business' as AccountUsageType),
          createdAt: typeof rawAccount.createdAt === 'string' ? rawAccount.createdAt : nowISO,
        }
      : undefined;

  return {
    contacts,
    transactions,
    businessName:
      settingsObj && typeof settingsObj.businessName === 'string'
        ? settingsObj.businessName.trim()
        : undefined,
    language:
      settingsObj && (settingsObj.language === 'ar' || settingsObj.language === 'fr')
        ? settingsObj.language
        : undefined,
    hideDecimals:
      settingsObj && typeof settingsObj.hideDecimals === 'boolean'
        ? settingsObj.hideDecimals
        : undefined,
    csvDelimiter:
      settingsObj && (settingsObj.csvDelimiter === ';' || settingsObj.csvDelimiter === ',')
        ? settingsObj.csvDelimiter
        : undefined,
    whatsAppTemplate:
      settingsObj && typeof settingsObj.whatsAppTemplate === 'string'
        ? settingsObj.whatsAppTemplate
        : undefined,
    account,
  };
}

export function mergeBackupDatabases(
  currentContacts: Contact[],
  currentTransactions: Transaction[],
  imported: Pick<ParsedBackupResult, 'contacts' | 'transactions'>
): {
  contacts: Contact[];
  transactions: Transaction[];
  addedContacts: number;
  addedTransactions: number;
} {
  const mergedContacts = [...currentContacts];
  const byId = new Map<string, Contact>();
  const byNamePhone = new Map<string, Contact>();

  for (const c of mergedContacts) {
    byId.set(c.id, c);
    const normPhone = normalizeSearchPhone(c.phone);
    if (normPhone.length >= 6) {
      byNamePhone.set(`${c.name.trim().toLowerCase()}::${normPhone}`, c);
    }
  }

  const contactIdRemap = new Map<string, string>();
  let addedContacts = 0;

  for (const imp of imported.contacts) {
    const existingById = byId.get(imp.id);
    if (existingById) {
      contactIdRemap.set(imp.id, existingById.id);
      continue;
    }

    const normPhone = normalizeSearchPhone(imp.phone);
    const key = normPhone.length >= 6 ? `${imp.name.trim().toLowerCase()}::${normPhone}` : '';
    const existingMatch = key ? byNamePhone.get(key) : undefined;
    if (existingMatch) {
      contactIdRemap.set(imp.id, existingMatch.id);
      continue;
    }

    mergedContacts.push(imp);
    byId.set(imp.id, imp);
    if (key) byNamePhone.set(key, imp);
    contactIdRemap.set(imp.id, imp.id);
    addedContacts += 1;
  }

  const seenTxIds = new Set(currentTransactions.map((t) => t.id));
  const mergedTransactions = [...currentTransactions];
  let addedTransactions = 0;

  for (const tx of imported.transactions) {
    if (seenTxIds.has(tx.id)) continue;
    const mappedContactId = contactIdRemap.get(tx.contactId) ?? tx.contactId;
    if (!byId.has(mappedContactId)) continue;
    seenTxIds.add(tx.id);
    mergedTransactions.push({ ...tx, contactId: mappedContactId });
    addedTransactions += 1;
  }

  return {
    contacts: mergedContacts,
    transactions: mergedTransactions,
    addedContacts,
    addedTransactions,
  };
}

function escapeCsvCell(value: string, protectFormula = true): string {
  let safe = value ?? '';
  if (protectFormula && /^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildTransactionsCSV(
  contacts: Contact[],
  transactions: Transaction[],
  todayISO: string = getTodayISODate(),
  lang: AppLanguage = 'fr',
  delimiter: ',' | ';' = ','
): string {
  const { summaries } = computeAllLedgers(contacts, transactions, todayISO);
  const summaryByContact = new Map(summaries.map((s) => [s.contact.id, s]));

  const headers =
    lang === 'ar'
      ? [
          'التاريخ',
          'الوقت',
          'الشخص',
          'الهاتف',
          'الفئة',
          'نوع العملية',
          'الاتجاه',
          'المبلغ (درهم)',
          'طريقة الأداء',
          'المرجع',
          'تخفيض',
          'تاريخ الأجل',
          'الملاحظة',
          'الرصيد الحالي للشخص (درهم)',
        ]
      : [
          'Date',
          'Heure',
          'Contact',
          'Téléphone',
          'Catégorie',
          "Type d'opération",
          'Sens',
          'Montant (DH)',
          'Mode de paiement',
          'Référence',
          'Remise',
          "Date d'échéance",
          'Motif / Note',
          'Solde actuel du contact (DH)',
        ];

  const sortedTx = [...transactions].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt)
  );

  const rows = sortedTx.map((tx) => {
    const summary = summaryByContact.get(tx.contactId);
    const contact = summary?.contact;
    const meta = TRANSACTION_TYPE_META[tx.type];
    const { date, time } = formatDateTimeFR(tx.occurredAt, lang);
    const typeLabel = TX_TYPE_LABELS[lang][tx.type].label;
    const catLabel = contact ? CATEGORY_LABELS[lang][contact.category] : '';
    const methodLabel = PAYMENT_METHOD_LABELS[lang][tx.paymentMethod];
    const dirLabel =
      lang === 'ar'
        ? meta.sign > 0
          ? 'موجب (+)'
          : 'سالب (-)'
        : meta.sign > 0
          ? 'Positif (+)'
          : 'Négatif (-)';
    const deletedFallback = lang === 'ar' ? 'شخص محذوف' : 'Contact supprimé';
    const discountLabel = tx.isDiscount
      ? lang === 'ar'
        ? 'نعم'
        : 'Oui'
      : '';

    return [
      escapeCsvCell(tx.occurredAt.slice(0, 10) || date),
      escapeCsvCell(time),
      escapeCsvCell(contact?.name ?? deletedFallback),
      escapeCsvCell(contact?.phone ?? ''),
      escapeCsvCell(catLabel),
      escapeCsvCell(typeLabel),
      escapeCsvCell(dirLabel),
      roundMoney(tx.amount).toFixed(2),
      escapeCsvCell(methodLabel),
      escapeCsvCell(tx.reference ?? ''),
      escapeCsvCell(discountLabel),
      escapeCsvCell(tx.dueDate ?? ''),
      escapeCsvCell(tx.note ?? ''),
      roundMoney(summary?.balance ?? 0).toFixed(2),
    ].join(delimiter);
  });

  // UTF-8 BOM for clean French & Arabic rendering in Excel
  return `\uFEFF${[headers.map((h) => escapeCsvCell(h)).join(delimiter), ...rows].join('\r\n')}`;
}

function parseCsvRows(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function stripFormulaPrefix(val: string): string {
  const trimmed = val.trim();
  if (trimmed.startsWith("'") && trimmed.length > 1 && /^[=+\-@\t\r]/.test(trimmed[1])) {
    return trimmed.slice(1);
  }
  return trimmed;
}

function resolveCategoryFromCsv(raw: string): ContactCategory {
  const v = raw.trim().toLowerCase();
  if (v.includes('client') || v.includes('زبون')) return 'Client';
  if (v.includes('fournisseur') || v.includes('مورد')) return 'Fournisseur';
  if (v.includes('famille') || v.includes('ami') || v.includes('عائلة') || v.includes('صديق'))
    return 'Famille/Ami';
  return 'Autre';
}

function resolveMethodFromCsv(raw: string): PaymentMethod {
  const v = raw.trim().toLowerCase();
  if (v.includes('virement') || v.includes('cih') || v.includes('بنكي') || v.includes('تحويل'))
    return 'Virement CIH/Banque';
  if (v.includes('chèque') || v.includes('cheque') || v.includes('شيك')) return 'Chèque';
  if (v.includes('marchandise') || v.includes('بضاعة') || v.includes('سلعة'))
    return 'Marchandise';
  return 'Espèces';
}

function resolveTypeFromCsv(raw: string, sens: string): TransactionType {
  const v = raw.trim().toLowerCase();
  const s = sens.trim().toLowerCase();
  if (
    v.includes('reçu') ||
    v.includes('remboursement') ||
    v.includes('acompte') ||
    v.includes('شديت') ||
    v.includes('خلاص') ||
    v.includes('استخلاص') ||
    v === 'payment_received'
  ) {
    return 'payment_received';
  }
  if (
    v.includes('pris') ||
    v.includes('خديت') ||
    v.includes('كريدي خديتو') ||
    v === 'credit_taken'
  ) {
    return 'credit_taken';
  }
  if (
    v.includes('payé') ||
    v.includes('paiement') ||
    v.includes('règlement') ||
    v.includes('reglement') ||
    v.includes('خلصت') ||
    v.includes('دفع') ||
    v.includes('أداء') ||
    v.includes('سداد') ||
    v === 'payment_made'
  ) {
    return 'payment_made';
  }
  if (
    v.includes('donné') ||
    v.includes('accordé') ||
    v.includes('عطيت') ||
    v.includes('سلف') ||
    v.includes('قرض') ||
    v === 'credit_given'
  ) {
    return 'credit_given';
  }
  if (v.includes('تسبيق')) {
    return s.includes('-') || s.includes('سالب') ? 'payment_received' : 'payment_made';
  }
  return s.includes('-') || s.includes('سالب') ? 'credit_taken' : 'credit_given';
}

function txFingerprint(
  contactId: string,
  type: TransactionType,
  amount: number,
  occurredAt: string,
  note: string
): string {
  return `${contactId}|${type}|${roundMoney(amount).toFixed(2)}|${occurredAt.slice(0, 16)}|${note.trim().toLowerCase()}`;
}

export function parseTransactionsCSV(
  rawCsv: string,
  existingContacts: Contact[],
  lang: AppLanguage = 'fr',
  existingTransactions: Transaction[] = []
): {
  contacts: Contact[];
  transactions: Transaction[];
  addedContacts: number;
  addedTransactions: number;
  skippedRows: number;
} {
  const isAr = lang === 'ar';
  let text = rawCsv.replace(/^\uFEFF/, '');
  const firstLineEnd = text.search(/\r?\n/);
  let explicitDelimiter: ',' | ';' | null = null;
  if (firstLineEnd > 0) {
    const firstLine = text.slice(0, firstLineEnd).trim().toLowerCase();
    if (firstLine === 'sep=;' || firstLine === 'sep=,') {
      explicitDelimiter = firstLine.endsWith(';') ? ';' : ',';
      text = text.slice(firstLineEnd + 1).replace(/^\n/, '');
    }
  }

  const headerLine = text.split(/\r?\n/, 1)[0] ?? '';
  const semiCount = (headerLine.match(/;/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delimiter: ',' | ';' =
    explicitDelimiter ?? (semiCount >= commaCount && semiCount > 0 ? ';' : ',');

  const rows = parseCsvRows(text, delimiter);
  if (rows.length < 2) {
    throw new Error(
      isAr ? 'ملف CSV فارغ أو لا يحتوي على عمليات.' : 'Fichier CSV vide ou sans opérations.'
    );
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const findCol = (...patterns: string[]): number =>
    headers.findIndex((h) => patterns.some((p) => h.includes(p)));

  const colDate = findCol('date', 'التاريخ');
  const colTime = findCol('heure', 'الوقت');
  const colContact = findCol('contact', 'nom', 'personne', 'الشخص', 'الاسم');
  const colPhone = findCol('téléphone', 'telephone', 'tel', 'الهاتف');
  const colCategory = findCol('catégorie', 'categorie', 'الفئة');
  const colType = findCol('type', 'نوع');
  const colSens = findCol('sens', 'الاتجاه');
  const colAmount = findCol('montant', 'المبلغ');
  const colMethod = findCol('mode', 'طريقة');
  const colRef = findCol('référence', 'reference', 'المرجع');
  const colDiscount = findCol('remise', 'تخفيض');
  const colDue = findCol('échéance', 'echeance', 'الأجل');
  const colNote = findCol('motif', 'note', 'الملاحظة');

  if (colContact === -1 || colAmount === -1) {
    throw new Error(
      isAr
        ? 'أعمدة CSV غير متطابقة: عمودا الشخص والمبلغ مطلوبان.'
        : 'Colonnes CSV non reconnues : Contact et Montant requis.'
    );
  }

  const nowISO = new Date().toISOString();
  const workingContacts = [...existingContacts];
  const byNamePhone = new Map<string, Contact>();
  const byNameOnly = new Map<string, Contact>();
  for (const c of workingContacts) {
    const normP = normalizeSearchPhone(c.phone);
    if (normP.length >= 6) {
      byNamePhone.set(`${c.name.trim().toLowerCase()}::${normP}`, c);
    }
    if (!byNameOnly.has(c.name.trim().toLowerCase())) {
      byNameOnly.set(c.name.trim().toLowerCase(), c);
    }
  }

  const seenFingerprints = new Set(
    existingTransactions.map((tx) =>
      txFingerprint(tx.contactId, tx.type, tx.amount, tx.occurredAt, tx.note)
    )
  );

  const newTransactions: Transaction[] = [];
  let addedContacts = 0;
  let skippedRows = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const rawName = stripFormulaPrefix(r[colContact] ?? '');
    const amount = parseMoneyInput(r[colAmount] ?? '');
    if (!rawName || amount === null) {
      skippedRows += 1;
      continue;
    }

    const rawPhone = colPhone >= 0 ? formatMoroccanPhone(stripFormulaPrefix(r[colPhone] ?? '')) : '';
    const normPhone = normalizeSearchPhone(rawPhone);
    const key = normPhone.length >= 6 ? `${rawName.toLowerCase()}::${normPhone}` : '';

    const nameMatch = byNameOnly.get(rawName.toLowerCase());
    let contact = key
      ? byNamePhone.get(key) ??
        (nameMatch && normalizeSearchPhone(nameMatch.phone).length < 6
          ? nameMatch
          : undefined)
      : nameMatch;
    if (!contact) {
      contact = {
        id: generateId('contact'),
        name: rawName,
        phone: rawPhone,
        category: colCategory >= 0 ? resolveCategoryFromCsv(r[colCategory] ?? '') : 'Autre',
        createdAt: nowISO,
        updatedAt: nowISO,
      };
      workingContacts.push(contact);
      if (!byNameOnly.has(rawName.toLowerCase())) {
        byNameOnly.set(rawName.toLowerCase(), contact);
      }
      if (key) byNamePhone.set(key, contact);
      addedContacts += 1;
    }

    const rawDate = colDate >= 0 ? (r[colDate] ?? '').trim() : '';
    const rawTime = colTime >= 0 ? (r[colTime] ?? '').trim() : '';
    let isoDate = getTodayISODate();
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      isoDate = rawDate.slice(0, 10);
    } else if (/^(\d{2})\/(\d{2})\/(\d{4})$/.test(rawDate)) {
      const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) isoDate = `${m[3]}-${m[2]}-${m[1]}`;
    }
    const timePart = /^\d{2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5) : '12:00';
    const occurredAt = `${isoDate}T${timePart}`;

    const resolvedType = resolveTypeFromCsv(
      colType >= 0 ? r[colType] ?? '' : '',
      colSens >= 0 ? r[colSens] ?? '' : ''
    );
    const parsedNote = colNote >= 0 ? stripFormulaPrefix(r[colNote] ?? '') : '';
    const fp = txFingerprint(contact.id, resolvedType, amount, occurredAt, parsedNote);
    if (seenFingerprints.has(fp)) {
      skippedRows += 1;
      continue;
    }
    seenFingerprints.add(fp);

    const rawDue = colDue >= 0 ? (r[colDue] ?? '').trim() : '';
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : undefined;

    const rawDiscount = colDiscount >= 0 ? (r[colDiscount] ?? '').trim().toLowerCase() : '';
    const isDiscount =
      rawDiscount === 'oui' || rawDiscount === 'نعم' || rawDiscount === 'true';

    newTransactions.push({
      id: generateId('tx'),
      contactId: contact.id,
      type: resolvedType,
      amount,
      occurredAt,
      dueDate,
      dueResolved: false,
      paymentMethod: colMethod >= 0 ? resolveMethodFromCsv(r[colMethod] ?? '') : 'Espèces',
      reference: colRef >= 0 ? stripFormulaPrefix(r[colRef] ?? '') || undefined : undefined,
      isDiscount: isDiscount || undefined,
      note: parsedNote,
      createdAt: nowISO,
      updatedAt: nowISO,
    });
  }

  return {
    contacts: workingContacts,
    transactions: newTransactions,
    addedContacts,
    addedTransactions: newTransactions.length,
    skippedRows,
  };
}

function escapeIcsText(val: string): string {
  return val
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function nextDayCompactICS(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate.replace(/-/g, '');
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

export function buildDueCalendarICS(
  dueItems: DueItemStatus[],
  lang: AppLanguage = 'fr'
): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = dueItems
    .filter((d) => d.transaction.dueDate && !d.isSettled)
    .map((item) => {
      const dueDateISO = item.transaction.dueDate ?? '';
      const dueCompact = dueDateISO.replace(/-/g, '');
      const dueEndCompact = nextDayCompactICS(dueDateISO);
      const isReceivable =
        item.transaction.type === 'credit_given' ||
        item.transaction.type === 'payment_made';
      const summary =
        lang === 'ar'
          ? `${isReceivable ? 'تحصيل دين' : 'أداء دين'}: ${item.contact.name} (${item.remainingAmount} د.م)`
          : `${isReceivable ? 'Échéance à encaisser' : 'Échéance à payer'} : ${item.contact.name} (${item.remainingAmount} DH)`;
      const desc = item.transaction.note
        ? escapeIcsText(item.transaction.note)
        : escapeIcsText(summary);

      return [
        'BEGIN:VEVENT',
        `UID:${item.transaction.id}@carnet-credit`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dueCompact}`,
        `DTEND;VALUE=DATE:${dueEndCompact}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${desc}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(summary)}`,
        'TRIGGER:PT9H',
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carnet de Credit//FR',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  if (isNativeApp()) {
    void shareOrSaveNativeTextFile(content, filename);
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
