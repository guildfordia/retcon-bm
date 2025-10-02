import { NextRequest, NextResponse } from 'next/server'
// uuid removed - using crypto.randomUUID()
import { getDatabase } from '@/lib/database'

export async function POST(request: NextRequest) {
  try {
    const { originalDocumentId, forkedBy, reason } = await request.json()

    if (!originalDocumentId || !forkedBy) {
      return NextResponse.json(
        { error: 'Original document ID and forker ID are required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Verify user exists and is approved
    const user = db.prepare('SELECT is_approved FROM users WHERE id = ?').get(forkedBy) as any
    if (!user || !user.is_approved) {
      return NextResponse.json(
        { error: 'User not found or not approved' },
        { status: 403 }
      )
    }

    // Get original document
    const originalDoc = db.prepare(`
      SELECT * FROM documents WHERE id = ?
    `).get(originalDocumentId) as any

    if (!originalDoc) {
      return NextResponse.json(
        { error: 'Original document not found' },
        { status: 404 }
      )
    }

    const transaction = db.transaction(() => {
      // Create forked document
      const forkedDocumentId = crypto.randomUUID()
      const forkedFilename = `${forkedDocumentId}_fork_of_${originalDoc.original_filename}`

      const insertForkedDoc = db.prepare(`
        INSERT INTO documents (
          id, title, description, filename, original_filename,
          mime_type, size, uploaded_by, collection_id,
          is_forked, forked_from
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      insertForkedDoc.run(
        forkedDocumentId,
        `Fork of ${originalDoc.title}`,
        originalDoc.description,
        forkedFilename,
        originalDoc.original_filename,
        originalDoc.mime_type,
        originalDoc.size,
        forkedBy,
        originalDoc.collection_id,
        1,
        originalDocumentId
      )

      // Create fork relationship record
      const insertFork = db.prepare(`
        INSERT INTO document_forks (id, original_document_id, forked_document_id, forked_by, reason)
        VALUES (?, ?, ?, ?, ?)
      `)

      insertFork.run(crypto.randomUUID(), originalDocumentId, forkedDocumentId, forkedBy, reason)

      // Update original document fork count
      const updateOriginal = db.prepare(`
        UPDATE documents 
        SET fork_count = fork_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)

      updateOriginal.run(originalDocumentId)

      // Log activity
      const logActivity = db.prepare(`
        INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      logActivity.run(
        crypto.randomUUID(),
        forkedBy,
        'fork',
        'document',
        forkedDocumentId,
        JSON.stringify({ 
          originalDocumentId, 
          originalTitle: originalDoc.title,
          reason 
        })
      )

      return forkedDocumentId
    })

    const forkedDocumentId = transaction()

    return NextResponse.json({
      message: 'Document forked successfully',
      forkedDocumentId
    }, { status: 201 })

  } catch (error) {
    console.error('Fork document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}