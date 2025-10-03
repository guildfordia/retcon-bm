import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'

// Remove Document from User's Collection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      documentId,
      peerId
    } = body

    if (!documentId || !peerId) {
      return NextResponse.json(
        { error: 'Document ID and peer ID are required' },
        { status: 400 }
      )
    }

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Get the user's collection
    const userCollectionStoreName = `collection-${peerId}-main`

    const userCollection = await orbitdbClient.getCollection(userCollectionStoreName)

    if (!userCollection) {
      return NextResponse.json(
        { error: 'User collection not found' },
        { status: 404 }
      )
    }

    // Get all documents from the collection
    const documents = await orbitdbClient.getCollectionDocuments(userCollectionStoreName)
    const documentToRemove = documents.find(doc => doc.id === documentId)

    if (!documentToRemove) {
      return NextResponse.json(
        { error: 'Document not found in collection' },
        { status: 404 }
      )
    }

    // Remove the document from OrbitDB
    // Note: OrbitDB doesn't have a direct delete - we need to implement this at the client level
    // For now, we'll need to add a method to the orbitdb-client to handle deletion
    // This would involve marking the document as deleted or removing the key

    // For this implementation, we'll use putKV with a null value to "delete" the key
    const response = await fetch(`${process.env.ORBITDB_SERVICE_URL || 'http://orbitdb:4001'}/kv/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: userCollectionStoreName,
        key: `doc-${documentId}`
      })
    })

    if (!response.ok) {
      throw new Error('Failed to delete document from OrbitDB')
    }

    return NextResponse.json({
      message: 'Document removed from collection successfully',
      documentId
    }, { status: 200 })

  } catch (error) {
    console.error('Remove from collection error:', error)
    return NextResponse.json(
      { error: 'Failed to remove document from collection', details: error.message },
      { status: 500 }
    )
  }
}
