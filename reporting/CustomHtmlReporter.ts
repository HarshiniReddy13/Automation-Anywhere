import fs from 'fs';
import path from 'path';
import os from 'os';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { generateHtmlReport } from './htmlTemplate';
import type { ExecutionSummary, ReportMeta, ResolvedStep, TestReportEntry } from './types';

/**
 * Custom Playwright reporter producing a single self-contained HTML file per
 * execution under `reports/`. Never overwrites a previous run — each file
 * name carries the execution's start timestamp.
 *
 * Per-test detail (steps, screenshots, API calls, logs) arrives via
 * `testInfo.attach()` from `StepRecorder` (see StepRecorder.ts) — the only
 * channel that reliably survives from a test worker process back to this
 * reporter, including under parallel execution. Screenshots and the
 * built-in video recording are resolved to base64 here so the final HTML
 * has zero external file dependencies.
 */
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

    const project = test.parent.project();
    const browser = project?.use?.browserName ?? project?.name ?? 'unknown';

    // titlePath is [project, file, ...describe blocks, test title]. Split it
    // so the report can show a clean test name + suite instead of jamming
    // the project/file/describe chain into one long, technical title.
    const titlePath = test.titlePath().filter(Boolean);
    const fileName = titlePath[1] ?? '';
    const suiteTitle = titlePath.slice(2, -1).join(' › ') || fileName;

    // Playwright's own mechanism for a human-readable test summary:
    // test('name', { annotation: { type: 'description', description: '...' } }, ...).
    // Falls back to the raw test title when a test hasn't declared one.
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
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    const endTimeMs = Date.now();
    const summary = this.buildSummary(endTimeMs);
    const html = generateHtmlReport(summary, this.tests);

    const reportsDir = path.resolve(process.cwd(), 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const filePath = path.join(reportsDir, `TestExecution_${formatTimestampForFilename(new Date(this.startTimeMs))}.html`);
    fs.writeFileSync(filePath, html, 'utf-8');

    // eslint-disable-next-line no-console
    console.log(`\n📄 HTML report written to ${filePath}\n`);
  }

  // --- Attachment resolution ---------------------------------------------------

  private readReportMeta(result: TestResult): ReportMeta {
    const attachment = result.attachments.find((a) => a.name === '__report_meta__');
    if (!attachment?.body) {
      return { steps: [], apiCalls: [], consoleLogs: [], pageErrors: [], networkErrors: [], dialogs: [] };
    }
    try {
      return JSON.parse(attachment.body.toString('utf-8')) as ReportMeta;
    } catch {
      return { steps: [], apiCalls: [], consoleLogs: [], pageErrors: [], networkErrors: [], dialogs: [] };
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
      // Playwright's own built-in failure screenshot (from `use.screenshot`),
      // kept as a fallback if StepRecorder didn't capture one of its own.
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

  // --- Summary -------------------------------------------------------------

  private buildSummary(endTimeMs: number): ExecutionSummary {
    const passed = this.tests.filter((t) => t.status === 'passed').length;
    const failed = this.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
    const skipped = this.tests.filter((t) => t.status === 'skipped' || t.status === 'interrupted').length;
    const total = this.tests.length;
    const start = new Date(this.startTimeMs);

    return {
      executionDate: start.toLocaleDateString(),
      executionTime: start.toLocaleTimeString(),
      totalDurationMs: endTimeMs - this.startTimeMs,
      browser: this.tests[0]?.browser ?? 'unknown',
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
