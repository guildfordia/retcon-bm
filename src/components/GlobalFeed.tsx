'use client'
import { useState, useEffect, useCallback } from 'react'
import { P2PCollectionSystem, CollectionAnnouncement, CollectionEntry } from '@/lib/p2p-collections'

interface EnhancedAnnouncement extends CollectionAnnouncement {
  online?: boolean
  cached?: boolean
  name?: string
  description?: string
  documentCount?: number
  timestamp: number
}

interface GlobalFeedProps {
  collectionSystem: P2PCollectionSystem | null
  currentUserPubKey?: string
}

export default function GlobalFeed({ collectionSystem, currentUserPubKey }: GlobalFeedProps) {
  const [discoveredCollections, setDiscoveredCollections] = useState<EnhancedAnnouncement[]>([])
  const [selectedCollection, setSelectedCollection] = useState<EnhancedAnnouncement | null>(null)
  const [collectionDocuments, setCollectionDocuments] = useState<CollectionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'online' | 'cached'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Poll for discovered collections
  useEffect(() => {
    if (!collectionSystem) return

    const updateCollections = () => {
      const collections = collectionSystem.getDiscoveredCollections()
      // Enhance announcements with additional properties
      const enhanced: EnhancedAnnouncement[] = collections.map(c => ({
        ...c,
        online: true, // Mark as online if recently received
        cached: false,
        name: c.collectionName,
        documentCount: c.count,
        timestamp: c.lastUpdated || Date.now()
      }))
      setDiscoveredCollections(enhanced)
    }

    // Initial load
    updateCollections()

    // Poll every 5 seconds for new announcements
    const interval = setInterval(updateCollections, 5000)

    return () => clearInterval(interval)
  }, [collectionSystem])

  // Load documents when a collection is selected
  const loadCollectionDocuments = useCallback(async (collection: EnhancedAnnouncement) => {
    if (!collectionSystem) return

    setLoading(true)
    setError(null)
    setSelectedCollection(collection)
    
    try {
      const docs = await collectionSystem.browseCollection(collection.ownerPubKey, collection.dbAddress)
      setCollectionDocuments(docs)
    } catch (err) {
      console.error('Error loading collection:', err)
      setError(`Failed to load collection: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setCollectionDocuments([])
    } finally {
      setLoading(false)
    }
  }, [collectionSystem])

  // Fork a document from another collection
  const handleForkDocument = async (doc: CollectionEntry) => {
    if (!collectionSystem || !currentUserPubKey) {
      alert('Please connect your P2P identity first')
      return
    }

    if (doc.authorPubKey === currentUserPubKey) {
      alert('Cannot fork your own document')
      return
    }

    if (!selectedCollection) {
      alert('No collection selected')
      return
    }

    try {
      setLoading(true)
      const forkedDoc = await collectionSystem.forkDocument(
        doc,
        selectedCollection.ownerPubKey,
        selectedCollection.dbAddress
      )
      alert(`Successfully forked document: ${forkedDoc.title}`)
    } catch (err) {
      console.error('Error forking document:', err)
      alert(`Failed to fork document: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // Pin a P2P document from the global feed
  const handlePinDocument = async (doc: CollectionEntry) => {
    if (!currentUserPubKey) {
      alert('Please connect your P2P identity first')
      return
    }

    if (!selectedCollection) {
      alert('No collection selected')
      return
    }

    try {
      const response = await fetch('/api/documents/p2p-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: currentUserPubKey,
          documentId: doc.docId,
          ipfsHash: doc.cid,
          sourceCollectionId: selectedCollection.dbAddress,
          documentData: {
            title: doc.title,
            description: doc.description || `P2P document from ${selectedCollection.name || 'collection'}: ${doc.title}`
          }
        })
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Document "${doc.title}" pinned successfully!`)
        console.log('Pin created:', data)
      } else {
        const error = await response.json()
        alert('Pin failed: ' + error.error)
      }
    } catch (error) {
      console.error('Pin error:', error)
      alert('Pin failed: ' + (error as Error).message)
    }
  }

  // Filter collections based on filter and search
  const filteredCollections = discoveredCollections.filter(collection => {
    // Apply status filter
    if (filter === 'online' && !collection.online) return false
    if (filter === 'cached' && !collection.cached) return false
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesKey = collection.ownerPubKey.toLowerCase().includes(query)
      const matchesName = collection.name?.toLowerCase().includes(query)
      const matchesDescription = collection.description?.toLowerCase().includes(query)
      
      if (!matchesKey && !matchesName && !matchesDescription) return false
    }
    
    return true
  })

  // Get status badge for collection
  const getStatusBadge = (collection: EnhancedAnnouncement) => {
    if (collection.online) {
      return (
        <span className="px-2 py-1 text-xs border border-gray-900 dark:border-gray-100 bg-white dark:bg-black text-gray-900 dark:text-gray-100">
          Online
        </span>
      )
    } else if (collection.cached) {
      return (
        <span className="px-2 py-1 text-xs border border-gray-600 dark:border-gray-400 bg-white dark:bg-black text-gray-600 dark:text-gray-400">
          Cached
        </span>
      )
    } else {
      return (
        <span className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-black text-gray-500 dark:text-gray-500">
          Offline
        </span>
      )
    }
  }

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = Date.now()
    const diff = now - timestamp
    
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  if (!collectionSystem) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">P2P system not initialized</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header and filters */}
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Global Feed</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filteredCollections.length} collection{filteredCollections.length !== 1 ? 's' : ''} discovered
          </span>
        </div>

        {/* Search and filter controls */}
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Search collections by key, name, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
          />

          <div className="flex bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600">
            {(['all', 'online', 'cached'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-black'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collections list */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Discovered Collections</h3>
          
          {filteredCollections.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'No collections match your search' : 'No collections discovered yet'}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Collections will appear here as peers announce them
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCollections.map(collection => (
                <div
                  key={collection.ownerPubKey}
                  onClick={() => loadCollectionDocuments(collection)}
                  className={`bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-4 cursor-pointer hover:border-gray-900 dark:hover:border-gray-100 transition-colors ${
                    selectedCollection?.ownerPubKey === collection.ownerPubKey ? 'border-gray-900 dark:border-gray-100' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {collection.name || `Collection ${collection.ownerPubKey.slice(0, 8)}...`}
                      </p>
                      {collection.ownerPubKey === currentUserPubKey && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">(You)</span>
                      )}
                    </div>
                    {getStatusBadge(collection)}
                  </div>
                  
                  {collection.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                      {collection.description}
                    </p>
                  )}
                  
                  <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>{collection.documentCount} document{collection.documentCount !== 1 ? 's' : ''}</span>
                    <span>{formatTime(collection.timestamp)}</span>
                  </div>
                  
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                      {collection.ownerPubKey}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents view */}
        <div className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Collection Documents</h3>
          
          {!selectedCollection ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Select a collection to view its documents
              </p>
            </div>
          ) : loading ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-12 flex justify-center">
              <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          ) : error ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-900 dark:border-gray-100 p-6">
              <p className="text-gray-900 dark:text-gray-100">{error}</p>
            </div>
          ) : collectionDocuments.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No documents in this collection
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {collectionDocuments.map(doc => (
                <div
                  key={doc.docId}
                  className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-100 transition-colors p-6"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {doc.title}
                      </h4>
                      {doc.origin && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Forked from {doc.origin.originOwnerPubKey.slice(0, 8)}...
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.type === 'TOMBSTONE' && (
                        <span className="px-2 py-1 text-xs border border-gray-900 dark:border-gray-100 bg-white dark:bg-black text-gray-900 dark:text-gray-100">
                          Deleted
                        </span>
                      )}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        v{doc.version}
                      </span>
                    </div>
                  </div>
                  
                  {doc.description && (
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                      {doc.description}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
                    <span>{doc.filename}</span>
                    <span>{doc.mimeType}</span>
                    <span>{(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                    <span>{new Date(doc.timestamp).toLocaleDateString()}</span>
                  </div>
                  
                  {doc.type !== 'TOMBSTONE' && doc.authorPubKey !== currentUserPubKey && (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handlePinDocument(doc)}
                        disabled={loading}
                        className="px-4 py-2 bg-white dark:bg-black border border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-900 hover:text-white dark:hover:bg-gray-100 dark:hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Pin Document
                      </button>
                      <button
                        onClick={() => handleForkDocument(doc)}
                        disabled={loading}
                        className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Fork Document
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}