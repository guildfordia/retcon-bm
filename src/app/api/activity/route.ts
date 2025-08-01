import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const entityType = searchParams.get('entityType')
    const limit = parseInt(searchParams.get('limit') || '50')

    const db = getDatabase()
    
    let query = `
      SELECT 
        a.*, 
        u.username,
        CASE 
          WHEN a.entity_type = 'document' THEN d.title
          WHEN a.entity_type = 'collection' THEN c.name
          ELSE null
        END as entity_name
      FROM activity_logs a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN documents d ON a.entity_type = 'document' AND a.entity_id = d.id
      LEFT JOIN collections c ON a.entity_type = 'collection' AND a.entity_id = c.id
      WHERE 1=1
    `
    const params: any[] = []

    if (userId) {
      query += ' AND a.user_id = ?'
      params.push(userId)
    }

    if (entityType) {
      query += ' AND a.entity_type = ?'
      params.push(entityType)
    }

    query += ' ORDER BY a.created_at DESC LIMIT ?'
    params.push(limit)

    const activities = db.prepare(query).all(...params)

    // Parse metadata JSON strings
    const parsedActivities = activities.map((activity: any) => ({
      ...activity,
      metadata: activity.metadata ? JSON.parse(activity.metadata) : null
    }))

    return NextResponse.json({ activities: parsedActivities })

  } catch (error) {
    console.error('Get activity error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}