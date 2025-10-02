/**
 * Document Edit and Version History Integration Tests
 *
 * Tests the document editing API and version history functionality
 */

import { orbitdbClient } from '@/lib/orbitdb-client'

describe('Document Edit and Version History', () => {
  let collectionId: string
  let documentId: string
  const testUserId = 'did:p2p:test123'

  beforeAll(async () => {
    // Check OrbitDB health
    const health = await orbitdbClient.health()
    expect(health.ok).toBe(true)
  })

  beforeEach(async () => {
    // Create a test collection
    const collection = await orbitdbClient.createCollection(
      testUserId,
      'Test Collection',
      'Collection for testing document edits'
    )
    collectionId = collection.id

    // Add a test quote document
    const document = {
      id: `doc-${Date.now()}`,
      documentType: 'quote' as const,
      title: 'Test Quote',
      description: 'A test quote document',
      collectionId: collectionId,
      uploadedBy: testUserId,
      created: Date.now(),
      lastAccessed: Date.now(),
      replicas: [testUserId],
      pinned: false,
      version: 1,
      metadata: {
        quoteContent: 'Original quote content',
        author: 'Original Author',
        title: 'Original Title',
        publisher: 'Original Publisher',
        year: '2024',
        keywords: ['original', 'test']
      }
    }

    await orbitdbClient.addDocumentToCollection(collectionId, document)
    documentId = document.id
  })

  afterEach(async () => {
    // Cleanup: In a real scenario, you'd delete the collection
    // For now, we rely on test isolation
  })

  test('should edit a document and increment version from 1 to 2', async () => {
    // Fetch original document
    const documents = await orbitdbClient.getCollectionDocuments(collectionId)
    const originalDoc = documents.find(d => d.id === documentId)

    expect(originalDoc).toBeDefined()
    expect(originalDoc.version).toBe(1)
    expect(originalDoc.metadata.author).toBe('Original Author')

    // Perform edit
    const updatedMetadata = {
      ...originalDoc.metadata,
      author: 'Updated Author',
      title: 'Updated Title',
      keywords: ['updated', 'test']
    }

    const changeComment = 'Updated author and title'

    // Simulate the edit API logic
    const currentVersion = originalDoc.version || 1
    const newVersion = currentVersion + 1

    const versionEntry = {
      version: currentVersion, // Should store OLD version (1)
      editedBy: testUserId,
      editedAt: Date.now(),
      changeComment: changeComment,
      previousMetadata: { ...originalDoc.metadata }
    }

    if (!originalDoc.versionHistory) {
      originalDoc.versionHistory = []
    }
    originalDoc.versionHistory.push(versionEntry)

    const updatedDocument = {
      ...originalDoc,
      metadata: updatedMetadata,
      version: newVersion, // Should be 2
      lastAccessed: Date.now()
    }

    await orbitdbClient.updateDocumentInCollection(collectionId, documentId, updatedDocument)

    // Fetch updated document
    const updatedDocuments = await orbitdbClient.getCollectionDocuments(collectionId)
    const finalDoc = updatedDocuments.find(d => d.id === documentId)

    // Verify version incremented
    expect(finalDoc.version).toBe(2)

    // Verify metadata updated
    expect(finalDoc.metadata.author).toBe('Updated Author')
    expect(finalDoc.metadata.title).toBe('Updated Title')

    // Verify version history
    expect(finalDoc.versionHistory).toHaveLength(1)
    expect(finalDoc.versionHistory[0].version).toBe(1) // OLD version, not new
    expect(finalDoc.versionHistory[0].changeComment).toBe(changeComment)
    expect(finalDoc.versionHistory[0].previousMetadata.author).toBe('Original Author')
  })

  test('should preserve quote content in version history (read-only field)', async () => {
    const documents = await orbitdbClient.getCollectionDocuments(collectionId)
    const originalDoc = documents.find(d => d.id === documentId)

    const originalQuoteContent = originalDoc.metadata.quoteContent

    // Edit metadata but NOT quote content
    const updatedMetadata = {
      ...originalDoc.metadata,
      author: 'Different Author'
      // quoteContent should remain unchanged
    }

    const currentVersion = originalDoc.version || 1
    const newVersion = currentVersion + 1

    const versionEntry = {
      version: currentVersion,
      editedBy: testUserId,
      editedAt: Date.now(),
      changeComment: 'Changed only author',
      previousMetadata: { ...originalDoc.metadata }
    }

    if (!originalDoc.versionHistory) {
      originalDoc.versionHistory = []
    }
    originalDoc.versionHistory.push(versionEntry)

    const updatedDocument = {
      ...originalDoc,
      metadata: updatedMetadata,
      version: newVersion,
      lastAccessed: Date.now()
    }

    await orbitdbClient.updateDocumentInCollection(collectionId, documentId, updatedDocument)

    const updatedDocuments = await orbitdbClient.getCollectionDocuments(collectionId)
    const finalDoc = updatedDocuments.find(d => d.id === documentId)

    // Quote content should be unchanged
    expect(finalDoc.metadata.quoteContent).toBe(originalQuoteContent)

    // Version history should preserve original quote content
    expect(finalDoc.versionHistory[0].previousMetadata.quoteContent).toBe(originalQuoteContent)
  })

  test('should handle multiple edits and create multiple version history entries', async () => {
    const documents = await orbitdbClient.getCollectionDocuments(collectionId)
    let currentDoc = documents.find(d => d.id === documentId)

    // First edit
    await performEdit(currentDoc, { author: 'First Edit Author' }, 'First edit')

    // Second edit
    let updatedDocs = await orbitdbClient.getCollectionDocuments(collectionId)
    currentDoc = updatedDocs.find(d => d.id === documentId)
    await performEdit(currentDoc, { author: 'Second Edit Author' }, 'Second edit')

    // Third edit
    updatedDocs = await orbitdbClient.getCollectionDocuments(collectionId)
    currentDoc = updatedDocs.find(d => d.id === documentId)
    await performEdit(currentDoc, { author: 'Third Edit Author' }, 'Third edit')

    // Fetch final document
    const finalDocs = await orbitdbClient.getCollectionDocuments(collectionId)
    const finalDoc = finalDocs.find(d => d.id === documentId)

    // Should be version 4 (original 1 + 3 edits)
    expect(finalDoc.version).toBe(4)

    // Should have 3 version history entries
    expect(finalDoc.versionHistory).toHaveLength(3)

    // Verify version numbers are sequential OLD versions
    expect(finalDoc.versionHistory[0].version).toBe(1)
    expect(finalDoc.versionHistory[1].version).toBe(2)
    expect(finalDoc.versionHistory[2].version).toBe(3)

    // Verify current metadata
    expect(finalDoc.metadata.author).toBe('Third Edit Author')
  })

  // Helper function to perform edit
  async function performEdit(doc: any, metadataChanges: any, comment: string) {
    const updatedMetadata = {
      ...doc.metadata,
      ...metadataChanges
    }

    const currentVersion = doc.version || 1
    const newVersion = currentVersion + 1

    const versionEntry = {
      version: currentVersion,
      editedBy: testUserId,
      editedAt: Date.now(),
      changeComment: comment,
      previousMetadata: { ...doc.metadata }
    }

    if (!doc.versionHistory) {
      doc.versionHistory = []
    }
    doc.versionHistory.push(versionEntry)

    const updatedDocument = {
      ...doc,
      metadata: updatedMetadata,
      version: newVersion,
      lastAccessed: Date.now()
    }

    await orbitdbClient.updateDocumentInCollection(collectionId, documentId, updatedDocument)
  }
})
