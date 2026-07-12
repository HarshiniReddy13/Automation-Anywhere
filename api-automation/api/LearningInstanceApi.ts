import type { APIRequestContext } from '@playwright/test';
import { ApiClient, type ApiResponse } from './ApiClient';
import { ApiEndpoints, resolvePath } from './endpoints';
import type {
  CreateLearningInstanceRequest,
  Domain,
  LearningInstance,
  LearningInstanceField,
  ListLearningInstancesRequest,
  ListLearningInstancesResponse,
} from './types';

/**
 * Document-type domain IDs for the "Invoices" domain, confirmed via
 * `GET /cognitive/v3/domains` against the live instance on 2026-07-12.
 * These are stable, tenant-independent system domain IDs (the response
 * marks `systemDomain: true`), not account-specific data — safe to use as
 * constants rather than re-fetching `/domains` on every test run. Use
 * `LearningInstanceApi.getDomains()` if you need to resolve a different
 * document type or re-verify these haven't changed.
 */
export const INVOICE_DOMAIN = {
  domainId: '33DED827-3DC4-4201-B478-7C15B94AF522',
  domainName: 'Invoices',
  /** English */
  domainLanguageId: 'B62EFA19-3592-4D2B-910A-E9C1C7DAE1A9',
  /** "Automation Anywhere (Pre-trained)" provider */
  domainLanguageProviderId: 'D6CCA488-207A-4FCA-94E0-74E2FCA38B40',
} as const;

/**
 * One real, working field definition for the Invoices domain (Invoice
 * Number), captured verbatim from a live "Create Learning Instance" UI
 * request. The API rejects a Learning Instance with an empty `fields`
 * array (`IQLI100.learning_instance.has_no_fields`), so at least one real
 * field — not a fabricated one — is required to create a valid instance.
 */
function invoiceNumberField(): LearningInstanceField {
  return {
    name: 'invoice_number',
    displayName: 'Invoice Number',
    dataType: 'TEXT',
    featureType: 'KEY_VALUE',
    confidenceThreshold: 0,
    domainObjectId: 'DF559B75-80E3-4B8E-A4A5-F983E5E37C13',
    defaultAliases: ['invoice number', 'invoice #', 'invoice no', 'inv no'],
    customAliases: [],
    description: '',
    isCustom: false,
    isRequired: true,
    isEnabled: true,
  };
}

/**
 * Learning Instance API — Steps 3 & 4 of Use Case 2.
 *
 * Every endpoint here was confirmed against the live Automation Anywhere
 * Community Edition instance (see `endpoints.ts` for how). All calls send
 * the app's custom `x-authorization: <token>` header — NOT the standard
 * `Authorization: Bearer <token>` — confirmed via live capture.
 */
export class LearningInstanceApi {
  private readonly client: ApiClient;

  constructor(request: APIRequestContext) {
    this.client = new ApiClient(request);
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { 'x-authorization': accessToken };
  }

  /** `GET /cognitive/v3/domains` — document-type domains and their language/provider IDs. */
  async getDomains(accessToken: string): Promise<ApiResponse<Domain[]>> {
    return this.client.get<Domain[]>(ApiEndpoints.LIST_DOMAINS.path, {
      headers: this.authHeaders(accessToken),
      stepName: 'Get Domains',
    });
  }

  /** `GET /cognitive/v3/learninginstances/checkavailability/{name}` */
  async checkNameAvailability(accessToken: string, name: string): Promise<ApiResponse<unknown>> {
    const path = resolvePath(ApiEndpoints.CHECK_NAME_AVAILABILITY.path, { name });
    return this.client.get(path, { headers: this.authHeaders(accessToken), stepName: 'Check Name Availability' });
  }

  /** `POST /cognitive/v3/learninginstances/list` */
  async listInstances(
    accessToken: string,
    overrides: Partial<ListLearningInstancesRequest> = {}
  ): Promise<ApiResponse<ListLearningInstancesResponse>> {
    const body: ListLearningInstancesRequest = {
      filter: { operator: 'and', operands: [] },
      sort: [],
      page: { offset: 0, length: 100 },
      ...overrides,
    };
    return this.client.post<ListLearningInstancesResponse>(ApiEndpoints.LIST_LEARNING_INSTANCES.path, {
      json: body,
      headers: this.authHeaders(accessToken),
      stepName: 'List Learning Instances',
    });
  }

  /**
   * Builds a minimal, valid create payload for an Invoice Learning
   * Instance. Confirmed via direct API testing: this exact minimal shape
   * (a handful of top-level fields plus one real field definition) is
   * sufficient — the browser UI sends a much larger payload (all ~38
   * available fields for the domain) but that's UI convenience, not a
   * server requirement.
   */
  buildInvoiceLearningInstanceRequest(name: string, description = ''): CreateLearningInstanceRequest {
    return {
      name,
      description,
      domainId: INVOICE_DOMAIN.domainId,
      locale: 'en-US',
      domainLanguageId: INVOICE_DOMAIN.domainLanguageId,
      domainLanguageProviderId: INVOICE_DOMAIN.domainLanguageProviderId,
      isHeuristicFeedbackEnabled: true,
      isGenAIEnabled: false,
      useGenai: false,
      isDefault: true,
      isCloudExtraction: false,
      fields: [invoiceNumberField()],
      tables: [],
      rules: [],
    };
  }

  /**
   * `POST /cognitive/v3/learninginstances` — Step 3: Create Learning
   * Instance. Returns HTTP 200 on success (see the note on
   * `ApiEndpoints.CREATE_LEARNING_INSTANCE` — not 201, despite that being
   * the REST convention Use Case 2's spec assumed).
   */
  async createInstance(
    accessToken: string,
    payload: CreateLearningInstanceRequest
  ): Promise<ApiResponse<LearningInstance>> {
    return this.client.post<LearningInstance>(ApiEndpoints.CREATE_LEARNING_INSTANCE.path, {
      json: payload,
      headers: this.authHeaders(accessToken),
      stepName: 'Create Learning Instance',
    });
  }

  /** `GET /cognitive/v3/learninginstances/{id}` — Step 4: retrieve/validate a created instance. */
  async getInstanceById(accessToken: string, id: string): Promise<ApiResponse<LearningInstance>> {
    const path = resolvePath(ApiEndpoints.GET_LEARNING_INSTANCE_BY_ID.path, { id });
    return this.client.get<LearningInstance>(path, {
      headers: this.authHeaders(accessToken),
      stepName: 'Get Learning Instance By Id',
    });
  }

  /** `DELETE /cognitive/v3/learninginstances/{id}` — not part of Use Case 2's steps; used for test cleanup. Returns 204. */
  async deleteInstance(accessToken: string, id: string): Promise<ApiResponse<unknown>> {
    const path = resolvePath(ApiEndpoints.DELETE_LEARNING_INSTANCE.path, { id });
    return this.client.delete(path, { headers: this.authHeaders(accessToken), stepName: 'Delete Learning Instance' });
  }
}
