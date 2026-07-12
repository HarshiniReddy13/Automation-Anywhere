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

---

## Use Case 2: Learning Instance API Automation (independent module)

A second, **completely independent** automation module in the same repo:
pure API testing (no browser page) against the Document Automation /
IQ Bot "Learning Instance" REST endpoints, using Playwright's
`APIRequestContext`. It shares nothing with Use Case 1's Page Objects,
fixtures, `global-setup.ts`, or `playwright.config.ts` — see
["Isolation from Use Case 1"](#isolation-from-use-case-1) below for exactly
how that's enforced.

> 1. Authenticate and capture an access token (reused across steps until it expires).
> 2. Document every Learning Instance endpoint the flow depends on (method, URL, headers, payload/response shape) via `api/endpoints.ts`.
> 3. Create a Learning Instance with Document Type = Invoice; validate the HTTP response, schema, and captured fields.
> 4. Retrieve the created instance and validate it matches what was requested (ID, name, document type, status, payload fields).
> 5. **UI Verification Layer**: log into the real app's UI (a genuine browser, read-only) and confirm the same Learning Instance is visible in AI → Document Automation → Learning Instances, with the displayed name/status/document type matching the API response — then clean up via the same API-based delete as before.

Every endpoint was confirmed by driving the real application and capturing
live network traffic — not guessed from REST convention. One deliberate,
documented deviation from the original spec's assumption: **`POST
/cognitive/v3/learninginstances` returns `200 OK` on success, not `201
Created`** — confirmed via both browser capture and a direct minimal-payload
API call. `ResponseValidator`/the test assert the real, observed value
(`api-automation/api/LearningInstanceApi.ts` and
`api-automation/tests/learningInstance.spec.ts` both have inline comments on
this).

### Folder structure

Everything for this use case lives under one dedicated top-level folder,
`api-automation/` — nothing is interleaved with Use Case 1's `pages/`,
`fixtures/`, `config/`, or `utils/`, not even by directory name:

```
playwright-framework/
├── api-automation/               # Use Case 2 — everything lives in here, nowhere else
│   ├── api/
│   │   ├── ApiClient.ts             # APIRequestContext wrapper: logging, retry, HttpError
│   │   ├── AuthenticationApi.ts     # Step 1 — authenticate, decode/cache token expiry
│   │   ├── LearningInstanceApi.ts   # Steps 3 & 4 — create/get/list/delete Learning Instances
│   │   ├── endpoints.ts             # Documented endpoint catalog (method/path/headers/payload)
│   │   └── types.ts                 # Shared request/response types
│   ├── context/
│   │   ├── ExecutionContext.ts      # In-memory run state (auth, instance) — Step 1-4 shared state
│   │   └── CheckpointManager.ts     # Persists ExecutionContext to disk for resume-on-rerun
│   ├── validators/
│   │   ├── ResponseValidator.ts     # HTTP-level assertions (status, timing, headers, content-type)
│   │   └── SchemaValidator.ts       # Schema/field-type/functional assertions
│   ├── utils/
│   │   ├── RetryHelper.ts           # Exponential backoff retry + condition polling (no hardcoded waits)
│   │   ├── ApiLogger.ts             # PASS/FAIL/WARNING/INFO logs with secret redaction
│   │   └── ConfigManager.ts         # Independent .env reader for this module
│   ├── pages/                       # UI Verification Layer (Step 5) — read-only browser checks
│   │   ├── LoginPage.ts             # UI login (independent of Use Case 1's pages/LoginPage.ts)
│   │   ├── DashboardPage.ts         # Post-login landing; navigates AI -> Document Automation
│   │   └── LearningInstancesPage.ts # The Learning Instances table: search, locate row, assert, screenshot, diagnose
│   └── tests/
│       └── learningInstance.spec.ts # The 5-step test.step() workflow
├── .checkpoints/                 # Gitignored — checkpoint JSON written/cleared at runtime
└── playwright.api.config.ts      # Independent Playwright config for this module (repo root, like playwright.config.ts)
```

**Why `api-automation/pages/` and not a top-level `pages/`**: the top-level
`pages/` folder already belongs to Use Case 1. Adding Use Case 2's page
objects there — even under different filenames — would recreate the exact
"which use case does this file belong to" ambiguity this README's
["Isolation from Use Case 1"](#isolation-from-use-case-1) section exists to
prevent. Keeping them nested under `api-automation/` means the whole
directory tree stays unambiguous at a glance, consistent with everything
else in this use case.

### UI Verification Layer (Step 5)

After the Learning Instance is created and validated via API, the test logs
into the real application with a genuine browser and confirms the *same*
instance is visible and correctly displayed — proving the backend write
actually reached the frontend, not just the database:

1. **Login (UI)** — `LoginPage` drives the real login form.
2. **Navigate** — `DashboardPage.goToLearningInstances()` clicks **AI →
   Document Automation** (confirmed via live navigation: there is no
   separate "Learning Instances" nav item — "Document Automation" opens
   directly to that list).
3. **Search** — `LearningInstancesPage.searchByName()` uses the page's own
   Name search box. Confirmed via live testing: the search box does **not**
   filter on `fill()` alone — it only re-queries on **Enter** — so this is
   modeled as fill-then-press-Enter, not a cosmetic keystroke.
4. **Locate + assert** — the row is found by its `data-row-id` (the
   instance ID), then its displayed **name**, **status**, and **document
   type** are asserted against the API response already stored in the
   `ExecutionContext` (`context.getLearningInstance()`) — no duplicate API
   calls are made to re-fetch this data. Status comparison is
   case-insensitive (UI shows "Private", the API returns "PRIVATE" — a
   display convention, confirmed via live comparison, not a real
   mismatch). The Community Edition table has no Created Date / Owner /
   Version columns (confirmed via live DOM capture), so those optional
   extras from the original spec are not asserted — there's nothing to
   check.
5. **Cleanup** — unchanged: the existing API-based `afterAll` deletes the
   instance. See the important caveat below.

**Creation stays 100% API-driven.** `LearningInstancesPage` has no
create/edit methods on purpose — the UI is only ever read from.

**Session-collision caveat (found via live testing, not assumed):** this
account's JWT carries `multipleLoginAllowed: false`. Logging into the UI
silently invalidates whatever API token Step 1 obtained earlier in the same
run — its next use returns `401
IQUM001.user.auth.token.validation.failed`. Rather than touch the existing
(unmodified) cleanup logic, the UI-verification step re-authenticates via
the API as its last action — inside a `finally`, so it runs even if UI
verification itself fails — and calls `context.setAuth()` with the fresh
token. Cleanup reads `context.getAuth()` exactly as before and simply gets
a valid token again.

**Screenshots** (`list`, `matching-row`, `success`, or `failure`/
`data-mismatch` on the two respective failure paths) are attached via
Playwright's own `testInfo.attach()`, which embeds them directly into
`playwright-report-api/` — no dependency on Use Case 1's custom
`StepRecorder`/HTML reporter.

**On failure**, `LearningInstancesPage.diagnose()` captures the current
URL, every other row currently in the table, and recent browser console
output, then produces one of three explanations: the table is empty
(likely a UI load/sync issue, not backend, since the API step already
proved the record exists server-side), other rows are visible but not this
one (likely a sync delay), or the row exists but a field didn't match
(a real data mismatch) — verified live by pointing the search at a
deliberately non-existent instance and confirming the diagnosis fired
correctly.

### Running the suite

```bash
npm run test:api          # runs api-automation/tests/ only, using playwright.api.config.ts
npm run report:api        # open this module's own HTML report (playwright-report-api/)
```

The UI Verification Layer means this suite now launches a real browser too
— `HEADLESS` in `.env` controls it exactly like it does for Use Case 1
(`HEADLESS=false` to watch it log in and click through AI → Document
Automation live).

`npm test` / `npm run test:rules` (Use Case 1) will **never** pick this up —
`playwright.config.ts`'s `testDir: './tests'` never scans `api-automation/`
at all. Conversely, `npm run test:api` (`playwright.api.config.ts`,
`testDir: './api-automation/tests'`) only ever looks inside
`api-automation/`.

### `.env` reference

Reuses the same `.env` file as Use Case 1 (as **data only** —
`api-automation/utils/ConfigManager.ts` reads it independently of
`config/environment.ts`, no shared code):

| Variable | Purpose | Default |
|---|---|---|
| `BASE_URL` | API base URL | `community.cloud.automationanywhere.digital` |
| `AA_USERNAME` | Login username/email | — (required) |
| `AA_PASSWORD` | Login password | — (required) |
| `API_REQUEST_TIMEOUT_MS` | Per-request timeout | `30000` |
| `API_MAX_RETRY_ATTEMPTS` | Max retries for transient failures (5xx/408/425/429/network) | `3` |
| `API_RETRY_BASE_DELAY_MS` | Base delay for exponential backoff | `500` |
| `API_RETRY_MAX_DELAY_MS` | Backoff cap | `8000` |
| `API_MAX_RESPONSE_TIME_MS` | Response-time assertion threshold | `10000` |
| `API_TOKEN_EXPIRY_BUFFER_SECONDS` | How early to treat a token as "expiring soon" and re-auth | `60` |
| `HEADLESS` | Whether the UI Verification Layer's browser runs headless (same var Use Case 1 uses, read independently) | `true` |

All have working defaults in `ConfigManager.ts` — only `AA_USERNAME`/`AA_PASSWORD`/`BASE_URL` need to be set for a fresh environment.

### Checkpoint / resume behavior

Each successful step writes a checkpoint (`AUTHENTICATION` →
`LEARNING_INSTANCE_CREATED` → `VALIDATION_COMPLETED`) to
`.checkpoints/learningInstance.checkpoint.json`, including everything
downstream steps need (token + expiry, instance ID/name/status/payload).

- **On failure**, `afterAll` deliberately does **not** delete the created
  instance or clear the checkpoint — it logs that it's preserving state for
  the next run.
- **On rerun**, `beforeAll` loads the checkpoint and each `test.step()`
  checks `checkpointManager.hasCheckpoint(...)` before doing work: a still-valid
  token skips re-authentication, an already-created instance is reused
  instead of creating a duplicate. This was verified end-to-end: a run
  forced to fail right after instance creation left the instance and
  checkpoint in place, and the very next (normal) run picked up exactly
  where it left off, validated the reused instance, and only then cleaned up.
- **On a fully successful run**, `afterAll` deletes the test instance and
  clears the checkpoint file — every clean run starts from a blank slate.

### Isolation from Use Case 1

- **One dedicated folder**: every file this use case needs — API clients,
  context/checkpoint, validators, retry/logging/config utils, and the test
  itself — lives under `api-automation/`. Use Case 1's code
  (`pages/`, `fixtures/`, `config/`, `utils/`) lives entirely outside it.
  There is no shared or same-named directory between the two use cases.
- Separate Playwright config (`playwright.api.config.ts`): no `globalSetup`
  and no `storageState` — Learning Instance creation/validation uses the
  built-in `request` fixture (`APIRequestContext`); the UI Verification
  Layer (Step 5) uses the built-in `page` fixture directly inside the test,
  logging in itself rather than inheriting Use Case 1's shared session.
- `playwright.config.ts` (UI) has `testDir: './tests'`, which structurally
  cannot see `api-automation/` — no `testIgnore` workaround needed.
- No imports from `pages/`, `fixtures/baseFixture.ts`, or any Use Case 1 spec
  — everything under `api-automation/` is new, self-contained code.
- Own reporters (`playwright-report-api/`, `test-results/api-junit.xml`),
  own `outputDir` (`test-results-api/`) — no shared report artifacts with
  Use Case 1's `reports/` custom HTML reporter.
