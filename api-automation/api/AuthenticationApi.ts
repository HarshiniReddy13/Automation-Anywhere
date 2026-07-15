import type { APIRequestContext } from '@playwright/test';
import { ApiClient, type ApiResponse } from './ApiClient';
import { ApiEndpoints } from './endpoints';
import { ApiLogger } from '../utils/ApiLogger';
import { ConfigManager } from '../utils/ConfigManager';
import type { AuthCredentials, AuthResult, RawAuthResponse } from './types';
import type { ExecutionContext } from '../context/ExecutionContext';


export class AuthenticationApi {
  private readonly client: ApiClient;

  constructor(request: APIRequestContext) {
    this.client = new ApiClient(request);
  }

  async authenticate(credentials: AuthCredentials): Promise<{ result: AuthResult; response: ApiResponse<RawAuthResponse> }> {
    const config = ConfigManager.get();
    const response = await this.client.post<RawAuthResponse>(ApiEndpoints.AUTHENTICATE.path, {
      json: { username: credentials.username, password: credentials.password },
      stepName: 'Authenticate',
    });

    if (response.status !== 200) {
      throw new Error(
        `Authentication failed: expected HTTP 200, got ${response.status} ${response.statusText}. ` +
          `Body: ${response.rawText.slice(0, 500)}`
      );
    }
    if (response.responseTimeMs > config.maxAcceptableResponseTimeMs) {
      ApiLogger.warn(
        'Authenticate',
        `Response time ${response.responseTimeMs}ms exceeded the ${config.maxAcceptableResponseTimeMs}ms budget.`
      );
    }
    if (!response.body?.token || response.body.token.trim() === '') {
      throw new Error('Authentication succeeded (HTTP 200) but no access token was present in the response body.');
    }

    const { issuedAt, expiresAt } = this.decodeTokenTimestamps(response.body.token);
    if (expiresAt.getTime() <= Date.now()) {
      throw new Error(`Authentication returned a token that is already expired (exp=${expiresAt.toISOString()}).`);
    }

    const result: AuthResult = {
      accessToken: response.body.token,
      refreshToken: undefined, 
      issuedAt,
      expiresAt,
      tenantUuid: response.body.tenantUuid,
      userId: response.body.user.id,
      username: response.body.user.username,
    };

    ApiLogger.info(
      'Authenticate',
      `Token acquired for "${result.username}", valid until ${result.expiresAt.toISOString()}.`
    );

    return { result, response };
  }

  async ensureAuthenticated(context: ExecutionContext, credentials: AuthCredentials): Promise<AuthResult> {
    const existing = context.getAuth();
    if (existing && !this.isExpired(existing)) {
      ApiLogger.info('Authenticate', `Reusing cached token for "${existing.username}" (no new API call made).`);
      return existing;
    }

    if (existing) {
      ApiLogger.info('Authenticate', 'Cached token is missing or expired — re-authenticating.');
    }

    const { result } = await this.authenticate(credentials);
    context.setAuth(result);
    return result;
  }

  isExpired(auth: AuthResult): boolean {
    const bufferMs = ConfigManager.get().tokenExpiryBufferSeconds * 1000;
    return Date.now() >= auth.expiresAt.getTime() - bufferMs;
  }


  private decodeTokenTimestamps(token: string): { issuedAt: Date; expiresAt: Date } {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('decodeTokenTimestamps: token does not look like a JWT (expected 3 dot-separated parts).');
    }
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as { iat?: number; exp?: number };
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      throw new Error('decodeTokenTimestamps: token payload is missing numeric "iat"/"exp" claims.');
    }
    return { issuedAt: new Date(payload.iat * 1000), expiresAt: new Date(payload.exp * 1000) };
  }
}
