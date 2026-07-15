import { FrameLocator, Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { API, ComponentType, DESIGNER_FRAME, SUCCESS_STATUS } from '../utils/constants';
import { TextboxConfig } from '../utils/testData';
import { dragAndDrop, setFieldValue } from '../utils/helpers';
import { StepRecorder } from '../../reporting/StepRecorder';


export class FormDesignerPage extends BasePage {
  private readonly frame: FrameLocator;

  private readonly propertiesTab: Locator;
  private readonly rulesTab: Locator;
  private readonly canvas: Locator;
  private readonly saveButton: Locator;

  constructor(page: Page, recorder?: StepRecorder) {
    super(page, recorder);
    this.frame = page.frameLocator(DESIGNER_FRAME);

    this.propertiesTab = this.frame
      .getByRole('tab', { name: /^properties$/i })
      .or(this.frame.getByText(/^properties$/i))
      .first();
    this.rulesTab = this.frame
      .getByRole('tab', { name: /form rules/i })
      .or(this.frame.getByText(/form rules/i))
      .first();

    this.canvas = this.frame.locator('.formcanvas__leftpane[data-item-type="content"]').first();
    this.saveButton = this.frame.getByRole('button', { name: /^save$/i });
  }


  private paletteItem(type: ComponentType): Locator {
    return this.frame
      .getByRole('button', { name: new RegExp(`^${type}$`, 'i') })
      .or(this.frame.getByText(new RegExp(`^${type}$`, 'i')))
      .first();
  }

  private placedComponents(): Locator {
    return this.frame.locator('.formcanvas-formgroup');
  }

  private canvasComponent(index: number): Locator {
    return this.placedComponents().nth(index);
  }


  private propertyField(label: string): Locator {
    const unlabeledFieldNames: Record<string, string> = { 'Tool tip': 'toolTip' };
    const byLabel = this.frame.getByLabel(label, { exact: true }).first();
    const fallbackName = unlabeledFieldNames[label];
    return fallbackName
      ? byLabel.or(this.frame.locator(`[name="${fallbackName}"]`)).first()
      : byLabel;
  }


  async assertDesignerOpen(): Promise<void> {

    await expect(this.paletteItem(ComponentType.Textbox)).toBeVisible({ timeout: 45_000 });
    await expect(this.propertiesTab).toBeVisible();
  }

  async componentCount(): Promise<number> {
    return this.placedComponents().count();
  }


  async addComponent(type: ComponentType): Promise<void> {
    await dragAndDrop(this.page, this.paletteItem(type), this.canvas);
  }

  async addTextboxes(count: number): Promise<void> {
    const before = await this.componentCount();
    for (let i = 0; i < count; i++) {
      await this.addComponent(ComponentType.Textbox);
      await expect
        .poll(async () => this.componentCount(), { timeout: 10_000 })
        .toBe(before + i + 1);
    }
  }


  async configureTextbox(index: number, config: TextboxConfig): Promise<void> {
    await this.canvasComponent(index).click();
    await expect(this.propertiesTab).toBeVisible();

    await setFieldValue(this.propertyField('Element label'), config.label);
    await setFieldValue(this.propertyField('Min'), String(config.minLength));
    await setFieldValue(this.propertyField('Max'), String(config.maxLength));
    await setFieldValue(this.propertyField('Hint below field'), config.hintText);
    await setFieldValue(this.propertyField('Tool tip'), config.tooltip);
    await setFieldValue(this.propertyField('Default value'), config.defaultValue);
  }

  async assertTextboxConfigured(index: number, config: TextboxConfig): Promise<void> {
    await this.canvasComponent(index).click();
    await expect(this.propertiesTab).toBeVisible();

    await expect(this.propertyField('Element label')).toHaveValue(config.label);
    await expect(this.propertyField('Min')).toHaveValue(String(config.minLength));
    await expect(this.propertyField('Max')).toHaveValue(String(config.maxLength));
    await expect(this.propertyField('Hint below field')).toHaveValue(config.hintText);
    await expect(this.propertyField('Tool tip')).toHaveValue(config.tooltip);
    await expect(this.propertyField('Default value')).toHaveValue(config.defaultValue);
  }

  async assertSaveEnabled(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
  }

  async saveForm(): Promise<string | undefined> {
    await this.assertSaveEnabled();

    const responsePromise = this.page.waitForResponse(
      (r) =>
        API.FORM_SAVE.test(r.url()) &&
        ['POST', 'PUT'].includes(r.request().method()),
      { timeout: 60_000 }
    );

    await this.saveButton.click();
    const response = await responsePromise;

    expect(
      SUCCESS_STATUS.includes(response.status() as 200 | 201),
      `Form save returned ${response.status()}`
    ).toBeTruthy();

    let formId: string | undefined;
    try {
      const body = await response.json();
      formId = String(body.id ?? body.formId ?? body.data?.id ?? '');
      expect(formId, 'Response contains a Form ID').toBeTruthy();
    } catch {
    }

    await this.expectSuccessToast();
    return formId;
  }

  async goToRulesTab(): Promise<void> {
    await expect(this.rulesTab).toBeVisible();
    await this.rulesTab.click();
  }
}
