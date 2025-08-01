import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'

export async function GET() {
  try {
    const db = getDatabase()
    
    const users = db.prepare(`
      SELECT id, email, username, is_approved, is_admin, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `).all()

    return NextResponse.json({ users })

  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, isApproved, isAdmin } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Update user
    const updateUser = db.prepare(`
      UPDATE users 
      SET is_approved = COALESCE(?, is_approved),
          is_admin = COALESCE(?, is_admin),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    const result = updateUser.run(
      isApproved !== undefined ? (isApproved ? 1 : 0) : undefined,
      isAdmin !== undefined ? (isAdmin ? 1 : 0) : undefined, 
      userId
    )

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      message: 'User updated successfully'
    })

  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}