/**
 * Tests for CollectionCQRS with hardening features
 */

import { CollectionCQRS } from '../collection-cqrs'
import { createTestConfig, createMockOrbitDB, createMockHelia, generateTestKeyPair, createTestFile } from './test-utils'
import { Operation } from '../types'

describe('CollectionCQRS', () => {
  let collection: CollectionCQRS
  let mockOrbitDB: any
  let mockHelia: any
  let keyPair: any
  const config = createTestConfig()

  beforeEach(async () => {
    mockOrbitDB = createMockOrbitDB()
    mockHelia = createMockHelia()
    collection = new CollectionCQRS(mockOrbitDB, 'test-collection', config)
    keyPair = await generateTestKeyPair()
    await collection.initialize(keyPair, mockHelia)
  })

  describe('initialization', () => {
    it('should initialize with OrbitDB and content manager', async () => {
      expect(mockOrbitDB.open).toHaveBeenCalledWith(
        'test-collection-ops',
        expect.objectContaining({
          type: 'eventlog',
          create: true,
          sync: true
        })
      )

      expect(mockOrbitDB.open).toHaveBeenCalledWith(
        'test-collection-catalog',
        expect.objectContaining({
          type: 'docstore',
          create: true,
          sync: true
        })
      )
    })

    it('should initialize with custom addresses', async () => {
      const newCollection = new CollectionCQRS(mockOrbitDB, 'custom-collection', config)
      await newCollection.initialize(keyPair, mockHelia, 'custom-ops', 'custom-catalog')

      expect(mockOrbitDB.open).toHaveBeenCalledWith(
        'custom-ops',
        expect.objectContaining({ create: false })
      )

      expect(mockOrbitDB.open).toHaveBeenCalledWith(
        'custom-catalog',
        expect.objectContaining({ create: false })
      )
    })
  })

  describe('createDocument', () => {
    let mockOpsDB: any
    let mockCatalogDB: any

    beforeEach(() => {
      mockOpsDB = { add: jest.fn().mockResolvedValue({}) }
      mockCatalogDB = { put: jest.fn().mockResolvedValue({}) }
      collection['opsLogDB'] = mockOpsDB
      collection['catalogDB'] = mockCatalogDB
    })

    it('should create document with signed operation', async () => {
      const file = createTestFile('test.txt', 'Hello World')
      const metadata = {
        title: 'Test Document',
        description: 'A test document',
        tags: ['test', 'document']
      }

      const document = await collection.createDocument(file, metadata)

      expect(document.title).toBe('Test Document')
      expect(document.description).toBe('A test document')
      expect(document.tags).toEqual(['test', 'document'])
      expect(document.ipfsCID).toBe('mock-cid-123')
      expect(document.provenance.version).toBe(1)
      expect(document.authors).toHaveLength(1)

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CREATE',
          collectionId: 'test-collection',
          schemaVersion: '1.0.0',
          identity: expect.objectContaining({
            authorDID: expect.any(String),
            signature: expect.any(String),
            lamportClock: expect.any(Number)
          })
        })
      )

      expect(mockCatalogDB.put).toHaveBeenCalled()
    })

    it('should validate operation size and rate limits', async () => {
      // Update config to have very strict limits
      const strictConfig = {
        ...config,
        security: {
          ...config.security!,
          rateLimits: {
            maxOperationsPerMinute: 1,
            maxBytesPerOperation: 100,
            maxBytesPerMinute: 100,
            proofOfWorkDifficulty: 2
          }
        }
      }

      const strictCollection = new CollectionCQRS(mockOrbitDB, 'strict-collection', strictConfig)
      await strictCollection.initialize(keyPair, mockHelia)
      strictCollection['opsLogDB'] = mockOpsDB
      strictCollection['catalogDB'] = mockCatalogDB

      const file = createTestFile('large.txt', 'x'.repeat(1000)) // Large file

      await expect(
        strictCollection.createDocument(file, { title: 'Large Document' })
      ).rejects.toThrow('File exceeds size limit')
    })

    it('should enforce rate limits per author', async () => {
      // Create multiple operations quickly
      const file1 = createTestFile('file1.txt', 'content1')
      const file2 = createTestFile('file2.txt', 'content2')

      await collection.createDocument(file1, { title: 'Document 1' })

      // Artificially exhaust rate limit
      const rateLimitTracker = collection['rateLimitTracker']
      const identity = collection['identity']
      const authorDID = identity.getIdentityInfo().authorDID

      rateLimitTracker.set(authorDID, {
        count: 100, // Exceed limit
        windowStart: Date.now()
      })

      await expect(
        collection.createDocument(file2, { title: 'Document 2' })
      ).rejects.toThrow('Rate limit exceeded')
    })

    it('should require proof-of-work when enabled', async () => {
      const powConfig = {
        ...config,
        security: {
          ...config.security!,
          requireProofOfWork: true,
          rateLimits: {
            ...config.security!.rateLimits!,
            proofOfWorkDifficulty: 2
          }
        }
      }

      const powCollection = new CollectionCQRS(mockOrbitDB, 'pow-collection', powConfig)
      await powCollection.initialize(keyPair, mockHelia)
      powCollection['opsLogDB'] = mockOpsDB
      powCollection['catalogDB'] = mockCatalogDB

      const file = createTestFile('test.txt', 'content')

      const document = await powCollection.createDocument(file, { title: 'PoW Document' })

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: expect.objectContaining({
            proofOfWork: expect.objectContaining({
              difficulty: 2,
              nonce: expect.any(Number),
              hash: expect.stringMatching(/^00/)
            })
          })
        })
      )
    })
  })

  describe('updateDocument', () => {
    let mockOpsDB: any
    let mockCatalogDB: any

    beforeEach(async () => {
      mockOpsDB = { add: jest.fn().mockResolvedValue({}) }
      mockCatalogDB = {
        put: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({
          _id: 'doc-123',
          title: 'Original Title',
          description: 'Original Description',
          tags: ['original'],
          authors: ['author1'],
          ipfsCID: 'original-cid',
          mimeType: 'text/plain',
          size: 100,
          provenance: { version: 1, created: Date.now(), updated: Date.now() }
        })
      }
      collection['opsLogDB'] = mockOpsDB
      collection['catalogDB'] = mockCatalogDB
    })

    it('should update document with signed operation', async () => {
      const updates = {
        title: 'Updated Title',
        description: 'Updated Description',
        tags: ['updated', 'test']
      }

      const document = await collection.updateDocument('doc-123', updates)

      expect(document.title).toBe('Updated Title')
      expect(document.description).toBe('Updated Description')
      expect(document.tags).toEqual(['updated', 'test'])
      expect(document.provenance.version).toBe(2)

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE',
          documentId: 'doc-123',
          version: 2,
          identity: expect.objectContaining({
            signature: expect.any(String)
          })
        })
      )
    })

    it('should handle file updates', async () => {
      const newFile = createTestFile('updated.txt', 'Updated content')
      const updates = { file: newFile, title: 'Updated with file' }

      const document = await collection.updateDocument('doc-123', updates)

      expect(document.ipfsCID).toBe('mock-cid-123')
      expect(document.title).toBe('Updated with file')
    })

    it('should reject update of non-existent document', async () => {
      mockCatalogDB.get.mockResolvedValue(null)

      await expect(
        collection.updateDocument('nonexistent', { title: 'New Title' })
      ).rejects.toThrow('Document not found')
    })
  })

  describe('deleteDocument', () => {
    let mockOpsDB: any
    let mockCatalogDB: any

    beforeEach(() => {
      mockOpsDB = { add: jest.fn().mockResolvedValue({}) }
      mockCatalogDB = {
        del: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({
          _id: 'doc-123',
          ipfsCID: 'test-cid'
        })
      }
      collection['opsLogDB'] = mockOpsDB
      collection['catalogDB'] = mockCatalogDB
    })

    it('should delete document with signed operation', async () => {
      await collection.deleteDocument('doc-123')

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DELETE',
          documentId: 'doc-123',
          version: 1,
          identity: expect.objectContaining({
            signature: expect.any(String)
          })
        })
      )

      expect(mockCatalogDB.del).toHaveBeenCalledWith('doc-123')
    })

    it('should clean up content references', async () => {
      const contentManager = collection['contentManager']
      jest.spyOn(contentManager!, 'removeDocumentReference').mockResolvedValue()

      await collection.deleteDocument('doc-123')

      expect(contentManager!.removeDocumentReference).toHaveBeenCalledWith('test-cid', 'doc-123')
    })
  })

  describe('tombstoneDocument', () => {
    let mockOpsDB: any
    let mockCatalogDB: any

    beforeEach(() => {
      mockOpsDB = { add: jest.fn().mockResolvedValue({}) }
      mockCatalogDB = {
        del: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({
          _id: 'doc-123',
          title: 'Document to Tombstone',
          ipfsCID: 'test-cid',
          provenance: { version: 1 }
        })
      }
      collection['opsLogDB'] = mockOpsDB
      collection['catalogDB'] = mockCatalogDB
    })

    it('should tombstone document with reason', async () => {
      await collection.tombstoneDocument('doc-123', 'Violates policy')

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TOMBSTONE',
          documentId: 'doc-123',
          data: expect.objectContaining({
            reason: 'Violates policy',
            originalTitle: 'Document to Tombstone'
          })
        })
      )

      expect(mockCatalogDB.del).toHaveBeenCalledWith('doc-123')

      // Should be added to tombstones set
      const tombstones = collection['tombstones']
      expect(tombstones.has('doc-123')).toBe(true)
    })

    it('should use default reason if none provided', async () => {
      await collection.tombstoneDocument('doc-123')

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: 'Content removed'
          })
        })
      )
    })
  })

  describe('redactDocumentMetadata', () => {
    let mockOpsDB: any
    let mockCatalogDB: any
    let originalDoc: any

    beforeEach(() => {
      originalDoc = {
        _id: 'doc-123',
        title: 'Sensitive Document',
        description: 'Contains sensitive info',
        tags: ['sensitive', 'private'],
        provenance: { version: 1 }
      }

      mockOpsDB = { add: jest.fn().mockResolvedValue({}) }
      mockCatalogDB = {
        put: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue(originalDoc)
      }
      collection['opsLogDB'] = mockOpsDB
      collection['catalogDB'] = mockCatalogDB
    })

    it('should redact specified metadata fields', async () => {
      const fieldsToRedact = ['title', 'description']

      const redactedDoc = await collection.redactDocumentMetadata('doc-123', fieldsToRedact, 'Privacy request')

      expect(redactedDoc.title).toBe('[REDACTED]')
      expect(redactedDoc.description).toBe('[REDACTED]')
      expect(redactedDoc.tags).toEqual(['sensitive', 'private']) // Not redacted

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REDACT_METADATA',
          data: expect.objectContaining({
            redactedFields: fieldsToRedact,
            reason: 'Privacy request'
          })
        })
      )
    })

    it('should reject redaction of tombstoned document', async () => {
      const tombstones = collection['tombstones']
      tombstones.add('doc-123')

      await expect(
        collection.redactDocumentMetadata('doc-123', ['title'])
      ).rejects.toThrow('Cannot redact tombstoned document')
    })
  })

  describe('tagDocument', () => {
    let mockOpsDB: any
    let mockCatalogDB: any

    beforeEach(() => {
      mockOpsDB = { add: jest.fn().mockResolvedValue({}) }
      mockCatalogDB = {
        put: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({
          _id: 'doc-123',
          tags: ['existing'],
          provenance: { version: 1, updated: Date.now() }
        })
      }
      collection['opsLogDB'] = mockOpsDB
      collection['catalogDB'] = mockCatalogDB
    })

    it('should add tags without duplicates', async () => {
      const newTags = ['new1', 'existing', 'new2']

      const document = await collection.tagDocument('doc-123', newTags)

      expect(document.tags).toEqual(['existing', 'new1', 'new2'])

      expect(mockOpsDB.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TAG',
          data: expect.objectContaining({
            tags: ['existing', 'new1', 'new2'],
            addedTags: newTags
          })
        })
      )
    })
  })

  describe('query operations', () => {
    let mockCatalogDB: any

    beforeEach(() => {
      const documents = [
        { _id: 'doc-1', title: 'Document 1', tags: ['tag1'], provenance: { updated: 1000 } },
        { _id: 'doc-2', title: 'Document 2', tags: ['tag2'], provenance: { updated: 2000 } },
        { _id: 'doc-3', title: 'Document 3', tags: ['tag1', 'tag2'], provenance: { updated: 3000 } }
      ]

      mockCatalogDB = {
        get: jest.fn().mockImplementation((id: string) =>
          documents.find(doc => doc._id === id) || null
        ),
        query: jest.fn().mockImplementation((predicate) =>
          documents.filter(predicate)
        )
      }
      collection['catalogDB'] = mockCatalogDB
    })

    it('should get document by ID', async () => {
      const doc = await collection.getDocument('doc-1')
      expect(doc?.title).toBe('Document 1')
    })

    it('should return null for tombstoned document', async () => {
      const tombstones = collection['tombstones']
      tombstones.add('doc-1')

      const doc = await collection.getDocument('doc-1')
      expect(doc).toBeNull()
    })

    it('should get all documents with pagination', async () => {
      const docs = await collection.getAllDocuments({ limit: 2, offset: 1 })
      expect(docs).toHaveLength(2)
    })

    it('should filter documents by tags', async () => {
      const docs = await collection.getAllDocuments({ tags: ['tag1'] })

      // Should filter in the predicate function
      expect(mockCatalogDB.query).toHaveBeenCalledWith(expect.any(Function))
    })

    it('should filter out tombstoned documents from queries', async () => {
      const tombstones = collection['tombstones']
      tombstones.add('doc-1')

      await collection.getAllDocuments()

      // The query predicate should filter tombstoned documents
      const predicate = mockCatalogDB.query.mock.calls[0][0]
      expect(predicate({ _id: 'doc-1' })).toBe(false)
      expect(predicate({ _id: 'doc-2' })).toBe(true)
    })
  })

  describe('operation history and conflict resolution', () => {
    let mockOpsDB: any

    beforeEach(() => {
      const operations = [
        {
          type: 'CREATE',
          documentId: 'doc-1',
          identity: { lamportClock: 1, timestamp: '2024-01-01T00:00:00Z', authorDID: 'did:p2p:user1' }
        },
        {
          type: 'UPDATE',
          documentId: 'doc-1',
          identity: { lamportClock: 2, timestamp: '2024-01-01T01:00:00Z', authorDID: 'did:p2p:user2' }
        },
        {
          type: 'UPDATE',
          documentId: 'doc-1',
          identity: { lamportClock: 2, timestamp: '2024-01-01T00:30:00Z', authorDID: 'did:p2p:user1' }
        }
      ]

      mockOpsDB = {
        iterator: () => ({
          collect: jest.fn().mockResolvedValue(
            operations.map(value => ({ value }))
          )
        })
      }
      collection['opsLogDB'] = mockOpsDB
    })

    it('should get document history sorted by timestamp', async () => {
      const history = await collection.getDocumentHistory('doc-1')

      expect(history).toHaveLength(3)
      expect(history[0].type).toBe('CREATE')
      expect(history[1].identity.timestamp).toBe('2024-01-01T00:30:00Z')
      expect(history[2].identity.timestamp).toBe('2024-01-01T01:00:00Z')
    })

    it('should resolve conflicts deterministically', async () => {
      const operations = [
        {
          type: 'UPDATE',
          documentId: 'doc-1',
          identity: { lamportClock: 5, timestamp: '2024-01-01T00:00:00Z', authorDID: 'did:p2p:zzz' }
        },
        {
          type: 'TOMBSTONE',
          documentId: 'doc-1',
          identity: { lamportClock: 3, timestamp: '2024-01-01T00:00:00Z', authorDID: 'did:p2p:aaa' }
        },
        {
          type: 'UPDATE',
          documentId: 'doc-1',
          identity: { lamportClock: 5, timestamp: '2024-01-01T00:00:00Z', authorDID: 'did:p2p:aaa' }
        }
      ]

      const resolved = collection['resolveOperationConflicts'](operations as any)

      // TOMBSTONE should win due to operation precedence
      expect(resolved).toHaveLength(1)
      expect(resolved[0].type).toBe('TOMBSTONE')
    })
  })

  describe('content management integration', () => {
    it('should get document content', async () => {
      const mockCatalogDB = {
        get: jest.fn().mockResolvedValue({
          _id: 'doc-123',
          ipfsCID: 'test-cid'
        })
      }
      collection['catalogDB'] = mockCatalogDB

      const contentManager = collection['contentManager']
      jest.spyOn(contentManager!, 'getContent').mockResolvedValue(new Uint8Array([1, 2, 3]))

      const content = await collection.getDocumentContent('doc-123')

      expect(content).toEqual(new Uint8Array([1, 2, 3]))
      expect(contentManager!.getContent).toHaveBeenCalledWith('test-cid')
    })

    it('should star/unstar document content', async () => {
      const mockCatalogDB = {
        get: jest.fn().mockResolvedValue({
          _id: 'doc-123',
          ipfsCID: 'test-cid'
        })
      }
      collection['catalogDB'] = mockCatalogDB

      const contentManager = collection['contentManager']
      jest.spyOn(contentManager!, 'setContentStarred').mockResolvedValue()

      await collection.setDocumentStarred('doc-123', true)

      expect(contentManager!.setContentStarred).toHaveBeenCalledWith('test-cid', true)
    })

    it('should get content metrics', () => {
      const contentManager = collection['contentManager']
      jest.spyOn(contentManager!, 'getContentMetrics').mockReturnValue({
        totalSize: 1000,
        totalFiles: 5,
        pinnedSize: 800,
        pinnedFiles: 4,
        lastCleanup: Date.now(),
        storageUsage: 0.8
      })

      const metrics = collection.getContentMetrics()

      expect(metrics.totalSize).toBe(1000)
      expect(metrics.totalFiles).toBe(5)
    })
  })

  describe('statistics and metrics', () => {
    it('should get collection statistics', async () => {
      const mockCatalogDB = {
        query: jest.fn().mockResolvedValue([
          { tags: ['tag1'], authors: ['author1'], provenance: { updated: 1000 } },
          { tags: ['tag2'], authors: ['author1', 'author2'], provenance: { updated: 2000 } }
        ])
      }

      const mockOpsDB = {
        iterator: () => ({
          collect: jest.fn().mockResolvedValue([
            { value: { type: 'CREATE' } },
            { value: { type: 'UPDATE' } }
          ])
        })
      }

      collection['catalogDB'] = mockCatalogDB
      collection['opsLogDB'] = mockOpsDB

      const stats = await collection.getStats()

      expect(stats.documentCount).toBe(2)
      expect(stats.operationCount).toBe(2)
      expect(stats.tags).toEqual(['tag1', 'tag2'])
      expect(stats.authors).toEqual(['author1', 'author2'])
      expect(stats.lastUpdate).toBe(2000)
    })
  })

  describe('schema validation integration', () => {
    it('should validate operations against schema', async () => {
      const mockOpsDB = { add: jest.fn().mockResolvedValue({}) }
      const mockCatalogDB = { put: jest.fn().mockResolvedValue({}) }
      collection['opsLogDB'] = mockOpsDB
      collection['catalogDB'] = mockCatalogDB

      // Mock schema validation failure
      const schemaManager = collection['schemaManager']
      jest.spyOn(schemaManager, 'validateOperation').mockResolvedValue({
        valid: false,
        errors: ['Invalid operation type']
      })

      const file = createTestFile('test.txt', 'content')

      await expect(
        collection.createDocument(file, { title: 'Test' })
      ).rejects.toThrow('Operation schema validation failed')
    })
  })

  describe('error handling', () => {
    it('should handle database initialization errors', async () => {
      const errorOrbitDB = {
        open: jest.fn().mockRejectedValue(new Error('DB init failed'))
      }

      const errorCollection = new CollectionCQRS(errorOrbitDB, 'error-collection', config)

      await expect(
        errorCollection.initialize(keyPair, mockHelia)
      ).rejects.toThrow('DB init failed')
    })

    it('should handle operation addition errors', async () => {
      const mockOpsDB = { add: jest.fn().mockRejectedValue(new Error('Add failed')) }
      collection['opsLogDB'] = mockOpsDB

      const file = createTestFile('test.txt', 'content')

      await expect(
        collection.createDocument(file, { title: 'Test' })
      ).rejects.toThrow('Add failed')
    })

    it('should handle content storage errors', async () => {
      const contentManager = collection['contentManager']
      jest.spyOn(contentManager!, 'storeContent').mockRejectedValue(new Error('Storage failed'))

      const file = createTestFile('test.txt', 'content')

      await expect(
        collection.createDocument(file, { title: 'Test' })
      ).rejects.toThrow('Storage failed')
    })
  })
})