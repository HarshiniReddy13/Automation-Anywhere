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


  async captureNamedScreenshot(label: string): Promise<{ attachmentName: string; label: string } | undefined> {
    const ref = await this.captureScreenshot(label);
    if (ref) this.meta.namedScreenshots.push(ref);
    return ref;
  }


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

  async finalize(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    await this.testInfo.attach('__report_meta__', {
      body: Buffer.from(JSON.stringify(this.meta)),
      contentType: 'application/json',
    });
  }
}
