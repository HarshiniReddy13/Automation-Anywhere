import { chromium } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { environment } from './config/environment';


const STORAGE_STATE_PATH = '.auth/storageState.json';


export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch({ headless: environment.headless });

  const context = await browser.newContext({
    baseURL: environment.baseUrl,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);


  await loginPage.open();
  if (await loginPage.isLoginFormPresent()) {
    await loginPage.login();
  }
  try {
    await homePage.assertLoaded();
  } catch (e) {
    await page.screenshot({ path: 'test-results/global-setup-failure.png' });
    throw e;
  }

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
