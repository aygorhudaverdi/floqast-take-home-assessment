import type { Locator, Page } from "@playwright/test";

export type AccountType = "basic" | "premium";

export interface RegisterInput {
  name: string;
  email: string;
  accountType: AccountType;
}

export class RegisterPage {
  readonly page: Page;

  // Elements
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly accountTypeSelect: Locator;
  readonly submitButton: Locator;
  readonly messageBanner: Locator;
  readonly resultText: Locator;

  constructor(page: Page) {
    this.page = page;

    this.nameInput = page.getByTestId("register-name");
    this.emailInput = page.getByTestId("register-email");
    this.accountTypeSelect = page.getByTestId("register-account-type");
    this.submitButton = page.getByTestId("register-submit");
    this.messageBanner = page.getByTestId("register-message");
    this.resultText = page.getByTestId("register-result");
  }

  // Actions
  async goto(): Promise<void> {
    await this.page.goto("/register.html");
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  async selectAccountType(accountType: AccountType): Promise<void> {
    await this.accountTypeSelect.selectOption(accountType);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async register(input: RegisterInput): Promise<void> {
    await this.fillName(input.name);
    await this.fillEmail(input.email);
    await this.selectAccountType(input.accountType);
    await this.submit();
  }

  async getMessageText(): Promise<string> {
    return (await this.messageBanner.textContent())?.trim() ?? "";
  }

  async getMessageKind(): Promise<"success" | "error" | "none"> {
    const classAttr = (await this.messageBanner.getAttribute("class")) ?? "";
    if (classAttr.includes("success")) return "success";
    if (classAttr.includes("error")) return "error";
    return "none";
  }

  async getCreatedUserId(): Promise<string> {
    const text = (await this.resultText.textContent())?.trim() ?? "";
    return text.replace(/^ID:\s*/, "");
  }
}
