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


export const INVOICE_DOMAIN = {
  domainId: '33DED827-3DC4-4201-B478-7C15B94AF522',
  domainName: 'Invoices',
  domainLanguageId: 'B62EFA19-3592-4D2B-910A-E9C1C7DAE1A9',
  domainLanguageProviderId: 'D6CCA488-207A-4FCA-94E0-74E2FCA38B40',
} as const;


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


export class LearningInstanceApi {
  private readonly client: ApiClient;

  constructor(request: APIRequestContext) {
    this.client = new ApiClient(request);
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { 'x-authorization': accessToken };
  }

  async getDomains(accessToken: string): Promise<ApiResponse<Domain[]>> {
    return this.client.get<Domain[]>(ApiEndpoints.LIST_DOMAINS.path, {
      headers: this.authHeaders(accessToken),
      stepName: 'Get Domains',
    });
  }

  async checkNameAvailability(accessToken: string, name: string): Promise<ApiResponse<unknown>> {
    const path = resolvePath(ApiEndpoints.CHECK_NAME_AVAILABILITY.path, { name });
    return this.client.get(path, { headers: this.authHeaders(accessToken), stepName: 'Check Name Availability' });
  }

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

  async getInstanceById(accessToken: string, id: string): Promise<ApiResponse<LearningInstance>> {
    const path = resolvePath(ApiEndpoints.GET_LEARNING_INSTANCE_BY_ID.path, { id });
    return this.client.get<LearningInstance>(path, {
      headers: this.authHeaders(accessToken),
      stepName: 'Get Learning Instance By Id',
    });
  }

  async deleteInstance(accessToken: string, id: string): Promise<ApiResponse<unknown>> {
    const path = resolvePath(ApiEndpoints.DELETE_LEARNING_INSTANCE.path, { id });
    return this.client.delete(path, { headers: this.authHeaders(accessToken), stepName: 'Delete Learning Instance' });
  }
}
