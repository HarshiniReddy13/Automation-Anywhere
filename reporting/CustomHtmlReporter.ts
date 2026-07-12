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

/**
 * Maps a spec file name to its assignment use case. Use Case 1 (UI) and Use
 * Case 2 (API) run under two entirely independent Playwright configs — see
 * `USE_CASES` below and `mergeWithPersistedSnapshots()` for how their
 * reports still end up combined into one HTML file despite that.
 */
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
 *
 * Use Case 1 (`playwright.config.ts`) and Use Case 2
 * (`playwright.api.config.ts`) each run this same reporter class as part of
 * two separate `npx playwright test` invocations — there is no single
 * process that sees both suites' tests at once. To still produce one
 * combined "Automation Anywhere Assignment Report", `onEnd()` persists this
 * run's tests to `reports/.data/<useCaseId>.json` and merges in whatever
 * snapshot(s) exist for the *other* use case(s) before generating the HTML.
 * Re-running one suite always regenerates a report reflecting the latest
 * known state of both — a suite that hasn't run yet simply doesn't
 * contribute a section (no error), and a failure in one use case's tests
 * cannot affect how the other use case's already-persisted section renders.
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

    const namedScreenshots = meta.namedScreenshots.map((ref) => ({
      label: ref.label,
      base64: screenshotMap.get(ref.attachmentName),
    }));

    const project = test.parent.project();
    // `||` (not `??`) deliberately: playwright.api.config.ts's implicit,
    // unnamed default project has `project.name === ''` — an empty string
    // is falsy but not nullish, so `??` would silently accept it and the
    // report's "Browser" stat would render blank instead of falling
    // through to a real value.
    const browser = project?.use?.browserName || project?.name || 'chromium';

    // titlePath is [project, file, ...describe blocks, test title] — but
    // `.filter(Boolean)` silently drops an empty *project name* (e.g.
    // playwright.api.config.ts's implicit, unnamed default project), which
    // shifts every subsequent index down by one and makes titlePath[1]
    // resolve to a describe-block title instead of the file name. Confirmed
    // live: this caused Use Case 2's tests to be tagged "UNASSIGNED" instead
    // of "UC2". `test.location.file` is Playwright's own reliable source
    // for the spec file path regardless of project naming — use that
    // instead of parsing titlePath.
    const fileName = path.basename(test.location.file);
    // `test.parent` is the immediate enclosing `describe()` block's Suite —
    // reading `.title` directly off it sidesteps the same titlePath
    // index-shifting problem fileName just worked around, since every spec
    // in this project uses a single-level describe() (not nested ones).
    const suiteTitle = test.parent.title || fileName;
    const titlePath = test.titlePath().filter(Boolean);

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
      useCase: resolveUseCase(fileName),
      namedScreenshots,
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    const endTimeMs = Date.now();
    const thisRunSummary = this.buildSummary(endTimeMs);

    // Figure out which use case(s) this run actually covers (normally
    // exactly one — Use Case 1 and Use Case 2 run under separate configs —
    // but this stays correct even if a future run mixes spec files).
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

    // eslint-disable-next-line no-console
    console.log(`\n📄 HTML report written to ${filePath}\n`);
  }

  // --- Cross-run persistence & merge ---------------------------------------

  /** Writes this run's tests (for one use case) to disk so a later, separate run of the other use case can merge them in. */
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
      // Non-fatal: worst case, the next combined report just won't include
      // this run's data for the other use case to pick up.
      // eslint-disable-next-line no-console
      console.warn(`Could not persist report snapshot for ${useCaseId}: ${(error as Error).message}`);
    }
  }

  /**
   * Reads every persisted snapshot under `reports/.data/`, keeps this run's
   * own fresh in-memory data for whichever use case(s) it just produced,
   * and fills in any OTHER use case(s) from their most recently persisted
   * snapshot. A snapshot that fails to parse (corrupt/partial write) is
   * skipped rather than thrown — one broken file must not prevent the
   * current run's own section from rendering.
   */
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
      // Backward-compat: older persisted meta blobs predate namedScreenshots.
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

  /** Stats for THIS run only (its own use case's tests) — what gets persisted to disk. */
  private buildSummary(endTimeMs: number): ExecutionSummary {
    return this.summarize(this.tests, endTimeMs);
  }

  /**
   * Stats for the FULL merged set (this run's use case + whatever other
   * use case snapshot(s) were found on disk) — what the generated HTML
   * actually shows. Wall-clock fields (date/time/duration/browser) stay
   * this run's own, since two independent process runs don't share a
   * meaningful combined duration; only the test counts are unioned.
   */
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
