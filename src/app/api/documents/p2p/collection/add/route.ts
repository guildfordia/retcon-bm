import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { randomBytes } from 'crypto'

// Add Document to User's Collection
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

    // Find or create the user's collection
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

    // Check if document already exists in user's collection
    const userDocuments = await orbitdbClient.getCollectionDocuments(userCollectionStoreName)
    const existingDoc = userDocuments.find(doc =>
      doc.id === originalDocumentId ||
      (doc.metadata?.originalDocumentId === originalDocumentId)
    )

    if (existingDoc) {
      return NextResponse.json(
        { error: 'Document already in your collection' },
        { status: 409 }
      )
    }

    // Generate a new ID for the copy (or keep original ID if we want to track it)
    // For collections, we'll keep the same ID to track it across collections
    const documentCopy = {
      ...originalDocument,
      // Keep the same ID to track the document across collections
      addedBy: peerId,
      collectionFrom: [
        ...(originalDocument.collectionFrom || []),
        userCollectionStoreName
      ],
      addedAt: Date.now() // Track when added to this collection
    }

    // Add the document to the user's collection
    await orbitdbClient.addDocumentToCollection(userCollectionStoreName, documentCopy)

    return NextResponse.json({
      message: 'Document added to collection successfully',
      document: documentCopy,
      collectionId: userCollectionStoreName,
      collectionName: userCollection.name
    }, { status: 200 })

  } catch (error) {
    console.error('Add to collection error:', error)
    return NextResponse.json(
      { error: 'Failed to add document to collection', details: error.message },
      { status: 500 }
    )
  }
}
