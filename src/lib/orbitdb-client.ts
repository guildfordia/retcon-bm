/**
 * OrbitDB Client
 *
 * HTTP client for communicating with the OrbitDB microservice.
 * OrbitDB is a serverless, distributed, peer-to-peer database built on IPFS.
 *
 * Architecture:
 * - OrbitDB service runs in a separate Docker container (Node.js)
 * - This client is used by Next.js API routes to interact with OrbitDB
 * - All P2P collections and documents are stored in OrbitDB, not SQLite
 *
 * Data Flow:
 * 1. Frontend → Next.js API → OrbitDB Client → OrbitDB Service → IPFS
 * 2. Responses flow back through the same chain
 *
 * OrbitDB Service URL: http://orbitdb:4001 (Docker internal) or http://localhost:4001 (dev)
 */

// Base URL for OrbitDB HTTP service
const ORBITDB_BASE_URL = process.env.ORBITDB_SERVICE_URL || 'http://localhost:4001'

/**
 * Response when opening/creating an OrbitDB database
 *
 * @property address - Full OrbitDB address (e.g., /orbitdb/zdpuA...)
 * @property type - Database type (keyvalue, eventlog, docstore, etc.)
 * @property name - Human-readable database name
 */
export interface OrbitDBOpenResponse {
  address: string
  type: string
  name: string
}

/**
 * Health check response from OrbitDB service
 *
 * @property ok - Whether service is healthy
 * @property peerId - IPFS peer ID of this OrbitDB node
 * @property connections - Number of connected IPFS peers
 */
export interface OrbitDBHealthResponse {
  ok: boolean
  peerId: string
  connections: number
}

/**
 * Peer information for P2P connections
 *
 * @property wsMultiaddrPublic - WebSocket multiaddress for browser connections
 */
export interface OrbitDBPeerInfoResponse {
  wsMultiaddrPublic: string
}

/**
 * OrbitDB HTTP Client
 *
 * Provides a typed interface for interacting with the OrbitDB microservice.
 * Handles all HTTP communication, error handling, and data transformation.
 */
export class OrbitDBClient {
  private baseUrl: string

  /**
   * Create a new OrbitDB client
   *
   * @param baseUrl - Base URL of OrbitDB service (defaults to env var or localhost)
   */
  constructor(baseUrl: string = ORBITDB_BASE_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * Check OrbitDB Service Health
   *
   * Verifies that the OrbitDB service is running and connected to IPFS.
   * Should be called before attempting any OrbitDB operations.
   *
   * @returns Health status including peer ID and connection count
   * @throws Error if service is unreachable
   */
  async health(): Promise<OrbitDBHealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`)
    if (!response.ok) {
      throw new Error(`OrbitDB health check failed: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get Peer Information
   *
   * Retrieves the public WebSocket address for connecting to this OrbitDB node.
   * Used by browsers to establish direct P2P connections.
   *
   * @returns Peer info including WebSocket multiaddress
   * @throws Error if request fails
   */
  async peerInfo(): Promise<OrbitDBPeerInfoResponse> {
    const response = await fetch(`${this.baseUrl}/peerinfo`)
    if (!response.ok) {
      throw new Error(`OrbitDB peer info failed: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Open or Create a Key-Value Store
   *
   * Opens an existing OrbitDB KeyValue database or creates a new one.
   * KeyValue stores are like hash maps: simple key → value mappings.
   *
   * Store names are used as identifiers. If a store with this name exists,
   * it will be opened. Otherwise, a new store is created.
   *
   * @param name - Unique name for the KV store (e.g., "user-collection-registry")
   * @returns Store information including OrbitDB address
   * @throws Error if operation fails
   */
  async openKV(name: string): Promise<OrbitDBOpenResponse> {
    const response = await fetch(`${this.baseUrl}/kv/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    })

    if (!response.ok) {
      throw new Error(`Failed to open OrbitDB KV store: ${response.statusText}`)
    }

    const result = await response.json()
    return { ...result, name } // Include the store name in the response
  }

  /**
   * Store a Key-Value Pair
   *
   * Writes a value to the specified key in an OrbitDB KeyValue store.
   * If the key already exists, it will be overwritten.
   *
   * Values are automatically JSON-serialized and can be any JSON-compatible type:
   * objects, arrays, strings, numbers, booleans, null.
   *
   * @param storeName - Name of the KV store
   * @param key - Key to store under (e.g., "user:did:p2p:...")
   * @param value - Value to store (will be JSON serialized)
   * @throws Error if write fails
   */
  async putKV(storeName: string, key: string, value: any): Promise<void> {
    const response = await fetch(`${this.baseUrl}/kv/put`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: storeName, key, value })
    })

    if (!response.ok) {
      throw new Error(`Failed to put value in OrbitDB: ${response.statusText}`)
    }
  }

  /**
   * Retrieve a Value by Key
   *
   * Fetches a single value from an OrbitDB KeyValue store.
   *
   * @param storeName - Name of the KV store
   * @param key - Key to retrieve
   * @returns The stored value, or undefined if key doesn't exist
   * @throws Error if read fails
   */
  async getKV(storeName: string, key: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/kv/get?name=${encodeURIComponent(storeName)}&key=${encodeURIComponent(key)}`)

    if (!response.ok) {
      throw new Error(`Failed to get value from OrbitDB: ${response.statusText}`)
    }

    const result = await response.json()
    return result.value
  }

  /**
   * Retrieve All Key-Value Pairs
   *
   * Fetches the entire contents of an OrbitDB KeyValue store.
   * Useful for scanning or iterating over all stored data.
   *
   * Note: The OrbitDB service may return data in array format [{key, value}]
   * which this method automatically converts to object format {key: value}.
   *
   * @param storeName - Name of the KV store
   * @returns Object with all key-value pairs
   * @throws Error if read fails
   */
  async getAllKV(storeName: string): Promise<Record<string, any>> {
    const response = await fetch(`${this.baseUrl}/kv/all?name=${encodeURIComponent(storeName)}`)

    if (!response.ok) {
      throw new Error(`Failed to get all values from OrbitDB: ${response.statusText}`)
    }

    const result = await response.json()

    // Convert array format [{key, value}] to object format {key: value}
    // This normalizes the response format for easier consumption
    if (Array.isArray(result)) {
      const obj: Record<string, any> = {}
      for (const item of result) {
        if (item.key && item.value !== undefined) {
          obj[item.key] = item.value
        }
      }
      return obj
    }

    return result || {}
  }

  // Collection-specific methods
  async createCollection(userId: string, name: string, description?: string): Promise<{
    id: string
    address: string
    storeName: string
    name: string
    description?: string
    created: number
    owner: string
  }> {
    // Create a unique OrbitDB for this collection
    const collectionStoreName = `collection-${userId}-${Date.now()}`
    const openResponse = await this.openKV(collectionStoreName)

    const collection = {
      id: collectionStoreName,
      address: openResponse.address,
      storeName: collectionStoreName,
      name,
      description,
      created: Date.now(),
      owner: userId,
      documentCount: 0
    }

    // Store collection metadata using the store name
    await this.putKV(collectionStoreName, 'metadata', collection)

    return collection
  }

  async getCollection(storeNameOrAddress: string): Promise<any> {
    try {
      // Extract store name from address if needed
      const storeName = storeNameOrAddress.includes('/orbitdb/')
        ? storeNameOrAddress.split('/').pop() || storeNameOrAddress
        : storeNameOrAddress

      // Ensure store is opened before trying to read from it
      try {
        await this.openKV(storeName)
      } catch (error) {
        console.error(`Failed to open store ${storeName} for reading:`, error)
        // Continue anyway - store might already be open
      }

      return await this.getKV(storeName, 'metadata')
    } catch (error) {
      console.error('Failed to get collection metadata:', error)
      return null
    }
  }

  async addDocumentToCollection(storeNameOrAddress: string, document: any): Promise<void> {
    // Extract store name from address if needed
    const storeName = storeNameOrAddress.includes('/orbitdb/')
      ? storeNameOrAddress.split('/').pop() || storeNameOrAddress
      : storeNameOrAddress

    // Ensure store is opened (this will reopen if it exists, or create if new)
    try {
      await this.openKV(storeName)
    } catch (error) {
      console.error(`Failed to open store ${storeName}:`, error)
      // Continue anyway - store might already be open
    }

    const docKey = `doc-${document.id}`
    await this.putKV(storeName, docKey, document)

    // Update document count in metadata
    const metadata = await this.getKV(storeName, 'metadata')
    if (metadata) {
      metadata.documentCount = (metadata.documentCount || 0) + 1
      metadata.lastUpdated = Date.now()
      await this.putKV(storeName, 'metadata', metadata)
    }
  }

  async updateDocumentInCollection(storeNameOrAddress: string, documentId: string, updatedDocument: any): Promise<void> {
    // Extract store name from address if needed
    const storeName = storeNameOrAddress.includes('/orbitdb/')
      ? storeNameOrAddress.split('/').pop() || storeNameOrAddress
      : storeNameOrAddress

    // Ensure store is opened
    try {
      await this.openKV(storeName)
    } catch (error) {
      console.error(`Failed to open store ${storeName}:`, error)
    }

    const docKey = `doc-${documentId}`
    await this.putKV(storeName, docKey, updatedDocument)

    // Update metadata last updated time
    const metadata = await this.getKV(storeName, 'metadata')
    if (metadata) {
      metadata.lastUpdated = Date.now()
      await this.putKV(storeName, 'metadata', metadata)
    }
  }

  async getCollectionDocuments(storeNameOrAddress: string): Promise<any[]> {
    try {
      // Extract store name from address if needed
      const storeName = storeNameOrAddress.includes('/orbitdb/')
        ? storeNameOrAddress.split('/').pop() || storeNameOrAddress
        : storeNameOrAddress

      // Ensure store is opened before trying to read from it
      try {
        await this.openKV(storeName)
      } catch (error) {
        console.error(`Failed to open store ${storeName} for reading documents:`, error)
        // Continue anyway - store might already be open
      }

      const allData = await this.getAllKV(storeName)
      const documents = []

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('doc-')) {
          documents.push(value)
        }
      }

      return documents.sort((a, b) => (b.created || 0) - (a.created || 0))
    } catch (error) {
      console.error('Failed to get collection documents:', error)
      return []
    }
  }
}

export const orbitdbClient = new OrbitDBClient()