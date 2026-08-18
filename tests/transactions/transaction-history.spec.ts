// spec: specs/ui-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../fixtures';
import { uniqueEmail } from '../support/factories';

test.describe('Transaction History Lookup (transaction.html — lookup section)', () => {
  test('Happy path — lookup a user with existing transactions', async ({ registerPage, transactionPage }) => {
    // 1. Register a user, create at least one transaction for them, then look up that user's ID
    await registerPage.goto();
    await registerPage.register({
      name: 'History Happy Path',
      email: uniqueEmail('history.happy'),
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: '150', type: 'deposit' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');

    await transactionPage.lookupTransactions(userId);

    // expect: Table becomes visible with one row per transaction
    await expect(transactionPage.transactionsTable).toBeVisible();
    await expect(transactionPage.transactionRows).toHaveCount(1);

    // expect: Row values match the created transaction(s): Type, Amount formatted as currency with 2 decimals
    // (e.g. $5000.00), Recipient ('-' for non-transfers), Status ('completed'), and a human-readable Created timestamp
    const [row] = await transactionPage.getTransactionRows();
    expect(row.type).toBe('deposit');
    expect(row.amount).toBe('$150.00');
    expect(row.recipient).toBe('-');
    expect(row.status).toBe('completed');
    expect(row.created).not.toBe('');
  });

  test('Happy path — lookup a valid user with zero transactions', async ({ registerPage, transactionPage }) => {
    // 1. Register a brand-new user and immediately look up their transaction history without creating any transactions
    await registerPage.goto();
    await registerPage.register({
      name: 'History Zero Tx',
      email: uniqueEmail('history.zero'),
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    await transactionPage.goto();
    await transactionPage.lookupTransactions(userId);

    // expect: Message shows 'No transactions for this user yet.' with success styling
    await expect(transactionPage.lookupMessage).toHaveText('No transactions for this user yet.');
    await expect(transactionPage.lookupMessage).toHaveClass(/success/);

    // expect: The transactions table remains hidden
    await expect(transactionPage.transactionsTable).toBeHidden();
  });

  test('Empty User ID lookup is blocked client-side without a network call', async ({ page, transactionPage }) => {
    await transactionPage.goto();

    const transactionRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/transactions/')) transactionRequests.push(req.url());
    });

    // 1. Leave the lookup User ID field empty, click View Transactions
    await transactionPage.lookupButton.click();

    // expect: Message shows 'Enter a user ID first.' with error styling
    await expect(transactionPage.lookupMessage).toHaveText('Enter a user ID first.');
    await expect(transactionPage.lookupMessage).toHaveClass(/error/);

    // expect: No network request is made and the table stays hidden
    expect(transactionRequests).toHaveLength(0);
    await expect(transactionPage.transactionsTable).toBeHidden();
  });

  test('Whitespace-only User ID lookup is treated as empty', async ({ transactionPage }) => {
    await transactionPage.goto();

    // 1. Enter only spaces into the lookup User ID field, click View Transactions
    await transactionPage.lookupTransactions('   ');

    // expect: Message shows 'Enter a user ID first.' just like a truly empty field
    await expect(transactionPage.lookupMessage).toHaveText('Enter a user ID first.');
  });

  test('Lookup for a non-existent User ID', async ({ transactionPage }) => {
    await transactionPage.goto();

    // 1. Enter a syntactically valid but unregistered userId, click View Transactions
    await transactionPage.lookupTransactions('00000000-0000-0000-0000-000000000000');

    // expect: Message shows 'user not found' with error styling
    await expect(transactionPage.lookupMessage).toHaveText('user not found');
    await expect(transactionPage.lookupMessage).toHaveClass(/error/);

    // expect: Table remains hidden
    await expect(transactionPage.transactionsTable).toBeHidden();
  });

  test('Table and message reset correctly between successive lookups', async ({ registerPage, transactionPage }) => {
    await registerPage.goto();
    await registerPage.register({
      name: 'History Reset Check',
      email: uniqueEmail('history.reset'),
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: '75', type: 'withdrawal' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');

    // 1. Look up a valid user with transactions (table shows rows), then immediately look up a non-existent user
    await transactionPage.lookupTransactions(userId);
    await expect(transactionPage.transactionsTable).toBeVisible();
    await expect(transactionPage.transactionRows).toHaveCount(1);

    await transactionPage.lookupTransactions('00000000-0000-0000-0000-000000000000');

    // expect: The previously shown table is hidden and its rows are cleared
    await expect(transactionPage.transactionsTable).toBeHidden();
    await expect(transactionPage.transactionRows).toHaveCount(0);

    // expect: Only the 'user not found' message is visible, with no leftover rows from the first lookup
    await expect(transactionPage.lookupMessage).toHaveText('user not found');
  });

  test('Multiple transactions for one user all render in history', async ({ registerPage, transactionPage }) => {
    await registerPage.goto();
    await registerPage.register({
      name: 'History Multi Tx',
      email: uniqueEmail('history.multi'),
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    // 1. Create 5+ transactions of varying types/amounts for the same user, then look up their history
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: '100', type: 'deposit' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');
    await transactionPage.createTransaction({ userId, amount: '50', type: 'withdrawal' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');
    await transactionPage.createTransaction({
      userId,
      amount: '200',
      type: 'transfer',
      recipientId: 'recipient-multi-1',
    });
    await expect(transactionPage.transactionMessage).toContainText('completed.');
    await transactionPage.createTransaction({ userId, amount: '300', type: 'deposit' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');
    await transactionPage.createTransaction({ userId, amount: '25', type: 'withdrawal' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');

    await transactionPage.lookupTransactions(userId);

    // expect: All created transactions appear as distinct rows, in a consistent order, with correct per-row data
    await expect(transactionPage.transactionRows).toHaveCount(5);
    const rows = await transactionPage.getTransactionRows();
    expect(rows.map((r) => r.type)).toEqual(['deposit', 'withdrawal', 'transfer', 'deposit', 'withdrawal']);
    expect(rows.map((r) => r.amount)).toEqual(['$100.00', '$50.00', '$200.00', '$300.00', '$25.00']);
  });

  test('Currency formatting is correct for whole-number and decimal amounts', async ({
    registerPage,
    transactionPage,
  }) => {
    await registerPage.goto();
    await registerPage.register({
      name: 'History Currency Fmt',
      email: uniqueEmail('history.currency'),
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    // 1. Create one transaction with a whole-number amount (e.g. 100) and another with a decimal amount (e.g. 42.5)
    // for the same user, then look up their history
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: '100', type: 'deposit' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');
    await transactionPage.createTransaction({ userId, amount: '42.5', type: 'deposit' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');

    await transactionPage.lookupTransactions(userId);

    // expect: Both rows display amount formatted to exactly 2 decimal places (e.g. $100.00 and $42.50)
    const rows = await transactionPage.getTransactionRows();
    expect(rows.map((r) => r.amount)).toEqual(['$100.00', '$42.50']);
  });

  test('Recipient column correctly distinguishes transfer vs non-transfer transactions', async ({
    registerPage,
    transactionPage,
  }) => {
    await registerPage.goto();
    await registerPage.register({
      name: 'History Recipient Col',
      email: uniqueEmail('history.recipient'),
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    // 1. Create one deposit and one transfer (with a recipientId) for the same user, then look up their history
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: '60', type: 'deposit' });
    await expect(transactionPage.transactionMessage).toContainText('completed.');
    await transactionPage.createTransaction({
      userId,
      amount: '80',
      type: 'transfer',
      recipientId: 'recipient-xyz-123',
    });
    await expect(transactionPage.transactionMessage).toContainText('completed.');

    await transactionPage.lookupTransactions(userId);
    const rows = await transactionPage.getTransactionRows();

    // expect: Deposit row shows '-' in the Recipient column
    expect(rows[0].recipient).toBe('-');

    // expect: Transfer row shows the actual recipientId value
    expect(rows[1].recipient).toBe('recipient-xyz-123');
  });
});
