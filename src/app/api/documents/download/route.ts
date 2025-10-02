import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('id')
    const userId = searchParams.get('userId')

    if (!documentId || !userId) {
      return NextResponse.json(
        { error: 'Document ID and User ID are required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Get document metadata
    const document = db.prepare(`
      SELECT d.*, u.username as uploader_username
      FROM documents d
      JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = ?
    `).get(documentId) as any

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check if user has access (document is public or user is the uploader)
    // For now, allow access if user is authenticated
    const user = db.prepare('SELECT is_approved FROM users WHERE id = ?').get(userId) as any
    if (!user || !user.is_approved) {
      return NextResponse.json(
        { error: 'User not found or not approved' },
        { status: 403 }
      )
    }

    // Return document metadata - actual file content will be retrieved from OrbitDB client-side
    return NextResponse.json({
      document: {
        id: document.id,
        title: document.title,
        description: document.description,
        originalFilename: document.original_filename,
        filename: document.filename,
        mimeType: document.mime_type,
        size: document.size,
        uploadedBy: document.uploaded_by,
        uploaderUsername: document.uploader_username,
        collectionId: document.collection_id,
        createdAt: document.created_at,
        updatedAt: document.updated_at
      },
      message: 'Document metadata retrieved. Use OrbitDB client to get file content.'
    })

  } catch (error) {
    console.error('Download document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}