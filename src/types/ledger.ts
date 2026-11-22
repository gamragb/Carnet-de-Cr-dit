export type AppLanguage = 'fr' | 'ar';
export type AppTheme = 'light' | 'dark';
export type AccountUsageType = 'business' | 'personal';

export interface UserAccountProfile {
  fullName: string;
  phone: string;
  email?: string;
  usageType: AccountUsageType;
  createdAt: string;
}

export interface EmailBackupSettings {
  enabled: boolean;
  email: string;
  intervalHours: number;
  lastBackupAt?: string;
  lastError?: string;
  needsActivation?: boolean;
}

export interface DriveBackupSettings {
  enabled: boolean;
  connected: boolean;
  email: string;
  intervalHours: number;
  fileId?: string;
  lastBackupAt?: string;
  lastError?: string;
  needsReauth?: boolean;
  webClientId?: string;
}

export type ContactCategory = 'Client' | 'Fournisseur' | 'Famille/Ami' | 'Autre';

export type TransactionType =
  | 'credit_given'     // J'ai donné / Crédit accordé (+) -> ils me doivent plus
  | 'payment_received' // J'ai reçu / Remboursement (-)   -> ils me remboursent
  | 'credit_taken'     // J'ai pris à crédit (-)         -> je leur dois plus
  | 'payment_made';    // J'ai payé (+)                  -> je les rembourse

export type PaymentMethod =
  | 'Espèces'
  | 'Virement CIH/Banque'
  | 'Chèque'
  | 'Marchandise';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  category: ContactCategory;
  note?: string;
  creditLimit?: number;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  contactId: string;
  type: TransactionType;
  amount: number;
  occurredAt: string; // ISO local/UTC datetime string (YYYY-MM-DDTHH:mm)
  dueDate?: string;   // YYYY-MM-DD
  dueResolved?: boolean;
  paymentMethod: PaymentMethod;
  note: string;
  reference?: string;
  isDiscount?: boolean;
  attachmentDataUrl?: string;
  attachmentName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  pinHash: string | null;
  pinEnabled: boolean;
  pinRecoveryQuestion?: string;
  pinRecoveryHash?: string | null;
  autoLockMinutes: number; // 0 = disabled, 1, 5, 15
  hideAmounts: boolean;
  businessName: string;
  language: AppLanguage;
  theme: AppTheme;
  hideDecimals: boolean;
  csvDelimiter: ';' | ',';
  whatsAppTemplate: string;
  notificationsEnabled: boolean;
  lastBackupAt?: string;
  updateManifestUrl?: string;
  lastUpdateCheckAt?: string;
  accountRegistered?: boolean;
  accountSignedOut?: boolean;
  account?: UserAccountProfile;
  emailBackup?: EmailBackupSettings;
  driveBackup?: DriveBackupSettings;
}

export interface LedgerDatabase {
  version: 1;
  initialized: boolean;
  updatedAt?: string;
  contacts: Contact[];
  transactions: Transaction[];
  settings: AppSettings;
}

export type DashboardFilter = 'all' | 'receivable' | 'payable' | 'overdue';

export interface DueItemStatus {
  transaction: Transaction;
  contact: Contact;
  remainingAmount: number;
  isSettled: boolean;
  daysDiff: number; // < 0 means overdue by abs(daysDiff) days, 0 means today, > 0 means days left
  urgency: 'overdue' | 'today' | 'soon' | 'upcoming' | 'settled';
}

export interface ContactSummary {
  contact: Contact;
  balance: number; // > 0: on me doit (receivable), < 0: je dois (payable), 0: soldé
  totalCreditGiven: number;
  totalPaymentReceived: number;
  totalCreditTaken: number;
  totalPaymentMade: number;
  totalDiscounts: number;
  transactionCount: number;
  lastTransaction: Transaction | null;
  nextDue: DueItemStatus | null;
  overdueCount: number;
  upcomingSoonCount: number;
  isOverdue: boolean;
  isOverCreditLimit: boolean;
}

export interface LedgerEntryWithBalance {
  transaction: Transaction;
  signedAmount: number;
  runningBalance: number;
  dueStatus: DueItemStatus | null;
}

export interface GlobalTotals {
  totalReceivable: number; // Créances (on me doit)
  totalPayable: number;    // Dettes (je dois)
  netBalance: number;      // Solde Net
  receivableCount: number;
  payableCount: number;
  settledCount: number;
  archivedCount: number;
  overdueContactsCount: number;
  overdueItemsCount: number;
  soonItemsCount: number;
}

export interface AnalyticsSnapshot {
  monthKey: string;
  monthCreditGiven: number;
  monthPaymentReceived: number;
  monthCreditTaken: number;
  monthPaymentMade: number;
  collectionRatePct: number;
  topDebtors: ContactSummary[];
  topCreditors: ContactSummary[];
  byCategory: Array<{
    category: ContactCategory;
    count: number;
    receivable: number;
    payable: number;
  }>;
  monthlySeries: Array<{
    month: string; // YYYY-MM
    creditGiven: number;
    paymentReceived: number;
  }>;
}
