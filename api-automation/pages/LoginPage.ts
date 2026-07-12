import { Locator, Page, expect } from '@playwright/test';

/**
 * UI Verification Layer — login page for Use Case 2's post-creation UI
 * check. Deliberately independent of Use Case 1's `pages/LoginPage.ts`:
 * different file, different folder (`api-automation/pages/`), no shared
 * import — even though both drive the same login screen, Use Case 2 must
 * not depend on Use Case 1's code.
 *
 * IMPORTANT — confirmed via live testing (not assumed): logging in here
 * invalidates whatever API token Step 1 obtained earlier in the same test
 * run. This account's JWT carries `multipleLoginAllowed: false`, so only
 * the most recently issued token stays valid; a fresh UI login silently
 * turns the earlier API token into an HTTP 401
 * (`IQUM001.user.auth.token.validation.failed`) on its very next use. The
 * test file re-authenticates via the API after UI verification completes
 * so the existing (untouched) cleanup step still has a valid token.
 */
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

  /**
   * Navigating straight to `/#/dashboard` while unauthenticated correctly
   * bounces the SPA to the login form (confirmed via live testing) — no
   * separate `/#/login` route needed.
   */
  async open(): Promise<void> {
    await this.page.goto('/#/dashboard', { waitUntil: 'domcontentloaded' });
  }

  /**
   * Logs in and waits for the login form to actually disappear. Confirmed
   * via live testing: the authentication API call itself returns 200 in
   * ~1-2s, but the post-login bootstrap (auth -> user profile ->
   * permissions -> app shell render) can leave the form visible, disabled,
   * behind a loading spinner for several seconds afterward — waiting on the
   * form detaching (not just the API response) is what actually confirms
   * login completed.
   */
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
