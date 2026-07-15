import type { ApiCallRecord, ExecutionSummary, TestReportEntry, UseCaseId } from './types';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function escError(value: unknown): string {
  return esc(stripAnsi(String(value ?? '')));
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


function renderDashboard(summary: ExecutionSummary): string {
  const cards: Array<[string, string]> = [
    ['Execution Date', esc(summary.executionDate)],
    ['Execution Time', esc(summary.executionTime)],
    ['Total Test Cases', String(summary.totalTests)],
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


function renderKeyScreenshots(tests: TestReportEntry[]): string {
  const shots = tests.flatMap((t) => t.namedScreenshots).filter((s): s is { label: string; base64: string } => !!s.base64);

  if (shots.length === 0) {
    return `
    <div class="key-shots">
      <h3>Key Screenshots</h3>
      <p class="empty-note">No milestone screenshots captured for this run.</p>
    </div>`;
  }

  const cardsHtml = shots
    .map((s) => {
      const src = `data:image/png;base64,${s.base64}`;
      return `
      <button type="button" class="key-shot-card" data-full="${src}" data-caption="${esc(s.label)}">
        <img src="${src}" alt="${esc(s.label)}" loading="lazy" />
        <span class="key-shot-card__label">${esc(s.label)}</span>
      </button>`;
    })
    .join('');

  return `
  <div class="key-shots">
    <h3>Key Screenshots</h3>
    <div class="key-shots__grid">${cardsHtml}</div>
  </div>`;
}


function renderApiValidationSummary(apiCalls: ApiCallRecord[], sectionId: string): string {
  const keyCalls = apiCalls.filter((c) => c.operation);

  if (keyCalls.length === 0) {
    return `
    <div class="api-summary">
      <h3>API Validation Summary</h3>
      <p class="empty-note">No API operations recorded for this run.</p>
    </div>`;
  }

  const rows = keyCalls
    .map((c, i) => {
      const rowId = `${sectionId}-api-${i}`;
      const resultOk = !c.failed;
      return `
      <tr class="api-summary__row" data-toggle="${rowId}" role="button" tabindex="0">
        <td>${esc(c.operation)}</td>
        <td><span class="method-tag">${esc(c.method)}</span></td>
        <td>${c.statusCode}</td>
        <td>${c.durationMs}ms</td>
        <td><span class="${resultOk ? 'badge badge--pass' : 'badge badge--fail'}">${resultOk ? 'PASS' : 'FAIL'}</span></td>
        <td class="api-summary__expand-icon">▾</td>
      </tr>
      <tr class="api-summary__detail-row" id="${rowId}">
        <td colspan="6">
          <div class="api-summary__detail">
            ${c.assertions?.length ? `<div class="api-summary__assertions"><strong>Assertions Performed</strong><ul>${c.assertions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
            <div class="api-summary__payloads">
              <div><strong>Request Payload</strong><pre>${c.requestBody ? esc(c.requestBody).slice(0, 3000) : '—'}</pre></div>
              <div><strong>Response Payload</strong><pre>${c.responseBody ? esc(c.responseBody).slice(0, 3000) : '—'}</pre></div>
            </div>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  return `
  <div class="api-summary">
    <h3>API Validation Summary</h3>
    <table class="api-summary__table">
      <thead>
        <tr><th>API Operation</th><th>Method</th><th>Status</th><th>Response Time</th><th>Result</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}


const USE_CASE_SECTIONS: Array<{ id: Exclude<UseCaseId, 'UNASSIGNED'>; label: string; accent: string }> = [
  { id: 'UC1', label: 'Use Case 1: Form with Rules Builder (UI Automation)', accent: 'uc1' },
  { id: 'UC2', label: 'Use Case 2: Learning Instance API Flow (API Automation)', accent: 'uc2' },
];

function renderFailurePanel(test: TestReportEntry): string {
  const shot = test.failureScreenshotBase64
    ? `<button type="button" class="thumb" data-full="data:image/png;base64,${test.failureScreenshotBase64}" data-caption="Failure screenshot">
         <img src="data:image/png;base64,${test.failureScreenshotBase64}" alt="Failure screenshot" loading="lazy" />
         <span class="thumb__caption">Failure screenshot</span>
       </button>`
    : '';
  return `
  <div class="failure-panel">
    <h4>Failure Details</h4>
    <div class="failure-panel__message">${escError(test.errorMessage ?? 'No error message captured.')}</div>
    ${test.errorStack ? `<pre class="step__stack">${escError(test.errorStack)}</pre>` : ''}
    ${shot ? `<div class="step__shots">${shot}</div>` : ''}
  </div>`;
}


function renderUseCaseRecording(tests: TestReportEntry[]): string {
  const withVideo = tests.find((t) => t.videoBase64);
  if (!withVideo) return '';
  const mime = withVideo.videoMimeType ?? 'video/webm';
  return `
  <div class="video-block">
    <h3>Screen Recording</h3>
    <video controls preload="metadata" class="video-player">
      <source src="data:${mime};base64,${withVideo.videoBase64}" type="${mime}" />
      Your browser does not support embedded video playback.
    </video>
  </div>`;
}


function renderUseCaseSection(sectionId: 'UC1' | 'UC2', label: string, accent: string, tests: TestReportEntry[]): string {
  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;

  const body =
    tests.length === 0
      ? '<p class="empty-note">This use case has not been executed yet — run its test suite to populate this section.</p>'
      : `
    ${renderUseCaseRecording(tests)}
    ${renderKeyScreenshots(tests)}
    ${sectionId === 'UC2' ? renderApiValidationSummary(tests.flatMap((t) => t.apiCalls), sectionId) : ''}
    ${tests.some((t) => t.status === 'failed' || t.status === 'timedOut') ? renderFailurePanel(tests.find((t) => t.status === 'failed' || t.status === 'timedOut')!) : ''}`;

  return `
  <section class="usecase-section usecase-section--${accent}" id="${esc(sectionId)}">
    <button type="button" class="usecase-section__header" aria-expanded="true" data-toggle="${esc(sectionId)}-body">
      <span class="usecase-section__title">${esc(label)}</span>
      <span class="usecase-section__badge-row">
        ${tests.length ? `<span class="${statusBadgeClass(failed > 0 ? 'failed' : 'passed')}">${failed > 0 ? `${failed} failed` : 'all passed'}</span>` : '<span class="badge badge--skip">not run</span>'}
        <span class="usecase-section__chevron">▾</span>
      </span>
    </button>
    <div class="usecase-section__body" id="${esc(sectionId)}-body">
      ${body}
    </div>
  </section>`;
}



export function generateHtmlReport(summary: ExecutionSummary, tests: TestReportEntry[]): string {
  const grouped = new Map<string, TestReportEntry[]>();
  for (const t of tests) {
    const id = t.useCase?.id ?? 'UNASSIGNED';
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(t);
  }

  const sectionsHtml = USE_CASE_SECTIONS.map(({ id, label, accent }) =>
    renderUseCaseSection(id, label, accent, grouped.get(id) ?? [])
  ).join('\n');

  const navLinks: Array<[string, string]> = USE_CASE_SECTIONS.map((s): [string, string] => [`#${s.id}`, s.label.split(':')[0]]);
  const subNavHtml = navLinks.map(([href, text]) => `<a href="${href}" class="subnav__link">${esc(text)}</a>`).join('');

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Automation Anywhere Assignment Report — ${esc(summary.executionDate)} ${esc(summary.executionTime)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <header class="topbar">
    <div class="topbar__brand">Automation Anywhere Assignment Report</div>
    <div class="topbar__controls">
      <div class="filter-group" id="filter-group">
        <button type="button" class="filter-btn is-active" data-filter="all">All</button>
        <button type="button" class="filter-btn" data-filter="passed">Passed</button>
        <button type="button" class="filter-btn" data-filter="failed">Failed</button>
      </div>
      <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Toggle dark mode">☀️</button>
    </div>
  </header>

  <nav class="subnav">${subNavHtml}</nav>

  <main class="container">
    ${renderDashboard(summary)}
    ${sectionsHtml}
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
  --uc1-accent: #3457d5;
  --uc2-accent: #8a3fd1;
  --other-accent: #5b6472;
  color-scheme: light;
}
html[data-theme="dark"] {
  --bg: #0f1117;
  --surface: #171a24;
  --surface-alt: #1f232f;
  --border: #2d3242;
  --text: #e7e9ee;
  --text-muted: #9aa2b1;
  --accent: #6f8cff;
  --pass: #35c579;
  --fail: #ef5757;
  --skip: #d4ab3a;
  --warn: #e39a3d;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3);
  --uc1-accent: #7d95ff;
  --uc2-accent: #c187f0;
  --other-accent: #9aa2b1;
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
.container { max-width: 1200px; margin: 0 auto; padding: 20px 20px 60px; }

.topbar {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 12px 20px;
  background: var(--surface); border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.topbar__brand { font-weight: 800; font-size: 1.1rem; letter-spacing: -0.01em; }
.topbar__controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
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
.subnav {
  position: sticky; top: 57px; z-index: 39;
  display: flex; gap: 4px; flex-wrap: wrap; padding: 8px 20px;
  background: var(--surface-alt); border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
}
.subnav__link { color: var(--text-muted); text-decoration: none; padding: 4px 10px; border-radius: 6px; font-weight: 600; }
.subnav__link:hover { background: var(--surface); color: var(--text); }

.dashboard { margin-bottom: 20px; }
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
  position: relative; height: 26px; background: var(--surface-alt);
  border-radius: 14px; overflow: hidden; border: 1px solid var(--border);
}
.progress-bar__fill { height: 100%; background: linear-gradient(90deg, var(--pass), #2fd48a); transition: width .3s ease; }
.progress-bar__label {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 700; color: var(--text);
}

.badge {
  display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; font-weight: 700;
  padding: 3px 8px; border-radius: 999px; background: var(--surface-alt); color: var(--text-muted);
  text-transform: capitalize;
}
.badge--pass { background: color-mix(in srgb, var(--pass) 18%, transparent); color: var(--pass); }
.badge--fail { background: color-mix(in srgb, var(--fail) 18%, transparent); color: var(--fail); }
.badge--skip { background: color-mix(in srgb, var(--skip) 18%, transparent); color: var(--skip); }
.badge--warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }

.usecase-section {
  border-radius: 14px; margin-bottom: 22px; overflow: hidden;
  border: 1px solid var(--border); box-shadow: var(--shadow);
  border-left: 6px solid var(--other-accent);
}
.usecase-section--uc1 { border-left-color: var(--uc1-accent); }
.usecase-section--uc2 { border-left-color: var(--uc2-accent); }
.usecase-section__header {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 16px 22px; background: var(--surface); border: none; cursor: pointer; text-align: left;
}
.usecase-section--uc1 .usecase-section__header { background: color-mix(in srgb, var(--uc1-accent) 12%, var(--surface)); }
.usecase-section--uc2 .usecase-section__header { background: color-mix(in srgb, var(--uc2-accent) 12%, var(--surface)); }
.usecase-section__title { font-size: 1.1rem; font-weight: 800; color: var(--text); }
.usecase-section__badge-row { display: flex; align-items: center; gap: 10px; }
.usecase-section__chevron { transition: transform .2s ease; color: var(--text-muted); }
.usecase-section__header[aria-expanded="true"] .usecase-section__chevron { transform: rotate(180deg); }
.usecase-section__body {
  padding: 18px 22px; background: var(--surface);
  max-height: 20000px; opacity: 1; overflow: hidden;
  transition: max-height .35s ease, opacity .25s ease, padding .25s ease;
}
.usecase-section__body.is-collapsed { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }

.usecase-section__body > * + * { margin-top: 20px; }
.usecase-section__body h3 { margin: 0 0 10px; font-size: 0.98rem; font-weight: 700; }

.video-block h3 { margin-bottom: 8px; }
.video-player { width: 100%; max-height: 440px; border-radius: 10px; background: #000; }

.key-shots__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.key-shot-card {
  border: 1px solid var(--border); background: var(--surface-alt); border-radius: 10px; padding: 6px;
  cursor: zoom-in; display: flex; flex-direction: column; gap: 6px; text-align: left;
  transition: transform .15s ease, box-shadow .15s ease;
}
.key-shot-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.key-shot-card img { width: 100%; aspect-ratio: 16/10; object-fit: cover; border-radius: 6px; display: block; }
.key-shot-card__label { font-size: 0.78rem; font-weight: 600; padding: 0 2px 2px; }

.api-summary__table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.api-summary__table th { text-align: left; padding: 8px; color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; border-bottom: 1px solid var(--border); }
.api-summary__row { cursor: pointer; }
.api-summary__row td { padding: 10px 8px; border-bottom: 1px solid var(--border); }
.api-summary__row:hover { background: var(--surface-alt); }
.api-summary__expand-icon { color: var(--text-muted); transition: transform .2s ease; }
.api-summary__row[aria-expanded="true"] .api-summary__expand-icon { transform: rotate(180deg); }
.api-summary__detail-row td { padding: 0; border-bottom: 1px solid var(--border); }
.api-summary__detail {
  background: var(--surface-alt); padding: 14px 16px;
  max-height: 0; overflow: hidden; opacity: 0;
  transition: max-height .3s ease, opacity .2s ease, padding .2s ease;
}
.api-summary__detail-row.is-expanded .api-summary__detail { max-height: 2000px; opacity: 1; }
.api-summary__assertions ul { margin: 6px 0 0; padding-left: 18px; }
.api-summary__assertions li { font-size: 0.82rem; margin-bottom: 3px; }
.api-summary__payloads { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
.api-summary__payloads pre { max-height: 220px; overflow: auto; white-space: pre-wrap; font-size: 0.72rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px; margin: 6px 0 0; }
.method-tag { font-family: monospace; font-weight: 700; font-size: 0.75rem; }

.failure-panel { border: 1px solid var(--fail); background: color-mix(in srgb, var(--fail) 8%, transparent); border-radius: 8px; padding: 12px 14px; }
.failure-panel h4 { margin: 0 0 8px; color: var(--fail); }
.failure-panel__message { font-weight: 600; margin-bottom: 6px; font-size: 0.88rem; }
.step__stack { white-space: pre-wrap; font-size: 0.75rem; color: var(--text-muted); max-height: 200px; overflow: auto; margin: 6px 0 0; }
.step__shots { display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap; }

.thumb { border: 1px solid var(--border); background: var(--surface); border-radius: 6px; padding: 4px; cursor: zoom-in; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.thumb img { width: 140px; height: 88px; object-fit: cover; border-radius: 4px; display: block; }
.thumb__caption { font-size: 0.7rem; color: var(--text-muted); }

.empty-note { color: var(--text-muted); font-size: 0.85rem; font-style: italic; margin: 0; }

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
  .usecase-section__header { flex-direction: column; align-items: flex-start; }
  .api-summary__payloads { grid-template-columns: 1fr; }
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
  var savedTheme = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(savedTheme);
  themeToggle.addEventListener('click', function () {
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  });

  // Collapsible use-case sections / expandable API rows (smooth max-height/opacity transition via CSS class).
  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-toggle');
      var body = document.getElementById(targetId);
      if (!body) return;
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      if (body.classList.contains('api-summary__detail-row')) {
        body.classList.toggle('is-expanded', !expanded);
      } else {
        body.classList.toggle('is-collapsed', expanded);
      }
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });

  // Status filter — applies to API Validation Summary rows (Key Screenshots have no pass/fail status of their own).
  var filterGroup = document.getElementById('filter-group');
  var activeFilter = 'all';

  function applyFilters() {
    document.querySelectorAll('.api-summary__row').forEach(function (row) {
      var visible = activeFilter === 'all'
        || (activeFilter === 'passed' && row.querySelector('.badge--pass'))
        || (activeFilter === 'failed' && row.querySelector('.badge--fail'));
      row.style.display = visible ? '' : 'none';
      var detailRow = document.getElementById(row.getAttribute('data-toggle'));
      if (detailRow && !visible) detailRow.style.display = 'none';
      else if (detailRow) detailRow.style.display = '';
    });
  }

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

  document.querySelectorAll('.thumb, .key-shot-card').forEach(function (btn) {
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
