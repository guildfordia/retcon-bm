/**
 * Core types for the Hybrid CQRS P2P Architecture
 */

// Registry types
export interface RegistryEntry {
  type: 'collection' | 'user' | 'schema'
  address: string        // OrbitDB address
  metadata: {
    name: string
    description?: string
    created: number
    lastSeen: number
    version?: string
  }
}

// Operation types for CQRS
export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'TAG' | 'RELATE' | 'TOMBSTONE' | 'REDACT_METADATA'

// Anti-spam proof-of-work header
export interface ProofOfWork {
  nonce: number
  difficulty: number
  target: string
  hash: string
}

// Cryptographic identity
export interface CryptoIdentity {
  authorDID: string        // Deterministic ID from public key
  publicKey: string        // Base64 encoded public key
  keyAlgorithm: string     // 'ECDSA-P256'
  signature: string        // Signature of the operation
  lamportClock: number     // Logical clock for ordering
  timestamp: string        // ISO 8601 timestamp
  proofOfWork?: ProofOfWork // Optional anti-spam PoW
}

export interface Operation {
  type: OperationType
  collectionId: string
  documentId: string
  data: any              // Operation-specific data
  version: number        // Operation version for conflict resolution
  schemaVersion: string  // Schema version (e.g., "1.0.0")

  // Cryptographic proof
  identity: CryptoIdentity

  // Size limits enforced
  maxBytes?: number      // For validation
}

// Document type-specific metadata interfaces
export interface QuoteMetadata {
  // ISO-690 citation fields
  author: string
  title: string
  publisher?: string
  year?: string
  isbn?: string
  edition?: string
  pages?: string        // Total pages of the book
  keywords: string[]
  pageNumbers: string   // Pages where quote is found (e.g., "45-52")
  [key: string]: any    // Allow additional citation fields
}

export interface LinkMetadata {
  url: string           // Required URL
  title?: string
  description?: string
  author?: string
  publicationDate?: string
  siteName?: string
  keywords: string[]
  thumbnail?: string    // URL or CID of page miniature
  archived?: boolean    // Whether content is archived
  [key: string]: any    // Allow additional metadata
}

export interface ImageMetadata {
  title?: string
  description?: string
  creator?: string
  source?: string
  date?: string
  dimensions?: {
    width: number
    height: number
  }
  format?: string       // e.g., "jpg", "png", "webp"
  keywords: string[]
  [key: string]: any    // Allow additional metadata
}

// Catalog document schema
export interface CatalogDocument {
  _id: string           // Document ID
  type: 'quote' | 'link' | 'image'
  title: string
  description?: string
  tags: string[]
  authors: string[]     // DIDs
  ipfsCID?: string      // File content on IPFS (required for images, optional for quotes/links)
  thumbCID?: string     // Thumbnail on IPFS
  mimeType?: string
  size?: number         // Max 1MB for images
  provenance: {
    created: number
    updated: number
    version: number
    forkOf?: string    // If forked from another document
  }
  lastOpCID: string    // Reference to creating/updating operation
  metadata: QuoteMetadata | LinkMetadata | ImageMetadata
  searchText?: string  // Pre-computed search text
}

// User public activity types - NO PRIVATE DATA
export interface FeedEntry {
  type: 'publish' | 'comment' | 'like' | 'follow' | 'announce' | 'tag'
  data: {
    // For 'publish'
    documentId?: string
    collectionId?: string
    title?: string
    // For 'comment'
    targetDocumentId?: string
    comment?: string
    // For 'follow'
    followedCollection?: string
    // For 'tag'
    taggedDocumentId?: string
    addedTags?: string[]
    // Generic fields
    [key: string]: any
  }
  schemaVersion: string

  // Cryptographic proof (same as operations)
  identity: CryptoIdentity

  // Size limits
  maxBytes?: number
}

// Search types
export interface SearchQuery {
  text?: string
  tags?: string[]
  collections?: string[]
  authors?: string[]
  dateRange?: {
    start?: number
    end?: number
  }
  limit?: number
  offset?: number
}

export interface SearchResult {
  document: CatalogDocument
  score: number
  highlights?: string[]
  collection: string
}

// Network types
export interface PeerInfo {
  peerId: string
  multiaddrs: string[]
  lastSeen: number
  capabilities: string[]
  collections: string[]
}

export interface CollectionInfo {
  id: string
  name: string
  description?: string
  address: string
  opsLogAddress: string
  catalogAddress: string
  documentCount: number
  lastUpdate: number
  permissions: {
    readers: string[]  // DIDs allowed to read
    writers: string[]  // DIDs allowed to write
    public: boolean    // Public read access
  }
}

// Database configuration
export interface DatabaseConfig {
  type: 'keyvalue' | 'eventlog' | 'documents'
  sync: boolean
  create: boolean
  accessController?: {
    type: string
    write?: string[]
  }
}

// Event types for pub/sub
export interface P2PEvent {
  type: 'peer-joined' | 'peer-left' | 'collection-updated' | 'document-published'
  data: any
  timestamp: number
  source: string
}

// Error types
export class P2PError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message)
    this.name = 'P2PError'
  }
}

export class RegistryError extends P2PError {
  constructor(message: string, context?: any) {
    super(message, 'REGISTRY_ERROR', context)
    this.name = 'RegistryError'
  }
}

export class ReplicationError extends P2PError {
  constructor(message: string, context?: any) {
    super(message, 'REPLICATION_ERROR', context)
    this.name = 'ReplicationError'
  }
}

// Utility types
export interface KeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export interface SignedData<T = any> {
  data: T
  signature: string
  publicKey: string
  timestamp: number
}

// Status and health
export interface SystemHealth {
  registry: {
    connected: boolean
    lastSync: number
    entryCount: number
  }
  collections: {
    subscribed: number
    syncing: number
    lastUpdate: number
  }
  network: {
    peers: number
    bandwidth: {
      upload: number
      download: number
    }
  }
  storage: {
    used: number
    available: number
  }
}


// Schema definitions
export interface SchemaDefinition {
  schemaId: string      // e.g., "operation-v1", "activity-v1"
  version: string       // Semantic version
  jsonSchema: any       // JSON Schema object
  description: string
  created: string       // ISO timestamp
  cid: string          // IPFS CID of the schema
}

// Rate limiting
export interface RateLimit {
  maxOperationsPerMinute: number
  maxBytesPerOperation: number
  maxBytesPerMinute: number
  proofOfWorkDifficulty: number
}

// Configuration types
export interface P2PConfig {
  userId: string
  registryAddress?: string
  storage: {
    directory: string
    maxSize: number
  }
  network: {
    bootstrap: string[]
    maxPeers: number
  }
  search: {
    indexSize: number
    updateInterval: number
  }
  security: {
    requireProofOfWork: boolean
    rateLimits: RateLimit
  }
  schemas: {
    operationSchema: string       // CID or version
    activitySchema: string
  }
}