/**
 * P2P User Collection Registry
 *
 * A global registry that tracks which OrbitDB collections belong to which users.
 * The registry itself is stored in OrbitDB, making it distributed and persistent.
 *
 * Purpose:
 * - Maps user DIDs to their collection store names
 * - Enables discovery of collections across the P2P network
 * - Persists across application restarts
 *
 * Data Structure:
 * {
 *   "user:did:p2p:abc123": { collections: ["collection-did:p2p:abc123-1234567890"] },
 *   "user:did:p2p:def456": { collections: ["collection-did:p2p:def456-9876543210"] }
 * }
 *
 * Note: This is a singleton instance shared across the application.
 */

import { orbitdbClient } from './orbitdb-client'

/**
 * UserCollectionRegistry Class
 *
 * Manages the mapping between users and their OrbitDB collections.
 * All operations are asynchronous as they involve OrbitDB I/O.
 */
class UserCollectionRegistry {
  // Name of the OrbitDB store containing the registry
  private registryStoreName = 'global-user-collection-registry'

  // Tracks whether the registry has been initialized
  private initialized = false

  /**
   * Ensure Registry is Initialized
   *
   * Opens the OrbitDB registry store on first use.
   * Subsequent calls are no-ops due to the initialized flag.
   *
   * @throws Error if OrbitDB initialization fails
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return

    try {
      // Open or create the global registry store in OrbitDB
      await orbitdbClient.openKV(this.registryStoreName)
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize registry:', error)
      throw error
    }
  }

  /**
   * Get User's Collections
   *
   * Retrieves the list of collection store names owned by a specific user.
   *
   * @param peerId - User's DID (e.g., "did:p2p:abc123")
   * @returns Array of collection store names (e.g., ["collection-did:p2p:..."])
   */
  async getUserCollections(peerId: string): Promise<string[]> {
    await this.ensureInitialized()
    try {
      const data = await orbitdbClient.getKV(this.registryStoreName, `user:${peerId}`)
      return data?.collections || []
    } catch (error) {
      return []
    }
  }

  /**
   * Register a Collection for a User
   *
   * Adds a collection store name to the user's registry entry.
   * If the collection is already registered, this is a no-op.
   *
   * @param peerId - User's DID
   * @param storeName - Collection store name to register
   */
  async addUserCollection(peerId: string, storeName: string): Promise<void> {
    await this.ensureInitialized()
    const collections = await this.getUserCollections(peerId)

    // Only add if not already present
    if (!collections.includes(storeName)) {
      collections.push(storeName)
      await orbitdbClient.putKV(this.registryStoreName, `user:${peerId}`, { collections })
    }
  }

  /**
   * Unregister a Collection from a User
   *
   * Removes a collection store name from the user's registry entry.
   *
   * @param peerId - User's DID
   * @param storeName - Collection store name to remove
   */
  async removeUserCollection(peerId: string, storeName: string): Promise<void> {
    await this.ensureInitialized()
    const collections = await this.getUserCollections(peerId)
    const filtered = collections.filter(addr => addr !== storeName)
    await orbitdbClient.putKV(this.registryStoreName, `user:${peerId}`, { collections: filtered })
  }

  /**
   * Get All Registered Users
   *
   * Returns a list of all user DIDs that have registered collections.
   *
   * @returns Array of user DIDs
   */
  async getAllUsers(): Promise<string[]> {
    await this.ensureInitialized()
    const allData = await orbitdbClient.getAllKV(this.registryStoreName)
    return Object.keys(allData)
      .filter(key => key.startsWith('user:'))
      .map(key => key.slice(5)) // Remove 'user:' prefix to get DID
  }

  /**
   * Get All Collections Across All Users
   *
   * Aggregates all collection store names from all users in the registry.
   * Useful for discovering available collections on the network.
   *
   * @returns Array of all collection store names
   */
  async getAllCollections(): Promise<string[]> {
    await this.ensureInitialized()
    const allData = await orbitdbClient.getAllKV(this.registryStoreName)
    console.log('getAllCollections - raw allData:', JSON.stringify(allData))

    const allCollections: string[] = []

    // Iterate through all registry entries
    for (const [key, value] of Object.entries(allData)) {
      console.log(`getAllCollections - checking key: ${key}, value:`, value)

      // Process user entries that contain collection arrays
      if (key.startsWith('user:') && value && typeof value === 'object' && 'collections' in value) {
        const collections = (value as any).collections
        console.log(`getAllCollections - found collections for ${key}:`, collections)

        // Add all collections from this user
        if (Array.isArray(collections)) {
          allCollections.push(...collections)
        }
      }
    }

    console.log('getAllCollections - final result:', allCollections)
    return allCollections
  }

  /**
   * Clear All Registry Data
   *
   * Removes all collection registrations for all users.
   * WARNING: This is destructive and should only be used for testing/debugging.
   */
  async clear(): Promise<void> {
    await this.ensureInitialized()
    const users = await this.getAllUsers()

    // Reset each user's collection list to empty
    for (const userId of users) {
      await orbitdbClient.putKV(this.registryStoreName, `user:${userId}`, { collections: [] })
    }
  }

  /**
   * Debug Output
   *
   * Logs the entire registry contents to console for debugging purposes.
   */
  async debug(): Promise<void> {
    await this.ensureInitialized()
    const allData = await orbitdbClient.getAllKV(this.registryStoreName)
    console.log('User Collection Registry (OrbitDB):', allData)
  }
}

/**
 * Singleton Instance
 *
 * Export a single shared instance of the registry.
 * This ensures all parts of the application use the same registry data.
 */
export const userCollectionRegistry = new UserCollectionRegistry()