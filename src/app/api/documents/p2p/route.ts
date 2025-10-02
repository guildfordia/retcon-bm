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

    // ===== UPLOAD CORE CONTENT TO IPFS =====
    let ipfsCID: string
    let contentType: string
    let contentSize: number = 0

    if (documentType === 'image' && file) {
      // Image: upload file to IPFS
      ipfsCID = await orbitdbClient.uploadFileToIPFS(file)
      contentType = file.type
      contentSize = file.size
      console.log(`✓ Uploaded image to IPFS: ${ipfsCID} (${contentSize} bytes)`)
    } else if (documentType === 'quote') {
      // Quote: upload quote text to IPFS
      const quoteContent = (metadata as any).quoteContent || ''
      if (!quoteContent) {
        return NextResponse.json(
          { error: 'Quote content is required in metadata.quoteContent' },
          { status: 400 }
        )
      }
      ipfsCID = await orbitdbClient.uploadTextToIPFS(quoteContent, 'text/plain')
      contentType = 'text/plain'
      contentSize = new TextEncoder().encode(quoteContent).length
      console.log(`✓ Uploaded quote to IPFS: ${ipfsCID}`)
    } else if (documentType === 'link') {
      // Link: upload URL to IPFS
      const url = (metadata as any).url || ''
      if (!url) {
        return NextResponse.json(
          { error: 'URL is required in metadata.url' },
          { status: 400 }
        )
      }
      ipfsCID = await orbitdbClient.uploadTextToIPFS(url, 'text/plain')
      contentType = 'text/plain'
      contentSize = new TextEncoder().encode(url).length
      console.log(`✓ Uploaded link URL to IPFS: ${ipfsCID}`)
    } else {
      return NextResponse.json(
        { error: 'Invalid document type or missing content' },
        { status: 400 }
      )
    }

    // Create document object with IPFS CID
    const document: any = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      documentType: documentType, // 'quote', 'link', or 'image'
      title: title,
      description: description || '',
      collectionId,
      uploadedBy: peerId,
      created: Date.now(),
      lastAccessed: Date.now(),

      // IPFS Content Reference
      ipfsCID: ipfsCID,
      contentType: contentType,
      contentSize: contentSize,

      // Metadata (stored in OrbitDB)
      metadata: metadata,

      replicas: [peerId],
      pinned: true,
      type: 'DOCUMENT',
      version: 1
    }

    // Add file-specific fields for images
    if (documentType === 'image' && file) {
      document.filename = file.name
      document.mimeType = file.type
    }

    // Add document to OrbitDB collection
    await orbitdbClient.addDocumentToCollection(collectionAddress, document)

    console.log(`✓ Document stored in OrbitDB: ${document.id}`)
    console.log(`  - Type: ${documentType}`)
    console.log(`  - IPFS CID: ${ipfsCID}`)
    console.log(`  - Collection: ${collectionAddress}`)

    return NextResponse.json({
      message: 'Document uploaded successfully',
      document,
      collectionAddress,
      ipfsCID
    }, { status: 201 })

  } catch (error) {
    console.error('P2P document upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload document to P2P network', details: error.message },
      { status: 500 }
    )
  }
}