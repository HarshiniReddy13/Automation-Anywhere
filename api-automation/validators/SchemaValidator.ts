import { expect } from '@playwright/test';

export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';


export class SchemaValidator {
  
  static validateRequiredFields(obj: Record<string, unknown>, requiredFields: string[], context: string): void {
    const missing = requiredFields.filter((field) => !(field in obj));
    expect(
      missing,
      `${context}: missing required field(s) [${missing.join(', ')}]. Present keys: [${Object.keys(obj).join(', ')}].`
    ).toHaveLength(0);
  }

  
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

  
  static validateNoUnexpectedNulls(obj: Record<string, unknown>, mandatoryFields: string[], context: string): void {
    const nullFields = mandatoryFields.filter((field) => obj[field] === null || obj[field] === undefined);
    expect(
      nullFields,
      `${context}: mandatory field(s) [${nullFields.join(', ')}] were null/undefined but must be populated.`
    ).toHaveLength(0);
  }

  
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


  static validateLearningInstanceSchema(obj: Record<string, unknown>, context: string): void {

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
