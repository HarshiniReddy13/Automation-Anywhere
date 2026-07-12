import type {
  ApiCallRecord,
  ConsoleLogRecord,
  DialogRecord,
  ExecutionSummary,
  NetworkErrorRecord,
  PageErrorRecord,
  ResolvedStep,
  TestReportEntry,
} from './types';

/** Escapes text for safe interpolation into HTML (log/error content is arbitrary user/app text). */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips ANSI color escape codes. Playwright's own error messages/stacks
 * are formatted for a terminal (color codes for "expect", "locator", etc.)
 * — rendered as-is in HTML they show up as literal garbage like `[2m[22m`.
 */
function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Escapes error/stack text after stripping ANSI codes — use for anything sourced from a TestError. */
function escError(value: unknown): string {
  return esc(stripAnsi(String(value ?? '')));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'passed':
      return 'badge badge--pass';
    case 'failed':
    case 'timedOut':
      return 'badge badge--fail';
    case 'skipped':
    case 'interrupted':
      return 'badge badge--skip';
    case 'warning':
      return 'badge badge--warn';
    default:
      return 'badge';
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return '✓';
    case 'failed':
    case 'timedOut':
      return '✕';
    case 'skipped':
    case 'interrupted':
      return '⊘';
    case 'warning':
      return '!';
    default:
      return '•';
  }
}

// --- Section renderers -------------------------------------------------------

function renderDashboard(summary: ExecutionSummary): string {
  const cards: Array<[string, string]> = [
    ['Execution Date', esc(summary.executionDate)],
    ['Execution Time', esc(summary.executionTime)],
    ['Total Duration', formatDuration(summary.totalDurationMs)],
    ['Browser', esc(summary.browser)],
    ['Browser Version', esc(summary.browserVersion)],
    ['Operating System', esc(summary.os)],
    ['Environment', esc(summary.environment)],
    ['Total Tests', String(summary.totalTests)],
    ['Passed', String(summary.passed)],
    ['Failed', String(summary.failed)],
    ['Skipped', String(summary.skipped)],
    ['Pass %', `${summary.passPercentage}%`],
  ];

  const cardsHtml = cards
    .map(
      ([label, value]) => `
      <div class="stat-card">
        <div class="stat-card__label">${label}</div>
        <div class="stat-card__value">${value}</div>
      </div>`
    )
    .join('');

  return `
  <section class="dashboard" id="dashboard">
    <div class="stat-grid">${cardsHtml}</div>
    <div class="progress-bar" role="progressbar" aria-valuenow="${summary.passPercentage}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar__fill" style="width:${summary.passPercentage}%"></div>
      <span class="progress-bar__label">${summary.passPercentage}% passed</span>
    </div>
  </section>`;
}

function renderTimeline(tests: TestReportEntry[]): string {
  type Entry = { time: number; label: string; testTitle: string; status: string };
  const entries: Entry[] = [];
  for (const t of tests) {
    for (const s of t.steps) {
      entries.push({ time: s.startTime, label: s.name, testTitle: t.title, status: s.status });
    }
  }
  entries.sort((a, b) => a.time - b.time);

  if (entries.length === 0) {
    return '';
  }

  const rows = entries
    .map(
      (e) => `
      <li class="timeline__item">
        <span class="timeline__time">${formatClock(e.time)}</span>
        <span class="timeline__dot timeline__dot--${e.status}"></span>
        <span class="timeline__label">${esc(e.label)}</span>
        <span class="timeline__test">${esc(e.testTitle)}</span>
      </li>`
    )
    .join('');

  return `
  <section class="panel" id="timeline">
    <h2 class="panel__title">Execution Timeline</h2>
    <ul class="timeline">${rows}</ul>
  </section>`;
}

function renderScreenshotThumb(label: string, base64?: string): string {
  if (!base64) return '';
  const src = `data:image/png;base64,${base64}`;
  return `
    <button type="button" class="thumb" data-full="${src}" data-caption="${esc(label)}">
      <img src="${src}" alt="${esc(label)}" loading="lazy" />
      <span class="thumb__caption">${esc(label)}</span>
    </button>`;
}

function renderStep(step: ResolvedStep): string {
  const errorBlock = step.error
    ? `<div class="step__error">
         <div class="step__error-message">${escError(step.error.message)}</div>
         ${step.error.stack ? `<pre class="step__stack">${escError(step.error.stack)}</pre>` : ''}
       </div>`
    : '';

  return `
  <li class="step step--${step.status}">
    <div class="step__header">
      <span class="${statusBadgeClass(step.status)}">${statusIcon(step.status)}</span>
      <span class="step__category">${esc(step.category)}</span>
      <span class="step__name">${esc(step.name)}</span>
      <span class="step__time">${formatClock(step.startTime)}</span>
      <span class="step__duration">${formatDuration(step.durationMs)}</span>
    </div>
    ${step.locatorDescription ? `<div class="step__locator">Target: ${esc(step.locatorDescription)}</div>` : ''}
    ${errorBlock}
    <div class="step__shots">
      ${renderScreenshotThumb('Before', step.beforeScreenshotBase64)}
      ${renderScreenshotThumb('After', step.afterScreenshotBase64)}
    </div>
  </li>`;
}

function renderApiTable(calls: ApiCallRecord[]): string {
  if (calls.length === 0) return '<p class="empty-note">No API calls captured.</p>';
  const rows = calls
    .map(
      (c) => `
      <tr class="${c.failed ? 'api-row--failed' : ''}">
        <td>${formatClock(c.timestamp)}</td>
        <td><span class="method-tag">${esc(c.method)}</span></td>
        <td class="api-url" title="${esc(c.url)}">${esc(c.url)}</td>
        <td><span class="${c.failed ? 'badge badge--fail' : 'badge badge--pass'}">${c.statusCode}</span></td>
        <td>${c.durationMs}ms</td>
        <td>${c.requestBody ? `<details><summary>view</summary><pre>${esc(c.requestBody).slice(0, 2000)}</pre></details>` : '—'}</td>
        <td>${c.responseBody ? `<details><summary>view</summary><pre>${esc(c.responseBody).slice(0, 2000)}</pre></details>` : '—'}</td>
      </tr>`
    )
    .join('');

  return `
  <table class="data-table">
    <thead>
      <tr><th>Time</th><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>Request</th><th>Response</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderLogsPanel(
  title: string,
  items: Array<{ timestamp: number; text: string }>,
  emptyText: string
): string {
  if (items.length === 0) {
    return `<div class="log-group"><h4>${esc(title)}</h4><p class="empty-note">${esc(emptyText)}</p></div>`;
  }
  const rows = items
    .map((i) => `<div class="log-line"><span class="log-line__time">${formatClock(i.timestamp)}</span>${esc(i.text)}</div>`)
    .join('');
  return `<div class="log-group"><h4>${esc(title)} (${items.length})</h4>${rows}</div>`;
}

function consoleAsItems(logs: ConsoleLogRecord[]) {
  return logs.map((l) => ({ timestamp: l.timestamp, text: `[${l.type}] ${l.text}` }));
}
function pageErrorsAsItems(errors: PageErrorRecord[]) {
  return errors.map((e) => ({ timestamp: e.timestamp, text: e.message }));
}
function networkErrorsAsItems(errors: NetworkErrorRecord[]) {
  return errors.map((e) => ({ timestamp: e.timestamp, text: `${e.method} ${e.url} — ${e.failure}` }));
}
function dialogsAsItems(dialogs: DialogRecord[]) {
  return dialogs.map((d) => ({ timestamp: d.timestamp, text: `[${d.type}] ${d.message}` }));
}

function renderFailurePanel(test: TestReportEntry): string {
  if (test.status !== 'failed' && test.status !== 'timedOut') return '';
  const shot = test.failureScreenshotBase64
    ? renderScreenshotThumb('Failure screenshot', test.failureScreenshotBase64)
    : '';
  return `
  <div class="failure-panel">
    <h4>Failure Details</h4>
    <div class="failure-panel__message">${escError(test.errorMessage ?? 'No error message captured.')}</div>
    ${test.errorStack ? `<pre class="step__stack">${escError(test.errorStack)}</pre>` : ''}
    ${shot ? `<div class="step__shots">${shot}</div>` : ''}
  </div>`;
}

function renderVideo(test: TestReportEntry): string {
  if (!test.videoBase64) return '';
  const mime = test.videoMimeType ?? 'video/webm';
  return `
  <div class="video-block">
    <h4>Session Recording</h4>
    <video controls preload="metadata" class="video-player">
      <source src="data:${mime};base64,${test.videoBase64}" type="${mime}" />
      Your browser does not support embedded video playback.
    </video>
  </div>`;
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function renderTestCard(test: TestReportEntry, index: number): string {
  const stepsHtml = test.steps.length
    ? `<ul class="step-list">${test.steps.map(renderStep).join('')}</ul>`
    : '<p class="empty-note">No recorded steps for this test.</p>';

  const searchableText = [test.title, test.suiteTitle, test.description].join(' ').toLowerCase();

  return `
  <article class="test-card" data-status="${test.status}" data-title="${esc(searchableText)}" id="test-${index}">
    <button type="button" class="test-card__header" aria-expanded="false" data-toggle="test-body-${index}" title="${esc(test.fullTitle)}">
      <span class="${statusBadgeClass(test.status)}">${statusIcon(test.status)} ${esc(test.status)}</span>
      <span class="test-card__titles">
        <span class="test-card__title">${esc(capitalize(test.title))}</span>
        <span class="test-card__suite">${esc(test.suiteTitle)}</span>
      </span>
      <span class="test-card__meta">${formatDuration(test.durationMs)} · ${esc(test.browser)}${test.retries ? ` · retry ${test.retries}` : ''}</span>
      <span class="test-card__chevron">▾</span>
    </button>
    <div class="test-card__body" id="test-body-${index}" hidden>
      <p class="test-card__description">${esc(test.description)}</p>
      <div class="test-card__timerange">
        <span>File: ${esc(test.fileName)}</span>
        <span>Start: ${new Date(test.startTime).toLocaleString()}</span>
        <span>End: ${new Date(test.endTime).toLocaleString()}</span>
      </div>
      ${renderFailurePanel(test)}
      ${renderVideo(test)}
      <details class="sub-section" open>
        <summary>Execution Steps (${test.steps.length})</summary>
        ${stepsHtml}
      </details>
      <details class="sub-section">
        <summary>API Calls (${test.apiCalls.length})</summary>
        ${renderApiTable(test.apiCalls)}
      </details>
      <details class="sub-section">
        <summary>Logs</summary>
        <div class="logs-grid">
          ${renderLogsPanel('Console Logs', consoleAsItems(test.consoleLogs), 'No console output.')}
          ${renderLogsPanel('Page Errors', pageErrorsAsItems(test.pageErrors), 'No page errors.')}
          ${renderLogsPanel('Network Errors', networkErrorsAsItems(test.networkErrors), 'No network errors.')}
          ${renderLogsPanel('Dialogs', dialogsAsItems(test.dialogs), 'No dialogs triggered.')}
        </div>
      </details>
    </div>
  </article>`;
}

// --- Top-level assembly --------------------------------------------------------

export function generateHtmlReport(summary: ExecutionSummary, tests: TestReportEntry[]): string {
  const testsHtml = tests.map((t, i) => renderTestCard(t, i)).join('\n');

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Test Execution Report — ${esc(summary.executionDate)} ${esc(summary.executionTime)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <header class="topbar">
    <div class="topbar__brand">Test Execution Report</div>
    <div class="topbar__controls">
      <input type="search" id="search-input" class="search-input" placeholder="Search tests..." />
      <div class="filter-group" id="filter-group">
        <button type="button" class="filter-btn is-active" data-filter="all">All</button>
        <button type="button" class="filter-btn" data-filter="passed">Passed</button>
        <button type="button" class="filter-btn" data-filter="failed">Failed</button>
        <button type="button" class="filter-btn" data-filter="skipped">Skipped</button>
      </div>
      <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Toggle dark mode">🌙</button>
    </div>
  </header>

  <main class="container">
    ${renderDashboard(summary)}
    ${renderTimeline(tests)}
    <section class="panel" id="tests">
      <h2 class="panel__title">Test Details (<span id="visible-count">${tests.length}</span> of ${tests.length})</h2>
      <div id="test-list">
        ${testsHtml || '<p class="empty-note">No tests recorded.</p>'}
      </div>
    </section>
  </main>

  <div id="screenshot-modal" class="modal" hidden>
    <button type="button" class="modal__close" id="modal-close" aria-label="Close">✕</button>
    <div class="modal__caption" id="modal-caption"></div>
    <div class="modal__viewport" id="modal-viewport">
      <img id="modal-image" src="" alt="Full screenshot preview" />
    </div>
    <div class="modal__hint">Scroll to zoom · Drag to pan · Esc to close</div>
  </div>

  <script>${REPORT_JS}</script>
</body>
</html>`;
}

// --- Embedded CSS ---------------------------------------------------------------

const REPORT_CSS = `
:root {
  --bg: #f4f6f9;
  --surface: #ffffff;
  --surface-alt: #f0f2f6;
  --border: #e0e4eb;
  --text: #1c2333;
  --text-muted: #5b6472;
  --accent: #3457d5;
  --pass: #1e9e5a;
  --fail: #d33d3d;
  --skip: #9a7b1f;
  --warn: #c77d13;
  --shadow: 0 1px 3px rgba(20, 24, 33, 0.08), 0 1px 2px rgba(20, 24, 33, 0.06);
  color-scheme: light;
}
html[data-theme="dark"] {
  --bg: #12141c;
  --surface: #1b1e29;
  --surface-alt: #232734;
  --border: #2d3242;
  --text: #e7e9ee;
  --text-muted: #9aa2b1;
  --accent: #6f8cff;
  --pass: #35c579;
  --fail: #ef5757;
  --skip: #d4ab3a;
  --warn: #e39a3d;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3);
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}
.container { max-width: 1200px; margin: 0 auto; padding: 24px 20px 80px; }

.topbar {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 12px 20px;
  background: var(--surface); border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.topbar__brand { font-weight: 700; font-size: 1.05rem; }
.topbar__controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.search-input {
  padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--surface-alt); color: var(--text); min-width: 200px; font-size: 0.9rem;
}
.filter-group { display: flex; gap: 4px; background: var(--surface-alt); padding: 3px; border-radius: 8px; }
.filter-btn {
  border: none; background: transparent; color: var(--text-muted);
  padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
}
.filter-btn.is-active { background: var(--accent); color: #fff; }
.theme-toggle {
  border: 1px solid var(--border); background: var(--surface-alt); color: var(--text);
  width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 1rem;
}

.dashboard { margin-bottom: 28px; }
.stat-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px; margin-bottom: 14px;
}
.stat-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; box-shadow: var(--shadow);
}
.stat-card__label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin-bottom: 6px; }
.stat-card__value { font-size: 1.35rem; font-weight: 700; }

.progress-bar {
  position: relative; height: 28px; background: var(--surface-alt);
  border-radius: 14px; overflow: hidden; border: 1px solid var(--border);
}
.progress-bar__fill { height: 100%; background: linear-gradient(90deg, var(--pass), #2fd48a); transition: width .3s ease; }
.progress-bar__label {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: 700; color: var(--text);
}

.panel {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 18px 20px; margin-bottom: 22px; box-shadow: var(--shadow);
}
.panel__title { margin: 0 0 14px; font-size: 1.05rem; }

.timeline { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
.timeline__item {
  display: grid; grid-template-columns: 70px 12px 1fr auto; align-items: center; gap: 10px;
  padding: 6px 4px; border-bottom: 1px dashed var(--border); font-size: 0.85rem;
}
.timeline__time { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.timeline__dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-muted); justify-self: center; }
.timeline__dot--passed { background: var(--pass); }
.timeline__dot--failed { background: var(--fail); }
.timeline__dot--skipped { background: var(--skip); }
.timeline__dot--warning { background: var(--warn); }
.timeline__test { color: var(--text-muted); font-size: 0.78rem; text-align: right; }

.badge {
  display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; font-weight: 700;
  padding: 3px 8px; border-radius: 999px; background: var(--surface-alt); color: var(--text-muted);
  text-transform: capitalize;
}
.badge--pass { background: color-mix(in srgb, var(--pass) 18%, transparent); color: var(--pass); }
.badge--fail { background: color-mix(in srgb, var(--fail) 18%, transparent); color: var(--fail); }
.badge--skip { background: color-mix(in srgb, var(--skip) 18%, transparent); color: var(--skip); }
.badge--warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }

.test-card { border: 1px solid var(--border); border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
.test-card__header {
  width: 100%; display: grid; grid-template-columns: auto 1fr auto auto;
  align-items: center; gap: 12px; padding: 12px 16px; background: var(--surface-alt);
  border: none; cursor: pointer; text-align: left; color: var(--text); font-size: 0.95rem;
}
.test-card__titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.test-card__title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.test-card__suite { font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.test-card__meta { color: var(--text-muted); font-size: 0.8rem; white-space: nowrap; }
.test-card__chevron { transition: transform .15s ease; color: var(--text-muted); }
.test-card__header[aria-expanded="true"] .test-card__chevron { transform: rotate(180deg); }
.test-card__body { padding: 16px; border-top: 1px solid var(--border); }
.test-card__description { margin: 0 0 12px; font-size: 0.9rem; color: var(--text); background: var(--surface-alt); border-left: 3px solid var(--accent); padding: 8px 12px; border-radius: 0 6px 6px 0; }
.test-card__timerange { display: flex; gap: 20px; color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px; flex-wrap: wrap; }

.sub-section { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; padding: 10px 12px; background: var(--surface); }
.sub-section summary { cursor: pointer; font-weight: 600; font-size: 0.9rem; }
.sub-section[open] summary { margin-bottom: 10px; }

.step-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.step { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--surface-alt); }
.step--failed { border-color: var(--fail); }
.step__header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.85rem; }
.step__category { text-transform: uppercase; font-size: 0.68rem; letter-spacing: .05em; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; }
.step__name { font-weight: 600; flex: 1; }
.step__time, .step__duration { color: var(--text-muted); font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.step__locator { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; }
.step__error { margin-top: 8px; padding: 8px 10px; background: color-mix(in srgb, var(--fail) 10%, transparent); border-radius: 6px; }
.step__error-message { color: var(--fail); font-weight: 600; font-size: 0.85rem; }
.step__stack { white-space: pre-wrap; font-size: 0.75rem; color: var(--text-muted); max-height: 200px; overflow: auto; margin: 6px 0 0; }
.step__shots { display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap; }

.thumb { border: 1px solid var(--border); background: var(--surface); border-radius: 6px; padding: 4px; cursor: zoom-in; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.thumb img { width: 140px; height: 88px; object-fit: cover; border-radius: 4px; display: block; }
.thumb__caption { font-size: 0.7rem; color: var(--text-muted); }

.failure-panel { border: 1px solid var(--fail); background: color-mix(in srgb, var(--fail) 8%, transparent); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.failure-panel h4 { margin: 0 0 8px; color: var(--fail); }
.failure-panel__message { font-weight: 600; margin-bottom: 6px; }

.video-block { margin-bottom: 14px; }
.video-block h4 { margin: 0 0 8px; }
.video-player { width: 100%; max-height: 480px; border-radius: 8px; background: #000; }

.data-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.data-table th, .data-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
.data-table th { color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; }
.api-url { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.api-row--failed { background: color-mix(in srgb, var(--fail) 8%, transparent); }
.method-tag { font-family: monospace; font-weight: 700; font-size: 0.75rem; }
.data-table pre { max-width: 400px; max-height: 200px; overflow: auto; white-space: pre-wrap; font-size: 0.72rem; }

.logs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.log-group h4 { margin: 0 0 6px; font-size: 0.82rem; }
.log-line { font-size: 0.75rem; font-family: monospace; padding: 3px 0; border-bottom: 1px dotted var(--border); word-break: break-word; }
.log-line__time { color: var(--text-muted); margin-right: 8px; }
.empty-note { color: var(--text-muted); font-size: 0.82rem; font-style: italic; }

.modal {
  position: fixed; inset: 0; background: rgba(10, 12, 18, 0.92); z-index: 100;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.modal[hidden] { display: none; }
.modal__viewport { flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: grab; }
.modal__viewport.is-panning { cursor: grabbing; }
.modal__viewport img { max-width: 90vw; max-height: 78vh; transition: transform .08s ease-out; user-select: none; }
.modal__close { position: absolute; top: 16px; right: 20px; background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer; }
.modal__caption { color: #fff; margin-bottom: 10px; font-size: 0.9rem; }
.modal__hint { color: #9aa2b1; font-size: 0.78rem; padding-bottom: 16px; }

@media (max-width: 720px) {
  .topbar { flex-direction: column; align-items: stretch; }
  .test-card__header { grid-template-columns: 1fr; row-gap: 6px; }
}
`;

// --- Embedded JS ------------------------------------------------------------

const REPORT_JS = `
(function () {
  var STORAGE_KEY = 'test-report-theme';
  var html = document.documentElement;
  var themeToggle = document.getElementById('theme-toggle');

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  var savedTheme = localStorage.getItem(STORAGE_KEY)
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);
  themeToggle.addEventListener('click', function () {
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  });

  // Collapsible test cards.
  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-toggle');
      var body = document.getElementById(targetId);
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      if (body) body.hidden = expanded;
    });
  });

  // Search + status filter.
  var searchInput = document.getElementById('search-input');
  var filterGroup = document.getElementById('filter-group');
  var visibleCount = document.getElementById('visible-count');
  var activeFilter = 'all';

  function applyFilters() {
    var query = (searchInput.value || '').toLowerCase().trim();
    var cards = document.querySelectorAll('.test-card');
    var shown = 0;
    cards.forEach(function (card) {
      var matchesStatus = activeFilter === 'all' || card.getAttribute('data-status') === activeFilter
        || (activeFilter === 'failed' && card.getAttribute('data-status') === 'timedOut');
      var matchesSearch = !query || (card.getAttribute('data-title') || '').indexOf(query) !== -1;
      var visible = matchesStatus && matchesSearch;
      card.style.display = visible ? '' : 'none';
      if (visible) shown += 1;
    });
    if (visibleCount) visibleCount.textContent = String(shown);
  }

  searchInput.addEventListener('input', applyFilters);
  filterGroup.addEventListener('click', function (e) {
    var btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filterGroup.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('is-active'); });
    btn.classList.add('is-active');
    activeFilter = btn.getAttribute('data-filter');
    applyFilters();
  });

  // Screenshot modal: open, zoom (wheel), pan (drag), close (Esc / button / backdrop click).
  var modal = document.getElementById('screenshot-modal');
  var modalImage = document.getElementById('modal-image');
  var modalCaption = document.getElementById('modal-caption');
  var modalViewport = document.getElementById('modal-viewport');
  var modalClose = document.getElementById('modal-close');
  var scale = 1, panX = 0, panY = 0, isPanning = false, startX = 0, startY = 0;

  function resetTransform() {
    scale = 1; panX = 0; panY = 0;
    modalImage.style.transform = 'translate(0px, 0px) scale(1)';
  }
  function updateTransform() {
    modalImage.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
  }
  function openModal(src, caption) {
    modalImage.src = src;
    modalCaption.textContent = caption || '';
    resetTransform();
    modal.hidden = false;
  }
  function closeModal() {
    modal.hidden = true;
    modalImage.src = '';
  }

  document.querySelectorAll('.thumb').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openModal(btn.getAttribute('data-full'), btn.getAttribute('data-caption'));
    });
  });
  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
  modalViewport.addEventListener('wheel', function (e) {
    if (modal.hidden) return;
    e.preventDefault();
    var delta = e.deltaY > 0 ? -0.15 : 0.15;
    scale = Math.min(6, Math.max(1, scale + delta));
    updateTransform();
  }, { passive: false });
  modalViewport.addEventListener('mousedown', function (e) {
    if (scale <= 1) return;
    isPanning = true;
    modalViewport.classList.add('is-panning');
    startX = e.clientX - panX;
    startY = e.clientY - panY;
  });
  window.addEventListener('mousemove', function (e) {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  });
  window.addEventListener('mouseup', function () {
    isPanning = false;
    modalViewport.classList.remove('is-panning');
  });
  modalImage.addEventListener('dblclick', function () {
    if (scale === 1) { scale = 2; } else { resetTransform(); }
    updateTransform();
  });
})();
`;
