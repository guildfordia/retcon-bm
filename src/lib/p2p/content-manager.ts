/**
 * Content Manager with IPFS Integration and Pinning Policy
 * Handles file storage, pinning, and content lifecycle management
 */

import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import {
  P2PConfig,
  P2PError,
  CatalogDocument
} from './types'

export interface PinningPolicy {
  // File size limits
  maxFileSize: number
  maxTotalStorage: number

  // Content type policies
  allowedMimeTypes?: string[]
  blockedMimeTypes?: string[]

  // Retention policies
  maxAge: number // milliseconds
  maxDocuments: number

  // Priority-based pinning
  priorities: {
    owned: number      // Content created by this user
    starred: number    // Content marked as important
    recent: number     // Recently accessed content
    popular: number    // Content with many references
    default: number    // Base priority
  }

  // Cleanup thresholds
  cleanupThreshold: number // When to trigger cleanup (0.0-1.0)
  emergencyThreshold: number // When to force aggressive cleanup
}

export interface ContentMetrics {
  totalSize: number
  totalFiles: number
  pinnedSize: number
  pinnedFiles: number
  lastCleanup: number
  storageUsage: number // 0.0-1.0
}

export interface PinnedContent {
  cid: string
  size: number
  mimeType: string
  pinTime: number
  lastAccess: number
  priority: number
  documentIds: string[] // Documents that reference this content
  isOwned: boolean
  isStarred: boolean
}

export class ContentManager {
  private helia: any
  private config: P2PConfig
  private pinningPolicy: PinningPolicy
  private pinnedContent: Map<string, PinnedContent> = new Map()
  private storageStats: ContentMetrics

  constructor(helia: any, config: P2PConfig) {
    this.helia = helia
    this.config = config
    this.pinningPolicy = this.createDefaultPinningPolicy()
    this.storageStats = {
      totalSize: 0,
      totalFiles: 0,
      pinnedSize: 0,
      pinnedFiles: 0,
      lastCleanup: Date.now(),
      storageUsage: 0
    }

    // Start periodic cleanup
    setInterval(() => {
      this.performMaintenanceCleanup()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  /**
   * Store content on IPFS and manage pinning
   */
  async storeContent(
    file: File,
    options: {
      isOwned?: boolean
      isStarred?: boolean
      documentId?: string
      priority?: number
    } = {}
  ): Promise<string> {
    console.log(` Storing content: ${file.name} (${file.size} bytes)`)

    // Validate file against policy
    this.validateFile(file)

    // Check storage capacity
    await this.ensureStorageCapacity(file.size)

    try {
      // Generate CID and store file
      const cid = await this.generateAndStoreFile(file)

      // Calculate priority
      const priority = this.calculatePriority(options)

      // Create pinned content entry
      const pinnedEntry: PinnedContent = {
        cid,
        size: file.size,
        mimeType: file.type,
        pinTime: Date.now(),
        lastAccess: Date.now(),
        priority,
        documentIds: options.documentId ? [options.documentId] : [],
        isOwned: options.isOwned || false,
        isStarred: options.isStarred || false
      }

      // Pin the content
      await this.pinContent(cid, pinnedEntry)

      // Update statistics
      this.updateStorageStats()

      console.log(`   Content stored and pinned: ${cid}`)
      return cid
    } catch (error) {
      throw new P2PError(
        `Failed to store content: ${error}`,
        'CONTENT_STORAGE_FAILED',
        { filename: file.name, size: file.size }
      )
    }
  }

  /**
   * Retrieve content from IPFS
   */
  async getContent(cid: string): Promise<Uint8Array | null> {
    try {
      // Update last access time
      const pinnedEntry = this.pinnedContent.get(cid)
      if (pinnedEntry) {
        pinnedEntry.lastAccess = Date.now()
      }

      // Retrieve from IPFS
      const chunks: Uint8Array[] = []
      for await (const chunk of this.helia.fs.cat(cid)) {
        chunks.push(chunk)
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      console.log(` Retrieved content: ${cid} (${result.length} bytes)`)
      return result
    } catch (error) {
      console.warn(`Failed to retrieve content ${cid}:`, error)
      return null
    }
  }

  /**
   * Add a document reference to existing content
   */
  async addDocumentReference(cid: string, documentId: string): Promise<void> {
    const pinnedEntry = this.pinnedContent.get(cid)
    if (pinnedEntry && !pinnedEntry.documentIds.includes(documentId)) {
      pinnedEntry.documentIds.push(documentId)
      // Recalculate priority based on popularity
      pinnedEntry.priority = this.calculatePriorityForEntry(pinnedEntry)
    }
  }

  /**
   * Remove a document reference from content
   */
  async removeDocumentReference(cid: string, documentId: string): Promise<void> {
    const pinnedEntry = this.pinnedContent.get(cid)
    if (pinnedEntry) {
      pinnedEntry.documentIds = pinnedEntry.documentIds.filter(id => id !== documentId)

      // If no more references and not owned/starred, consider for unpinning
      if (pinnedEntry.documentIds.length === 0 && !pinnedEntry.isOwned && !pinnedEntry.isStarred) {
        pinnedEntry.priority = 0
      } else {
        pinnedEntry.priority = this.calculatePriorityForEntry(pinnedEntry)
      }
    }
  }

  /**
   * Star/unstar content to increase its priority
   */
  async setContentStarred(cid: string, starred: boolean): Promise<void> {
    const pinnedEntry = this.pinnedContent.get(cid)
    if (pinnedEntry) {
      pinnedEntry.isStarred = starred
      pinnedEntry.priority = this.calculatePriorityForEntry(pinnedEntry)
      console.log(` Content ${cid} ${starred ? 'starred' : 'unstarred'}`)
    }
  }

  /**
   * Get content statistics
   */
  getContentMetrics(): ContentMetrics {
    return { ...this.storageStats }
  }

  /**
   * Get pinned content list
   */
  getPinnedContent(): PinnedContent[] {
    return Array.from(this.pinnedContent.values())
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * Update pinning policy
   */
  updatePinningPolicy(policy: Partial<PinningPolicy>): void {
    this.pinningPolicy = { ...this.pinningPolicy, ...policy }
    console.log(' Pinning policy updated')
  }

  /**
   * Force garbage collection
   */
  async forceGarbageCollection(): Promise<{ unpinnedCount: number, freedSpace: number }> {
    return this.performCleanup(true)
  }

  // Private methods

  /**
   * Create default pinning policy
   */
  private createDefaultPinningPolicy(): PinningPolicy {
    return {
      maxFileSize: 100 * 1024 * 1024, // 100MB per file
      maxTotalStorage: this.config.storage.maxSize,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxDocuments: 10000,
      priorities: {
        owned: 100,
        starred: 80,
        recent: 60,
        popular: 40,
        default: 20
      },
      cleanupThreshold: 0.8, // 80% full
      emergencyThreshold: 0.95 // 95% full
    }
  }

  /**
   * Validate file against pinning policy
   */
  private validateFile(file: File): void {
    if (file.size > this.pinningPolicy.maxFileSize) {
      throw new P2PError(
        `File too large: ${file.size} > ${this.pinningPolicy.maxFileSize}`,
        'FILE_TOO_LARGE',
        { size: file.size, limit: this.pinningPolicy.maxFileSize }
      )
    }

    if (this.pinningPolicy.allowedMimeTypes &&
        !this.pinningPolicy.allowedMimeTypes.includes(file.type)) {
      throw new P2PError(
        `File type not allowed: ${file.type}`,
        'FILE_TYPE_NOT_ALLOWED',
        { mimeType: file.type }
      )
    }

    if (this.pinningPolicy.blockedMimeTypes &&
        this.pinningPolicy.blockedMimeTypes.includes(file.type)) {
      throw new P2PError(
        `File type blocked: ${file.type}`,
        'FILE_TYPE_BLOCKED',
        { mimeType: file.type }
      )
    }
  }

  /**
   * Ensure there's enough storage capacity
   */
  private async ensureStorageCapacity(requiredSize: number): Promise<void> {
    const totalRequired = this.storageStats.pinnedSize + requiredSize
    const usageAfter = totalRequired / this.pinningPolicy.maxTotalStorage

    if (usageAfter > this.pinningPolicy.emergencyThreshold) {
      // Emergency cleanup
      console.log(' Emergency storage cleanup required')
      const cleaned = await this.performCleanup(true)

      const newTotal = this.storageStats.pinnedSize + requiredSize
      if (newTotal > this.pinningPolicy.maxTotalStorage) {
        throw new P2PError(
          'Insufficient storage space after cleanup',
          'STORAGE_FULL',
          { required: requiredSize, available: this.pinningPolicy.maxTotalStorage - this.storageStats.pinnedSize }
        )
      }
    } else if (usageAfter > this.pinningPolicy.cleanupThreshold) {
      // Regular cleanup
      console.log(' Storage cleanup triggered')
      await this.performCleanup(false)
    }
  }

  /**
   * Generate CID and store file
   */
  private async generateAndStoreFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Add to IPFS
    const { cid } = await this.helia.fs.addBytes(bytes)
    return cid.toString()
  }

  /**
   * Pin content with tracking
   */
  private async pinContent(cid: string, entry: PinnedContent): Promise<void> {
    // Pin in IPFS
    await this.helia.pins.add(CID.parse(cid))

    // Track in our system
    this.pinnedContent.set(cid, entry)
  }

  /**
   * Unpin content
   */
  private async unpinContent(cid: string): Promise<void> {
    try {
      await this.helia.pins.rm(CID.parse(cid))
      this.pinnedContent.delete(cid)
      console.log(` Unpinned content: ${cid}`)
    } catch (error) {
      console.warn(`Failed to unpin ${cid}:`, error)
    }
  }

  /**
   * Calculate priority for new content
   */
  private calculatePriority(options: {
    isOwned?: boolean
    isStarred?: boolean
    documentId?: string
    priority?: number
  }): number {
    if (options.priority !== undefined) {
      return options.priority
    }

    const { priorities } = this.pinningPolicy

    if (options.isOwned) return priorities.owned
    if (options.isStarred) return priorities.starred

    // Recent content gets higher priority
    return priorities.recent
  }

  /**
   * Recalculate priority for existing content
   */
  private calculatePriorityForEntry(entry: PinnedContent): number {
    const { priorities } = this.pinningPolicy
    const now = Date.now()

    if (entry.isOwned) return priorities.owned
    if (entry.isStarred) return priorities.starred

    // Popular content (multiple references)
    if (entry.documentIds.length > 3) return priorities.popular

    // Recently accessed content
    const daysSinceAccess = (now - entry.lastAccess) / (24 * 60 * 60 * 1000)
    if (daysSinceAccess < 7) return priorities.recent

    return priorities.default
  }

  /**
   * Update storage statistics
   */
  private updateStorageStats(): void {
    let totalSize = 0
    let totalFiles = 0

    for (const entry of this.pinnedContent.values()) {
      totalSize += entry.size
      totalFiles++
    }

    this.storageStats = {
      totalSize,
      totalFiles,
      pinnedSize: totalSize,
      pinnedFiles: totalFiles,
      lastCleanup: this.storageStats.lastCleanup,
      storageUsage: totalSize / this.pinningPolicy.maxTotalStorage
    }
  }

  /**
   * Perform storage cleanup
   */
  private async performCleanup(aggressive: boolean): Promise<{ unpinnedCount: number, freedSpace: number }> {
    const candidates = Array.from(this.pinnedContent.entries())
      .filter(([cid, entry]) => {
        // Never unpin owned or starred content
        if (entry.isOwned || entry.isStarred) return false

        // In aggressive mode, also consider content with no references
        if (aggressive && entry.documentIds.length === 0) return true

        // Normal cleanup: old, low-priority content
        const age = Date.now() - entry.pinTime
        return age > this.pinningPolicy.maxAge || entry.priority < this.pinningPolicy.priorities.default
      })
      .sort(([, a], [, b]) => a.priority - b.priority) // Lowest priority first

    let unpinnedCount = 0
    let freedSpace = 0

    const targetReduction = aggressive ? 0.5 : 0.2 // Free up 50% or 20% of storage
    const targetSpace = this.storageStats.pinnedSize * targetReduction

    for (const [cid, entry] of candidates) {
      if (freedSpace >= targetSpace) break

      await this.unpinContent(cid)
      unpinnedCount++
      freedSpace += entry.size
    }

    this.updateStorageStats()
    this.storageStats.lastCleanup = Date.now()

    console.log(` Cleanup complete: ${unpinnedCount} files unpinned, ${freedSpace} bytes freed`)
    return { unpinnedCount, freedSpace }
  }

  /**
   * Periodic maintenance cleanup
   */
  private async performMaintenanceCleanup(): Promise<void> {
    if (this.storageStats.storageUsage > this.pinningPolicy.cleanupThreshold) {
      await this.performCleanup(false)
    }
  }
}