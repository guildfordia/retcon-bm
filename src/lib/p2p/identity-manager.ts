/**
 * P2P Identity Management System
 * Replaces traditional JWT+SQLite authentication with decentralized identity
 * Based on public key cryptography and OrbitDB
 */

import { P2PSystem } from './p2p-system'
import { CryptoIdentityManager } from './crypto-identity'
import { P2PConfig, KeyPair, SignedData, P2PError } from './types'

export interface P2PUser {
  did: string              // Deterministic ID from public key
  publicKey: string        // Base64 encoded public key
  username: string         // Human readable username
  email?: string          // Optional email for compatibility
  profile: {
    displayName?: string
    bio?: string
    avatarCID?: string     // IPFS CID of avatar image
    created: number
    lastSeen: number
  }
  reputation: {
    score: number          // Community reputation score
    interactions: number   // Number of P2P interactions
    verified: boolean      // Verification status
  }
  permissions: {
    canCreate: boolean     // Can create collections
    canModerate: boolean   // Can moderate content
    isBlocked: boolean     // Blocked by peers
  }
}

export interface P2PSession {
  did: string
  publicKey: string
  username: string
  expiresAt: number
  signature: string      // Self-signed session token
  nonce: string         // Anti-replay nonce
}

export class P2PIdentityManager {
  private p2pSystem: P2PSystem | null = null
  private cryptoManager: CryptoIdentityManager
  private currentUser: P2PUser | null = null
  private currentSession: P2PSession | null = null
  private userKeyPair: KeyPair | null = null

  constructor() {
    this.cryptoManager = new CryptoIdentityManager()
  }

  /**
   * Initialize identity manager with P2P system
   */
  async initialize(p2pSystem: P2PSystem): Promise<void> {
    this.p2pSystem = p2pSystem
    console.log('P2P Identity Manager initialized')
  }

  /**
   * Create new P2P identity (equivalent to registration)
   */
  async createIdentity(params: {
    username: string
    email?: string
    displayName?: string
    bio?: string
  }): Promise<P2PUser> {
    if (!this.p2pSystem) {
      throw new P2PError('P2P system not initialized', 'NOT_INITIALIZED')
    }

    // Generate key pair for new identity
    this.userKeyPair = await this.generateKeyPair()
    await this.cryptoManager.initialize(this.userKeyPair)

    // Create deterministic DID from public key
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', this.userKeyPair.publicKey)
    const publicKeyBytes = new Uint8Array(publicKeyBuffer)
    const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes))

    // Create DID using hash of public key
    const publicKeyHash = await crypto.subtle.digest('SHA-256', publicKeyBytes)
    const did = 'did:p2p:' + btoa(String.fromCharCode(...new Uint8Array(publicKeyHash))).substring(0, 43)

    // Check if username is already taken
    const existingUser = await this.findUserByUsername(params.username)
    if (existingUser) {
      throw new P2PError('Username already exists', 'USERNAME_TAKEN', { username: params.username })
    }

    // Create user profile
    const user: P2PUser = {
      did,
      publicKey: publicKeyBase64,
      username: params.username,
      email: params.email,
      profile: {
        displayName: params.displayName || params.username,
        bio: params.bio,
        created: Date.now(),
        lastSeen: Date.now()
      },
      reputation: {
        score: 0,
        interactions: 0,
        verified: false
      },
      permissions: {
        canCreate: true,
        canModerate: false,
        isBlocked: false
      }
    }

    // Store user profile in P2P network
    await this.storeUserProfile(user)

    this.currentUser = user
    console.log(`Created P2P identity: ${user.username} (${did})`)

    return user
  }

  /**
   * Authenticate with existing P2P identity
   */
  async authenticate(params: {
    privateKeyJWK?: JsonWebKey  // Import existing private key
    sessionToken?: string       // Resume existing session
  }): Promise<P2PSession> {
    if (!this.p2pSystem) {
      throw new P2PError('P2P system not initialized', 'NOT_INITIALIZED')
    }

    let user: P2PUser | null = null

    if (params.sessionToken) {
      // Validate and resume existing session
      const session = await this.validateSession(params.sessionToken)
      if (session) {
        user = await this.findUserByDID(session.did)
        if (user) {
          this.currentUser = user
          this.currentSession = session
          return session
        }
      }
      throw new P2PError('Invalid session token', 'INVALID_SESSION')
    }

    if (params.privateKeyJWK) {
      // Import existing key pair
      this.userKeyPair = {
        publicKey: await crypto.subtle.importKey(
          'jwk',
          { ...params.privateKeyJWK, key_ops: ['verify'], ext: true },
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        ),
        privateKey: await crypto.subtle.importKey(
          'jwk',
          params.privateKeyJWK,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign']
        )
      }

      await this.cryptoManager.initialize(this.userKeyPair)

      // Derive DID from public key
      const publicKeyBuffer = await crypto.subtle.exportKey('spki', this.userKeyPair.publicKey)
      const publicKeyHash = await crypto.subtle.digest('SHA-256', new Uint8Array(publicKeyBuffer))
      const did = 'did:p2p:' + btoa(String.fromCharCode(...new Uint8Array(publicKeyHash))).substring(0, 43)

      user = await this.findUserByDID(did)
      if (!user) {
        throw new P2PError('Identity not found', 'IDENTITY_NOT_FOUND', { did })
      }

      this.currentUser = user
    }

    if (!user || !this.userKeyPair) {
      throw new P2PError('Authentication failed', 'AUTH_FAILED')
    }

    // Create new session
    const session = await this.createSession(user)
    this.currentSession = session

    // Update last seen
    user.profile.lastSeen = Date.now()
    await this.storeUserProfile(user)

    console.log(`Authenticated P2P identity: ${user.username}`)
    return session
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    if (this.currentUser) {
      console.log(`Signed out: ${this.currentUser.username}`)
    }

    this.currentUser = null
    this.currentSession = null
    this.userKeyPair = null
    this.cryptoManager = new CryptoIdentityManager()
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): P2PUser | null {
    return this.currentUser
  }

  /**
   * Get current session
   */
  getCurrentSession(): P2PSession | null {
    return this.currentSession
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<P2PUser['profile']>): Promise<P2PUser> {
    if (!this.currentUser) {
      throw new P2PError('Not authenticated', 'NOT_AUTHENTICATED')
    }

    this.currentUser.profile = {
      ...this.currentUser.profile,
      ...updates
    }

    await this.storeUserProfile(this.currentUser)
    return this.currentUser
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username: string): Promise<P2PUser | null> {
    if (!this.p2pSystem) return null

    try {
      // Search through user registry
      const registry = await this.p2pSystem.openCollection('_user_registry', { create: true })
      const users = await registry.listDocuments()

      for (const doc of users) {
        if (doc.metadata?.username === username) {
          return doc.metadata as P2PUser
        }
      }
      return null
    } catch (error) {
      console.error('Error finding user by username:', error)
      return null
    }
  }

  /**
   * Find user by DID
   */
  async findUserByDID(did: string): Promise<P2PUser | null> {
    if (!this.p2pSystem) return null

    try {
      const registry = await this.p2pSystem.openCollection('_user_registry', { create: true })
      const users = await registry.listDocuments()

      for (const doc of users) {
        if (doc.metadata?.did === did) {
          return doc.metadata as P2PUser
        }
      }
      return null
    } catch (error) {
      console.error('Error finding user by DID:', error)
      return null
    }
  }

  /**
   * List all registered users
   */
  async listUsers(limit: number = 100): Promise<P2PUser[]> {
    if (!this.p2pSystem) return []

    try {
      const registry = await this.p2pSystem.openCollection('_user_registry', { create: true })
      const docs = await registry.listDocuments()

      return docs
        .map(doc => doc.metadata as P2PUser)
        .filter(user => user && user.did)
        .slice(0, limit)
    } catch (error) {
      console.error('Error listing users:', error)
      return []
    }
  }

  /**
   * Verify signature from another user
   */
  async verifyUserSignature(
    did: string,
    data: any,
    signature: string
  ): Promise<boolean> {
    try {
      const user = await this.findUserByDID(did)
      if (!user) return false

      // Import user's public key
      const publicKeyData = Uint8Array.from(atob(user.publicKey), c => c.charCodeAt(0))
      const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      )

      // Verify signature
      const dataBytes = new TextEncoder().encode(JSON.stringify(data))
      const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0))

      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signatureBytes,
        dataBytes
      )
    } catch (error) {
      console.error('Error verifying signature:', error)
      return false
    }
  }

  /**
   * Export current user's private key (for backup/migration)
   */
  async exportPrivateKey(): Promise<JsonWebKey | null> {
    if (!this.userKeyPair) return null

    return await crypto.subtle.exportKey('jwk', this.userKeyPair.privateKey)
  }

  /**
   * Get user reputation score
   */
  async getUserReputation(did: string): Promise<number> {
    const user = await this.findUserByDID(did)
    return user?.reputation.score || 0
  }

  /**
   * Update user reputation (community-based)
   */
  async updateReputation(did: string, delta: number, reason: string): Promise<void> {
    if (!this.currentUser) {
      throw new P2PError('Not authenticated', 'NOT_AUTHENTICATED')
    }

    const user = await this.findUserByDID(did)
    if (!user) return

    user.reputation.score = Math.max(0, user.reputation.score + delta)
    user.reputation.interactions += 1

    await this.storeUserProfile(user)

    console.log(`Updated reputation for ${user.username}: ${delta} (${reason})`)
  }

  // Private methods

  private async generateKeyPair(): Promise<KeyPair> {
    return await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )
  }

  private async storeUserProfile(user: P2PUser): Promise<void> {
    if (!this.p2pSystem) return

    try {
      const registry = await this.p2pSystem.openCollection('_user_registry', { create: true })

      // Store as document with DID as filename
      const profileFile = new File(
        [JSON.stringify(user, null, 2)],
        `${user.did}.json`,
        { type: 'application/json' }
      )

      await registry.publishDocument(profileFile, {
        title: `User Profile: ${user.username}`,
        description: `P2P identity for ${user.username}`,
        tags: ['user-profile', user.username],
        metadata: user
      })
    } catch (error) {
      console.error('Error storing user profile:', error)
      throw new P2PError('Failed to store user profile', 'STORAGE_ERROR', { error })
    }
  }

  private async createSession(user: P2PUser): Promise<P2PSession> {
    if (!this.userKeyPair) {
      throw new P2PError('No key pair available', 'NO_KEYPAIR')
    }

    const nonce = crypto.randomUUID()
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days

    const sessionData = {
      did: user.did,
      publicKey: user.publicKey,
      username: user.username,
      nonce,
      expiresAt
    }

    // Sign session data
    const dataBytes = new TextEncoder().encode(JSON.stringify(sessionData))
    const signatureBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.userKeyPair.privateKey,
      dataBytes
    )

    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))

    return {
      ...sessionData,
      signature
    }
  }

  private async validateSession(sessionToken: string): Promise<P2PSession | null> {
    try {
      const sessionData = JSON.parse(atob(sessionToken)) as P2PSession

      // Check expiration
      if (sessionData.expiresAt < Date.now()) {
        return null
      }

      // Verify signature
      const user = await this.findUserByDID(sessionData.did)
      if (!user) return null

      const { signature, ...dataToVerify } = sessionData
      const isValid = await this.verifyUserSignature(sessionData.did, dataToVerify, signature)

      return isValid ? sessionData : null
    } catch (error) {
      console.error('Error validating session:', error)
      return null
    }
  }
}