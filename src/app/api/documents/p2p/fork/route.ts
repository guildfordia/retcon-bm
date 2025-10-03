import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'
import { randomBytes } from 'crypto'

// Fork P2P Document - Create a new document based on the original
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      originalDocumentId,
      originalCollectionId,
      peerId
    } = body

    if (!originalDocumentId || !originalCollectionId || !peerId) {
      return NextResponse.json(
        { error: 'Original document ID, original collection ID, and peer ID are required' },
        { status: 400 }
      )
    }

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Get the original document
    const originalCollectionStoreName = originalCollectionId
    const originalDocuments = await orbitdbClient.getCollectionDocuments(originalCollectionStoreName)
    const originalDocument = originalDocuments.find(doc => doc.id === originalDocumentId)

    if (!originalDocument) {
      return NextResponse.json(
        { error: 'Original document not found' },
        { status: 404 }
      )
    }

    // Get the original collection metadata to find the owner
    const originalCollectionMetadata = await orbitdbClient.getCollection(originalCollectionStoreName)

    // Generate a new ID for the forked document
    const forkedDocumentId = randomBytes(16).toString('hex')

    // Create the forked document with all metadata from original
    const forkedDocument = {
      ...originalDocument,
      id: forkedDocumentId,
      version: 1, // Reset version to 1
      versionHistory: [], // Clear version history
      created: Date.now(),
      lastAccessed: Date.now(),
      uploadedBy: peerId,
      parentDocumentId: originalDocumentId, // Link to parent
      childDocumentIds: [] // Initialize empty children array
    }

    // Find or create the user's collection
    // For now, we'll use a simple naming convention: collection-{userId}-main
    const userCollectionStoreName = `collection-${peerId}-main`

    // Try to get the user's collection, create if doesn't exist
    let userCollection = await orbitdbClient.getCollection(userCollectionStoreName)

    if (!userCollection) {
      // Create the user's default collection
      userCollection = await orbitdbClient.createCollection(
        peerId,
        `${peerId}'s Collection`,
        'Default collection'
      )
    }

    // Add the forked document to the user's collection
    await orbitdbClient.addDocumentToCollection(userCollectionStoreName, forkedDocument)

    // Register the user's collection in the global registry so it appears in the feed
    await userCollectionRegistry.addUserCollection(peerId, userCollectionStoreName)

    // Update the original document to add this fork as a child
    const updatedOriginalDocument = {
      ...originalDocument,
      childDocumentIds: [
        ...(originalDocument.childDocumentIds || []),
        forkedDocumentId
      ]
    }
    await orbitdbClient.updateDocumentInCollection(originalCollectionStoreName, originalDocumentId, updatedOriginalDocument)

    return NextResponse.json({
      message: 'Document forked successfully',
      forkedDocument,
      collectionId: userCollectionStoreName,
      collectionName: userCollection.name,
      ownerUsername: peerId // In a real app, you'd look up the username
    }, { status: 200 })

  } catch (error) {
    console.error('P2P document fork error:', error)
    return NextResponse.json(
      { error: 'Failed to fork P2P document', details: error.message },
      { status: 500 }
    )
  }
}
