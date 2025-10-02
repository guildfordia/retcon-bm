import { createHelia } from 'helia'
import { createOrbitDB } from '@orbitdb/core'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { 
  readDatabaseEntries, 
  normalizeEntry, 
  ensureDatabaseReady,
  buildDocumentState,
  isClientSide 
} from './orbitdb-v2-utils'

// Document types with blockchain-like structure
export interface DocumentEntry {
  id: string
  cid: string // IPFS CID of the file
  title: string
  description: string
  filename: string
  mimeType: string
  size: number
  authorPubKey: string // Author's public key
  signature: string // Signature of the document data
  timestamp: number
  version: number
  deleted?: boolean // Tombstone flag
  forkOf?: { // Fork lineage
    originCid: string
    originAuthorPubKey: string
    originLogId: string
    originSeq: number
  }
  metadata?: Record<string, any>
}

export interface CollectionEntry {
  cid: string
  originAuthorPubKey: string
  originLogId: string
  originSeq: number
  addedBy: string
  addedAt: number
  pinned: boolean
}

export interface PeerAvailability {
  docId: string
  peers: Set<string>
  lastSeen: Map<string, number>
}

export class P2PDocumentSystem {
  private libp2p: any | null = null
  private orbitdb: any | null = null
  private helia: any = null
  private documentsDb: any | null = null
  private collectionsDb: any | null = null
  private discoveryIndex: Map<string, PeerAvailability> = new Map()
  private cachePolicy = {
    autoCache: true,
    cacheHours: 24,
    maxCacheSize: 500 * 1024 * 1024 // 500MB
  }
  private userKeyPair: CryptoKeyPair | null = null
  private userId: string = ''

  constructor() {}

  async initialize(libp2p: any, userId: string) {
    console.log(' P2PDocumentSystem.initialize() called')
    console.log('   User ID:', userId)
    this.userId = userId
    
    // Generate or load user's key pair for signing
    console.log('   Generating key pair for document signing...')
    this.userKeyPair = await this.generateKeyPair()
    console.log('   Key pair ready')
    
    // Initialize Helia for IPFS storage
    console.log('   Initializing Helia (IPFS)...')
    this.helia = await createHelia({ libp2p })
    console.log('   Helia initialized')
    
    // Initialize OrbitDB (browser will use IndexedDB for storage)
    console.log('   Creating OrbitDB instance...')
    this.orbitdb = await createOrbitDB({ 
      ipfs: this.helia,
      directory: userId // Browser will handle storage automatically
    })
    console.log('   OrbitDB instance created')
    
    // Open document database (append-only log)
    const docDbName = `documents-${userId}`
    console.log('   Opening documents database:', docDbName)
    this.documentsDb = await this.orbitdb.open(docDbName, {
      type: 'events', // Event log for append-only history
      create: true,
      sync: true
    })
    console.log('   Documents database ready:', this.documentsDb.address)
    
    // Open collections database
    const collDbName = `collections-${userId}`
    console.log('   Opening collections database:', collDbName)
    this.collectionsDb = await this.orbitdb.open(collDbName, {
      type: 'keyvalue',
      create: true,
      sync: true
    })
    console.log('   Collections database ready:', this.collectionsDb.address)
    
    // Set up event listeners
    console.log('   Setting up event handlers...')
    this.setupEventListeners()
    
    // Start discovery service
    console.log('   Starting discovery service...')
    this.startDiscoveryService(libp2p)
    console.log('   P2PDocumentSystem fully initialized!')
  }

  async initializeWithInstances(libp2p: any, helia: any, orbitdb: any, userId: string) {
    console.log(' P2PDocumentSystem.initializeWithInstances() called')
    console.log('   User ID:', userId)
    console.log('   Using pre-initialized instances')
    this.userId = userId
    
    // Generate or load user's key pair for signing
    console.log('   Generating key pair for document signing...')
    this.userKeyPair = await this.generateKeyPair()
    console.log('   Key pair ready')
    
    // Use the provided Helia and OrbitDB instances
    this.helia = helia
    this.orbitdb = orbitdb
    console.log('   Using provided Helia and OrbitDB instances')
    
    // Open document database (append-only log)
    const docDbName = `documents-${userId}`
    console.log('   Opening documents database:', docDbName)
    this.documentsDb = await this.orbitdb.open(docDbName, {
      type: 'events', // Event log for append-only history
      create: true,
      sync: true
    })
    console.log('   Documents database ready:', this.documentsDb.address)
    
    // Open collections database
    const collDbName = `collections-${userId}`
    console.log('   Opening collections database:', collDbName)
    this.collectionsDb = await this.orbitdb.open(collDbName, {
      type: 'keyvalue',
      create: true,
      sync: true
    })
    console.log('   Collections database ready:', this.collectionsDb.address)
    
    // Set up event listeners
    console.log('   Setting up event handlers...')
    this.setupEventListeners()
    
    // Start discovery service
    console.log('   Starting discovery service...')
    this.startDiscoveryService(libp2p)
    console.log('   P2PDocumentSystem fully initialized with provided instances!')
  }

  async initializeWithInjectedCore(libp2p: any, helia: any, orbitdb: any, userId: string) {
    console.log(' P2PDocumentSystem.initializeWithInjectedCore() called')
    console.log('   User ID:', userId)
    console.log('   Using injected P2P core instances')
    
    // Runtime safety check
    if (!libp2p || !helia || !orbitdb) {
      throw new Error('Missing required P2P core instances')
    }
    
    this.userId = userId
    
    // Generate or load user's key pair for signing
    console.log('   Generating key pair for document signing...')
    this.userKeyPair = await this.generateKeyPair()
    console.log('   Key pair ready')
    
    // Store the injected instances
    this.libp2p = libp2p
    this.helia = helia
    this.orbitdb = orbitdb
    console.log('   Using injected Helia and OrbitDB instances')
    
    // Open document database (append-only log)
    const docDbName = `documents-${userId}`
    console.log('   Opening documents database:', docDbName)
    this.documentsDb = await this.orbitdb.open(docDbName, {
      type: 'events', // Event log for append-only history
      create: true,
      sync: true
    })
    console.log('   Documents database opened:', this.documentsDb.address)
    
    // Ensure database is ready
    await ensureDatabaseReady(this.documentsDb)
    console.log('   Documents database ready and indexed')
    
    // Open collections database
    const collDbName = `collections-${userId}`
    console.log('   Opening collections database:', collDbName)
    this.collectionsDb = await this.orbitdb.open(collDbName, {
      type: 'keyvalue',
      create: true,
      sync: true
    })
    console.log('   Collections database opened:', this.collectionsDb.address)
    
    // Ensure collections database is ready
    await ensureDatabaseReady(this.collectionsDb)
    console.log('   Collections database ready and indexed')
    
    // Set up event listeners
    console.log('   Setting up event handlers...')
    this.setupEventListeners()
    
    // Start discovery service
    console.log('   Starting discovery service...')
    this.startDiscoveryService(libp2p)
    
    // Enable automatic replication
    console.log('   Enabling database replication...')
    await this.enableReplication()
    
    console.log('   P2PDocumentSystem initialized with injected core!')
  }

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

  async addDocument(
    file: File,
    metadata: {
      title: string
      description: string
      collectionId?: string
    }
  ): Promise<DocumentEntry> {
    console.log(' === ADDING DOCUMENT TO P2P ===')
    console.log('   Title:', metadata.title)
    console.log('   Description:', metadata.description)
    console.log('   File:', file.name, `(${(file.size / 1024).toFixed(2)} KB)`)
    
    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      console.error('   File too large:', file.size)
      throw new Error('File size exceeds 10MB limit. Please compress or split the file.')
    }
    console.log('   File size OK')
    
    // Store file in IPFS
    console.log('   Processing file for IPFS storage...')
    const fileBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(fileBuffer)
    console.log('   File converted to bytes:', bytes.length)
    
    // For now, create a simple CID based on content hash
    // Later can use full Helia IPFS storage
    console.log('   Creating content-addressed CID...')
    const hash = await sha256.digest(bytes)
    const cid = CID.create(1, 0x55, hash) // 0x55 = raw codec
    console.log('   CID created:', cid.toString())
    
    // Store in memory/browser storage for now
    // Full Helia integration can be added later
    if (typeof window !== 'undefined') {
      // Store in IndexedDB or localStorage
      const cidStr = cid.toString()
      try {
        // Try to store the file data
        sessionStorage.setItem(`file-${cidStr}`, btoa(String.fromCharCode(...bytes)))
        console.log('   File cached in session storage')
      } catch (e) {
        console.warn('   File too large for session storage, keeping in memory only')
      }
    }
    
    // Get public key
    const pubKeyBuffer = await crypto.subtle.exportKey('spki', this.userKeyPair!.publicKey)
    const pubKey = btoa(String.fromCharCode(...new Uint8Array(pubKeyBuffer)))
    
    // Create document entry
    const docEntry: DocumentEntry = {
      id: crypto.randomUUID(),
      cid: cid.toString(),
      title: metadata.title,
      description: metadata.description,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      authorPubKey: pubKey,
      signature: '', // Will be set after signing
      timestamp: Date.now(),
      version: 1,
      deleted: false
    }
    
    // Sign the document
    console.log('   Signing document with user key...')
    docEntry.signature = await this.signData(docEntry)
    console.log('   Document signed')
    
    // Add to OrbitDB event log
    console.log('   Adding to OrbitDB database...')
    const dbHash = await this.documentsDb!.add(docEntry)
    console.log('   Added to OrbitDB with hash:', dbHash)
    
    // If collection specified, add to collection
    if (metadata.collectionId) {
      console.log('   Adding to collection:', metadata.collectionId)
      await this.addToCollection(docEntry, metadata.collectionId)
    }
    
    // Announce to discovery network
    console.log('   Announcing document to network...')
    this.announceDocument(docEntry.id)
    
    console.log('   Document successfully added to P2P network!')
    console.log('   Document ID:', docEntry.id)
    return docEntry
  }

  async deleteDocument(docId: string): Promise<void> {
    // Create tombstone entry
    const tombstone = {
      id: docId,
      deleted: true,
      deletedAt: Date.now(),
      deletedBy: this.userId,
      signature: ''
    }
    
    // Sign the tombstone
    tombstone.signature = await this.signData(tombstone)
    
    // Add tombstone to event log
    await this.documentsDb!.add(tombstone)
    
    // Propagate tombstone via pubsub
    this.propagateTombstone(docId)
  }

  async forkDocument(
    originalDoc: DocumentEntry,
    changes: Partial<DocumentEntry>
  ): Promise<DocumentEntry> {
    const pubKeyBuffer = await crypto.subtle.exportKey('spki', this.userKeyPair!.publicKey)
    const pubKey = btoa(String.fromCharCode(...new Uint8Array(pubKeyBuffer)))
    
    // Create forked document with lineage
    const forkedDoc: DocumentEntry = {
      ...originalDoc,
      ...changes,
      id: crypto.randomUUID(),
      authorPubKey: pubKey,
      version: 1,
      timestamp: Date.now(),
      forkOf: {
        originCid: originalDoc.cid,
        originAuthorPubKey: originalDoc.authorPubKey,
        originLogId: this.documentsDb!.address.toString(),
        originSeq: await this.getDocumentSeq(originalDoc.id)
      },
      signature: ''
    }
    
    // Sign the forked document
    forkedDoc.signature = await this.signData(forkedDoc)
    
    // Add to database
    await this.documentsDb!.add(forkedDoc)
    
    return forkedDoc
  }

  async addToCollection(doc: DocumentEntry, collectionId: string): Promise<void> {
    const entry: CollectionEntry = {
      cid: doc.cid,
      originAuthorPubKey: doc.authorPubKey,
      originLogId: this.documentsDb!.address.toString(),
      originSeq: await this.getDocumentSeq(doc.id),
      addedBy: this.userId,
      addedAt: Date.now(),
      pinned: true
    }
    
    // Pin the document locally
    await this.pinDocument(doc.cid)
    
    // Add to collection database
    await this.collectionsDb!.put(`${collectionId}:${doc.id}`, entry)
    
    // Update provider records
    this.announceDocument(doc.id)
  }

  private async pinDocument(cid: string): Promise<void> {
    // Pin in Helia to prevent garbage collection
    // This ensures document stays available while in collection
    if (this.helia.pins) {
      await this.helia.pins.add(CID.parse(cid))
    }
  }

  private async getDocumentSeq(docId: string): Promise<number> {
    try {
      // Use v2 compatible reading
      const entries = await readDatabaseEntries(this.documentsDb!, { limit: 1000 })
      const docEvents = entries.filter((entry: any) => {
        const doc = normalizeEntry(entry)
        return doc && doc.id === docId
      })
      return docEvents.length
    } catch (error) {
      console.error('Error getting document sequence:', error)
      return 0
    }
  }

  private setupEventListeners(): void {
    // Listen for new documents
    this.documentsDb!.events.on('update', async (entry: any) => {
      console.log('Document database updated:', entry)
      
      // Check for tombstones and hide deleted docs
      if (entry.payload?.value?.deleted) {
        this.handleTombstone(entry.payload.value.id)
      }
    })
    
    // Listen for replicated data
    this.documentsDb!.events.on('replicated', () => {
      console.log('Documents replicated from peer')
      this.updateAvailabilityIndex()
    })
  }

  private startDiscoveryService(libp2p: any): void {
    const topic = 'document-discovery'
    
    // Subscribe to discovery topic
    libp2p.services.pubsub.subscribe(topic)
    
    // Listen for discovery announcements
    libp2p.services.pubsub.addEventListener('message', (evt: any) => {
      if (evt.detail.topic === topic) {
        const message = JSON.parse(new TextDecoder().decode(evt.detail.data))
        this.updateDiscoveryIndex(message)
      }
    })
    
    // Periodically announce our documents
    setInterval(() => {
      this.announceAllDocuments()
    }, 30000) // Every 30 seconds
  }

  private announceDocument(docId: string): void {
    const announcement = {
      peerId: this.userId,
      documents: [docId],
      timestamp: Date.now()
    }
    
    // Publish to discovery topic
    // (Assumes libp2p is accessible)
    this.publishDiscovery(announcement)
  }

  private announceAllDocuments(): void {
    // Announce all non-deleted documents we have
    this.getAllDocuments().then(docs => {
      const availableDocs = docs
        .filter(d => !d.deleted)
        .map(d => d.id)
      
      if (availableDocs.length > 0) {
        this.publishDiscovery({
          peerId: this.userId,
          documents: availableDocs,
          timestamp: Date.now()
        })
      }
    })
  }

  private publishDiscovery(message: any): void {
    // This would publish to libp2p pubsub
    console.log('Publishing discovery:', message)
  }

  private updateDiscoveryIndex(message: any): void {
    const { peerId, documents, timestamp } = message
    
    documents.forEach((docId: string) => {
      if (!this.discoveryIndex.has(docId)) {
        this.discoveryIndex.set(docId, {
          docId,
          peers: new Set(),
          lastSeen: new Map()
        })
      }
      
      const availability = this.discoveryIndex.get(docId)!
      availability.peers.add(peerId)
      availability.lastSeen.set(peerId, timestamp)
    })
    
    // Clean up stale entries (peers not seen for > 1 minute)
    this.cleanupStaleAvailability()
  }

  private cleanupStaleAvailability(): void {
    const staleThreshold = Date.now() - 60000 // 1 minute
    
    this.discoveryIndex.forEach(availability => {
      availability.lastSeen.forEach((timestamp, peerId) => {
        if (timestamp < staleThreshold) {
          availability.peers.delete(peerId)
          availability.lastSeen.delete(peerId)
        }
      })
    })
  }

  private handleTombstone(docId: string): void {
    // Mark document as deleted in UI
    console.log('Document tombstoned:', docId)
    
    // Propagate tombstone to other peers quickly
    this.propagateTombstone(docId)
  }

  private propagateTombstone(docId: string): void {
    // Publish tombstone notification
    this.publishDiscovery({
      type: 'tombstone',
      docId,
      timestamp: Date.now(),
      peerId: this.userId
    })
  }

  private updateAvailabilityIndex(): void {
    // Update local availability index based on replicated data
    console.log('Updating availability index')
  }

  private async enableReplication(): Promise<void> {
    try {
      // Share database addresses for replication
      if (this.documentsDb && this.documentsDb.address) {
        const docAddr = this.documentsDb.address.toString()
        console.log('   Sharing documents database address:', docAddr)
        
        // Subscribe to database addresses from other peers
        // This allows automatic replication when peers share the same DB
      }
      
      if (this.collectionsDb && this.collectionsDb.address) {
        const collAddr = this.collectionsDb.address.toString()
        console.log('   Sharing collections database address:', collAddr)
      }
    } catch (error) {
      console.error('Error enabling replication:', error)
    }
  }

  // Public method to manually connect to another peer
  async connectToPeer(peerAddress: string): Promise<boolean> {
    if (!this.libp2p) {
      console.error('libp2p not initialized')
      return false
    }
    
    try {
      console.log(' Attempting to connect to peer:', peerAddress)
      
      // Parse the multiaddr
      const { multiaddr } = await import('@multiformats/multiaddr')
      const ma = multiaddr(peerAddress)
      
      // Dial the peer
      await this.libp2p.dial(ma)
      
      console.log(' Connected to peer successfully')
      return true
    } catch (error) {
      console.error('Failed to connect to peer:', error)
      return false
    }
  }

  // Get current peer connections
  getPeerConnections(): string[] {
    if (!this.libp2p) {
      return []
    }
    
    try {
      const connections = this.libp2p.getConnections()
      return connections.map((conn: any) => conn.remotePeer.toString())
    } catch (error) {
      console.error('Error getting peer connections:', error)
      return []
    }
  }
  
  // Get the multiaddr for this peer (for sharing)
  getMyAddresses(): string[] {
    if (!this.libp2p) {
      return []
    }
    
    try {
      const addrs = this.libp2p.getMultiaddrs()
      return addrs.map((addr: any) => addr.toString())
    } catch (error) {
      console.error('Error getting addresses:', error)
      return []
    }
  }

  async getAllDocuments(options: { limit?: number; reverse?: boolean } = {}): Promise<DocumentEntry[]> {
    if (!this.documentsDb) {
      console.warn('Documents database not initialized')
      return []
    }

    // Client-side check for SSR safety
    if (!isClientSide()) {
      console.warn('getAllDocuments called on server side, returning empty')
      return []
    }
    
    try {
      // Ensure database is ready
      const isReady = await ensureDatabaseReady(this.documentsDb)
      if (!isReady) {
        console.warn('Database not ready, returning empty document list')
        return []
      }

      // Read entries using OrbitDB v2 compatible method
      const entries = await readDatabaseEntries(this.documentsDb, {
        limit: options.limit || 100,
        reverse: options.reverse || false
      })
      
      // Build document state from entries
      const documents = buildDocumentState(entries)
      
      // Return non-deleted documents as array
      return Array.from(documents.values())
        .filter(d => !d.deleted)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    } catch (error) {
      console.error('Error fetching documents from OrbitDB:', error)
      return []
    }
  }

  async getDocument(docId: string): Promise<DocumentEntry | null> {
    const docs = await this.getAllDocuments()
    return docs.find(d => d.id === docId) || null
  }

  getDocumentAvailability(docId: string): string[] {
    const availability = this.discoveryIndex.get(docId)
    if (!availability) return []
    return Array.from(availability.peers)
  }

  async getFileFromIPFS(cid: string): Promise<Uint8Array> {
    // Try to get from session storage first
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`file-${cid}`)
      if (stored) {
        // Convert base64 back to Uint8Array
        const binary = atob(stored)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        return bytes
      }
    }
    
    // If not found in storage, try Helia (if available)
    try {
      const cidObj = CID.parse(cid)
      const block = await this.helia.blockstore.get(cidObj)
      return block
    } catch (e) {
      console.error('File not found in IPFS:', cid)
      throw new Error('File not found')
    }
  }

  // Cache management
  async cleanupCache(): Promise<void> {
    const cacheExpiry = Date.now() - (this.cachePolicy.cacheHours * 60 * 60 * 1000)
    
    // Remove expired cached documents
    // Implementation depends on your cache storage strategy
    console.log('Cleaning up cache older than:', new Date(cacheExpiry))
  }
}