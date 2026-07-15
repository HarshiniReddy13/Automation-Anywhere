import { FrameLocator, Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import {
  API,
  ConditionType,
  DESIGNER_FRAME,
  LogicalOperator,
  SUCCESS_STATUS,
} from '../utils/constants';
import { ConditionConfig, ActionConfig, RuleConfig, TextboxConfig } from '../utils/testData';
import { selectFromCustomDropdown, fillReliably } from '../utils/helpers';
import { StepRecorder } from '../../reporting/StepRecorder';


export class RulesBuilderPage extends BasePage {
  private readonly frame: FrameLocator;
  private readonly refToLabel: Map<string, string>;

  private readonly addRuleButton: Locator;
  private readonly saveButton: Locator;
  private readonly rulesTabLabel: Locator;

  constructor(page: Page, textboxes: TextboxConfig[], recorder?: StepRecorder) {
    super(page, recorder);
    this.frame = page.frameLocator(DESIGNER_FRAME);
    this.refToLabel = new Map(textboxes.map((t) => [t.ref, t.label]));

    this.addRuleButton = this.frame.getByRole('button', { name: /add rule/i }).first();
    this.saveButton = this.frame.getByRole('button', { name: /^save$/i });

    this.rulesTabLabel = this.frame.getByText(/^form rules/i).first();
  }


  private labelFor(ref: string): string {
    const label = this.refToLabel.get(ref);
    if (!label) throw new Error(`Unknown textbox ref: ${ref}`);
    return label;
  }


  private allRuleCards(): Locator {
    return this.frame.locator('div.rules-widget');
  }


  private ruleCard(name: string): Locator {
    return this.frame
      .locator(`div.rules-widget[id="${name}"]`)
      .or(this.frame.locator('div.rules-widget').filter({ hasText: name }))
      .first();
  }

  private ruleCardByIndex(index: number): Locator {
    return this.allRuleCards().nth(index);
  }


  private option(name: string): Locator {
    return this.frame
      .locator('[data-path="RioSelectInput.Dropdown.option-button"]')
      .filter({ hasText: name })
      .or(this.frame.getByRole('option', { name }))
      .first();
  }


  async assertLoaded(): Promise<void> {
    await expect(this.addRuleButton, 'Add Rule button visible').toBeVisible();
  }


  async ruleCount(): Promise<number> {
    const text = (await this.rulesTabLabel.textContent().catch(() => '')) ?? '';
    const match = text.match(/\((\d+)\)/);
    return match ? Number(match[1]) : 0;
  }

  async addRule(): Promise<void> {
    const before = await this.ruleCount();
    await this.addRuleButton.click();
    await expect
      .poll(async () => this.ruleCount(), { timeout: 10_000 })
      .toBe(before + 1);
  }


  async addRuleBelow(existingRuleName: string): Promise<void> {
    const before = await this.ruleCount();
    const card = this.ruleCard(existingRuleName);
    await expect(card).toBeVisible();

    const contextMenuTrigger = card
      .getByRole('button', { name: /menu|more|options|actions/i })
      .or(card.locator('[class*="menu-trigger"],[aria-haspopup="menu"],[class*="kebab"]'))
      .first();
    await expect(contextMenuTrigger, 'Context menu trigger visible').toBeVisible();
    await contextMenuTrigger.click();

    const addBelow = this.frame
      .getByRole('menuitem', { name: /add rule below/i })
      .or(this.frame.getByText(/add rule below/i))
      .first();
    await expect(addBelow, 'Context menu opened with "Add Rule Below"').toBeVisible();
    await addBelow.click();

    await expect
      .poll(async () => this.ruleCount(), { timeout: 10_000 })
      .toBe(before + 1);
  }


  async nameRule(currentIndex: number, name: string): Promise<void> {
    const card = this.ruleCardByIndex(currentIndex);
    const editButton = card.getByRole('button', { name: /^edit$/i }).first();
    await expect(editButton, 'Edit button visible').toBeVisible();
    await editButton.click();

    const nameInput = card
      .getByRole('textbox')
      .or(card.getByLabel(/rule name|name/i))
      .or(card.getByPlaceholder(/rule name|name/i))
      .first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(name);
    await nameInput.blur();
    await expect(card).toContainText(name);
  }

  
  async assertRuleExpandedWithEdit(name: string): Promise<void> {
    const card = this.ruleCard(name);
    await expect(card, `Rule "${name}" displayed`).toBeVisible();
    await expect(card).toContainText(name);

    const editButton = card.getByRole('button', { name: /^edit$/i });
    await expect(editButton, 'Edit button visible').toBeVisible();


    await expect(
      card.getByText(/the following conditions are met/i),
      `Rule "${name}" is expanded`
    ).toBeVisible();
  }


  async addCondition(
    ruleName: string,
    condition: ConditionConfig,
    isFirst: boolean,
    logicalOperator: LogicalOperator
  ): Promise<void> {
    const card = this.ruleCard(ruleName);
    await expect(card).toBeVisible();


    const elementTriggerLocator = card
      .getByRole('textbox', { name: /^select element$/i })
      .or(card.getByRole('combobox', { name: /element|field|component/i }));

    if (isFirst) {
      await expect(elementTriggerLocator.first()).toBeVisible();
    } else {
      const addConditionBtn = card.getByRole('button', { name: /add condition/i }).first();
      await expect(addConditionBtn).toBeVisible();
      const before = await elementTriggerLocator.count();
      await addConditionBtn.click();
      await expect(elementTriggerLocator).toHaveCount(before + 1);
    }


    const elementLabel = this.labelFor(condition.elementRef);
    const triggerCount = await elementTriggerLocator.count();
    const elementTrigger = elementTriggerLocator.nth(triggerCount - 2);
    await selectFromCustomDropdown(elementTrigger, this.option(elementLabel));


    const typeTrigger = card
      .getByPlaceholder(/^select condition$/i)
      .or(card.getByRole('combobox', { name: /condition|operator|type/i }))
      .last();
    await selectFromCustomDropdown(typeTrigger, this.option(condition.conditionType));

    // Value field should appear only for value-based conditions.
    const valueField = card
      .getByRole('textbox', { name: /value/i })
      .or(card.getByPlaceholder(/value/i))
      .last();
    if (this.requiresValue(condition.conditionType)) {
      await expect(valueField, 'Value field appears for value-based condition').toBeVisible();
      await fillReliably(valueField, condition.value ?? '');
      await expect(valueField).toHaveValue(condition.value ?? '');
    } else {
      await expect(valueField, 'Value field hidden for non-value condition').toBeHidden();
    }

    // Set the AND/OR operator for the second+ condition.
    if (!isFirst) {
      const operatorControl = card
        .getByRole('button', { name: new RegExp(`^${logicalOperator}$`, 'i') })
        .or(card.getByText(new RegExp(`^${logicalOperator}$`, 'i')))
        .first();
      await expect(operatorControl).toBeVisible();
      await operatorControl.click();
    }
  }

  /** Whether a condition type needs a value input. */
  private requiresValue(type: ConditionType): boolean {
    return ![ConditionType.IsNotEmpty, ConditionType.IsEmpty].includes(type);
  }

  /** Assert a condition is displayed correctly inside a rule. */
  async assertConditionSaved(ruleName: string, condition: ConditionConfig): Promise<void> {
    const card = this.ruleCard(ruleName);
    await expect(card).toContainText(this.labelFor(condition.elementRef));

    await expect(card).toContainText(condition.conditionType, { ignoreCase: true });
    if (this.requiresValue(condition.conditionType) && condition.value) {
      
      const valueField = card
        .getByRole('textbox', { name: /value/i })
        .or(card.getByPlaceholder(/value/i))
        .last();
      await expect(valueField).toHaveValue(condition.value);
    }
  }

  async assertOperatorSelected(
    ruleName: string,
    operator: LogicalOperator,
    expectedConditionCount: number
  ): Promise<void> {
    const card = this.ruleCard(ruleName);
    const activeOperator = card
      .locator(`[class*="operator"][class*="active"], [aria-pressed="true"]`)
      .filter({ hasText: new RegExp(`^${operator}$`, 'i') })
      .or(card.getByText(new RegExp(`^${operator}$`, 'i')))
      .first();
    await expect(activeOperator, `${operator} selected`).toBeVisible();


    const conditionRows = card.getByRole('button', { name: /move up/i });
    await expect(conditionRows).toHaveCount(expectedConditionCount);
  }


  async addAction(ruleName: string, action: ActionConfig): Promise<void> {
    const card = this.ruleCard(ruleName);
    await expect(card).toBeVisible();


    const targetLabel = this.labelFor(action.targetRef);
    const targetTrigger = card
      .getByRole('textbox', { name: /^select element$/i })
      .or(card.getByRole('combobox', { name: /element|target|field/i }))
      .last();
    await selectFromCustomDropdown(targetTrigger, this.option(targetLabel));

    await this.page.keyboard.press('Escape');


    const actionTypeTrigger = card
      .getByPlaceholder(/^select action$/i)
      .or(card.getByRole('combobox', { name: /action|type/i }))
      .or(card.locator('[class*="action-select"]'));
    if (await actionTypeTrigger.count()) {
      await selectFromCustomDropdown(actionTypeTrigger.last(), this.option(action.type));
    }

    const valueField = card
      .getByRole('textbox', { name: /value/i })
      .or(card.getByPlaceholder(/value/i))
      .last();
    await expect(valueField).toBeVisible();
    await fillReliably(valueField, action.value);
    await expect(valueField).toHaveValue(action.value);
  }

  async assertActionSaved(ruleName: string, action: ActionConfig): Promise<void> {
    const card = this.ruleCard(ruleName);

    const actionTypeIndicator = card
      .getByPlaceholder(/^select action$/i)
      .or(card.getByRole('combobox', { name: /action|type/i }))
      .or(card.locator('[class*="action-select"]'));
    if (await actionTypeIndicator.count()) {
      await expect(card).toContainText(action.type, { ignoreCase: true });
    }
    await expect(card).toContainText(this.labelFor(action.targetRef));

    const valueField = card
      .getByRole('textbox', { name: /value/i })
      .or(card.getByPlaceholder(/value/i))
      .last();
    await expect(valueField).toHaveValue(action.value);
  }


  async buildRule(rule: RuleConfig): Promise<void> {
    for (let i = 0; i < rule.conditions.length; i++) {
      await this.addCondition(rule.name, rule.conditions[i], i === 0, rule.logicalOperator);
    }
    for (const action of rule.actions) {
      await this.addAction(rule.name, action);
    }
  }


  async saveRules(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();

    const responsePromise = this.page.waitForResponse(
      (r) =>
        (API.RULES_SAVE.test(r.url()) || API.FORM_SAVE.test(r.url())) &&
        ['POST', 'PUT'].includes(r.request().method()),
      { timeout: 60_000 }
    );

    await this.saveButton.click();
    const response = await responsePromise;

    expect(
      SUCCESS_STATUS.includes(response.status() as 200 | 201),
      `Rules save returned ${response.status()}`
    ).toBeTruthy();

    try {
      const body = await response.json();
      const serialized = JSON.stringify(body).toLowerCase();
      expect(serialized).toContain('rule');
    } catch {
    }

    await this.expectSuccessToast();
  }

  async assertRulesPersisted(expectedOrder: string[]): Promise<void> {
    await expect
      .poll(async () => this.ruleCount(), { timeout: 10_000 })
      .toBe(expectedOrder.length);

    for (let i = 0; i < expectedOrder.length; i++) {
      await expect(
        this.ruleCardByIndex(i),
        `Rule #${i + 1} is "${expectedOrder[i]}"`
      ).toContainText(expectedOrder[i]);
    }
  }
}
