import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { sanitizeMetadata, sanitizeUserInput } from '@/lib/sanitize'

// Edit P2P Document - Update metadata with version history
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      documentId,
      collectionId,
      peerId,
      updatedMetadata,
      changeComment,
      documentType
    } = body

    if (!documentId || !collectionId || !peerId || !updatedMetadata || !changeComment) {
      return NextResponse.json(
        { error: 'Document ID, collection ID, peer ID, updated metadata, and change comment are required' },
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

    // Get the collection (collectionId is the storeName)
    const collectionStoreName = collectionId

    // Fetch current documents from collection
    const documents = await orbitdbClient.getCollectionDocuments(collectionStoreName)

    // Find the document to update
    const documentIndex = documents.findIndex(doc => doc.id === documentId)

    if (documentIndex === -1) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    const currentDocument = documents[documentIndex]

    // AUTHORIZATION CHECK: Verify the user owns this document
    if (currentDocument.uploadedBy !== peerId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: You can only edit documents you own',
          hint: 'Use fork instead to create your own version'
        },
        { status: 403 }
      )
    }
    const currentVersion = currentDocument.version || 1
    const newVersion = currentVersion + 1

    // Initialize versionHistory if it doesn't exist
    if (!currentDocument.versionHistory) {
      currentDocument.versionHistory = []
    }

    // Create version history entry for the NEW version we're creating
    const versionEntry = {
      version: newVersion, // The version we're creating NOW
      editedBy: peerId,
      editedAt: Date.now(), // When this NEW version was created
      changeComment: sanitizedComment, // Describes what this NEW version is (sanitized)
      previousMetadata: { ...currentDocument.metadata } // What it was before this edit
    }

    // Add version history entry
    currentDocument.versionHistory.push(versionEntry)

    // Determine which field to use for the top-level title based on document type
    let displayTitle = currentDocument.title
    if (documentType === 'link') {
      // For links, use siteName as the display title
      displayTitle = sanitizedMetadata.siteName || sanitizedMetadata.title || currentDocument.title
      console.log('EDIT LINK - displayTitle:', displayTitle, 'siteName:', sanitizedMetadata.siteName)
    } else if (documentType === 'quote') {
      // For quotes, use the source title
      displayTitle = sanitizedMetadata.title || currentDocument.title
      console.log('EDIT QUOTE - displayTitle:', displayTitle, 'title:', sanitizedMetadata.title)
    } else if (documentType === 'image') {
      // For images, use the image title
      displayTitle = sanitizedMetadata.title || currentDocument.title
      console.log('EDIT IMAGE - displayTitle:', displayTitle, 'title:', sanitizedMetadata.title)
    }

    // Update document metadata
    const updatedDocument = {
      ...currentDocument,
      metadata: sanitizedMetadata, // Use sanitized metadata
      version: newVersion, // Increment to the NEW version
      lastAccessed: Date.now(),
      // Sync top-level title field with the appropriate metadata field for display in feed
      title: displayTitle,
      // If new IPFS CID is provided (for images), update it at document level
      ...(sanitizedMetadata.ipfsCID && {
        ipfsCID: sanitizedMetadata.ipfsCID,
        contentType: sanitizedMetadata.contentType,
        contentSize: sanitizedMetadata.contentSize
      })
    }

    // Since OrbitDB doesn't support in-place updates, we need to:
    // 1. Remove the old document (add tombstone)
    // 2. Add the new document with updated data
    // For now, we'll directly update in the collection
    // Note: This is a simplified approach - in production you'd want proper CRDT handling

    // Update the document in OrbitDB
    // We'll fetch all documents, update the one we need, and save back
    // This is not ideal but works for the current OrbitDB client implementation

    await orbitdbClient.updateDocumentInCollection(collectionStoreName, documentId, updatedDocument)

    console.log('EDIT SUCCESS - Updated document title:', updatedDocument.title, 'version:', updatedDocument.version)

    return NextResponse.json({
      message: 'Document updated successfully',
      document: updatedDocument,
      versionHistory: currentDocument.versionHistory
    }, { status: 200 })

  } catch (error) {
    console.error('P2P document edit error:', error)
    return NextResponse.json(
      { error: 'Failed to update P2P document', details: error.message },
      { status: 500 }
    )
  }
}
