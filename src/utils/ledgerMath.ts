import { CATEGORY_LABELS } from '../i18n/translations.ts';
import type {
  AnalyticsSnapshot,
  AppLanguage,
  Contact,
  ContactCategory,
  ContactSummary,
  DashboardFilter,
  DueItemStatus,
  GlobalTotals,
  LedgerEntryWithBalance,
  Transaction,
  TransactionType,
} from '../types/ledger.ts';
import {
  daysBetweenISODates,
  getTodayISODate,
  normalizeSearchPhone,
  roundMoney,
} from './formatters.ts';

export interface TransactionTypeMeta {
  type: TransactionType;
  label: string;
  shortLabel: string;
  signLabel: '+' | '-';
  sign: 1 | -1;
  directionHint: string;
}

export const TRANSACTION_TYPE_META: Record<TransactionType, TransactionTypeMeta> = {
  credit_given: {
    type: 'credit_given',
    label: "J'ai donné / Crédit accordé (+)",
    shortLabel: 'Crédit accordé',
    signLabel: '+',
    sign: 1,
    directionHint: 'Ils vous doivent davantage',
  },
  payment_received: {
    type: 'payment_received',
    label: "J'ai reçu / Remboursement (-)",
    shortLabel: 'Remboursement reçu',
    signLabel: '-',
    sign: -1,
    directionHint: 'Réduit ce que le contact vous doit',
  },
  credit_taken: {
    type: 'credit_taken',
    label: "J'ai pris à crédit (-)",
    shortLabel: 'Pris à crédit',
    signLabel: '-',
    sign: -1,
    directionHint: 'Vous leur devez davantage',
  },
  payment_made: {
    type: 'payment_made',
    label: "J'ai payé (+)",
    shortLabel: 'Paiement effectué',
    signLabel: '+',
    sign: 1,
    directionHint: 'Réduit ce que vous devez',
  },
};

export function getSignedAmount(tx: Pick<Transaction, 'type' | 'amount'>): number {
  const sign = TRANSACTION_TYPE_META[tx.type].sign;
  return roundMoney(sign * Math.abs(tx.amount));
}

export function sortTransactionsChronological(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const timeDiff = a.occurredAt.localeCompare(b.occurredAt);
    if (timeDiff !== 0) return timeDiff;
    const createdDiff = a.createdAt.localeCompare(b.createdAt);
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function consumeQueue(
  queue: Array<{ txIndex: number; remaining: number }>,
  amount: number
): number {
  let toApply = amount;
  for (const item of queue) {
    if (toApply <= 0) break;
    if (item.remaining <= 0) continue;
    const used = Math.min(item.remaining, toApply);
    item.remaining = roundMoney(item.remaining - used);
    toApply = roundMoney(toApply - used);
  }
  return toApply;
}

/**
 * Computes chronological running balances and symmetric FIFO settlement per contact.
 * Credits (+) are settled by repayments (-) and vice-versa, including pre-payments / advances
 * recorded before an obligation.
 */
export function computeContactLedger(
  contact: Contact,
  contactTransactions: Transaction[],
  todayISO: string = getTodayISODate()
): {
  entries: LedgerEntryWithBalance[];
  summary: ContactSummary;
  dueItems: DueItemStatus[];
} {
  const chronological = sortTransactionsChronological(contactTransactions);

  let runningBalance = 0;
  let totalCreditGiven = 0;
  let totalPaymentReceived = 0;
  let totalCreditTaken = 0;
  let totalPaymentMade = 0;
  let totalDiscounts = 0;

  const openReceivables: Array<{ txIndex: number; remaining: number }> = [];
  const openPayables: Array<{ txIndex: number; remaining: number }> = [];
  const openReceivedAdvances: Array<{ txIndex: number; remaining: number }> = [];
  const openMadeAdvances: Array<{ txIndex: number; remaining: number }> = [];

  const preliminary = chronological.map((tx, idx) => {
    const signed = getSignedAmount(tx);
    runningBalance = roundMoney(runningBalance + signed);

    const amount = roundMoney(Math.abs(tx.amount));
    if (tx.isDiscount) {
      totalDiscounts = roundMoney(totalDiscounts + amount);
    }

    switch (tx.type) {
      case 'credit_given': {
        totalCreditGiven = roundMoney(totalCreditGiven + amount);
        const leftover = consumeQueue(openReceivedAdvances, amount);
        openReceivables.push({ txIndex: idx, remaining: leftover });
        break;
      }
      case 'payment_received': {
        totalPaymentReceived = roundMoney(totalPaymentReceived + amount);
        const leftover = consumeQueue(openReceivables, amount);
        openReceivedAdvances.push({ txIndex: idx, remaining: leftover });
        break;
      }
      case 'credit_taken': {
        totalCreditTaken = roundMoney(totalCreditTaken + amount);
        const leftover = consumeQueue(openMadeAdvances, amount);
        openPayables.push({ txIndex: idx, remaining: leftover });
        break;
      }
      case 'payment_made': {
        totalPaymentMade = roundMoney(totalPaymentMade + amount);
        const leftover = consumeQueue(openPayables, amount);
        openMadeAdvances.push({ txIndex: idx, remaining: leftover });
        break;
      }
    }

    return {
      transaction: tx,
      signedAmount: signed,
      runningBalance,
    };
  });

  const remainingByIndex = new Map<number, number>();
  for (const r of openReceivables) remainingByIndex.set(r.txIndex, r.remaining);
  for (const p of openPayables) remainingByIndex.set(p.txIndex, p.remaining);
  for (const a of openReceivedAdvances) remainingByIndex.set(a.txIndex, a.remaining);
  for (const a of openMadeAdvances) remainingByIndex.set(a.txIndex, a.remaining);

  const netBalance = runningBalance;
  const dueItems: DueItemStatus[] = [];

  const entries: LedgerEntryWithBalance[] = preliminary.map((item, idx) => {
    const tx = item.transaction;
    if (!tx.dueDate) {
      return { ...item, dueStatus: null };
    }

    const fifoRemaining = remainingByIndex.get(idx) ?? 0;
    const isReceivableSide = tx.type === 'credit_given' || tx.type === 'payment_made';
    const isPayableSide = tx.type === 'credit_taken' || tx.type === 'payment_received';

    let effectiveRemaining = fifoRemaining;
    if (tx.dueResolved) {
      effectiveRemaining = 0;
    } else if (isReceivableSide && netBalance <= 0) {
      effectiveRemaining = 0;
    } else if (isPayableSide && netBalance >= 0) {
      effectiveRemaining = 0;
    } else if (isReceivableSide) {
      effectiveRemaining = Math.min(fifoRemaining, Math.max(0, netBalance));
    } else if (isPayableSide) {
      effectiveRemaining = Math.min(fifoRemaining, Math.max(0, Math.abs(netBalance)));
    }

    const isSettled = effectiveRemaining <= 0;
    const daysDiff = daysBetweenISODates(todayISO, tx.dueDate);

    let urgency: DueItemStatus['urgency'];
    if (isSettled) {
      urgency = 'settled';
    } else if (daysDiff < 0) {
      urgency = 'overdue';
    } else if (daysDiff === 0) {
      urgency = 'today';
    } else if (daysDiff <= 7) {
      urgency = 'soon';
    } else {
      urgency = 'upcoming';
    }

    const status: DueItemStatus = {
      transaction: tx,
      contact,
      remainingAmount: effectiveRemaining,
      isSettled,
      daysDiff,
      urgency,
    };
    dueItems.push(status);

    return {
      ...item,
      dueStatus: status,
    };
  });

  const activeDue = dueItems
    .filter((d) => !d.isSettled)
    .sort((a, b) => a.daysDiff - b.daysDiff);

  const overdueCount = activeDue.filter((d) => d.urgency === 'overdue').length;
  const upcomingSoonCount = activeDue.filter(
    (d) => d.urgency === 'today' || d.urgency === 'soon'
  ).length;

  const lastTransaction =
    chronological.length > 0 ? chronological[chronological.length - 1] : null;

  const isOverCreditLimit = Boolean(
    contact.creditLimit &&
      contact.creditLimit > 0 &&
      netBalance > contact.creditLimit
  );

  const summary: ContactSummary = {
    contact,
    balance: netBalance,
    totalCreditGiven,
    totalPaymentReceived,
    totalCreditTaken,
    totalPaymentMade,
    totalDiscounts,
    transactionCount: chronological.length,
    lastTransaction,
    nextDue: activeDue[0] ?? null,
    overdueCount,
    upcomingSoonCount,
    isOverdue: overdueCount > 0,
    isOverCreditLimit,
  };

  return { entries, summary, dueItems };
}

export function computeAllLedgers(
  contacts: Contact[],
  transactions: Transaction[],
  todayISO: string = getTodayISODate()
): {
  summaries: ContactSummary[];
  allDueItems: DueItemStatus[];
  totals: GlobalTotals;
} {
  const txByContact = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const list = txByContact.get(tx.contactId);
    if (list) list.push(tx);
    else txByContact.set(tx.contactId, [tx]);
  }

  const summaries: ContactSummary[] = [];
  const allDueItems: DueItemStatus[] = [];

  let totalReceivable = 0;
  let totalPayable = 0;
  let receivableCount = 0;
  let payableCount = 0;
  let settledCount = 0;
  let archivedCount = 0;
  let overdueContactsCount = 0;

  for (const contact of contacts) {
    const { summary, dueItems } = computeContactLedger(
      contact,
      txByContact.get(contact.id) ?? [],
      todayISO
    );
    summaries.push(summary);
    allDueItems.push(...dueItems);

    if (contact.archived) {
      archivedCount += 1;
      continue;
    }

    if (summary.balance > 0) {
      totalReceivable = roundMoney(totalReceivable + summary.balance);
      receivableCount += 1;
    } else if (summary.balance < 0) {
      totalPayable = roundMoney(totalPayable + Math.abs(summary.balance));
      payableCount += 1;
    } else {
      settledCount += 1;
    }

    if (summary.isOverdue) {
      overdueContactsCount += 1;
    }
  }

  const activeDueItems = allDueItems.filter((d) => !d.contact.archived);
  const overdueItemsCount = activeDueItems.filter((d) => d.urgency === 'overdue').length;
  const soonItemsCount = activeDueItems.filter(
    (d) => d.urgency === 'today' || d.urgency === 'soon'
  ).length;

  return {
    summaries,
    allDueItems: activeDueItems,
    totals: {
      totalReceivable,
      totalPayable,
      netBalance: roundMoney(totalReceivable - totalPayable),
      receivableCount,
      payableCount,
      settledCount,
      archivedCount,
      overdueContactsCount,
      overdueItemsCount,
      soonItemsCount,
    },
  };
}

export function filterContactSummaries(
  summaries: ContactSummary[],
  options: {
    search?: string;
    filter?: DashboardFilter;
    category?: ContactCategory | 'ALL';
    lang?: AppLanguage;
    includeArchived?: boolean;
    onlyArchived?: boolean;
  }
): ContactSummary[] {
  const query = (options.search ?? '').trim().toLowerCase();
  const phoneQuery = normalizeSearchPhone(query);
  const filter = options.filter ?? 'all';
  const category = options.category ?? 'ALL';
  const lang = options.lang ?? 'fr';
  const includeArchived = options.includeArchived ?? false;
  const onlyArchived = options.onlyArchived ?? false;

  return summaries
    .filter((item) => {
      const isArchived = Boolean(item.contact.archived);
      if (onlyArchived && !isArchived) return false;
      if (!onlyArchived && !includeArchived && isArchived) return false;

      if (category !== 'ALL' && item.contact.category !== category) {
        return false;
      }
      if (filter === 'receivable' && item.balance <= 0) return false;
      if (filter === 'payable' && item.balance >= 0) return false;
      if (filter === 'overdue' && !item.isOverdue) return false;

      if (query) {
        const nameMatch = item.contact.name.toLowerCase().includes(query);
        const noteMatch = (item.contact.note ?? '').toLowerCase().includes(query);
        const catRawMatch = item.contact.category.toLowerCase().includes(query);
        const catFrMatch = CATEGORY_LABELS.fr[item.contact.category]
          .toLowerCase()
          .includes(query);
        const catArMatch = CATEGORY_LABELS.ar[item.contact.category]
          .toLowerCase()
          .includes(query);
        const phoneNormalized = normalizeSearchPhone(item.contact.phone);
        const phoneRaw = item.contact.phone.toLowerCase();
        const phoneMatch =
          phoneRaw.includes(query) ||
          (phoneQuery.length >= 2 && phoneNormalized.includes(phoneQuery));

        if (
          !nameMatch &&
          !noteMatch &&
          !catRawMatch &&
          !catFrMatch &&
          !catArMatch &&
          !phoneMatch
        ) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const aDate = a.lastTransaction?.occurredAt ?? a.contact.updatedAt;
      const bDate = b.lastTransaction?.occurredAt ?? b.contact.updatedAt;
      const dateDiff = bDate.localeCompare(aDate);
      if (dateDiff !== 0) return dateDiff;
      return a.contact.name.localeCompare(b.contact.name, lang === 'ar' ? 'ar' : 'fr');
    });
}

export function computeAnalytics(
  summaries: ContactSummary[],
  transactions: Transaction[],
  todayISO: string = getTodayISODate()
): AnalyticsSnapshot {
  const monthKey = todayISO.slice(0, 7);
  let monthCreditGiven = 0;
  let monthPaymentReceived = 0;
  let monthCreditTaken = 0;
  let monthPaymentMade = 0;

  let totalAllCreditGiven = 0;
  let totalAllPaymentReceived = 0;

  // Build 6-month sliding window ending on todayISO month
  const [curY, curM] = monthKey.split('-').map(Number);
  const seriesMap = new Map<string, { creditGiven: number; paymentReceived: number }>();
  const orderedMonths: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(curY, curM - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    orderedMonths.push(key);
    seriesMap.set(key, { creditGiven: 0, paymentReceived: 0 });
  }

  const activeContactIds = new Set(
    summaries.filter((s) => !s.contact.archived).map((s) => s.contact.id)
  );

  for (const tx of transactions) {
    if (!activeContactIds.has(tx.contactId)) continue;
    const txMonth = tx.occurredAt.slice(0, 7);
    const amt = roundMoney(Math.abs(tx.amount));

    if (tx.type === 'credit_given') {
      totalAllCreditGiven = roundMoney(totalAllCreditGiven + amt);
    } else if (tx.type === 'payment_received') {
      totalAllPaymentReceived = roundMoney(totalAllPaymentReceived + amt);
    }

    if (txMonth === monthKey) {
      if (tx.type === 'credit_given') monthCreditGiven = roundMoney(monthCreditGiven + amt);
      else if (tx.type === 'payment_received')
        monthPaymentReceived = roundMoney(monthPaymentReceived + amt);
      else if (tx.type === 'credit_taken') monthCreditTaken = roundMoney(monthCreditTaken + amt);
      else if (tx.type === 'payment_made') monthPaymentMade = roundMoney(monthPaymentMade + amt);
    }

    const bucket = seriesMap.get(txMonth);
    if (bucket) {
      if (tx.type === 'credit_given') bucket.creditGiven = roundMoney(bucket.creditGiven + amt);
      else if (tx.type === 'payment_received')
        bucket.paymentReceived = roundMoney(bucket.paymentReceived + amt);
    }
  }

  const collectionRatePct =
    totalAllCreditGiven > 0
      ? Math.min(100, Math.round((totalAllPaymentReceived / totalAllCreditGiven) * 100))
      : 0;

  const activeSummaries = summaries.filter((s) => !s.contact.archived);

  const topDebtors = activeSummaries
    .filter((s) => s.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  const topCreditors = activeSummaries
    .filter((s) => s.balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 5);

  const categories: ContactCategory[] = ['Client', 'Fournisseur', 'Famille/Ami', 'Autre'];
  const byCategory = categories.map((category) => {
    const items = activeSummaries.filter((s) => s.contact.category === category);
    let receivable = 0;
    let payable = 0;
    for (const s of items) {
      if (s.balance > 0) receivable = roundMoney(receivable + s.balance);
      else if (s.balance < 0) payable = roundMoney(payable + Math.abs(s.balance));
    }
    return {
      category,
      count: items.length,
      receivable,
      payable,
    };
  });

  const monthlySeries = orderedMonths.map((month) => {
    const b = seriesMap.get(month) ?? { creditGiven: 0, paymentReceived: 0 };
    return { month, ...b };
  });

  return {
    monthKey,
    monthCreditGiven,
    monthPaymentReceived,
    monthCreditTaken,
    monthPaymentMade,
    collectionRatePct,
    topDebtors,
    topCreditors,
    byCategory,
    monthlySeries,
  };
}
