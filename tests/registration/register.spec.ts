// spec: specs/ui-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../fixtures';
import { uniqueEmail } from '../support/factories';

const UUID_RESULT_PATTERN =
  /^ID: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe('User Registration (register.html)', () => {
  test('Happy path — register a new Basic user with valid data', async ({ registerPage }) => {
    // 1. Navigate to /register.html
    await registerPage.goto();
    await expect(registerPage.nameInput).toHaveValue('');
    await expect(registerPage.emailInput).toHaveValue('');
    await expect(registerPage.accountTypeSelect).toHaveValue('basic');

    // 2. Fill Name with a valid string, Email with a unique valid address, leave Account Type as Basic, click Create User
    await registerPage.fillName('Alice Basic');
    await registerPage.fillEmail(uniqueEmail('alice.basic'));
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    await expect(registerPage.messageBanner).toHaveClass(/success/);
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
    await expect(registerPage.nameInput).toHaveValue('');
    await expect(registerPage.emailInput).toHaveValue('');
    await expect(registerPage.accountTypeSelect).toHaveValue('basic');
  });

  test('Happy path — register a new Premium user', async ({ registerPage }) => {
    // 1. Navigate to /register.html, fill a unique Name/Email, select Account Type = Premium, submit
    await registerPage.goto();
    await registerPage.register({
      name: 'Priya Premium',
      email: uniqueEmail('priya.premium'),
      accountType: 'premium',
    });

    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    await expect(registerPage.messageBanner).toHaveClass(/success/);
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
  });

  test('Reject empty form submission — baseline required-field enforcement (why: confirms client never sends an incomplete payload to the API)', async ({ page, registerPage }) => {
    let requestSent = false;
    await page.route('**/api/users', async (route) => {
      requestSent = true;
      await route.continue();
    });

    // 1. Navigate to /register.html and click Create User without filling any field
    await registerPage.goto();
    await registerPage.submit();

    await expect(registerPage.nameInput).toBeFocused();
    await expect(registerPage.messageBanner).toHaveText('');
    expect(requestSent).toBe(false);
  });

  test('Reject submission with Name empty but Email/Account Type filled', async ({ page, registerPage }) => {
    let requestSent = false;
    await page.route('**/api/users', async (route) => {
      requestSent = true;
      await route.continue();
    });

    // 1. Leave Name blank, fill a valid Email, submit
    await registerPage.goto();
    await registerPage.fillEmail(uniqueEmail('name.blank'));
    await registerPage.submit();

    await expect(registerPage.nameInput).toBeFocused();
    expect(requestSent).toBe(false);
  });

  test('Reject submission with Email empty but Name filled', async ({ page, registerPage }) => {
    let requestSent = false;
    await page.route('**/api/users', async (route) => {
      requestSent = true;
      await route.continue();
    });

    // 1. Fill a valid Name, leave Email blank, submit
    await registerPage.goto();
    await registerPage.fillName('Email Blank Tester');
    await registerPage.submit();

    await expect(registerPage.emailInput).toBeFocused();
    expect(requestSent).toBe(false);
  });

  test('Whitespace-only Name bypasses client validation but is rejected server-side (why: required-attribute only checks length, not meaningful content — server trims and must catch this)', async ({ registerPage }) => {
    // 1. Set the Name field value to a string of only spaces (bypasses typing-based UX but mirrors e.g. paste), fill a valid unique Email, submit
    await registerPage.goto();
    await registerPage.fillName('   ');
    await registerPage.fillEmail(uniqueEmail('whitespace.name'));
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('name is required');
    await expect(registerPage.messageBanner).toHaveClass(/error/);
    await expect(registerPage.resultText).toHaveText('');
  });

  test('Obviously malformed email is blocked client-side (why: confirms HTML5 type=email guard is actually wired up and prevents an avoidable round-trip)', async ({ page, registerPage }) => {
    let requestSent = false;
    await page.route('**/api/users', async (route) => {
      requestSent = true;
      await route.continue();
    });

    // 1. Fill Name with a valid value, Email with 'not-an-email' (no @ symbol), submit
    await registerPage.goto();
    await registerPage.fillName('Malformed Email Tester');
    await registerPage.fillEmail('not-an-email');
    await registerPage.submit();

    await expect(registerPage.emailInput).toBeFocused();
    expect(requestSent).toBe(false);
  });

  test('Email that passes browser validation but fails server-side regex (why: high-value \'client says OK, server says no\' gap — TLD-less address like test@test satisfies the HTML5 email pattern but not the stricter server regex)', async ({ registerPage }) => {
    // 1. Fill Name with a valid value, Email with 'test@test' (no dot/TLD), submit
    await registerPage.goto();
    await registerPage.fillName('No Tld Tester');
    await registerPage.fillEmail('test@test');
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('a valid email is required');
    await expect(registerPage.messageBanner).toHaveClass(/error/);
    await expect(registerPage.resultText).toHaveText('');
  });

  test('Reject duplicate email registration (why: enforces the uniqueness constraint that prevents duplicate identities/accounts)', async ({ registerPage }) => {
    const email = uniqueEmail('duplicate.email');

    // 1. Register a user with a unique email and confirm success
    await registerPage.goto();
    await registerPage.fillName('First Registrant');
    await registerPage.fillEmail(email);
    await registerPage.submit();
    await expect(registerPage.messageBanner).toHaveText('User created successfully.');

    // 2. Attempt to register a second user reusing the exact same email address
    await registerPage.fillName('Second Registrant');
    await registerPage.fillEmail(email);
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('email already registered');
    await expect(registerPage.messageBanner).toHaveClass(/error/);
  });

  test('Reject duplicate email registration with different casing (why: server does a case-insensitive email comparison — confirms this can\'t be trivially bypassed with \'Test@Example.com\' vs \'test@example.com\')', async ({ registerPage }) => {
    const stamp = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const lowerEmail = `dup.case.${stamp}@example.com`;
    const upperEmail = `DUP.CASE.${stamp}@EXAMPLE.COM`;

    // 1. Register a user with email 'dup.case@example.com' and confirm success
    await registerPage.goto();
    await registerPage.fillName('Case Sensitivity Tester');
    await registerPage.fillEmail(lowerEmail);
    await registerPage.submit();
    await expect(registerPage.messageBanner).toHaveText('User created successfully.');

    // 2. Attempt to register a new user with email 'DUP.CASE@EXAMPLE.COM'
    await registerPage.fillName('Case Sensitivity Tester 2');
    await registerPage.fillEmail(upperEmail);
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('email already registered');
  });

  test('Oversized Name input (why: no maxlength attribute exists on the field — confirms the app doesn\'t crash, truncate silently, or store unbounded data unexpectedly)', async ({ registerPage }) => {
    // 1. Fill Name with a very long string (several thousand characters), fill a valid unique Email, submit
    await registerPage.goto();
    await registerPage.fillName('A'.repeat(5000));
    await registerPage.fillEmail(uniqueEmail('oversized.name'));
    await registerPage.submit();

    // Verified live: no server-side length limit — the full name is preserved and the user is created.
    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    await expect(registerPage.messageBanner).toHaveClass(/success/);
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
  });

  test('Script/markup injection attempt in Name field (why: XSS defense-in-depth check — ensure any echoed value, e.g. in a future \'welcome back\' UI, would be rendered as text not executed)', async ({ page, registerPage }) => {
    let dialogAppeared = false;
    page.on('dialog', async (dialog) => {
      dialogAppeared = true;
      await dialog.dismiss();
    });

    // 1. Fill Name with '<script>alert(1)</script>' and a valid unique Email, submit
    await registerPage.goto();
    await registerPage.fillName('<script>alert(1)</script>');
    await registerPage.fillEmail(uniqueEmail('xss.name'));
    await registerPage.submit();

    // Verified live: the server stores the value verbatim as inert string data (name is never
    // echoed back into the page as HTML), and no script executes.
    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    expect(dialogAppeared).toBe(false);
  });

  test('Unicode/emoji characters in Name field (why: internationalization/edge-encoding coverage)', async ({ page, registerPage }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Fill Name with a mix of unicode characters and emoji (e.g. 'José 名前 🚀'), fill a valid unique Email, submit
    await registerPage.goto();
    await registerPage.fillName('José 名前 🚀');
    await registerPage.fillEmail(uniqueEmail('unicode.name'));
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
    expect(consoleErrors).toEqual([]);
  });

  test('Email with leading/trailing whitespace (why: server trims Name but the code path for Email does not call .trim() before storage/comparison — check for inconsistent normalization)', async ({ registerPage }) => {
    const email = uniqueEmail('spaced.email');

    // 1. Fill Name with a valid value, Email with '  spaced.email@example.com  ' (leading/trailing spaces), submit
    await registerPage.goto();
    await registerPage.fillName('Spaced Email Tester');
    await registerPage.fillEmail(`  ${email}  `);

    // Verified live: the browser's native type=email value-sanitization strips leading/trailing
    // whitespace before it ever reaches the form data, so the trimmed address is what is actually
    // submitted — there is no latent un-trimmed-storage bug reachable through the UI.
    await expect(registerPage.emailInput).toHaveValue(email);

    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
  });

  test('SQL/NoSQL-injection-style string in Name and Email (why: defensive check even though the store is in-memory — guards against future persistence-layer regressions)', async ({ registerPage }) => {
    // 1. Fill Name with e.g. "Robert'); DROP TABLE users;--" and Email with a validly-formatted address, submit
    await registerPage.goto();
    await registerPage.fillName("Robert'); DROP TABLE users;--");
    await registerPage.fillEmail(uniqueEmail('sqli.name'));
    await registerPage.submit();

    // Verified live: handled as ordinary string data, created successfully with no server error.
    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    await expect(registerPage.messageBanner).not.toHaveClass(/error/);
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
  });

  test('Tamper Account Type to an invalid value beyond the two dropdown options (why: confirms server-side accountType allow-list is enforced independently of the client dropdown, since the UI can only ever submit \'basic\' or \'premium\')', async ({ registerPage }) => {
    // 1. Use page-level script injection to add and select a bogus <option value='gold'> in the Account Type select, with valid Name/Email
    await registerPage.goto();
    await registerPage.fillName('Gold Tier Tamperer');
    await registerPage.fillEmail(uniqueEmail('gold.tamper'));
    await registerPage.accountTypeSelect.evaluate((select: HTMLSelectElement) => {
      const bogusOption = document.createElement('option');
      bogusOption.value = 'gold';
      bogusOption.textContent = 'Gold';
      select.appendChild(bogusOption);
      select.value = 'gold';
    });
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('accountType must be one of: basic, premium');
    await expect(registerPage.messageBanner).toHaveClass(/error/);
    await expect(registerPage.resultText).toHaveText('');
  });

  test('Single-character Name boundary (why: confirms the minimum valid input size is 1 non-space character, not silently rejected)', async ({ registerPage }) => {
    // 1. Fill Name with a single character (e.g. 'A'), fill a valid unique Email, submit
    await registerPage.goto();
    await registerPage.fillName('A');
    await registerPage.fillEmail(uniqueEmail('single.char.name'));
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
  });

  test('Form retains user input after a validation error (why: UX/regression check — users should not have to retype everything after a fixable error)', async ({ registerPage }) => {
    const email = uniqueEmail('retain.on.error');

    // 1. Fill Name and Email such that the server rejects the submission (e.g. duplicate email), submit
    await registerPage.goto();
    await registerPage.fillName('Original Owner');
    await registerPage.fillEmail(email);
    await registerPage.submit();
    await expect(registerPage.messageBanner).toHaveText('User created successfully.');

    await registerPage.fillName('Second Attempt Name');
    await registerPage.fillEmail(email);
    await registerPage.submit();

    await expect(registerPage.messageBanner).toHaveText('email already registered');
    await expect(registerPage.nameInput).toHaveValue('Second Attempt Name');
    await expect(registerPage.emailInput).toHaveValue(email);
  });

  test('Double-submit / rapid duplicate click on Create User (why: no visible submit-button disable-on-click logic in app.js — check whether two rapid clicks can create two users from one intended submission)', async ({ page, registerPage }) => {
    const statuses: number[] = [];
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().includes('/api/users')) {
        statuses.push(response.status());
      }
    });

    // 1. Fill valid unique Name/Email, click Create User twice in rapid succession (double-click)
    await registerPage.goto();
    await registerPage.fillName('Double Click Tester');
    await registerPage.fillEmail(uniqueEmail('double.click'));
    await registerPage.submitButton.dblclick();

    await expect.poll(() => statuses.length).toBe(2);
    // Verified live: two identical POST requests are sent (no submit-guard exists), but because
    // the user-service handles each request synchronously with no interior await, exactly one
    // request is created (201) and the other is rejected as a duplicate email (409) — so only a
    // single user ends up created. Which response the browser resolves *last* (and therefore which
    // text wins the message banner) is a genuine network-level race with no ordering guarantee from
    // the app, so this only asserts the order-independent invariant: exactly one success and one
    // duplicate-email rejection occurred, and the successful response's id is reflected in the UI.
    expect(statuses.slice().sort((a, b) => a - b)).toEqual([201, 409]);
    await expect(registerPage.messageBanner).toHaveText(/^(User created successfully\.|email already registered)$/);
    await expect(registerPage.resultText).toHaveText(UUID_RESULT_PATTERN);
  });
});
