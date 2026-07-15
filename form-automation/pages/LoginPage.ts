import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES, API } from '../utils/constants';
import { environment } from '../config/environment';
import { StepRecorder } from '../../reporting/StepRecorder';


export class LoginPage extends BasePage {
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


  async open(): Promise<void> {
    await this.goto(ROUTES.LOGIN);

    await this.usernameInput
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
  }


  async isLoginFormPresent(): Promise<boolean> {
    return this.usernameInput.isVisible().catch(() => false);
  }

  async login(
    username = environment.credentials.username,
    password = environment.credentials.password,
    attempts = 2
  ): Promise<void> {
    if (!(await this.isLoginFormPresent())) {
      return;
    }

    let lastStatus: number | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await expect(this.usernameInput, 'Username field visible').toBeVisible();
      await this.usernameInput.fill(username);
      await this.passwordInput.fill(password);


      const responsePromise = this.page
        .waitForResponse(
          (r) => API.LOGIN.test(r.url()) && r.request().method() === 'POST',
          { timeout: 45_000 }
        )
        .catch(() => null); 

      await this.loginButton.click();
      const response = await responsePromise;
      if (response) {
        lastStatus = response.status();
        if (!response.ok() && attempt === attempts) {
          expect(response.ok(), `Login API returned ${response.status()}`).toBeTruthy();
        }
      }


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


  async assertLoaded(): Promise<void> {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  async assertLoginError(): Promise<void> {
    await expect(this.errorMessage.first()).toBeVisible();
  }
}
