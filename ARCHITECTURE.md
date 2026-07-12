# Architecture

Technical notes on how the two use cases are built. See [README.md](README.md) for how to run them.

---

## Repository Layout

```
form-automation/          # Use Case 1 — UI automation
├── config/                  # Typed .env reader
├── global-setup.ts          # One-time login for the whole run
├── pages/                   # Page Object Model
├── fixtures/                # Injects page objects + recorder into tests
├── utils/                   # Constants, helpers, test data
└── tests/

api-automation/            # Use Case 2 — API automation
├── api/                      # ApiClient, AuthenticationApi, LearningInstanceApi
├── context/                  # ExecutionContext + CheckpointManager
├── validators/               # Response & schema validators
├── utils/                    # RetryHelper, ApiLogger, ConfigManager
├── pages/                    # UI Verification Layer (read-only)
└── tests/

reporting/                 # Shared reporting infrastructure only
├── StepRecorder.ts           # Per-test data recorder
├── CustomHtmlReporter.ts     # Merges both use cases into one report
└── htmlTemplate.ts           # HTML/CSS/JS generator
```

**Isolation rule:** `form-automation/` and `api-automation/` never import from each other. Each owns its full stack. Only `reporting/` is shared, and it's infrastructure, not business logic.

---

## Use Case 1 — Form with Rules Builder

**Pattern:** Page Object Model — specs sequence steps, page objects own selectors and assertions.

**Shared session, not per-test login**
- The app allows only one active session per account and is sensitive to rapid logins.
- `global-setup.ts` logs in once per run and saves the session to `.auth/storageState.json`.
- Every test starts already authenticated.
- Because of this, `playwright.config.ts` forces `workers: 1` and `fullyParallel: false`.

**Resilient selectors**
- The app's "Rio" components have accessibility gaps and quirky behaviors (progressive-disclosure dropdowns, auto-collapsing rule cards).
- All workarounds were found by driving the live app, not guessed.
- Locators prefer semantic queries with fallbacks over brittle CSS.

**Timing**
- Timeouts are set generously based on measured backend behavior (5–8s+ post-login bootstrap), not arbitrary padding.

---

## Use Case 2 — Learning Instance API Flow

**`ApiClient`**
Thin wrapper around Playwright's `APIRequestContext`. Every call logs, retries, times, and normalizes the response automatically.

**Retry logic (`RetryHelper`)**
- Retries only transient failures: network errors or `408 / 425 / 429 / 500 / 502 / 503 / 504`.
- Non-transient errors (e.g. `400`) fail immediately — no point retrying a bad request.
- Exponential backoff with jitter, capped by `API_RETRY_MAX_DELAY_MS`.
- No fixed sleeps anywhere — `pollUntil()` polls a condition until true or timeout.

**Checkpoint / resume (`CheckpointManager`)**

| Step | Checkpoint |
|---|---|
| Authenticate | `AUTHENTICATION` |
| Create instance | `LEARNING_INSTANCE_CREATED` |
| Validate instance | `VALIDATION_COMPLETED` |

- On failure, the created instance and checkpoint are **kept**, not cleaned up.
- On rerun, completed steps are skipped and their data reused.
- On a fully successful run, the instance is deleted and the checkpoint cleared.

**UI Verification Layer (Step 5 — extension beyond the base assignment)**
- After API creation + validation, logs into the real UI and confirms the same instance is visible with matching data.
- `api-automation/pages/` is read-only by design — no create/edit methods. Creation stays 100% API-driven.

**Session-collision caveat**
- Logging into the UI in Step 5 invalidates the API token from Step 1 (`401 IQUM001.user.auth.token.validation.failed` on reuse).
- The UI-verification step re-authenticates right after its checks pass, with a fallback in a `finally` block, so cleanup always has a valid token.

**Endpoint behavior deviation**
- `POST /cognitive/v3/learninginstances` returns `200 OK` on success, not `201 Created`.
- Confirmed via live network capture; validators assert the real observed value.

---

## Reporting System

Use Case 1 and Use Case 2 run as **two separate `npx playwright test` invocations** — no single process sees both. One combined report is produced via persist-and-merge:

1. `StepRecorder` accumulates steps, API calls, and named screenshots per test, and attaches them to Playwright's `testInfo`.
2. `CustomHtmlReporter` reads those attachments back and tags each test with its use case (by spec file name).
3. On `onEnd()`, this run's data is saved to `reports/.data/<UC1|UC2>.json`, and the other use case's latest saved snapshot is merged in before generating the HTML.

This means either suite can be (re)run independently, in any order, and the report always reflects the latest known state of both.

**Screenshots**
- Every wrapped action captures a before/after pair (available for debugging, not shown as its own report section).
- `captureNamedScreenshot(label)` captures curated milestones only (e.g. "Login Successful") — these populate the "Key Screenshots" gallery.

**Final report sections**
Dashboard stats → per-use-case Screen Recording → Key Screenshots → API Validation Summary (UC2 only) → failure detail if applicable. Execution timelines, log dumps, and a requirement-coverage table were deliberately removed to keep the report evaluator-focused.

---

## Security: Redaction

`ApiLogger.redactBody()` masks `password` / `token` fields before any request or response body is logged or stored.

This exists because of a real bug caught during development — a login request body was briefly stored unredacted and appeared in the report. Fixed by applying redaction at the point data enters the report, not just at the console-logging point.
