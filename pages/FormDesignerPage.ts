import { FrameLocator, Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { API, ComponentType, DESIGNER_FRAME, SUCCESS_STATUS } from '../utils/constants';
import { TextboxConfig } from '../utils/testData';
import { dragAndDrop, setFieldValue } from '../utils/helpers';
import { StepRecorder } from '../reporting/StepRecorder';

/**
 * FormDesignerPage — the low-code canvas where components are dragged from a
 * palette, configured via a properties panel, and the form is saved.
 *
 * IMPORTANT: In Automation Anywhere the designer renders inside an <iframe>, so
 * every designer element is resolved through `this.frame` (a FrameLocator).
 * Network interception (waitForResponse) still uses the top-level `page`.
 */
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
    // The canvas drop target is the form content pane. Note: `.formcanvas-dropzone-bar`
    // looks like the obvious target but is `display:none` except mid-drag, so it has no
    // geometry to drag onto; the always-visible content pane is the real drop surface.
    this.canvas = this.frame.locator('.formcanvas__leftpane[data-item-type="content"]').first();
    this.saveButton = this.frame.getByRole('button', { name: /^save$/i });
  }

  // --- Palette / canvas locators (parameterized) -----------------------------

  /** Palette item to drag from, by component type (scoped to the frame). */
  private paletteItem(type: ComponentType): Locator {
    return this.frame
      .getByRole('button', { name: new RegExp(`^${type}$`, 'i') })
      .or(this.frame.getByText(new RegExp(`^${type}$`, 'i')))
      .first();
  }

  /** All components placed on the canvas (each dropped element is a formgroup). */
  private placedComponents(): Locator {
    return this.frame.locator('.formcanvas-formgroup');
  }

  /** A placed component on the canvas, by zero-based index. */
  private canvasComponent(index: number): Locator {
    return this.placedComponents().nth(index);
  }

  /**
   * Property-panel field accessor. Most designer inputs carry an `aria-label`
   * equal to the visible field label, so getByLabel resolves them reliably.
   * "Tool tip" is an exception in the app's own markup: its <label> has no
   * `for`/`aria-labelledby` and the <textarea> has no `aria-label`, so it can
   * only be found by its stable `name` attribute.
   */
  private propertyField(label: string): Locator {
    const unlabeledFieldNames: Record<string, string> = { 'Tool tip': 'toolTip' };
    const byLabel = this.frame.getByLabel(label, { exact: true }).first();
    const fallbackName = unlabeledFieldNames[label];
    return fallbackName
      ? byLabel.or(this.frame.locator(`[name="${fallbackName}"]`)).first()
      : byLabel;
  }

  // --- Validations -----------------------------------------------------------

  /** Assert the Form Designer opened successfully. */
  async assertDesignerOpen(): Promise<void> {
    // Palette + Properties tab both live inside the designer frame, which
    // loads as a separate module bundle after the outer page navigates —
    // observed anywhere from ~2s to 12s+ for the URL alone to update before
    // the iframe even starts rendering, on top of the iframe's own load
    // time. The default 20s expect timeout has been seen to just barely
    // miss this on a slow run (caught a real failure, recovered by retry),
    // so this gets the same generous, explicit timeout as other slow-
    // loading transitions in this codebase (e.g. HomePage.assertLoaded).
    await expect(this.paletteItem(ComponentType.Textbox)).toBeVisible({ timeout: 45_000 });
    await expect(this.propertiesTab).toBeVisible();
  }

  /** Count component elements currently on the canvas. */
  async componentCount(): Promise<number> {
    return this.placedComponents().count();
  }

  // --- Actions ---------------------------------------------------------------

  /** Drag a single component of `type` from the palette onto the canvas. */
  async addComponent(type: ComponentType): Promise<void> {
    await dragAndDrop(this.page, this.paletteItem(type), this.canvas);
  }

  /**
   * Drag `count` Textbox components onto the canvas and assert the canvas
   * updated after each drop.
   */
  async addTextboxes(count: number): Promise<void> {
    const before = await this.componentCount();
    for (let i = 0; i < count; i++) {
      await this.addComponent(ComponentType.Textbox);
      await expect
        .poll(async () => this.componentCount(), { timeout: 10_000 })
        .toBe(before + i + 1);
    }
  }

  /**
   * Select a canvas component and configure every property.
   * Field discovery is label-first so it adapts to minor markup changes.
   */
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

  /** Verify a component's property fields retained the configured values. */
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

  /** Assert the Save button is enabled. */
  async assertSaveEnabled(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
  }

  /**
   * Save the form, intercepting the persistence API to validate the backend
   * accepted it. Returns the created/updated Form ID when present.
   */
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
      // Non-JSON body — UI toast assertion below still guards success.
    }

    await this.expectSuccessToast();
    return formId;
  }

  /** Switch to the "Form rules" tab. */
  async goToRulesTab(): Promise<void> {
    await expect(this.rulesTab).toBeVisible();
    await this.rulesTab.click();
  }
}
