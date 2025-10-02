import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getDatabase } from '@/lib/database'
import * as ed25519 from '@noble/ed25519'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization')

    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authorization.substring(7)

    try {
      // Try to decode without verification first to check token type
      const decoded = jwt.decode(token) as any

      if (!decoded) {
        return NextResponse.json(
          { error: 'Invalid token format' },
          { status: 401 }
        )
      }

      // Check if this is a P2P token (has 'did' field)
      if (decoded.did && decoded.type === 'p2p') {
        // P2P token verification
        try {
          // For P2P tokens, we just verify they're not expired and have valid structure
          const currentTime = Math.floor(Date.now() / 1000)
          if (decoded.exp && decoded.exp < currentTime) {
            return NextResponse.json(
              { error: 'Token expired' },
              { status: 401 }
            )
          }

          // Return P2P user data
          return NextResponse.json({
            user: {
              id: decoded.did,
              did: decoded.did,
              username: decoded.username || 'theodore',
              type: 'p2p',
              isApproved: true,
              isAdmin: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          })
        } catch (error) {
          return NextResponse.json(
            { error: 'Invalid P2P token' },
            { status: 401 }
          )
        }
      } else {
        // Traditional token verification
        const verifiedDecoded = jwt.verify(token, JWT_SECRET) as { userId: string }

        const db = getDatabase()
        const user = db.prepare(`
          SELECT id, email, username, is_approved as isApproved, is_admin as isAdmin,
                 created_at as createdAt, updated_at as updatedAt
          FROM users
          WHERE id = ?
        `).get(verifiedDecoded.userId) as any

        if (!user) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          )
        }

        if (!user.isApproved) {
          return NextResponse.json(
            { error: 'Account not approved' },
            { status: 403 }
          )
        }

        return NextResponse.json({
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            isApproved: Boolean(user.isApproved),
            isAdmin: Boolean(user.isAdmin),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        })
      }

    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      )
    }

  } catch (error) {
    console.error('Token verification error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}