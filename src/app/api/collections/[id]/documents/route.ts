import { NextRequest, NextResponse } from 'next/server'
// uuid removed - using crypto.randomUUID()
import { getDatabase } from '@/lib/database'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const db = getDatabase()
    
    // Get all documents in this collection
    const documents = db.prepare(`
      SELECT d.*, u.username as uploader_username
      FROM documents d
      JOIN collection_documents cd ON d.id = cd.document_id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE cd.collection_id = ?
      ORDER BY cd.created_at DESC
    `).all(params.id)

    return NextResponse.json({ documents })

  } catch (error) {
    console.error('Get collection documents error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const { documentIds, userId } = await request.json()
    
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'Document IDs are required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Verify the user owns this collection or it's public
    const collection = db.prepare('SELECT created_by, is_public FROM collections WHERE id = ?').get(params.id) as any
    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      )
    }

    if (collection.created_by !== userId && !collection.is_public) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Add documents to collection
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO collection_documents (id, collection_id, document_id)
      VALUES (?, ?, ?)
    `)

    const addedDocuments = []
    for (const docId of documentIds) {
      // Verify document exists
      const doc = db.prepare('SELECT id FROM documents WHERE id = ?').get(docId)
      if (doc) {
        insertStmt.run(crypto.randomUUID(), params.id, docId)
        addedDocuments.push(docId)
      }
    }

    // Log activity
    if (addedDocuments.length > 0 && userId) {
      const logActivity = db.prepare(`
        INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      logActivity.run(
        crypto.randomUUID(),
        userId,
        'add_documents_to_collection',
        'collection',
        params.id,
        JSON.stringify({ documentCount: addedDocuments.length })
      )
    }

    return NextResponse.json({
      message: 'Documents added to collection',
      addedCount: addedDocuments.length
    }, { status: 201 })

  } catch (error) {
    console.error('Add documents to collection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}