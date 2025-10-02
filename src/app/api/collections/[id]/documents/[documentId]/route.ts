import { NextRequest, NextResponse } from 'next/server'
// uuid removed - using crypto.randomUUID()
import { getDatabase } from '@/lib/database'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; documentId: string }> }
) {
  const params = await context.params;
  try {
    const { userId } = await request.json()
    const db = getDatabase()

    // Verify the user owns this collection
    const collection = db.prepare('SELECT created_by FROM collections WHERE id = ?').get(params.id) as any
    if (!collection || collection.created_by !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Remove document from collection
    const result = db.prepare(`
      DELETE FROM collection_documents 
      WHERE collection_id = ? AND document_id = ?
    `).run(params.id, params.documentId)

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Document not found in collection' },
        { status: 404 }
      )
    }

    // Log activity
    const logActivity = db.prepare(`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    logActivity.run(
      crypto.randomUUID(),
      userId,
      'remove_document_from_collection',
      'collection',
      params.id,
      JSON.stringify({ documentId: params.documentId })
    )

    return NextResponse.json({ message: 'Document removed from collection' })

  } catch (error) {
    console.error('Remove document from collection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}