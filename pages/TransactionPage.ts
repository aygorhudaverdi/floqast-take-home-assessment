import type { Locator, Page } from "@playwright/test";

export type TransactionType = "transfer" | "deposit" | "withdrawal";

export interface TransactionInput {
  userId: string;
  amount: string;
  type: TransactionType;
  recipientId?: string;
}

export interface TransactionRow {
  type: string;
  amount: string;
  recipient: string;
  status: string;
  created: string;
}

export class TransactionPage {
  readonly page: Page;

  // Elements - create transaction form
  readonly userIdInput: Locator;
  readonly amountInput: Locator;
  readonly typeSelect: Locator;
  readonly recipientIdInput: Locator;
  readonly submitButton: Locator;
  readonly transactionMessage: Locator;

  // Elements - transaction history lookup
  readonly lookupUserIdInput: Locator;
  readonly lookupButton: Locator;
  readonly lookupMessage: Locator;
  readonly transactionsTable: Locator;
  readonly transactionsBody: Locator;
  readonly transactionRows: Locator;

  constructor(page: Page) {
    this.page = page;

    this.userIdInput = page.getByTestId("transaction-user-id");
    this.amountInput = page.getByTestId("transaction-amount");
    this.typeSelect = page.getByTestId("transaction-type");
    this.recipientIdInput = page.getByTestId("transaction-recipient-id");
    this.submitButton = page.getByTestId("transaction-submit");
    this.transactionMessage = page.getByTestId("transaction-message");

    this.lookupUserIdInput = page.getByTestId("lookup-user-id");
    this.lookupButton = page.getByTestId("lookup-submit");
    this.lookupMessage = page.getByTestId("lookup-message");
    this.transactionsTable = page.getByTestId("transactions-table");
    this.transactionsBody = page.getByTestId("transactions-body");
    this.transactionRows = page.getByTestId("transaction-row");
  }

  // Actions - create transaction
  async goto(): Promise<void> {
    await this.page.goto("/transaction.html");
  }

  async fillUserId(userId: string): Promise<void> {
    await this.userIdInput.fill(userId);
  }

  async fillAmount(amount: string): Promise<void> {
    await this.amountInput.fill(amount);
  }

  async selectType(type: TransactionType): Promise<void> {
    await this.typeSelect.selectOption(type);
  }

  async fillRecipientId(recipientId: string): Promise<void> {
    await this.recipientIdInput.fill(recipientId);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async createTransaction(input: TransactionInput): Promise<void> {
    await this.fillUserId(input.userId);
    await this.fillAmount(input.amount);
    await this.selectType(input.type);
    if (input.recipientId) {
      await this.fillRecipientId(input.recipientId);
    }
    await this.submit();
  }

  async getTransactionMessageText(): Promise<string> {
    return (await this.transactionMessage.textContent())?.trim() ?? "";
  }

  async getTransactionMessageKind(): Promise<"success" | "error" | "none"> {
    const classAttr = (await this.transactionMessage.getAttribute("class")) ?? "";
    if (classAttr.includes("success")) return "success";
    if (classAttr.includes("error")) return "error";
    return "none";
  }

  // Actions - transaction history lookup
  async lookupTransactions(userId: string): Promise<void> {
    await this.lookupUserIdInput.fill(userId);
    await this.lookupButton.click();
  }

  async getLookupMessageText(): Promise<string> {
    return (await this.lookupMessage.textContent())?.trim() ?? "";
  }

  async getTransactionRowCount(): Promise<number> {
    return this.transactionRows.count();
  }

  async getTransactionRows(): Promise<TransactionRow[]> {
    const rows = await this.transactionRows.all();
    const results: TransactionRow[] = [];
    for (const row of rows) {
      const cells = await row.locator("td").allTextContents();
      results.push({
        type: cells[0] ?? "",
        amount: cells[1] ?? "",
        recipient: cells[2] ?? "",
        status: cells[3] ?? "",
        created: cells[4] ?? "",
      });
    }
    return results;
  }
}
