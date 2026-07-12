import { FrameLocator, Locator, Page, expect } from '@playwright/test';

/**
 * CSS selector for the iframe that hosts the Learning Instances module —
 * confirmed via live navigation to be the same `modulepage-frame` class
 * Use Case 1's Form Designer uses. Declared locally (not imported from
 * `utils/constants.ts`) to keep this module independent of Use Case 1.
 */
const MODULE_FRAME_SELECTOR = 'iframe.modulepage-frame';

export interface ExpectedLearningInstance {
  id: string;
  name: string;
  status: string;
  documentType: string;
}

export interface UiRowSnapshot {
  name: string;
  status: string;
  documentType: string;
  testMode: string;
  provider: string;
  uploads: string;
}

/**
 * UI Verification Layer — the Learning Instances list page.
 *
 * Read-only by design: this page object has no create/edit methods on
 * purpose. Use Case 2's Learning Instance is always created via
 * `LearningInstanceApi`; this class only ever looks at what's already
 * there, per the "do not create another Learning Instance from the UI"
 * requirement.
 *
 * Every locator below was captured from the live rendered DOM (not
 * guessed): the app's "Rio" component library has no semantic <table> or
 * meaningful ARIA roles for this grid (confirmed: only `role="button"` /
 * `role="region"` appear anywhere in the module frame), so `data-path` /
 * `data-column-id` / `data-row-id` attributes are the only stable anchors
 * available — the same category of quirk already documented for other Rio
 * components in `pages/RulesBuilderPage.ts` (Use Case 1).
 */
export class LearningInstancesPage {
  private readonly page: Page;
  private readonly frame: FrameLocator;
  private readonly heading: Locator;
  private readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.frame = page.frameLocator(MODULE_FRAME_SELECTOR);
    this.heading = this.frame.locator('[data-path="RioHeader"][data-header-label="Learning Instances"]');
    this.searchInput = this.frame.getByPlaceholder('Search');
  }

  /** Assert the Learning Instances list page (and its table) loaded. */
  async assertLoaded(): Promise<void> {
    // The module renders inside a separate iframe bundle that loads after
    // the outer route changes — observed taking anywhere from a few
    // seconds to 30s+ against the live instance (consistent with
    // FormDesignerPage's designer-frame load, the same iframe class), so
    // this gets the same generous, explicit timeout rather than the
    // default.
    await expect(this.heading, 'Learning Instances page header should be visible').toBeVisible({ timeout: 60_000 });
    await expect(this.searchInput, 'Learning Instances search box should be visible').toBeVisible();
  }

  /**
   * Search by name (the search box's filter dropdown defaults to "Name").
   * Confirmed via live testing: `fill()` alone does NOT trigger filtering —
   * the component only re-queries on Enter (verified by filling a
   * non-existent name and observing the table stayed unfiltered until
   * Enter was pressed) — so this always presses Enter, it is not a
   * cosmetic step.
   */
  async searchByName(name: string): Promise<void> {
    await this.searchInput.fill(name);
    await this.searchInput.press('Enter');
  }

  /** The row's `data-row-id` is the Learning Instance ID, upper-cased — confirmed via live DOM capture. */
  private row(instanceId: string): Locator {
    return this.frame.locator(`[data-path="DataTable.row"][data-row-id="${instanceId.toUpperCase()}"]`);
  }

  private cell(instanceId: string, columnId: string): Locator {
    return this.row(instanceId).locator(`[data-column-id="${columnId}"]`);
  }

  /**
   * Waits for the row to appear, polling via Playwright's own auto-waiting
   * `expect().toBeVisible()` rather than a fixed sleep — the table can take
   * a moment to reflect a just-created backend record. Configurable
   * timeout per the "intelligent polling, not arbitrary waits" requirement.
   */
  async waitForRow(instanceId: string, timeoutMs = 30_000): Promise<void> {
    await expect(
      this.row(instanceId),
      `Learning Instance row (id=${instanceId}) should appear in the table within ${timeoutMs}ms`
    ).toBeVisible({ timeout: timeoutMs });
  }

  async isRowVisible(instanceId: string): Promise<boolean> {
    return this.row(instanceId)
      .isVisible()
      .catch(() => false);
  }

  /** Reads the currently-rendered row's cell values, for comparison against the API response. */
  async readRow(instanceId: string): Promise<UiRowSnapshot> {
    const nameCell = this.cell(instanceId, 'name');
    const nameText = (
      await nameCell
        .locator('.rio-link__label')
        .innerText()
        .catch(() => nameCell.innerText())
    ).trim();

    const statusText = (await this.cell(instanceId, 'processStatus').innerText()).trim();
    const documentTypeText = (await this.cell(instanceId, 'domainName').innerText()).trim();
    const testModeText = (await this.cell(instanceId, 'isTestModeEnabled').innerText()).trim();
    const providerText = (await this.cell(instanceId, 'providerName').innerText()).trim();
    const uploadsText = (await this.cell(instanceId, 'metricsUploadCount').innerText()).trim();

    return {
      name: nameText,
      status: statusText,
      documentType: documentTypeText,
      testMode: testModeText,
      provider: providerText,
      uploads: uploadsText,
    };
  }

  /**
   * Full assertion: the row's displayed name/status/document type match
   * the API response. Status comparison is case-insensitive — confirmed
   * via live comparison that the UI renders title case ("Private") while
   * the API returns upper case ("PRIVATE"); that is a display convention,
   * not a real data mismatch.
   *
   * The Community Edition UI has no "Created Date", "Owner", or "Version"
   * columns for this table (confirmed via live DOM capture — the full
   * column set is Name, Test mode, Provider, Document type, Uploads, Last
   * ran, Status, Actions), so those optional extras from the spec are not
   * asserted; there is nothing to check.
   */
  async assertRowMatches(expected: ExpectedLearningInstance): Promise<UiRowSnapshot> {
    const snapshot = await this.readRow(expected.id);

    expect(snapshot.name, 'UI-displayed name should match the API response').toBe(expected.name);
    expect(
      snapshot.status.toLowerCase(),
      `UI-displayed status ("${snapshot.status}") should match the API response ("${expected.status}"), case differences aside`
    ).toBe(expected.status.toLowerCase());
    expect(snapshot.documentType, 'UI-displayed Document Type should be "Invoices"').toBe(expected.documentType);

    return snapshot;
  }

  // --- Failure diagnostics -----------------------------------------------------

  /**
   * Gathers current URL, console logs, and table contents, and returns a
   * single human-readable explanation of the most likely cause: backend
   * failure vs UI synchronization delay vs data mismatch. The API's own
   * "Validate Learning Instance" step (which runs before this one) already
   * proved the record exists server-side, so a missing row here is framed
   * as a UI-side issue, not re-litigated as a possible backend failure.
   */
  async diagnose(expected: ExpectedLearningInstance, consoleLogs: string[]): Promise<string> {
    const url = this.page.url();
    const rowVisible = await this.isRowVisible(expected.id);
    let tableRowNames: string[] = [];
    try {
      tableRowNames = await this.frame.locator('[data-path="DataTable.row"]').locator('.rio-link__label').allInnerTexts();
    } catch {
      /* table may not have rendered at all */
    }

    const lines = [
      `Learning Instance "${expected.name}" (id=${expected.id}) was NOT confirmed in the UI.`,
      `Current URL: ${url}`,
      `Row present in DOM: ${rowVisible}`,
      `Other rows currently in the table: ${tableRowNames.length ? tableRowNames.join(', ') : '(none / table empty)'}`,
      `Recent browser console output: ${consoleLogs.length ? consoleLogs.slice(-10).join(' | ') : '(none captured)'}`,
    ];

    if (!rowVisible && tableRowNames.length === 0) {
      lines.push(
        'Diagnosis: the table rendered with zero rows at all — likely a UI load/sync failure or the search filter matched nothing, ' +
          'NOT necessarily a backend creation failure (the API "Validate Learning Instance" step already confirmed the record exists server-side).'
      );
    } else if (!rowVisible) {
      lines.push(
        'Diagnosis: other rows are visible but this specific instance is not — likely a UI synchronization delay ' +
          '(the record may not have propagated to this list view yet) rather than a backend failure.'
      );
    } else {
      lines.push('Diagnosis: the row is present but one or more displayed fields did not match the API response — a data mismatch, not a visibility/sync issue.');
    }

    return lines.join('\n');
  }
}
