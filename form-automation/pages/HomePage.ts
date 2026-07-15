import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../utils/constants';
import { StepRecorder } from '../../reporting/StepRecorder';


export class HomePage extends BasePage {
  private readonly automationNavLink: Locator;

  constructor(page: Page, recorder?: StepRecorder) {
    super(page, recorder);
    this.automationNavLink = page
      .getByRole('link', { name: /^automation$/i })
      .or(page.getByRole('menuitem', { name: /^automation$/i }))
      .first();
  }


  async assertLoaded(): Promise<void> {

    await expect(this.automationNavLink).toBeVisible({ timeout: 45_000 });
    await expect(this.page).not.toHaveURL(new RegExp(ROUTES.LOGIN));
  }


  async isLoaded(): Promise<boolean> {
    return this.automationNavLink.isVisible();
  }


  async goToAutomation(): Promise<void> {
    await expect(this.automationNavLink).toBeVisible();
    await this.automationNavLink.click();
  }


  async goToAutomationWithReport(): Promise<void> {
    await expect(this.automationNavLink).toBeVisible();
    await this.clickWithReport(this.automationNavLink, 'Click "Automation" in the left navigation');
  }
}
