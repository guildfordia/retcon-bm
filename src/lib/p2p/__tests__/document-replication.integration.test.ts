/**
 * P2P Document Replication Integration Tests
 * Tests document-level replication, forking, and content distribution
 */

import { P2PSystem } from '../p2p-system'
import { CollectionCQRS } from '../collection-cqrs'
import { P2PConfig, CatalogDocument } from '../types'

const createTestConfig = (userId: string): P2PConfig => ({
  userId,
  storage: {
    directory: `/tmp/claude/p2p-doc-test-${userId}`,
    maxSize: 100 * 1024 * 1024
  },
  network: {
    bootstrap: [],
    maxPeers: 15
  },
  search: {
    indexSize: 1000,
    updateInterval: 3000
  },
  security: {
    requireProofOfWork: false,
    rateLimits: {
      maxOperationsPerMinute: 200,
      maxBytesPerOperation: 2 * 1024 * 1024, // 2MB
      maxBytesPerMinute: 20 * 1024 * 1024, // 20MB
      proofOfWorkDifficulty: 4
    }
  },
  schemas: {
    operationSchema: 'v1',
    activitySchema: 'v1'
  }
})

describe('P2P Document Replication', () => {
  let authorPeer: P2PSystem
  let replicatorPeer: P2PSystem
  let forkerPeer: P2PSystem
  let collectionName: string

  beforeEach(async () => {
    collectionName = `doc-replication-${Date.now()}`

    // Initialize three peers: original author, replicator, and forker
    authorPeer = new P2PSystem(createTestConfig('author'))
    replicatorPeer = new P2PSystem(createTestConfig('replicator'))
    forkerPeer = new P2PSystem(createTestConfig('forker'))

    await Promise.all([
      authorPeer.initialize(),
      replicatorPeer.initialize(),
      forkerPeer.initialize()
    ])

    // Allow time for initialization
    await new Promise(resolve => setTimeout(resolve, 2000))
  })

  afterEach(async () => {
    await Promise.all([
      authorPeer?.destroy(),
      replicatorPeer?.destroy(),
      forkerPeer?.destroy()
    ])

    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  describe('Basic Document Replication', () => {
    test('should replicate documents across multiple peers', async () => {
      // Author creates collection and publishes document
      const authorCollection = await authorPeer.openCollection(collectionName, {
        create: true,
        description: 'Document replication test'
      })

      const originalFile = new File(
        ['# Original Document\n\nThis is the original content.'],
        'original.md',
        { type: 'text/markdown' }
      )

      const originalDoc = await authorPeer.publishDocument(collectionName, originalFile, {
        title: 'Original Document',
        description: 'The source document for replication testing',
        tags: ['original', 'source']
      })

      // Wait for network propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Replicator peer opens same collection
      const replicatorCollection = await replicatorPeer.openCollection(collectionName)

      // Should see the replicated document
      const replicatedDocs = await replicatorCollection.listDocuments()
      expect(replicatedDocs).toHaveLength(1)

      const replicatedDoc = replicatedDocs[0]
      expect(replicatedDoc._id).toBe(originalDoc._id)
      expect(replicatedDoc.title).toBe('Original Document')
      expect(replicatedDoc.ipfsCID).toBe(originalDoc.ipfsCID)
      expect(replicatedDoc.tags).toEqual(['original', 'source'])
    })

    test('should maintain document integrity during replication', async () => {
      // Create document with specific content
      const testContent = 'Test content for integrity verification'
      const testFile = new File([testContent], 'integrity.txt', { type: 'text/plain' })

      const authorCollection = await authorPeer.openCollection(collectionName, {
        create: true,
        description: 'Integrity test collection'
      })

      const originalDoc = await authorPeer.publishDocument(collectionName, testFile, {
        title: 'Integrity Test Document',
        description: 'Testing content integrity',
        tags: ['integrity', 'test']
      })

      // Wait for replication
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Multiple peers replicate the same document
      const [replicatorCollection, forkerCollection] = await Promise.all([
        replicatorPeer.openCollection(collectionName),
        forkerPeer.openCollection(collectionName)
      ])

      const [replicatorDocs, forkerDocs] = await Promise.all([
        replicatorCollection.listDocuments(),
        forkerCollection.listDocuments()
      ])

      // All peers should have identical document metadata
      expect(replicatorDocs).toHaveLength(1)
      expect(forkerDocs).toHaveLength(1)

      const [replicatedDoc1, replicatedDoc2] = [replicatorDocs[0], forkerDocs[0]]

      // Verify identical replication
      expect(replicatedDoc1._id).toBe(originalDoc._id)
      expect(replicatedDoc2._id).toBe(originalDoc._id)
      expect(replicatedDoc1.ipfsCID).toBe(originalDoc.ipfsCID)
      expect(replicatedDoc2.ipfsCID).toBe(originalDoc.ipfsCID)
      expect(replicatedDoc1.provenance.version).toBe(originalDoc.provenance.version)
      expect(replicatedDoc2.provenance.version).toBe(originalDoc.provenance.version)
    })
  })

  describe('Document Forking', () => {
    test('should create forks of existing documents', async () => {
      // Setup: Author creates original document
      const authorCollection = await authorPeer.openCollection(collectionName, {
        create: true,
        description: 'Forking test collection'
      })

      const originalFile = new File(
        ['Original content to be forked'],
        'original.txt',
        { type: 'text/plain' }
      )

      const originalDoc = await authorPeer.publishDocument(collectionName, originalFile, {
        title: 'Original for Forking',
        description: 'Document to be forked',
        tags: ['original']
      })

      // Wait for replication
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Forker peer creates a fork
      const forkerCollection = await forkerPeer.openCollection(collectionName)

      const modifiedFile = new File(
        ['Original content to be forked\n\nADDED: Modified content in fork'],
        'forked.txt',
        { type: 'text/plain' }
      )

      const forkedDoc = await forkerCollection.forkDocument(originalDoc._id, modifiedFile, {
        title: 'Forked Version',
        description: 'Fork of the original document',
        tags: ['original', 'forked']
      })

      // Verify fork properties
      expect(forkedDoc._id).not.toBe(originalDoc._id)
      expect(forkedDoc.provenance.forkOf).toBe(originalDoc._id)
      expect(forkedDoc.provenance.version).toBe(1) // New document starts at version 1
      expect(forkedDoc.title).toBe('Forked Version')
      expect(forkedDoc.tags).toEqual(['original', 'forked'])

      // Wait for fork propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Original author should see both documents
      const allDocs = await authorCollection.listDocuments()
      expect(allDocs).toHaveLength(2)

      const docTitles = allDocs.map(d => d.title).sort()
      expect(docTitles).toEqual(['Forked Version', 'Original for Forking'])
    })

    test('should maintain fork relationships across peers', async () => {
      // Create original document
      const authorCollection = await authorPeer.openCollection(collectionName, {
        create: true,
        description: 'Fork relationship test'
      })

      const originalFile = new File(['Base content'], 'base.txt', { type: 'text/plain' })
      const originalDoc = await authorPeer.publishDocument(collectionName, originalFile, {
        title: 'Base Document',
        description: 'Base for fork relationship testing',
        tags: ['base']
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Multiple peers create forks
      const [replicatorCollection, forkerCollection] = await Promise.all([
        replicatorPeer.openCollection(collectionName),
        forkerPeer.openCollection(collectionName)
      ])

      const fork1File = new File(['Base content\nFork 1 additions'], 'fork1.txt', { type: 'text/plain' })
      const fork2File = new File(['Base content\nFork 2 additions'], 'fork2.txt', { type: 'text/plain' })

      const [fork1, fork2] = await Promise.all([
        replicatorCollection.forkDocument(originalDoc._id, fork1File, {
          title: 'Fork 1',
          tags: ['base', 'fork1']
        }),
        forkerCollection.forkDocument(originalDoc._id, fork2File, {
          title: 'Fork 2',
          tags: ['base', 'fork2']
        })
      ])

      // Wait for all forks to propagate
      await new Promise(resolve => setTimeout(resolve, 6000))

      // All peers should see the complete fork tree
      const allDocsAuthor = await authorCollection.listDocuments()
      const allDocsReplicator = await replicatorCollection.listDocuments()
      const allDocsForker = await forkerCollection.listDocuments()

      // Should have original + 2 forks = 3 documents
      expect(allDocsAuthor).toHaveLength(3)
      expect(allDocsReplicator).toHaveLength(3)
      expect(allDocsForker).toHaveLength(3)

      // Verify fork relationships are preserved
      const forks1 = allDocsAuthor.filter(doc => doc.provenance.forkOf === originalDoc._id)
      const forks2 = allDocsReplicator.filter(doc => doc.provenance.forkOf === originalDoc._id)
      const forks3 = allDocsForker.filter(doc => doc.provenance.forkOf === originalDoc._id)

      expect(forks1).toHaveLength(2)
      expect(forks2).toHaveLength(2)
      expect(forks3).toHaveLength(2)
    })
  })

  describe('Large Document Replication', () => {
    test('should replicate large documents efficiently', async () => {
      // Create a larger document (1MB)
      const largeContent = 'A'.repeat(1024 * 1024) // 1MB of 'A' characters
      const largeFile = new File([largeContent], 'large.txt', { type: 'text/plain' })

      const authorCollection = await authorPeer.openCollection(collectionName, {
        create: true,
        description: 'Large document test'
      })

      const startTime = Date.now()

      const largeDoc = await authorPeer.publishDocument(collectionName, largeFile, {
        title: 'Large Document',
        description: 'Testing large document replication',
        tags: ['large', 'performance']
      })

      // Wait for replication (longer timeout for large file)
      await new Promise(resolve => setTimeout(resolve, 10000))

      // Verify replication on other peers
      const [replicatorCollection, forkerCollection] = await Promise.all([
        replicatorPeer.openCollection(collectionName),
        forkerPeer.openCollection(collectionName)
      ])

      const [replicatorDocs, forkerDocs] = await Promise.all([
        replicatorCollection.listDocuments(),
        forkerCollection.listDocuments()
      ])

      const endTime = Date.now()
      const totalTime = endTime - startTime

      // Verify successful replication
      expect(replicatorDocs).toHaveLength(1)
      expect(forkerDocs).toHaveLength(1)
      expect(replicatorDocs[0]._id).toBe(largeDoc._id)
      expect(forkerDocs[0]._id).toBe(largeDoc._id)
      expect(replicatorDocs[0].size).toBe(largeDoc.size)
      expect(forkerDocs[0].size).toBe(largeDoc.size)

      // Should complete within reasonable time (less than 60 seconds)
      expect(totalTime).toBeLessThan(60000)

      console.log(`Replicated 1MB document to 2 peers in ${totalTime}ms`)
    })
  })

  describe('Document Update Replication', () => {
    test('should replicate document updates across peers', async () => {
      // Setup: Create and replicate initial document
      const authorCollection = await authorPeer.openCollection(collectionName, {
        create: true,
        description: 'Update replication test'
      })

      const initialFile = new File(['Version 1 content'], 'updateable.txt', { type: 'text/plain' })
      const originalDoc = await authorPeer.publishDocument(collectionName, initialFile, {
        title: 'Updateable Document',
        description: 'Version 1',
        tags: ['updateable', 'v1']
      })

      // Wait for initial replication
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Verify initial replication
      const replicatorCollection = await replicatorPeer.openCollection(collectionName)
      let replicatedDocs = await replicatorCollection.listDocuments()
      expect(replicatedDocs[0].description).toBe('Version 1')
      expect(replicatedDocs[0].provenance.version).toBe(1)

      // Author updates the document
      await authorCollection.updateDocument(originalDoc._id, {
        title: 'Updateable Document',
        description: 'Version 2 - Updated',
        tags: ['updateable', 'v1', 'v2']
      })

      // Wait for update replication
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Verify update replication
      replicatedDocs = await replicatorCollection.listDocuments()
      expect(replicatedDocs).toHaveLength(1)

      const updatedDoc = replicatedDocs[0]
      expect(updatedDoc._id).toBe(originalDoc._id)
      expect(updatedDoc.description).toBe('Version 2 - Updated')
      expect(updatedDoc.tags).toEqual(['updateable', 'v1', 'v2'])
      expect(updatedDoc.provenance.version).toBe(2)
      expect(updatedDoc.provenance.updated).toBeGreaterThan(updatedDoc.provenance.created)
    })
  })

  describe('Cross-Collection Document References', () => {
    test('should handle documents that reference other collections', async () => {
      // Create first collection with source document
      const sourceCollection = await authorPeer.openCollection(`${collectionName}-source`, {
        create: true,
        description: 'Source collection'
      })

      const sourceFile = new File(['Source document content'], 'source.txt', { type: 'text/plain' })
      const sourceDoc = await authorPeer.publishDocument(`${collectionName}-source`, sourceFile, {
        title: 'Source Document',
        description: 'Referenced by other documents',
        tags: ['source']
      })

      // Create second collection with referencing document
      const refCollection = await authorPeer.openCollection(`${collectionName}-ref`, {
        create: true,
        description: 'Referencing collection'
      })

      const refFile = new File(
        [`Reference to document: ${sourceDoc._id}`],
        'reference.txt',
        { type: 'text/plain' }
      )

      const refDoc = await authorPeer.publishDocument(`${collectionName}-ref`, refFile, {
        title: 'Referencing Document',
        description: `References ${sourceDoc._id}`,
        tags: ['reference']
      })

      // Wait for replication
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Other peer should be able to discover both collections and documents
      const [sourceCollectionReplica, refCollectionReplica] = await Promise.all([
        replicatorPeer.openCollection(`${collectionName}-source`),
        replicatorPeer.openCollection(`${collectionName}-ref`)
      ])

      const [sourceDocs, refDocs] = await Promise.all([
        sourceCollectionReplica.listDocuments(),
        refCollectionReplica.listDocuments()
      ])

      expect(sourceDocs).toHaveLength(1)
      expect(refDocs).toHaveLength(1)
      expect(sourceDocs[0]._id).toBe(sourceDoc._id)
      expect(refDocs[0]._id).toBe(refDoc._id)

      // Cross-collection reference should be maintained
      expect(refDocs[0].description).toContain(sourceDoc._id)
    })
  })

  describe('Replication Performance Metrics', () => {
    test('should provide replication metrics', async () => {
      const authorCollection = await authorPeer.openCollection(collectionName, {
        create: true,
        description: 'Metrics test collection'
      })

      // Publish multiple documents for metrics testing
      const publishPromises = []
      for (let i = 0; i < 5; i++) {
        const file = new File([`Document ${i} content`], `doc${i}.txt`, { type: 'text/plain' })
        publishPromises.push(
          authorPeer.publishDocument(collectionName, file, {
            title: `Metrics Test Doc ${i}`,
            tags: ['metrics', `doc${i}`]
          })
        )
      }

      await Promise.all(publishPromises)

      // Wait for replication
      await new Promise(resolve => setTimeout(resolve, 6000))

      // Check system health metrics
      const [authorHealth, replicatorHealth] = await Promise.all([
        authorPeer.getSystemHealth(),
        replicatorPeer.getSystemHealth()
      ])

      // Verify metrics are being tracked
      expect(authorHealth.collections.subscribed).toBeGreaterThan(0)
      expect(authorHealth.registry.connected).toBe(true)
      expect(replicatorHealth.collections.subscribed).toBeGreaterThan(0)
      expect(replicatorHealth.registry.connected).toBe(true)

      // Both peers should have same number of documents
      const replicatorCollection = await replicatorPeer.openCollection(collectionName)
      const replicatedDocs = await replicatorCollection.listDocuments()
      expect(replicatedDocs).toHaveLength(5)
    })
  })
})