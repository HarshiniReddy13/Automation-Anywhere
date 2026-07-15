import { Locator, Page, expect } from '@playwright/test';


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

  async assertLoaded(): Promise<void> {

    await expect(this.aiNavLink, 'Left navigation ("AI" entry) should be visible after login').toBeVisible({
      timeout: 45_000,
    });
  }


  async clickAiNav(): Promise<void> {
    await this.aiNavLink.click();
    await expect(
      this.documentAutomationLink,
      '"Document Automation" nav entry should appear once "AI" expands'
    ).toBeVisible({ timeout: 10_000 });
  }

  async clickDocumentAutomation(): Promise<void> {
    await this.documentAutomationLink.click();
  }
}
