/**
 * Shared types for the custom HTML reporting system.
 *
 * Data flows in two stages:
 *  1. During a test, `StepRecorder` (see StepRecorder.ts) accumulates a
 *     `ReportMeta` blob plus raw screenshot buffers, and attaches both to
 *     Playwright's `testInfo` — the only supported way to move data from a
 *     test worker to the reporter process.
 *  2. `CustomHtmlReporter` reads those attachments back out in
 *     `onTestEnd`/`onEnd`, resolves screenshot/video attachments into
 *     base64, and assembles the final `TestReportEntry[]` + `ExecutionSummary`
 *     consumed by `generateHtmlReport`.
 */

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'warning';

export type StepCategory =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'doubleClick'
  | 'rightClick'
  | 'dragDrop'
  | 'uploadFile'
  | 'downloadFile'
  | 'keyboard'
  | 'assertion'
  | 'apiValidation'
  | 'custom';

export interface StepScreenshotRef {
  attachmentName: string;
  label: string;
}

export interface StepRecord {
  id: string;
  name: string;
  category: StepCategory;
  locatorDescription?: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  status: StepStatus;
  beforeScreenshot?: StepScreenshotRef;
  afterScreenshot?: StepScreenshotRef;
  error?: { message: string; stack?: string };
}

/** A StepRecord with its screenshot attachments resolved to base64 for rendering. */
export interface ResolvedStep extends StepRecord {
  beforeScreenshotBase64?: string;
  afterScreenshotBase64?: string;
}

export interface ApiCallRecord {
  method: string;
  url: string;
  requestBody?: string;
  responseBody?: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
  failed: boolean;
  /**
   * Friendly operation name (e.g. "Authenticate", "Create Learning
   * Instance") for the evaluator-facing "API Validation Summary" table.
   * Only calls with this set appear there — internal/supporting calls
   * (a name-availability check, a re-authentication forced by the UI
   * Verification Layer's session collision, etc.) are logged for
   * completeness but deliberately left unlabeled so the summary table
   * stays to the handful of operations the assignment actually asks for.
   */
  operation?: string;
  /** What was actually asserted about this response — shown when the summary row is expanded. Mirrors the real `expect()` calls in the test, not a generic description. */
  assertions?: string[];
}

export interface ConsoleLogRecord {
  type: string;
  text: string;
  timestamp: number;
}

export interface PageErrorRecord {
  message: string;
  stack?: string;
  timestamp: number;
}

export interface NetworkErrorRecord {
  url: string;
  method: string;
  failure: string;
  timestamp: number;
}

export interface DialogRecord {
  type: string;
  message: string;
  timestamp: number;
}

/** The single JSON attachment a test's StepRecorder produces. */
export interface ReportMeta {
  steps: StepRecord[];
  apiCalls: ApiCallRecord[];
  consoleLogs: ConsoleLogRecord[];
  pageErrors: PageErrorRecord[];
  networkErrors: NetworkErrorRecord[];
  dialogs: DialogRecord[];
  browserVersion?: string;
  /** Standalone milestone screenshots captured via `StepRecorder.captureNamedScreenshot()`, for the report's curated "Key Screenshots" gallery — deliberately separate from the before/after pair every `runStep()` captures. */
  namedScreenshots: StepScreenshotRef[];
}

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/**
 * Which assignment use case a test belongs to. `'UNASSIGNED'` is the
 * backward-compatible fallback for any spec that doesn't map to either
 * named use case (e.g. `reportingDemo.spec.ts`) — it renders in its own
 * "Other Tests" group rather than being silently dropped or crashing the
 * report, so adding a third spec file later doesn't break anything.
 */
export type UseCaseId = 'UC1' | 'UC2' | 'UNASSIGNED';

export interface UseCaseInfo {
  id: UseCaseId;
  /** Exact assignment wording, used verbatim as the section heading. */
  label: string;
}

export interface TestReportEntry {
  id: string;
  /** The test's own name, e.g. "creates a form, configures textboxes...". */
  title: string;
  /** The `describe()` block name(s) the test belongs to, e.g. "Automation Anywhere — Form & Rules Builder E2E". */
  suiteTitle: string;
  /** Spec file name, e.g. "rulesBuilder.spec.ts" — shown as small metadata, not jammed into the title. */
  fileName: string;
  /**
   * Human-readable summary from `test('name', { annotation: { type:
   * 'description', description: '...' } }, ...)` — Playwright's own
   * mechanism for this, not a custom convention. Falls back to the test
   * title when a test hasn't declared one.
   */
  description: string;
  /** Full "project > file > suite > test" path, kept for tooltips/debugging, not primary display. */
  fullTitle: string;
  status: TestStatus;
  startTime: number;
  endTime: number;
  durationMs: number;
  browser: string;
  retries: number;
  errorMessage?: string;
  errorStack?: string;
  steps: ResolvedStep[];
  apiCalls: ApiCallRecord[];
  consoleLogs: ConsoleLogRecord[];
  pageErrors: PageErrorRecord[];
  networkErrors: NetworkErrorRecord[];
  dialogs: DialogRecord[];
  videoBase64?: string;
  videoMimeType?: string;
  failureScreenshotBase64?: string;
  /**
   * Which assignment use case this test belongs to — assigned by
   * `CustomHtmlReporter` from the spec file name. Optional (defaults to
   * `'UNASSIGNED'` when absent) so any older persisted snapshot JSON
   * without this field still renders instead of breaking.
   */
  useCase?: UseCaseInfo;
  /** Curated milestone screenshots for the "Key Screenshots" gallery — see `ReportMeta.namedScreenshots`. */
  namedScreenshots: Array<{ label: string; base64?: string }>;
}

export interface ExecutionSummary {
  executionDate: string;
  executionTime: string;
  totalDurationMs: number;
  browser: string;
  browserVersion: string;
  os: string;
  environment: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  passPercentage: number;
}

/**
 * One run's worth of report data, persisted to `reports/.data/<useCaseId>.json`
 * so that Use Case 1 and Use Case 2 — which run as two entirely separate
 * `npx playwright test` invocations, under two independent configs, often
 * at different times — can still be combined into a single
 * "Automation Anywhere Assignment Report" HTML file. Each run overwrites
 * only its own use case's snapshot; the report generator merges in
 * whatever snapshot(s) exist for the *other* use case(s) at the time it
 * runs, so either suite can be (re)run independently without needing the
 * other to also run in the same process.
 */
export interface PersistedRunSnapshot {
  useCase: UseCaseInfo;
  generatedAt: number;
  summary: ExecutionSummary;
  tests: TestReportEntry[];
}
