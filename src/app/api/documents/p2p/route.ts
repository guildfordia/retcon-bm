import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { userCollectionRegistry } from '@/lib/user-collection-registry'

// P2P Documents API - Real OrbitDB implementation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const collectionId = searchParams.get('collectionId')
    const peerId = searchParams.get('peerId')

    if (!collectionId || !peerId) {
      return NextResponse.json(
        { error: 'Collection ID and peer ID are required' },
        { status: 400 }
      )
    }

    // Check OrbitDB health
    const health = await orbitdbClient.health()
    if (!health.ok) {
      throw new Error('OrbitDB service is not available')
    }

    // Collections are public and accessible by anyone
    // The collectionId IS the storeName, so we can directly access it
    let collectionStoreName: string

    if (collectionId === 'main') {
      // For 'main' collection, find user's first collection
      const userCollections = await userCollectionRegistry.getUserCollections(peerId)
      if (userCollections.length === 0) {
        // Create a main collection for this user
        const collection = await orbitdbClient.createCollection(peerId, 'Main Collection', 'Your primary document collection')
        userCollectionRegistry.addUserCollection(peerId, collection.storeName)
        collectionStoreName = collection.storeName
      } else {
        collectionStoreName = userCollections[0] // Use first collection as main
      }
    } else {
      // Use collectionId directly as storeName (they're the same)
      collectionStoreName = collectionId
    }

    // Verify collection exists by trying to get metadata
    const metadata = await orbitdbClient.getCollection(collectionStoreName)
    if (!metadata) {
      return NextResponse.json({
        documents: [],
        type: 'p2p',
        storage: 'orbitdb',
        message: 'Collection not found or empty'
      })
    }

    // Fetch documents from OrbitDB
    const documents = await orbitdbClient.getCollectionDocuments(collectionStoreName)

    return NextResponse.json({
      documents,
      type: 'p2p',
      storage: 'orbitdb',
      collectionStoreName,
      orbitdbPeerId: health.peerId
    })

  } catch (error) {
    console.error('P2P documents error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch P2P documents', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const collectionId = formData.get('collectionId') as string
    const peerId = formData.get('peerId') as string
    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const documentType = formData.get('documentType') as string || 'quote'
    const metadataStr = formData.get('metadata') as string

    // Parse metadata if provided
    let metadata = {}
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr)
      } catch (e) {
        console.error('Failed to parse metadata:', e)
      }
    }

    // Validation based on document type
    if (!collectionId || !peerId || !title) {
      return NextResponse.json(
        { error: 'Collection ID, peer ID, and title are required' },
        { status: 400 }
      )
    }

    // Image type requires a file
    if (documentType === 'image' && !file) {
      return NextResponse.json(
        { error: 'Image type requires a file upload' },
        { status: 400 }
      )
    }

    // Get user's collections and find the matching one
    const userCollections = await userCollectionRegistry.getUserCollections(peerId)
    let collectionAddress: string | null = null

    // For 'main' collection, handle specially
    if (collectionId === 'main') {
      if (userCollections.length === 0) {
        // Create a main collection for this user
        const collection = await orbitdbClient.createCollection(peerId, 'Main Collection', 'Your primary document collection')
        userCollectionRegistry.addUserCollection(peerId, collection.address)
        collectionAddress = collection.address
      } else {
        collectionAddress = userCollections[0] // Use first collection as main
      }
    } else {
      // Find collection by ID
      for (const address of userCollections) {
        const metadata = await orbitdbClient.getCollection(address)
        if (metadata && metadata.id === collectionId) {
          collectionAddress = address
          break
        }
      }
    }

    if (!collectionAddress) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      )
    }

    // Create document object based on type
    const document: any = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      documentType: documentType, // 'quote', 'link', or 'image'
      title: title,
      description: description || '',
      collectionId,
      uploadedBy: peerId,
      created: Date.now(),
      lastAccessed: Date.now(),
      metadata: metadata, // Type-specific metadata
      replicas: [peerId],
      pinned: true,
      type: 'DOCUMENT',
      version: 1
    }

    // Add file-specific fields only if file exists (for image type)
    if (file) {
      document.filename = file.name
      document.size = file.size
      document.mimeType = file.type
      // TODO: In real implementation, this would be IPFS hash
      document.ipfsHash = `QmMock${Date.now().toString(36)}`
    }

    // Add document to OrbitDB collection
    await orbitdbClient.addDocumentToCollection(collectionAddress, document)

    return NextResponse.json({
      message: 'Document uploaded to OrbitDB successfully',
      document,
      collectionAddress
    }, { status: 201 })

  } catch (error) {
    console.error('P2P document upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload document to P2P network', details: error.message },
      { status: 500 }
    )
  }
}