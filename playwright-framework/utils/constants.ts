/**
 * Application-wide constants: routes, API endpoint patterns, timeouts and enums.
 *
 * NOTE ON SELECTORS
 * -----------------
 * Concrete element selectors live inside their respective Page Objects (see
 * `pages/*.ts`), grouped in a private `locators` map. This file holds only the
 * stable, cross-cutting constants that multiple Page Objects share.
 */

/** Relative application routes (appended to environment.baseUrl). */
export const ROUTES = {
  LOGIN: '/#/login',
  EXPLORE: '/#/home',
  HOME: '/#/dashboard',
  DASHBOARD: '/#/dashboard',
  // Automation landing in Community Edition resolves to the bots repository.
  AUTOMATION: '/#/bots/repository',
} as const;

/**
 * CSS selector for the iframe that hosts the Form Designer / Rules Builder.
 * The page contains multiple iframes (e.g. the Resource Center help widget), so
 * we target the editor's module frame specifically by its stable class.
 * The designer's src looks like `/modules/attended/#/file/form/<id>/edit`.
 */
export const DESIGNER_FRAME = 'iframe.modulepage-frame';

/**
 * Backend endpoint fragments used for network interception via
 * `page.waitForResponse`. Keep these loose (substring/regex-friendly) so they
 * survive minor API versioning changes.
 */
export const API = {
  /**
   * Matches the form/rules persistence endpoint. Forms (and their rules,
   * which are stored as part of the same file's content) are saved as a
   * generic repository file resource — `PUT /v{n}/repository/files/{id}` —
   * not a URL containing "form"/"rules". Excludes the `/content` and
   * `/dependencies` sub-resource PUTs that fire alongside it, so this matches
   * only the base file-metadata response (which carries the file `id`).
   */
  FORM_SAVE: /\/v\d+\/repository\/files\/\d+(\?|$)/i,
  /** Alias of FORM_SAVE: rules persist through the same file-save endpoint. */
  RULES_SAVE: /\/v\d+\/repository\/files\/\d+(\?|$)/i,
  /**
   * Auth/login token endpoint. Anchored at the end so it matches only the
   * real credential-exchange call `/v{n}/authentication` and not sibling
   * calls that share the prefix, e.g. `/v1/authentication/type` (auth-type
   * probe) or `/v1/authentication/publicKeyExchange` (fires before the real
   * login POST). Matching those by mistake means the code checks the wrong
   * response's status and misses a genuine login failure/rejection.
   */
  LOGIN: /\/v\d+\/authentication$/i,
} as const;

/** Semantic timeouts (ms) for use where auto-waiting needs an explicit bound. */
export const TIMEOUTS = {
  SHORT: 5_000,
  MEDIUM: 15_000,
  LONG: 30_000,
  NETWORK: 45_000,
} as const;

/** Condition types available in the Rules Builder. */
export enum ConditionType {
  IsNotEmpty = 'Is Not Empty',
  IsEmpty = 'Is Empty',
  Contains = 'Contains',
  Equals = 'Equals',
  StartsWith = 'Starts With',
}

/** Logical operator joining multiple conditions in a rule. */
export enum LogicalOperator {
  And = 'AND',
  Or = 'OR',
}

/** Supported rule action types. */
export enum RuleActionType {
  SetValue = 'Set Value',
  Show = 'Show',
  Hide = 'Hide',
  Enable = 'Enable',
  Disable = 'Disable',
}

/** Form component palette items that can be dragged onto the canvas. */
export enum ComponentType {
  // Palette labels exactly as they appear in the designer's Elements list.
  Textbox = 'Text Box',
  TextArea = 'Text Area',
  Checkbox = 'Checkbox',
  Dropdown = 'Dropdown',
}

/** HTTP status codes considered a successful persistence response. */
export const SUCCESS_STATUS = [200, 201] as const;
