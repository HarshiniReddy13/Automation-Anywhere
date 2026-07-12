import { expect } from '@playwright/test';

export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * Schema-level assertions: required fields present, correct data types,
 * no unexpected nulls on mandatory fields. Deliberately dependency-free
 * (no ajv/zod/etc.) — the schemas involved here are small and stable
 * enough that a lightweight, explicit checker is easier to read and
 * trust than a JSON-Schema document nobody will maintain.
 */
export class SchemaValidator {
  /** Asserts every field in `requiredFields` exists on `obj` (i.e. the key is present, even if the value could theoretically be falsy-but-valid like `0`/`false`/`""`). */
  static validateRequiredFields(obj: Record<string, unknown>, requiredFields: string[], context: string): void {
    const missing = requiredFields.filter((field) => !(field in obj));
    expect(
      missing,
      `${context}: missing required field(s) [${missing.join(', ')}]. Present keys: [${Object.keys(obj).join(', ')}].`
    ).toHaveLength(0);
  }

  /** Asserts each field in `fieldTypeMap` is present and matches the expected JS type. */
  static validateFieldTypes(obj: Record<string, unknown>, fieldTypeMap: Record<string, FieldType>, context: string): void {
    for (const [field, expectedType] of Object.entries(fieldTypeMap)) {
      const value = obj[field];
      const actualType = SchemaValidator.typeOf(value);
      expect(
        actualType,
        `${context}: field "${field}" expected type "${expectedType}" but got "${actualType}" (value: ${JSON.stringify(value)}).`
      ).toBe(expectedType);
    }
  }

  /** Asserts none of `mandatoryFields` are `null`/`undefined` — a field can be required to exist AND required to be non-null. */
  static validateNoUnexpectedNulls(obj: Record<string, unknown>, mandatoryFields: string[], context: string): void {
    const nullFields = mandatoryFields.filter((field) => obj[field] === null || obj[field] === undefined);
    expect(
      nullFields,
      `${context}: mandatory field(s) [${nullFields.join(', ')}] were null/undefined but must be populated.`
    ).toHaveLength(0);
  }

  /** Asserts `mandatoryFields` are non-null AND not an empty string (stricter than validateNoUnexpectedNulls — for fields that must have real content). */
  static validateMandatoryFieldsPopulated(obj: Record<string, unknown>, mandatoryFields: string[], context: string): void {
    const empty = mandatoryFields.filter((field) => {
      const value = obj[field];
      return value === null || value === undefined || value === '';
    });
    expect(
      empty,
      `${context}: mandatory field(s) [${empty.join(', ')}] must be populated with a non-empty value.`
    ).toHaveLength(0);
  }

  /**
   * Purpose-built check for a `LearningInstance` response, covering
   * exactly the fields Use Case 2's "Schema Validation" section names
   * (id, name, status, createdDate, documentType) — mapped onto this API's
   * real field names, since it has no literal `createdDate`/`documentType`
   * fields (see the inline notes on each mapping).
   */
  static validateLearningInstanceSchema(obj: Record<string, unknown>, context: string): void {
    // "documentType" in the use case maps to this API's `domain.name`.
    // "createdDate" maps to `learninginstances/list`'s `createdOn` — the
    // create/get-by-id response doesn't echo a created timestamp itself,
    // which is why ExecutionContext also records its own client-side
    // `learningInstanceCreatedTimestamp` at the moment of creation.
    SchemaValidator.validateRequiredFields(obj, ['id', 'name', 'status', 'domain', 'fields'], context);
    SchemaValidator.validateFieldTypes(
      obj,
      { id: 'string', name: 'string', status: 'string', domain: 'object', fields: 'array' },
      context
    );
    SchemaValidator.validateMandatoryFieldsPopulated(obj, ['id', 'name', 'status'], context);

    const domain = obj.domain as Record<string, unknown> | undefined;
    expect(domain, `${context}: "domain" object missing entirely.`).toBeDefined();
    if (domain) {
      SchemaValidator.validateRequiredFields(domain, ['id', 'name'], `${context}.domain`);
      SchemaValidator.validateMandatoryFieldsPopulated(domain, ['id', 'name'], `${context}.domain`);
    }
  }

  private static typeOf(value: unknown): FieldType | 'null' | 'undefined' {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t;
    return 'undefined';
  }
}
