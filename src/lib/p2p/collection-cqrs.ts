/**
 * Collection CQRS System
 * Implements Command Query Responsibility Segregation for collections
 * - Operations Log (EventLog) = Commands/Writes
 * - Catalog (DocumentStore) = Queries/Reads
 */

import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import {
  Operation,
  OperationType,
  CatalogDocument,
  P2PError,
  P2PConfig,
  RateLimit,
  CryptoIdentity,
  KeyPair
} from './types'
import { ensureDatabaseReady, readDatabaseEntries } from '../orbitdb-v2-utils'
import { CryptoIdentityManager } from './crypto-identity'
import { SchemaManager } from './schema-manager'
import { ContentManager } from './content-manager'

export class CollectionCQRS {
  private orbitdb: any
  private opsLogDB: any | null = null
  private catalogDB: any | null = null
  private collectionId: string
  private config: P2PConfig
  private identity: CryptoIdentityManager
  private schemaManager: SchemaManager
  private contentManager: ContentManager | null = null
  private tombstones: Set<string> = new Set() // Track tombstoned documents
  private rateLimitTracker: Map<string, { count: number, windowStart: number }> = new Map() // Track rate limits per author

  constructor(orbitdb: any, collectionId: string, config: P2PConfig) {
    this.orbitdb = orbitdb
    this.collectionId = collectionId
    this.config = config
    this.identity = new CryptoIdentityManager()
    this.schemaManager = new SchemaManager(config)
  }

  /**
   * Initialize the CQRS system for a collection
   */
  async initialize(
    userKeyPair: KeyPair,
    helia: any,
    opsLogAddress?: string,
    catalogAddress?: string
  ): Promise<{opsLogAddress: string, catalogAddress: string}> {
    console.log(` CollectionCQRS.initialize() for: ${this.collectionId}`)

    // Initialize crypto identity
    await this.identity.initialize(userKeyPair)

    // Initialize content manager
    this.contentManager = new ContentManager(helia, this.config)

    // Initialize Operations Log (EventLog)
    const opsLogName = opsLogAddress || `${this.collectionId}-ops`
    console.log('  Opening operations log:', opsLogName)

    this.opsLogDB = await this.orbitdb.open(opsLogName, {
      type: 'eventlog',
      create: !opsLogAddress,
      sync: true,
      accessController: {
        type: 'orbitdb',
        write: ['*'] // TODO: Implement proper ACL
      }
    })

    await ensureDatabaseReady(this.opsLogDB)
    console.log('   Operations log ready:', this.opsLogDB.address.toString())

    // Initialize Catalog (DocumentStore)
    const catalogName = catalogAddress || `${this.collectionId}-catalog`
    console.log('   Opening catalog:', catalogName)

    this.catalogDB = await this.orbitdb.open(catalogName, {
      type: 'docstore',
      create: !catalogAddress,
      sync: true,
      accessController: {
        type: 'orbitdb',
        write: ['*'] // TODO: Implement proper ACL
      }
    })

    await ensureDatabaseReady(this.catalogDB)
    console.log('   Catalog ready:', this.catalogDB.address.toString())

    // Set up event listeners
    this.setupEventListeners()

    // Build catalog from operations log if needed
    await this.rebuildCatalogFromOps()

    // Start cleanup timer for rate limits
    setInterval(() => {
      this.cleanupRateLimits()
    }, 60000) // Clean up every minute

    return {
      opsLogAddress: this.opsLogDB.address.toString(),
      catalogAddress: this.catalogDB.address.toString()
    }
  }

  /**
   * Create a new document (CREATE operation)
   */
  async createDocument(
    file: File,
    metadata: {
      title: string
      description?: string
      tags?: string[]
    }
  ): Promise<CatalogDocument> {
    console.log(` Creating document: ${metadata.title}`)

    // Generate document ID first
    const documentId = crypto.randomUUID()

    // Store file on IPFS with proper pinning
    const cid = await this.contentManager!.storeContent(file, {
      isOwned: true,
      documentId
    })
    console.log('   Generated CID:', cid)

    // Create operation with crypto identity
    const operationData = {
      title: metadata.title,
      description: metadata.description || '',
      tags: metadata.tags || [],
      ipfsCID: cid,
      mimeType: file.type,
      size: file.size,
      filename: file.name
    }

    const operation: Operation = {
      type: 'CREATE',
      collectionId: this.collectionId,
      documentId,
      data: operationData,
      version: 1,
      schemaVersion: '1.0.0',
      identity: await this.identity.signData({
        type: 'CREATE',
        collectionId: this.collectionId,
        documentId,
        data: operationData,
        version: 1
      }, this.config.security?.requireProofOfWork, this.config.security?.rateLimits?.proofOfWorkDifficulty)
    }

    // Validate operation size, rate limits, and proof-of-work
    await this.validateOperation(operation, file)

    // Append to operations log
    await this.opsLogDB!.add(operation)
    console.log('   Operation added to log')

    // Update catalog (derived state)
    const catalogDoc = await this.applyCatalogOperation(operation)
    console.log('   Catalog updated')

    return catalogDoc
  }

  /**
   * Update an existing document (UPDATE operation)
   */
  async updateDocument(
    documentId: string,
    updates: {
      title?: string
      description?: string
      tags?: string[]
      file?: File
    }
  ): Promise<CatalogDocument> {
    console.log(` Updating document: ${documentId}`)

    // Get current document state
    const currentDoc = await this.getDocument(documentId)
    if (!currentDoc) {
      throw new P2PError('Document not found', 'DOCUMENT_NOT_FOUND', { documentId })
    }

    let newCID = currentDoc.ipfsCID
    let newMimeType = currentDoc.mimeType
    let newSize = currentDoc.size

    // Handle file update if provided
    if (updates.file) {
      // Remove old file reference
      if (currentDoc.ipfsCID) {
        await this.contentManager!.removeDocumentReference(currentDoc.ipfsCID, documentId)
      }

      // Store new file
      newCID = await this.contentManager!.storeContent(updates.file, {
        isOwned: true,
        documentId
      })
      newMimeType = updates.file.type
      newSize = updates.file.size
      console.log('   File updated, new CID:', newCID)
    } else {
      // Keep existing file, just update document reference
      if (currentDoc.ipfsCID) {
        await this.contentManager!.addDocumentReference(currentDoc.ipfsCID, documentId)
      }
    }

    // Create UPDATE operation with crypto identity
    const operationData = {
      title: updates.title ?? currentDoc.title,
      description: updates.description ?? currentDoc.description,
      tags: updates.tags ?? currentDoc.tags,
      ipfsCID: newCID,
      mimeType: newMimeType,
      size: newSize
    }

    const operation: Operation = {
      type: 'UPDATE',
      collectionId: this.collectionId,
      documentId,
      data: operationData,
      version: currentDoc.provenance.version + 1,
      schemaVersion: '1.0.0',
      identity: await this.identity.signData({
        type: 'UPDATE',
        collectionId: this.collectionId,
        documentId,
        data: operationData,
        version: currentDoc.provenance.version + 1
      }, this.config.security?.requireProofOfWork, this.config.security?.rateLimits?.proofOfWorkDifficulty)
    }

    // Validate operation size, rate limits, and proof-of-work
    await this.validateOperation(operation, updates.file)

    await this.opsLogDB!.add(operation)

    // Update catalog
    const catalogDoc = await this.applyCatalogOperation(operation)
    console.log('   Document updated')

    return catalogDoc
  }

  /**
   * Delete a document (DELETE operation)
   */
  async deleteDocument(documentId: string): Promise<void> {
    console.log(` Deleting document: ${documentId}`)

    // Get current document to clean up content references
    const currentDoc = await this.getDocument(documentId)
    if (currentDoc && currentDoc.ipfsCID) {
      await this.contentManager!.removeDocumentReference(currentDoc.ipfsCID, documentId)
    }

    const operation: Operation = {
      type: 'DELETE',
      collectionId: this.collectionId,
      documentId,
      data: {},
      version: 1, // Delete operations always version 1
      schemaVersion: '1.0.0',
      identity: await this.identity.signData({
        type: 'DELETE',
        collectionId: this.collectionId,
        documentId,
        data: {},
        version: 1
      }, this.config.security?.requireProofOfWork, this.config.security?.rateLimits?.proofOfWorkDifficulty)
    }

    // Validate operation size, rate limits, and proof-of-work
    await this.validateOperation(operation)

    await this.opsLogDB!.add(operation)

    // Remove from catalog
    await this.catalogDB!.del(documentId)
    console.log('   Document deleted')
  }

  /**
   * Tombstone a document (TOMBSTONE operation)
   * Makes the document permanently invisible but preserves the operation history
   */
  async tombstoneDocument(documentId: string, reason?: string): Promise<void> {
    console.log(` Tombstoning document: ${documentId}`)

    const currentDoc = await this.getDocument(documentId)
    if (!currentDoc) {
      throw new P2PError('Document not found', 'DOCUMENT_NOT_FOUND', { documentId })
    }

    // Clean up content references
    if (currentDoc.ipfsCID) {
      await this.contentManager!.removeDocumentReference(currentDoc.ipfsCID, documentId)
    }

    const operationData = {
      reason: reason || 'Content removed',
      originalTitle: currentDoc.title
    }

    const operation: Operation = {
      type: 'TOMBSTONE',
      collectionId: this.collectionId,
      documentId,
      data: operationData,
      version: currentDoc.provenance.version + 1,
      schemaVersion: '1.0.0',
      identity: await this.identity.signData({
        type: 'TOMBSTONE',
        collectionId: this.collectionId,
        documentId,
        data: operationData,
        version: currentDoc.provenance.version + 1
      }, this.config.security?.requireProofOfWork, this.config.security?.rateLimits?.proofOfWorkDifficulty)
    }

    // Validate operation size, rate limits, and proof-of-work
    await this.validateOperation(operation)

    await this.opsLogDB!.add(operation)

    // Add to tombstones set
    this.tombstones.add(documentId)

    // Remove from catalog but keep in operations log
    await this.catalogDB!.del(documentId)
    console.log('   Document tombstoned')
  }

  /**
   * Redact metadata from a document (REDACT_METADATA operation)
   * Allows removing sensitive metadata while preserving the document
   */
  async redactDocumentMetadata(
    documentId: string,
    fieldsToRedact: string[],
    reason?: string
  ): Promise<CatalogDocument> {
    console.log(` Redacting metadata from document: ${documentId}`, fieldsToRedact)

    const currentDoc = await this.getDocument(documentId)
    if (!currentDoc) {
      throw new P2PError('Document not found', 'DOCUMENT_NOT_FOUND', { documentId })
    }

    if (this.tombstones.has(documentId)) {
      throw new P2PError('Cannot redact tombstoned document', 'DOCUMENT_TOMBSTONED', { documentId })
    }

    const operationData = {
      redactedFields: fieldsToRedact,
      reason: reason || 'Privacy redaction',
      redactedAt: Date.now()
    }

    const operation: Operation = {
      type: 'REDACT_METADATA',
      collectionId: this.collectionId,
      documentId,
      data: operationData,
      version: currentDoc.provenance.version + 1,
      schemaVersion: '1.0.0',
      identity: await this.identity.signData({
        type: 'REDACT_METADATA',
        collectionId: this.collectionId,
        documentId,
        data: operationData,
        version: currentDoc.provenance.version + 1
      }, this.config.security?.requireProofOfWork, this.config.security?.rateLimits?.proofOfWorkDifficulty)
    }

    // Validate operation size, rate limits, and proof-of-work
    await this.validateOperation(operation)

    await this.opsLogDB!.add(operation)

    // Apply redaction to catalog
    const redactedDoc = await this.applyCatalogOperation(operation)
    console.log('   Metadata redacted')

    return redactedDoc
  }

  /**
   * Add tags to a document (TAG operation)
   */
  async tagDocument(documentId: string, tags: string[]): Promise<CatalogDocument> {
    console.log(` Tagging document: ${documentId}`, tags)

    const currentDoc = await this.getDocument(documentId)
    if (!currentDoc) {
      throw new P2PError('Document not found', 'DOCUMENT_NOT_FOUND', { documentId })
    }

    const newTags = [...new Set([...currentDoc.tags, ...tags])]

    const operationData = {
      tags: newTags,
      addedTags: tags
    }

    const operation: Operation = {
      type: 'TAG',
      collectionId: this.collectionId,
      documentId,
      data: operationData,
      version: currentDoc.provenance.version + 1,
      schemaVersion: '1.0.0',
      identity: await this.identity.signData({
        type: 'TAG',
        collectionId: this.collectionId,
        documentId,
        data: operationData,
        version: currentDoc.provenance.version + 1
      }, this.config.security?.requireProofOfWork, this.config.security?.rateLimits?.proofOfWorkDifficulty)
    }
    // Validate operation size, rate limits, and proof-of-work
    await this.validateOperation(operation)

    await this.opsLogDB!.add(operation)

    // Update catalog with new tags
    const updatedDoc = {
      ...currentDoc,
      tags: newTags,
      provenance: {
        ...currentDoc.provenance,
        updated: Date.now(),
        version: operation.version
      },
      lastOpCID: operation.hash || 'unknown'
    }

    await this.catalogDB!.put(documentId, updatedDoc)
    console.log('   Document tagged')

    return updatedDoc
  }

  /**
   * Get a document from the catalog (Query)
   * Filters out tombstoned documents
   */
  async getDocument(documentId: string): Promise<CatalogDocument | null> {
    if (!this.catalogDB) return null

    // Check if document is tombstoned
    if (this.tombstones.has(documentId)) {
      return null
    }

    try {
      const doc = await this.catalogDB.get(documentId)
      return doc || null
    } catch (error) {
      console.warn('Failed to get document:', error)
      return null
    }
  }

  /**
   * Get all documents from the catalog (Query)
   */
  async getAllDocuments(options: {
    limit?: number
    offset?: number
    tags?: string[]
  } = {}): Promise<CatalogDocument[]> {
    if (!this.catalogDB) return []

    try {
      const query = this.catalogDB.query((doc: CatalogDocument) => {
        // Filter out tombstoned documents
        if (this.tombstones.has(doc._id)) {
          return false
        }

        // Filter by tags if specified
        if (options.tags && options.tags.length > 0) {
          const hasAllTags = options.tags.every(tag =>
            doc.tags.includes(tag)
          )
          if (!hasAllTags) return false
        }

        return true
      })

      let results = await query

      // Sort by last update
      results.sort((a: CatalogDocument, b: CatalogDocument) =>
        b.provenance.updated - a.provenance.updated
      )

      // Apply pagination
      if (options.offset) {
        results = results.slice(options.offset)
      }
      if (options.limit) {
        results = results.slice(0, options.limit)
      }

      return results
    } catch (error) {
      console.error('Failed to get all documents:', error)
      return []
    }
  }

  /**
   * Get the full operation history for a document
   */
  async getDocumentHistory(documentId: string): Promise<Operation[]> {
    if (!this.opsLogDB) return []

    try {
      const entries = await readDatabaseEntries(this.opsLogDB, { limit: 1000 })

      return entries
        .map(entry => entry.value || entry.payload?.value || entry)
        .filter(op => op.documentId === documentId)
        .sort((a, b) => a.timestamp - b.timestamp)
    } catch (error) {
      console.error('Failed to get document history:', error)
      return []
    }
  }

  /**
   * Get collection statistics
   */
  async getStats() {
    const docs = await this.getAllDocuments()
    const operations = await readDatabaseEntries(this.opsLogDB || {}, { limit: 1000 })

    return {
      documentCount: docs.length,
      operationCount: operations.length,
      tags: [...new Set(docs.flatMap(doc => doc.tags))],
      authors: [...new Set(docs.flatMap(doc => doc.authors))],
      lastUpdate: Math.max(...docs.map(doc => doc.provenance.updated), 0)
    }
  }

  /**
   * Get document content from IPFS
   */
  async getDocumentContent(documentId: string): Promise<Uint8Array | null> {
    const doc = await this.getDocument(documentId)
    if (!doc || !doc.ipfsCID) {
      return null
    }

    return this.contentManager!.getContent(doc.ipfsCID)
  }

  /**
   * Star/unstar document content
   */
  async setDocumentStarred(documentId: string, starred: boolean): Promise<void> {
    const doc = await this.getDocument(documentId)
    if (doc && doc.ipfsCID) {
      await this.contentManager!.setContentStarred(doc.ipfsCID, starred)
    }
  }

  /**
   * Get content management metrics
   */
  getContentMetrics() {
    return this.contentManager!.getContentMetrics()
  }

  /**
   * Update content pinning policy
   */
  updatePinningPolicy(policy: any): void {
    this.contentManager!.updatePinningPolicy(policy)
  }

  // Private methods

  /**
   * Handle operation conflicts using deterministic merge rules
   */
  private resolveOperationConflicts(operations: Operation[]): Operation[] {
    // Group operations by documentId
    const operationsByDoc = new Map<string, Operation[]>()

    for (const op of operations) {
      const existing = operationsByDoc.get(op.documentId) || []
      existing.push(op)
      operationsByDoc.set(op.documentId, existing)
    }

    const resolvedOps: Operation[] = []

    // Resolve conflicts for each document
    for (const [documentId, docOps] of operationsByDoc.entries()) {
      if (docOps.length === 1) {
        resolvedOps.push(docOps[0])
        continue
      }

      // Sort operations using deterministic rules
      const sortedOps = docOps.sort((a, b) => {
        // Use the crypto identity comparison for deterministic ordering
        return CryptoIdentityManager.compareOperations(
          { identity: a.identity },
          { identity: b.identity }
        )
      })

      // For conflicting operations of the same type, last writer wins
      // For different types, apply precedence rules
      const finalOp = this.applyOperationPrecedence(sortedOps)
      resolvedOps.push(finalOp)
    }

    return resolvedOps
  }

  /**
   * Apply operation precedence rules for conflict resolution
   */
  private applyOperationPrecedence(operations: Operation[]): Operation {
    // Operation precedence (highest to lowest):
    // 1. TOMBSTONE - permanent deletion
    // 2. DELETE - soft deletion
    // 3. REDACT_METADATA - privacy protection
    // 4. UPDATE - content changes
    // 5. TAG - metadata changes
    // 6. CREATE - initial creation

    const precedenceOrder: OperationType[] = [
      'TOMBSTONE',
      'DELETE',
      'REDACT_METADATA',
      'UPDATE',
      'TAG',
      'CREATE'
    ]

    // Group by operation type
    const opsByType = new Map<OperationType, Operation[]>()
    for (const op of operations) {
      const existing = opsByType.get(op.type) || []
      existing.push(op)
      opsByType.set(op.type, existing)
    }

    // Find the highest precedence operation type that exists
    for (const opType of precedenceOrder) {
      const opsOfType = opsByType.get(opType)
      if (opsOfType && opsOfType.length > 0) {
        // If multiple operations of the same type, use the latest by Lamport clock
        return opsOfType.sort((a, b) =>
          CryptoIdentityManager.compareOperations(
            { identity: a.identity },
            { identity: b.identity }
          )
        ).pop()!
      }
    }

    // Fallback to the last operation (should never reach here)
    return operations[operations.length - 1]
  }

  /**
   * Validate operation size, rate limits, and proof-of-work
   */
  private async validateOperation(operation: Operation, file?: File): Promise<void> {
    const security = this.config.security
    if (!security) return

    const rateLimits = security.rateLimits
    if (!rateLimits) return

    // Check operation size
    const operationSize = JSON.stringify(operation).length
    if (operationSize > rateLimits.maxBytesPerOperation) {
      throw new P2PError(
        `Operation exceeds size limit: ${operationSize} > ${rateLimits.maxBytesPerOperation}`,
        'OPERATION_TOO_LARGE',
        { operationSize, limit: rateLimits.maxBytesPerOperation }
      )
    }

    // Check file size if present
    if (file && file.size > rateLimits.maxBytesPerOperation) {
      throw new P2PError(
        `File exceeds size limit: ${file.size} > ${rateLimits.maxBytesPerOperation}`,
        'FILE_TOO_LARGE',
        { fileSize: file.size, limit: rateLimits.maxBytesPerOperation }
      )
    }

    // Check rate limits per author
    const authorDID = operation.identity.authorDID
    const now = Date.now()
    const windowDuration = 60 * 1000 // 1 minute

    let authorLimits = this.rateLimitTracker.get(authorDID)
    if (!authorLimits || (now - authorLimits.windowStart) > windowDuration) {
      // Reset window
      authorLimits = { count: 0, windowStart: now }
      this.rateLimitTracker.set(authorDID, authorLimits)
    }

    // Check operations per minute
    if (authorLimits.count >= rateLimits.maxOperationsPerMinute) {
      throw new P2PError(
        `Rate limit exceeded: ${authorLimits.count} operations in current window`,
        'RATE_LIMIT_EXCEEDED',
        {
          currentCount: authorLimits.count,
          limit: rateLimits.maxOperationsPerMinute,
          authorDID
        }
      )
    }

    // Check bytes per minute
    const totalBytes = operationSize + (file?.size || 0)
    if (totalBytes > rateLimits.maxBytesPerMinute) {
      throw new P2PError(
        `Bandwidth limit exceeded: ${totalBytes} bytes > ${rateLimits.maxBytesPerMinute}`,
        'BANDWIDTH_LIMIT_EXCEEDED',
        { totalBytes, limit: rateLimits.maxBytesPerMinute, authorDID }
      )
    }

    // Increment counter
    authorLimits.count++

    // Validate proof-of-work if required
    if (security.requireProofOfWork) {
      const identity = operation.identity
      if (!identity.proofOfWork) {
        throw new P2PError(
          'Proof-of-work required but not provided',
          'PROOF_OF_WORK_REQUIRED',
          { authorDID: identity.authorDID }
        )
      }

      // Verify the proof-of-work
      const isValid = await this.identity.verifyIdentity({
        type: operation.type,
        collectionId: operation.collectionId,
        documentId: operation.documentId,
        data: operation.data,
        version: operation.version
      }, identity)

      if (!isValid.valid) {
        throw new P2PError(
          `Invalid proof-of-work: ${isValid.reason}`,
          'INVALID_PROOF_OF_WORK',
          { authorDID: identity.authorDID, reason: isValid.reason }
        )
      }

      console.log(` Valid proof-of-work from ${identity.authorDID.substring(0, 12)}...`)
    }

    // Validate schema
    const schemaValidation = await this.schemaManager.validateOperation(operation)
    if (!schemaValidation.valid) {
      throw new P2PError(
        `Operation schema validation failed: ${schemaValidation.errors?.join(', ')}`,
        'SCHEMA_VALIDATION_FAILED',
        {
          authorDID: operation.identity.authorDID,
          schemaVersion: operation.schemaVersion,
          errors: schemaValidation.errors
        }
      )
    }
  }

  /**
   * Clean up old rate limit entries
   */
  private cleanupRateLimits(): void {
    const now = Date.now()
    const windowDuration = 60 * 1000 // 1 minute

    for (const [authorDID, limits] of this.rateLimitTracker.entries()) {
      if ((now - limits.windowStart) > windowDuration) {
        this.rateLimitTracker.delete(authorDID)
      }
    }
  }



  private async applyCatalogOperation(operation: Operation): Promise<CatalogDocument> {
    const { type, documentId, data, version, identity } = operation
    const timestamp = new Date(identity.timestamp).getTime()
    const authorDID = identity.authorDID

    switch (type) {
      case 'CREATE': {
        const catalogDoc: CatalogDocument = {
          _id: documentId,
          type: this.inferDocumentType(data.mimeType),
          title: data.title,
          description: data.description,
          tags: data.tags,
          authors: [authorDID],
          ipfsCID: data.ipfsCID,
          mimeType: data.mimeType,
          size: data.size,
          provenance: {
            created: timestamp,
            updated: timestamp,
            version: version
          },
          lastOpCID: operation.hash || 'unknown',
          metadata: {},
          searchText: `${data.title} ${data.description} ${data.tags.join(' ')}`
        }

        await this.catalogDB!.put(documentId, catalogDoc)
        return catalogDoc
      }

      case 'UPDATE': {
        const existing = await this.getDocument(documentId)
        if (!existing) {
          throw new P2PError('Cannot update non-existent document', 'DOCUMENT_NOT_FOUND')
        }

        const updatedDoc: CatalogDocument = {
          ...existing,
          title: data.title,
          description: data.description,
          tags: data.tags,
          ipfsCID: data.ipfsCID,
          mimeType: data.mimeType,
          size: data.size,
          provenance: {
            ...existing.provenance,
            updated: timestamp,
            version: version
          },
          lastOpCID: operation.hash || 'unknown',
          searchText: `${data.title} ${data.description} ${data.tags.join(' ')}`
        }

        await this.catalogDB!.put(documentId, updatedDoc)
        return updatedDoc
      }

      case 'REDACT_METADATA': {
        const existing = await this.getDocument(documentId)
        if (!existing) {
          throw new P2PError('Cannot redact non-existent document', 'DOCUMENT_NOT_FOUND')
        }

        // Apply redactions to the document
        const redactedDoc: CatalogDocument = { ...existing }

        for (const field of data.redactedFields) {
          switch (field) {
            case 'title':
              redactedDoc.title = '[REDACTED]'
              break
            case 'description':
              redactedDoc.description = '[REDACTED]'
              break
            case 'tags':
              redactedDoc.tags = ['redacted']
              break
            case 'metadata':
              redactedDoc.metadata = { redacted: true, reason: data.reason }
              break
            // Add other field redactions as needed
          }
        }

        // Update provenance
        redactedDoc.provenance = {
          ...existing.provenance,
          updated: timestamp,
          version: version
        }
        redactedDoc.lastOpCID = operation.hash || 'unknown'
        redactedDoc.searchText = `${redactedDoc.title} ${redactedDoc.description} ${redactedDoc.tags.join(' ')}`

        await this.catalogDB!.put(documentId, redactedDoc)
        return redactedDoc
      }

      case 'TOMBSTONE': {
        // Tombstone operations don't create catalog entries
        // Just track in the tombstones set (already done in tombstoneDocument)
        this.tombstones.add(documentId)
        throw new P2PError('Tombstoned documents have no catalog representation', 'DOCUMENT_TOMBSTONED')
      }

      default:
        throw new P2PError('Unsupported operation type for catalog', 'UNSUPPORTED_OPERATION', { type })
    }
  }

  private inferDocumentType(mimeType?: string): CatalogDocument['type'] {
    if (!mimeType) return 'other'

    if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      return 'media'
    }
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      return 'text'
    }
    if (mimeType.includes('code') || mimeType.includes('script')) {
      return 'code'
    }

    return 'document'
  }

  private async rebuildCatalogFromOps(): Promise<void> {
    if (!this.opsLogDB || !this.catalogDB) return

    console.log('   Rebuilding catalog from operations log...')

    try {
      const operations = await readDatabaseEntries(this.opsLogDB, { limit: 10000 })
      const documentStates = new Map<string, CatalogDocument>()
      const deletedDocs = new Set<string>()

      // Process operations in chronological order using Lamport clocks
      const sortedOps = operations
        .map(entry => entry.value || entry.payload?.value || entry)
        .sort((a, b) => {
          // Sort by Lamport clock if available, otherwise timestamp
          if (a.identity?.lamportClock && b.identity?.lamportClock) {
            return a.identity.lamportClock - b.identity.lamportClock
          }
          const timestampA = a.identity?.timestamp ? new Date(a.identity.timestamp).getTime() : a.timestamp || 0
          const timestampB = b.identity?.timestamp ? new Date(b.identity.timestamp).getTime() : b.timestamp || 0
          return timestampA - timestampB
        })

      // Apply conflict resolution before processing
      const resolvedOps = this.resolveOperationConflicts(sortedOps)

      for (const operation of resolvedOps) {
        // Update Lamport clock from incoming operations
        if (operation.identity?.lamportClock) {
          this.identity.updateLamportClock(operation.identity.lamportClock)
        }

        if (operation.type === 'DELETE') {
          deletedDocs.add(operation.documentId)
          documentStates.delete(operation.documentId)
        } else if (operation.type === 'TOMBSTONE') {
          this.tombstones.add(operation.documentId)
          documentStates.delete(operation.documentId)
        } else if (!deletedDocs.has(operation.documentId) && !this.tombstones.has(operation.documentId)) {
          try {
            const catalogDoc = await this.applyCatalogOperation(operation)
            documentStates.set(operation.documentId, catalogDoc)
          } catch (error) {
            // Skip tombstoned documents during rebuild
            if (error instanceof P2PError && error.code === 'DOCUMENT_TOMBSTONED') {
              continue
            }
            console.warn('Failed to apply operation:', operation, error)
          }
        }
      }

      console.log(`   Catalog rebuilt: ${documentStates.size} documents`)

    } catch (error) {
      console.error('Failed to rebuild catalog:', error)
    }
  }

  private setupEventListeners(): void {
    // Listen for new operations
    this.opsLogDB?.events.on('write', async (entry: any) => {
      console.log(' New operation added to log')
      try {
        const operation = entry.payload?.value || entry.value || entry

        // Update Lamport clock from incoming operations
        if (operation.identity?.lamportClock) {
          this.identity.updateLamportClock(operation.identity.lamportClock)
        }

        if (operation.type === 'TOMBSTONE') {
          this.tombstones.add(operation.documentId)
          console.log('   Document tombstoned from new operation')
        } else if (operation.type !== 'DELETE') {
          try {
            await this.applyCatalogOperation(operation)
            console.log('   Catalog updated from new operation')
          } catch (error) {
            if (error instanceof P2PError && error.code === 'DOCUMENT_TOMBSTONED') {
              console.log('   Ignoring tombstoned document operation')
            } else {
              console.error('Failed to apply new operation to catalog:', error)
            }
          }
        }
      } catch (error) {
        console.error('Failed to apply new operation to catalog:', error)
      }
    })

    // Listen for replication
    this.opsLogDB?.events.on('replicated', () => {
      console.log(' Operations replicated from peer')
      this.rebuildCatalogFromOps()
    })

    this.catalogDB?.events.on('replicated', () => {
      console.log(' Catalog replicated from peer')
    })
  }
}