# Architecture

Technical deep-dive behind the two use cases in this repository. The [README](README.md) covers how to run things; this document covers how they're built and why.

---

## 1. Repository layout

```
form-automation/         # Use Case 1 — UI automation (fully self-contained)
├── config/environment.ts    # Typed .env reader
├── global-setup.ts          # One-time login for the whole run
├── pages/                   # Page Object Model
├── fixtures/baseFixture.ts  # Injects page objects + StepRecorder into tests
├── utils/                   # Constants, helpers, test data
└── tests/rulesBuilder.spec.ts

api-automation/          # Use Case 2 — API automation (fully self-contained)
├── api/                     # ApiClient, AuthenticationApi, LearningInstanceApi
├── context/                 # ExecutionContext + CheckpointManager
├── validators/              # ResponseValidator, SchemaValidator
├── utils/                   # RetryHelper, ApiLogger, ConfigManager
├── pages/                   # UI Verification Layer (read-only browser checks)
└── tests/learningInstance.spec.ts

reporting/                # Shared reporting infrastructure only
├── types.ts
├── StepRecorder.ts          # Per-test data recorder
├── CustomHtmlReporter.ts    # Playwright Reporter, merges both use cases
└── htmlTemplate.ts          # HTML/CSS/JS generator

playwright.config.ts       # Use Case 1's config
playwright.api.config.ts   # Use Case 2's config
```

**Isolation rule:** `form-automation/` and `api-automation/` never import from each other. Each owns its full stack — page objects, config, utilities, tests. The only shared code is `reporting/`, which is infrastructure (how results are displayed), not business logic. This was a deliberate restructuring so a reviewer can look at either folder in isolation and see the complete picture for that use case.

---

## 2. Use Case 1 — Form with Rules Builder (UI)

**Pattern:** Page Object Model. Specs (`tests/rulesBuilder.spec.ts`) only sequence steps; all selectors and assertions live in `pages/`.

**Shared session, not per-test login.** The target app enforces one session per account (its JWT carries `multipleLogin: false`) and is sensitive to rapid logins. `global-setup.ts` logs in once before the run starts and saves the session to `.auth/storageState.json`; every test starts already authenticated. This is why `playwright.config.ts` forces `workers: 1` / `fullyParallel: false` unconditionally — a shared session can't safely be used by two workers at once. A single retry is safe because it reuses the saved session instead of triggering a fresh login.

**Resilient selectors.** The app's "Rio" component library has real accessibility gaps (missing ARIA roles/labels) and non-obvious behaviors (progressive-disclosure dropdowns, auto-collapsing rule cards, a value field that can silently discard input during a component remount). Every workaround in `RulesBuilderPage.ts` / `FormDesignerPage.ts` was found by driving the live app, not guessed — locators favor semantic queries with fallbacks (`getByRole(...).or(...)`) over brittle CSS.

**Timing.** Timeouts are set generously (see `.env` values) because the live backend has measured 5-8s+ post-login bootstrap and other real variability — this is a tuning decision based on observed behavior, not arbitrary padding.

---

## 3. Use Case 2 — Learning Instance API Flow

**`ApiClient`** wraps Playwright's `APIRequestContext`. Every call automatically logs request/response detail (redacted — see §5), retries transient failures, measures response time, and normalizes the result so tests never touch Playwright's raw response object.

**Retry logic (`RetryHelper`)** only retries failures classified as transient: no status code (network-level failure) or one of `408/425/429/500/502/503/504`. A 400 validation error fails immediately — retrying a request that's wrong won't make it right. Backoff is exponential with jitter, capped at `API_RETRY_MAX_DELAY_MS`.

**No fixed sleeps.** `RetryHelper.pollUntil()` polls a condition until it's true or a timeout elapses, for any wait on eventual backend state.

**Checkpoint / resume (`CheckpointManager`).** Each successful step (`AUTHENTICATION` → `LEARNING_INSTANCE_CREATED` → `VALIDATION_COMPLETED`) is written to `.checkpoints/learningInstance.checkpoint.json` along with the data downstream steps need (token+expiry, instance id/name/status). On failure, cleanup deliberately does *not* delete the instance or clear the checkpoint. On the next run, each step checks `hasCheckpoint(...)` first — a valid token skips re-auth, an existing instance is reused instead of duplicated. On a fully successful run, the instance is deleted and the checkpoint cleared, so every clean run starts fresh.

**UI Verification Layer (Step 5, extension beyond the base assignment).** After the instance is created and validated via API, the test logs into the real UI with a genuine browser and confirms the same instance is visible with matching name/status/document type — proving the write reached the frontend, not just the database. `api-automation/pages/` is read-only by design (no create/edit methods); creation stays 100% API-driven.

**Session-collision caveat.** The same `multipleLogin: false` constraint from Use Case 1 applies here too, but differently: logging into the UI in Step 5 silently invalidates the API token obtained in Step 1 — its next use returns `401 IQUM001.user.auth.token.validation.failed`. Rather than touch the existing cleanup logic, the UI-verification step re-authenticates via the API right after its assertions pass (with a `finally`-block fallback for failure paths), so cleanup always has a valid token regardless of where the test fails.

**Endpoint behavior deviation.** `POST /cognitive/v3/learninginstances` returns `200 OK` on success, not `201 Created` as might be assumed from REST convention — confirmed via live browser network capture and a direct API call. Validators assert the real observed value.

---

## 4. Reporting system

Both use cases run as **two entirely separate `npx playwright test` invocations**, under two independent configs — there is no single process that sees both suites at once. Getting one combined report out of that required a persist-and-merge design:

1. During a test, `StepRecorder` accumulates a `ReportMeta` JSON blob (steps, API calls, named screenshots) in memory and attaches it — plus raw screenshot PNGs — to Playwright's `testInfo`. Attachments are the only channel that reliably survives from a test worker process back to the reporter.
2. `CustomHtmlReporter.onTestEnd()` reads those attachments back, resolves screenshots/video to base64, and tags each test with its use case by mapping the spec file name (`rulesBuilder.spec.ts` → UC1, `learningInstance.spec.ts` → UC2).
3. `onEnd()` writes this run's tests to `reports/.data/<UC1|UC2>.json`, then reads whatever snapshot exists for the *other* use case and merges it in before generating the final HTML.

This means either suite can be (re)run independently, in any order, and the report always reflects the latest known state of both. A use case that hasn't run yet renders as a "not run" placeholder rather than an error; a failure in one use case's tests can't affect the other's already-persisted section.

**Named screenshots vs. step screenshots.** `StepRecorder.runStep()` captures a before/after pair for every wrapped action (available for deeper debugging but not rendered as its own report section). `captureNamedScreenshot(label)` is separate — an explicit, curated milestone screenshot (e.g. "Login Successful", "Rules Saved Successfully") that feeds the report's "Key Screenshots" gallery. The gallery is deliberately built from these curated calls, not every action, to stay evaluator-readable.

**Report content** (final, trimmed form): dashboard stats (date/time, pass/fail/skip counts, pass %), then per-use-case sections with Screen Recording → Key Screenshots → API Validation Summary (UC2 only, one expandable row per operation showing assertions/request/response) → failure detail if applicable. Earlier iterations included execution timelines, per-test log dumps, and a requirement-coverage table; these were deliberately removed to keep the report focused on what an evaluator needs, not what's technically capturable.

---

## 5. Security: redaction

`ApiLogger.redactBody()` masks `password`/`token`/etc. fields before a request or response body is logged to the console **or** stored via `StepRecorder.logApiCall()`. This exists because of a real bug caught during development: the Authenticate call's request body (containing the plaintext password) was briefly stored unredacted and appeared in the HTML report's expandable API Validation Summary row. Fixed by applying the same redaction function at the point data enters the report, not just at the console-logging point — verified by grepping generated report HTML for the real credential string.

---

## 6. Known non-obvious bugs fixed along the way

- **`titlePath` index-shift**: `playwright.api.config.ts` has an unnamed default project (`project.name === ''`). `titlePath().filter(Boolean)` silently drops that empty segment, shifting every subsequent index and causing Use Case 2's tests to be tagged `UNASSIGNED` instead of `UC2`. Fixed by deriving the file name from `test.location.file` and the suite title from `test.parent.title` instead of parsing `titlePath` by index.
- **Browser field rendering blank**: `project?.use?.browserName ?? project?.name ?? 'unknown'` used `??`, which doesn't fall through on a falsy-but-non-nullish empty string (the unnamed default project's `.name`). Switched to `||`.
