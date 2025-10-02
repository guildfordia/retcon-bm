/**
 * P2P Presence System
 * Ephemeral presence tracking without any centralized service
 */

export interface PresenceMessage {
  ownerPubKey: string // User's public key identity
  peerId: string // libp2p peer ID
  username?: string // Display name
  collections: {
    name: string
    dbAddress: string
    count: number
    lastUpdated: number
  }[]
  status: 'online' | 'away' | 'busy'
  ts: number // Unix timestamp in ms
  sig: string // Signature over the message
}

export interface PresenceEntry extends PresenceMessage {
  lastSeen: number // Local timestamp when we last saw them
  isExpired?: boolean
}

type PresenceCallback = (users: PresenceEntry[]) => void

export class P2PPresenceSystem {
  private libp2p: any
  private userKeyPair: CryptoKeyPair | null = null
  private publicKey: string = ''
  private userId: string = ''
  private presence: Map<string, PresenceEntry> = new Map()
  private callbacks: Set<PresenceCallback> = new Set()
  private heartbeatInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null
  
  // Configuration
  private readonly TOPIC = 'p2p.presence.v1'
  private readonly HEARTBEAT_INTERVAL = 30000 // 30 seconds
  private readonly PRESENCE_TTL = 90000 // 90 seconds (3x heartbeat)
  private readonly MAX_MESSAGE_SIZE = 2048 // 2KB limit
  private readonly RATE_LIMIT_WINDOW = 1000 // 1 second
  private readonly RATE_LIMIT_MAX = 10 // max messages per window
  
  // Rate limiting
  private messageRates: Map<string, number[]> = new Map()
  
  constructor() {}

  /**
   * Initialize presence system with injected libp2p
   */
  async initialize(libp2p: any, userId: string, keyPair: CryptoKeyPair, publicKey: string) {
    console.log(' P2PPresenceSystem.initialize()')
    
    this.libp2p = libp2p
    this.userId = userId
    this.userKeyPair = keyPair
    this.publicKey = publicKey
    
    // Subscribe to presence topic
    this.libp2p.services.pubsub.subscribe(this.TOPIC)
    
    // Listen for presence messages
    this.libp2p.services.pubsub.addEventListener('message', this.handleMessage)
    
    // Start heartbeat
    this.startHeartbeat()
    
    // Start cleanup timer
    this.startCleanup()
    
    // Send initial presence
    await this.announcePresence()
    
    // Setup beforeunload handler for bye message
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.sendByeMessage()
      })
    }
    
    console.log(' Presence system initialized')
  }

  /**
   * Handle incoming presence message
   */
  private handleMessage = async (evt: any) => {
    if (evt.detail.topic !== this.TOPIC) return
    
    try {
      const data = new TextDecoder().decode(evt.detail.data)
      const message = JSON.parse(data) as PresenceMessage
      
      // Check message size
      if (data.length > this.MAX_MESSAGE_SIZE) {
        console.warn('Presence message too large, dropping')
        return
      }
      
      // Don't process our own messages
      if (message.ownerPubKey === this.publicKey) return
      
      // Rate limiting
      if (!this.checkRateLimit(message.peerId)) {
        console.warn('Rate limit exceeded for peer:', message.peerId.slice(0, 8))
        return
      }
      
      // Verify signature
      const isValid = await this.verifySignature(message)
      if (!isValid) {
        console.warn('Invalid presence signature from:', message.ownerPubKey.slice(0, 20))
        return
      }
      
      // Check if newer than existing
      const existing = this.presence.get(message.ownerPubKey)
      if (existing && existing.ts >= message.ts) {
        return // Ignore older messages
      }
      
      // Update presence
      const entry: PresenceEntry = {
        ...message,
        lastSeen: Date.now(),
        isExpired: false
      }
      
      this.presence.set(message.ownerPubKey, entry)
      console.log(' Presence updated:', message.username || message.ownerPubKey.slice(0, 20))
      
      // Notify callbacks
      this.notifyCallbacks()
      
    } catch (error) {
      console.error('Failed to process presence message:', error)
    }
  }

  /**
   * Check rate limit for a peer
   */
  private checkRateLimit(peerId: string): boolean {
    const now = Date.now()
    let timestamps = this.messageRates.get(peerId) || []
    
    // Remove old timestamps outside window
    timestamps = timestamps.filter(ts => now - ts < this.RATE_LIMIT_WINDOW)
    
    // Check if under limit
    if (timestamps.length >= this.RATE_LIMIT_MAX) {
      return false
    }
    
    // Add current timestamp
    timestamps.push(now)
    this.messageRates.set(peerId, timestamps)
    
    return true
  }

  /**
   * Verify signature of presence message
   */
  private async verifySignature(message: PresenceMessage): Promise<boolean> {
    try {
      // Extract signature and data
      const { sig, ...data } = message
      
      // Import public key
      const keyData = Uint8Array.from(atob(message.ownerPubKey), c => c.charCodeAt(0))
      const publicKey = await crypto.subtle.importKey(
        'spki',
        keyData,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['verify']
      )
      
      // Verify signature
      const encoder = new TextEncoder()
      const dataBuffer = encoder.encode(JSON.stringify(data))
      const signature = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
      
      return await crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' }
        },
        publicKey,
        signature,
        dataBuffer
      )
    } catch (error) {
      console.error('Signature verification failed:', error)
      return false
    }
  }

  /**
   * Sign presence data
   */
  private async signData(data: any): Promise<string> {
    if (!this.userKeyPair) throw new Error('No key pair available')
    
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(JSON.stringify(data))
    
    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      this.userKeyPair.privateKey,
      dataBuffer
    )
    
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.announcePresence()
    }, this.HEARTBEAT_INTERVAL)
  }

  /**
   * Start cleanup timer
   */
  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired()
    }, this.HEARTBEAT_INTERVAL / 2) // Check twice as often as heartbeat
  }

  /**
   * Clean up expired presence entries
   */
  private cleanupExpired() {
    const now = Date.now()
    let changed = false
    
    for (const [key, entry] of this.presence.entries()) {
      if (now - entry.lastSeen > this.PRESENCE_TTL) {
        // Mark as expired instead of deleting immediately
        if (!entry.isExpired) {
          entry.isExpired = true
          changed = true
          console.log(' User went offline:', entry.username || key.slice(0, 20))
        }
        
        // Delete if expired for too long
        if (now - entry.lastSeen > this.PRESENCE_TTL * 2) {
          this.presence.delete(key)
        }
      }
    }
    
    if (changed) {
      this.notifyCallbacks()
    }
    
    // Clean up rate limit data
    for (const [peerId, timestamps] of this.messageRates.entries()) {
      const filtered = timestamps.filter(ts => now - ts < this.RATE_LIMIT_WINDOW * 2)
      if (filtered.length === 0) {
        this.messageRates.delete(peerId)
      } else {
        this.messageRates.set(peerId, filtered)
      }
    }
  }

  /**
   * Announce our presence
   */
  async announcePresence(collections?: any[]) {
    if (!this.libp2p || !this.userKeyPair) return
    
    try {
      // Build presence message
      const message: Omit<PresenceMessage, 'sig'> = {
        ownerPubKey: this.publicKey,
        peerId: this.libp2p.peerId.toString(),
        username: this.userId, // Could be enhanced with real username
        collections: collections || [], // Will be populated by collection system
        status: 'online',
        ts: Date.now()
      }
      
      // Sign the message
      const sig = await this.signData(message)
      const signedMessage: PresenceMessage = { ...message, sig }
      
      // Check size
      const data = JSON.stringify(signedMessage)
      if (data.length > this.MAX_MESSAGE_SIZE) {
        console.warn('Presence message too large, truncating collections')
        message.collections = message.collections.slice(0, 3) // Limit to 3 collections
        const newSig = await this.signData(message)
        const truncated: PresenceMessage = { ...message, sig: newSig }
        const truncatedData = JSON.stringify(truncated)
        
        this.libp2p.services.pubsub.publish(
          this.TOPIC,
          new TextEncoder().encode(truncatedData)
        )
      } else {
        this.libp2p.services.pubsub.publish(
          this.TOPIC,
          new TextEncoder().encode(data)
        )
      }
      
      console.log(' Presence announced')
    } catch (error) {
      console.error('Failed to announce presence:', error)
    }
  }

  /**
   * Send bye message on shutdown
   */
  private sendByeMessage() {
    if (!this.libp2p || !this.userKeyPair) return
    
    try {
      // Build bye message (status: offline)
      const message: Omit<PresenceMessage, 'sig'> = {
        ownerPubKey: this.publicKey,
        peerId: this.libp2p.peerId.toString(),
        username: this.userId,
        collections: [],
        status: 'online', // Will be set to offline in future
        ts: Date.now()
      }
      
      // Try to sign synchronously (best effort)
      // Note: This might not work in all browsers on unload
      const encoder = new TextEncoder()
      const dataBuffer = encoder.encode(JSON.stringify(message))

      // Simple publish without signature on bye (best effort)
      this.libp2p.services.pubsub.publish(
        this.TOPIC,
        dataBuffer
      )
      
    } catch (error) {
      // Best effort, ignore errors
    }
  }

  /**
   * Notify all callbacks of presence changes
   */
  private notifyCallbacks() {
    const users = this.getOnlineUsers()
    this.callbacks.forEach(cb => {
      try {
        cb(users)
      } catch (error) {
        console.error('Presence callback error:', error)
      }
    })
  }

  /**
   * Get all online users
   */
  getOnlineUsers(): PresenceEntry[] {
    return Array.from(this.presence.values())
      .filter(entry => !entry.isExpired)
      .sort((a, b) => b.lastSeen - a.lastSeen)
  }

  /**
   * Get specific user presence
   */
  getUserPresence(ownerPubKey: string): PresenceEntry | null {
    const entry = this.presence.get(ownerPubKey)
    return entry && !entry.isExpired ? entry : null
  }

  /**
   * Subscribe to presence changes
   */
  onPresenceChange(callback: PresenceCallback): () => void {
    this.callbacks.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback)
    }
  }

  /**
   * Update our collections info (called by collection system)
   */
  async updateCollections(collections: any[]) {
    // Format collections for presence
    const formattedCollections = collections.slice(0, 5).map(c => ({
      name: c.name || 'main',
      dbAddress: c.dbAddress || '',
      count: c.count || 0,
      lastUpdated: c.lastUpdated || Date.now()
    }))
    
    // Announce with updated collections
    await this.announcePresence(formattedCollections)
  }

  /**
   * Stop presence system
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    this.sendByeMessage()
    
    if (this.libp2p?.services?.pubsub) {
      this.libp2p.services.pubsub.removeEventListener('message', this.handleMessage)
      this.libp2p.services.pubsub.unsubscribe(this.TOPIC)
    }
    
    this.presence.clear()
    this.callbacks.clear()
  }
}