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

```
AA_USERNAME=your_username
AA_PASSWORD=your_password
BASE_URL=your_environment_url
```

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
