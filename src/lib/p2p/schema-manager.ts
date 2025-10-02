/**
 * Schema Versioning and Validation Manager
 * Handles JSON Schema validation for operations and activities
 */

import {
  Operation,
  FeedEntry,
  SchemaDefinition,
  P2PError,
  P2PConfig
} from './types'

// Built-in schemas for the core types
const OPERATION_SCHEMA_V1 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["CREATE", "UPDATE", "DELETE", "TAG", "RELATE", "TOMBSTONE", "REDACT_METADATA"]
    },
    collectionId: { type: "string", minLength: 1, maxLength: 100 },
    documentId: { type: "string", minLength: 1, maxLength: 100 },
    data: { type: "object" },
    version: { type: "number", minimum: 1 },
    schemaVersion: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    identity: {
      type: "object",
      properties: {
        authorDID: { type: "string", minLength: 1 },
        publicKey: { type: "string", minLength: 1 },
        keyAlgorithm: { type: "string", enum: ["ECDSA-P256"] },
        signature: { type: "string", minLength: 1 },
        lamportClock: { type: "number", minimum: 0 },
        timestamp: { type: "string", format: "date-time" },
        proofOfWork: {
          type: "object",
          properties: {
            nonce: { type: "number", minimum: 0 },
            difficulty: { type: "number", minimum: 1 },
            target: { type: "string" },
            hash: { type: "string" }
          },
          required: ["nonce", "difficulty", "target", "hash"]
        }
      },
      required: ["authorDID", "publicKey", "keyAlgorithm", "signature", "lamportClock", "timestamp"]
    },
    maxBytes: { type: "number", minimum: 1 }
  },
  required: ["type", "collectionId", "documentId", "data", "version", "schemaVersion", "identity"],
  additionalProperties: false
}

const ACTIVITY_SCHEMA_V1 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["publish", "comment", "like", "follow", "announce", "tag"]
    },
    data: { type: "object" },
    schemaVersion: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    identity: {
      type: "object",
      properties: {
        authorDID: { type: "string", minLength: 1 },
        publicKey: { type: "string", minLength: 1 },
        keyAlgorithm: { type: "string", enum: ["ECDSA-P256"] },
        signature: { type: "string", minLength: 1 },
        lamportClock: { type: "number", minimum: 0 },
        timestamp: { type: "string", format: "date-time" },
        proofOfWork: {
          type: "object",
          properties: {
            nonce: { type: "number", minimum: 0 },
            difficulty: { type: "number", minimum: 1 },
            target: { type: "string" },
            hash: { type: "string" }
          },
          required: ["nonce", "difficulty", "target", "hash"]
        }
      },
      required: ["authorDID", "publicKey", "keyAlgorithm", "signature", "lamportClock", "timestamp"]
    },
    maxBytes: { type: "number", minimum: 1 }
  },
  required: ["type", "data", "schemaVersion", "identity"],
  additionalProperties: false
}


export class SchemaManager {
  private schemas: Map<string, any> = new Map()
  private config: P2PConfig

  constructor(config: P2PConfig) {
    this.config = config
    this.initializeBuiltinSchemas()
  }

  /**
   * Initialize built-in schemas
   */
  private initializeBuiltinSchemas(): void {
    this.schemas.set('operation-1.0.0', OPERATION_SCHEMA_V1)
    this.schemas.set('activity-1.0.0', ACTIVITY_SCHEMA_V1)

    console.log(' Built-in schemas initialized')
  }

  /**
   * Validate an operation against its schema
   */
  async validateOperation(operation: Operation): Promise<{ valid: boolean, errors?: string[] }> {
    const schemaKey = `operation-${operation.schemaVersion}`
    const schema = this.schemas.get(schemaKey)

    if (!schema) {
      return {
        valid: false,
        errors: [`Unknown operation schema version: ${operation.schemaVersion}`]
      }
    }

    return this.validateAgainstSchema(operation, schema, 'Operation')
  }

  /**
   * Validate a feed entry against its schema
   */
  async validateFeedEntry(entry: FeedEntry): Promise<{ valid: boolean, errors?: string[] }> {
    const schemaKey = `activity-${entry.schemaVersion}`
    const schema = this.schemas.get(schemaKey)

    if (!schema) {
      return {
        valid: false,
        errors: [`Unknown activity schema version: ${entry.schemaVersion}`]
      }
    }

    return this.validateAgainstSchema(entry, schema, 'FeedEntry')
  }


  /**
   * Register a custom schema
   */
  registerSchema(schemaId: string, version: string, jsonSchema: any): void {
    const key = `${schemaId}-${version}`
    this.schemas.set(key, jsonSchema)
    console.log(` Custom schema registered: ${key}`)
  }

  /**
   * Get supported schema versions for a type
   */
  getSupportedVersions(schemaType: 'operation' | 'activity'): string[] {
    const versions: string[] = []

    for (const key of this.schemas.keys()) {
      if (key.startsWith(`${schemaType}-`)) {
        const version = key.substring(schemaType.length + 1)
        versions.push(version)
      }
    }

    return versions.sort()
  }

  /**
   * Check if a schema version is compatible
   */
  isCompatibleVersion(schemaType: string, version: string): boolean {
    return this.schemas.has(`${schemaType}-${version}`)
  }

  /**
   * Get the latest version for a schema type
   */
  getLatestVersion(schemaType: 'operation' | 'activity'): string {
    const versions = this.getSupportedVersions(schemaType)
    return versions[versions.length - 1] || '1.0.0'
  }

  /**
   * Migrate data between schema versions (placeholder for future implementation)
   */
  async migrateData(data: any, fromVersion: string, toVersion: string, schemaType: string): Promise<any> {
    // For now, just return the data unchanged
    // In the future, this could implement actual migration logic
    console.log(` Schema migration: ${schemaType} ${fromVersion} -> ${toVersion}`)
    return data
  }

  // Private methods

  /**
   * Validate data against a JSON schema
   */
  private validateAgainstSchema(
    data: any,
    schema: any,
    typeName: string
  ): { valid: boolean, errors?: string[] } {
    try {
      // Simple validation - in a real implementation, you'd use a proper JSON Schema validator
      // like Ajv or similar
      const errors = this.simpleValidate(data, schema, '')

      if (errors.length > 0) {
        return { valid: false, errors }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        errors: [`${typeName} validation error: ${error}`]
      }
    }
  }

  /**
   * Simple JSON Schema validation (basic implementation)
   */
  private simpleValidate(data: any, schema: any, path: string): string[] {
    const errors: string[] = []

    // Type validation
    if (schema.type) {
      let typeMatches = false

      if (schema.type === 'array') {
        typeMatches = Array.isArray(data)
      } else if (schema.type === 'object') {
        typeMatches = data && typeof data === 'object' && !Array.isArray(data)
      } else {
        typeMatches = typeof data === schema.type
      }

      if (!typeMatches) {
        const actualType = Array.isArray(data) ? 'array' : typeof data
        errors.push(`${path}: Expected type ${schema.type}, got ${actualType}`)
      }
    }

    // Required properties
    if (schema.required && schema.type === 'object') {
      for (const prop of schema.required) {
        if (!(prop in data)) {
          errors.push(`${path}: Missing required property '${prop}'`)
        }
      }
    }

    // Property validation
    if (schema.properties && typeof data === 'object' && data !== null) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in data) {
          const propPath = path ? `${path}.${prop}` : prop
          errors.push(...this.simpleValidate(data[prop], propSchema, propPath))
        }
      }
    }

    // String validations
    if (schema.type === 'string' && typeof data === 'string') {
      if (schema.minLength && data.length < schema.minLength) {
        errors.push(`${path}: String too short (${data.length} < ${schema.minLength})`)
      }
      if (schema.maxLength && data.length > schema.maxLength) {
        errors.push(`${path}: String too long (${data.length} > ${schema.maxLength})`)
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
        errors.push(`${path}: String does not match pattern ${schema.pattern}`)
      }
      if (schema.enum && !schema.enum.includes(data)) {
        errors.push(`${path}: Value '${data}' not in allowed values: ${schema.enum.join(', ')}`)
      }
    }

    // Number validations
    if (schema.type === 'number' && typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${path}: Number too small (${data} < ${schema.minimum})`)
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${path}: Number too large (${data} > ${schema.maximum})`)
      }
    }

    // Array validations
    if (schema.type === 'array' && Array.isArray(data)) {
      if (schema.maxItems && data.length > schema.maxItems) {
        errors.push(`${path}: Too many items (${data.length} > ${schema.maxItems})`)
      }
      if (schema.minItems && data.length < schema.minItems) {
        errors.push(`${path}: Too few items (${data.length} < ${schema.minItems})`)
      }
      if (schema.items) {
        data.forEach((item, index) => {
          const itemPath = `${path}[${index}]`
          errors.push(...this.simpleValidate(item, schema.items, itemPath))
        })
      }
    }

    return errors
  }
}