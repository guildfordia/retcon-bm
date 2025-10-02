/**
 * P2P Collections System
 * Implements user-owned collection databases with forking support
 */

import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { ensureDatabaseReady, readDatabaseEntries } from './orbitdb-v2-utils'

// Entry types for the eventlog
export enum EntryType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  TOMBSTONE = 'TOMBSTONE'
}

// Collection entry schema
export interface CollectionEntry {
  type: EntryType
  docId: string // UUID unique per collection
  origin?: {
    originDocId: string
    originOwnerPubKey: string
    originDbAddress: string
  }
  version: number // Monotonic per docId
  title: string
  description: string
  filename: string
  mimeType: string
  size: number
  cid: string // IPFS CID of the file
  timestamp: number
  authorPubKey: string
  sig: string // Signature of the payload
  metadata?: Record<string, any>
}

// Collection announcement for discovery
export interface CollectionAnnouncement {
  ownerPubKey: string
  collectionName: string
  dbAddress: string
  profile?: {
    username?: string
    bio?: string
    avatar?: string
  }
  count: number
  lastUpdated: number
}

// Cached announcement with TTL
interface CachedAnnouncement extends CollectionAnnouncement {
  receivedAt: number
  peerId: string
}

export class P2PCollectionSystem {
  private libp2p: any
  private helia: any
  private orbitdb: any
  private collectionDb: any | null = null
  private remoteCollections: Map<string, any> = new Map()
  private userKeyPair: CryptoKeyPair | null = null
  private publicKey: string = ''
  private userId: string = ''
  private announcementCache: Map<string, CachedAnnouncement> = new Map()
  private announcementTTL = 30 * 60 * 1000 // 30 minutes
  private graceCacheTTL = 24 * 60 * 60 * 1000 // 24 hours
  private maxFileSize = 10 * 1024 * 1024 // 10 MB
  public presenceUpdateCallback: ((collections: any[]) => void) | null = null

  constructor() {}

  /**
   * Initialize the collection system with injected P2P core
   */
  async initialize(libp2p: any, helia: any, orbitdb: any, userId: string) {
    console.log(' P2PCollectionSystem.initialize()')
    
    this.libp2p = libp2p
    this.helia = helia
    this.orbitdb = orbitdb
    this.userId = userId

    // Generate or load user's key pair for signing
    console.log('   Generating key pair for collection signing...')
    this.userKeyPair = await this.generateKeyPair()
    this.publicKey = await this.exportPublicKey(this.userKeyPair.publicKey)
    console.log('   Key pair ready, public key:', this.publicKey.substring(0, 20) + '...')

    // Open user's collection database
    await this.openOwnCollection()

    // Start discovery service
    console.log('   Starting collection discovery...')
    await this.startDiscoveryService()

    console.log('   P2PCollectionSystem initialized')
  }

  /**
   * Open the user's own collection database
   */
  private async openOwnCollection() {
    // Database name format: collection::<ownerPubKey>::main
    const dbName = `collection::${this.publicKey}::main`
    console.log('   Opening collection database:', dbName.substring(0, 50) + '...')

    this.collectionDb = await this.orbitdb.open(dbName, {
      type: 'events',
      create: true,
      sync: true,
      // Access controller that only allows owner to write
      accessController: {
        type: 'orbitdb',
        write: [this.publicKey]
      }
    })

    await ensureDatabaseReady(this.collectionDb)
    console.log('   Collection database ready:', this.collectionDb.address)

    // Set up replication handlers
    this.collectionDb.events.on('replicated', () => {
      console.log(' Collection replicated from network')
      this.announceCollection()
    })

    this.collectionDb.events.on('write', () => {
      console.log(' Collection updated')
      this.announceCollection()
    })
  }

  /**
   * Generate a key pair for signing entries
   */
  private async generateKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    )
  }

  /**
   * Export public key as base64 string
   */
  private async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', publicKey)
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
  }

  /**
   * Import public key from base64 string
   */
  private async importPublicKey(pubKeyStr: string): Promise<CryptoKey> {
    const keyData = Uint8Array.from(atob(pubKeyStr), c => c.charCodeAt(0))
    return await crypto.subtle.importKey(
      'spki',
      keyData,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      false,
      ['verify']
    )
  }

  /**
   * Sign data with private key
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
   * Verify signature with public key
   */
  private async verifySignature(data: any, sig: string, pubKeyStr: string): Promise<boolean> {
    try {
      const publicKey = await this.importPublicKey(pubKeyStr)
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
   * Add a new document to the collection (CREATE)
   */
  async addDocument(
    file: File,
    metadata: {
      title: string
      description: string
    }
  ): Promise<CollectionEntry> {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new Error(`File size exceeds ${this.maxFileSize / 1024 / 1024}MB limit`)
    }

    console.log(' Adding document to collection:', metadata.title)

    // Store file in IPFS
    const fileBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(fileBuffer)
    const hash = await sha256.digest(bytes)
    const cid = CID.create(1, 0x55, hash)

    // Pin the file locally
    await this.pinFile(cid.toString(), bytes)

    // Create entry
    const entry: CollectionEntry = {
      type: EntryType.CREATE,
      docId: crypto.randomUUID(),
      version: 1,
      title: metadata.title,
      description: metadata.description,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      cid: cid.toString(),
      timestamp: Date.now(),
      authorPubKey: this.publicKey,
      sig: '' // Will be set after signing
    }

    // Sign the entry
    const { sig: _, ...dataToSign } = entry
    entry.sig = await this.signData(dataToSign)

    // Add to database
    await this.collectionDb!.add(entry)
    console.log(' Document added to collection')

    // Announce updated collection
    await this.announceCollection()

    return entry
  }

  /**
   * Update an existing document (UPDATE)
   */
  async updateDocument(
    docId: string,
    updates: {
      title?: string
      description?: string
      file?: File
    }
  ): Promise<CollectionEntry> {
    console.log(' Updating document:', docId)

    // Get current document state
    const current = await this.getDocument(docId)
    if (!current) {
      throw new Error('Document not found')
    }

    // Handle file update if provided
    let newCid = current.cid
    let newSize = current.size
    let newMimeType = current.mimeType
    let newFilename = current.filename

    if (updates.file) {
      if (updates.file.size > this.maxFileSize) {
        throw new Error(`File size exceeds ${this.maxFileSize / 1024 / 1024}MB limit`)
      }

      const fileBuffer = await updates.file.arrayBuffer()
      const bytes = new Uint8Array(fileBuffer)
      const hash = await sha256.digest(bytes)
      newCid = CID.create(1, 0x55, hash).toString()
      newSize = updates.file.size
      newMimeType = updates.file.type
      newFilename = updates.file.name

      // Pin the new file
      await this.pinFile(newCid, bytes)

      // Unpin the old file
      await this.unpinFile(current.cid)
    }

    // Create UPDATE entry
    const entry: CollectionEntry = {
      type: EntryType.UPDATE,
      docId,
      version: current.version + 1,
      title: updates.title || current.title,
      description: updates.description || current.description,
      filename: newFilename,
      mimeType: newMimeType,
      size: newSize,
      cid: newCid,
      timestamp: Date.now(),
      authorPubKey: this.publicKey,
      sig: '',
      origin: current.origin // Preserve origin if it's a fork
    }

    // Sign and add
    const { sig: _sig, ...dataToSign } = entry
    entry.sig = await this.signData(dataToSign)

    await this.collectionDb!.add(entry)
    console.log(' Document updated')

    await this.announceCollection()
    return entry
  }

  /**
   * Mark a document as deleted (TOMBSTONE)
   */
  async deleteDocument(docId: string): Promise<void> {
    console.log(' Deleting document:', docId)

    // Get current document to unpin file
    const current = await this.getDocument(docId)
    if (current) {
      await this.unpinFile(current.cid)
    }

    // Create TOMBSTONE entry
    const entry: Partial<CollectionEntry> = {
      type: EntryType.TOMBSTONE,
      docId,
      timestamp: Date.now(),
      authorPubKey: this.publicKey,
      sig: ''
    } as CollectionEntry

    // Sign and add
    const { sig: _sig, ...dataToSign } = entry
    entry.sig = await this.signData(dataToSign)

    await this.collectionDb!.add(entry)
    console.log(' Document tombstoned')

    await this.announceCollection()
  }

  /**
   * Fork a document from another collection
   */
  async forkDocument(
    originDoc: CollectionEntry,
    originOwnerPubKey: string,
    originDbAddress: string
  ): Promise<CollectionEntry> {
    console.log(' Forking document:', originDoc.title)

    // Pin the file locally if under size limit
    if (originDoc.size <= this.maxFileSize) {
      try {
        const file = await this.getFileFromIPFS(originDoc.cid)
        await this.pinFile(originDoc.cid, file)
      } catch (error) {
        console.warn('Could not pin forked file:', error)
      }
    }

    // Create new entry with origin metadata
    const entry: CollectionEntry = {
      type: EntryType.CREATE,
      docId: crypto.randomUUID(),
      origin: {
        originDocId: originDoc.docId,
        originOwnerPubKey,
        originDbAddress
      },
      version: 1,
      title: originDoc.title,
      description: originDoc.description,
      filename: originDoc.filename,
      mimeType: originDoc.mimeType,
      size: originDoc.size,
      cid: originDoc.cid,
      timestamp: Date.now(),
      authorPubKey: this.publicKey,
      sig: '',
      metadata: {
        forkedAt: Date.now(),
        originalVersion: originDoc.version
      }
    }

    // Sign and add
    const { sig: _sig, ...dataToSign } = entry
    entry.sig = await this.signData(dataToSign)

    await this.collectionDb!.add(entry)
    console.log(' Document forked to collection')

    await this.announceCollection()
    return entry
  }

  /**
   * Get the current state of a document
   */
  async getDocument(docId: string): Promise<CollectionEntry | null> {
    const entries = await readDatabaseEntries(this.collectionDb, { limit: 1000 })
    
    // Build document state from entries
    let currentState: CollectionEntry | null = null
    
    for (const entry of entries) {
      const doc = entry.value || entry.payload?.value || entry
      
      if (doc.docId === docId) {
        if (doc.type === EntryType.TOMBSTONE) {
          return null // Document is deleted
        }
        
        // Keep the latest version
        if (!currentState || doc.version > currentState.version) {
          currentState = doc
        }
      }
    }
    
    return currentState
  }

  /**
   * Get all documents in the collection
   */
  async getAllDocuments(): Promise<CollectionEntry[]> {
    const entries = await readDatabaseEntries(this.collectionDb, { limit: 1000 })
    
    // Build document states
    const documents = new Map<string, CollectionEntry>()
    const tombstones = new Set<string>()
    
    for (const entry of entries) {
      const doc = entry.value || entry.payload?.value || entry
      
      if (doc.type === EntryType.TOMBSTONE) {
        tombstones.add(doc.docId)
        documents.delete(doc.docId)
      } else if (!tombstones.has(doc.docId)) {
        const existing = documents.get(doc.docId)
        if (!existing || doc.version > existing.version) {
          documents.set(doc.docId, doc)
        }
      }
    }
    
    return Array.from(documents.values())
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Browse another user's collection (read-only replication)
   */
  async browseCollection(ownerPubKey: string, dbAddress: string): Promise<CollectionEntry[]> {
    console.log(' Browsing collection:', ownerPubKey.substring(0, 20) + '...')

    // Check if already replicated
    let remoteDb = this.remoteCollections.get(ownerPubKey)
    
    if (!remoteDb) {
      // Open and replicate the remote collection
      remoteDb = await this.orbitdb.open(dbAddress, {
        type: 'events',
        sync: true,
        create: false
      })
      
      await ensureDatabaseReady(remoteDb)
      this.remoteCollections.set(ownerPubKey, remoteDb)
      
      console.log(' Remote collection replicated')
    }

    // Read entries
    const entries = await readDatabaseEntries(remoteDb, { limit: 1000 })
    
    // Build document states (same logic as getAllDocuments)
    const documents = new Map<string, CollectionEntry>()
    const tombstones = new Set<string>()
    
    for (const entry of entries) {
      const doc = entry.value || entry.payload?.value || entry
      
      // Verify signature to ensure authenticity
      const dataToVerify = { ...doc }
      delete dataToVerify.sig
      const isValid = await this.verifySignature(dataToVerify, doc.sig, ownerPubKey)
      
      if (!isValid) {
        console.warn('Invalid signature for entry:', doc.docId)
        continue
      }
      
      if (doc.type === EntryType.TOMBSTONE) {
        tombstones.add(doc.docId)
        documents.delete(doc.docId)
      } else if (!tombstones.has(doc.docId)) {
        const existing = documents.get(doc.docId)
        if (!existing || doc.version > existing.version) {
          documents.set(doc.docId, doc)
        }
      }
    }
    
    return Array.from(documents.values())
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Pin a file to local storage
   */
  private async pinFile(cid: string, data: Uint8Array): Promise<void> {
    try {
      // Store in session storage for now (browser)
      if (typeof window !== 'undefined') {
        const key = `pinned-file-${cid}`
        const base64 = btoa(String.fromCharCode(...data))
        sessionStorage.setItem(key, base64)
      }
      
      // Also pin in Helia if available
      if (this.helia?.pins) {
        await this.helia.pins.add(CID.parse(cid))
      }
      
      console.log(' File pinned:', cid.substring(0, 20) + '...')
    } catch (error) {
      console.error('Failed to pin file:', error)
    }
  }

  /**
   * Unpin a file from local storage
   */
  private async unpinFile(cid: string): Promise<void> {
    try {
      // Remove from session storage
      if (typeof window !== 'undefined') {
        const key = `pinned-file-${cid}`
        sessionStorage.removeItem(key)
      }
      
      // Unpin from Helia if available
      if (this.helia?.pins) {
        await this.helia.pins.rm(CID.parse(cid))
      }
      
      console.log(' File unpinned:', cid.substring(0, 20) + '...')
    } catch (error) {
      console.error('Failed to unpin file:', error)
    }
  }

  /**
   * Get file from IPFS
   */
  async getFileFromIPFS(cid: string): Promise<Uint8Array> {
    // Try session storage first
    if (typeof window !== 'undefined') {
      const key = `pinned-file-${cid}`
      const base64 = sessionStorage.getItem(key)
      if (base64) {
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      }
    }
    
    // Try Helia
    if (this.helia?.blockstore) {
      try {
        const cidObj = CID.parse(cid)
        return await this.helia.blockstore.get(cidObj)
      } catch (error) {
        console.error('File not found in IPFS:', error)
      }
    }
    
    throw new Error('File not found')
  }

  /**
   * Start the discovery service for collection announcements
   */
  private async startDiscoveryService() {
    const DISCOVERY_TOPIC = 'p2p.collections.directory'
    
    // Subscribe to discovery topic
    this.libp2p.services.pubsub.subscribe(DISCOVERY_TOPIC)
    
    // Listen for announcements
    this.libp2p.services.pubsub.addEventListener('message', (evt: any) => {
      if (evt.detail.topic === DISCOVERY_TOPIC) {
        try {
          const announcement = JSON.parse(
            new TextDecoder().decode(evt.detail.data)
          ) as CollectionAnnouncement
          
          this.handleAnnouncement(announcement, evt.detail.from.toString())
        } catch (error) {
          console.error('Failed to parse announcement:', error)
        }
      }
    })
    
    // Announce our collection immediately and periodically
    await this.announceCollection()
    setInterval(() => this.announceCollection(), 30000) // Every 30 seconds
    
    // Clean up stale announcements periodically
    setInterval(() => this.cleanupAnnouncements(), 60000) // Every minute
  }

  /**
   * Announce our collection to the network
   */
  private async announceCollection() {
    if (!this.collectionDb) return
    
    const documents = await this.getAllDocuments()
    
    const announcement: CollectionAnnouncement = {
      ownerPubKey: this.publicKey,
      collectionName: 'main',
      dbAddress: this.collectionDb.address.toString(),
      count: documents.length,
      lastUpdated: Date.now(),
      profile: {
        username: this.userId // Could be enhanced with real profile data
      }
    }
    
    const DISCOVERY_TOPIC = 'p2p.collections.directory'
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(announcement))
    
    this.libp2p.services.pubsub.publish(DISCOVERY_TOPIC, data)
    console.log(' Collection announced:', documents.length, 'documents')
    
    // Also update presence with collection info
    if (this.presenceUpdateCallback) {
      const collections = [{
        name: 'main',
        dbAddress: this.collectionDb.address.toString(),
        count: documents.length,
        lastUpdated: Date.now()
      }]
      this.presenceUpdateCallback(collections)
    }
  }

  /**
   * Handle incoming collection announcement
   */
  private handleAnnouncement(announcement: CollectionAnnouncement, peerId: string) {
    // Don't cache our own announcements
    if (announcement.ownerPubKey === this.publicKey) return
    
    const cached: CachedAnnouncement = {
      ...announcement,
      receivedAt: Date.now(),
      peerId
    }
    
    this.announcementCache.set(announcement.ownerPubKey, cached)
    console.log(' Collection discovered:', 
      announcement.ownerPubKey.substring(0, 20) + '...',
      `(${announcement.count} documents)`
    )
  }

  /**
   * Clean up stale announcements
   */
  private cleanupAnnouncements() {
    const now = Date.now()
    const stale: string[] = []
    
    this.announcementCache.forEach((announcement, key) => {
      if (now - announcement.receivedAt > this.announcementTTL) {
        stale.push(key)
      }
    })
    
    stale.forEach(key => {
      this.announcementCache.delete(key)
      console.log(' Removed stale announcement:', key.substring(0, 20) + '...')
    })
  }

  /**
   * Get all discovered collections (for Global Feed)
   */
  getDiscoveredCollections(): CollectionAnnouncement[] {
    const collections: CollectionAnnouncement[] = []
    
    // Add our own collection
    if (this.collectionDb) {
      this.getAllDocuments().then(docs => {
        collections.push({
          ownerPubKey: this.publicKey,
          collectionName: 'main',
          dbAddress: this.collectionDb!.address.toString(),
          count: docs.length,
          lastUpdated: Date.now(),
          profile: {
            username: this.userId
          }
        })
      })
    }
    
    // Add cached announcements
    this.announcementCache.forEach(announcement => {
      collections.push(announcement)
    })
    
    return collections.sort((a, b) => b.lastUpdated - a.lastUpdated)
  }

  /**
   * Get collection availability
   */
  getCollectionAvailability(ownerPubKey: string): 'online' | 'offline' | 'cached' {
    const announcement = this.announcementCache.get(ownerPubKey)
    
    if (!announcement) return 'offline'
    
    const age = Date.now() - announcement.receivedAt
    
    if (age < this.announcementTTL) return 'online'
    if (age < this.graceCacheTTL) return 'cached'
    
    return 'offline'
  }
}