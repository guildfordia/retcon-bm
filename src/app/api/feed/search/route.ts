import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'
import { getDatabase } from '@/lib/database'

/**
 * Search Feed API
 *
 * Searches across all P2P documents with filters:
 * - type: Document type (quote, link, image)
 * - keywords: Keyword search (matches ANY keyword)
 * - title: Title/description search
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const typeFilter = searchParams.get('type') // e.g., "quote,link" or "quote"
    const keywordsFilter = searchParams.get('keywords') // e.g., "philosophy,test"
    const titleFilter = searchParams.get('title') // Search in title/description
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Get all collections from registry
    const allStoreNames = await userCollectionRegistry.getAllCollections()

    // Get database connection to fetch usernames
    const db = getDatabase()
    const getUserStmt = db.prepare('SELECT username FROM users WHERE id = ?')

    const feedItems: any[] = []

    // Fetch documents from each collection
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

        for (const doc of documents) {
          feedItems.push({
            document: doc,
            collectionId: metadata.id,
            collectionName: metadata.name,
            owner: username,
            ownerId: metadata.owner
          })
        }
      } catch (error) {
        console.error(`Failed to fetch from collection ${storeName}:`, error)
      }
    }

    // Apply filters
    let filteredItems = feedItems

    // Type filter
    if (typeFilter) {
      const types = typeFilter.split(',').map(t => t.trim())
      filteredItems = filteredItems.filter(item =>
        types.includes(item.document.documentType)
      )
    }

    // Keywords filter - matches ANY keyword
    if (keywordsFilter) {
      const searchKeywords = keywordsFilter.toLowerCase().split(',').map(k => k.trim())
      filteredItems = filteredItems.filter(item => {
        const docKeywords = item.document.metadata?.keywords || []
        return searchKeywords.some(searchKw =>
          docKeywords.some((docKw: string) =>
            docKw.toLowerCase().includes(searchKw)
          )
        )
      })
    }

    // Title filter - searches in title and description
    if (titleFilter) {
      const searchTerm = titleFilter.toLowerCase()
      filteredItems = filteredItems.filter(item => {
        const title = (item.document.title || '').toLowerCase()
        const description = (item.document.description || '').toLowerCase()
        const metadataTitle = (item.document.metadata?.title || '').toLowerCase()

        return title.includes(searchTerm) ||
               description.includes(searchTerm) ||
               metadataTitle.includes(searchTerm)
      })
    }

    // Sort by creation date (newest first)
    filteredItems.sort((a, b) => b.document.created - a.document.created)

    // Pagination
    const total = filteredItems.length
    const paginatedItems = filteredItems.slice(offset, offset + limit)

    return NextResponse.json({
      items: paginatedItems,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      filters: {
        type: typeFilter,
        keywords: keywordsFilter,
        title: titleFilter
      }
    })

  } catch (error) {
    console.error('Feed search error:', error)
    return NextResponse.json(
      { error: 'Failed to search feed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
