import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'

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
    const currentVersion = currentDocument.version || 1
    const newVersion = currentVersion + 1

    // Create version history entry - stores the OLD version's state
    const versionEntry = {
      version: currentVersion, // Store the version we're moving FROM
      editedBy: peerId,
      editedAt: Date.now(),
      changeComment: changeComment,
      previousMetadata: { ...currentDocument.metadata }
    }

    // Initialize versionHistory if it doesn't exist
    if (!currentDocument.versionHistory) {
      currentDocument.versionHistory = []
    }

    // Add version history entry
    currentDocument.versionHistory.push(versionEntry)

    // Update document metadata
    const updatedDocument = {
      ...currentDocument,
      metadata: updatedMetadata,
      version: newVersion, // Increment to the NEW version
      lastAccessed: Date.now(),
      // If new IPFS CID is provided (for images), update it at document level
      ...(updatedMetadata.ipfsCID && {
        ipfsCID: updatedMetadata.ipfsCID,
        contentType: updatedMetadata.contentType,
        contentSize: updatedMetadata.contentSize
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
