import { Locator, Page, expect } from '@playwright/test';
import { StepRecorder } from '../reporting/StepRecorder';
import { StepCategory } from '../reporting/types';
import { dragAndDrop } from '../utils/helpers';

/**
 * BasePage centralizes behavior shared by every Page Object:
 *  - a reference to the Playwright `Page`
 *  - common navigation / waiting primitives
 *  - a uniform toast/notification accessor
 *  - `*WithReport()` action wrappers that automatically record a report
 *    step (name, timing, status, before/after screenshots) with no
 *    reporting code required at the call site
 *
 * Concrete pages extend this class, keeping each page focused on its own
 * responsibilities (Single Responsibility Principle) while reusing shared code.
 */
export abstract class BasePage {
  protected readonly page: Page;
  private readonly recorder?: StepRecorder;

  /**
   * `recorder` is optional and defaults to undefined so existing/derived
   * pages that only ever call `super(page)` keep working unchanged — the
   * `*WithReport()` wrappers below simply run the action directly, with no
   * recording, when no recorder was wired up for this instance.
   */
  constructor(page: Page, recorder?: StepRecorder) {
    this.page = page;
    this.recorder = recorder;
  }

  // --- Reporting wrapper methods ----------------------------------------------

  private async recordedStep<T>(
    name: string,
    category: StepCategory,
    action: () => Promise<T>,
    locatorDescription?: string
  ): Promise<T> {
    if (!this.recorder) return action();
    return this.recorder.runStep(name, category, action, { locatorDescription });
  }

  /** Navigate with an automatically recorded before/after step. */
  async navigateWithReport(url: string, description = `Navigate to ${url}`): Promise<void> {
    await this.recordedStep(description, 'navigate', () => this.goto(url));
  }

  /** Click with an automatically recorded before/after step. */
  async clickWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'click', () => locator.click(), description);
  }

  /** Double-click with an automatically recorded before/after step. */
  async dblClickWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'doubleClick', () => locator.dblclick(), description);
  }

  /** Right-click with an automatically recorded before/after step. */
  async rightClickWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'rightClick', () => locator.click({ button: 'right' }), description);
  }

  /** Fill with an automatically recorded before/after step. */
  async fillWithReport(locator: Locator, value: string, description: string): Promise<void> {
    await this.recordedStep(description, 'fill', () => locator.fill(value), description);
  }

  /** Select-option with an automatically recorded before/after step. */
  async selectWithReport(
    locator: Locator,
    value: string | string[],
    description: string
  ): Promise<void> {
    await this.recordedStep(description, 'select', () => locator.selectOption(value).then(() => undefined), description);
  }

  /** Check (checkbox) with an automatically recorded before/after step. */
  async checkWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'check', () => locator.check(), description);
  }

  /** Uncheck (checkbox) with an automatically recorded before/after step. */
  async uncheckWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'uncheck', () => locator.uncheck(), description);
  }

  /** Hover with an automatically recorded before/after step. */
  async hoverWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'hover', () => locator.hover(), description);
  }

  /** Drag and drop with an automatically recorded before/after step. */
  async dragAndDropWithReport(source: Locator, target: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'dragDrop', () => dragAndDrop(this.page, source, target), description);
  }

  /** File upload with an automatically recorded before/after step. */
  async uploadFileWithReport(
    locator: Locator,
    files: string | string[],
    description: string
  ): Promise<void> {
    await this.recordedStep(description, 'uploadFile', () => locator.setInputFiles(files), description);
  }

  /** Keyboard action with an automatically recorded before/after step. */
  async pressKeyWithReport(key: string, description = `Press "${key}"`): Promise<void> {
    await this.recordedStep(description, 'keyboard', () => this.page.keyboard.press(key));
  }

  /**
   * Wraps an arbitrary assertion callback as a recorded step — use for any
   * `expect(...)` call that should show up in the report with its own
   * before/after evidence, e.g. `assertWithReport('Toast is visible', () =>
   * expect(this.successToast()).toBeVisible())`.
   */
  async assertWithReport(description: string, fn: () => Promise<void>): Promise<void> {
    await this.recordedStep(description, 'assertion', fn);
  }

  /** Navigate to a relative or absolute URL and wait for the network to settle. */
  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Success toast/notification. The tray that hosts toasts
   * (`.main-layout__toast-tray`) is a zero-height positioning wrapper — every
   * ancestor down to the actual toast also matches a `[class*="toast"]`
   * substring selector, so a naive `.first()` picks the invisible wrapper
   * instead of the real element. `[data-path="Toast"]` targets the actual
   * toast node directly.
   */
  protected successToast(): Locator {
    return this.page
      .locator('[data-path="Toast"]')
      .filter({ hasText: /success|saved|created/i })
      .or(this.page.getByRole('alert').filter({ hasText: /success|saved|created/i }));
  }

  /** Assert a success notification/toast is displayed. */
  async expectSuccessToast(): Promise<void> {
    await expect(this.successToast().first()).toBeVisible();
  }

  /** Wait until the page has no in-flight network requests. */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /** Convenience: current page title. */
  async title(): Promise<string> {
    return this.page.title();
  }
}
