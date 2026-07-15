import { test, expect } from '@playwright/test';
import { AuthenticationApi } from '../api/AuthenticationApi';
import { LearningInstanceApi, INVOICE_DOMAIN } from '../api/LearningInstanceApi';
import { ApiEndpoints } from '../api/endpoints';
import type { ApiResponse } from '../api/ApiClient';
import type { LearningInstance, CreateLearningInstanceRequest } from '../api/types';
import { ExecutionContext } from '../context/ExecutionContext';
import { CheckpointManager } from '../context/CheckpointManager';
import { ResponseValidator } from '../validators/ResponseValidator';
import { SchemaValidator } from '../validators/SchemaValidator';
import { ConfigManager } from '../utils/ConfigManager';
import { ApiLogger, redactBody } from '../utils/ApiLogger';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LearningInstancesPage } from '../pages/LearningInstancesPage';
import { StepRecorder } from '../../reporting/StepRecorder';


test.describe('Use Case 2: Learning Instance API Automation', () => {
  let context: ExecutionContext;
  let checkpointManager: CheckpointManager;

  test.beforeAll(() => {
    checkpointManager = new CheckpointManager();
    const resumed = checkpointManager.loadContext();
    context = resumed ?? new ExecutionContext();
    if (resumed) {
      ApiLogger.info(
        'Setup',
        `Resuming from checkpoint(s): [${checkpointManager.getCompletedCheckpoints().join(', ')}].`
      );
    }
  });

  test.afterAll(async ({ request }) => {
    const completed = checkpointManager.getCompletedCheckpoints();
    const fullyCompleted = completed.includes('VALIDATION_COMPLETED');

    if (!fullyCompleted) {

      ApiLogger.info(
        'Cleanup',
        `Run did not reach VALIDATION_COMPLETED (reached: [${completed.join(', ')}]) — ` +
          'checkpoint and any created Learning Instance are preserved for the next run to resume from.'
      );
      return;
    }

    const instance = context.getLearningInstance();
    const auth = context.getAuth();
    if (instance && auth) {
      const api = new LearningInstanceApi(request);
      await api.deleteInstance(auth.accessToken, instance.id).catch((error: unknown) => {
        ApiLogger.warn(
          'Cleanup',
          `Failed to delete test Learning Instance ${instance.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
    checkpointManager.clear();
    ApiLogger.info('Cleanup', 'Full run completed successfully — test instance deleted and checkpoint cleared.');
  });

  test('creates and validates a Learning Instance for Invoice documents', async ({ request, page }, testInfo) => {
    const authApi = new AuthenticationApi(request);
    const learningInstanceApi = new LearningInstanceApi(request);
    const config = ConfigManager.get();
    const recorder = new StepRecorder(page, testInfo);

    try {
      const version = page.context().browser()?.version();
      if (version) recorder.setBrowserVersion(version);
    } catch {

    }


    function logApiCall(response: ApiResponse<unknown>, operation?: string, assertions?: string[]): void {
      recorder.logApiCall({
        method: response.method,
        url: response.url,

        requestBody: response.requestBody !== undefined ? JSON.stringify(redactBody(response.requestBody)) : undefined,
        responseBody: JSON.stringify(redactBody(response.body)),
        statusCode: response.status,
        durationMs: response.responseTimeMs,
        timestamp: Date.now(),
        failed: response.status >= 400,
        operation,
        assertions,
      });
    }

    const consoleListener = (msg: { type(): string; text(): string }) => {
      recorder.logConsole({ type: msg.type(), text: msg.text(), timestamp: Date.now() });
    };
    page.on('console', consoleListener);

    try {
      await test.step('Authenticate', async () => {
        if (
          checkpointManager.hasCheckpoint('AUTHENTICATION') &&
          context.getAuth() &&
          !authApi.isExpired(context.getAuth()!)
        ) {
          ApiLogger.info(
            'Authenticate',
            'Checkpoint already reached with a still-valid token — skipping re-authentication.'
          );
          return;
        }


        const { result: auth, response } = await authApi.authenticate({
          username: config.username,
          password: config.password,
        });
        context.setAuth(auth);
        logApiCall(response, 'Authenticate', [
          'HTTP 200 OK',
          'Access token present and non-empty',
          'Token expiry is a valid future timestamp',
          'Authenticated user ID present',
        ]);

        expect(auth.accessToken, 'Access token should exist after authentication').toBeTruthy();
        expect(auth.accessToken.length, 'Access token should not be an empty string').toBeGreaterThan(0);
        expect(auth.expiresAt.getTime(), 'Token expiry should be a valid future timestamp').toBeGreaterThan(
          Date.now()
        );
        expect(auth.userId, 'Authenticated user ID should be present').toBeTruthy();

        checkpointManager.saveCheckpoint('AUTHENTICATION', context);
      });

      await test.step('Identify API Endpoints', async () => {

        ApiLogger.info(
          'Identify API Endpoints',
          Object.entries(ApiEndpoints)
            .map(([key, def]) => `${key}: ${def.method} ${def.path}`)
            .join('\n  ')
        );

        const auth = context.getAuth()!;
        const domainsResponse = await learningInstanceApi.getDomains(auth.accessToken);
        logApiCall(domainsResponse);
        ResponseValidator.validateStatus(domainsResponse, 200, 'Get Domains');
        ResponseValidator.validateContentType(domainsResponse, 'application/json', 'Get Domains');

        const invoiceDomain = domainsResponse.body.find((d) => d.name === INVOICE_DOMAIN.domainName);
        expect(invoiceDomain, `The "${INVOICE_DOMAIN.domainName}" domain should exist in /domains`).toBeDefined();
        expect(
          invoiceDomain?.id,
          'Live Invoices domain ID should match the constant LearningInstanceApi uses to build create payloads'
        ).toBe(INVOICE_DOMAIN.domainId);
      });

      let createdInstance: LearningInstance;
      let createRequestPayload: CreateLearningInstanceRequest;

      await test.step('Create Learning Instance', async () => {
        const existing = context.getLearningInstance();
        if (checkpointManager.hasCheckpoint('LEARNING_INSTANCE_CREATED') && existing) {
          ApiLogger.info(
            'Create Learning Instance',
            `Checkpoint already reached — reusing existing instance "${existing.name}" (${existing.id}) instead of creating a new one.`
          );
          createdInstance = {
            id: existing.id,
            name: existing.name,
            status: existing.status,
            domain: { id: '', version: 1, name: existing.domainName, description: '', systemDomain: true },
            domainVersion: 1,
            description: '',
            fields: [],
            tables: [],
            locale: 'en-US',
            useGenai: false,
            isDefault: true,
            isCloudExtraction: false,
          };
          createRequestPayload = existing.requestPayload as CreateLearningInstanceRequest;
          return;
        }

        const auth = context.getAuth()!;
        const uniqueName = `APITest_Invoice_${Date.now()}`;
        createRequestPayload = learningInstanceApi.buildInvoiceLearningInstanceRequest(
          uniqueName,
          'Created by Use Case 2 API automation (learningInstance.spec.ts)'
        );

        const response = await learningInstanceApi.createInstance(auth.accessToken, createRequestPayload);
        logApiCall(response, 'Create Learning Instance', [
          'HTTP 200 OK (this API returns 200, not 201 — confirmed via live testing)',
          'Response time within budget',
          'Content-Type is application/json',
          'Response schema valid (required fields present, correctly typed)',
          'Created instance name matches the request payload',
          'Document Type is Invoices',
          'Status is present',
        ]);


        ResponseValidator.validateStatus(response, 200, 'Create Learning Instance');
        ResponseValidator.validateResponseTime(response, 'Create Learning Instance');
        ResponseValidator.validateContentType(response, 'application/json', 'Create Learning Instance');

        SchemaValidator.validateLearningInstanceSchema(
          response.body as unknown as Record<string, unknown>,
          'Create Learning Instance Response'
        );

        expect(response.body.name, 'Created instance name should match the request payload').toBe(uniqueName);
        expect(response.body.domain.name, 'Document type should be Invoices').toBe(INVOICE_DOMAIN.domainName);
        expect(response.body.status, 'Created instance should have a status').toBeTruthy();

        createdInstance = response.body;
        context.setLearningInstance(createdInstance, createRequestPayload);
        checkpointManager.saveCheckpoint('LEARNING_INSTANCE_CREATED', context);
      });

      await test.step('Validate Learning Instance', async () => {
        const auth = context.getAuth()!;
        const instanceId = context.requireLearningInstanceId();
        const stored = context.getLearningInstance()!;

        const response = await learningInstanceApi.getInstanceById(auth.accessToken, instanceId);
        logApiCall(response, 'Validate Learning Instance', [
          'HTTP 200 OK',
          'Response schema valid',
          'Retrieved ID matches the created instance',
          'Name matches',
          'Document Type is Invoices',
          'Status matches',
          'Description and locale match the original request payload',
        ]);

        ResponseValidator.validateStatus(response, 200, 'Get Learning Instance By Id');
        ResponseValidator.validateResponseTime(response, 'Get Learning Instance By Id');
        ResponseValidator.validateContentType(response, 'application/json', 'Get Learning Instance By Id');

        SchemaValidator.validateLearningInstanceSchema(
          response.body as unknown as Record<string, unknown>,
          'Get Learning Instance Response'
        );


        expect(response.body.id.toLowerCase(), 'Retrieved instance ID should match the created instance').toBe(
          instanceId.toLowerCase()
        );
        expect(response.body.name, 'Retrieved instance name should match').toBe(stored.name);
        expect(response.body.domain.name, 'Document type should be Invoices').toBe(INVOICE_DOMAIN.domainName);
        expect(response.body.status, 'Status should reflect successful creation').toBe(stored.status);

        const requestPayload = stored.requestPayload as CreateLearningInstanceRequest;
        expect(response.body.description, 'Description should match the original request payload').toBe(
          requestPayload.description
        );
        expect(response.body.locale, 'Locale should match the original request payload').toBe(requestPayload.locale);

        checkpointManager.saveCheckpoint('VALIDATION_COMPLETED', context);
      });

      await test.step('Verify Learning Instance in UI', async () => {
        const stored = context.getLearningInstance()!;
        const loginPage = new LoginPage(page);
        const dashboardPage = new DashboardPage(page);
        const learningInstancesPage = new LearningInstancesPage(page);

        const diagnosisLogs: string[] = [];
        const diagnosisListener = (msg: { type(): string; text(): string }) => {
          diagnosisLogs.push(`[${msg.type()}] ${msg.text()}`);
        };
        page.on('console', diagnosisListener);

        let reauthenticated = false;

        try {
          ApiLogger.info(
            'Verify Learning Instance in UI',
            `Logging into the UI to verify Learning Instance "${stored.name}" (${stored.id}) is visible and correctly displayed. ` +
              'Creation remains 100% API-driven — this step is read-only.'
          );

          await recorder.runStep('Login', 'navigate', async () => {
            await loginPage.open();
            await loginPage.login(config.username, config.password);
            await dashboardPage.assertLoaded();
          });
          await recorder.captureNamedScreenshot('Login');
          ApiLogger.info('Verify Learning Instance in UI', 'UI login successful, dashboard/app shell loaded.');

          await recorder.runStep('Navigate to AI', 'click', async () => {
            await dashboardPage.clickAiNav();
          });

          await recorder.runStep('Navigate to Learning Instances', 'click', async () => {
            await dashboardPage.clickDocumentAutomation();
            await learningInstancesPage.assertLoaded();
          });
          await recorder.captureNamedScreenshot('Learning Instances Page');
          ApiLogger.info(
            'Verify Learning Instance in UI',
            'Navigated AI -> Document Automation; Learning Instances page and table loaded.'
          );

          await recorder.runStep('Search Created Learning Instance', 'custom', async () => {
            await learningInstancesPage.searchByName(stored.name);
          });
          ApiLogger.info('Verify Learning Instance in UI', `Searched for "${stored.name}".`);

          let rowFound = true;
          try {
            await learningInstancesPage.waitForRow(stored.id, 30_000);
          } catch {
            rowFound = false;
          }

          if (!rowFound) {
            const diagnosis = await learningInstancesPage.diagnose(
              { id: stored.id, name: stored.name, status: stored.status, documentType: INVOICE_DOMAIN.domainName },
              diagnosisLogs
            );
            await recorder.runStep('Validate Instance Details', 'assertion', async () => {
              throw new Error(diagnosis);
            });
            return;
          }
          await recorder.captureNamedScreenshot('Created Learning Instance Visible');

          await recorder.runStep('Validate Instance Details', 'assertion', async () => {
            const snapshot = await learningInstancesPage.assertRowMatches({
              id: stored.id,
              name: stored.name,
              status: stored.status,
              documentType: INVOICE_DOMAIN.domainName,
            });
            ApiLogger.info(
              'Verify Learning Instance in UI',
              `UI data matches the API response — name="${snapshot.name}", status="${snapshot.status}", documentType="${snapshot.documentType}".`
            );
          });
          await recorder.captureNamedScreenshot('Validation Successful');

          const { result: freshAuth, response: reauthResponse } = await authApi.authenticate({
            username: config.username,
            password: config.password,
          });
          context.setAuth(freshAuth);
          reauthenticated = true;
          logApiCall(reauthResponse);

          await recorder.runStep(
            'Cleanup Completed',
            'custom',
            async () => {
              const instanceId = context.requireLearningInstanceId();
              const deleteResponse = await learningInstanceApi.deleteInstance(freshAuth.accessToken, instanceId);
              logApiCall(deleteResponse, 'Delete Learning Instance', [
                'HTTP success status (2xx)',
                'Instance removed from the account',
              ]);
              ApiLogger.info(
                'Cleanup',
                `Test Learning Instance ${instanceId} deleted. Checkpoint clearing is still performed by the ` +
                  'afterAll hook (unchanged) so it always runs, even if a step above fails.'
              );
            },
            { screenshots: false }
          );
        } finally {
          page.off('console', diagnosisListener);

          if (!reauthenticated) {
            const { result: freshAuth, response: reauthResponse } = await authApi.authenticate({
              username: config.username,
              password: config.password,
            });
            context.setAuth(freshAuth);
            logApiCall(reauthResponse);
            ApiLogger.info(
              'Verify Learning Instance in UI',
              'Re-authenticated via API to restore a valid token for cleanup (the UI login above invalidated the prior session token).'
            );
          }
        }
      });
    } finally {
      page.off('console', consoleListener);
      await recorder.finalize();
    }
  });
});
