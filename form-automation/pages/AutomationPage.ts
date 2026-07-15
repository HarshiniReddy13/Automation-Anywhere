import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { StepRecorder } from '../../reporting/StepRecorder';


export class AutomationPage extends BasePage {
  private readonly pageHeading: Locator;
  private readonly createButton: Locator;
  private readonly createFormOption: Locator;
  private readonly formNameInput: Locator;
  private readonly createAndEditButton: Locator;

  constructor(page: Page, recorder?: StepRecorder) {
    super(page, recorder);
    this.pageHeading = page.getByRole('heading', { name: /automation/i });
    this.createButton = page.getByRole('button', { name: /create|new/i }).first();
    this.createFormOption = page
      .getByRole('menuitem', { name: /form/i })
      .or(page.getByRole('button', { name: /form/i }))
      .or(page.getByText(/^form$/i))
      .first();
    this.formNameInput = page
      .getByLabel(/name/i)
      .or(page.getByPlaceholder(/name/i))
      .first();
    this.createAndEditButton = page.getByRole('button', {
      name: /create ?& ?edit|create|save/i,
    });
  }




  async assertLoaded(): Promise<void> {
    await expect(this.pageHeading).toBeVisible();
    await expect(this.createButton).toBeVisible();
  }

  async assertCreateFormVisible(): Promise<void> {
    await this.createButton.click();
    await expect(this.createFormOption).toBeVisible();
  }


  async assertCreateFormVisibleWithReport(): Promise<void> {
    await this.assertWithReport('Automation page heading is visible', () =>
      expect(this.pageHeading).toBeVisible()
    );
    await this.clickWithReport(this.createButton, 'Click "Create" button');
    await this.assertWithReport('"Form" option appears in the Create menu', () =>
      expect(this.createFormOption).toBeVisible()
    );
  }

 
  async createForm(formName: string): Promise<void> {

    if (await this.createFormOption.isHidden().catch(() => true)) {
      await this.createButton.click();
    }
    await expect(this.createFormOption).toBeVisible();
    await this.createFormOption.click();


    if (await this.formNameInput.isVisible().catch(() => false)) {
      await this.formNameInput.fill(formName);

      await expect(this.createAndEditButton, 'Create & edit enabled (folder picker loaded)').toBeEnabled({
        timeout: 15_000,
      });
      await this.createAndEditButton.click();
    }
  }
}
