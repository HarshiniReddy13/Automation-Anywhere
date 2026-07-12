import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES, API } from '../utils/constants';
import { environment } from '../config/environment';
import { StepRecorder } from '../../reporting/StepRecorder';

/**
 * LoginPage — encapsulates the Community Edition login screen.
 * All business logic (how to log in, how to verify success) lives here; tests
 * simply call `login()`.
 */
export class LoginPage extends BasePage {
  // --- Locators (centralized, semantic-first) --------------------------------
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly errorMessage: Locator;

  constructor(page: Page, recorder?: StepRecorder) {
    super(page, recorder);
    this.usernameInput = page
      .getByLabel(/username|email/i)
      .or(page.getByPlaceholder(/username|email/i))
      .first();
    this.passwordInput = page
      .getByLabel(/password/i)
      .or(page.getByPlaceholder(/password/i))
      .first();
    this.loginButton = page.getByRole('button', { name: /log ?in|sign ?in/i });
    this.errorMessage = page.getByRole('alert').or(page.locator('[class*="error"]'));
  }

  // --- Actions ---------------------------------------------------------------

  /** Open the login page. */
  async open(): Promise<void> {
    await this.goto(ROUTES.LOGIN);
    // Community Edition may auto-authenticate via a persisted SSO session and
    // redirect straight to the dashboard. Only wait for the form if it appears.
    await this.usernameInput
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
  }

  /** True when a login form is present (i.e. the user is not already signed in). */
  async isLoginFormPresent(): Promise<boolean> {
    return this.usernameInput.isVisible().catch(() => false);
  }

  /**
   * Enter credentials and submit. Confirms the submission actually took effect
   * (login form detaches) and retries once, since Community Edition can bounce
   * back to the form on rapid successive logins / session throttling.
   */
  async login(
    username = environment.credentials.username,
    password = environment.credentials.password,
    attempts = 2
  ): Promise<void> {
    // Skip if an SSO session already logged us in.
    if (!(await this.isLoginFormPresent())) {
      return;
    }

    let lastStatus: number | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await expect(this.usernameInput, 'Username field visible').toBeVisible();
      await this.usernameInput.fill(username);
      await this.passwordInput.fill(password);

      // Intercept the real credential-exchange response (API.LOGIN is
      // anchored so it can't accidentally match the earlier publicKeyExchange
      // call) to confirm the backend actually accepted the login, not just
      // that *some* auth-prefixed request came back.
      const responsePromise = this.page
        .waitForResponse(
          (r) => API.LOGIN.test(r.url()) && r.request().method() === 'POST',
          { timeout: 45_000 }
        )
        .catch(() => null); // Some SSO flows redirect without a matchable call.

      await this.loginButton.click();
      const response = await responsePromise;
      if (response) {
        lastStatus = response.status();
        if (!response.ok() && attempt === attempts) {
          expect(response.ok(), `Login API returned ${response.status()}`).toBeTruthy();
        }
      }

      // Success = the login form is gone. The live backend's post-auth
      // bootstrap has been observed taking several seconds, so this is
      // deliberately generous rather than tight.
      const stillOnForm = await this.usernameInput
        .waitFor({ state: 'hidden', timeout: 30_000 })
        .then(() => false)
        .catch(() => true);
      if (!stillOnForm) return;
    }

    throw new Error(
      `Login did not complete: login form still visible after ${attempts} attempt(s).` +
        (lastStatus ? ` Last auth API status: ${lastStatus}.` : ' No auth API response observed.')
    );
  }

  // --- Validations -----------------------------------------------------------

  /** Assert the login form rendered correctly. */
  async assertLoaded(): Promise<void> {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  /** Assert a login error is shown (negative-path helper). */
  async assertLoginError(): Promise<void> {
    await expect(this.errorMessage.first()).toBeVisible();
  }
}
