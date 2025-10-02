/**
 * P2P Collection Synchronization Integration Tests
 * Tests real peer-to-peer collection sync without mocks
 */

import { P2PSystem } from '../p2p-system'
import { P2PConfig } from '../types'

// Test configuration for two peers
const createTestConfig = (userId: string, port: number): P2PConfig => ({
  userId,
  storage: {
    directory: `/tmp/claude/p2p-test-${userId}`,
    maxSize: 100 * 1024 * 1024 // 100MB
  },
  network: {
    bootstrap: [],
    maxPeers: 10
  },
  search: {
    indexSize: 1000,
    updateInterval: 5000
  },
  security: {
    requireProofOfWork: false,
    rateLimits: {
      maxOperationsPerMinute: 100,
      maxBytesPerOperation: 1024 * 1024, // 1MB
      maxBytesPerMinute: 10 * 1024 * 1024, // 10MB
      proofOfWorkDifficulty: 4
    }
  },
  schemas: {
    operationSchema: 'v1',
    activitySchema: 'v1'
  }
})

describe('P2P Collection Synchronization', () => {
  let peer1: P2PSystem
  let peer2: P2PSystem
  let collectionName: string

  beforeEach(async () => {
    // Create unique collection name for each test
    collectionName = `test-collection-${Date.now()}`

    // Initialize two peer systems
    peer1 = new P2PSystem(createTestConfig('peer1', 4002))
    peer2 = new P2PSystem(createTestConfig('peer2', 4003))

    // Initialize both peers
    await peer1.initialize()
    await peer2.initialize()

    // Wait for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 2000))
  })

  afterEach(async () => {
    if (peer1) await peer1.destroy()
    if (peer2) await peer2.destroy()

    // Clean up test directories
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  describe('Collection Discovery', () => {
    test('should discover collections created by other peers', async () => {
      // Peer1 creates a collection
      await peer1.openCollection(collectionName, {
        create: true,
        description: 'Test collection for sync'
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Peer2 should be able to discover the collection
      const collections = await peer2.listCollections()
      const foundCollection = collections.find(c => c.name === collectionName)

      expect(foundCollection).toBeDefined()
      expect(foundCollection?.name).toBe(collectionName)
      expect(foundCollection?.description).toBe('Test collection for sync')
    })

    test('should search for collections across peers', async () => {
      // Create collections with searchable names
      await peer1.openCollection(`${collectionName}-docs`, {
        create: true,
        description: 'Documentation collection'
      })

      await peer1.openCollection(`${collectionName}-media`, {
        create: true,
        description: 'Media files collection'
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Search from peer2
      const searchResults = await peer2.searchCollections('docs')
      expect(searchResults.length).toBeGreaterThan(0)

      const docCollection = searchResults.find(c => c.name.includes('docs'))
      expect(docCollection).toBeDefined()
    })
  })

  describe('Document Synchronization', () => {
    test('should sync documents between peers', async () => {
      // Create test file content
      const testContent = 'Hello P2P World!'
      const testFile = new File([testContent], 'test.txt', {
        type: 'text/plain'
      })

      // Peer1 creates collection and publishes document
      const collection1 = await peer1.openCollection(collectionName, {
        create: true,
        description: 'Sync test collection'
      })

      const document = await peer1.publishDocument(collectionName, testFile, {
        title: 'Test Document',
        description: 'Document for sync testing',
        tags: ['test', 'sync']
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Peer2 opens the same collection
      const collection2 = await peer2.openCollection(collectionName)

      // Peer2 should see the document
      const documents = await collection2.listDocuments()
      expect(documents.length).toBe(1)

      const syncedDoc = documents[0]
      expect(syncedDoc._id).toBe(document._id)
      expect(syncedDoc.title).toBe('Test Document')
      expect(syncedDoc.tags).toEqual(['test', 'sync'])
    })

    test('should handle concurrent document creation', async () => {
      // Both peers create collections
      const collection1 = await peer1.openCollection(collectionName, {
        create: true,
        description: 'Concurrent test collection'
      })

      const collection2 = await peer2.openCollection(collectionName, {
        create: true,
        description: 'Concurrent test collection'
      })

      // Both peers publish documents simultaneously
      const file1 = new File(['Content from peer 1'], 'peer1.txt', { type: 'text/plain' })
      const file2 = new File(['Content from peer 2'], 'peer2.txt', { type: 'text/plain' })

      const [doc1, doc2] = await Promise.all([
        peer1.publishDocument(collectionName, file1, {
          title: 'Document from Peer 1',
          tags: ['peer1']
        }),
        peer2.publishDocument(collectionName, file2, {
          title: 'Document from Peer 2',
          tags: ['peer2']
        })
      ])

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 6000))

      // Both peers should see both documents
      const docs1 = await collection1.listDocuments()
      const docs2 = await collection2.listDocuments()

      expect(docs1.length).toBe(2)
      expect(docs2.length).toBe(2)

      // Verify documents exist on both sides
      const titles1 = docs1.map(d => d.title).sort()
      const titles2 = docs2.map(d => d.title).sort()

      expect(titles1).toEqual(['Document from Peer 1', 'Document from Peer 2'])
      expect(titles2).toEqual(['Document from Peer 1', 'Document from Peer 2'])
    })
  })

  describe('Document Updates and Versioning', () => {
    test('should sync document updates across peers', async () => {
      // Setup: Create document on peer1
      const collection1 = await peer1.openCollection(collectionName, {
        create: true,
        description: 'Update test collection'
      })

      const testFile = new File(['Original content'], 'test.txt', { type: 'text/plain' })
      const document = await peer1.publishDocument(collectionName, testFile, {
        title: 'Original Title',
        description: 'Original description',
        tags: ['original']
      })

      // Wait for initial sync
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Peer2 opens collection and verifies document
      const collection2 = await peer2.openCollection(collectionName)
      let docs = await collection2.listDocuments()
      expect(docs.length).toBe(1)
      expect(docs[0].title).toBe('Original Title')

      // Peer1 updates the document
      await collection1.updateDocument(document._id, {
        title: 'Updated Title',
        description: 'Updated description',
        tags: ['original', 'updated']
      })

      // Wait for update sync
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Peer2 should see the updated document
      docs = await collection2.listDocuments()
      expect(docs.length).toBe(1)

      const updatedDoc = docs[0]
      expect(updatedDoc.title).toBe('Updated Title')
      expect(updatedDoc.description).toBe('Updated description')
      expect(updatedDoc.tags).toEqual(['original', 'updated'])
      expect(updatedDoc.provenance.version).toBeGreaterThan(1)
    })

    test('should handle document conflicts with last-writer-wins', async () => {
      // Setup: Both peers have the collection
      const collection1 = await peer1.openCollection(collectionName, {
        create: true,
        description: 'Conflict test collection'
      })

      const collection2 = await peer2.openCollection(collectionName)

      // Create initial document
      const testFile = new File(['Original'], 'conflict.txt', { type: 'text/plain' })
      const document = await peer1.publishDocument(collectionName, testFile, {
        title: 'Conflict Test',
        description: 'Will be updated by both peers',
        tags: ['conflict']
      })

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Both peers update simultaneously (creating conflict)
      const updatePromises = [
        collection1.updateDocument(document._id, {
          title: 'Updated by Peer 1',
          tags: ['conflict', 'peer1']
        }),
        collection2.updateDocument(document._id, {
          title: 'Updated by Peer 2',
          tags: ['conflict', 'peer2']
        })
      ]

      await Promise.all(updatePromises)

      // Wait for conflict resolution
      await new Promise(resolve => setTimeout(resolve, 6000))

      // Both peers should converge to same state (last-writer-wins)
      const docs1 = await collection1.listDocuments()
      const docs2 = await collection2.listDocuments()

      expect(docs1.length).toBe(1)
      expect(docs2.length).toBe(1)

      // Should converge to same final state
      const finalDoc1 = docs1[0]
      const finalDoc2 = docs2[0]

      expect(finalDoc1.title).toBe(finalDoc2.title)
      expect(finalDoc1.tags).toEqual(finalDoc2.tags)
      expect(finalDoc1.provenance.version).toBe(finalDoc2.provenance.version)
    })
  })

  describe('Collection Metadata Sync', () => {
    test('should sync collection metadata changes', async () => {
      // Peer1 creates collection with initial metadata
      const collection1 = await peer1.openCollection(collectionName, {
        create: true,
        description: 'Initial description'
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Peer2 discovers collection
      let collections = await peer2.listCollections()
      let foundCollection = collections.find(c => c.name === collectionName)
      expect(foundCollection?.description).toBe('Initial description')

      // Peer1 updates collection metadata
      await collection1.updateMetadata({
        description: 'Updated description',
        tags: ['updated', 'metadata']
      })

      // Wait for metadata sync
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Peer2 should see updated metadata
      collections = await peer2.listCollections()
      foundCollection = collections.find(c => c.name === collectionName)
      expect(foundCollection?.description).toBe('Updated description')
    })
  })

  describe('Peer Connection and Discovery', () => {
    test('should maintain sync when peers reconnect', async () => {
      // Setup: Create collection and document
      const collection1 = await peer1.openCollection(collectionName, {
        create: true,
        description: 'Reconnection test'
      })

      const testFile = new File(['Test content'], 'reconnect.txt', { type: 'text/plain' })
      await peer1.publishDocument(collectionName, testFile, {
        title: 'Reconnection Test Doc',
        tags: ['reconnect']
      })

      // Wait for initial sync
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Peer2 connects and syncs
      const collection2 = await peer2.openCollection(collectionName)
      let docs = await collection2.listDocuments()
      expect(docs.length).toBe(1)

      // Simulate disconnect/reconnect by destroying and recreating peer2
      await peer2.destroy()
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Recreate peer2
      peer2 = new P2PSystem(createTestConfig('peer2-reconnect', 4004))
      await peer2.initialize()
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Reconnected peer2 should still sync with collection
      const collection2Reconnected = await peer2.openCollection(collectionName)
      docs = await collection2Reconnected.listDocuments()
      expect(docs.length).toBe(1)
      expect(docs[0].title).toBe('Reconnection Test Doc')
    })
  })

  describe('Performance and Scalability', () => {
    test('should handle multiple document sync efficiently', async () => {
      const startTime = Date.now()

      // Create collection
      const collection1 = await peer1.openCollection(collectionName, {
        create: true,
        description: 'Performance test collection'
      })

      // Publish multiple documents
      const publishPromises = []
      for (let i = 0; i < 10; i++) {
        const file = new File([`Content ${i}`], `doc${i}.txt`, { type: 'text/plain' })
        publishPromises.push(
          peer1.publishDocument(collectionName, file, {
            title: `Document ${i}`,
            description: `Test document number ${i}`,
            tags: ['performance', `doc${i}`]
          })
        )
      }

      await Promise.all(publishPromises)

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 8000))

      // Peer2 should receive all documents
      const collection2 = await peer2.openCollection(collectionName)
      const docs = await collection2.listDocuments()

      expect(docs.length).toBe(10)

      // Verify document titles
      const titles = docs.map(d => d.title).sort()
      const expectedTitles = Array.from({ length: 10 }, (_, i) => `Document ${i}`).sort()
      expect(titles).toEqual(expectedTitles)

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete reasonably quickly (less than 30 seconds)
      expect(duration).toBeLessThan(30000)

      console.log(`Synced 10 documents in ${duration}ms`)
    })
  })
})