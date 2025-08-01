import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const isPublic = searchParams.get('public')
    const userId = searchParams.get('userId')

    const db = getDatabase()
    
    let query = `
      SELECT c.*, u.username as creator_username
      FROM collections c
      JOIN users u ON c.created_by = u.id
    `
    const params: any[] = []

    if (isPublic === 'true') {
      query += ' WHERE c.is_public = ?'
      params.push(1)
    } else if (userId) {
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
    const { name, description, isPublic, createdBy } = await request.json()

    if (!name || !createdBy) {
      return NextResponse.json(
        { error: 'Name and creator ID are required' },
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

    // Create collection
    const collectionId = uuidv4()
    const shareableLink = isPublic ? uuidv4() : null

    const insertCollection = db.prepare(`
      INSERT INTO collections (id, name, description, is_public, shareable_link, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    insertCollection.run(collectionId, name, description, isPublic ? 1 : 0, shareableLink, createdBy)

    // Log activity
    const logActivity = db.prepare(`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    logActivity.run(
      uuidv4(),
      createdBy,
      'create_collection',
      'collection',
      collectionId,
      JSON.stringify({ name, isPublic })
    )

    return NextResponse.json({
      message: 'Collection created successfully',
      collectionId,
      shareableLink
    }, { status: 201 })

  } catch (error) {
    console.error('Create collection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}