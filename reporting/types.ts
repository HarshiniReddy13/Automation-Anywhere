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
}

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

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
