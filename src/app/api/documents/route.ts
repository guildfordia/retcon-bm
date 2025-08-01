import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const collectionId = searchParams.get('collectionId')
    const userId = searchParams.get('userId')
    const mimeType = searchParams.get('type')

    const db = getDatabase()
    
    let query = `
      SELECT d.*, u.username as uploader_username, c.name as collection_name
      FROM documents d
      JOIN users u ON d.uploaded_by = u.id
      LEFT JOIN collections c ON d.collection_id = c.id
      WHERE 1=1
    `
    const params: any[] = []

    if (collectionId) {
      query += ' AND d.collection_id = ?'
      params.push(collectionId)
    }

    if (userId) {
      query += ' AND d.uploaded_by = ?'
      params.push(userId)
    }

    if (mimeType) {
      query += ' AND d.mime_type LIKE ?'
      params.push(`${mimeType}%`)
    }

    query += ' ORDER BY d.created_at DESC'

    const documents = db.prepare(query).all(...params)

    return NextResponse.json({ documents })

  } catch (error) {
    console.error('Get documents error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const uploadedBy = formData.get('uploadedBy') as string
    const collectionId = formData.get('collectionId') as string
    const file = formData.get('file') as File

    if (!title || !uploadedBy || !file) {
      return NextResponse.json(
        { error: 'Title, uploader ID, and file are required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Verify user exists and is approved
    const user = db.prepare('SELECT is_approved FROM users WHERE id = ?').get(uploadedBy) as any
    if (!user || !user.is_approved) {
      return NextResponse.json(
        { error: 'User not found or not approved' },
        { status: 403 }
      )
    }

    // Verify collection exists if provided
    if (collectionId) {
      const collection = db.prepare('SELECT id FROM collections WHERE id = ?').get(collectionId)
      if (!collection) {
        return NextResponse.json(
          { error: 'Collection not found' },
          { status: 404 }
        )
      }
    }

    // Create document record
    const documentId = uuidv4()
    const filename = `${documentId}_${file.name}`

    const insertDocument = db.prepare(`
      INSERT INTO documents (
        id, title, description, filename, original_filename, 
        mime_type, size, uploaded_by, collection_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insertDocument.run(
      documentId,
      title,
      description,
      filename,
      file.name,
      file.type,
      file.size,
      uploadedBy,
      collectionId || null
    )

    // Update collection document count if in a collection
    if (collectionId) {
      const updateCollection = db.prepare(`
        UPDATE collections 
        SET document_count = document_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      updateCollection.run(collectionId)
    }

    // Log activity
    const logActivity = db.prepare(`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    logActivity.run(
      uuidv4(),
      uploadedBy,
      'upload',
      'document',
      documentId,
      JSON.stringify({ title, originalFilename: file.name, size: file.size })
    )

    return NextResponse.json({
      message: 'Document uploaded successfully',
      documentId,
      filename
    }, { status: 201 })

  } catch (error) {
    console.error('Upload document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}