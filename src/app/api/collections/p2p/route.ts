import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'
import { getDatabase } from '@/lib/database'

// P2P Collections API - Real OrbitDB implementation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const peerId = searchParams.get('peerId')

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Get user's collections from P2P registry (these are store names now)
    console.log('Fetching collections for peerId:', peerId)

    let userCollections: string[]
    if (peerId) {
      // Get specific user's collections
      userCollections = await userCollectionRegistry.getUserCollections(peerId)
    } else {
      // Get all collections from all users
      userCollections = await userCollectionRegistry.getAllCollections()
    }

    console.log('User collections from registry:', userCollections)
    const collections = []

    // Get database connection to fetch usernames
    const db = getDatabase()
    const getUserStmt = db.prepare('SELECT username FROM users WHERE id = ?')

    // Fetch metadata for each collection
    for (const storeName of userCollections) {
      try {
        console.log('Fetching metadata for store:', storeName)
        const metadata = await orbitdbClient.getCollection(storeName)
        console.log('Metadata received:', metadata)
        if (metadata) {
          // Fetch username for the collection owner
          // Try to get from SQL database first (for backwards compatibility)
          let username = 'Unknown'
          const user = getUserStmt.get(metadata.owner) as { username: string } | undefined
          if (user?.username) {
            username = user.username
          } else if (metadata.owner.startsWith('did:p2p:')) {
            // For P2P DIDs, extract username from a mapping or derive from known DIDs
            // For now, check against known DIDs (generated from private keys)
            if (metadata.owner === 'did:p2p:da3871dbd67db0bd27bcda5289f2efed') {
              username = 'theodore'
            } else if (metadata.owner === 'did:p2p:3209956da445dbb96966c91ba431cc80') {
              username = 'dummy'
            }
          }

          collections.push({
            id: metadata.id,
            name: metadata.name,
            description: metadata.description,
            orbitAddress: metadata.address,
            storeName: metadata.storeName || storeName,
            peerId: metadata.owner,
            username: username,
            created: metadata.created,
            lastSync: metadata.lastUpdated || metadata.created,
            peers: [metadata.owner], // In real P2P, this would be dynamic
            documentCount: metadata.documentCount || 0
          })
        }
      } catch (error) {
        console.error(`Failed to fetch collection metadata for ${storeName}:`, error)
      }
    }

    return NextResponse.json({
      collections,
      type: 'p2p',
      network: 'orbitdb',
      orbitdbPeerId: health.peerId,
      status: 'connected'
    })

  } catch (error) {
    console.error('P2P collections error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch P2P collections', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, description, peerId, accessType = 'public' } = await request.json()

    if (!name || !peerId) {
      return NextResponse.json(
        { error: 'Name and peer ID are required' },
        { status: 400 }
      )
    }

    // Check if user already has a P2P collection (limit 1 per user for now)
    const existingCollections = await userCollectionRegistry.getUserCollections(peerId)
    if (existingCollections.length > 0) {
      return NextResponse.json(
        { error: 'You can only have one P2P collection. Please manage your existing collection instead.' },
        { status: 409 }
      )
    }

    // Create real OrbitDB collection
    const collection = await orbitdbClient.createCollection(peerId, name, description)

    // Register collection store name for the user in P2P registry
    await userCollectionRegistry.addUserCollection(peerId, collection.storeName)

    const responseCollection = {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      orbitAddress: collection.address,
      storeName: collection.storeName,
      peerId,
      accessType,
      created: collection.created,
      lastSync: collection.created,
      peers: [peerId],
      documentCount: 0
    }

    return NextResponse.json({
      message: 'P2P collection created successfully in OrbitDB',
      collection: responseCollection,
      orbitdbAddress: collection.address
    }, { status: 201 })

  } catch (error) {
    console.error('P2P collection creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create P2P collection', details: error.message },
      { status: 500 }
    )
  }
}