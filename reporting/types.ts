

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

  operation?: string;
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

export interface ReportMeta {
  steps: StepRecord[];
  apiCalls: ApiCallRecord[];
  consoleLogs: ConsoleLogRecord[];
  pageErrors: PageErrorRecord[];
  networkErrors: NetworkErrorRecord[];
  dialogs: DialogRecord[];
  browserVersion?: string;
  namedScreenshots: StepScreenshotRef[];
}

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

export type UseCaseId = 'UC1' | 'UC2' | 'UNASSIGNED';

export interface UseCaseInfo {
  id: UseCaseId;
  label: string;
}

export interface TestReportEntry {
  id: string;
  title: string;
  suiteTitle: string;
  fileName: string;

  description: string;
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

  useCase?: UseCaseInfo;
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


export interface PersistedRunSnapshot {
  useCase: UseCaseInfo;
  generatedAt: number;
  summary: ExecutionSummary;
  tests: TestReportEntry[];
}
