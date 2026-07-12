import { test, expect } from '@playwright/test';
import { AuthenticationApi } from '../api/AuthenticationApi';
import { LearningInstanceApi, INVOICE_DOMAIN } from '../api/LearningInstanceApi';
import { ApiEndpoints } from '../api/endpoints';
import type { LearningInstance, CreateLearningInstanceRequest } from '../api/types';
import { ExecutionContext } from '../context/ExecutionContext';
import { CheckpointManager } from '../context/CheckpointManager';
import { ResponseValidator } from '../validators/ResponseValidator';
import { SchemaValidator } from '../validators/SchemaValidator';
import { ConfigManager } from '../utils/ConfigManager';
import { ApiLogger } from '../utils/ApiLogger';

/**
 * Use Case 2: Learning Instance API Automation.
 *
 * Completely independent of the Use Case 1 UI suite — no imports from
 * `pages/`, `fixtures/baseFixture.ts`, or `tests/rulesBuilder.spec.ts`.
 * Uses Playwright's own built-in `request` fixture (an `APIRequestContext`)
 * rather than a browser page.
 *
 * Error handling note: every `ApiClient` call already logs full
 * request/response detail (URL, headers, bodies, status, timing) via
 * `ApiLogger` the moment a call fails, and `HttpError` carries the
 * complete `ApiResponse` for anything that needs to inspect it — combined
 * with Playwright's own stack trace capture on a failed `expect()`, this
 * satisfies Use Case 2's "Error Handling" section without needing
 * duplicate try/catch scaffolding in the test itself.
 */
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
      // A partial/failed run preserves its checkpoint (and any created
      // instance) so the next run can resume instead of repeating
      // already-completed steps — this IS the "Checkpoint Recovery"
      // behavior, not a cleanup bug.
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

  test('creates and validates a Learning Instance for Invoice documents', async ({ request }) => {
    const authApi = new AuthenticationApi(request);
    const learningInstanceApi = new LearningInstanceApi(request);
    const config = ConfigManager.get();

    await test.step('Authenticate', async () => {
      if (checkpointManager.hasCheckpoint('AUTHENTICATION') && context.getAuth() && !authApi.isExpired(context.getAuth()!)) {
        ApiLogger.info('Authenticate', 'Checkpoint already reached with a still-valid token — skipping re-authentication.');
        return;
      }

      const auth = await authApi.ensureAuthenticated(context, {
        username: config.username,
        password: config.password,
      });

      expect(auth.accessToken, 'Access token should exist after authentication').toBeTruthy();
      expect(auth.accessToken.length, 'Access token should not be an empty string').toBeGreaterThan(0);
      expect(auth.expiresAt.getTime(), 'Token expiry should be a valid future timestamp').toBeGreaterThan(Date.now());
      expect(auth.userId, 'Authenticated user ID should be present').toBeTruthy();

      checkpointManager.saveCheckpoint('AUTHENTICATION', context);
    });

    await test.step('Identify API Endpoints', async () => {
      // Documents every endpoint this flow depends on, and functionally
      // verifies the "Invoices" domain (Use Case 2's Document Type) still
      // resolves to the constants LearningInstanceApi's create payload
      // relies on — catches upstream domain-ID changes instead of a
      // confusing failure two steps later.
      ApiLogger.info(
        'Identify API Endpoints',
        Object.entries(ApiEndpoints)
          .map(([key, def]) => `${key}: ${def.method} ${def.path}`)
          .join('\n  ')
      );

      const auth = context.getAuth()!;
      const domainsResponse = await learningInstanceApi.getDomains(auth.accessToken);
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

      // Confirmed via live testing (browser capture AND a direct minimal-
      // payload API call): this endpoint returns 200 OK on success, not
      // the 201 Created the use case spec assumed. Asserting the real
      // value here rather than the assumed one.
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

      ResponseValidator.validateStatus(response, 200, 'Get Learning Instance By Id');
      ResponseValidator.validateResponseTime(response, 'Get Learning Instance By Id');
      ResponseValidator.validateContentType(response, 'application/json', 'Get Learning Instance By Id');

      SchemaValidator.validateLearningInstanceSchema(
        response.body as unknown as Record<string, unknown>,
        'Get Learning Instance Response'
      );

      // Functional validation: the instance exists, and every field
      // matches what was actually created/requested.
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
  });
});
