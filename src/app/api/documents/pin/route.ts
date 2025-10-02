import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'

// Pin a document to user's collection
export async function POST(request: NextRequest) {
  try {
    const { documentId, userId, sourceCollectionId, documentData } = await request.json()

    if (!documentId || !userId || !sourceCollectionId) {
      return NextResponse.json(
        { error: 'Document ID, user ID, and source collection ID are required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Verify user exists and is approved
    const user = db.prepare('SELECT is_approved FROM users WHERE id = ?').get(userId) as any
    if (!user || !user.is_approved) {
      return NextResponse.json(
        { error: 'User not found or not approved' },
        { status: 403 }
      )
    }

    // Get user's collection (they should have one)
    const userCollection = db.prepare('SELECT id FROM collections WHERE created_by = ?').get(userId) as any
    if (!userCollection) {
      return NextResponse.json(
        { error: 'User must have a collection to pin documents' },
        { status: 404 }
      )
    }

    // Check if document is already pinned by this user
    const existingPin = db.prepare(`
      SELECT id FROM pinned_documents
      WHERE user_id = ? AND original_document_id = ?
    `).get(userId, documentId)

    if (existingPin) {
      return NextResponse.json(
        { error: 'Document is already pinned to your collection' },
        { status: 409 }
      )
    }

    // Create pin record
    const pinId = crypto.randomUUID()

    const insertPin = db.prepare(`
      INSERT INTO pinned_documents (
        id, user_id, collection_id, original_document_id,
        source_collection_id, document_title, document_description,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)

    insertPin.run(
      pinId,
      userId,
      userCollection.id,
      documentId,
      sourceCollectionId,
      documentData?.title || 'Pinned Document',
      documentData?.description || ''
    )

    // Log activity
    const logActivity = db.prepare(`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    logActivity.run(
      crypto.randomUUID(),
      userId,
      'pin_document',
      'document',
      documentId,
      JSON.stringify({
        sourceCollectionId,
        title: documentData?.title,
        pinId
      })
    )

    return NextResponse.json({
      message: 'Document pinned successfully',
      pinId
    }, { status: 201 })

  } catch (error) {
    console.error('Pin document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Unpin a document from user's collection
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

    const db = getDatabase()

    // Verify pin exists and belongs to user
    const pin = db.prepare(`
      SELECT id, original_document_id FROM pinned_documents
      WHERE id = ? AND user_id = ?
    `).get(pinId, userId) as any

    if (!pin) {
      return NextResponse.json(
        { error: 'Pin not found or does not belong to user' },
        { status: 404 }
      )
    }

    // Delete pin
    const deletePin = db.prepare('DELETE FROM pinned_documents WHERE id = ?')
    deletePin.run(pinId)

    // Log activity
    const logActivity = db.prepare(`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    logActivity.run(
      crypto.randomUUID(),
      userId,
      'unpin_document',
      'document',
      pin.original_document_id,
      JSON.stringify({ pinId })
    )

    return NextResponse.json({
      message: 'Document unpinned successfully'
    })

  } catch (error) {
    console.error('Unpin document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get pinned documents for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const collectionId = searchParams.get('collectionId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    let query = `
      SELECT
        pd.*,
        sc.name as source_collection_name,
        su.username as source_collection_owner
      FROM pinned_documents pd
      LEFT JOIN collections sc ON pd.source_collection_id = sc.id
      LEFT JOIN users su ON sc.created_by = su.id
      WHERE pd.user_id = ?
    `
    const params = [userId]

    if (collectionId) {
      query += ' AND pd.collection_id = ?'
      params.push(collectionId)
    }

    query += ' ORDER BY pd.created_at DESC'

    const pinnedDocs = db.prepare(query).all(...params)

    return NextResponse.json({
      pinnedDocuments: pinnedDocs
    })

  } catch (error) {
    console.error('Get pinned documents error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}