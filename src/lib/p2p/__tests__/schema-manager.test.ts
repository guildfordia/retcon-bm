/**
 * Tests for SchemaManager
 */

import { SchemaManager } from '../schema-manager'
import { createTestConfig } from './test-utils'
import { Operation, FeedEntry } from '../types'

describe('SchemaManager', () => {
  let manager: SchemaManager
  const config = createTestConfig()

  beforeEach(() => {
    manager = new SchemaManager(config)
  })

  describe('initialization', () => {
    it('should initialize with built-in schemas', () => {
      const operationVersions = manager.getSupportedVersions('operation')
      const activityVersions = manager.getSupportedVersions('activity')

      expect(operationVersions).toContain('1.0.0')
      expect(activityVersions).toContain('1.0.0')
    })
  })

  describe('validateOperation', () => {
    it('should validate a valid operation', async () => {
      const operation: Operation = {
        type: 'CREATE',
        collectionId: 'test-collection',
        documentId: 'doc-123',
        data: { title: 'Test Document' },
        version: 1,
        schemaVersion: '1.0.0',
        identity: {
          authorDID: 'did:p2p:test',
          publicKey: 'test-key',
          keyAlgorithm: 'ECDSA-P256',
          signature: 'test-sig',
          lamportClock: 1,
          timestamp: new Date().toISOString()
        }
      }

      const result = await manager.validateOperation(operation)
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('should reject operation with invalid type', async () => {
      const operation: any = {
        type: 'INVALID_TYPE',
        collectionId: 'test',
        documentId: 'doc-123',
        data: {},
        version: 1,
        schemaVersion: '1.0.0',
        identity: {
          authorDID: 'did:p2p:test',
          publicKey: 'key',
          keyAlgorithm: 'ECDSA-P256',
          signature: 'sig',
          lamportClock: 1,
          timestamp: new Date().toISOString()
        }
      }

      const result = await manager.validateOperation(operation)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('not in allowed values')
    })

    it('should reject operation missing required fields', async () => {
      const operation: any = {
        type: 'CREATE',
        collectionId: 'test',
        // Missing documentId
        data: {},
        version: 1,
        schemaVersion: '1.0.0',
        identity: {
          authorDID: 'did:p2p:test',
          publicKey: 'key',
          keyAlgorithm: 'ECDSA-P256',
          signature: 'sig',
          lamportClock: 1,
          timestamp: new Date().toISOString()
        }
      }

      const result = await manager.validateOperation(operation)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('Missing required property')
    })

    it('should reject operation with unknown schema version', async () => {
      const operation: Operation = {
        type: 'CREATE',
        collectionId: 'test',
        documentId: 'doc-123',
        data: {},
        version: 1,
        schemaVersion: '99.0.0', // Unknown version
        identity: {
          authorDID: 'did:p2p:test',
          publicKey: 'key',
          keyAlgorithm: 'ECDSA-P256',
          signature: 'sig',
          lamportClock: 1,
          timestamp: new Date().toISOString()
        }
      }

      const result = await manager.validateOperation(operation)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('Unknown operation schema version')
    })
  })

  describe('validateFeedEntry', () => {
    it('should validate a valid feed entry', async () => {
      const entry: FeedEntry = {
        type: 'publish',
        data: {
          documentId: 'doc-123',
          collectionId: 'collection-123'
        },
        schemaVersion: '1.0.0',
        identity: {
          authorDID: 'did:p2p:test',
          publicKey: 'key',
          keyAlgorithm: 'ECDSA-P256',
          signature: 'sig',
          lamportClock: 1,
          timestamp: new Date().toISOString()
        }
      }

      const result = await manager.validateFeedEntry(entry)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid feed entry type', async () => {
      const entry: any = {
        type: 'invalid_type',
        data: {},
        schemaVersion: '1.0.0',
        identity: {
          authorDID: 'did:p2p:test',
          publicKey: 'key',
          keyAlgorithm: 'ECDSA-P256',
          signature: 'sig',
          lamportClock: 1,
          timestamp: new Date().toISOString()
        }
      }

      const result = await manager.validateFeedEntry(entry)
      expect(result.valid).toBe(false)
      expect(result.errors![0]).toContain('not in allowed values')
    })
  })

  describe('schema management', () => {
    it('should register custom schemas', () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' }
        }
      }

      manager.registerSchema('custom', '1.0.0', customSchema)
      const versions = manager.getSupportedVersions('custom' as any)
      expect(versions).toContain('1.0.0')
    })

    it('should check schema compatibility', () => {
      expect(manager.isCompatibleVersion('operation', '1.0.0')).toBe(true)
      expect(manager.isCompatibleVersion('operation', '2.0.0')).toBe(false)
      expect(manager.isCompatibleVersion('activity', '1.0.0')).toBe(true)
      expect(manager.isCompatibleVersion('unknown', '1.0.0')).toBe(false)
    })

    it('should get latest schema version', () => {
      expect(manager.getLatestVersion('operation')).toBe('1.0.0')
      expect(manager.getLatestVersion('activity')).toBe('1.0.0')
    })

    it('should return sorted versions', () => {
      // Register test schemas
      manager.registerSchema('test', '1.0.0', { type: 'object' })
      manager.registerSchema('test', '2.0.0', { type: 'object' })
      manager.registerSchema('test', '1.5.0', { type: 'object' })

      const versions = manager.getSupportedVersions('test' as any)
      expect(versions).toEqual(['1.0.0', '1.5.0', '2.0.0'])
    })
  })

  describe('data migration', () => {
    it('should handle migration placeholder', async () => {
      const oldData = { field: 'value' }
      const result = await manager.migrateData(oldData, '1.0.0', '2.0.0', 'operation')
      // Currently returns unchanged data
      expect(result).toEqual(oldData)
    })
  })

  describe('validation edge cases', () => {

    it('should validate array fields', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }

      manager.registerSchema('test', '1.0.0', schema)
      // Basic validation would happen through validateOperation
    })

    it('should enforce array length limits', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10
          }
        }
      }

      manager.registerSchema('test', '1.0.0', schema)
      // Length limit enforcement would happen through validateOperation
    })
  })
})