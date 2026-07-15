import { Locator, Page, expect } from '@playwright/test';


export class LoginPage {
  private readonly page: Page;
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page
      .getByLabel(/username|email/i)
      .or(page.getByPlaceholder(/username|email/i))
      .first();
    this.passwordInput = page
      .getByLabel(/password/i)
      .or(page.getByPlaceholder(/password/i))
      .first();
    this.loginButton = page.getByRole('button', { name: /log ?in|sign ?in/i });
  }

 
  async open(): Promise<void> {
    await this.page.goto('/#/dashboard', { waitUntil: 'domcontentloaded' });
  }


  async login(username: string, password: string): Promise<void> {
    await expect(this.usernameInput, 'Username field should be visible on the login screen').toBeVisible({
      timeout: 15_000,
    });
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);

    const authResponsePromise = this.page
      .waitForResponse((r) => /\/v\d+\/authentication$/i.test(r.url()) && r.request().method() === 'POST', {
        timeout: 45_000,
      })
      .catch(() => null);

    await this.loginButton.click();

    const authResponse = await authResponsePromise;
    if (authResponse) {
      expect(authResponse.ok(), `UI login API call returned ${authResponse.status()}`).toBeTruthy();
    }

    await expect(this.usernameInput, 'Login form should disappear after a successful login').toBeHidden({
      timeout: 45_000,
    });
  }
}
