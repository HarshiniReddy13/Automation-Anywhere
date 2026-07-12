# Automation Anywhere — Assignment Automation

This repository contains Playwright + TypeScript automation for two assignment use cases: **Use Case 1 — Form with Rules Builder (UI Automation)** and **Use Case 2 — Learning Instance API Flow (API Automation)**. Both use cases run independently and share a single custom HTML report.

---

## Project Structure

```
.
├── form-automation/       # Use Case 1 (UI)
├── api-automation/        # Use Case 2 (API)
├── reporting/              # Shared custom HTML reporter
├── package.json
├── playwright.config.ts       # Use Case 1 config
├── playwright.api.config.ts   # Use Case 2 config
└── README.md
```

---

## Tech Stack

- Playwright
- TypeScript
- Node.js
- Playwright APIRequestContext
- Page Object Model
- Custom HTML Reporter

---

## Setup

```bash
npm install
npx playwright install
```

Create a `.env` file:

```bash
# Target environment (dev | staging | prod)
TEST_ENV=dev

# Base URL of the Automation Anywhere instance
BASE_URL=https://community.cloud.automationanywhere.digital

# Login credentials (used by both use cases)
AA_USERNAME=your.username@example.com
AA_PASSWORD=your-password

# Run browsers headless (false to watch tests execute)
HEADLESS=true

# --- Use Case 1 (UI) timeouts, in ms ---
DEFAULT_TIMEOUT=60000       # General default timeout
ACTION_TIMEOUT=30000        # Timeout for individual UI actions (click, fill, etc.)
NAVIGATION_TIMEOUT=60000    # Timeout for page navigations
EXPECT_TIMEOUT=20000        # Timeout for assertions

# --- Use Case 2 (API) settings ---
API_REQUEST_TIMEOUT_MS=30000          # Timeout per API request
API_MAX_RETRY_ATTEMPTS=3              # Max attempts for transient/failed requests
API_RETRY_BASE_DELAY_MS=500           # Starting delay between retries (exponential backoff)
API_RETRY_MAX_DELAY_MS=8000           # Maximum delay between retries
API_MAX_RESPONSE_TIME_MS=10000        # Response time threshold used in assertions
API_TOKEN_EXPIRY_BUFFER_SECONDS=60    # Re-authenticate this many seconds before token expiry
```

Only `AA_USERNAME`, `AA_PASSWORD`, and `BASE_URL` are required — all other values have working defaults.

---

## Running the Tests

```bash
# Use Case 1
npm run test:rules

# Use Case 2
npm run test:api
```

After a run, open the latest HTML file generated in `reports/` to view the combined report.

---

## Custom HTML Report

The generated report includes:

- Execution summary
- Separate sections for both use cases
- Screen recordings
- Key screenshots
- API validation summary
- Pass/Fail status

---

## Notes

- Credentials are read from `.env`
- Reports are generated automatically after each run
- Generated folders like `playwright-report/` and `test-results/` are ignored by Git
