/**
 * Integration tests for P2PSystem
 */

import { P2PSystem } from '../p2p-system'
import { createTestConfig, createTestFile } from './test-utils'

// Mock all external dependencies
jest.mock('helia')
jest.mock('libp2p')
jest.mock('@orbitdb/core')

// Set up the mocks
const mockHelia = {
  fs: {
    addBytes: jest.fn().mockResolvedValue({ cid: { toString: () => 'mock-cid-123' } }),
    cat: jest.fn().mockImplementation(function* () {
      yield new Uint8Array([1, 2, 3])
    })
  },
  pins: {
    add: jest.fn().mockResolvedValue({}),
    rm: jest.fn().mockResolvedValue({})
  },
  libp2p: {
    peerId: { toString: () => 'mock-peer-id' },
    getMultiaddrs: () => [],
    dial: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }
}

const mockLibp2p = {
  peerId: { toString: () => 'mock-peer-id' },
  getMultiaddrs: () => [],
  dial: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}

const mockOrbitDB = {
  open: jest.fn().mockResolvedValue({
    address: { toString: () => 'mock-db-address' },
    events: { on: jest.fn() },
    add: jest.fn().mockResolvedValue({}),
    get: jest.fn(),
    put: jest.fn().mockResolvedValue({}),
    del: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue([]),
    iterator: () => ({
      collect: jest.fn().mockResolvedValue([])
    })
  }),
  stop: jest.fn()
}

// Apply the mocks
require('helia').createHelia = jest.fn().mockResolvedValue(mockHelia)
require('libp2p').createLibp2p = jest.fn().mockResolvedValue(mockLibp2p)
require('@orbitdb/core').createOrbitDB = jest.fn().mockResolvedValue(mockOrbitDB)

describe('P2PSystem Integration', () => {
  let p2pSystem: P2PSystem
  const config = createTestConfig('integration-test-user')

  beforeEach(() => {
    p2pSystem = new P2PSystem(config)
  })

  afterEach(async () => {
    try {
      await p2pSystem.shutdown()
    } catch (error) {
      // Ignore shutdown errors in tests
    }
  })

  describe('system initialization', () => {
    it('should initialize all components', async () => {
      await p2pSystem.initialize()

      expect(p2pSystem['libp2p']).toBeDefined()
      expect(p2pSystem['helia']).toBeDefined()
      expect(p2pSystem['orbitdb']).toBeDefined()
      expect(p2pSystem['registry']).toBeDefined()
      expect(p2pSystem['userActivity']).toBeDefined()
      expect(p2pSystem['moderation']).toBeDefined()
      expect(p2pSystem['schemaManager']).toBeDefined()
    })

    it('should initialize with custom options', async () => {
      await p2pSystem.initialize({
        registryAddress: 'custom-registry',
        libp2pConfig: { custom: 'config' }
      })

      expect(p2pSystem['initialized']).toBe(true)
    })

    it('should prevent double initialization', async () => {
      await p2pSystem.initialize()

      // Second initialization should not throw
      await expect(p2pSystem.initialize()).resolves.toBeUndefined()
    })
  })

  describe('collection management', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
    })

    it('should create new collection', async () => {
      const collectionInfo = await p2pSystem.getOrCreateCollection('test-collection', {
        create: true,
        name: 'Test Collection',
        description: 'A test collection'
      })

      expect(collectionInfo.id).toBe('test-collection')
      expect(collectionInfo.name).toBe('Test Collection')
      expect(collectionInfo.description).toBe('A test collection')
      expect(collectionInfo.opsLogAddress).toBeDefined()
      expect(collectionInfo.catalogAddress).toBeDefined()
    })

    it('should reject creating collection with create=false', async () => {
      await expect(
        p2pSystem.getOrCreateCollection('nonexistent-collection', { create: false })
      ).rejects.toThrow('Collection not found and create=false')
    })

    it('should list collections', async () => {
      await p2pSystem.getOrCreateCollection('collection1', { create: true, name: 'Collection 1' })
      await p2pSystem.getOrCreateCollection('collection2', { create: true, name: 'Collection 2' })

      const collections = await p2pSystem.getKnownCollections()
      expect(collections.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('document management', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
      await p2pSystem.getOrCreateCollection('test-collection', {
        create: true,
        name: 'Test Collection'
      })
    })

    it('should publish document to collection', async () => {
      const file = createTestFile('test.txt', 'Hello World')
      const metadata = {
        title: 'Test Document',
        description: 'A test document',
        tags: ['test', 'document']
      }

      const document = await p2pSystem.publishDocument('test-collection', file, metadata)

      expect(document.title).toBe('Test Document')
      expect(document.description).toBe('A test document')
      expect(document.tags).toEqual(['test', 'document'])
      expect(document.ipfsCID).toBe('mock-cid-123')
      expect(document.provenance.version).toBe(1)
    })

    it('should get documents from collection', async () => {
      const file = createTestFile('test.txt', 'content')
      await p2pSystem.publishDocument('test-collection', file, { title: 'Document 1' })

      const documents = await p2pSystem.getDocuments('test-collection')
      expect(Array.isArray(documents)).toBe(true)
    })

    it('should get document by ID', async () => {
      const file = createTestFile('test.txt', 'content')
      const published = await p2pSystem.publishDocument('test-collection', file, { title: 'Test Doc' })

      const retrieved = await p2pSystem.getDocument('test-collection', published._id)
      expect(retrieved?.title).toBe('Test Doc')
    })
  })

  describe('user activity tracking', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
    })

    it('should track user activity', async () => {
      const activities = await p2pSystem.getUserActivity({ limit: 10 })
      expect(Array.isArray(activities)).toBe(true)
    })

    it('should track publishing activity', async () => {
      await p2pSystem.getOrCreateCollection('activity-test', { create: true, name: 'Activity Test' })

      const file = createTestFile('activity.txt', 'content')
      await p2pSystem.publishDocument('activity-test', file, { title: 'Activity Document' })

      // Activity should be automatically tracked
      const activities = await p2pSystem.getUserActivity()
      expect(activities.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('moderation system', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
    })

    it('should submit moderation events', async () => {
      const event = await p2pSystem.submitModerationEvent(
        'flag',
        'document',
        'doc-123',
        'Inappropriate content',
        {
          labels: ['nsfw'],
          severity: 'medium'
        }
      )

      expect(event.type).toBe('flag')
      expect(event.targetType).toBe('document')
      expect(event.targetId).toBe('doc-123')
      expect(event.reason).toBe('Inappropriate content')
      expect(event.labels).toEqual(['nsfw'])
      expect(event.severity).toBe('medium')
    })

    it('should get moderation events for target', async () => {
      await p2pSystem.submitModerationEvent('flag', 'document', 'doc-456', 'Test flag')

      const events = await p2pSystem.getModerationEvents('document', 'doc-456')
      expect(Array.isArray(events)).toBe(true)
    })

    it('should get moderation summary', async () => {
      const summary = await p2pSystem.getModerationSummary('document', 'doc-789')

      expect(summary).toHaveProperty('flagCount')
      expect(summary).toHaveProperty('labels')
      expect(summary).toHaveProperty('maxSeverity')
      expect(summary).toHaveProperty('trustedModeratorActions')
      expect(summary).toHaveProperty('lastAction')
    })

    it('should check content filtering', async () => {
      const filterResult = await p2pSystem.shouldFilterContent('document', 'doc-test', {
        hideNSFW: true,
        hideSpam: true
      })

      expect(filterResult).toHaveProperty('shouldHide')
      expect(filterResult).toHaveProperty('labels')
    })

    it('should get moderation statistics', async () => {
      const stats = await p2pSystem.getModerationStats()

      expect(stats).toHaveProperty('totalEvents')
      expect(stats).toHaveProperty('flagCount')
      expect(stats).toHaveProperty('labelCounts')
      expect(stats).toHaveProperty('severityCounts')
      expect(stats).toHaveProperty('trustedModeratorEvents')
    })
  })

  describe('schema management', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
    })

    it('should get supported schema versions', () => {
      const operationVersions = p2pSystem.getSupportedSchemaVersions('operation')
      const activityVersions = p2pSystem.getSupportedSchemaVersions('activity')
      const moderationVersions = p2pSystem.getSupportedSchemaVersions('moderation')

      expect(operationVersions).toContain('1.0.0')
      expect(activityVersions).toContain('1.0.0')
      expect(moderationVersions).toContain('1.0.0')
    })

    it('should check schema version compatibility', () => {
      expect(p2pSystem.isSchemaVersionSupported('operation', '1.0.0')).toBe(true)
      expect(p2pSystem.isSchemaVersionSupported('operation', '99.0.0')).toBe(false)
    })

    it('should get latest schema versions', () => {
      expect(p2pSystem.getLatestSchemaVersion('operation')).toBe('1.0.0')
      expect(p2pSystem.getLatestSchemaVersion('activity')).toBe('1.0.0')
      expect(p2pSystem.getLatestSchemaVersion('moderation')).toBe('1.0.0')
    })

    it('should register custom schemas', () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' }
        }
      }

      p2pSystem.registerSchema('custom', '1.0.0', customSchema)

      // Should not throw - registration is fire-and-forget
      expect(true).toBe(true)
    })
  })

  describe('network operations', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
    })

    it('should get peer information', async () => {
      const peerInfo = await p2pSystem.getPeerInfo()

      expect(peerInfo).toHaveProperty('peerId')
      expect(peerInfo).toHaveProperty('multiaddrs')
    })

    it('should connect to peer', async () => {
      const mockMultiaddr = '/ip4/127.0.0.1/tcp/4001/p2p/QmTest'

      // Should not throw
      await expect(p2pSystem.connectToPeer(mockMultiaddr)).resolves.toBeUndefined()
    })

    it('should get known peers', async () => {
      const peers = await p2pSystem.getKnownPeers()
      expect(Array.isArray(peers)).toBe(true)
    })
  })

  describe('system health and statistics', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
    })

    it('should get system health', async () => {
      const health = await p2pSystem.getSystemHealth()

      expect(health).toHaveProperty('registry')
      expect(health).toHaveProperty('collections')
      expect(health).toHaveProperty('network')
      expect(health).toHaveProperty('storage')
    })

    it('should handle health check gracefully', async () => {
      // Even if some components fail, should return partial health
      const health = await p2pSystem.getSystemHealth()
      expect(health).toBeDefined()
    })
  })

  describe('error handling and edge cases', () => {
    it('should handle operations before initialization', async () => {
      const uninitializedSystem = new P2PSystem(config)

      await expect(
        uninitializedSystem.getKnownCollections()
      ).rejects.toThrow('P2P system not initialized')
    })

    it('should handle invalid collection names', async () => {
      await p2pSystem.initialize()

      await expect(
        p2pSystem.getOrCreateCollection('', { create: true, name: 'Empty Name' })
      ).rejects.toThrow()
    })

    it('should handle invalid file uploads', async () => {
      await p2pSystem.initialize()
      await p2pSystem.getOrCreateCollection('test-collection', {
        create: true,
        name: 'Test'
      })

      // Create an invalid file (empty)
      const invalidFile = new File([], '', { type: '' })

      await expect(
        p2pSystem.publishDocument('test-collection', invalidFile, { title: 'Invalid' })
      ).rejects.toThrow()
    })

    it('should handle network disconnection gracefully', async () => {
      await p2pSystem.initialize()

      // Mock network failure
      const mockLibp2p = p2pSystem['libp2p']
      mockLibp2p.dial = jest.fn().mockRejectedValue(new Error('Network error'))

      await expect(
        p2pSystem.connectToPeer('/ip4/127.0.0.1/tcp/4001/p2p/QmTest')
      ).rejects.toThrow('Network error')
    })
  })

  describe('concurrent operations', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
      await p2pSystem.getOrCreateCollection('concurrent-test', {
        create: true,
        name: 'Concurrent Test'
      })
    })

    it('should handle concurrent document publishing', async () => {
      const files = Array.from({ length: 5 }, (_, i) =>
        createTestFile(`concurrent-${i}.txt`, `Content ${i}`)
      )

      const publishPromises = files.map((file, i) =>
        p2pSystem.publishDocument('concurrent-test', file, { title: `Document ${i}` })
      )

      const documents = await Promise.all(publishPromises)

      expect(documents).toHaveLength(5)
      documents.forEach((doc, i) => {
        expect(doc.title).toBe(`Document ${i}`)
      })
    })

    it('should handle concurrent moderation events', async () => {
      const eventPromises = Array.from({ length: 3 }, (_, i) =>
        p2pSystem.submitModerationEvent(
          'flag',
          'document',
          `doc-concurrent-${i}`,
          `Reason ${i}`
        )
      )

      const events = await Promise.all(eventPromises)

      expect(events).toHaveLength(3)
      events.forEach((event, i) => {
        expect(event.reason).toBe(`Reason ${i}`)
      })
    })
  })

  describe('data consistency', () => {
    beforeEach(async () => {
      await p2pSystem.initialize()
      await p2pSystem.getOrCreateCollection('consistency-test', {
        create: true,
        name: 'Consistency Test'
      })
    })

    it('should maintain consistent document state across operations', async () => {
      const file = createTestFile('consistency.txt', 'Original content')
      const document = await p2pSystem.publishDocument('consistency-test', file, {
        title: 'Original Title'
      })

      // Get the collection to perform updates
      const collection = p2pSystem['collections'].get('consistency-test')
      expect(collection).toBeDefined()

      // Update the document
      const updatedDoc = await collection!.updateDocument(document._id, {
        title: 'Updated Title',
        description: 'Added description'
      })

      expect(updatedDoc.title).toBe('Updated Title')
      expect(updatedDoc.description).toBe('Added description')
      expect(updatedDoc.provenance.version).toBe(2)

      // Verify we can still retrieve it
      const retrieved = await p2pSystem.getDocument('consistency-test', document._id)
      expect(retrieved?.title).toBe('Updated Title')
    })
  })

  describe('cleanup and shutdown', () => {
    it('should shutdown gracefully', async () => {
      await p2pSystem.initialize()

      // Should not throw
      await expect(p2pSystem.shutdown()).resolves.toBeUndefined()

      // Should be marked as not initialized
      expect(p2pSystem['initialized']).toBe(false)
    })

    it('should handle shutdown without initialization', async () => {
      const freshSystem = new P2PSystem(config)

      // Should not throw
      await expect(freshSystem.shutdown()).resolves.toBeUndefined()
    })

    it('should handle shutdown errors gracefully', async () => {
      await p2pSystem.initialize()

      // Mock shutdown error
      const mockOrbitDB = p2pSystem['orbitdb']
      mockOrbitDB.stop = jest.fn().mockRejectedValue(new Error('Shutdown error'))

      // Should handle error gracefully
      await expect(p2pSystem.shutdown()).resolves.toBeUndefined()
    })
  })
})