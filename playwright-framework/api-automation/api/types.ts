/**
 * Shared type definitions for the Learning Instance API automation module.
 *
 * All shapes here were captured from the *real* Automation Anywhere
 * Community Edition Document Automation (IQ Bot) API by driving the live
 * UI and inspecting network traffic — none of this was guessed. See the
 * "confirmed via live capture" comments in `endpoints.ts` and
 * `LearningInstanceApi.ts` for exactly how each field was verified.
 */

// --- Authentication -----------------------------------------------------------

export interface AuthCredentials {
  username: string;
  password: string;
}

/** Raw shape returned by `POST /v2/authentication`. */
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
  /**
   * Present in the payload but observed to always be `0` in practice —
   * do NOT rely on this for expiry. The token's own JWT `exp` claim is the
   * only reliable source (see AuthenticationApi.decodeTokenExpiry).
   */
  ttlSeconds: number;
  changePasswordToken: string;
}

/** Normalized authentication result stored in the ExecutionContext. */
export interface AuthResult {
  accessToken: string;
  /**
   * This API does not issue a refresh token (confirmed: `RawAuthResponse`
   * has no such field). Kept as an explicit `undefined`-able property,
   * rather than omitted, so callers can see this was a deliberate check,
   * not an oversight — re-authentication is the only path when expired.
   */
  refreshToken: string | undefined;
  issuedAt: Date;
  expiresAt: Date;
  tenantUuid: string;
  userId: string;
  username: string;
}

// --- Domains (Document Types) --------------------------------------------------

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

/** Shape returned by `GET /cognitive/v3/domains` — one entry per document type. */
export interface Domain {
  id: string;
  version: number;
  name: string;
  description: string;
  systemDomain: boolean;
  languageProviders: DomainLanguage[];
}

// --- Learning Instances ---------------------------------------------------------

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

/** Body for `POST /cognitive/v3/learninginstances`. */
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

/** Response shape for both create (`POST`) and get-by-id (`GET .../{id}`). */
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

/** One row of `POST /cognitive/v3/learninginstances/list`'s `list` array — richer than the create/get response. */
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
