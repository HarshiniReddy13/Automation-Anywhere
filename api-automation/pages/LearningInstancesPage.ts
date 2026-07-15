import { FrameLocator, Locator, Page, expect } from '@playwright/test';


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

  async assertLoaded(): Promise<void> {

    await expect(this.heading, 'Learning Instances page header should be visible').toBeVisible({ timeout: 60_000 });
    await expect(this.searchInput, 'Learning Instances search box should be visible').toBeVisible();
  }

  async searchByName(name: string): Promise<void> {
    await this.searchInput.fill(name);
    await this.searchInput.press('Enter');
  }

  private row(instanceId: string): Locator {
    return this.frame.locator(`[data-path="DataTable.row"][data-row-id="${instanceId.toUpperCase()}"]`);
  }

  private cell(instanceId: string, columnId: string): Locator {
    return this.row(instanceId).locator(`[data-column-id="${columnId}"]`);
  }


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


  async diagnose(expected: ExpectedLearningInstance, consoleLogs: string[]): Promise<string> {
    const url = this.page.url();
    const rowVisible = await this.isRowVisible(expected.id);
    let tableRowNames: string[] = [];
    try {
      tableRowNames = await this.frame.locator('[data-path="DataTable.row"]').locator('.rio-link__label').allInnerTexts();
    } catch {
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
