/**
 * P2P System Orchestrator
 * Main entry point that coordinates all P2P components:
 * - Registry Manager
 * - Collection CQRS
 * - User Workspace
 * - Search Integration
 */

import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { createOrbitDB } from '@orbitdb/core'
import { RegistryManager } from './registry-manager'
import { CollectionCQRS } from './collection-cqrs'
import { UserActivity } from './user-workspace'
import { SchemaManager } from './schema-manager'
import { ContentManager } from './content-manager'
import {
  P2PConfig,
  KeyPair,
  CollectionInfo,
  CatalogDocument,
  SystemHealth,
  P2PError,
  SchemaDefinition
} from './types'

export class P2PSystem {
  private config: P2PConfig
  private libp2p: any | null = null
  private helia: any | null = null
  private orbitdb: any | null = null
  private userKeyPair: KeyPair | null = null

  // Core components
  private registry: RegistryManager | null = null
  private userActivity: UserActivity | null = null
  private schemaManager: SchemaManager | null = null
  private collections: Map<string, CollectionCQRS> = new Map()

  // State tracking
  private initialized = false
  private readonly eventHandlers = new Map<string, Set<Function>>()

  constructor(config: P2PConfig) {
    this.config = config
    this.schemaManager = new SchemaManager(config)
    console.log(' P2PSystem created for user:', config.userId)
  }

  /**
   * Initialize the entire P2P system
   */
  async initialize(options: {
    registryAddress?: string
    libp2pConfig?: any
  } = {}): Promise<void> {
    if (this.initialized) {
      console.warn('P2P System already initialized')
      return
    }

    console.log(' P2PSystem.initialize()')

    try {
      // 1. Generate user key pair for signing
      console.log('   Generating user key pair...')
      this.userKeyPair = await this.generateKeyPair()

      // 2. Initialize libp2p
      console.log('   Initializing libp2p...')
      await this.initializeLibp2p(options.libp2pConfig)

      // 3. Initialize Helia (IPFS)
      console.log('   Initializing Helia...')
      this.helia = await createHelia({ libp2p: this.libp2p })

      // 4. Initialize OrbitDB
      console.log('   Initializing OrbitDB...')
      this.orbitdb = await createOrbitDB({
        ipfs: this.helia,
        directory: this.config.storage.directory
      })

      // 5. Initialize Registry
      console.log('   Initializing Registry...')
      this.registry = new RegistryManager(this.orbitdb, this.config)
      const registryAddress = await this.registry.initialize(options.registryAddress)

      // 6. Initialize User Public Activity
      console.log('   Initializing User Activity...')
      this.userActivity = new UserActivity(this.orbitdb, this.config.userId, this.config)
      const { activityAddress } = await this.userActivity.initialize(this.userKeyPair)

      // 7. Register user in registry
      await this.registry.registerUser(
        this.config.userId,
        activityAddress,
        undefined, // No drafts address
        { description: 'User public activity stream' }
      )

      this.initialized = true
      console.log('   P2P System fully initialized!')

      this.emit('system-ready', {
        userId: this.config.userId,
        registryAddress,
        activityAddress
      })

    } catch (error) {
      console.error('Failed to initialize P2P system:', error)
      throw new P2PError('System initialization failed', 'INIT_FAILED', { error })
    }
  }

  /**
   * Create or open a collection
   */
  async openCollection(
    name: string,
    options: {
      create?: boolean
      description?: string
    } = {}
  ): Promise<CollectionCQRS> {
    this.ensureInitialized()

    // Check if already open
    if (this.collections.has(name)) {
      return this.collections.get(name)!
    }

    console.log(` Opening collection: ${name}`)

    // Check registry for existing collection
    const addresses = await this.registry!.getCollectionAddresses(name)
    let opsLogAddress: string | undefined
    let catalogAddress: string | undefined

    if (addresses) {
      opsLogAddress = addresses.opsLog
      catalogAddress = addresses.catalog
      console.log('   Found existing collection in registry')
    } else if (!options.create) {
      throw new P2PError('Collection not found and create=false', 'COLLECTION_NOT_FOUND', { name })
    }

    // Initialize collection CQRS
    const collection = new CollectionCQRS(this.orbitdb!, name, this.config)
    const { opsLogAddress: newOpsLog, catalogAddress: newCatalog } = await collection.initialize(
      this.userKeyPair!,
      this.helia!,
      opsLogAddress,
      catalogAddress
    )

    // Register in registry if new
    if (!addresses) {
      await this.registry!.registerCollection(
        name,
        newCatalog,
        newOpsLog,
        { description: options.description }
      )
      console.log('   Collection registered in registry')
    }

    this.collections.set(name, collection)
    console.log(`   Collection ${name} ready`)

    this.emit('collection-opened', { name, opsLogAddress: newOpsLog, catalogAddress: newCatalog })

    return collection
  }

  /**
   * Close a collection
   */
  async closeCollection(name: string): Promise<void> {
    const collection = this.collections.get(name)
    if (collection) {
      this.collections.delete(name)
      console.log(` Collection ${name} closed`)
      this.emit('collection-closed', { name })
    }
  }

  /**
   * List all available collections
   */
  async listCollections(): Promise<CollectionInfo[]> {
    this.ensureInitialized()
    return this.registry!.listCollections()
  }

  /**
   * Search for collections
   */
  async searchCollections(query: string): Promise<CollectionInfo[]> {
    this.ensureInitialized()
    return this.registry!.searchCollections(query)
  }

  // Direct Publishing - No Drafts

  /**
   * Publish a document directly to a collection
   */
  async publishDocument(
    collectionName: string,
    file: File,
    metadata: {
      title: string
      description?: string
      tags?: string[]
    }
  ): Promise<CatalogDocument> {
    this.ensureInitialized()

    // Open the target collection
    const collection = await this.openCollection(collectionName, { create: true })

    // Create document in collection directly
    const document = await collection.createDocument(file, metadata)

    // Announce publication in user's activity stream
    await this.userActivity!.announcePublication(document._id, collectionName, document.title)

    console.log(` Published document ${document._id} to collection ${collectionName}`)

    this.emit('document-published', {
      documentId: document._id,
      collectionName,
      document
    })

    return document
  }

  /**
   * Get user's activity entries
   */
  async getUserActivity(options: Parameters<UserActivity['getActivityEntries']>[0] = {}): Promise<any[]> {
    this.ensureInitialized()
    return this.userActivity!.getActivityEntries(options)
  }


  // Schema management

  /**
   * Register a custom schema
   */
  registerSchema(schemaId: string, version: string, jsonSchema: any): void {
    this.schemaManager!.registerSchema(schemaId, version, jsonSchema)
  }

  /**
   * Get supported schema versions for a type
   */
  getSupportedSchemaVersions(schemaType: 'operation' | 'activity'): string[] {
    return this.schemaManager!.getSupportedVersions(schemaType)
  }

  /**
   * Check if a schema version is supported
   */
  isSchemaVersionSupported(schemaType: string, version: string): boolean {
    return this.schemaManager!.isCompatibleVersion(schemaType, version)
  }

  /**
   * Get the latest schema version for a type
   */
  getLatestSchemaVersion(schemaType: 'operation' | 'activity'): string {
    return this.schemaManager!.getLatestVersion(schemaType)
  }

  // Discovery and networking

  /**
   * Connect to another peer
   */
  async connectToPeer(multiaddr: string): Promise<boolean> {
    if (!this.libp2p) {
      throw new P2PError('libp2p not initialized', 'LIBP2P_NOT_READY')
    }

    try {
      const { multiaddr: ma } = await import('@multiformats/multiaddr')
      await this.libp2p.dial(ma(multiaddr))
      console.log(' Connected to peer:', multiaddr)
      this.emit('peer-connected', { multiaddr })
      return true
    } catch (error) {
      console.error('Failed to connect to peer:', error)
      return false
    }
  }

  /**
   * Get connected peers
   */
  getConnectedPeers(): string[] {
    if (!this.libp2p) return []

    try {
      const connections = this.libp2p.getConnections()
      return connections.map((conn: any) => conn.remotePeer.toString())
    } catch (error) {
      console.error('Failed to get connected peers:', error)
      return []
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const registryHealth = this.registry?.getHealth() || {
      connected: false,
      lastSync: 0,
      entryCount: 0
    }

    const activityStats = this.userActivity ?
      await this.userActivity.getActivityStats() :
      { activity: { total: 0, byType: {}, lastEntry: 0 } }

    return {
      registry: registryHealth,
      collections: {
        subscribed: this.collections.size,
        syncing: 0, // TODO: implement syncing status
        lastUpdate: 0 // TODO: implement last update tracking
      },
      network: {
        peers: this.getConnectedPeers().length,
        bandwidth: { upload: 0, download: 0 } // TODO: implement bandwidth tracking
      },
      storage: {
        used: 0, // TODO: implement storage tracking
        available: this.config.storage.maxSize
      }
    }
  }

  /**
   * Event system
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error('Event handler error:', error)
        }
      })
    }
  }

  /**
   * Graceful shutdown
   */
  async destroy(): Promise<void> {
    console.log(' P2PSystem.destroy()')

    // Close all collections
    for (const [name, collection] of this.collections) {
      await this.closeCollection(name)
    }

    // Destroy user activity
    if (this.userActivity) {
      await this.userActivity.destroy()
    }

    // Destroy registry
    if (this.registry) {
      await this.registry.destroy()
    }

    // Stop libp2p
    if (this.libp2p) {
      await this.libp2p.stop()
    }

    this.initialized = false
    this.eventHandlers.clear()
    console.log('   P2P System destroyed')
  }

  // Private methods

  private async generateKeyPair(): Promise<KeyPair> {
    return await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )
  }

  private async initializeLibp2p(customConfig?: any): Promise<void> {
    const { webSockets } = await import('@libp2p/websockets')
    const { noise } = await import('@chainsafe/libp2p-noise')
    const { yamux } = await import('@chainsafe/libp2p-yamux')
    const { gossipsub } = await import('@chainsafe/libp2p-gossipsub')
    const { identify } = await import('@libp2p/identify')

    const config = customConfig || {
      transports: [webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),
        pubsub: gossipsub({
          allowPublishToZeroTopicPeers: true,
          emitSelf: true
        })
      }
    }

    this.libp2p = await createLibp2p(config)
    console.log('   libp2p ready, PeerID:', this.libp2p.peerId.toString())
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new P2PError('P2P System not initialized', 'NOT_INITIALIZED')
    }
  }
}