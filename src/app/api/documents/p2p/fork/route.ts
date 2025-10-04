import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'
import { sanitizeMetadata, sanitizeUserInput } from '@/lib/sanitize'
import { randomBytes } from 'crypto'

// Fork P2P Document - Create a new document based on the original
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      originalDocumentId,
      originalCollectionId,
      peerId,
      updatedMetadata,
      changeComment
    } = body

    if (!originalDocumentId || !originalCollectionId || !peerId || !updatedMetadata || !changeComment) {
      return NextResponse.json(
        { error: 'Original document ID, original collection ID, peer ID, updated metadata, and change comment are required' },
        { status: 400 }
      )
    }

    // Sanitize inputs to prevent XSS
    const sanitizedMetadata = sanitizeMetadata(updatedMetadata)
    const sanitizedComment = sanitizeUserInput(changeComment)

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

    // Determine display title based on document type
    let displayTitle = originalDocument.title
    if (originalDocument.documentType === 'link') {
      displayTitle = sanitizedMetadata.siteName || sanitizedMetadata.title || originalDocument.title
    } else if (originalDocument.documentType === 'quote') {
      displayTitle = sanitizedMetadata.title || originalDocument.title
    } else if (originalDocument.documentType === 'image') {
      displayTitle = sanitizedMetadata.title || originalDocument.title
    }

    // Create the forked document with updated metadata
    const forkedDocument = {
      ...originalDocument,
      id: forkedDocumentId,
      metadata: sanitizedMetadata, // Use sanitized metadata
      title: displayTitle,
      version: 1, // Start at version 1
      versionHistory: [
        {
          version: 1, // Version 1 is the initial fork
          editedBy: peerId,
          editedAt: Date.now(),
          changeComment: sanitizedComment, // User's fork comment describes version 1 (sanitized)
          previousMetadata: { ...originalDocument.metadata } // What it was forked from
        }
      ],
      created: Date.now(),
      lastAccessed: Date.now(),
      uploadedBy: peerId,
      parentDocumentId: originalDocumentId, // Link to parent
      childDocumentIds: [], // Initialize empty children array
      // If new IPFS CID is provided (for images), update it at document level
      ...(sanitizedMetadata.ipfsCID && {
        ipfsCID: sanitizedMetadata.ipfsCID,
        contentType: sanitizedMetadata.contentType,
        contentSize: sanitizedMetadata.contentSize
      })
    }

    // Find or create the user's collection
    // Get all user collections from the registry
    const allCollections = await userCollectionRegistry.getUserCollections(peerId)

    let userCollectionStoreName: string
    let userCollection: any

    if (allCollections.length > 0) {
      // Use the first (default) collection
      userCollectionStoreName = allCollections[0]
      userCollection = await orbitdbClient.getCollection(userCollectionStoreName)
    } else {
      // Create a new collection for this user
      // Get username from request or extract from peerId
      const username = body.username || peerId.split(':').pop()?.slice(0, 10) || peerId

      userCollection = await orbitdbClient.createCollection(
        peerId,
        `${username}'s collection`, // Auto-naming: username's collection
        '' // No description
      )
      userCollectionStoreName = userCollection.storeName

      // Register it in the global registry
      await userCollectionRegistry.addUserCollection(peerId, userCollectionStoreName)
    }

    // Add the forked document to the user's collection
    await orbitdbClient.addDocumentToCollection(userCollectionStoreName, forkedDocument)

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
