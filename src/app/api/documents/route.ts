import { NextRequest, NextResponse } from 'next/server'
// uuid removed - using crypto.randomUUID()
import { getDatabase } from '@/lib/database'
import { verifyAuth } from '@/lib/auth-middleware'
// File validation removed - implement inline if needed

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    const { searchParams } = new URL(request.url)
    const collectionId = searchParams.get('collectionId')
    const userId = searchParams.get('userId')
    const mimeType = searchParams.get('type')
    const excludeCollection = searchParams.get('excludeCollection')

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

    // Exclude documents already in a specific collection
    if (excludeCollection) {
      query += ` AND d.id NOT IN (
        SELECT document_id FROM collection_documents WHERE collection_id = ?
      )`
      params.push(excludeCollection)
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
    // Verify authentication
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const collectionId = formData.get('collectionId') as string
    const file = formData.get('file') as File

    // Use authenticated user's ID instead of uploadedBy from form
    const uploadedBy = user.id

    if (!title || !file) {
      return NextResponse.json(
        { error: 'Title and file are required' },
        { status: 400 }
      )
    }

    // Basic file validation
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Verify user exists and is approved (already done in auth middleware)
    // No need to check again since auth middleware already verified the user

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

    // Create document record (metadata only - actual file stored in OrbitDB client-side)
    const documentId = crypto.randomUUID()
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
      crypto.randomUUID(),
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