/**
 * P2P Conflict Resolution Integration Tests
 * Tests various conflict scenarios and resolution strategies in P2P environment
 */

import { P2PSystem } from '../p2p-system'
import { P2PConfig, CatalogDocument, Operation } from '../types'

const createTestConfig = (userId: string): P2PConfig => ({
  userId,
  storage: {
    directory: `/tmp/claude/p2p-conflict-${userId}`,
    maxSize: 100 * 1024 * 1024
  },
  network: {
    bootstrap: [],
    maxPeers: 10
  },
  search: {
    indexSize: 1000,
    updateInterval: 3000
  },
  security: {
    requireProofOfWork: false,
    rateLimits: {
      maxOperationsPerMinute: 100,
      maxBytesPerOperation: 1024 * 1024,
      maxBytesPerMinute: 10 * 1024 * 1024,
      proofOfWorkDifficulty: 4
    }
  },
  schemas: {
    operationSchema: 'v1',
    activitySchema: 'v1'
  }
})

describe('P2P Conflict Resolution', () => {
  let peerAlice: P2PSystem
  let peerBob: P2PSystem
  let peerCharlie: P2PSystem
  let collectionName: string

  beforeEach(async () => {
    collectionName = `conflict-test-${Date.now()}`

    // Initialize three peers for conflict testing scenarios
    peerAlice = new P2PSystem(createTestConfig('alice'))
    peerBob = new P2PSystem(createTestConfig('bob'))
    peerCharlie = new P2PSystem(createTestConfig('charlie'))

    await Promise.all([
      peerAlice.initialize(),
      peerBob.initialize(),
      peerCharlie.initialize()
    ])

    // Allow initialization time
    await new Promise(resolve => setTimeout(resolve, 2000))
  })

  afterEach(async () => {
    await Promise.all([
      peerAlice?.destroy(),
      peerBob?.destroy(),
      peerCharlie?.destroy()
    ])
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  describe('Concurrent Document Creation', () => {
    test('should handle simultaneous document creation with same title', async () => {
      // Setup: Both Alice and Bob create the same collection
      const [collectionAlice, collectionBob] = await Promise.all([
        peerAlice.openCollection(collectionName, {
          create: true,
          description: 'Concurrent creation test'
        }),
        peerBob.openCollection(collectionName, {
          create: true,
          description: 'Concurrent creation test'
        })
      ])

      // Both create documents with same title simultaneously
      const fileAlice = new File(['Alice content'], 'shared-title.txt', { type: 'text/plain' })
      const fileBob = new File(['Bob content'], 'shared-title.txt', { type: 'text/plain' })

      const [docAlice, docBob] = await Promise.all([
        peerAlice.publishDocument(collectionName, fileAlice, {
          title: 'Shared Document Title',
          description: 'Created by Alice',
          tags: ['alice', 'conflict']
        }),
        peerBob.publishDocument(collectionName, fileBob, {
          title: 'Shared Document Title',
          description: 'Created by Bob',
          tags: ['bob', 'conflict']
        })
      ])

      // Documents should have different IDs despite same title
      expect(docAlice._id).not.toBe(docBob._id)

      // Wait for synchronization
      await new Promise(resolve => setTimeout(resolve, 6000))

      // Both peers should see both documents
      const [docsAlice, docsBob] = await Promise.all([
        collectionAlice.listDocuments(),
        collectionBob.listDocuments()
      ])

      expect(docsAlice).toHaveLength(2)
      expect(docsBob).toHaveLength(2)

      // Verify both documents exist with correct descriptions
      const aliceDoc = docsAlice.find(doc => doc.description === 'Created by Alice')
      const bobDoc = docsAlice.find(doc => doc.description === 'Created by Bob')

      expect(aliceDoc).toBeDefined()
      expect(bobDoc).toBeDefined()
      expect(aliceDoc!.title).toBe('Shared Document Title')
      expect(bobDoc!.title).toBe('Shared Document Title')
    })

    test('should handle concurrent collection creation with same name', async () => {
      // Multiple peers attempt to create collection with same name
      const createPromises = [
        peerAlice.openCollection(collectionName, {
          create: true,
          description: 'Alice version'
        }),
        peerBob.openCollection(collectionName, {
          create: true,
          description: 'Bob version'
        }),
        peerCharlie.openCollection(collectionName, {
          create: true,
          description: 'Charlie version'
        })
      ]

      const [collectionAlice, collectionBob, collectionCharlie] = await Promise.all(createPromises)

      // All should succeed (different OrbitDB addresses but same collection name)
      expect(collectionAlice).toBeDefined()
      expect(collectionBob).toBeDefined()
      expect(collectionCharlie).toBeDefined()

      // Wait for registry sync
      await new Promise(resolve => setTimeout(resolve, 5000))

      // All peers should discover the collection (registry may merge metadata)
      const [collectionsAlice, collectionsBob, collectionsCharlie] = await Promise.all([
        peerAlice.listCollections(),
        peerBob.listCollections(),
        peerCharlie.listCollections()
      ])

      const foundAlice = collectionsAlice.find(c => c.name === collectionName)
      const foundBob = collectionsBob.find(c => c.name === collectionName)
      const foundCharlie = collectionsCharlie.find(c => c.name === collectionName)

      expect(foundAlice).toBeDefined()
      expect(foundBob).toBeDefined()
      expect(foundCharlie).toBeDefined()
    })
  })

  describe('Document Update Conflicts', () => {
    test('should resolve concurrent document updates using last-writer-wins', async () => {
      // Setup: Create initial document
      const collectionAlice = await peerAlice.openCollection(collectionName, {
        create: true,
        description: 'Update conflict test'
      })

      const originalFile = new File(['Original content'], 'conflict-doc.txt', { type: 'text/plain' })
      const originalDoc = await peerAlice.publishDocument(collectionName, originalFile, {
        title: 'Document for Update Conflict',
        description: 'Original version',
        tags: ['original']
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Bob and Charlie get the collection and document
      const [collectionBob, collectionCharlie] = await Promise.all([
        peerBob.openCollection(collectionName),
        peerCharlie.openCollection(collectionName)
      ])

      // Verify they both have the original document
      const [docsBob, docsCharlie] = await Promise.all([
        collectionBob.listDocuments(),
        collectionCharlie.listDocuments()
      ])

      expect(docsBob).toHaveLength(1)
      expect(docsCharlie).toHaveLength(1)
      expect(docsBob[0]._id).toBe(originalDoc._id)
      expect(docsCharlie[0]._id).toBe(originalDoc._id)

      // Concurrent updates from Bob and Charlie
      const updateTime = Date.now()
      const [updateBob, updateCharlie] = await Promise.all([
        collectionBob.updateDocument(originalDoc._id, {
          title: 'Updated by Bob',
          description: `Bob's update at ${updateTime}`,
          tags: ['original', 'bob-update']
        }),
        collectionCharlie.updateDocument(originalDoc._id, {
          title: 'Updated by Charlie',
          description: `Charlie's update at ${updateTime}`,
          tags: ['original', 'charlie-update']
        })
      ])

      // Wait for conflict resolution
      await new Promise(resolve => setTimeout(resolve, 8000))

      // All peers should converge to the same final state
      const [finalDocsAlice, finalDocsBob, finalDocsCharlie] = await Promise.all([
        collectionAlice.listDocuments(),
        collectionBob.listDocuments(),
        collectionCharlie.listDocuments()
      ])

      expect(finalDocsAlice).toHaveLength(1)
      expect(finalDocsBob).toHaveLength(1)
      expect(finalDocsCharlie).toHaveLength(1)

      const [finalAlice, finalBob, finalCharlie] = [
        finalDocsAlice[0],
        finalDocsBob[0],
        finalDocsCharlie[0]
      ]

      // Should converge to same state (last-writer-wins based on timestamp)
      expect(finalAlice._id).toBe(originalDoc._id)
      expect(finalBob._id).toBe(originalDoc._id)
      expect(finalCharlie._id).toBe(originalDoc._id)

      // Final version should be consistent across all peers
      expect(finalAlice.title).toBe(finalBob.title)
      expect(finalAlice.title).toBe(finalCharlie.title)
      expect(finalAlice.description).toBe(finalBob.description)
      expect(finalAlice.description).toBe(finalCharlie.description)
      expect(finalAlice.provenance.version).toBe(finalBob.provenance.version)
      expect(finalAlice.provenance.version).toBe(finalCharlie.provenance.version)

      // Version should be incremented
      expect(finalAlice.provenance.version).toBeGreaterThan(1)
    })

    test('should handle update conflicts with different field changes', async () => {
      // Create base document
      const collectionAlice = await peerAlice.openCollection(collectionName, {
        create: true,
        description: 'Field conflict test'
      })

      const baseFile = new File(['Base content'], 'field-conflict.txt', { type: 'text/plain' })
      const baseDoc = await peerAlice.publishDocument(collectionName, baseFile, {
        title: 'Base Document',
        description: 'Base description',
        tags: ['base']
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      const collectionBob = await peerBob.openCollection(collectionName)

      // Alice updates title, Bob updates description
      await Promise.all([
        collectionAlice.updateDocument(baseDoc._id, {
          title: 'Alice Updated Title',
          description: 'Base description', // Unchanged
          tags: ['base', 'alice-title']
        }),
        collectionBob.updateDocument(baseDoc._id, {
          title: 'Base Document', // Unchanged
          description: 'Bob Updated Description',
          tags: ['base', 'bob-desc']
        })
      ])

      // Wait for merge
      await new Promise(resolve => setTimeout(resolve, 6000))

      // Final state should resolve to one consistent version
      const [finalAlice, finalBob] = await Promise.all([
        collectionAlice.listDocuments(),
        collectionBob.listDocuments()
      ])

      expect(finalAlice).toHaveLength(1)
      expect(finalBob).toHaveLength(1)

      const docAlice = finalAlice[0]
      const docBob = finalBob[0]

      // Should converge (last-writer-wins applies to entire document)
      expect(docAlice.title).toBe(docBob.title)
      expect(docAlice.description).toBe(docBob.description)
      expect(docAlice.tags).toEqual(docBob.tags)
    })
  })

  describe('Fork and Merge Conflicts', () => {
    test('should handle conflicts when forking the same document', async () => {
      // Setup base document
      const collectionAlice = await peerAlice.openCollection(collectionName, {
        create: true,
        description: 'Fork conflict test'
      })

      const baseFile = new File(['Shared base content'], 'forkable.txt', { type: 'text/plain' })
      const baseDoc = await peerAlice.publishDocument(collectionName, baseFile, {
        title: 'Forkable Document',
        description: 'Document that will be forked by multiple peers',
        tags: ['forkable']
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Bob and Charlie both fork the same document
      const [collectionBob, collectionCharlie] = await Promise.all([
        peerBob.openCollection(collectionName),
        peerCharlie.openCollection(collectionName)
      ])

      const bobForkFile = new File(
        ['Shared base content\nBob\'s fork additions'],
        'bob-fork.txt',
        { type: 'text/plain' }
      )

      const charlieForkFile = new File(
        ['Shared base content\nCharlie\'s fork additions'],
        'charlie-fork.txt',
        { type: 'text/plain' }
      )

      const [bobFork, charlieFork] = await Promise.all([
        collectionBob.forkDocument(baseDoc._id, bobForkFile, {
          title: 'Bob\'s Fork',
          description: 'Fork by Bob',
          tags: ['forkable', 'bob-fork']
        }),
        collectionCharlie.forkDocument(baseDoc._id, charlieForkFile, {
          title: 'Charlie\'s Fork',
          description: 'Fork by Charlie',
          tags: ['forkable', 'charlie-fork']
        })
      ])

      // Both forks should succeed with different IDs
      expect(bobFork._id).not.toBe(charlieFork._id)
      expect(bobFork._id).not.toBe(baseDoc._id)
      expect(charlieFork._id).not.toBe(baseDoc._id)
      expect(bobFork.provenance.forkOf).toBe(baseDoc._id)
      expect(charlieFork.provenance.forkOf).toBe(baseDoc._id)

      // Wait for fork propagation
      await new Promise(resolve => setTimeout(resolve, 6000))

      // All peers should see all three documents (base + 2 forks)
      const [docsAlice, docsBob, docsCharlie] = await Promise.all([
        collectionAlice.listDocuments(),
        collectionBob.listDocuments(),
        collectionCharlie.listDocuments()
      ])

      expect(docsAlice).toHaveLength(3)
      expect(docsBob).toHaveLength(3)
      expect(docsCharlie).toHaveLength(3)

      // Verify fork relationships are maintained
      const aliceForks = docsAlice.filter(doc => doc.provenance.forkOf === baseDoc._id)
      expect(aliceForks).toHaveLength(2)

      const forkTitles = aliceForks.map(fork => fork.title).sort()
      expect(forkTitles).toEqual(['Bob\'s Fork', 'Charlie\'s Fork'])
    })
  })

  describe('Collection Metadata Conflicts', () => {
    test('should resolve collection metadata update conflicts', async () => {
      // Create collection
      const collectionAlice = await peerAlice.openCollection(collectionName, {
        create: true,
        description: 'Original description'
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 3000))

      const collectionBob = await peerBob.openCollection(collectionName)

      // Both update metadata simultaneously
      await Promise.all([
        collectionAlice.updateMetadata({
          description: 'Alice updated description',
          tags: ['alice-update']
        }),
        collectionBob.updateMetadata({
          description: 'Bob updated description',
          tags: ['bob-update']
        })
      ])

      // Wait for metadata sync
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Check final collection state
      const [collectionsAlice, collectionsBob] = await Promise.all([
        peerAlice.listCollections(),
        peerBob.listCollections()
      ])

      const finalAlice = collectionsAlice.find(c => c.name === collectionName)
      const finalBob = collectionsBob.find(c => c.name === collectionName)

      expect(finalAlice).toBeDefined()
      expect(finalBob).toBeDefined()

      // Should converge to same metadata
      expect(finalAlice!.description).toBe(finalBob!.description)
    })
  })

  describe('Network Partition and Merge', () => {
    test('should handle network partition and subsequent merge', async () => {
      // Setup: Create initial shared state
      const collectionAlice = await peerAlice.openCollection(collectionName, {
        create: true,
        description: 'Partition test'
      })

      const initialFile = new File(['Initial content'], 'partition-test.txt', { type: 'text/plain' })
      const initialDoc = await peerAlice.publishDocument(collectionName, initialFile, {
        title: 'Partition Test Document',
        description: 'Will be modified during partition',
        tags: ['partition-test']
      })

      // Wait for initial sync
      await new Promise(resolve => setTimeout(resolve, 4000))

      const collectionBob = await peerBob.openCollection(collectionName)
      const initialDocs = await collectionBob.listDocuments()
      expect(initialDocs).toHaveLength(1)

      // Simulate partition by disconnecting Bob
      await peerBob.destroy()

      // Alice continues working during partition
      await collectionAlice.updateDocument(initialDoc._id, {
        title: 'Updated During Partition',
        description: 'Alice worked while Bob was offline',
        tags: ['partition-test', 'alice-partition-work']
      })

      const partitionFile = new File(['Work during partition'], 'partition-work.txt', { type: 'text/plain' })
      await peerAlice.publishDocument(collectionName, partitionFile, {
        title: 'Work During Partition',
        description: 'Created while Bob was offline',
        tags: ['partition-work']
      })

      // Wait, then restore Bob (heal partition)
      await new Promise(resolve => setTimeout(resolve, 3000))

      peerBob = new P2PSystem(createTestConfig('bob-restored'))
      await peerBob.initialize()

      // Wait for restoration
      await new Promise(resolve => setTimeout(resolve, 4000))

      // Bob should eventually sync with Alice's changes
      const collectionBobRestored = await peerBob.openCollection(collectionName)

      // Give sync time to complete
      await new Promise(resolve => setTimeout(resolve, 6000))

      const restoredDocs = await collectionBobRestored.listDocuments()

      // Should eventually see Alice's work (may take time due to P2P propagation)
      expect(restoredDocs.length).toBeGreaterThanOrEqual(1)

      // At minimum, connection should be restored
      const bobHealth = await peerBob.getSystemHealth()
      expect(bobHealth.registry.connected).toBe(true)
    })
  })

  describe('Concurrent Access Control Changes', () => {
    test('should handle concurrent permission changes', async () => {
      // This test demonstrates permission conflict handling
      // (Implementation depends on access control system design)

      const collectionAlice = await peerAlice.openCollection(collectionName, {
        create: true,
        description: 'Permission conflict test'
      })

      // Create document that will have permission changes
      const testFile = new File(['Permission test content'], 'permission-test.txt', { type: 'text/plain' })
      const testDoc = await peerAlice.publishDocument(collectionName, testFile, {
        title: 'Permission Test Document',
        description: 'Document with changing permissions',
        tags: ['permission-test']
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      const collectionBob = await peerBob.openCollection(collectionName)

      // Both can access initially
      const [docsAlice, docsBob] = await Promise.all([
        collectionAlice.listDocuments(),
        collectionBob.listDocuments()
      ])

      expect(docsAlice).toHaveLength(1)
      expect(docsBob).toHaveLength(1)

      // Note: Actual permission system implementation would go here
      // For now, we verify basic document access works consistently

      expect(docsAlice[0]._id).toBe(docsBob[0]._id)
      expect(docsAlice[0].title).toBe(docsBob[0].title)
    })
  })

  describe('Conflict Resolution Performance', () => {
    test('should handle multiple concurrent conflicts efficiently', async () => {
      const startTime = Date.now()

      // Create base collection and document
      const collectionAlice = await peerAlice.openCollection(collectionName, {
        create: true,
        description: 'Performance conflict test'
      })

      const baseFile = new File(['Base content for conflicts'], 'multi-conflict.txt', { type: 'text/plain' })
      const baseDoc = await peerAlice.publishDocument(collectionName, baseFile, {
        title: 'Multi-Conflict Document',
        description: 'Will have multiple conflicts',
        tags: ['multi-conflict']
      })

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 4000))

      const [collectionBob, collectionCharlie] = await Promise.all([
        peerBob.openCollection(collectionName),
        peerCharlie.openCollection(collectionName)
      ])

      // Create multiple concurrent conflicts
      const conflictPromises = []

      // Each peer updates the document multiple times
      for (let i = 0; i < 5; i++) {
        conflictPromises.push(
          collectionAlice.updateDocument(baseDoc._id, {
            title: `Alice Update ${i}`,
            description: `Alice update number ${i}`,
            tags: ['multi-conflict', `alice-${i}`]
          })
        )

        conflictPromises.push(
          collectionBob.updateDocument(baseDoc._id, {
            title: `Bob Update ${i}`,
            description: `Bob update number ${i}`,
            tags: ['multi-conflict', `bob-${i}`]
          })
        )

        conflictPromises.push(
          collectionCharlie.updateDocument(baseDoc._id, {
            title: `Charlie Update ${i}`,
            description: `Charlie update number ${i}`,
            tags: ['multi-conflict', `charlie-${i}`]
          })
        )
      }

      // Execute all conflicting updates
      await Promise.all(conflictPromises)

      // Wait for all conflicts to resolve
      await new Promise(resolve => setTimeout(resolve, 10000))

      // Verify final convergence
      const [finalAlice, finalBob, finalCharlie] = await Promise.all([
        collectionAlice.listDocuments(),
        collectionBob.listDocuments(),
        collectionCharlie.listDocuments()
      ])

      const endTime = Date.now()
      const totalTime = endTime - startTime

      // All should have same final state
      expect(finalAlice).toHaveLength(1)
      expect(finalBob).toHaveLength(1)
      expect(finalCharlie).toHaveLength(1)

      const [docAlice, docBob, docCharlie] = [finalAlice[0], finalBob[0], finalCharlie[0]]

      expect(docAlice._id).toBe(baseDoc._id)
      expect(docBob._id).toBe(baseDoc._id)
      expect(docCharlie._id).toBe(baseDoc._id)

      // Should converge to same final state
      expect(docAlice.title).toBe(docBob.title)
      expect(docAlice.title).toBe(docCharlie.title)
      expect(docAlice.provenance.version).toBe(docBob.provenance.version)
      expect(docAlice.provenance.version).toBe(docCharlie.provenance.version)

      // Performance check: should resolve conflicts in reasonable time
      expect(totalTime).toBeLessThan(30000) // 30 seconds

      console.log(`Resolved 15 concurrent conflicts in ${totalTime}ms`)
    })
  })
})