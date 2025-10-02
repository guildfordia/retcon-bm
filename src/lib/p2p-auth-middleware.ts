/**
 * P2P Authentication Middleware
 *
 * This module provides a unified authentication system that supports:
 * 1. P2P (Peer-to-Peer) authentication with DIDs and cryptographic verification
 * 2. Legacy JWT-based authentication with database-backed users
 *
 * The middleware tries P2P auth first, then falls back to legacy auth.
 * This allows the system to support both decentralized and traditional users.
 *
 * Architecture:
 * - P2P users: Identified by DID (did:p2p:...), session stored in cookies
 * - Legacy users: Identified by UUID, session in JWT tokens/cookies
 * - Both types can coexist and interoperate in the system
 */

import { NextRequest } from 'next/server'
import { P2PSystem } from '@/lib/p2p/p2p-system'
import { P2PIdentityManager, P2PUser } from '@/lib/p2p/identity-manager'
import { P2PConfig } from '@/lib/p2p/types'
import jwt from 'jsonwebtoken'
import { getDatabase } from '@/lib/database'

/**
 * Authentication Context
 *
 * Unified authentication result containing the authenticated user
 * and metadata about the authentication method used.
 *
 * @property user - The authenticated user (P2P or Legacy)
 * @property authType - Which auth system was used
 * @property session - Optional session data (mainly for P2P)
 */
export interface AuthContext {
  user: P2PUser | LegacyUser | null
  authType: 'p2p' | 'legacy' | null
  session?: {
    token: string
    expiresAt: number
  }
}

/**
 * Legacy User Interface
 *
 * Represents a traditional database-backed user account.
 * These users authenticate with username/password and are stored in SQLite.
 *
 * @property id - UUID identifier
 * @property email - User's email address
 * @property username - Display name
 * @property isApproved - Whether admin has approved this user
 * @property isAdmin - Whether user has admin privileges
 */
export interface LegacyUser {
  id: string
  email: string
  username: string
  isApproved: boolean
  isAdmin: boolean
}

// Server P2P configuration for middleware
const createMiddlewareP2PConfig = (): P2PConfig => ({
  userId: 'middleware',
  storage: {
    directory: '/tmp/claude/middleware-p2p',
    maxSize: 50 * 1024 * 1024
  },
  network: {
    bootstrap: [],
    maxPeers: 10
  },
  search: {
    indexSize: 1000,
    updateInterval: 60000
  },
  security: {
    requireProofOfWork: false,
    rateLimits: {
      maxOperationsPerMinute: 100,
      maxBytesPerOperation: 1024 * 1024,
      maxBytesPerMinute: 10 * 1024 * 1024,
      proofOfWorkDifficulty: 4
    }
  },
  schemas: {
    operationSchema: 'v1',
    activitySchema: 'v1'
  }
})

let middlewareP2PSystem: P2PSystem | null = null
let middlewareIdentityManager: P2PIdentityManager | null = null

async function getMiddlewareP2PSystem(): Promise<{ p2pSystem: P2PSystem, identityManager: P2PIdentityManager }> {
  if (!middlewareP2PSystem || !middlewareIdentityManager) {
    middlewareP2PSystem = new P2PSystem(createMiddlewareP2PConfig())
    middlewareIdentityManager = new P2PIdentityManager()

    try {
      await middlewareP2PSystem.initialize()
      await middlewareIdentityManager.initialize(middlewareP2PSystem)
    } catch (error) {
      console.warn('P2P system initialization failed in middleware:', error)
      // Continue with legacy auth only
    }
  }

  return { p2pSystem: middlewareP2PSystem, identityManager: middlewareIdentityManager }
}

/**
 * Authenticate request using P2P or legacy auth
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthContext> {
  // Try P2P authentication first
  const p2pAuth = await tryP2PAuthentication(request)
  if (p2pAuth.user) {
    return p2pAuth
  }

  // Fallback to legacy authentication
  const legacyAuth = await tryLegacyAuthentication(request)
  return legacyAuth
}

/**
 * Try P2P authentication
 */
async function tryP2PAuthentication(request: NextRequest): Promise<AuthContext> {
  try {
    // Check for P2P session cookie
    const p2pSessionCookie = request.cookies.get('p2p_session')
    if (!p2pSessionCookie) {
      return { user: null, authType: null }
    }

    const { identityManager } = await getMiddlewareP2PSystem()
    if (!identityManager) {
      return { user: null, authType: null }
    }

    // Validate P2P session
    const session = await identityManager.authenticate({
      sessionToken: p2pSessionCookie.value
    })

    const user = identityManager.getCurrentUser()
    if (!user) {
      return { user: null, authType: null }
    }

    return {
      user,
      authType: 'p2p',
      session: {
        token: p2pSessionCookie.value,
        expiresAt: session.expiresAt
      }
    }

  } catch (error) {
    console.warn('P2P authentication failed:', error)
    return { user: null, authType: null }
  }
}

/**
 * Try legacy JWT authentication
 */
async function tryLegacyAuthentication(request: NextRequest): Promise<AuthContext> {
  try {
    // Check Authorization header
    const authHeader = request.headers.get('authorization')
    let token: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    } else {
      // Check cookie
      const sessionCookie = request.cookies.get('session')
      if (sessionCookie) {
        token = sessionCookie.value
      }
    }

    if (!token) {
      return { user: null, authType: null }
    }

    // Verify JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    const decoded = jwt.verify(token, JWT_SECRET) as any

    if (!decoded.userId) {
      return { user: null, authType: null }
    }

    // Get user from database
    const db = getDatabase()
    const user = db.prepare(`
      SELECT id, email, username, is_approved, is_admin
      FROM users
      WHERE id = ?
    `).get(decoded.userId) as any

    if (!user || !user.is_approved) {
      return { user: null, authType: null }
    }

    const legacyUser: LegacyUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      isApproved: Boolean(user.is_approved),
      isAdmin: Boolean(user.is_admin)
    }

    return {
      user: legacyUser,
      authType: 'legacy'
    }

  } catch (error) {
    console.warn('Legacy authentication failed:', error)
    return { user: null, authType: null }
  }
}

/**
 * Require authentication (P2P or legacy)
 */
export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const authContext = await authenticateRequest(request)

  if (!authContext.user) {
    throw new Error('Authentication required')
  }

  return authContext
}

/**
 * Get user ID from auth context
 */
export function getUserId(authContext: AuthContext): string | null {
  if (!authContext.user) return null

  if (authContext.authType === 'p2p') {
    return (authContext.user as P2PUser).did
  } else {
    return (authContext.user as LegacyUser).id
  }
}

/**
 * Get username from auth context
 */
export function getUsername(authContext: AuthContext): string | null {
  if (!authContext.user) return null
  return authContext.user.username
}

/**
 * Check if user has admin permissions
 */
export function isAdmin(authContext: AuthContext): boolean {
  if (!authContext.user) return false

  if (authContext.authType === 'p2p') {
    return (authContext.user as P2PUser).permissions.canModerate
  } else {
    return (authContext.user as LegacyUser).isAdmin
  }
}

/**
 * Check if user can create collections
 */
export function canCreateCollections(authContext: AuthContext): boolean {
  if (!authContext.user) return false

  if (authContext.authType === 'p2p') {
    return (authContext.user as P2PUser).permissions.canCreate
  } else {
    return (authContext.user as LegacyUser).isApproved
  }
}

/**
 * Get user reputation (P2P only)
 */
export function getUserReputation(authContext: AuthContext): number {
  if (authContext.authType === 'p2p') {
    return (authContext.user as P2PUser).reputation.score
  }
  return 0 // Legacy users have no reputation system
}

/**
 * Create unified user response for API
 */
export function createUserResponse(authContext: AuthContext) {
  if (!authContext.user) return null

  if (authContext.authType === 'p2p') {
    const p2pUser = authContext.user as P2PUser
    return {
      id: p2pUser.did,
      username: p2pUser.username,
      email: p2pUser.email,
      displayName: p2pUser.profile.displayName,
      bio: p2pUser.profile.bio,
      authType: 'p2p',
      reputation: p2pUser.reputation,
      permissions: p2pUser.permissions,
      profile: p2pUser.profile
    }
  } else {
    const legacyUser = authContext.user as LegacyUser
    return {
      id: legacyUser.id,
      username: legacyUser.username,
      email: legacyUser.email,
      authType: 'legacy',
      isApproved: legacyUser.isApproved,
      isAdmin: legacyUser.isAdmin
    }
  }
}

/**
 * Middleware function for Next.js API routes
 */
export function withAuth(handler: (request: NextRequest, authContext: AuthContext) => Promise<Response>) {
  return async (request: NextRequest) => {
    try {
      const authContext = await authenticateRequest(request)
      return await handler(request, authContext)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return new Response(
        JSON.stringify({ error: 'Authentication error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}

/**
 * Protected middleware - requires authentication
 */
export function withRequiredAuth(handler: (request: NextRequest, authContext: AuthContext) => Promise<Response>) {
  return async (request: NextRequest) => {
    try {
      const authContext = await requireAuth(request)
      return await handler(request, authContext)
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}