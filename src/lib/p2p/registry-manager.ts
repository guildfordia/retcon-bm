/**
 * Registry Manager - Central discovery layer for P2P network
 * Manages the KeyValue DB that maps names to OrbitDB addresses
 */

import { RegistryEntry, RegistryError, CollectionInfo, P2PConfig } from './types'
import { ensureDatabaseReady, readDatabaseEntries } from '../orbitdb-v2-utils'

export class RegistryManager {
  private orbitdb: any
  private registryDB: any | null = null
  private localCache: Map<string, RegistryEntry> = new Map()
  private config: P2PConfig
  private updateInterval: NodeJS.Timeout | null = null

  constructor(orbitdb: any, config: P2PConfig) {
    this.orbitdb = orbitdb
    this.config = config
  }

  /**
   * Initialize the registry with a known address or create new
   */
  async initialize(registryAddress?: string): Promise<string> {
    console.log(' RegistryManager.initialize()')

    try {
      if (registryAddress) {
        // Connect to existing registry
        console.log('   Opening existing registry:', registryAddress)
        this.registryDB = await this.orbitdb.open(registryAddress, {
          type: 'keyvalue',
          sync: true,
          create: false
        })
      } else {
        // Create new registry
        console.log('   Creating new registry')
        this.registryDB = await this.orbitdb.open('p2p-registry', {
          type: 'keyvalue',
          sync: true,
          create: true,
          accessController: {
            type: 'orbitdb',
            write: ['*'] // Allow anyone to write for now - TODO: implement proper ACL
          }
        })
      }

      // Ensure database is ready
      await ensureDatabaseReady(this.registryDB)
      console.log('   Registry ready:', this.registryDB.address.toString())

      // Load initial cache
      await this.refreshCache()

      // Set up periodic sync
      this.startPeriodicSync()

      // Set up event listeners
      this.setupEventListeners()

      return this.registryDB.address.toString()

    } catch (error) {
      console.error('Registry initialization failed:', error)
      throw new RegistryError('Failed to initialize registry', { error, registryAddress })
    }
  }

  /**
   * Register a collection in the registry
   */
  async registerCollection(
    name: string,
    catalogAddress: string,
    opsLogAddress: string,
    metadata: Partial<RegistryEntry['metadata']> = {}
  ): Promise<void> {
    if (!this.registryDB) {
      throw new RegistryError('Registry not initialized')
    }

    const entry: RegistryEntry = {
      type: 'collection',
      address: catalogAddress,
      metadata: {
        name,
        description: metadata.description,
        created: Date.now(),
        lastSeen: Date.now(),
        version: metadata.version || '1.0.0',
        ...metadata,
        opsLogAddress // Store ops log address in metadata
      }
    }

    try {
      const key = `collections:${name}`
      await this.registryDB.put(key, entry)
      this.localCache.set(key, entry)

      console.log(` Registered collection: ${name} → ${catalogAddress}`)

    } catch (error) {
      throw new RegistryError('Failed to register collection', { name, catalogAddress, error })
    }
  }

  /**
   * Register a user feed in the registry
   */
  async registerUser(
    userId: string,
    feedAddress: string,
    draftsAddress?: string,
    metadata: Partial<RegistryEntry['metadata']> = {}
  ): Promise<void> {
    if (!this.registryDB) {
      throw new RegistryError('Registry not initialized')
    }

    const entry: RegistryEntry = {
      type: 'user',
      address: feedAddress,
      metadata: {
        name: userId,
        description: metadata.description,
        created: Date.now(),
        lastSeen: Date.now(),
        ...metadata,
        draftsAddress // Store drafts address in metadata
      }
    }

    try {
      const key = `users:${userId}`
      await this.registryDB.put(key, entry)
      this.localCache.set(key, entry)

      console.log(` Registered user: ${userId} → ${feedAddress}`)

    } catch (error) {
      throw new RegistryError('Failed to register user', { userId, feedAddress, error })
    }
  }

  /**
   * Get collection addresses by name
   */
  async getCollectionAddresses(name: string): Promise<{catalog: string, opsLog: string} | null> {
    const key = `collections:${name}`

    // Try cache first
    let entry = this.localCache.get(key)

    // If not in cache, try database
    if (!entry && this.registryDB) {
      try {
        entry = await this.registryDB.get(key)
        if (entry) {
          this.localCache.set(key, entry)
        }
      } catch (error) {
        console.warn('Failed to get collection from registry:', error)
        return null
      }
    }

    if (!entry || entry.type !== 'collection') {
      return null
    }

    return {
      catalog: entry.address,
      opsLog: entry.metadata.opsLogAddress || entry.address
    }
  }

  /**
   * Get user addresses by ID
   */
  async getUserAddresses(userId: string): Promise<{feed: string, drafts?: string} | null> {
    const key = `users:${userId}`

    // Try cache first
    let entry = this.localCache.get(key)

    // If not in cache, try database
    if (!entry && this.registryDB) {
      try {
        entry = await this.registryDB.get(key)
        if (entry) {
          this.localCache.set(key, entry)
        }
      } catch (error) {
        console.warn('Failed to get user from registry:', error)
        return null
      }
    }

    if (!entry || entry.type !== 'user') {
      return null
    }

    return {
      feed: entry.address,
      drafts: entry.metadata.draftsAddress
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionInfo[]> {
    const collections: CollectionInfo[] = []

    for (const [key, entry] of this.localCache.entries()) {
      if (key.startsWith('collections:') && entry.type === 'collection') {
        const name = key.substring(12) // Remove 'collections:' prefix

        collections.push({
          id: name,
          name: entry.metadata.name,
          description: entry.metadata.description,
          address: entry.address,
          opsLogAddress: entry.metadata.opsLogAddress || entry.address,
          catalogAddress: entry.address,
          documentCount: 0, // TODO: fetch from catalog
          lastUpdate: entry.metadata.lastSeen,
          permissions: {
            readers: ['*'], // TODO: implement proper permissions
            writers: ['*'],
            public: true
          }
        })
      }
    }

    return collections.sort((a, b) => b.lastUpdate - a.lastUpdate)
  }

  /**
   * Search for collections by name/description
   */
  async searchCollections(query: string): Promise<CollectionInfo[]> {
    const allCollections = await this.listCollections()
    const lowerQuery = query.toLowerCase()

    return allCollections.filter(collection =>
      collection.name.toLowerCase().includes(lowerQuery) ||
      (collection.description && collection.description.toLowerCase().includes(lowerQuery))
    )
  }

  /**
   * Update last seen timestamp for an entry
   */
  async updateLastSeen(key: string): Promise<void> {
    const entry = this.localCache.get(key)
    if (entry && this.registryDB) {
      entry.metadata.lastSeen = Date.now()
      try {
        await this.registryDB.put(key, entry)
        this.localCache.set(key, entry)
      } catch (error) {
        console.warn('Failed to update last seen:', error)
      }
    }
  }

  /**
   * Get registry health status
   */
  getHealth() {
    return {
      connected: !!this.registryDB,
      lastSync: this.lastSyncTime,
      entryCount: this.localCache.size,
      cacheSize: this.localCache.size
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    if (this.registryDB) {
      // OrbitDB handles cleanup internally
      this.registryDB = null
    }

    this.localCache.clear()
    console.log(' RegistryManager destroyed')
  }

  // Private methods

  private lastSyncTime = 0

  private async refreshCache(): Promise<void> {
    if (!this.registryDB) return

    try {
      const entries = await readDatabaseEntries(this.registryDB, { limit: 1000 })

      this.localCache.clear()

      for (const entry of entries) {
        const key = entry.key
        const value = entry.value || entry.payload?.value || entry

        if (this.isValidRegistryEntry(value)) {
          this.localCache.set(key, value)
        }
      }

      this.lastSyncTime = Date.now()
      console.log(` Registry cache refreshed: ${this.localCache.size} entries`)

    } catch (error) {
      console.error('Failed to refresh registry cache:', error)
    }
  }

  private isValidRegistryEntry(entry: any): entry is RegistryEntry {
    return entry &&
           typeof entry.type === 'string' &&
           ['collection', 'user', 'schema'].includes(entry.type) &&
           typeof entry.address === 'string' &&
           entry.metadata &&
           typeof entry.metadata.name === 'string'
  }

  private startPeriodicSync(): void {
    // Sync every 30 seconds
    this.updateInterval = setInterval(() => {
      this.refreshCache().catch(error => {
        console.warn('Periodic registry sync failed:', error)
      })
    }, 30000)
  }

  private setupEventListeners(): void {
    if (!this.registryDB) return

    // Listen for updates from other peers
    this.registryDB.events.on('replicated', () => {
      console.log(' Registry replicated from peer')
      this.refreshCache()
    })

    this.registryDB.events.on('write', () => {
      console.log(' Registry updated locally')
    })
  }
}