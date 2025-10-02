import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'
import { getDatabase } from '@/lib/database'

// Global Feed API - Fetch all documents from all collections
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Get all collections from all users
    const allStoreNames = await userCollectionRegistry.getAllCollections()

    // Get database connection to fetch usernames
    const db = getDatabase()
    const getUserStmt = db.prepare('SELECT username FROM users WHERE id = ?')

    // Fetch all documents from all collections
    const allDocuments: Array<{
      document: any
      collectionName: string
      collectionId: string
      ownerUsername: string
      ownerDid: string
    }> = []

    for (const storeName of allStoreNames) {
      try {
        // Get collection metadata
        const metadata = await orbitdbClient.getCollection(storeName)
        if (!metadata) continue

        // Get username for collection owner
        let username = 'Unknown'
        const user = getUserStmt.get(metadata.owner) as { username: string } | undefined
        if (user?.username) {
          username = user.username
        } else if (metadata.owner.startsWith('did:p2p:')) {
          // Map known DIDs to usernames
          if (metadata.owner === 'did:p2p:da3871dbd67db0bd27bcda5289f2efed') {
            username = 'theodore'
          } else if (metadata.owner === 'did:p2p:3209956da445dbb96966c91ba431cc80') {
            username = 'dummy'
          }
        }

        // Fetch documents from this collection
        const documents = await orbitdbClient.getCollectionDocuments(storeName)

        // Add collection info to each document
        for (const doc of documents) {
          allDocuments.push({
            document: doc,
            collectionName: metadata.name,
            collectionId: metadata.id,
            ownerUsername: username,
            ownerDid: metadata.owner
          })
        }
      } catch (error) {
        console.error(`Failed to fetch documents from collection ${storeName}:`, error)
      }
    }

    // Sort by creation date (newest first)
    allDocuments.sort((a, b) => b.document.created - a.document.created)

    // Apply pagination
    const paginatedDocuments = allDocuments.slice(offset, offset + limit)

    return NextResponse.json({
      documents: paginatedDocuments,
      total: allDocuments.length,
      limit,
      offset,
      hasMore: offset + limit < allDocuments.length,
      type: 'global-feed',
      storage: 'orbitdb',
      orbitdbPeerId: health.peerId
    })

  } catch (error) {
    console.error('Global feed error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch global feed', details: error.message },
      { status: 500 }
    )
  }
}
