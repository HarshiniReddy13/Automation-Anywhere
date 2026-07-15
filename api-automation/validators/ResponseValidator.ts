import { expect } from '@playwright/test';
import type { ApiResponse } from '../api/ApiClient';
import { ConfigManager } from '../utils/ConfigManager';


export class ResponseValidator {

  static validateStatus(response: ApiResponse, expectedStatus: number, context: string): void {
    expect(
      response.status,
      `${context}: expected HTTP ${expectedStatus} but got ${response.status} ${response.statusText}. ` +
        `Response body: ${truncate(response.rawText)}`
    ).toBe(expectedStatus);
  }

  /** Validates the status is one of several acceptable values (e.g. 200 or 201, when an API's convention is unclear). */
  static validateStatusIn(response: ApiResponse, expectedStatuses: number[], context: string): void {
    expect(
      expectedStatuses,
      `${context}: expected HTTP status to be one of [${expectedStatuses.join(', ')}] but got ${response.status} ${response.statusText}. ` +
        `Response body: ${truncate(response.rawText)}`
    ).toContain(response.status);
  }

  static validateStatusText(response: ApiResponse, expectedStatusText: string, context: string): void {
    expect(
      response.statusText.toLowerCase(),
      `${context}: expected status text "${expectedStatusText}" but got "${response.statusText}".`
    ).toBe(expectedStatusText.toLowerCase());
  }

  static validateResponseTime(response: ApiResponse, context: string, maxMs?: number): void {
    const budget = maxMs ?? ConfigManager.get().maxAcceptableResponseTimeMs;
    expect(
      response.responseTimeMs,
      `${context}: response took ${response.responseTimeMs}ms, exceeding the ${budget}ms budget for ${response.method} ${response.url}.`
    ).toBeLessThanOrEqual(budget);
  }

  static validateContentType(response: ApiResponse, expectedType: string, context: string): void {
    const actual = response.headers['content-type'] ?? '';
    expect(
      actual.toLowerCase(),
      `${context}: expected content-type to contain "${expectedType}" but got "${actual}".`
    ).toContain(expectedType.toLowerCase());
  }

  static validateHeaderExists(response: ApiResponse, headerName: string, context: string): void {
    const key = headerName.toLowerCase();
    expect(
      response.headers[key],
      `${context}: expected response header "${headerName}" to be present. Headers received: ${JSON.stringify(response.headers)}.`
    ).toBeDefined();
  }

  static validateHeaderEquals(response: ApiResponse, headerName: string, expectedValue: string, context: string): void {
    const actual = response.headers[headerName.toLowerCase()];
    expect(
      actual,
      `${context}: expected header "${headerName}" to equal "${expectedValue}" but got "${actual}".`
    ).toBe(expectedValue);
  }

  static validateSuccessfulJsonResponse(
    response: ApiResponse,
    expectedStatus: number,
    context: string,
    maxResponseTimeMs?: number
  ): void {
    this.validateStatus(response, expectedStatus, context);
    this.validateResponseTime(response, context, maxResponseTimeMs);
    this.validateContentType(response, 'application/json', context);
  }
}

function truncate(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
