# Automation Anywhere — Form & Rules Builder E2E Framework

A Playwright + TypeScript, Page-Object-Model automation framework that
end-to-end tests the **Form Designer and Rules Builder** in Automation
Anywhere Community Edition, plus a custom, self-contained HTML reporting
system built on top of Playwright's own reporter API.

---

## Use case automated

**Use Case 1: Form with Rules Builder (UI Automation)**

> 1. Log in to the Community Edition application.
> 2. Navigate to Automation and create a new Form.
> 3. Drag and drop at least two Textbox elements onto the canvas.
> 4. Set properties for each textbox (label, min/max length, hint text, tooltip, default value).
> 5. Save the form, then navigate to the Rules tab.
> 6. Create a new rule (e.g., Rule1) and verify it appears in expanded mode in the rules list.
> 7. Add a condition to the rule using one of the textbox elements with a condition type (e.g., Is Not Empty, Contains).
> 8. Add a second condition with AND mode.
> 9. Add an action to the rule (e.g., Set Value on the other textbox element).
> 10. Use the rule card context menu to add a second rule below (Rule2) and a third rule (Rule3).
> 11. Save the form and verify all rules persist.

Implemented in [`tests/rulesBuilder.spec.ts`](tests/rulesBuilder.spec.ts) (main test: *"creates a form, configures textboxes, builds three rules, and persists them"*), with every step's UI logic and assertions living in the Page Objects under [`pages/`](pages/), per the expectations below.

### Expectations → where they're enforced

| Expectation | Enforced in |
|---|---|
| Add Rule button is visible and functional | `RulesBuilderPage.assertLoaded()`, `.addRule()` |
| Rules are listed and displayed in expanded mode | `RulesBuilderPage.assertRuleExpandedWithEdit()` |
| Edit button is present on each rule card | `RulesBuilderPage.assertRuleExpandedWithEdit()` |
| Conditions are correctly configured (element, condition type, value input visibility) | `RulesBuilderPage.addCondition()`, `.assertConditionSaved()` |
| AND/OR condition mode selection works | `RulesBuilderPage.addCondition()`, `.assertOperatorSelected()` |
| Actions (Set Value) are properly assigned to target elements | `RulesBuilderPage.addAction()`, `.assertActionSaved()` |
| Context menu option "Add Rule Below" functions correctly | `RulesBuilderPage.addRuleBelow()` |
| All rules (Rule1, Rule2, Rule3) are visible in the rules list after creation | `RulesBuilderPage.assertRulesPersisted()` |

A second, narrower spec — *"value field appears only for value-based conditions"* — isolates just the condition value-field visibility rule (hidden for "Is Not Empty", visible for "Contains") without exercising the full save/persist flow.

---

## Framework and tools used

| Tool | Purpose |
|---|---|
| **[Playwright Test](https://playwright.dev/)** (`@playwright/test` ^1.48) | Browser automation + test runner |
| **TypeScript** (strict mode) | Type-safe pages, fixtures, config, test data |
| **Node.js** | Runtime |
| **dotenv** | `.env`-based configuration |
| **Page Object Model** | One class per screen; specs only sequence steps |
| **Custom Playwright `Reporter`** (in-house, [`reporting/`](reporting/)) | Generates a single self-contained HTML report per run |

No UI framework, no external test-data or reporting services — everything ships inside this repo.

---

## Project structure

```
playwright-framework/
├── config/
│   └── environment.ts          # Typed, env-driven configuration
├── fixtures/
│   └── baseFixture.ts          # Page Object fixtures + automatic report/log capture
├── global-setup.ts             # Logs in once for the whole run, saves session to .auth/
├── pages/
│   ├── BasePage.ts             # Shared behavior + *WithReport() wrapper methods
│   ├── LoginPage.ts
│   ├── HomePage.ts
│   ├── AutomationPage.ts
│   ├── FormDesignerPage.ts
│   └── RulesBuilderPage.ts
├── reporting/                  # Custom self-contained HTML reporting system
│   ├── types.ts
│   ├── StepRecorder.ts         # Per-test step/log/screenshot recorder
│   ├── CustomHtmlReporter.ts   # Playwright Reporter implementation
│   └── htmlTemplate.ts         # Report HTML/CSS/JS generator
├── tests/
│   ├── rulesBuilder.spec.ts    # Use Case 1 E2E workflow
│   └── reportingDemo.spec.ts   # Sample test demonstrating the report wrappers
├── utils/
│   ├── constants.ts            # Routes, API patterns, enums, timeouts
│   ├── helpers.ts              # Reusable, page-agnostic helpers (drag-drop, reliable fill, ...)
│   └── testData.ts             # Centralized test data + unique form-name generator
├── reports/                    # Generated HTML reports (gitignored, one file per run)
├── playwright.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Setup and execution instructions

### Prerequisites
- Node.js 18+
- A valid Automation Anywhere Community Edition account (the suite logs in with real credentials against a live instance — there is no mock/sandbox mode)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Install browsers
npm run install:browsers

# 3. Configure credentials and environment
cp .env.example .env
#   then edit .env → at minimum set AA_USERNAME and AA_PASSWORD
```

### Running the suite

```bash
npm run test:rules                              # Use Case 1 suite, Chromium (recommended)
npm run test:rules -- --project=chromium         # same, explicit
npm run test:rules -- --project=chromium --headed  # watch it run in a real browser window
npx playwright test tests/reportingDemo.spec.ts   # sample test for the custom reporter
npm test                                          # full tests/ directory, all 3 browser projects
npm run test:ui                                   # Playwright UI mode (interactive)
npm run report                                    # open Playwright's own last HTML report
```

**Always target `--project=chromium` for `rulesBuilder.spec.ts`.** Every selector, timing budget, and app-specific workaround in this suite was discovered and verified by driving the real application in Chromium; Firefox and WebKit projects are configured (`playwright.config.ts`) for future coverage but have not been run against this app's live UI, so treat them as unverified.

### Viewing results

- **Custom report**: open the newest file in `reports/` (e.g. `reports/TestExecution_2026-07-12_10-15-00.html`) directly in any browser — it's fully self-contained (embedded video, screenshots, API log, console/page-error log, execution timeline; dashboard summary with pass/fail counts; dark/light toggle; search/filter). A new file is written every run and previous ones are never overwritten.
- **Playwright's own HTML report**: `npm run report`.
- **JUnit XML** (for CI dashboards): `test-results/junit.xml`.

---

## Environment / configuration notes

### Session architecture (read this before debugging a login failure)

The target backend enforces **one session per account** (its auth token carries `multipleLogin: false`) and is sensitive to rapid/concurrent logins. To work with this rather than against it:

- [`global-setup.ts`](global-setup.ts) logs in **once** per `npx playwright test` invocation and saves the authenticated session to `.auth/storageState.json` (gitignored — it's a live token, not a secret to commit). Every test then starts already authenticated; no test performs its own UI login.
- `playwright.config.ts` forces `workers: 1` / `fullyParallel: false` **unconditionally** (not just on CI) — this is a single shared account building a single live form, so nothing here can safely run in parallel.
- `retries: 1` locally / `2` on CI — safe because a retry reuses the existing session rather than triggering a fresh login.

### `.env` reference

| Variable | Purpose | Default |
|---|---|---|
| `TEST_ENV` | `dev` \| `staging` \| `prod` (selects a URL block in `config/environment.ts`) | `dev` |
| `BASE_URL` | Application base URL | `community.cloud.automationanywhere.digital` |
| `AA_USERNAME` | Login username/email | — (required) |
| `AA_PASSWORD` | Login password | — (required) |
| `HEADLESS` | Run browsers headless | `true` |
| `DEFAULT_TIMEOUT` | Reserved/exposed on `environment` for general use; not currently wired to anything (the global per-test timeout is a fixed 5 minutes in `playwright.config.ts`, chosen independently — see its inline comment) | `30000` |
| `ACTION_TIMEOUT` | Timeout for individual Playwright actions | `15000` |
| `NAVIGATION_TIMEOUT` | Timeout for page navigations | `45000` |
| `EXPECT_TIMEOUT` | Default timeout for `expect()` assertions | `10000` |

The committed defaults above are Playwright's own; this project's own `.env`/`.env.example` set `ACTION_TIMEOUT`, `NAVIGATION_TIMEOUT`, and `EXPECT_TIMEOUT` more generously (`30000`/`60000`/`20000`) because the live backend has measured 5-8s+ post-login bootstrap time and other genuinely variable delays — tight timeouts there produce false failures, not faster feedback. Some individual assertions (e.g. Form Designer load) override even these with an explicit, larger timeout in code where real testing showed it necessary.

**⚠️ Never set `CI` in `.env`.** Environment variables are always strings, so even `CI=false` is a non-empty (truthy) string — `playwright.config.ts` treats any set value as "running in CI" and silently changes retry/worker behavior. Leave it unset locally; real CI systems set it to `"true"` automatically.

**Do not add Playwright `slowMo`.** It was tried for human-watchable demo runs and measurably increased failure rate — this app's timing is tight enough in the *best* case that a blanket per-action delay pushes already-calibrated wait budgets (e.g. the ~45s Form Designer load wait) past their limit. If you need a slow-motion walkthrough, watch a `--headed` run directly rather than adding a delay.

### Known application behaviors worth knowing before touching selectors

The target app uses a custom "Rio" design-system component library with real accessibility gaps (missing ARIA roles, labels not programmatically associated with inputs) and several non-obvious UI behaviors (progressive-disclosure dropdowns, auto-collapsing rule cards, a value field that can silently discard input during a component remount). Every one of these was found by driving the live app and inspecting captured DOM output, not guessed — see the "confirmed via a live capture" comments throughout [`pages/RulesBuilderPage.ts`](pages/RulesBuilderPage.ts) and [`pages/FormDesignerPage.ts`](pages/FormDesignerPage.ts) for the specifics and reasoning behind each locator choice.

**Verified-stable timing baseline** (Chromium, headless or headed, no `slowMo`): the main E2E test runs in ~25-35s, the value-field-visibility test in ~20-27s. If a change pushes either test meaningfully past that range, suspect the change first before assuming it's just "the app being slow."

---

## Adapting selectors to your tenant

The Page Objects use **resilient, semantic-first locators** with fallbacks
(`getByRole(...).or(...)`), because the exact DOM of a low-code designer can
vary by tenant/release. If a locator needs tuning for your environment:

1. Open the relevant Page Object under `pages/`.
2. Locators are declared at the top of each class (or in small private
   accessor methods) — update them in one place.
3. Prefer adding a stable `data-testid` in the app and switching to
   `getByTestId(...)` (the config already sets `testIdAttribute: 'data-testid'`).

No selectors are hard-coded inside tests, so tuning never touches the spec.

---

## Custom HTML reporting system

Every run produces one self-contained `reports/TestExecution_<timestamp>.html`
— no external CSS/JS/image files, safe to email or archive as-is.

- **Automatic, no per-test code required**: the `recorder` fixture in
  [`fixtures/baseFixture.ts`](fixtures/baseFixture.ts) captures console logs,
  page errors, network failures, dialogs, and every XHR/fetch call (method,
  URL, status, timing, request/response body) for *every* test, with zero
  opt-in.
- **Step-level detail (before/after screenshots, timing, status) is opt-in**
  via `*WithReport()` wrapper methods on `BasePage` (`clickWithReport`,
  `fillWithReport`, `selectWithReport`, `checkWithReport`, `uncheckWithReport`,
  `hoverWithReport`, `dblClickWithReport`, `rightClickWithReport`,
  `dragAndDropWithReport`, `uploadFileWithReport`, `navigateWithReport`,
  `pressKeyWithReport`, `assertWithReport`). See
  [`tests/reportingDemo.spec.ts`](tests/reportingDemo.spec.ts) for a working
  example. The main `rulesBuilder.spec.ts` suite doesn't use these yet — its
  page objects still call raw Playwright APIs directly, by deliberate choice,
  to avoid destabilizing an already-hard-won-stable suite. Migrating a page
  object is mechanical: swap `.click()` for
  `this.clickWithReport(locator, 'human description')`, etc.
- **Human-readable test titles/descriptions**: declare them with Playwright's
  own annotation API —
  ```ts
  test('test name', {
    annotation: { type: 'description', description: 'Plain-English summary shown in the report.' },
  }, async ({ ... }) => { ... });
  ```
- **Video**: every test is recorded (`use.video: 'on'`) and embedded as base64
  with native HTML5 controls.
- Dashboard (pass/fail counts, duration, browser/OS/env), execution timeline,
  collapsible per-test detail, a full-screen screenshot viewer (zoom/pan/Esc),
  and a dark/light toggle are all built in — see any generated file in
  `reports/` for a live example.

---

## Design notes

- **SOLID / SRP** — `BasePage` holds cross-page behavior; each page owns only
  its screen. Helpers are pure and reusable.
- **Business logic in Page Objects** — specs sequence steps and read from
  `utils/testData.ts`; the vast majority of assertions live in the Page
  Objects, with only a couple of simple result checks (e.g. "a Form ID was
  returned") left inline in the spec for readability. No selectors live in
  test files at all.
- **Deterministic data** — `generateFormName()` produces a unique, timestamped
  name per run so repeat runs never collide.
- **API-first verification** — persistence is confirmed against the backend
  response (status + payload), then the UI toast, not UI state alone.
