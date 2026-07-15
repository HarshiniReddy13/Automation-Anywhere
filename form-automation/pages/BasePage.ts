import { Locator, Page, expect } from '@playwright/test';
import { StepRecorder } from '../../reporting/StepRecorder';
import { StepCategory } from '../../reporting/types';
import { dragAndDrop } from '../utils/helpers';


export abstract class BasePage {
  protected readonly page: Page;
  private readonly recorder?: StepRecorder;

  
  constructor(page: Page, recorder?: StepRecorder) {
    this.page = page;
    this.recorder = recorder;
  }

  

  private async recordedStep<T>(
    name: string,
    category: StepCategory,
    action: () => Promise<T>,
    locatorDescription?: string
  ): Promise<T> {
    if (!this.recorder) return action();
    return this.recorder.runStep(name, category, action, { locatorDescription });
  }

  
  async navigateWithReport(url: string, description = `Navigate to ${url}`): Promise<void> {
    await this.recordedStep(description, 'navigate', () => this.goto(url));
  }

  
  async clickWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'click', () => locator.click(), description);
  }

  
  async dblClickWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'doubleClick', () => locator.dblclick(), description);
  }

  
  async rightClickWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'rightClick', () => locator.click({ button: 'right' }), description);
  }

  
  async fillWithReport(locator: Locator, value: string, description: string): Promise<void> {
    await this.recordedStep(description, 'fill', () => locator.fill(value), description);
  }

  
  async selectWithReport(
    locator: Locator,
    value: string | string[],
    description: string
  ): Promise<void> {
    await this.recordedStep(description, 'select', () => locator.selectOption(value).then(() => undefined), description);
  }

  
  async checkWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'check', () => locator.check(), description);
  }

  
  async uncheckWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'uncheck', () => locator.uncheck(), description);
  }

  
  async hoverWithReport(locator: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'hover', () => locator.hover(), description);
  }

  
  async dragAndDropWithReport(source: Locator, target: Locator, description: string): Promise<void> {
    await this.recordedStep(description, 'dragDrop', () => dragAndDrop(this.page, source, target), description);
  }

  
  async uploadFileWithReport(
    locator: Locator,
    files: string | string[],
    description: string
  ): Promise<void> {
    await this.recordedStep(description, 'uploadFile', () => locator.setInputFiles(files), description);
  }

  
  async pressKeyWithReport(key: string, description = `Press "${key}"`): Promise<void> {
    await this.recordedStep(description, 'keyboard', () => this.page.keyboard.press(key));
  }


  async assertWithReport(description: string, fn: () => Promise<void>): Promise<void> {
    await this.recordedStep(description, 'assertion', fn);
  }

  
  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }


  protected successToast(): Locator {
    return this.page
      .locator('[data-path="Toast"]')
      .filter({ hasText: /success|saved|created/i })
      .or(this.page.getByRole('alert').filter({ hasText: /success|saved|created/i }));
  }

  async expectSuccessToast(): Promise<void> {
    await expect(this.successToast().first()).toBeVisible();
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async title(): Promise<string> {
    return this.page.title();
  }
}
