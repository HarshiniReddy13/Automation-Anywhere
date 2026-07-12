import { ConditionType, LogicalOperator, RuleActionType } from './constants';
import { uniqueName } from './helpers';

/**
 * Centralized test data. Tests import from here so no literal values are
 * scattered across specs or page objects.
 */

export interface TextboxConfig {
  /** Stable key used to reference this textbox across rule definitions. */
  readonly ref: string;
  readonly label: string;
  readonly minLength: number;
  readonly maxLength: number;
  readonly hintText: string;
  readonly tooltip: string;
  readonly defaultValue: string;
}

export interface ConditionConfig {
  /** Reference to the textbox this condition evaluates. */
  readonly elementRef: string;
  readonly conditionType: ConditionType;
  /** Only used for value-based conditions (e.g. Contains/Equals). */
  readonly value?: string;
}

export interface ActionConfig {
  readonly type: RuleActionType;
  /** Reference to the textbox the action targets. */
  readonly targetRef: string;
  readonly value: string;
}

export interface RuleConfig {
  readonly name: string;
  readonly conditions: ConditionConfig[];
  readonly logicalOperator: LogicalOperator;
  readonly actions: ActionConfig[];
}

/** Two textboxes dragged onto the canvas and fully configured. */
export const TEXTBOXES: TextboxConfig[] = [
  {
    ref: 'textbox1',
    label: 'First Name',
    minLength: 2,
    maxLength: 30,
    hintText: 'Enter your first name',
    tooltip: 'Your legal first name',
    defaultValue: 'John',
  },
  {
    ref: 'textbox2',
    label: 'Last Name',
    minLength: 2,
    maxLength: 40,
    hintText: 'Enter your last name',
    tooltip: 'Your legal last name',
    defaultValue: 'Doe',
  },
];

/**
 * Rule definitions used by the spec. Rule1 carries the full condition/action
 * workflow; Rule2 and Rule3 verify context-menu creation and ordering.
 */
export const RULES: RuleConfig[] = [
  {
    name: 'Rule1',
    logicalOperator: LogicalOperator.And,
    conditions: [
      { elementRef: 'textbox1', conditionType: ConditionType.IsNotEmpty },
      { elementRef: 'textbox1', conditionType: ConditionType.Contains, value: 'John' },
    ],
    actions: [
      { type: RuleActionType.SetValue, targetRef: 'textbox2', value: 'Auto-filled by Rule1' },
    ],
  },
  {
    name: 'Rule2',
    logicalOperator: LogicalOperator.And,
    conditions: [{ elementRef: 'textbox2', conditionType: ConditionType.IsNotEmpty }],
    actions: [{ type: RuleActionType.SetValue, targetRef: 'textbox1', value: 'Set by Rule2' }],
  },
  {
    name: 'Rule3',
    logicalOperator: LogicalOperator.And,
    conditions: [{ elementRef: 'textbox1', conditionType: ConditionType.IsNotEmpty }],
    actions: [{ type: RuleActionType.SetValue, targetRef: 'textbox2', value: 'Set by Rule3' }],
  },
];

/** Generates a unique, collision-safe form name for each run. */
export function generateFormName(): string {
  return uniqueName('AutoForm');
}

/** Expected rule names in creation/display order — used for verification. */
export const EXPECTED_RULE_ORDER: string[] = RULES.map((r) => r.name);
