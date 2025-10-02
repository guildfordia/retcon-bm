import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'
import { createHash } from 'crypto'

// Helper function to generate IDs
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Generate DID from private key (same logic as P2P auth)
function generateDID(privateKeyBase64: string): string {
  const keyData = Buffer.from(privateKeyBase64, 'base64')
  const hash = createHash('sha256').update(keyData).digest('hex').substring(0, 32)
  return `did:p2p:${hash}`
}

// Private keys from auth page
const THEODORE_PRIVATE_KEY = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSUVic1l3K3dZSFdabzlqWjFvaGRiL1JwYnVEcHdMdjNnNGZKUjl3YmxmZHMKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo='
const DUMMY_PRIVATE_KEY = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSU9qRmxmV0tQcVFvNHhCVFphOGlwVmFmd0JKQWl3cFpEbjRvOCtENi9VMzgKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo='

// Seed database with example P2P/OrbitDB data
export async function POST() {
  try {
    const db = getDatabase()

    console.log('🌱 Starting P2P/OrbitDB database seed...')

    // Check OrbitDB health first
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }
    console.log(`✓ OrbitDB service healthy (peer: ${health.peerId})`)

    // ===== STEP 1: Generate P2P DIDs for users =====
    console.log('\n👥 Generating P2P identities...')

    // Generate DIDs from private keys (same as P2P auth does)
    const dummyDID = generateDID(DUMMY_PRIVATE_KEY)
    const theodoreDID = generateDID(THEODORE_PRIVATE_KEY)

    console.log(`  ✓ Generated DID for 'dummy': ${dummyDID}`)
    console.log(`  ✓ Generated DID for 'theodore': ${theodoreDID}`)

    // Check if collections already exist for these users
    const existingDummyCollections = await userCollectionRegistry.getUserCollections(dummyDID)
    const existingTheodoreCollections = await userCollectionRegistry.getUserCollections(theodoreDID)

    if (existingDummyCollections.length > 0 && existingTheodoreCollections.length > 0) {
      return NextResponse.json({
        message: 'Database already seeded',
        note: 'Collections already exist for dummy and theodore. Use clean-rebuild to reset OrbitDB data.',
        orbitdbPeerId: health.peerId,
        collections: {
          dummy: existingDummyCollections.length,
          theodore: existingTheodoreCollections.length
        }
      }, { status: 200 })
    }

    const userMap: Record<string, { did: string, username: string }> = {
      dummy: { did: dummyDID, username: 'dummy' },
      theodore: { did: theodoreDID, username: 'theodore' }
    }

    // ===== STEP 2: Create P2P Collections and Documents in OrbitDB =====
    console.log('\n📚 Creating P2P collections in OrbitDB...')

    // Create dummy's collection
    const dummyCollection = await orbitdbClient.createCollection(
      userMap.dummy.did,
      'My Reading Collection',
      'Personal quotes and references from my favorite books'
    )
    userCollectionRegistry.addUserCollection(userMap.dummy.did, dummyCollection.storeName)
    console.log(`  ✓ Created P2P collection for dummy: '${dummyCollection.name}'`)
    console.log(`    OrbitDB Address: ${dummyCollection.address}`)

    // Add dummy's documents immediately while store is open
    console.log('\n📄 Adding documents to dummy\'s collection...')

    // Dummy's documents
    const dummyDocs = [
      {
        id: generateId('doc'),
        documentType: 'quote',
        title: 'Stanford Commencement Address',
        description: 'Inspirational quote about work and passion',
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        created: Date.now(),
        lastAccessed: Date.now(),
        metadata: {
          quoteContent: 'The only way to do great work is to love what you do.',
          author: 'Steve Jobs',
          title: 'Stanford Commencement Address',
          year: '2005',
          publisher: 'Stanford University',
          keywords: ['motivation', 'career', 'passion', 'work'],
          pageNumbers: 'Speech transcript'
        },
        replicas: [userMap.dummy.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'link',
        title: 'Peer-to-peer - Wikipedia',
        description: 'Comprehensive overview of P2P networking architecture',
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        created: Date.now(),
        lastAccessed: Date.now(),
        metadata: {
          url: 'https://en.wikipedia.org/wiki/Peer-to-peer',
          title: 'Peer-to-peer',
          description: 'Overview of P2P distributed architecture and networking',
          author: 'Wikipedia Contributors',
          siteName: 'Wikipedia',
          keywords: ['p2p', 'networking', 'distributed', 'architecture']
        },
        replicas: [userMap.dummy.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'image',
        title: 'Abstract Network Visualization',
        description: 'Visual representation of distributed network topology',
        filename: 'network-viz.jpg',
        size: 524288,
        mimeType: 'image/jpeg',
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        ipfsHash: `QmMockHash${Date.now().toString(36)}DummyImage`,
        created: Date.now(),
        lastAccessed: Date.now(),
        metadata: {
          title: 'Network Topology Diagram',
          description: 'Distributed P2P network visualization',
          creator: 'dummy',
          keywords: ['network', 'visualization', 'topology', 'p2p']
        },
        replicas: [userMap.dummy.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'quote',
        title: 'The Tao of Programming',
        description: 'Wisdom on software development and simplicity',
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        created: Date.now() - 10000,
        lastAccessed: Date.now(),
        metadata: {
          quoteContent: 'A program should follow the Law of Least Astonishment. What is this law? It is simply that the program should always respond to the user in the way that astonishes them least.',
          author: 'Geoffrey James',
          title: 'The Tao of Programming',
          year: '1987',
          publisher: 'InfoBooks',
          keywords: ['programming', 'wisdom', 'design', 'user experience'],
          pageNumbers: 'Book 2.1'
        },
        replicas: [userMap.dummy.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'link',
        title: 'OrbitDB - Peer-to-Peer Databases',
        description: 'Serverless, distributed, peer-to-peer database',
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        created: Date.now() - 20000,
        lastAccessed: Date.now(),
        metadata: {
          url: 'https://orbitdb.org/',
          title: 'OrbitDB',
          description: 'A serverless, distributed, peer-to-peer database built on IPFS',
          author: 'Haja Networks',
          siteName: 'OrbitDB',
          keywords: ['orbitdb', 'database', 'p2p', 'ipfs', 'distributed']
        },
        replicas: [userMap.dummy.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'image',
        title: 'Data Flow Diagram',
        description: 'Information flow in decentralized systems',
        filename: 'data-flow.png',
        size: 612000,
        mimeType: 'image/png',
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        ipfsHash: `QmMockHash${Date.now().toString(36)}DummyImage2`,
        created: Date.now() - 30000,
        lastAccessed: Date.now(),
        metadata: {
          title: 'Decentralized Data Flow',
          description: 'Visual guide to data synchronization across peers',
          creator: 'dummy',
          keywords: ['data', 'flow', 'synchronization', 'decentralized']
        },
        replicas: [userMap.dummy.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      }
    ]

    for (const doc of dummyDocs) {
      await orbitdbClient.addDocumentToCollection(dummyCollection.storeName, doc)
      const emoji = doc.documentType === 'quote' ? '📝' : doc.documentType === 'link' ? '🔗' : '🖼️'
      console.log(`  ${emoji} Added ${doc.documentType}: '${doc.title}'`)
    }

    // Create theodore's collection
    const theodoreCollection = await orbitdbClient.createCollection(
      userMap.theodore.did,
      'Research Archive',
      'Technical resources, citations, and research materials'
    )
    userCollectionRegistry.addUserCollection(userMap.theodore.did, theodoreCollection.storeName)
    console.log(`\n  ✓ Created P2P collection for theodore: '${theodoreCollection.name}'`)
    console.log(`    OrbitDB Address: ${theodoreCollection.address}`)

    // Add theodore's documents immediately while store is open
    console.log('\n📄 Adding documents to theodore\'s collection...')

    // Theodore's documents
    const theodoreDocs = [
      {
        id: generateId('doc'),
        documentType: 'quote',
        title: 'Designing Data-Intensive Applications',
        description: 'Key insights on distributed systems architecture',
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        created: Date.now(),
        lastAccessed: Date.now(),
        metadata: {
          quoteContent: 'The biggest challenge in distributed systems is dealing with partial failures.',
          author: 'Martin Kleppmann',
          title: 'Designing Data-Intensive Applications',
          publisher: "O'Reilly Media",
          year: '2017',
          isbn: '978-1449373320',
          keywords: ['distributed systems', 'databases', 'architecture', 'reliability'],
          pageNumbers: '174-186'
        },
        replicas: [userMap.theodore.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'link',
        title: 'IPFS Documentation',
        description: 'Official InterPlanetary File System documentation',
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        created: Date.now(),
        lastAccessed: Date.now(),
        metadata: {
          url: 'https://docs.ipfs.tech/',
          title: 'IPFS Docs',
          description: 'A peer-to-peer hypermedia protocol designed to preserve and grow humanity\'s knowledge',
          author: 'Protocol Labs',
          siteName: 'IPFS Documentation',
          keywords: ['ipfs', 'p2p', 'storage', 'protocol', 'documentation']
        },
        replicas: [userMap.theodore.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'image',
        title: 'System Architecture Diagram',
        description: 'Technical architecture of distributed storage system',
        filename: 'architecture-diagram.png',
        size: 819200,
        mimeType: 'image/png',
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        ipfsHash: `QmMockHash${Date.now().toString(36)}TheodoreImage`,
        created: Date.now(),
        lastAccessed: Date.now(),
        metadata: {
          title: 'Distributed Storage Architecture',
          description: 'System design showing IPFS and OrbitDB integration',
          creator: 'theodore',
          source: 'Internal research',
          date: new Date().toISOString().split('T')[0],
          keywords: ['architecture', 'system design', 'ipfs', 'orbitdb', 'distributed']
        },
        replicas: [userMap.theodore.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'quote',
        title: 'The Byzantine Generals Problem',
        description: 'Foundational paper on distributed consensus',
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        created: Date.now() - 10000,
        lastAccessed: Date.now(),
        metadata: {
          quoteContent: 'We imagine that several divisions of the Byzantine army are camped outside an enemy city, each division commanded by its own general. The generals can communicate with one another only by messenger.',
          author: 'Leslie Lamport, Robert Shostak, Marshall Pease',
          title: 'The Byzantine Generals Problem',
          publisher: 'ACM Transactions on Programming Languages and Systems',
          year: '1982',
          keywords: ['consensus', 'distributed systems', 'fault tolerance', 'blockchain'],
          pageNumbers: '382-401'
        },
        replicas: [userMap.theodore.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'link',
        title: 'Libp2p - Modular P2P Networking Stack',
        description: 'Networking layer for peer-to-peer applications',
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        created: Date.now() - 20000,
        lastAccessed: Date.now(),
        metadata: {
          url: 'https://libp2p.io/',
          title: 'libp2p',
          description: 'A modular network stack for peer-to-peer applications',
          author: 'Protocol Labs',
          siteName: 'libp2p Documentation',
          keywords: ['libp2p', 'networking', 'p2p', 'protocol', 'modular']
        },
        replicas: [userMap.theodore.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      },
      {
        id: generateId('doc'),
        documentType: 'image',
        title: 'Merkle DAG Structure',
        description: 'Visual explanation of content-addressed data structures',
        filename: 'merkle-dag.svg',
        size: 156000,
        mimeType: 'image/svg+xml',
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        ipfsHash: `QmMockHash${Date.now().toString(36)}TheodoreImage2`,
        created: Date.now() - 30000,
        lastAccessed: Date.now(),
        metadata: {
          title: 'Merkle DAG Visualization',
          description: 'Directed acyclic graph showing cryptographic linking',
          creator: 'theodore',
          source: 'Research notes',
          date: new Date().toISOString().split('T')[0],
          keywords: ['merkle', 'dag', 'cryptography', 'data structures', 'ipfs']
        },
        replicas: [userMap.theodore.did],
        pinned: true,
        type: 'DOCUMENT',
        version: 1
      }
    ]

    for (const doc of theodoreDocs) {
      await orbitdbClient.addDocumentToCollection(theodoreCollection.storeName, doc)
      const emoji = doc.documentType === 'quote' ? '📝' : doc.documentType === 'link' ? '🔗' : '🖼️'
      console.log(`  ${emoji} Added ${doc.documentType}: '${doc.title}'`)
    }

    console.log('\n✅ P2P/OrbitDB database seeded successfully!')
    console.log(`   - ${dummyDocs.length} documents in dummy's collection`)
    console.log(`   - ${theodoreDocs.length} documents in theodore's collection`)

    return NextResponse.json({
      success: true,
      message: 'P2P/OrbitDB collections and documents seeded successfully',
      storage: 'OrbitDB',
      orbitdbPeerId: health.peerId,
      data: {
        p2pCollections: 2,
        p2pDocuments: 6,
        collections: [
          {
            name: dummyCollection.name,
            address: dummyCollection.address,
            owner: 'dummy',
            ownerId: userMap.dummy.did,
            documents: dummyDocs.length
          },
          {
            name: theodoreCollection.name,
            address: theodoreCollection.address,
            owner: 'theodore',
            ownerId: userMap.theodore.did,
            documents: theodoreDocs.length
          }
        ]
      },
      note: 'Data persists in OrbitDB volume across rebuilds. Use clean-rebuild to reset OrbitDB data.',
      reminder: 'Users must be created through auth page before seeding.'
    }, { status: 201 })

  } catch (error: any) {
    console.error('❌ P2P seeding failed:', error)
    return NextResponse.json(
      { error: 'Failed to seed P2P database', details: error.message },
      { status: 500 }
    )
  }
}
