import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'
import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

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

// Helper function to upload image from seed-data folder to IPFS
async function uploadImageToIPFS(filename: string): Promise<{ cid: string, size: number, mimeType: string }> {
  const imagePath = path.join(process.cwd(), 'seed-data', 'images', filename)
  const imageBuffer = await fs.readFile(imagePath)

  const cid = await orbitdbClient.uploadFileToIPFS(imageBuffer, filename)

  // Determine MIME type from extension
  const ext = path.extname(filename).toLowerCase()
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                   ext === '.png' ? 'image/png' :
                   ext === '.gif' ? 'image/gif' : 'image/jpeg'

  console.log(`  📤 Uploaded ${filename} to IPFS: ${cid}`)
  return { cid, size: imageBuffer.length, mimeType }
}

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
      "dummy's collection", // Auto-naming: username's collection
      '' // No description
    )
    userCollectionRegistry.addUserCollection(userMap.dummy.did, dummyCollection.storeName)
    console.log(`  ✓ Created P2P collection for dummy: '${dummyCollection.name}'`)
    console.log(`    OrbitDB Address: ${dummyCollection.address}`)

    // Add dummy's documents immediately while store is open
    console.log('\n📄 Adding documents to dummy\'s collection...')

    // Upload content to IPFS first
    console.log('  📤 Uploading content to IPFS...')

    // Quote 1 - Upload quote text to IPFS
    const quote1Text = 'The only way to do great work is to love what you do.'
    const quote1CID = await orbitdbClient.uploadTextToIPFS(quote1Text)
    console.log(`  ✓ Quote 1 uploaded to IPFS: ${quote1CID}`)

    // Link 1 - Upload URL to IPFS
    const link1URL = 'https://en.wikipedia.org/wiki/Peer-to-peer'
    const link1CID = await orbitdbClient.uploadTextToIPFS(link1URL)
    console.log(`  ✓ Link 1 URL uploaded to IPFS: ${link1CID}`)

    // Image 1 - Upload real Black Mountain image to IPFS
    const image1 = await uploadImageToIPFS('black-mountain-college-BMC_4.jpg')

    // Quote 2 - Upload quote text to IPFS
    const quote2Text = 'A program should follow the Law of Least Astonishment. What is this law? It is simply that the program should always respond to the user in the way that astonishes them least.'
    const quote2CID = await orbitdbClient.uploadTextToIPFS(quote2Text)
    console.log(`  ✓ Quote 2 uploaded to IPFS: ${quote2CID}`)

    // Link 2 - Upload URL to IPFS
    const link2URL = 'https://orbitdb.org/'
    const link2CID = await orbitdbClient.uploadTextToIPFS(link2URL)
    console.log(`  ✓ Link 2 URL uploaded to IPFS: ${link2CID}`)

    // Image 2 - Upload real Black Mountain image to IPFS
    const image2 = await uploadImageToIPFS('Black_Mtn_College.jpg')

    // Dummy's documents with real IPFS CIDs
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
        ipfsCID: quote1CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(quote1Text).length,
        metadata: {
          quoteContent: quote1Text,
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
        ipfsCID: link1CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(link1URL).length,
        metadata: {
          url: link1URL,
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
        title: 'Black Mountain College Campus',
        description: 'Historic photo of Black Mountain College',
        filename: 'black-mountain-college-BMC_4.jpg',
        mimeType: image1.mimeType,
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        created: Date.now(),
        lastAccessed: Date.now(),
        ipfsCID: image1.cid,
        contentType: image1.mimeType,
        contentSize: image1.size,
        metadata: {
          title: 'Black Mountain College',
          description: 'Black Mountain College campus photograph',
          creator: 'dummy',
          keywords: ['black mountain', 'college', 'history', 'architecture']
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
        ipfsCID: quote2CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(quote2Text).length,
        metadata: {
          quoteContent: quote2Text,
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
        ipfsCID: link2CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(link2URL).length,
        metadata: {
          url: link2URL,
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
        title: 'Black Mountain College Historic Building',
        description: 'Historic photograph of Black Mountain College building',
        filename: 'Black_Mtn_College.jpg',
        mimeType: image2.mimeType,
        collectionId: dummyCollection.id,
        uploadedBy: userMap.dummy.did,
        created: Date.now() - 30000,
        lastAccessed: Date.now(),
        ipfsCID: image2.cid,
        contentType: image2.mimeType,
        contentSize: image2.size,
        metadata: {
          title: 'Black Mountain College Building',
          description: 'Historic architecture of Black Mountain College',
          creator: 'dummy',
          keywords: ['black mountain', 'college', 'building', 'architecture', 'history']
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
      "theodore's collection", // Auto-naming: username's collection
      '' // No description
    )
    userCollectionRegistry.addUserCollection(userMap.theodore.did, theodoreCollection.storeName)
    console.log(`\n  ✓ Created P2P collection for theodore: '${theodoreCollection.name}'`)
    console.log(`    OrbitDB Address: ${theodoreCollection.address}`)

    // Add theodore's documents immediately while store is open
    console.log('\n📄 Adding documents to theodore\'s collection...')

    // Upload Theodore's content to IPFS
    console.log('  📤 Uploading content to IPFS...')

    // Quote 3 - Upload quote text to IPFS
    const quote3Text = 'The biggest challenge in distributed systems is dealing with partial failures.'
    const quote3CID = await orbitdbClient.uploadTextToIPFS(quote3Text)
    console.log(`  ✓ Quote 3 uploaded to IPFS: ${quote3CID}`)

    // Link 3 - Upload URL to IPFS
    const link3URL = 'https://docs.ipfs.tech/'
    const link3CID = await orbitdbClient.uploadTextToIPFS(link3URL)
    console.log(`  ✓ Link 3 URL uploaded to IPFS: ${link3CID}`)

    // Image 3 - Upload real Black Mountain image to IPFS
    const image3 = await uploadImageToIPFS('07tmag-black-mountain-slide-7VY7-superJumbo.jpg')

    // Quote 4 - Upload quote text to IPFS
    const quote4Text = 'We imagine that several divisions of the Byzantine army are camped outside an enemy city, each division commanded by its own general. The generals can communicate with one another only by messenger.'
    const quote4CID = await orbitdbClient.uploadTextToIPFS(quote4Text)
    console.log(`  ✓ Quote 4 uploaded to IPFS: ${quote4CID}`)

    // Link 4 - Upload URL to IPFS
    const link4URL = 'https://libp2p.io/'
    const link4CID = await orbitdbClient.uploadTextToIPFS(link4URL)
    console.log(`  ✓ Link 4 URL uploaded to IPFS: ${link4CID}`)

    // Image 4 - Upload real Black Mountain image to IPFS
    const image4 = await uploadImageToIPFS('08_BMCRP_Collegegebaeude_A.jpg')

    // Theodore's documents with real IPFS CIDs
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
        ipfsCID: quote3CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(quote3Text).length,
        metadata: {
          quoteContent: quote3Text,
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
        ipfsCID: link3CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(link3URL).length,
        metadata: {
          url: link3URL,
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
        title: 'Black Mountain College Magazine Article',
        description: 'Magazine article featuring Black Mountain College',
        filename: '07tmag-black-mountain-slide-7VY7-superJumbo.jpg',
        mimeType: image3.mimeType,
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        created: Date.now(),
        lastAccessed: Date.now(),
        ipfsCID: image3.cid,
        contentType: image3.mimeType,
        contentSize: image3.size,
        metadata: {
          title: 'Black Mountain College in Print',
          description: 'Magazine article about Black Mountain College',
          creator: 'theodore',
          source: 'Historical archive',
          date: new Date().toISOString().split('T')[0],
          keywords: ['black mountain', 'college', 'magazine', 'article', 'history']
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
        ipfsCID: quote4CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(quote4Text).length,
        metadata: {
          quoteContent: quote4Text,
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
        ipfsCID: link4CID,
        contentType: 'text/plain',
        contentSize: new TextEncoder().encode(link4URL).length,
        metadata: {
          url: link4URL,
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
        title: 'Black Mountain College Architecture',
        description: 'Historic Black Mountain College building exterior',
        filename: '08_BMCRP_Collegegebaeude_A.jpg',
        mimeType: image4.mimeType,
        collectionId: theodoreCollection.id,
        uploadedBy: userMap.theodore.did,
        created: Date.now() - 30000,
        lastAccessed: Date.now(),
        ipfsCID: image4.cid,
        contentType: image4.mimeType,
        contentSize: image4.size,
        metadata: {
          title: 'Black Mountain College Building',
          description: 'Architectural photograph of Black Mountain College',
          creator: 'theodore',
          source: 'Historical archive',
          date: new Date().toISOString().split('T')[0],
          keywords: ['black mountain', 'college', 'building', 'architecture', 'history']
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
