import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../utils/constants';
import { StepRecorder } from '../reporting/StepRecorder';

/**
 * HomePage / Dashboard — the landing surface after a successful login and the
 * jump-off point to the Automation area.
 */
export class HomePage extends BasePage {
  private readonly automationNavLink: Locator;

  constructor(page: Page, recorder?: StepRecorder) {
    super(page, recorder);
    // The persistent left navigation is the most reliable "app shell loaded"
    // signal; its "Automation" entry is present on every authenticated screen.
    this.automationNavLink = page
      .getByRole('link', { name: /^automation$/i })
      .or(page.getByRole('menuitem', { name: /^automation$/i }))
      .first();
  }

  // --- Validations -----------------------------------------------------------

  /** Assert the dashboard/home loaded successfully after login. */
  async assertLoaded(): Promise<void> {
    // Authenticated app shell is present (nav rendered). Post-login bootstrap
    // (auth token -> user profile -> permissions -> menu render) measured at
    // ~5-8s against the live Community Edition backend, so the default expect
    // timeout is too tight here; give it more room than the global default.
    await expect(this.automationNavLink).toBeVisible({ timeout: 45_000 });
    // ...and we are no longer on the login route.
    await expect(this.page).not.toHaveURL(new RegExp(ROUTES.LOGIN));
  }

  /** True if the authenticated app shell is displayed. */
  async isLoaded(): Promise<boolean> {
    return this.automationNavLink.isVisible();
  }

  // --- Actions ---------------------------------------------------------------

  /** Navigate to the Automation section via the left navigation. */
  async goToAutomation(): Promise<void> {
    await expect(this.automationNavLink).toBeVisible();
    await this.automationNavLink.click();
  }

  /**
   * Same as `goToAutomation()`, but routed through the `clickWithReport()`
   * wrapper so the action shows up as a recorded step (before/after
   * screenshot, timing, status) in the custom HTML report. Demonstrates the
   * reporting wrapper pattern without touching the original method any
   * existing spec relies on.
   */
  async goToAutomationWithReport(): Promise<void> {
    await expect(this.automationNavLink).toBeVisible();
    await this.clickWithReport(this.automationNavLink, 'Click "Automation" in the left navigation');
  }
}
