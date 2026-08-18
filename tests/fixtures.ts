import { test as base, expect } from "@playwright/test";
import { RegisterPage } from "../pages/RegisterPage";
import { TransactionPage } from "../pages/TransactionPage";

type Fixtures = {
  registerPage: RegisterPage;
  transactionPage: TransactionPage;
};

export const test = base.extend<Fixtures>({
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  transactionPage: async ({ page }, use) => {
    await use(new TransactionPage(page));
  },
});

export { expect };
