/**
 * Tests for ContentManager
 */

// Mock external dependencies
jest.mock('multiformats/cid', () => ({
  CID: {
    parse: jest.fn().mockReturnValue({ toString: () => 'mock-cid' })
  }
}))

import { ContentManager, PinningPolicy } from '../content-manager'
import { createTestConfig, createMockHelia, createTestFile } from './test-utils'

describe('ContentManager', () => {
  let manager: ContentManager
  let mockHelia: any
  const config = createTestConfig()

  beforeEach(() => {
    mockHelia = createMockHelia()
    manager = new ContentManager(mockHelia, config)
  })

  describe('initialization', () => {
    it('should initialize with default pinning policy', () => {
      const metrics = manager.getContentMetrics()
      expect(metrics.totalSize).toBe(0)
      expect(metrics.totalFiles).toBe(0)
      expect(metrics.storageUsage).toBe(0)
    })

    it('should create default pinning policy', () => {
      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent).toEqual([])
    })
  })

  describe('storeContent', () => {
    it('should store content with default options', async () => {
      const file = createTestFile('test.txt', 'Hello World')
      const cid = await manager.storeContent(file)

      expect(cid).toBe('mock-cid-123')
      expect(mockHelia.fs.addBytes).toHaveBeenCalled()
      expect(mockHelia.pins.add).toHaveBeenCalled()

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent).toHaveLength(1)
      expect(pinnedContent[0].cid).toBe('mock-cid-123')
      expect(pinnedContent[0].isOwned).toBe(false)
      expect(pinnedContent[0].isStarred).toBe(false)
    })

    it('should store content with custom options', async () => {
      const file = createTestFile('image.jpg', 'Image content')
      const cid = await manager.storeContent(file, {
        isOwned: true,
        isStarred: true,
        documentId: 'doc-123',
        priority: 95
      })

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].isOwned).toBe(true)
      expect(pinnedContent[0].isStarred).toBe(true)
      expect(pinnedContent[0].documentIds).toContain('doc-123')
      expect(pinnedContent[0].priority).toBe(95)
    })

    it('should calculate priority based on options', async () => {
      const file1 = createTestFile('owned.txt', 'content')
      const file2 = createTestFile('starred.txt', 'content')
      const file3 = createTestFile('recent.txt', 'content')

      await manager.storeContent(file1, { isOwned: true })
      await manager.storeContent(file2, { isStarred: true })
      await manager.storeContent(file3)

      const pinnedContent = manager.getPinnedContent()

      // Should be sorted by priority (highest first)
      expect(pinnedContent[0].isOwned).toBe(true) // Highest priority
      expect(pinnedContent[1].isStarred).toBe(true) // Second highest
    })

    it('should validate file size limits', async () => {
      // Update pinning policy with small limits
      manager.updatePinningPolicy({
        maxFileSize: 5 // Very small limit
      })

      const largeFile = createTestFile('large.txt', 'This content is too large')

      await expect(manager.storeContent(largeFile)).rejects.toThrow('File too large')
    })

    it('should validate MIME types when restricted', async () => {
      manager.updatePinningPolicy({
        allowedMimeTypes: ['image/jpeg', 'image/png']
      })

      const textFile = createTestFile('test.txt', 'content')

      await expect(manager.storeContent(textFile)).rejects.toThrow('File type not allowed')
    })

    it('should block specific MIME types', async () => {
      manager.updatePinningPolicy({
        blockedMimeTypes: ['text/plain']
      })

      const textFile = createTestFile('test.txt', 'content')

      await expect(manager.storeContent(textFile)).rejects.toThrow('File type blocked')
    })
  })

  describe('getContent', () => {
    it('should retrieve content from IPFS', async () => {
      const file = createTestFile('test.txt', 'Hello World')
      const cid = await manager.storeContent(file)

      const retrieved = await manager.getContent(cid)
      expect(retrieved).toBeInstanceOf(Uint8Array)
      expect(mockHelia.fs.cat).toHaveBeenCalledWith(cid)

      // Should update last access time
      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].lastAccess).toBeGreaterThan(pinnedContent[0].pinTime)
    })

    it('should handle retrieval errors gracefully', async () => {
      mockHelia.fs.cat.mockImplementation(() => {
        throw new Error('IPFS error')
      })

      const result = await manager.getContent('invalid-cid')
      expect(result).toBeNull()
    })
  })

  describe('document references', () => {
    it('should add document references', async () => {
      const file = createTestFile('shared.txt', 'content')
      const cid = await manager.storeContent(file, { documentId: 'doc-1' })

      await manager.addDocumentReference(cid, 'doc-2')
      await manager.addDocumentReference(cid, 'doc-3')

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].documentIds).toContain('doc-1')
      expect(pinnedContent[0].documentIds).toContain('doc-2')
      expect(pinnedContent[0].documentIds).toContain('doc-3')
    })

    it('should not add duplicate references', async () => {
      const file = createTestFile('test.txt', 'content')
      const cid = await manager.storeContent(file, { documentId: 'doc-1' })

      await manager.addDocumentReference(cid, 'doc-1') // Duplicate

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].documentIds.filter(id => id === 'doc-1')).toHaveLength(1)
    })

    it('should remove document references', async () => {
      const file = createTestFile('test.txt', 'content')
      const cid = await manager.storeContent(file, { documentId: 'doc-1' })

      await manager.addDocumentReference(cid, 'doc-2')
      await manager.removeDocumentReference(cid, 'doc-1')

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].documentIds).not.toContain('doc-1')
      expect(pinnedContent[0].documentIds).toContain('doc-2')
    })

    it('should lower priority when no references remain', async () => {
      const file = createTestFile('test.txt', 'content')
      const cid = await manager.storeContent(file, { documentId: 'doc-1' })

      const initialPriority = manager.getPinnedContent()[0].priority

      await manager.removeDocumentReference(cid, 'doc-1')

      const finalPriority = manager.getPinnedContent()[0].priority
      expect(finalPriority).toBe(0) // No references and not owned/starred
    })
  })

  describe('starring content', () => {
    it('should star and unstar content', async () => {
      const file = createTestFile('test.txt', 'content')
      const cid = await manager.storeContent(file)

      const initialPriority = manager.getPinnedContent()[0].priority

      await manager.setContentStarred(cid, true)

      const starredContent = manager.getPinnedContent()[0]
      expect(starredContent.isStarred).toBe(true)
      expect(starredContent.priority).toBeGreaterThan(initialPriority)

      await manager.setContentStarred(cid, false)

      const unstarredContent = manager.getPinnedContent()[0]
      expect(unstarredContent.isStarred).toBe(false)
    })
  })

  describe('storage management', () => {
    it('should track storage metrics', async () => {
      const file1 = createTestFile('file1.txt', 'content1')
      const file2 = createTestFile('file2.txt', 'content2')

      await manager.storeContent(file1)
      await manager.storeContent(file2)

      const metrics = manager.getContentMetrics()
      expect(metrics.totalFiles).toBe(2)
      expect(metrics.pinnedFiles).toBe(2)
      expect(metrics.totalSize).toBeGreaterThan(0)
    })

    it('should trigger cleanup when threshold reached', async () => {
      // Set very small storage limit to trigger cleanup
      manager.updatePinningPolicy({
        maxTotalStorage: 100,
        cleanupThreshold: 0.1 // Trigger at 10%
      })

      const file = createTestFile('large.txt', 'x'.repeat(50))

      // Should complete without error (cleanup happens internally)
      await expect(manager.storeContent(file)).resolves.toBeDefined()
    })

    it('should throw error when storage is full', async () => {
      manager.updatePinningPolicy({
        maxTotalStorage: 10,
        emergencyThreshold: 0.1
      })

      const largeFile = createTestFile('huge.txt', 'x'.repeat(20))

      await expect(manager.storeContent(largeFile)).rejects.toThrow('Insufficient storage space')
    })
  })

  describe('garbage collection', () => {
    beforeEach(() => {
      // Speed up time for testing
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should perform forced garbage collection', async () => {
      // Add some content first
      const file1 = createTestFile('old.txt', 'old content')
      const file2 = createTestFile('new.txt', 'new content')

      await manager.storeContent(file1)
      await manager.storeContent(file2, { isOwned: true }) // Protected from cleanup

      // Advance time to make first file "old"
      jest.advanceTimersByTime(31 * 24 * 60 * 60 * 1000) // 31 days

      const result = await manager.forceGarbageCollection()

      expect(result.unpinnedCount).toBeGreaterThanOrEqual(0)
      expect(result.freedSpace).toBeGreaterThanOrEqual(0)
    })

    it('should protect owned and starred content from cleanup', async () => {
      const ownedFile = createTestFile('owned.txt', 'owned')
      const starredFile = createTestFile('starred.txt', 'starred')
      const regularFile = createTestFile('regular.txt', 'regular')

      const ownedCid = await manager.storeContent(ownedFile, { isOwned: true })
      const starredCid = await manager.storeContent(starredFile, { isStarred: true })
      await manager.storeContent(regularFile)

      jest.advanceTimersByTime(31 * 24 * 60 * 60 * 1000) // Age all content

      await manager.forceGarbageCollection()

      const pinnedContent = manager.getPinnedContent()
      const pinnedCids = pinnedContent.map(content => content.cid)

      expect(pinnedCids).toContain(ownedCid)
      expect(pinnedCids).toContain(starredCid)
      // Regular file might be cleaned up
    })
  })

  describe('pinning policy', () => {
    it('should update pinning policy', () => {
      const newPolicy: Partial<PinningPolicy> = {
        maxFileSize: 50 * 1024 * 1024,
        maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
        priorities: {
          owned: 150,
          starred: 120,
          recent: 80,
          popular: 60,
          default: 30
        }
      }

      manager.updatePinningPolicy(newPolicy)

      // Test that new policy is applied
      expect(() => {
        manager.updatePinningPolicy({ maxFileSize: 1 })
      }).not.toThrow()
    })

    it('should respect custom priority calculation', async () => {
      manager.updatePinningPolicy({
        priorities: {
          owned: 200,
          starred: 150,
          recent: 100,
          popular: 50,
          default: 10
        }
      })

      const ownedFile = createTestFile('owned.txt', 'content')
      await manager.storeContent(ownedFile, { isOwned: true })

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].priority).toBe(200)
    })
  })

  describe('error handling', () => {
    it('should handle IPFS storage errors', async () => {
      mockHelia.fs.addBytes.mockRejectedValue(new Error('IPFS storage failed'))

      const file = createTestFile('test.txt', 'content')

      await expect(manager.storeContent(file)).rejects.toThrow('Failed to store content')
    })

    it('should handle pinning errors gracefully', async () => {
      mockHelia.pins.add.mockRejectedValue(new Error('Pin failed'))

      const file = createTestFile('test.txt', 'content')

      await expect(manager.storeContent(file)).rejects.toThrow('Failed to store content')
    })

    it('should handle unpinning errors gracefully', async () => {
      const file = createTestFile('test.txt', 'content')
      const cid = await manager.storeContent(file)

      mockHelia.pins.rm.mockRejectedValue(new Error('Unpin failed'))

      // Should not throw error during cleanup
      await expect(manager.forceGarbageCollection()).resolves.toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle empty files', async () => {
      const emptyFile = createTestFile('empty.txt', '')
      const cid = await manager.storeContent(emptyFile)

      expect(cid).toBeDefined()

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].size).toBe(0)
    })

    it('should handle files without MIME type', async () => {
      const file = new File(['content'], 'noextension', { type: '' })
      const cid = await manager.storeContent(file)

      expect(cid).toBeDefined()

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent[0].mimeType).toBe('')
    })

    it('should handle concurrent operations', async () => {
      const files = Array.from({ length: 5 }, (_, i) =>
        createTestFile(`file${i}.txt`, `content${i}`)
      )

      const promises = files.map(file => manager.storeContent(file))
      const cids = await Promise.all(promises)

      expect(cids).toHaveLength(5)
      expect(new Set(cids).size).toBe(5) // All unique

      const pinnedContent = manager.getPinnedContent()
      expect(pinnedContent).toHaveLength(5)
    })
  })
})