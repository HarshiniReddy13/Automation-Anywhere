

export interface AuthCredentials {
  username: string;
  password: string;
}


export interface RawAuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    roles: Array<{ id: string; name: string }>;
    [key: string]: unknown;
  };
  permissions: Array<{ action: string; resourceType: string }>;
  tenantUuid: string;

  ttlSeconds: number;
  changePasswordToken: string;
}

export interface AuthResult {
  accessToken: string;

  refreshToken: string | undefined;
  issuedAt: Date;
  expiresAt: Date;
  tenantUuid: string;
  userId: string;
  username: string;
}


export interface LanguageProvider {
  id: string;
  name: string;
  isExternal: boolean;
}

export interface DomainLanguage {
  languageId: string;
  name: string;
  providers: LanguageProvider[];
}

export interface Domain {
  id: string;
  version: number;
  name: string;
  description: string;
  systemDomain: boolean;
  languageProviders: DomainLanguage[];
}

// Learning Instances 

export type LearningInstanceStatus = 'PRIVATE' | 'PUBLISHED' | string;

export interface LearningInstanceField {
  name: string;
  displayName: string;
  dataType: string;
  featureType: string;
  confidenceThreshold: number;
  domainObjectId: string;
  defaultAliases?: string[];
  customAliases?: string[];
  description?: string;
  isCustom: boolean;
  isRequired: boolean;
  isEnabled: boolean;
  [key: string]: unknown;
}


export interface CreateLearningInstanceRequest {
  name: string;
  description: string;
  domainId: string;
  locale: string;
  domainLanguageId: string;
  domainLanguageProviderId: string;
  isHeuristicFeedbackEnabled: boolean;
  isGenAIEnabled: boolean;
  useGenai: boolean;
  isDefault: boolean;
  isCloudExtraction: boolean;
  fields: LearningInstanceField[];
  tables: unknown[];
  rules: unknown[];
}


export interface LearningInstance {
  id: string;
  domainVersion: number;
  name: string;
  description: string;
  domain: {
    id: string;
    version: number;
    name: string;
    description: string;
    systemDomain: boolean;
  };
  status: LearningInstanceStatus;
  fields: LearningInstanceField[];
  tables: unknown[];
  locale: string;
  useGenai: boolean;
  isDefault: boolean;
  isCloudExtraction: boolean;
  [key: string]: unknown;
}


export interface LearningInstanceListItem {
  id: string;
  name: string;
  description: string;
  providerId: string;
  providerName: string;
  processStatus: LearningInstanceStatus;
  domainId: string;
  domainName: string;
  createdBy: number;
  createdOn: string;
  updatedBy: number;
  updatedOn: string;
  locale: string;
  [key: string]: unknown;
}

export interface ListLearningInstancesRequest {
  filter: {
    operator: 'and' | 'or';
    operands: Array<{ field: string; operator: string; value: unknown }>;
  };
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>;
  page: { offset: number; length: number };
}

export interface ListLearningInstancesResponse {
  page: { offset: number; total: number; totalFilter: number };
  list: LearningInstanceListItem[];
}
