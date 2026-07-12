import { Locator, Page, expect } from '@playwright/test';

/**
 * UI Verification Layer — post-login landing and navigation to the
 * Learning Instances list.
 *
 * Confirmed via live navigation (not guessed): there is no standalone
 * "Learning Instances" nav item. The left nav's "AI" entry expands to
 * reveal "Skills", "Model connections", and "Document Automation"; clicking
 * "Document Automation" opens directly to the Learning Instances list page
 * (route `#/modules/cognitive/iqbot/pages/learning-instances`, rendered
 * inside `iframe.modulepage-frame` — the same module-frame class Use Case
 * 1's Form Designer uses).
 */
export class DashboardPage {
  private readonly aiNavLink: Locator;
  private readonly documentAutomationLink: Locator;

  constructor(page: Page) {
    this.aiNavLink = page
      .getByRole('link', { name: /^ai$/i })
      .or(page.getByText(/^AI$/))
      .first();
    this.documentAutomationLink = page
      .getByRole('link', { name: /document automation/i })
      .or(page.getByText(/document automation/i))
      .first();
  }

  /** Assert the authenticated app shell loaded after login. */
  async assertLoaded(): Promise<void> {
    // Post-login bootstrap has been measured taking several seconds against
    // the live backend (see the equivalent wait in pages/HomePage.ts for
    // Use Case 1) — same generous timeout applied here.
    await expect(this.aiNavLink, 'Left navigation ("AI" entry) should be visible after login').toBeVisible({
      timeout: 45_000,
    });
  }

  /** Navigate AI -> Document Automation, which opens directly to the Learning Instances list. */
  async goToLearningInstances(): Promise<void> {
    await this.aiNavLink.click();
    await expect(
      this.documentAutomationLink,
      '"Document Automation" nav entry should appear once "AI" expands'
    ).toBeVisible({ timeout: 10_000 });
    await this.documentAutomationLink.click();
  }
}
