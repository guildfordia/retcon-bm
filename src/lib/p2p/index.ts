/**
 * P2P System - Hybrid CQRS Architecture
 *
 * Main exports for the P2P document system implementing:
 * - Registry-based discovery
 * - CQRS collections (Ops Log + Catalog)
 * - User workspaces (Drafts + Feed)
 * - Local search indexing
 */

// Main system
export { P2PSystem } from './p2p-system'

// Core components
export { RegistryManager } from './registry-manager'
export { CollectionCQRS } from './collection-cqrs'
export { UserActivity } from './user-workspace'
export { SchemaManager } from './schema-manager'
export { ContentManager } from './content-manager'

// Types
export * from './types'

// Utilities (re-export from parent)
export {
  ensureDatabaseReady,
  readDatabaseEntries,
  normalizeEntry,
  buildDocumentState,
  isClientSide
} from '../orbitdb-v2-utils'

// Default configuration factory
export function createDefaultConfig(userId: string): import('./types').P2PConfig {
  return {
    userId,
    storage: {
      directory: `p2p-${userId}`,
      maxSize: 500 * 1024 * 1024 // 500MB
    },
    network: {
      bootstrap: [],
      maxPeers: 50
    },
    search: {
      indexSize: 10000,
      updateInterval: 30000 // 30 seconds
    },
    security: {
      requireProofOfWork: false, // Enable for anti-spam
      rateLimits: {
        maxOperationsPerMinute: 30,
        maxBytesPerOperation: 1024 * 1024, // 1MB per operation
        maxBytesPerMinute: 10 * 1024 * 1024, // 10MB per minute
        proofOfWorkDifficulty: 4
      }
    },
    schemas: {
      operationSchema: '1.0.0',
      activitySchema: '1.0.0'
    }
  }
}