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
    // Wait for this specific submission's round trip rather than "message is
    // non-empty" — the latter passes immediately (and stale) when a prior
    // register() call already left text in the banner, letting callers race
    // ahead of the actual response. Race response vs. requestfailed so a
    // simulated network failure (aborted request, no response ever fires)
    // doesn't hang the wait.
    const isUsersPost = (url: string, method: string) => url.endsWith("/api/users") && method === "POST";
    const outcome = Promise.race([
      this.page.waitForResponse((res) => isUsersPost(res.url(), res.request().method())),
      this.page.waitForEvent("requestfailed", {
        predicate: (req) => isUsersPost(req.url(), req.method()),
      }),
    ]);
    await this.submit();
    await outcome;
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
