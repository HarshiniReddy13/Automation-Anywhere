import type { APIRequestContext } from '@playwright/test';
import { ApiLogger } from '../utils/ApiLogger';
import { RetryHelper, type RetryOptions } from '../utils/RetryHelper';
import { ConfigManager } from '../utils/ConfigManager';

/** Normalized response shape every ApiClient call resolves to — HTTP status, headers, body, and timing. */
export interface ApiResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: T;
  /** Raw response text, kept alongside the parsed body in case a caller needs it (e.g. non-JSON responses). */
  rawText: string;
  responseTimeMs: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
}

export interface ApiRequestOptions {
  headers?: Record<string, string>;
  /** Sent as a JSON body (auto-stringified) — mutually exclusive with `data` if you need a non-JSON payload. */
  json?: unknown;
  /** Step name for logging; defaults to `"{METHOD} {path}"` when omitted. */
  stepName?: string;
  /** Per-call retry override; defaults to ConfigManager's settings. */
  retry?: Partial<RetryOptions>;
  /** Skip retry entirely for this call (e.g. deliberately-invalid requests in negative tests). */
  disableRetry?: boolean;
}

/**
 * Thin, typed wrapper around Playwright's `APIRequestContext`.
 *
 * Every call automatically: logs full request/response detail via
 * `ApiLogger`, retries transient failures via `RetryHelper`, measures
 * response time, and normalizes the result into `ApiResponse<T>` so
 * validators/tests never touch Playwright's raw `APIResponse` directly.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string = ConfigManager.get().baseUrl
  ) {}

  async get<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    return this.execute<T>('GET', path, options);
  }

  async post<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    return this.execute<T>('POST', path, options);
  }

  async put<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    return this.execute<T>('PUT', path, options);
  }

  async delete<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    return this.execute<T>('DELETE', path, options);
  }

  private async execute<T>(
    method: string,
    path: string,
    options: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const config = ConfigManager.get();
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const stepName = options.stepName ?? `${method} ${path}`;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers };

    const attempt = async (): Promise<ApiResponse<T>> => {
      const startTime = new Date();
      let response: Awaited<ReturnType<APIRequestContext['fetch']>>;
      try {
        response = await this.request.fetch(url, {
          method,
          headers,
          data: options.json !== undefined ? JSON.stringify(options.json) : undefined,
          timeout: config.requestTimeoutMs,
        });
      } catch (error) {
        const endTime = new Date();
        ApiLogger.log({
          stepName,
          level: 'FAIL',
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          method,
          url,
          requestHeaders: headers,
          requestBody: options.json,
          error: { message: error instanceof Error ? error.message : String(error) },
        });
        // No status code available — RetryHelper's default classification treats this as transient.
        throw error;
      }

      const endTime = new Date();
      const responseTimeMs = endTime.getTime() - startTime.getTime();
      const rawText = await response.text();
      let body: T;
      try {
        body = rawText ? (JSON.parse(rawText) as T) : (undefined as T);
      } catch {
        body = rawText as unknown as T;
      }

      const normalized: ApiResponse<T> = {
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        body,
        rawText,
        responseTimeMs,
        url,
        method,
        requestHeaders: headers,
        requestBody: options.json,
      };

      const level = response.ok() ? 'PASS' : 'FAIL';
      ApiLogger.log({
        stepName,
        level,
        startTime,
        endTime,
        durationMs: responseTimeMs,
        method,
        url,
        requestHeaders: headers,
        requestBody: options.json,
        responseHeaders: normalized.headers,
        responseBody: body,
        statusCode: normalized.status,
        responseTimeMs,
      });

      if (!response.ok()) {
        // Thrown so RetryHelper can classify it by status code; ApiClient
        // callers that want the raw ApiResponse on failure should catch
        // this and read `.response` off it (see LearningInstanceApi for
        // the pattern) rather than relying on a thrown response reaching
        // the test directly.
        const httpError = new HttpError(normalized);
        throw httpError;
      }

      return normalized;
    };

    if (options.disableRetry) {
      return attempt();
    }

    return RetryHelper.retry(attempt, {
      maxAttempts: config.maxRetryAttempts,
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
      label: stepName,
      isRetryable: (error) => {
        const status = error instanceof HttpError ? error.response.status : undefined;
        if (status === undefined) return true; // network-level failure — transient
        return [408, 425, 429, 500, 502, 503, 504].includes(status);
      },
      ...options.retry,
    });
  }
}

/** Thrown when a response has a non-2xx/3xx status; carries the full normalized ApiResponse for callers/validators. */
export class HttpError extends Error {
  constructor(public readonly response: ApiResponse) {
    super(`HTTP ${response.status} ${response.statusText} for ${response.method} ${response.url}`);
    this.name = 'HttpError';
  }
}
