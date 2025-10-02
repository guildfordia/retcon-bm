import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const db = getDatabase()
    
    const collection = db.prepare(`
      SELECT c.*, u.username as creator_username
      FROM collections c
      JOIN users u ON c.created_by = u.id
      WHERE c.id = ?
    `).get(params.id) as any

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      )
    }

    // Get document count
    const documentCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM collection_documents 
      WHERE collection_id = ?
    `).get(params.id) as any

    collection.document_count = documentCount.count

    return NextResponse.json({ collection })

  } catch (error) {
    console.error('Get collection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const { name, description, userId } = await request.json()
    const db = getDatabase()

    // Verify the user owns this collection
    const collection = db.prepare('SELECT created_by FROM collections WHERE id = ?').get(params.id) as any
    if (!collection || collection.created_by !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Update collection (no visibility field)
    const updateStmt = db.prepare(`
      UPDATE collections 
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    updateStmt.run(name, description, params.id)

    return NextResponse.json({ message: 'Collection updated successfully' })

  } catch (error) {
    console.error('Update collection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    // Delete collection (cascade will handle collection_documents)
    db.prepare('DELETE FROM collections WHERE id = ?').run(params.id)

    return NextResponse.json({ message: 'Collection deleted successfully' })

  } catch (error) {
    console.error('Delete collection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}