import { NextRequest, NextResponse } from 'next/server'

// P2P document pinning - stores pinning data in a mock system
// In a real implementation, this would interact with OrbitDB

interface P2PPin {
  id: string
  userId: string
  documentId: string
  ipfsHash: string
  sourceCollectionId: string
  documentTitle: string
  documentDescription?: string
  created: number
}

// Mock storage for P2P pins (in real implementation would be OrbitDB)
let mockP2PPins: P2PPin[] = []

// Pin a P2P document
export async function POST(request: NextRequest) {
  try {
    const { userId, documentId, ipfsHash, sourceCollectionId, documentData } = await request.json()

    if (!userId || !documentId || !ipfsHash || !sourceCollectionId) {
      return NextResponse.json(
        { error: 'User ID, document ID, IPFS hash, and source collection ID are required' },
        { status: 400 }
      )
    }

    // Check if already pinned by this user
    const existingPin = mockP2PPins.find(
      pin => pin.userId === userId && pin.documentId === documentId
    )

    if (existingPin) {
      return NextResponse.json(
        { error: 'Document is already pinned to your P2P collection' },
        { status: 409 }
      )
    }

    // Create new pin
    const newPin: P2PPin = {
      id: `pin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      documentId,
      ipfsHash,
      sourceCollectionId,
      documentTitle: documentData?.title || 'Pinned P2P Document',
      documentDescription: documentData?.description,
      created: Date.now()
    }

    mockP2PPins.push(newPin)

    return NextResponse.json({
      message: 'P2P document pinned successfully',
      pin: newPin
    }, { status: 201 })

  } catch (error) {
    console.error('P2P pin document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Unpin a P2P document
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pinId = searchParams.get('pinId')
    const userId = searchParams.get('userId')

    if (!pinId || !userId) {
      return NextResponse.json(
        { error: 'Pin ID and user ID are required' },
        { status: 400 }
      )
    }

    // Find and verify pin belongs to user
    const pinIndex = mockP2PPins.findIndex(
      pin => pin.id === pinId && pin.userId === userId
    )

    if (pinIndex === -1) {
      return NextResponse.json(
        { error: 'Pin not found or does not belong to user' },
        { status: 404 }
      )
    }

    // Remove pin
    mockP2PPins.splice(pinIndex, 1)

    return NextResponse.json({
      message: 'P2P document unpinned successfully'
    })

  } catch (error) {
    console.error('P2P unpin document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get pinned P2P documents for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Filter pins for this user
    const userPins = mockP2PPins.filter(pin => pin.userId === userId)

    // Sort by most recent first
    userPins.sort((a, b) => b.created - a.created)

    return NextResponse.json({
      pinnedDocuments: userPins,
      type: 'p2p',
      count: userPins.length
    })

  } catch (error) {
    console.error('Get P2P pinned documents error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}