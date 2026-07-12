import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { StepRecorder } from '../../reporting/StepRecorder';

/**
 * AutomationPage — the Automation listing surface where new automations
 * (including Forms) are created.
 */
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

  // --- Validations -----------------------------------------------------------

  /** Assert the Automation page has loaded. */
  async assertLoaded(): Promise<void> {
    await expect(this.pageHeading).toBeVisible();
    await expect(this.createButton).toBeVisible();
  }

  /** Assert the Create -> Form option is available. */
  async assertCreateFormVisible(): Promise<void> {
    await this.createButton.click();
    await expect(this.createFormOption).toBeVisible();
  }

  /**
   * Same intent as `assertLoaded()` + `assertCreateFormVisible()`, but
   * routed through `clickWithReport()`/`assertWithReport()` so each action
   * is captured as its own report step. Demonstrates the wrapper pattern
   * for click + assertion without altering the originals.
   */
  async assertCreateFormVisibleWithReport(): Promise<void> {
    await this.assertWithReport('Automation page heading is visible', () =>
      expect(this.pageHeading).toBeVisible()
    );
    await this.clickWithReport(this.createButton, 'Click "Create" button');
    await this.assertWithReport('"Form" option appears in the Create menu', () =>
      expect(this.createFormOption).toBeVisible()
    );
  }

  // --- Actions ---------------------------------------------------------------

  /**
   * Create a new Form with the given name and open the Form Designer.
   * Encapsulates the full create dialog flow.
   */
  async createForm(formName: string): Promise<void> {
    // Open the create menu if not already open.
    if (await this.createFormOption.isHidden().catch(() => true)) {
      await this.createButton.click();
    }
    await expect(this.createFormOption).toBeVisible();
    await this.createFormOption.click();

    // Name the form when the dialog prompts for it.
    if (await this.formNameInput.isVisible().catch(() => false)) {
      await this.formNameInput.fill(formName);
      // The dialog's Folder picker loads asynchronously ("Loading...") and
      // "Create & edit" stays disabled until it resolves. Clicking too early
      // is a silent no-op (not a real HTML `disabled`, so Playwright doesn't
      // error — the app just ignores the click), leaving the dialog open.
      await expect(this.createAndEditButton, 'Create & edit enabled (folder picker loaded)').toBeEnabled({
        timeout: 15_000,
      });
      await this.createAndEditButton.click();
    }
  }
}
