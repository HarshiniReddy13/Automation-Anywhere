import { chromium } from '@playwright/test';
const t=Date.now();
try{
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.setContent('<h1>hi</h1>');
  console.log('CONTENT_LEN', (await p.content()).length, 'ms', Date.now()-t);
  await b.close();
  console.log('OK');
}catch(e){ console.log('ERR:', String(e).split('\n').slice(0,8).join(' | ')); }
