import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Contact, Transaction } from '../src/types/ledger.ts';
import {
  formatMAD,
  isValidPhoneInput,
  normalizeDigitInput,
  parseMoneyInput,
} from '../src/utils/formatters.ts';
import {
  computeAllLedgers,
  computeAnalytics,
  computeContactLedger,
  filterContactSummaries,
} from '../src/utils/ledgerMath.ts';
import {
  buildDueCalendarICS,
  buildTransactionsCSV,
  mergeBackupDatabases,
  parseAndValidateBackupJSON,
  parseTransactionsCSV,
} from '../src/utils/exportImport.ts';
import {
  decryptBackupJSON,
  encryptBackupJSON,
  hashRecoveryAnswer,
  isEncryptedBackupText,
  sha256HexPure,
  verifyRecoveryAnswer,
} from '../src/utils/security.ts';
import { createSampleSeedData } from '../src/utils/storage.ts';
import {
  compareSemver,
  isValidUpdateUrl,
  parseUpdateManifest,
} from '../src/utils/appUpdater.ts';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  const now = '2025-05-01T10:00:00Z';
  return {
    id: 'c1',
    name: 'Test Contact',
    phone: '0661234567',
    category: 'Client',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  const now = '2025-05-01T10:00:00Z';
  return {
    id: 'tx1',
    contactId: 'c1',
    type: 'credit_given',
    amount: 100,
    occurredAt: '2025-05-01T10:00',
    paymentMethod: 'Espèces',
    note: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('security: sha256HexPure matches Node crypto SHA-256 for ASCII and Arabic UTF-8', () => {
  for (const sample of ['', 'abc', 'carnet-pin-v2::1234', 'مرحبا بكم في الدار البيضاء']) {
    const expected = createHash('sha256').update(sample, 'utf8').digest('hex');
    assert.equal(sha256HexPure(sample), expected);
  }
});

test('security: recovery question answer verification ignores case and extra spaces', async () => {
  const hash = await hashRecoveryAnswer('  Casablanca  ');
  assert.equal(await verifyRecoveryAnswer('casablanca', hash), true);
  assert.equal(await verifyRecoveryAnswer('CASABLANCA', hash), true);
  assert.equal(await verifyRecoveryAnswer('Rabat', hash), false);
});

test('security: AES-GCM encrypted backup round-trip and wrong passphrase rejection', async () => {
  const plain = JSON.stringify({ hello: 'درهم', count: 42 });
  const encrypted = await encryptBackupJSON(plain, 'MonMotDePasse99', 'fr');
  assert.equal(isEncryptedBackupText(encrypted), true);

  const decrypted = await decryptBackupJSON(encrypted, 'MonMotDePasse99', 'fr');
  assert.equal(decrypted, plain);

  await assert.rejects(
    () => decryptBackupJSON(encrypted, 'WrongPass', 'fr'),
    /Mot de passe incorrect|corrompu/
  );
  await assert.rejects(
    () => decryptBackupJSON(encrypted, 'WrongPass', 'ar'),
    /كلمة السر غير صحيحة/
  );
});

test('formatters: Arabic digits normalization, strict money parser, phone validator, hideDecimals', () => {
  assert.equal(normalizeDigitInput('١٢٣٫٥٠'), '123.50');
  assert.equal(parseMoneyInput('١٢٣٫٥٠'), 123.5);
  assert.equal(parseMoneyInput(' 250,75 '), 250.75);
  assert.equal(parseMoneyInput('1e3'), null);
  assert.equal(parseMoneyInput('-50'), null);
  assert.equal(parseMoneyInput('0'), null);

  assert.equal(isValidPhoneInput('0661234567'), true);
  assert.equal(isValidPhoneInput('+212 6 61 23 45 67'), true);
  assert.equal(isValidPhoneInput('1234'), false);

  assert.equal(formatMAD(150.75, { lang: 'fr', hideDecimals: true }), '151 DH');
});

test('ledgerMath: symmetric FIFO advance-before-credit & supplier pre-payment settlement', () => {
  const client = makeContact({ id: 'c-adv', creditLimit: 400 });
  const txs: Transaction[] = [
    // Client pays 300 DH advance BEFORE buying goods on credit with a due date
    makeTx({
      id: 't1',
      contactId: 'c-adv',
      type: 'payment_received',
      amount: 300,
      occurredAt: '2025-05-01T09:00',
    }),
    makeTx({
      id: 't2',
      contactId: 'c-adv',
      type: 'credit_given',
      amount: 500,
      occurredAt: '2025-05-02T10:00',
      dueDate: '2025-05-10',
    }),
  ];

  const { summary, dueItems } = computeContactLedger(client, txs, '2025-05-15');
  assert.equal(summary.balance, 200);
  assert.equal(dueItems.length, 1);
  assert.equal(dueItems[0].remainingAmount, 200);
  assert.equal(dueItems[0].isSettled, false);
  assert.equal(dueItems[0].urgency, 'overdue');
  assert.equal(summary.isOverCreditLimit, false);

  // Over credit limit test
  const over = computeContactLedger(
    client,
    [makeTx({ id: 't3', contactId: 'c-adv', amount: 450, occurredAt: '2025-05-01T10:00' })],
    '2025-05-15'
  );
  assert.equal(over.summary.isOverCreditLimit, true);
});

test('ledgerMath: Arabic category search, archive filtering, and computeAnalytics', () => {
  const c1 = makeContact({ id: 'c1', name: 'Amine', category: 'Fournisseur' });
  const c2 = makeContact({ id: 'c2', name: 'Salma', category: 'Famille/Ami', archived: true });
  const c3 = makeContact({ id: 'c3', name: 'Youssef', category: 'Client' });

  const txs: Transaction[] = [
    makeTx({ id: 't1', contactId: 'c1', type: 'credit_taken', amount: 600, occurredAt: '2025-05-05T11:00' }),
    makeTx({ id: 't2', contactId: 'c3', type: 'credit_given', amount: 1000, occurredAt: '2025-05-06T12:00' }),
    makeTx({ id: 't3', contactId: 'c3', type: 'payment_received', amount: 250, occurredAt: '2025-05-08T12:00' }),
  ];

  const { summaries } = computeAllLedgers([c1, c2, c3], txs, '2025-05-10');

  const suppliers = filterContactSummaries(summaries, {
    search: 'مورد',
    lang: 'ar',
    includeArchived: false,
  });
  assert.equal(suppliers.length, 1);
  assert.equal(suppliers[0].contact.id, 'c1');

  const onlyArch = filterContactSummaries(summaries, { onlyArchived: true });
  assert.equal(onlyArch.length, 1);
  assert.equal(onlyArch[0].contact.id, 'c2');

  const analytics = computeAnalytics(summaries, txs, '2025-05-10');
  assert.equal(analytics.monthCreditGiven, 1000);
  assert.equal(analytics.monthPaymentReceived, 250);
  assert.equal(analytics.monthCreditTaken, 600);
  assert.equal(analytics.collectionRatePct, 25);
  assert.equal(analytics.monthlySeries.length, 6);
  assert.equal(analytics.topDebtors[0]?.contact.id, 'c3');
  assert.equal(analytics.topCreditors[0]?.contact.id, 'c1');
});

test('exportImport: mergeBackupDatabases deduplicates contacts and transactions cleanly', () => {
  const currentContacts = [makeContact({ id: 'c1', name: 'Ahmed', phone: '0661112233' })];
  const currentTxs = [makeTx({ id: 'tx1', contactId: 'c1', amount: 150 })];

  const merged = mergeBackupDatabases(currentContacts, currentTxs, {
    contacts: [
      makeContact({ id: 'imp-same', name: 'Ahmed', phone: '+212 661-112233' }),
      makeContact({ id: 'c2', name: 'Khadija', phone: '0677889900' }),
    ],
    transactions: [
      makeTx({ id: 'tx1', contactId: 'imp-same', amount: 150 }),
      makeTx({ id: 'tx2', contactId: 'imp-same', amount: 80 }),
      makeTx({ id: 'tx3', contactId: 'c2', amount: 220 }),
    ],
  });

  assert.equal(merged.addedContacts, 1);
  assert.equal(merged.addedTransactions, 2);
  assert.equal(merged.contacts.length, 2);
  assert.equal(merged.transactions.find((t) => t.id === 'tx2')?.contactId, 'c1');
});

test('exportImport: semicolon Arabic CSV round-trip, ICS calendar, and localized Arabic JSON errors', () => {
  const c1 = makeContact({ id: 'c1', name: 'Hassan', phone: '0612345678', category: 'Client' });
  const tx1 = makeTx({
    id: 'tx1',
    contactId: 'c1',
    type: 'credit_given',
    amount: 400,
    occurredAt: '2025-05-03T14:20',
    dueDate: '2025-05-20',
    note: 'Livraison',
  });

  const csv = buildTransactionsCSV([c1], [tx1], '2025-05-10', 'ar', ';');
  assert.ok(csv.includes(';"الوقت";'));
  const parsed = parseTransactionsCSV(csv, [], 'ar');
  assert.equal(parsed.addedContacts, 1);
  assert.equal(parsed.addedTransactions, 1);
  assert.equal(parsed.transactions[0]?.amount, 400);

  const sepCsv = `sep=;\n${csv.replace(/^\uFEFF/, '')}`;
  const parsedWithSep = parseTransactionsCSV(sepCsv, [], 'ar');
  assert.equal(parsedWithSep.addedTransactions, 1);

  const { allDueItems } = computeAllLedgers([c1], [tx1], '2025-05-10');
  const ics = buildDueCalendarICS(allDueItems, 'fr');
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20250520'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20250521'));
  assert.ok(ics.includes('TRIGGER:PT9H'));

  assert.throws(
    () => parseAndValidateBackupJSON('{bad', 'ar'),
    /JSON صالح/
  );

  const arSeed = createSampleSeedData('ar');
  assert.equal(arSeed.contacts.length, 3);
  assert.ok(!/[A-Za-z]/.test(arSeed.contacts[0].name));
});

test('regression fixes: archived totals exclusion, CSV dedup & phone separation, safe image URIs', () => {
  const active = makeContact({ id: 'c-act', name: 'Ahmed', phone: '0661111111' });
  const archived = makeContact({
    id: 'c-arch',
    name: 'Ancien Client',
    phone: '0677222222',
    archived: true,
  });

  const txs: Transaction[] = [
    makeTx({ id: 'tx-act', contactId: 'c-act', type: 'credit_given', amount: 300 }),
    makeTx({ id: 'tx-arch', contactId: 'c-arch', type: 'credit_given', amount: 900 }),
  ];

  const { totals, summaries } = computeAllLedgers([active, archived], txs, '2025-05-10');
  assert.equal(totals.totalReceivable, 300);
  assert.equal(totals.netBalance, 300);
  assert.equal(totals.archivedCount, 1);

  const analytics = computeAnalytics(summaries, txs, '2025-05-10');
  assert.equal(analytics.monthCreditGiven, 300);

  // Re-importing same CSV skips duplicate row; same-name different-phone creates distinct contact
  const csvSample = [
    'Date;Heure;Contact;Téléphone;Type;Montant;Motif',
    '2025-05-01;10:00;Ahmed;0661111111;Crédit accordé;300;',
    '2025-05-02;11:00;Ahmed;0677999999;Règlement dette;120;Paiement fournisseur',
  ].join('\r\n');
  const csvRes = parseTransactionsCSV(csvSample, [active], 'fr', [txs[0]]);
  assert.equal(csvRes.addedContacts, 1);
  assert.equal(csvRes.addedTransactions, 1);
  assert.equal(csvRes.skippedRows, 1);
  assert.equal(csvRes.transactions[0]?.type, 'payment_made');

  // Rejects data:image/svg+xml in imported JSON backups
  const jsonWithSvg = JSON.stringify({
    contacts: [active],
    transactions: [
      {
        ...txs[0],
        attachmentDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      },
    ],
  });
  const sanitized = parseAndValidateBackupJSON(jsonWithSvg, 'fr');
  assert.equal(sanitized.transactions[0]?.attachmentDataUrl, undefined);
});

test('appUpdater: semver comparison, HTTPS validation, and update.json manifest parsing', () => {
  assert.equal(compareSemver('1.0.10', '1.0.2'), 1);
  assert.equal(compareSemver('v1.2.0', '1.1.9'), 1);
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.1'), -1);

  assert.equal(isValidUpdateUrl('https://mon-carnet.netlify.app/update.json'), true);
  assert.equal(isValidUpdateUrl('http://localhost:4173/update.json'), true);
  assert.equal(isValidUpdateUrl('http://evil.example.com/update.json'), false);
  assert.equal(isValidUpdateUrl('javascript:alert(1)'), false);

  const manifest = parseUpdateManifest(
    {
      version: '1.1.0',
      bundleUrl: 'https://mon-carnet.netlify.app/bundle-1.1.0.zip',
      apkUrl: 'http://insecure.example.com/app.apk',
      notesFr: 'Nouveautés',
      notesAr: 'تحديث جديد',
      mandatory: true,
    },
    'fr'
  );
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.bundleUrl, 'https://mon-carnet.netlify.app/bundle-1.1.0.zip');
  assert.equal(manifest.apkUrl, undefined);
  assert.equal(manifest.mandatory, true);

  assert.throws(
    () => parseUpdateManifest({ version: 'bad' }, 'ar'),
    /رقم الإصدار/
  );
});
