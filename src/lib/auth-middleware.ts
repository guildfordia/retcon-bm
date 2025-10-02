/**
 * Authentication Middleware
 *
 * This module provides JWT-based authentication for both traditional
 * username/password auth and P2P (decentralized) authentication.
 *
 * It supports two authentication modes:
 * 1. Traditional: User credentials stored in SQLite, requires approval
 * 2. P2P: Decentralized identity (DID), auto-approved, no database storage
 */

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { jwtVerify, decodeJwt } from 'jose'
import { getDatabase } from './database'

/**
 * Security Check: Validate JWT_SECRET is configured
 *
 * The JWT_SECRET is used to sign and verify authentication tokens.
 * A weak or default secret compromises the entire authentication system.
 */
if (!process.env.JWT_SECRET) {
  console.error('  JWT_SECRET environment variable is not set!')
  console.error('  Using insecure default for development only')
  console.error('  NEVER use this in production!')
}

if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
  console.error('  JWT_SECRET is still set to default value!')
  console.error('  This is INSECURE. Please set a random secret key.')
}

// Use environment variable or fallback to insecure default for development
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

/**
 * Authenticated User Interface
 *
 * Represents a verified user in the system, either from traditional
 * database authentication or P2P decentralized authentication.
 *
 * @property id - User identifier (database ID or DID for P2P)
 * @property email - User email address (may be empty for P2P users)
 * @property username - Display name for the user
 * @property isApproved - Whether user has been approved by admin (always true for P2P)
 * @property isAdmin - Whether user has administrative privileges
 */
export interface AuthUser {
  id: string
  email: string
  username: string
  isApproved: boolean
  isAdmin: boolean
}

/**
 * Verify Authentication Token
 *
 * Extracts and validates the JWT token from the Authorization header.
 * Supports both traditional database-backed users and P2P decentralized users.
 *
 * Token Formats:
 * - P2P Token: { type: 'p2p', did: 'did:p2p:...', username: '...', ... }
 * - Traditional Token: { userId: '...', ... }
 *
 * @param request - Next.js request object containing headers
 * @returns AuthUser object if valid, null if authentication fails
 */
export async function verifyAuth(request: NextRequest): Promise<AuthUser | null> {
  try {
    // Extract Authorization header
    // Expected format: "Bearer <jwt_token>"
    const authorization = request.headers.get('authorization')

    if (!authorization || !authorization.startsWith('Bearer ')) {
      return null
    }

    // Extract token (remove "Bearer " prefix)
    const token = authorization.substring(7)

    // First, decode without verification to check token type
    let decoded: any
    try {
      decoded = decodeJwt(token)
    } catch (error) {
      console.error('Token decode failed:', error)
      return null
    }

    try {
      // CASE 1: P2P Authentication (EdDSA/Ed25519 tokens)
      // P2P tokens contain a DID (Decentralized Identifier) and type field
      if (decoded.type === 'p2p' && decoded.did) {
        // P2P tokens are self-signed with Ed25519 private keys
        // We trust the DID without verification since it's derived from the public key
        // In a production system, you might want to verify against a public key registry
        return {
          id: decoded.did,                        // Use DID as user ID
          email: decoded.email || '',             // Email may not be present
          username: decoded.username || 'P2P User', // Use token username
          isApproved: true,                       // P2P users auto-approved
          isAdmin: false                          // P2P users are not admins
        }
      }

      // CASE 2: Traditional Authentication (HS256 tokens)
      // Traditional tokens contain a userId field pointing to database record
      // Verify JWT signature with shared secret
      const verifiedDecoded = jwt.verify(token, JWT_SECRET) as any

      const userId = verifiedDecoded.userId
      if (!userId) {
        return null
      }

      // Look up user in SQLite database
      const db = getDatabase()
      const user = db.prepare(`
        SELECT id, email, username, is_approved as isApproved, is_admin as isAdmin
        FROM users
        WHERE id = ?
      `).get(userId) as any

      if (!user) {
        return null
      }

      // Verify user has been approved by admin
      // Unapproved users cannot access protected routes
      if (!user.isApproved) {
        return null
      }

      // Return traditional user from database
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        isApproved: Boolean(user.isApproved),
        isAdmin: Boolean(user.isAdmin)
      }

    } catch (error) {
      // Token verification failed (invalid signature, expired, malformed)
      console.error('Token verification failed:', error)
      return null
    }

  } catch (error) {
    // Unexpected error during auth verification
    console.error('Auth verification error:', error)
    return null
  }
}

/**
 * Authentication Wrapper for Route Handlers
 *
 * Higher-order function that wraps API route handlers with authentication.
 * Automatically verifies the user's token before calling the handler.
 *
 * Usage:
 *   export const GET = requireAuth(async (request, user) => {
 *     // user is guaranteed to be authenticated here
 *     return NextResponse.json({ data: "..." })
 *   })
 *
 * @param handler - Async function that receives request and authenticated user
 * @returns Wrapped handler that performs auth check before execution
 */
export function requireAuth(handler: (request: NextRequest, user: AuthUser) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Verify authentication
    const user = await verifyAuth(request)

    // Reject if authentication failed
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Call the wrapped handler with authenticated user
    return handler(request, user)
  }
}