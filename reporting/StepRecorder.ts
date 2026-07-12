import type { Page, TestInfo } from '@playwright/test';
import type {
  ApiCallRecord,
  ConsoleLogRecord,
  DialogRecord,
  NetworkErrorRecord,
  PageErrorRecord,
  ReportMeta,
  StepCategory,
  StepRecord,
  StepStatus,
} from './types';

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now()}_${sequence}`;
}

/**
 * Per-test recorder used by BasePage's `*WithReport()` wrapper methods and
 * the reporting fixture. Accumulates step/log/API data in memory for the
 * duration of one test, then hands it to Playwright via `testInfo.attach()`
 * — attachments are the only channel that reliably survives from a test
 * worker process to the reporter (see CustomHtmlReporter.onTestEnd).
 *
 * Screenshots are attached individually and immediately (as binary PNGs)
 * rather than embedded in the JSON meta blob, keeping that blob small; each
 * step only carries a reference (attachment name) to its screenshot(s).
 */
export class StepRecorder {
  private readonly meta: ReportMeta = {
    steps: [],
    apiCalls: [],
    consoleLogs: [],
    pageErrors: [],
    networkErrors: [],
    dialogs: [],
    namedScreenshots: [],
  };
  private screenshotSeq = 0;
  private finalized = false;

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo
  ) {}

  setBrowserVersion(version: string): void {
    this.meta.browserVersion = version;
  }

  /** Screenshot capture that never throws — a failed/closed page shouldn't fail the step it's documenting. */
  private async captureScreenshot(label: string): Promise<{ attachmentName: string; label: string } | undefined> {
    try {
      this.screenshotSeq += 1;
      const attachmentName = `shot__${this.screenshotSeq}__${label.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
      const buffer = await this.page.screenshot({ type: 'png' });
      await this.testInfo.attach(attachmentName, { body: buffer, contentType: 'image/png' });
      return { attachmentName, label };
    } catch {
      return undefined;
    }
  }

  /**
   * Explicit, one-off milestone screenshot outside the before/after step
   * lifecycle — e.g. "Login Successful", "Form Created". Recorded into
   * `meta.namedScreenshots` (unlike `captureScreenshot()`'s internal use for
   * step before/after pairs) so `CustomHtmlReporter` can surface it in the
   * report's curated "Key Screenshots" gallery.
   */
  async captureNamedScreenshot(label: string): Promise<{ attachmentName: string; label: string } | undefined> {
    const ref = await this.captureScreenshot(label);
    if (ref) this.meta.namedScreenshots.push(ref);
    return ref;
  }

  /**
   * Runs `action`, recording it as one report step with before/after
   * screenshots and timing. Re-throws whatever `action` throws after
   * recording the failure, so callers keep normal Playwright error
   * propagation/assertions.
   */
  async runStep<T>(
    name: string,
    category: StepCategory,
    action: () => Promise<T>,
    opts: { locatorDescription?: string; screenshots?: boolean } = {}
  ): Promise<T> {
    const { locatorDescription, screenshots = true } = opts;
    const id = nextId('step');
    const startTime = Date.now();
    const before = screenshots ? await this.captureScreenshot(`${name}_before`) : undefined;

    let status: StepStatus = 'passed';
    let error: StepRecord['error'];
    try {
      return await action();
    } catch (e: unknown) {
      status = 'failed';
      const err = e as { message?: string; stack?: string };
      error = { message: err?.message ?? String(e), stack: err?.stack };
      throw e;
    } finally {
      const after = screenshots ? await this.captureScreenshot(`${name}_after`) : undefined;
      const endTime = Date.now();
      this.meta.steps.push({
        id,
        name,
        category,
        locatorDescription,
        startTime,
        endTime,
        durationMs: endTime - startTime,
        status,
        beforeScreenshot: before,
        afterScreenshot: after,
        error,
      });
    }
  }

  logApiCall(rec: ApiCallRecord): void {
    this.meta.apiCalls.push(rec);
  }

  logConsole(rec: ConsoleLogRecord): void {
    this.meta.consoleLogs.push(rec);
  }

  logPageError(rec: PageErrorRecord): void {
    this.meta.pageErrors.push(rec);
  }

  logNetworkError(rec: NetworkErrorRecord): void {
    this.meta.networkErrors.push(rec);
  }

  logDialog(rec: DialogRecord): void {
    this.meta.dialogs.push(rec);
  }

  /** Attaches the accumulated JSON meta blob. Must be called once, at the end of the test. */
  async finalize(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    await this.testInfo.attach('__report_meta__', {
      body: Buffer.from(JSON.stringify(this.meta)),
      contentType: 'application/json',
    });
  }
}
