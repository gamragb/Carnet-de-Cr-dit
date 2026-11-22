import assert from 'node:assert/strict';
import test from 'node:test';
import type { Contact, LedgerDatabase, Transaction } from '../src/types/ledger.ts';
import {
  buildJSONBackup,
  buildTransactionsCSV,
  parseAndValidateBackupJSON,
} from '../src/utils/exportImport.ts';
import {
  formatMAD,
  formatMoroccanPhone,
  roundMoney,
  toTelHref,
  toWhatsAppDigits,
} from '../src/utils/formatters.ts';
import {
  computeAllLedgers,
  computeContactLedger,
  filterContactSummaries,
} from '../src/utils/ledgerMath.ts';
import { hashPin, verifyPin } from '../src/utils/security.ts';
import {
  buildWhatsAppReminderMessage,
  buildWhatsAppUrl,
} from '../src/utils/whatsapp.ts';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    name: 'Karim Bennani',
    phone: '06 61 48 23 90',
    category: 'Client',
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    contactId: 'c1',
    type: 'credit_given',
    amount: 1000,
    occurredAt: '2026-11-01T10:00',
    paymentMethod: 'Espèces',
    note: '',
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

test('formatters: MAD formatting, phone normalization, tel and WhatsApp digits', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(formatMAD(1250), '1 250 DH');
  assert.equal(formatMAD(-450.5, { showSign: true }), '-450,50 DH');
  assert.equal(formatMAD(999, { masked: true }), '•••• DH');

  assert.equal(formatMoroccanPhone('0661482390'), '06 61 48 23 90');
  assert.equal(formatMoroccanPhone('+212661482390'), '06 61 48 23 90');
  assert.equal(toTelHref('06 61 48 23 90'), 'tel:+212661482390');
  assert.equal(toWhatsAppDigits('06 61 48 23 90'), '212661482390');
  assert.equal(toWhatsAppDigits('+212 7 08 32 19 45'), '212708321945');
});

test('ledgerMath: chronological running balance & partial payments across all 4 types', () => {
  const contact = makeContact();
  const txs: Transaction[] = [
    // Out of order input to verify chronological sorting
    makeTx({
      id: 't2',
      type: 'payment_received',
      amount: 400.25,
      occurredAt: '2026-11-05T14:00',
      note: 'Acompte',
    }),
    makeTx({
      id: 't1',
      type: 'credit_given',
      amount: 1000.75,
      occurredAt: '2026-11-02T09:00',
      note: 'Marchandise',
    }),
    makeTx({
      id: 't3',
      type: 'credit_taken',
      amount: 1000,
      occurredAt: '2026-11-07T11:00',
    }),
    makeTx({
      id: 't4',
      type: 'payment_made',
      amount: 200,
      occurredAt: '2026-11-08T16:00',
    }),
  ];

  const { entries, summary } = computeContactLedger(contact, txs, '2026-11-15');
  assert.equal(entries.length, 4);
  assert.equal(entries[0].runningBalance, 1000.75);
  assert.equal(entries[1].runningBalance, 600.5);
  assert.equal(entries[2].runningBalance, -399.5);
  assert.equal(entries[3].runningBalance, -199.5);
  assert.equal(summary.balance, -199.5);
});

test('ledgerMath: FIFO due-date overdue settlement prevents false overdue alerts', () => {
  const contact = makeContact();
  const txs: Transaction[] = [
    // Old invoice 500 DH due Nov 1 (past)
    makeTx({
      id: 't1',
      type: 'credit_given',
      amount: 500,
      occurredAt: '2026-10-25T10:00',
      dueDate: '2026-11-01',
    }),
    // Paid 500 DH on Nov 3 -> settles t1 completely!
    makeTx({
      id: 't2',
      type: 'payment_received',
      amount: 500,
      occurredAt: '2026-11-03T12:00',
    }),
    // New invoice 800 DH due Nov 25 (future)
    makeTx({
      id: 't3',
      type: 'credit_given',
      amount: 800,
      occurredAt: '2026-11-10T15:00',
      dueDate: '2026-11-25',
    }),
  ];

  const { summary, dueItems } = computeContactLedger(contact, txs, '2026-11-15');
  assert.equal(summary.balance, 800);
  assert.equal(summary.isOverdue, false);
  assert.equal(summary.overdueCount, 0);
  assert.equal(dueItems[0].isSettled, true);
  assert.equal(dueItems[0].urgency, 'settled');
  assert.equal(dueItems[1].isSettled, false);
  assert.equal(dueItems[1].urgency, 'upcoming');
});

test('ledgerMath: partial payment on overdue credit keeps remaining overdue', () => {
  const contact = makeContact();
  const txs: Transaction[] = [
    makeTx({
      id: 't1',
      type: 'credit_given',
      amount: 1000,
      occurredAt: '2026-11-01T10:00',
      dueDate: '2026-11-10',
    }),
    makeTx({
      id: 't2',
      type: 'payment_received',
      amount: 350,
      occurredAt: '2026-11-12T10:00',
    }),
  ];

  const { summary, dueItems } = computeContactLedger(contact, txs, '2026-11-15');
  assert.equal(summary.balance, 650);
  assert.equal(summary.isOverdue, true);
  assert.equal(dueItems[0].urgency, 'overdue');
  assert.equal(dueItems[0].remainingAmount, 650);
  assert.equal(dueItems[0].daysDiff, -5);
});

test('computeAllLedgers & filterContactSummaries: totals, tabs and phone search', () => {
  const c1 = makeContact({ id: 'c1', name: 'Client A', phone: '06 11 22 33 44' });
  const c2 = makeContact({
    id: 'c2',
    name: 'Fournisseur B',
    phone: '06 99 88 77 66',
    category: 'Fournisseur',
  });
  const c3 = makeContact({ id: 'c3', name: 'Ami C', phone: '07 00 11 22 33' });

  const txs: Transaction[] = [
    makeTx({
      id: 't1',
      contactId: 'c1',
      type: 'credit_given',
      amount: 2000,
      dueDate: '2026-11-10',
    }),
    makeTx({
      id: 't2',
      contactId: 'c2',
      type: 'credit_taken',
      amount: 1500,
      dueDate: '2026-11-18',
    }),
    makeTx({ id: 't3', contactId: 'c3', type: 'credit_given', amount: 500 }),
    makeTx({ id: 't4', contactId: 'c3', type: 'payment_received', amount: 500 }),
  ];

  const { summaries, totals } = computeAllLedgers([c1, c2, c3], txs, '2026-11-15');
  assert.equal(totals.totalReceivable, 2000);
  assert.equal(totals.totalPayable, 1500);
  assert.equal(totals.netBalance, 500);
  assert.equal(totals.overdueContactsCount, 1);
  assert.equal(totals.soonItemsCount, 1);

  assert.equal(
    filterContactSummaries(summaries, { filter: 'receivable' }).map((s) => s.contact.id).join(','),
    'c1'
  );
  assert.equal(
    filterContactSummaries(summaries, { filter: 'payable' }).map((s) => s.contact.id).join(','),
    'c2'
  );
  assert.equal(
    filterContactSummaries(summaries, { filter: 'overdue' }).map((s) => s.contact.id).join(','),
    'c1'
  );
  assert.equal(
    filterContactSummaries(summaries, { search: '+21269988' }).map((s) => s.contact.id).join(','),
    'c2'
  );
});

test('whatsapp: reminder message & wa.me link generation', () => {
  const contact = makeContact({ name: 'Karim', phone: '06 61 48 23 90' });
  const txs = [
    makeTx({
      id: 't1',
      contactId: 'c1',
      type: 'credit_given',
      amount: 2500,
      occurredAt: '2026-11-12T10:00',
      note: 'Commande #5',
    }),
  ];

  const { summary } = computeContactLedger(contact, txs, '2026-11-15');
  const message = buildWhatsAppReminderMessage(summary, 'Maison Atlas');
  assert.match(message, /Bonjour Karim/);
  assert.match(message, /2 500 DH/);
  assert.match(message, /Commande #5/);
  assert.match(message, /Maison Atlas/);

  const url = buildWhatsAppUrl(summary, 'Maison Atlas');
  assert.ok(url?.startsWith('https://wa.me/212661482390?text='));

  const arMessage = buildWhatsAppReminderMessage(summary, 'متجر الأطلس', 'ar');
  assert.match(arMessage, /السلام عليكم Karim/);
  assert.match(arMessage, /2 500 د\.م/);
  assert.match(arMessage, /متجر الأطلس/);
});

test('exportImport: JSON backup round-trip validation & UTF-8 BOM CSV with formula protection', () => {
  const c1 = makeContact({ id: 'c1', name: '+Nadia' });
  const t1 = makeTx({
    id: 't1',
    contactId: 'c1',
    type: 'credit_given',
    amount: 750,
    note: '=SUM(A1:A2)',
  });

  const db: LedgerDatabase = {
    version: 1,
    initialized: true,
    contacts: [c1],
    transactions: [t1],
    settings: {
      pinHash: null,
      pinEnabled: false,
      hideAmounts: false,
      businessName: 'Boutique Riad',
      language: 'ar',
    },
  };

  const json = buildJSONBackup(db);
  const restored = parseAndValidateBackupJSON(json);
  assert.equal(restored.contacts.length, 1);
  assert.equal(restored.transactions.length, 1);
  assert.equal(restored.businessName, 'Boutique Riad');
  assert.equal(restored.language, 'ar');

  assert.throws(() => parseAndValidateBackupJSON('not-json'), /JSON valide/);
  assert.throws(
    () =>
      parseAndValidateBackupJSON(
        JSON.stringify({
          contacts: [],
          transactions: [{ id: 'x', contactId: 'missing', type: 'credit_given', amount: 10 }],
        })
      ),
    /contact associé introuvable/
  );

  const csv = buildTransactionsCSV([c1], [t1], '2026-11-15', 'fr');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`"'+Nadia"`));
  assert.ok(csv.includes(`"'=SUM(A1:A2)"`));
  assert.ok(csv.includes(`"Positif (+)"`));

  const csvAr = buildTransactionsCSV([c1], [t1], '2026-11-15', 'ar');
  assert.ok(csvAr.includes('الشخص'));
  assert.ok(csvAr.includes('موجب (+)'));
});

test('security: PIN hashing and verification', async () => {
  const hash = await hashPin('2468');
  assert.equal(await verifyPin('2468', hash), true);
  assert.equal(await verifyPin('1234', hash), false);
  await assert.rejects(() => hashPin('12a4'), /4 chiffres/);
});
