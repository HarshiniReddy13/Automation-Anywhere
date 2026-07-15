import fs from 'fs';
import path from 'path';
import os from 'os';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { generateHtmlReport } from './htmlTemplate';
import type {
  ExecutionSummary,
  PersistedRunSnapshot,
  ReportMeta,
  ResolvedStep,
  TestReportEntry,
  UseCaseId,
  UseCaseInfo,
} from './types';


const USE_CASES: Record<Exclude<UseCaseId, 'UNASSIGNED'>, UseCaseInfo> = {
  UC1: { id: 'UC1', label: 'Use Case 1: Form with Rules Builder (UI Automation)' },
  UC2: { id: 'UC2', label: 'Use Case 2: Learning Instance API Flow (API Automation)' },
};

function resolveUseCase(fileName: string): UseCaseInfo {
  if (fileName === 'rulesBuilder.spec.ts') return USE_CASES.UC1;
  if (fileName === 'learningInstance.spec.ts') return USE_CASES.UC2;
  return { id: 'UNASSIGNED', label: 'Other Tests' };
}

const SNAPSHOT_DIR = path.resolve(process.cwd(), 'reports', '.data');

const EMPTY_META: ReportMeta = {
  steps: [],
  apiCalls: [],
  consoleLogs: [],
  pageErrors: [],
  networkErrors: [],
  dialogs: [],
  namedScreenshots: [],
};

export default class CustomHtmlReporter implements Reporter {
  private readonly tests: TestReportEntry[] = [];
  private startTimeMs = 0;
  private browserVersion = 'n/a';

  onBegin(): void {
    this.startTimeMs = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const meta = this.readReportMeta(result);
    const { screenshotMap, videoBase64, videoMimeType, builtInFailureScreenshotBase64 } =
      this.resolveAttachments(result);

    const steps: ResolvedStep[] = meta.steps.map((step) => ({
      ...step,
      beforeScreenshotBase64: step.beforeScreenshot
        ? screenshotMap.get(step.beforeScreenshot.attachmentName)
        : undefined,
      afterScreenshotBase64: step.afterScreenshot
        ? screenshotMap.get(step.afterScreenshot.attachmentName)
        : undefined,
    }));

    if (meta.browserVersion && this.browserVersion === 'n/a') {
      this.browserVersion = meta.browserVersion;
    }

    const namedScreenshots = meta.namedScreenshots.map((ref) => ({
      label: ref.label,
      base64: screenshotMap.get(ref.attachmentName),
    }));

    const project = test.parent.project();

    const browser = project?.use?.browserName || project?.name || 'chromium';


    const fileName = path.basename(test.location.file);

    const suiteTitle = test.parent.title || fileName;
    const titlePath = test.titlePath().filter(Boolean);


    const description =
      test.annotations.find((a) => a.type === 'description')?.description ?? test.title;

    this.tests.push({
      id: test.id,
      title: test.title,
      suiteTitle,
      fileName,
      description,
      fullTitle: titlePath.join(' > '),
      status: result.status,
      startTime: result.startTime.getTime(),
      endTime: result.startTime.getTime() + result.duration,
      durationMs: result.duration,
      browser,
      retries: result.retry,
      errorMessage: result.error?.message,
      errorStack: result.error?.stack,
      steps,
      apiCalls: meta.apiCalls,
      consoleLogs: meta.consoleLogs,
      pageErrors: meta.pageErrors,
      networkErrors: meta.networkErrors,
      dialogs: meta.dialogs,
      videoBase64,
      videoMimeType,
      failureScreenshotBase64: screenshotMap.get('shot__failure') ?? builtInFailureScreenshotBase64,
      useCase: resolveUseCase(fileName),
      namedScreenshots,
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    const endTimeMs = Date.now();
    const thisRunSummary = this.buildSummary(endTimeMs);

    const useCaseIdsInThisRun = new Set(this.tests.map((t) => t.useCase?.id ?? 'UNASSIGNED'));
    for (const id of useCaseIdsInThisRun) {
      this.persistSnapshot(id as UseCaseId, thisRunSummary, endTimeMs);
    }

    const { mergedTests } = this.mergeWithPersistedSnapshots(useCaseIdsInThisRun);
    const combinedSummary = this.buildCombinedSummary(mergedTests, thisRunSummary);
    const html = generateHtmlReport(combinedSummary, mergedTests);

    const reportsDir = path.resolve(process.cwd(), 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const filePath = path.join(reportsDir, `TestExecution_${formatTimestampForFilename(new Date(this.startTimeMs))}.html`);
    fs.writeFileSync(filePath, html, 'utf-8');


    console.log(`\n📄 HTML report written to ${filePath}\n`);
  }


  private persistSnapshot(useCaseId: UseCaseId, summary: ExecutionSummary, generatedAt: number): void {
    const testsForThisUseCase = this.tests.filter((t) => (t.useCase?.id ?? 'UNASSIGNED') === useCaseId);
    if (testsForThisUseCase.length === 0) return;

    const snapshot: PersistedRunSnapshot = {
      useCase: testsForThisUseCase[0].useCase ?? { id: 'UNASSIGNED', label: 'Other Tests' },
      generatedAt,
      summary,
      tests: testsForThisUseCase,
    };

    try {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
      fs.writeFileSync(path.join(SNAPSHOT_DIR, `${useCaseId}.json`), JSON.stringify(snapshot), 'utf-8');
    } catch (error) {

      console.warn(`Could not persist report snapshot for ${useCaseId}: ${(error as Error).message}`);
    }
  }


  private mergeWithPersistedSnapshots(useCaseIdsInThisRun: Set<string>): { mergedTests: TestReportEntry[] } {
    const merged: TestReportEntry[] = [...this.tests];

    let entries: string[] = [];
    try {
      entries = fs.existsSync(SNAPSHOT_DIR) ? fs.readdirSync(SNAPSHOT_DIR) : [];
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const useCaseId = entry.replace(/\.json$/, '');
      if (useCaseIdsInThisRun.has(useCaseId)) continue; // this run's own data is already the freshest

      try {
        const raw = fs.readFileSync(path.join(SNAPSHOT_DIR, entry), 'utf-8');
        const snapshot = JSON.parse(raw) as PersistedRunSnapshot;
        merged.push(...snapshot.tests);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Skipping unreadable report snapshot "${entry}": ${(error as Error).message}`);
      }
    }

    return { mergedTests: merged };
  }

  // --- Attachment resolution ---------------------------------------------------

  private readReportMeta(result: TestResult): ReportMeta {
    const attachment = result.attachments.find((a) => a.name === '__report_meta__');
    if (!attachment?.body) {
      return EMPTY_META;
    }
    try {
      const parsed = JSON.parse(attachment.body.toString('utf-8')) as ReportMeta;
      return { ...parsed, namedScreenshots: parsed.namedScreenshots ?? [] };
    } catch {
      return EMPTY_META;
    }
  }

  private resolveAttachments(result: TestResult): {
    screenshotMap: Map<string, string>;
    videoBase64?: string;
    videoMimeType?: string;
    builtInFailureScreenshotBase64?: string;
  } {
    const screenshotMap = new Map<string, string>();
    let videoBase64: string | undefined;
    let videoMimeType: string | undefined;
    let builtInFailureScreenshotBase64: string | undefined;

    for (const attachment of result.attachments) {
      if (attachment.name.startsWith('shot__') && attachment.body) {
        screenshotMap.set(attachment.name, attachment.body.toString('base64'));
        continue;
      }

      if (attachment.name === 'screenshot') {
        if (attachment.body) {
          builtInFailureScreenshotBase64 = attachment.body.toString('base64');
        } else if (attachment.path && fs.existsSync(attachment.path)) {
          builtInFailureScreenshotBase64 = fs.readFileSync(attachment.path).toString('base64');
        }
        continue;
      }
      if (attachment.name === 'video' && attachment.path && fs.existsSync(attachment.path)) {
        videoBase64 = fs.readFileSync(attachment.path).toString('base64');
        videoMimeType = attachment.contentType || 'video/webm';
      }
    }

    return { screenshotMap, videoBase64, videoMimeType, builtInFailureScreenshotBase64 };
  }


  private buildSummary(endTimeMs: number): ExecutionSummary {
    return this.summarize(this.tests, endTimeMs);
  }


  private buildCombinedSummary(mergedTests: TestReportEntry[], thisRunSummary: ExecutionSummary): ExecutionSummary {
    const combined = this.summarize(mergedTests, this.startTimeMs + thisRunSummary.totalDurationMs);
    return { ...combined, totalDurationMs: thisRunSummary.totalDurationMs };
  }

  private summarize(tests: TestReportEntry[], endTimeMs: number): ExecutionSummary {
    const passed = tests.filter((t) => t.status === 'passed').length;
    const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
    const skipped = tests.filter((t) => t.status === 'skipped' || t.status === 'interrupted').length;
    const total = tests.length;
    const start = new Date(this.startTimeMs);

    return {
      executionDate: start.toLocaleDateString(),
      executionTime: start.toLocaleTimeString(),
      totalDurationMs: endTimeMs - this.startTimeMs,
      browser: tests[0]?.browser ?? 'unknown',
      browserVersion: this.browserVersion,
      os: `${os.type()} ${os.release()} (${os.platform()})`,
      environment: process.env.TEST_ENV ?? 'dev',
      totalTests: total,
      passed,
      failed,
      skipped,
      passPercentage: total ? Math.round((passed / total) * 1000) / 10 : 0,
    };
  }
}

function formatTimestampForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
