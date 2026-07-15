

export type LogLevel = 'PASS' | 'FAIL' | 'WARNING' | 'INFO';

export interface ApiCallLogEntry {
  stepName: string;
  level: LogLevel;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  statusCode?: number;
  responseTimeMs?: number;
  message?: string;
  error?: { message: string; stack?: string };
}

const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'x-authorization', 'cookie', 'set-cookie']);
const SENSITIVE_BODY_FIELDS = new Set(['password', 'token', 'accessToken', 'refreshToken', 'changePasswordToken']);

function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? maskValue(value) : value;
  }
  return redacted;
}


export function redactBody(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  if (typeof body === 'string') {
    try {
      return redactBody(JSON.parse(body));
    } catch {
      return body;
    }
  }
  if (Array.isArray(body)) return body.map(redactBody);
  if (typeof body === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      clone[key] = SENSITIVE_BODY_FIELDS.has(key) ? maskValue(String(value)) : redactBody(value);
    }
    return clone;
  }
  return body;
}

function maskValue(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)} (redacted)`;
}

const LEVEL_PREFIX: Record<LogLevel, string> = {
  PASS: '✅ PASS',
  FAIL: '❌ FAIL',
  WARNING: '⚠️  WARN',
  INFO: 'ℹ️  INFO',
};

class ApiLoggerImpl {
  private readonly entries: ApiCallLogEntry[] = [];

  log(entry: Omit<ApiCallLogEntry, 'requestHeaders' | 'responseHeaders' | 'requestBody' | 'responseBody'> & {
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseBody?: unknown;
  }): void {
    const redacted: ApiCallLogEntry = {
      ...entry,
      requestHeaders: redactHeaders(entry.requestHeaders),
      responseHeaders: redactHeaders(entry.responseHeaders),
      requestBody: redactBody(entry.requestBody),
      responseBody: redactBody(entry.responseBody),
    };
    this.entries.push(redacted);
    this.print(redacted);
  }

  info(stepName: string, message: string): void {
    this.print(this.simpleEntry(stepName, 'INFO', message));
  }

  warn(stepName: string, message: string): void {
    this.print(this.simpleEntry(stepName, 'WARNING', message));
  }

  private simpleEntry(stepName: string, level: LogLevel, message: string): ApiCallLogEntry {
    const now = new Date();
    return {
      stepName,
      level,
      startTime: now,
      endTime: now,
      durationMs: 0,
      method: '-',
      url: '-',
      requestHeaders: {},
      requestBody: undefined,
      message,
    };
  }

  private print(entry: ApiCallLogEntry): void {
    const lines: string[] = [];
    lines.push(`\n${LEVEL_PREFIX[entry.level]} [${entry.stepName}] ${entry.method} ${entry.url}`.trim());
    lines.push(`  start=${entry.startTime.toISOString()} end=${entry.endTime.toISOString()} duration=${entry.durationMs}ms`);
    if (entry.statusCode !== undefined) {
      lines.push(`  status=${entry.statusCode} responseTime=${entry.responseTimeMs ?? entry.durationMs}ms`);
    }
    if (entry.message) lines.push(`  message: ${entry.message}`);
    if (Object.keys(entry.requestHeaders).length) {
      lines.push(`  requestHeaders: ${JSON.stringify(entry.requestHeaders)}`);
    }
    if (entry.requestBody !== undefined) {
      lines.push(`  requestBody: ${truncate(JSON.stringify(entry.requestBody))}`);
    }
    if (entry.responseBody !== undefined) {
      lines.push(`  responseBody: ${truncate(JSON.stringify(entry.responseBody))}`);
    }
    if (entry.error) {
      lines.push(`  error: ${entry.error.message}`);
      if (entry.error.stack) lines.push(`  stack: ${entry.error.stack}`);
    }
    console.log(lines.join('\n'));
  }

  getEntries(): readonly ApiCallLogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }
}

function truncate(text: string, max = 2000): string {
  return text.length > max ? `${text.slice(0, max)}... (truncated, ${text.length} chars total)` : text;
}

export const ApiLogger = new ApiLoggerImpl();
