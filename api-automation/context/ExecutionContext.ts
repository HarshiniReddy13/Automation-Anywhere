import type { AuthResult, LearningInstance } from '../api/types';


export interface ExecutionContextData {
  authToken?: string;
  refreshToken?: string;
  tokenIssuedAt?: string;
  tokenExpiry?: string;
  tenantUuid?: string;
  userId?: string;
  username?: string;
  learningInstanceId?: string;
  learningInstanceName?: string;
  learningInstanceStatus?: string;
  learningInstanceDomainName?: string;
  learningInstanceCreatedTimestamp?: string;
  learningInstanceRequestPayload?: unknown;
}


export class ExecutionContext {
  private auth?: AuthResult;
  private learningInstance?: {
    id: string;
    name: string;
    status: string;
    domainName: string;
    createdTimestamp: string;
    requestPayload?: unknown;
  };

  // Authentication 

  setAuth(auth: AuthResult): void {
    this.auth = auth;
  }

  getAuth(): AuthResult | undefined {
    return this.auth;
  }

  requireAuthToken(): string {
    if (!this.auth) {
      throw new Error(
        'ExecutionContext.requireAuthToken(): no authentication result stored — call AuthenticationApi.ensureAuthenticated() first.'
      );
    }
    return this.auth.accessToken;
  }

  //  Learning Instance 

  setLearningInstance(instance: LearningInstance, requestPayload?: unknown): void {
    this.learningInstance = {
      id: instance.id,
      name: instance.name,
      status: instance.status,
      domainName: instance.domain?.name ?? '',
      createdTimestamp: new Date().toISOString(),
      requestPayload,
    };
  }

  getLearningInstance() {
    return this.learningInstance;
  }

  requireLearningInstanceId(): string {
    if (!this.learningInstance) {
      throw new Error(
        'ExecutionContext.requireLearningInstanceId(): no Learning Instance stored — call LearningInstanceApi.createInstance() first.'
      );
    }
    return this.learningInstance.id;
  }

  // Serialization 

  toJSON(): ExecutionContextData {
    return {
      authToken: this.auth?.accessToken,
      refreshToken: this.auth?.refreshToken,
      tokenIssuedAt: this.auth?.issuedAt.toISOString(),
      tokenExpiry: this.auth?.expiresAt.toISOString(),
      tenantUuid: this.auth?.tenantUuid,
      userId: this.auth?.userId,
      username: this.auth?.username,
      learningInstanceId: this.learningInstance?.id,
      learningInstanceName: this.learningInstance?.name,
      learningInstanceStatus: this.learningInstance?.status,
      learningInstanceDomainName: this.learningInstance?.domainName,
      learningInstanceCreatedTimestamp: this.learningInstance?.createdTimestamp,
      learningInstanceRequestPayload: this.learningInstance?.requestPayload,
    };
  }

  static fromJSON(data: ExecutionContextData): ExecutionContext {
    const context = new ExecutionContext();

    if (data.authToken && data.tokenIssuedAt && data.tokenExpiry) {
      context.auth = {
        accessToken: data.authToken,
        refreshToken: data.refreshToken,
        issuedAt: new Date(data.tokenIssuedAt),
        expiresAt: new Date(data.tokenExpiry),
        tenantUuid: data.tenantUuid ?? '',
        userId: data.userId ?? '',
        username: data.username ?? '',
      };
    }

    if (data.learningInstanceId && data.learningInstanceName) {
      context.learningInstance = {
        id: data.learningInstanceId,
        name: data.learningInstanceName,
        status: data.learningInstanceStatus ?? '',
        domainName: data.learningInstanceDomainName ?? '',
        createdTimestamp: data.learningInstanceCreatedTimestamp ?? new Date().toISOString(),
        requestPayload: data.learningInstanceRequestPayload,
      };
    }

    return context;
  }
}
