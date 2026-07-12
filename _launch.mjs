import { chromium } from '@playwright/test';
console.log('launching...');
try {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.setContent('<h1>hi</h1>');
  console.log('CONTENT_LEN', (await p.content()).length);
  await b.close();
  console.log('OK');
} catch (e) {
  console.log('LAUNCH_ERROR:', String(e).split('\n').slice(0,6).join('\n'));
}
