import { Locator, Page, expect } from '@playwright/test';

/**
 * Cross-cutting, framework-agnostic helper functions.
 * Keep these pure and reusable — no page-specific logic belongs here.
 */

/** Generate a unique, human-readable name (e.g. "AutoForm_20260711_143512_842"). */
export function uniqueName(prefix: string): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `_${pad(now.getMilliseconds(), 3)}`;
  return `${prefix}_${stamp}`;
}

/**
 * Perform a robust HTML5 drag-and-drop from source to target.
 *
 * Playwright's `dragTo` covers most cases, but many canvas/palette UIs
 * (including low-code form designers) rely on granular mouse events. This helper
 * falls back to a manual mouse gesture so it works with both implementations.
 */
export async function dragAndDrop(
  page: Page,
  source: Locator,
  target: Locator,
  opts: { steps?: number; offset?: { x: number; y: number } } = {}
): Promise<void> {
  const steps = opts.steps ?? 10;

  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    // Fallback to Playwright's built-in when geometry is unavailable.
    await source.dragTo(target);
    return;
  }

  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const end = {
    x: targetBox.x + targetBox.width / 2 + (opts.offset?.x ?? 0),
    y: targetBox.y + targetBox.height / 2 + (opts.offset?.y ?? 0),
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Move in steps so drag-over handlers fire consistently.
  await page.mouse.move(end.x, end.y, { steps });
  // A nudge helps some libraries register the drop position.
  await page.mouse.move(end.x + 1, end.y + 1, { steps: 2 });
  await page.mouse.up();
}

/**
 * Select an option from a custom (non-native) dropdown by visible text.
 * Handles the common pattern: click trigger -> option list appears -> click option.
 */
export async function selectFromCustomDropdown(
  trigger: Locator,
  option: Locator
): Promise<void> {
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(option).toBeVisible();
  await option.click();
}

/** Retry an async assertion block until it passes or the timeout elapses. */
export async function pollUntil(
  fn: () => Promise<void>,
  { timeout = 10_000, interval = 250 }: { timeout?: number; interval?: number } = {}
): Promise<void> {
  await expect(async () => {
    await fn();
  }).toPass({ timeout, intervals: [interval] });
}

/** Type into a field deterministically: clear first, then fill (auto-waits). */
export async function setFieldValue(field: Locator, value: string): Promise<void> {
  await expect(field).toBeVisible();
  await field.fill('');
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

/**
 * Fill a field and confirm the value actually stuck, re-filling (not just
 * re-asserting) if it didn't. Some custom inputs in the Rules Builder remount
 * shortly after an adjacent dropdown closes (e.g. the action value field
 * right after the target picker's dropdown closes) — a `.fill()` landing
 * just before that remount visually shows the typed text but silently
 * reverts to empty once the remount happens, since it never reached the new
 * DOM node. A plain `expect(field).toHaveValue(...)` keeps re-checking the
 * same (now-empty) value forever in that case; this retries the fill itself.
 */
export async function fillReliably(field: Locator, value: string, attempts = 4): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await field.fill(value);
    const stuck = await field
      .evaluate((el: HTMLInputElement, expected: string) => el.value === expected, value)
      .catch(() => false);
    if (stuck) return;
    await field.page().waitForTimeout(300);
  }
  // Out of retries — do one last fill so the caller's own assertion (if any)
  // fails with a clear, real "value never stuck" signal rather than this
  // helper swallowing the problem.
  await field.fill(value);
}
