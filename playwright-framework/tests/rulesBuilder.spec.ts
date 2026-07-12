import { test, expect } from '../fixtures/baseFixture';
import { ConditionType, LogicalOperator } from '../utils/constants';
import {
  TEXTBOXES,
  RULES,
  EXPECTED_RULE_ORDER,
  generateFormName,
} from '../utils/testData';

/**
 * End-to-end Rules Builder workflow.
 *
 * The spec is intentionally thin: it describes the WORKFLOW while all business
 * logic and assertions live inside the Page Objects. Each phase is wrapped in a
 * `test.step()` for rich, readable reporting.
 */
test.describe('Automation Anywhere — Form & Rules Builder E2E', () => {
  // Unique per run so parallel/repeat executions never collide.
  const formName = generateFormName();

  test(
    'creates a form, configures textboxes, builds three rules, and persists them',
    {
      annotation: {
        type: 'description',
        description:
          'End-to-end check of the Rules Builder: log in, build a form with two text fields, ' +
          'then create three rules (conditions, AND logic, and actions) using both the toolbar ' +
          '"Add rule" button and the "Add Rule Below" context menu, save, and confirm all three ' +
          'rules persist in the correct order after saving.',
      },
    },
    async ({ loginPage, homePage, automationPage, formDesignerPage, rulesBuilderPage }) => {
    // 1) Login ---------------------------------------------------------------
    await test.step('Login and land on the dashboard', async () => {
      await loginPage.open();
      // Assert the login form only when it is actually shown (an existing SSO
      // session may bypass it entirely).
      if (await loginPage.isLoginFormPresent()) {
        await loginPage.assertLoaded();
      }
      await loginPage.login();
      await homePage.assertLoaded();
    });

    // 2) Navigate to Automation & create a Form ------------------------------
    await test.step('Open Automation and create a new Form', async () => {
      await homePage.goToAutomation();
      await automationPage.assertLoaded();
      await automationPage.assertCreateFormVisible();
      await automationPage.createForm(formName);
      await formDesignerPage.assertDesignerOpen();
    });

    // 3) Drag two Textboxes onto the canvas ----------------------------------
    await test.step('Drag two Textbox components onto the canvas', async () => {
      await formDesignerPage.addTextboxes(2);
      expect(await formDesignerPage.componentCount()).toBeGreaterThanOrEqual(2);
    });

    // 4) Configure both textboxes --------------------------------------------
    await test.step('Configure textbox properties', async () => {
      for (let i = 0; i < TEXTBOXES.length; i++) {
        await formDesignerPage.configureTextbox(i, TEXTBOXES[i]);
        await formDesignerPage.assertTextboxConfigured(i, TEXTBOXES[i]);
      }
    });

    // 5) Save the form -------------------------------------------------------
    await test.step('Save the form and confirm success', async () => {
      await formDesignerPage.assertSaveEnabled();
      const formId = await formDesignerPage.saveForm();
      expect(formId, 'Form ID returned by API').toBeTruthy();
    });

    // 6) Open the Rules tab --------------------------------------------------
    await test.step('Navigate to the Rules tab', async () => {
      await formDesignerPage.goToRulesTab();
      await rulesBuilderPage.assertLoaded();
    });

    // 7) Rule1 with two conditions (AND) and an action -----------------------
    await test.step('Create Rule1 with conditions and an action', async () => {
      const rule1 = RULES[0];
      await rulesBuilderPage.addRule();
      await rulesBuilderPage.nameRule(0, rule1.name);
      await rulesBuilderPage.assertRuleExpandedWithEdit(rule1.name);

      // First condition — Is Not Empty (no value field expected).
      await rulesBuilderPage.addCondition(
        rule1.name,
        rule1.conditions[0],
        true,
        rule1.logicalOperator
      );
      await rulesBuilderPage.assertConditionSaved(rule1.name, rule1.conditions[0]);

      // Second condition — Contains (value field expected) joined with AND.
      await rulesBuilderPage.addCondition(
        rule1.name,
        rule1.conditions[1],
        false,
        rule1.logicalOperator
      );
      await rulesBuilderPage.assertConditionSaved(rule1.name, rule1.conditions[1]);
      await rulesBuilderPage.assertOperatorSelected(
        rule1.name,
        LogicalOperator.And,
        rule1.conditions.length
      );

      // Action — Set Value on the second textbox.
      await rulesBuilderPage.addAction(rule1.name, rule1.actions[0]);
      await rulesBuilderPage.assertActionSaved(rule1.name, rule1.actions[0]);
    });

    // 8) Rule2 via context menu "Add Rule Below" -----------------------------
    await test.step('Create Rule2 below Rule1 via the context menu', async () => {
      const rule2 = RULES[1];
      await rulesBuilderPage.addRuleBelow('Rule1');
      await rulesBuilderPage.nameRule(1, rule2.name);
      await rulesBuilderPage.assertRuleExpandedWithEdit(rule2.name);
      await rulesBuilderPage.buildRule(rule2);
    });

    // 9) Rule3 via context menu "Add Rule Below" -----------------------------
    await test.step('Create Rule3 below Rule2 via the context menu', async () => {
      const rule3 = RULES[2];
      await rulesBuilderPage.addRuleBelow('Rule2');
      await rulesBuilderPage.nameRule(2, rule3.name);
      await rulesBuilderPage.assertRuleExpandedWithEdit(rule3.name);
      await rulesBuilderPage.buildRule(rule3);
    });

    // 10) Save rules ---------------------------------------------------------
    await test.step('Save the form with all rules', async () => {
      await rulesBuilderPage.saveRules();
    });

    // 11) Verify persistence & ordering --------------------------------------
    await test.step('Verify all rules persist in the correct order', async () => {
      await rulesBuilderPage.assertRulesPersisted(EXPECTED_RULE_ORDER);
    });
  });
});

/**
 * Focused condition-type behavior test: confirms the value field visibility
 * rule (visible for Contains, hidden for Is Not Empty).
 */
test.describe('Condition value-field visibility', () => {
  test(
    'value field appears only for value-based conditions',
    {
      annotation: {
        type: 'description',
        description:
          'Focused UI-behavior check for one rule: the "Value" input on a condition must stay ' +
          'hidden for value-less condition types (e.g. "Is Not Empty") and appear for value-based ' +
          'ones (e.g. "Contains"), without checking the rest of the save/persist flow.',
      },
    },
    async ({ authenticatedHome, homePage, automationPage, formDesignerPage, rulesBuilderPage }) => {
    void authenticatedHome; // login handled by the fixture
    const formName = generateFormName();

    await homePage.goToAutomation();
    await automationPage.assertLoaded();
    await automationPage.createForm(formName);
    await formDesignerPage.assertDesignerOpen();
    await formDesignerPage.addTextboxes(2);
    // addCondition() below looks up option text by TEXTBOXES[*].label
    // ("First Name"/"Last Name") via elementRef, so the textboxes need
    // those labels configured — otherwise the dropdown shows this app's
    // auto-generated default labels instead, and the option is never found.
    await formDesignerPage.configureTextbox(0, TEXTBOXES[0]);
    await formDesignerPage.configureTextbox(1, TEXTBOXES[1]);
    await formDesignerPage.goToRulesTab();
    await rulesBuilderPage.assertLoaded();

    await rulesBuilderPage.addRule();
    await rulesBuilderPage.nameRule(0, 'VisibilityRule');

    // Is Not Empty -> value field hidden (asserted inside addCondition).
    await rulesBuilderPage.addCondition(
      'VisibilityRule',
      { elementRef: 'textbox1', conditionType: ConditionType.IsNotEmpty },
      true,
      LogicalOperator.And
    );

    // Contains -> value field visible (asserted inside addCondition).
    await rulesBuilderPage.addCondition(
      'VisibilityRule',
      { elementRef: 'textbox1', conditionType: ConditionType.Contains, value: 'abc' },
      false,
      LogicalOperator.And
    );
  });
});
