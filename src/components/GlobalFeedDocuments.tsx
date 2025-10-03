'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import DocumentEditModal from './DocumentEditModal'
import DocumentVersionBrowser from './DocumentVersionBrowser'
import ForkTreeView from './ForkTreeView'

interface P2PDocument {
  id: string
  documentType: 'quote' | 'link' | 'image'
  title: string
  description?: string
  filename?: string
  ipfsHash?: string // Legacy field
  ipfsCID?: string // New IPFS field
  contentType?: string
  contentSize?: number
  size?: number
  mimeType?: string
  collectionId: string
  uploadedBy: string
  created: number
  lastAccessed: number
  replicas: string[]
  pinned: boolean
  metadata?: any
  version?: number
  versionHistory?: Array<{
    version: number
    editedBy: string
    editedAt: number
    changeComment: string
    previousMetadata: any
  }>
  // Fork relationships
  parentDocumentId?: string // ID of the document this was forked from
  childDocumentIds?: string[] // IDs of documents forked from this one
  // Collection metadata
  addedBy?: string // User who added this to their collection
  collectionFrom?: string[] // Array of collection IDs this document appears in
}

interface FeedItem {
  document: P2PDocument
  collectionName: string
  collectionId: string
  ownerUsername: string
  ownerDid: string
}

interface GlobalFeedDocumentsProps {
  filters: {
    types: string[]
    keywords: string[]
    title: string
  }
}

export default function GlobalFeedDocuments({ filters }: GlobalFeedDocumentsProps) {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [totalResults, setTotalResults] = useState(0)
  const [selectedDocument, setSelectedDocument] = useState<FeedItem | null>(null)
  const [editingDocument, setEditingDocument] = useState<FeedItem | null>(null)
  const [viewingHistory, setViewingHistory] = useState<FeedItem | null>(null)
  const [viewingForkTree, setViewingForkTree] = useState<FeedItem | null>(null)

  // IPFS content cache: documentId -> content (base64 for images, text for quotes/links)
  const [ipfsContent, setIpfsContent] = useState<Record<string, string>>({})

  const observerTarget = useRef<HTMLDivElement>(null)

  const limit = 20

  // Helper function to fetch content from IPFS
  const fetchIPFSContent = useCallback(async (cid: string, contentType: string, documentId: string) => {
    try {
      // Check if already cached
      if (ipfsContent[documentId]) {
        return ipfsContent[documentId]
      }

      // Use relative URL to go through nginx proxy
      const baseUrl = '/orbitdb'

      // For images, get base64
      if (contentType?.startsWith('image/')) {
        const response = await fetch(`${baseUrl}/ipfs/retrieve-base64/${cid}?contentType=${encodeURIComponent(contentType)}`)
        if (!response.ok) throw new Error('Failed to fetch image from IPFS')
        const data = await response.json()
        const dataUrl = `data:${contentType};base64,${data.base64}`

        // Cache it
        setIpfsContent(prev => ({ ...prev, [documentId]: dataUrl }))
        return dataUrl
      } else {
        // For text (quotes/links), get plain text
        const response = await fetch(`${baseUrl}/ipfs/retrieve/${cid}?contentType=text/plain`)
        if (!response.ok) throw new Error('Failed to fetch text from IPFS')
        const text = await response.text()

        // Cache it
        setIpfsContent(prev => ({ ...prev, [documentId]: text }))
        return text
      }
    } catch (error) {
      console.error('Error fetching IPFS content:', error)
      return null
    }
  }, [ipfsContent])

  // Fetch feed items
  const fetchFeedItems = useCallback(async (currentOffset: number, append = false) => {
    try {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }

      // Build query params
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString()
      })

      // Check if we have any active filters
      const hasFilters = filters.title || filters.keywords.length > 0 || filters.types.length > 0

      // Add search filters if active
      if (hasFilters) {
        if (filters.title) params.append('title', filters.title)
        if (filters.keywords.length > 0) params.append('keywords', filters.keywords.join(','))
        if (filters.types.length > 0) params.append('type', filters.types.join(','))
      }

      // Use search API if filters are active, otherwise use regular feed API
      const endpoint = hasFilters ? '/api/feed/search' : '/api/feed'
      const response = await fetch(`${endpoint}?${params}`)
      if (!response.ok) throw new Error('Failed to fetch feed')

      const data = await response.json()

      // Handle different response formats
      const items = data.items || data.documents || []
      const total = data.total !== undefined ? data.total : items.length

      if (append) {
        setFeedItems(prev => [...prev, ...items])
      } else {
        setFeedItems(items)
      }

      setHasMore(data.hasMore)
      setTotalResults(total)
      setOffset(currentOffset)
    } catch (error) {
      console.error('Error fetching feed:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filters])

  // Trigger search when filters change
  useEffect(() => {
    fetchFeedItems(0)
  }, [filters.types.join(','), filters.keywords.join(','), filters.title, fetchFeedItems])

  // Fetch IPFS content for all documents when feed items change
  useEffect(() => {
    feedItems.forEach(item => {
      const doc = item.document
      if (doc.ipfsCID && doc.contentType && !ipfsContent[doc.id]) {
        // Fetch content asynchronously
        fetchIPFSContent(doc.ipfsCID, doc.contentType, doc.id)
      }
    })
  }, [feedItems, fetchIPFSContent, ipfsContent])

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchFeedItems(offset + limit, true)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, loadingMore, loading, offset, fetchFeedItems])

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
    return date.toLocaleDateString()
  }

  const handleEditDocument = (item: FeedItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingDocument(item)
  }

  const handleForkDocument = async (item: FeedItem) => {
    const userId = localStorage.getItem('userId')
    if (!userId) {
      alert('You must be logged in to fork a document')
      return
    }

    try {
      // Call the fork API endpoint
      const response = await fetch('/api/documents/p2p/fork', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          originalDocumentId: item.document.id,
          originalCollectionId: item.collectionId,
          peerId: userId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fork document')
      }

      const result = await response.json()

      // Close the detail modal
      setSelectedDocument(null)

      // Create a FeedItem for the forked document to edit
      const forkedItem: FeedItem = {
        document: result.forkedDocument,
        collectionName: result.collectionName,
        collectionId: result.collectionId,
        ownerUsername: result.ownerUsername,
        ownerDid: userId
      }

      // Open edit modal with the forked document
      setEditingDocument(forkedItem)

    } catch (error) {
      console.error('Error forking document:', error)
      alert(error instanceof Error ? error.message : 'Failed to fork document')
    }
  }

  const handleAddToCollection = async (item: FeedItem) => {
    const userId = localStorage.getItem('userId')
    if (!userId) {
      alert('You must be logged in to add to your collection')
      return
    }

    try {
      const response = await fetch('/api/documents/p2p/collection/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          originalDocumentId: item.document.id,
          originalCollectionId: item.collectionId,
          peerId: userId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add document to collection')
      }

      alert('Document added to your collection!')
      setSelectedDocument(null)

    } catch (error) {
      console.error('Error adding to collection:', error)
      alert(error instanceof Error ? error.message : 'Failed to add document to collection')
    }
  }

  const handleSaveEdit = async (updatedMetadata: any, changeComment: string) => {
    if (!editingDocument) return

    const userId = localStorage.getItem('userId')
    if (!userId) {
      throw new Error('User not authenticated')
    }

    const response = await fetch('/api/documents/p2p/edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId: editingDocument.document.id,
        collectionId: editingDocument.collectionId,
        peerId: userId,
        updatedMetadata,
        changeComment,
        documentType: editingDocument.document.documentType
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update document')
    }

    // Refresh the feed to show updated document
    await fetchFeedItems(0)
    setEditingDocument(null)
  }

  const hasActiveFilters = filters.title || filters.keywords.length > 0 || filters.types.length > 0

  return (
    <>
      {/* Show loading indicator when searching (without blocking the view) */}
      {loading && feedItems.length > 0 && (
        <div className="mb-4 text-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">Searching...</span>
        </div>
      )}

      {/* Initial loading state - only when we have no items at all */}
      {loading && feedItems.length === 0 && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
        </div>
      )}

      {/* No results message */}
      {!loading && feedItems.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-8 text-center">
          {hasActiveFilters ? (
            <>
              <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">No results found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Try adjusting your filters or search terms
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-500 dark:text-gray-400">No documents in the global feed yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Documents will appear here as users create them
              </p>
            </>
          )}
        </div>
      )}

      {/* Feed items grid - show items even while loading new results */}
      {feedItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {feedItems.map((item, index) => (
          <div
            key={`${item.document.id}-${index}`}
            onClick={() => setSelectedDocument(item)}
            className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-100 transition-colors p-6 cursor-pointer"
          >
            {/* Document content based on type */}
            {item.document.documentType === 'quote' && (
              <div>
                <div className="text-4xl mb-3">📝</div>
                <blockquote className="italic text-gray-700 dark:text-gray-300 mb-3 line-clamp-3">
                  "{item.document.metadata?.quoteContent}"
                </blockquote>
                <p className="font-medium text-gray-900 dark:text-white mb-1">
                  — {item.document.metadata?.author}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {item.document.title}
                </p>
              </div>
            )}

            {item.document.documentType === 'link' && (
              <div>
                <div className="text-4xl mb-3">🔗</div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                  {item.document.title}
                </h3>
                {item.document.metadata?.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                    {item.document.metadata.description}
                  </p>
                )}
                <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                  {item.document.metadata?.url}
                </p>
              </div>
            )}

            {item.document.documentType === 'image' && (
              <div>
                <div className="text-4xl mb-3">🖼️</div>
                {ipfsContent[item.document.id] ? (
                  <img
                    src={ipfsContent[item.document.id]}
                    alt={item.document.title}
                    className="w-full h-40 object-cover mb-3 rounded"
                  />
                ) : (
                  <div className="bg-gray-100 dark:bg-gray-800 h-40 flex items-center justify-center mb-3 text-gray-400 dark:text-gray-500">
                    Loading image...
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">
                  {item.document.title}
                </h3>
                {(item.document.mimeType || item.document.contentType) && (item.document.size || item.document.contentSize) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.document.mimeType || item.document.contentType} • {formatFileSize(item.document.size || item.document.contentSize || 0)}
                  </p>
                )}
              </div>
            )}

            {/* Collection and user info */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {item.ownerUsername}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {item.collectionName}
                  </p>
                </div>
                <p>{formatDate(item.document.created)}</p>
              </div>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        </div>
      )}

      {/* Intersection observer target */}
      {hasMore && <div ref={observerTarget} className="h-4" />}

      {/* End of feed message */}
      {!hasMore && feedItems.length > 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          You've reached the end of the feed
        </div>
      )}

      {/* Detail Modal */}
      {selectedDocument && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedDocument(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-gray-900 dark:border-gray-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {selectedDocument.document.title}
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedDocument.ownerUsername}
                    </span>
                    <span>•</span>
                    <span>{selectedDocument.collectionName}</span>
                    <span>•</span>
                    <span>{formatDate(selectedDocument.document.created)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectedDocument.document.versionHistory && selectedDocument.document.versionHistory.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewingHistory(selectedDocument)
                        setSelectedDocument(null)
                      }}
                      className="px-4 py-2 border border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                    >
                      View History
                    </button>
                  )}
                  {(selectedDocument.document.parentDocumentId || (selectedDocument.document.childDocumentIds && selectedDocument.document.childDocumentIds.length > 0)) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewingForkTree(selectedDocument)
                        setSelectedDocument(null)
                      }}
                      className="px-4 py-2 border border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                    >
                      View Fork Tree
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddToCollection(selectedDocument)
                    }}
                    className="px-4 py-2 border border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                  >
                    Add to Collection
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleForkDocument(selectedDocument)
                    }}
                    className="px-4 py-2 border border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                  >
                    Fork
                  </button>
                  <button
                    onClick={(e) => {
                      handleEditDocument(selectedDocument, e)
                      setSelectedDocument(null)
                    }}
                    className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setSelectedDocument(null)}
                    className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Content based on type */}
              {selectedDocument.document.documentType === 'quote' && selectedDocument.document.metadata && (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-800 p-6 border-l-4 border-gray-900 dark:border-gray-100">
                    <blockquote className="text-lg italic text-gray-700 dark:text-gray-300 mb-4">
                      "{selectedDocument.document.metadata.quoteContent}"
                    </blockquote>
                    <p className="font-medium text-gray-900 dark:text-white">
                      — {selectedDocument.document.metadata.author}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {selectedDocument.document.metadata.title && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Source: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.title}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata.publisher && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Publisher: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.publisher}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata.year && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Year: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.year}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata.isbn && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">ISBN: </span>
                        <span className="text-gray-900 dark:text-white font-mono text-sm">{selectedDocument.document.metadata.isbn}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata.pageNumbers && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Pages: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.pageNumbers}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata.keywords && selectedDocument.document.metadata.keywords.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Keywords: </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedDocument.document.metadata.keywords.map((keyword: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedDocument.document.documentType === 'link' && selectedDocument.document.metadata && (
                <div className="space-y-4">
                  {selectedDocument.document.metadata.description && (
                    <p className="text-gray-700 dark:text-gray-300">
                      {selectedDocument.document.metadata.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">URL: </span>
                      <a
                        href={selectedDocument.document.metadata.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                      >
                        {selectedDocument.document.metadata.url}
                      </a>
                    </div>
                    {selectedDocument.document.metadata.author && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Author: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.author}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata.siteName && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Site: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.siteName}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata.keywords && selectedDocument.document.metadata.keywords.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Keywords: </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedDocument.document.metadata.keywords.map((keyword: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedDocument.document.documentType === 'image' && (
                <div className="space-y-4">
                  {ipfsContent[selectedDocument.document.id] ? (
                    <img
                      src={ipfsContent[selectedDocument.document.id]}
                      alt={selectedDocument.document.title}
                      className="w-full h-auto max-h-[500px] object-contain bg-gray-100 dark:bg-gray-800"
                    />
                  ) : (
                    <div className="bg-gray-100 dark:bg-gray-800 h-64 flex items-center justify-center text-gray-400 dark:text-gray-500">
                      Loading image...
                    </div>
                  )}

                  {selectedDocument.document.description && (
                    <p className="text-gray-700 dark:text-gray-300">
                      {selectedDocument.document.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    {(selectedDocument.document.ipfsCID || selectedDocument.document.ipfsHash) && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">IPFS CID: </span>
                        <span className="text-gray-900 dark:text-white font-mono text-sm break-all">
                          {selectedDocument.document.ipfsCID || selectedDocument.document.ipfsHash}
                        </span>
                      </div>
                    )}
                    {selectedDocument.document.filename && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Filename: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.filename}</span>
                      </div>
                    )}
                    {selectedDocument.document.size && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Size: </span>
                        <span className="text-gray-900 dark:text-white">{formatFileSize(selectedDocument.document.size)}</span>
                      </div>
                    )}
                    {selectedDocument.document.mimeType && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Type: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.mimeType}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata?.creator && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Creator: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.creator}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata?.source && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Source: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.source}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata?.date && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Date: </span>
                        <span className="text-gray-900 dark:text-white">{selectedDocument.document.metadata.date}</span>
                      </div>
                    )}
                    {selectedDocument.document.metadata?.keywords && selectedDocument.document.metadata.keywords.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Keywords: </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedDocument.document.metadata.keywords.map((keyword: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Common metadata */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Created: </span>
                  <span className="text-gray-900 dark:text-white">
                    {new Date(selectedDocument.document.created).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Version: </span>
                  <span className="text-gray-900 dark:text-white">{selectedDocument.document.version || 1}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Replicas: </span>
                  <span className="text-gray-900 dark:text-white">{selectedDocument.document.replicas.length}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Pinned: </span>
                  <span className="text-gray-900 dark:text-white">{selectedDocument.document.pinned ? 'Yes' : 'No'}</span>
                </div>
              </div>

              {/* Version History */}
              {selectedDocument.document.versionHistory && selectedDocument.document.versionHistory.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Version History</h3>
                  <div className="space-y-4">
                    {selectedDocument.document.versionHistory.map((version, index) => (
                      <div key={index} className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-gray-900 dark:text-white">Version {version.version}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(version.editedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          <span className="font-medium">Edited by:</span> {version.editedBy}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="font-medium">Comment:</span> {version.changeComment}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingDocument && (
        <DocumentEditModal
          document={editingDocument.document}
          onClose={() => setEditingDocument(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Version Browser */}
      {viewingHistory && (
        <DocumentVersionBrowser
          document={viewingHistory.document}
          onClose={() => setViewingHistory(null)}
        />
      )}

      {/* Fork Tree View */}
      {viewingForkTree && (
        <ForkTreeView
          documentId={viewingForkTree.document.id}
          collectionId={viewingForkTree.collectionId}
          onClose={() => setViewingForkTree(null)}
          onNodeClick={(docId) => {
            // Optionally navigate to the clicked document
            console.log('Clicked document:', docId)
          }}
        />
      )}
    </>
  )
}
