import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'

// GET /api/collections/p2p/[id] - Get a specific P2P collection by store name
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
  const collectionId = decodeURIComponent(params.id)

  try {
    console.log('Fetching P2P collection:', collectionId)

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Get collection metadata from OrbitDB
    const metadata = await orbitdbClient.getCollection(collectionId)

    if (!metadata) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      )
    }

    // Get documents in this collection
    const documents = await orbitdbClient.getCollectionDocuments(collectionId)

    const collection = {
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      orbitAddress: metadata.address,
      storeName: metadata.storeName || collectionId,
      peerId: metadata.owner,
      created: metadata.created,
      lastSync: metadata.lastUpdated || metadata.created,
      peers: [metadata.owner], // In real P2P, this would be dynamic
      documentCount: documents.length
    }

    return NextResponse.json({ collection })

  } catch (error) {
    console.error('Get P2P collection error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch collection', details: error.message },
      { status: 500 }
    )
  }
}