import { NextRequest, NextResponse } from 'next/server'
// uuid removed - using crypto.randomUUID()
import { getDatabase } from '@/lib/database'
import { createCollectionSchema, validateRequest } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    const db = getDatabase()
    
    // All collections are public, optionally filter by user
    let query = `
      SELECT c.*, u.username as creator_username
      FROM collections c
      JOIN users u ON c.created_by = u.id
    `
    const params: any[] = []

    if (userId) {
      query += ' WHERE c.created_by = ?'
      params.push(userId)
    }

    query += ' ORDER BY c.created_at DESC'

    const collections = db.prepare(query).all(...params)

    return NextResponse.json({ collections })

  } catch (error) {
    console.error('Get collections error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validation = validateRequest(createCollectionSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { name, description } = validation.data
    const createdBy = body.createdBy // Auth will be handled separately

    if (!createdBy) {
      return NextResponse.json(
        { error: 'Creator ID is required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Verify user exists and is approved
    const user = db.prepare('SELECT is_approved FROM users WHERE id = ?').get(createdBy) as any
    if (!user || !user.is_approved) {
      return NextResponse.json(
        { error: 'User not found or not approved' },
        { status: 403 }
      )
    }

    // Check if user already has a collection (limit 1 per user)
    const existingCollection = db.prepare('SELECT id FROM collections WHERE created_by = ?').get(createdBy)
    if (existingCollection) {
      return NextResponse.json(
        { error: 'You can only have one collection. Please manage your existing collection instead.' },
        { status: 409 }
      )
    }

    // Create collection (always public)
    const collectionId = crypto.randomUUID()

    const insertCollection = db.prepare(`
      INSERT INTO collections (id, name, description, created_by)
      VALUES (?, ?, ?, ?)
    `)

    insertCollection.run(collectionId, name, description, createdBy)

    // Log activity
    const logActivity = db.prepare(`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    logActivity.run(
      crypto.randomUUID(),
      createdBy,
      'create_collection',
      'collection',
      collectionId,
      JSON.stringify({ name })
    )

    return NextResponse.json({
      message: 'Collection created successfully',
      collectionId
    }, { status: 201 })

  } catch (error) {
    console.error('Create collection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}