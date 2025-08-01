import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDatabase } from '@/lib/database'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Find user
    const user = db.prepare(`
      SELECT id, email, username, password_hash, is_approved, is_admin 
      FROM users 
      WHERE email = ?
    `).get(email) as any

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if user is approved
    if (!user.is_approved) {
      return NextResponse.json(
        { error: 'Account pending approval' },
        { status: 403 }
      )
    }

    // Return user data (excluding password hash)
    const { password_hash, ...userData } = user
    return NextResponse.json({
      message: 'Login successful',
      user: {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        isApproved: userData.is_approved,
        isAdmin: userData.is_admin
      }
    })

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}