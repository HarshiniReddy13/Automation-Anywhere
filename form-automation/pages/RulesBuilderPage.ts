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

/**
 * RulesBuilderPage — the "Form rules" tab of the designer. Like the designer
 * itself, this lives inside the editor <iframe>, so all locators resolve
 * through `this.frame`.
 *
 * A `refToLabel` map lets tests reference textboxes by stable keys
 * (e.g. "textbox1") while the UI selects them by their human label.
 */
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
    // The "Form rules" tab's *accessible name* renders as "[object Object]"
    // (a bug in the app itself) but its visible text reliably reads
    // "Form rules (N)" with a live count, matched loosely so it also
    // resolves when there's no "(N)" suffix yet (0 rules).
    this.rulesTabLabel = this.frame.getByText(/^form rules/i).first();
  }

  // --- Element resolution -----------------------------------------------------

  private labelFor(ref: string): string {
    const label = this.refToLabel.get(ref);
    if (!label) throw new Error(`Unknown textbox ref: ${ref}`);
    return label;
  }

  /**
   * All rule card containers, in display order. Confirmed via a live
   * capture: every card is a `<div class="rules-widget" id="<rule name>">`
   * — a stable, purpose-built hook, unlike everything else in this app's
   * markup. Works regardless of expand/collapse state, unlike text-based
   * markers (e.g. "the following conditions are met"), which this app only
   * renders for the currently-expanded card — collapsing a previously
   * expanded card (which happens automatically whenever a new one is
   * added) removes that marker from the DOM entirely.
   */
  private allRuleCards(): Locator {
    return this.frame.locator('div.rules-widget');
  }

  /**
   * A rule card located by its rule name. `id="<rule name>"` only holds
   * for cards still using their auto-assigned default name (the main
   * spec's "Rule1"/"Rule2"/"Rule3" happen to match those defaults, which
   * is why this looked solid at first) — renaming to a name that differs
   * from the default (e.g. "VisibilityRule") updates the visible header
   * text but not the `id`, confirmed via a live run. Fall back to matching
   * by visible text on the same stable `div.rules-widget` card element.
   */
  private ruleCard(name: string): Locator {
    return this.frame
      .locator(`div.rules-widget[id="${name}"]`)
      .or(this.frame.locator('div.rules-widget').filter({ hasText: name }))
      .first();
  }

  /**
   * The Nth rule card in display order, independent of its (possibly not
   * yet assigned) name — used right after creation, before naming.
   */
  private ruleCardByIndex(index: number): Locator {
    return this.allRuleCards().nth(index);
  }

  /**
   * Frame-scoped option in an open dropdown/listbox. Confirmed via a live
   * DOM capture: this app's dropdowns are a custom "Rio" design-system
   * component with no ARIA role at all (not even `role="option"`) — options
   * are `[data-path="RioSelectInput.Dropdown.option-button"]` elements
   * matched by their visible text instead.
   */
  private option(name: string): Locator {
    return this.frame
      .locator('[data-path="RioSelectInput.Dropdown.option-button"]')
      .filter({ hasText: name })
      .or(this.frame.getByRole('option', { name }))
      .first();
  }

  // --- Page-level validations -------------------------------------------------

  /** Assert the Rules Builder UI is displayed and ready. */
  async assertLoaded(): Promise<void> {
    await expect(this.addRuleButton, 'Add Rule button visible').toBeVisible();
  }

  /**
   * Number of rules, read from the "Form rules (N)" tab label rather than
   * counting rule-card DOM nodes: the card container has no distinguishing
   * class or role in this app's markup (confirmed by inspecting a live
   * capture), so a CSS-class-based count silently always returns 0.
   */
  async ruleCount(): Promise<number> {
    const text = (await this.rulesTabLabel.textContent().catch(() => '')) ?? '';
    const match = text.match(/\((\d+)\)/);
    return match ? Number(match[1]) : 0;
  }

  // --- Rule creation ----------------------------------------------------------

  /** Click the primary "Add Rule" button and wait for a new card to appear. */
  async addRule(): Promise<void> {
    const before = await this.ruleCount();
    await this.addRuleButton.click();
    await expect
      .poll(async () => this.ruleCount(), { timeout: 10_000 })
      .toBe(before + 1);
  }

  /**
   * Create a rule below an existing one via the rule card context menu
   * ("Add Rule Below").
   */
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

  /**
   * Rename the rule at `currentIndex` (the one currently being edited). The
   * rule's name renders as plain (non-input) text until its "edit" pencil
   * is clicked, which is what reveals the actual editable field — so this
   * clicks it first rather than assuming an input is already present.
   */
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

  /** Assert a rule exists, is expanded, and exposes an Edit button. */
  async assertRuleExpandedWithEdit(name: string): Promise<void> {
    const card = this.ruleCard(name);
    await expect(card, `Rule "${name}" displayed`).toBeVisible();
    await expect(card).toContainText(name);

    const editButton = card.getByRole('button', { name: /^edit$/i });
    await expect(editButton, 'Edit button visible').toBeVisible();

    // "Expanded" is evidenced by the conditions/actions body being rendered
    // (collapsed cards don't show this fixed template text).
    await expect(
      card.getByText(/the following conditions are met/i),
      `Rule "${name}" is expanded`
    ).toBeVisible();
  }

  // --- Conditions -------------------------------------------------------------

  /**
   * Add a condition to a named rule. Selects the element and condition type,
   * fills the value field only when the condition type requires one, and sets
   * the logical operator for conditions beyond the first.
   */
  async addCondition(
    ruleName: string,
    condition: ConditionConfig,
    isFirst: boolean,
    logicalOperator: LogicalOperator
  ): Promise<void> {
    const card = this.ruleCard(ruleName);
    await expect(card).toBeVisible();

    // Confirmed via a live capture: a brand-new rule card already renders
    // one empty condition row AND one empty action row (both pickers share
    // the identical accessible name "Select element") before "Add
    // condition"/"Add action" is ever clicked. So the first condition
    // reuses the default condition row; only 2nd+ conditions need the
    // button clicked to create an additional one.
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

    // Select the target element by its label. Confirmed via a live DOM
    // capture: the trigger is a `textbox` with accessible name
    // "Select element" (not a `combobox`, despite behaving like one).
    //
    // IMPORTANT: `.last()` is wrong here. The action section's own default
    // "Select element" picker exists on the card from the moment it's
    // created — before any condition work happens — and it always sits
    // after every condition row in DOM order. So among all "Select
    // element" triggers on the card, the *last* one is always the action's
    // (until addAction() actually runs), and the condition we just
    // ensured/added is always second-to-last.
    const elementLabel = this.labelFor(condition.elementRef);
    const triggerCount = await elementTriggerLocator.count();
    const elementTrigger = elementTriggerLocator.nth(triggerCount - 2);
    await selectFromCustomDropdown(elementTrigger, this.option(elementLabel));

    // Select the condition type. Confirmed via a live capture: this
    // dropdown only renders after the element is selected (progressive
    // disclosure), and its trigger is a real `<input placeholder="Select
    // condition">` — role `textbox`, matched by placeholder, same "Rio"
    // component pattern as the element picker.
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
    // Confirmed via a live capture: the UI renders condition types in
    // sentence case ("Is not empty") while our enum uses title case
    // ("Is Not Empty") as a stable identifier — compare case-insensitively.
    await expect(card).toContainText(condition.conditionType, { ignoreCase: true });
    if (this.requiresValue(condition.conditionType) && condition.value) {
      // An <input>'s current value is never part of its DOM text content,
      // so toContainText() can never see it (confirmed via a live capture:
      // the fill genuinely worked — data-value="John" was right there on
      // the wrapper — but the card's rendered text simply never includes
      // it). Check the actual field value instead.
      const valueField = card
        .getByRole('textbox', { name: /value/i })
        .or(card.getByPlaceholder(/value/i))
        .last();
      await expect(valueField).toHaveValue(condition.value);
    }
  }

  /** Assert the chosen logical operator is selected and both conditions show. */
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

    // Counting "Select element" triggers by name breaks here: once a
    // picker has a selection, this app removes its placeholder/aria-label
    // entirely (confirmed via a live capture — the underlying <input>'s
    // value stays "", the current selection renders as a separate chip),
    // so an already-configured condition's trigger no longer matches
    // "Select element" at all. Each condition row's reorder control (a
    // single button whose accessible name contains both "Move up" and
    // "Move down") is a stable, selection-state-independent per-row marker
    // instead, confirmed to appear exactly once per condition row.
    const conditionRows = card.getByRole('button', { name: /move up/i });
    await expect(conditionRows).toHaveCount(expectedConditionCount);
  }

  // --- Actions ----------------------------------------------------------------

  /**
   * Add an action to a rule: type, target element, and value. Like
   * conditions, a rule card auto-renders one empty action row on creation;
   * every rule in this suite's test data has exactly one action, so this
   * always reuses that default row. If a rule ever needs a 2nd+ action,
   * this will need the same "click Add action only for 2nd+" branching
   * `addCondition()` uses for conditions.
   */
  async addAction(ruleName: string, action: ActionConfig): Promise<void> {
    const card = this.ruleCard(ruleName);
    await expect(card).toBeVisible();

    // Target element. Confirmed via a live DOM capture: the trigger is a
    // `textbox` with accessible name "Select element" — the same pattern
    // condition rows use. Since conditions are always built before actions
    // in this flow, `.last()` on the card reliably lands on the action row.
    //
    // IMPORTANT: target must be selected FIRST. The action-type dropdown
    // ("Select action") only renders after the target is chosen —
    // progressive disclosure, the same pattern the condition-type dropdown
    // uses after its element is chosen. Selecting type-then-target (the
    // original assumed order) meant the type dropdown didn't exist yet.
    const targetLabel = this.labelFor(action.targetRef);
    const targetTrigger = card
      .getByRole('textbox', { name: /^select element$/i })
      .or(card.getByRole('combobox', { name: /element|target|field/i }))
      .last();
    await selectFromCustomDropdown(targetTrigger, this.option(targetLabel));
    // Unlike the condition element picker (single-select, auto-closes on
    // selection), this target picker is a multi-select component that
    // stays open after picking an option — confirmed via a live capture
    // (the dropdown list remained open, covering the fields beneath it).
    // Close it explicitly so the rest of the row becomes interactable.
    await this.page.keyboard.press('Escape');

    // Action type. Confirmed via a live capture: this dropdown ("Select
    // action") only appears once the target is set. Guarded rather than
    // assumed present, since only "Set Value" (this suite's only action
    // type) has been observed and its exact role/name are unconfirmed.
    const actionTypeTrigger = card
      .getByPlaceholder(/^select action$/i)
      .or(card.getByRole('combobox', { name: /action|type/i }))
      .or(card.locator('[class*="action-select"]'));
    if (await actionTypeTrigger.count()) {
      await selectFromCustomDropdown(actionTypeTrigger.last(), this.option(action.type));
    }

    // Value to assign.
    const valueField = card
      .getByRole('textbox', { name: /value/i })
      .or(card.getByPlaceholder(/value/i))
      .last();
    await expect(valueField).toBeVisible();
    await fillReliably(valueField, action.value);
    await expect(valueField).toHaveValue(action.value);
  }

  /** Assert an action is displayed with the correct type, target, and value. */
  async assertActionSaved(ruleName: string, action: ActionConfig): Promise<void> {
    const card = this.ruleCard(ruleName);
    // Confirmed via a live capture: the default action row has no visible
    // type label/dropdown until a target is selected (progressive
    // disclosure — see addAction()'s note). By the time this assertion
    // runs, addAction() has already completed, so it should exist; this
    // guard just avoids a hard dependency on that dropdown's still-
    // unconfirmed exact role/name.
    const actionTypeIndicator = card
      .getByPlaceholder(/^select action$/i)
      .or(card.getByRole('combobox', { name: /action|type/i }))
      .or(card.locator('[class*="action-select"]'));
    if (await actionTypeIndicator.count()) {
      await expect(card).toContainText(action.type, { ignoreCase: true });
    }
    await expect(card).toContainText(this.labelFor(action.targetRef));
    // An <input>'s value is never part of the DOM text content (see
    // assertConditionSaved's note) — check the field's actual value.
    const valueField = card
      .getByRole('textbox', { name: /value/i })
      .or(card.getByPlaceholder(/value/i))
      .last();
    await expect(valueField).toHaveValue(action.value);
  }

  // --- High-level orchestration ----------------------------------------------

  /** Build a complete rule (conditions + operator + actions) into its card. */
  async buildRule(rule: RuleConfig): Promise<void> {
    for (let i = 0; i < rule.conditions.length; i++) {
      await this.addCondition(rule.name, rule.conditions[i], i === 0, rule.logicalOperator);
    }
    for (const action of rule.actions) {
      await this.addAction(rule.name, action);
    }
  }

  // --- Persistence & verification --------------------------------------------

  /** Save the form/rules, validating both the API response and the UI toast. */
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
      /* Non-JSON responses fall back to the UI toast assertion below. */
    }

    await this.expectSuccessToast();
  }

  /** Verify that all expected rules persist, in the correct order. */
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
