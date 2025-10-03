'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useP2P } from '@/contexts/P2PContext'
import P2PDocumentsApi from '@/components/P2PDocumentsApi'
import PinnedDocuments from '@/components/PinnedDocuments'

interface P2PCollection {
  id: string
  name: string
  description: string
  orbitAddress: string
  storeName?: string
  peerId: string
  username: string
  accessType?: string
  created: number
  lastSync: number
  peers: string[]
  documentCount: number
}

function CollectionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { onlineUsers } = useP2P()
  const [p2pCollections, setP2pCollections] = useState<P2PCollection[]>([])
  const [selectedCollection, setSelectedCollection] = useState<P2PCollection | null>(null)
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState<'all' | 'mine'>('mine')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [userHasCollection, setUserHasCollection] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/auth')
      return
    }

    const user = localStorage.getItem('userId')
    if (user) {
      setUserId(user)
    }
    fetchP2PCollections()
  }, [filter])

  // Handle URL-based collection opening
  useEffect(() => {
    const collectionId = searchParams.get('id')
    if (collectionId && p2pCollections.length > 0) {
      const collection = p2pCollections.find(c => c.id === decodeURIComponent(collectionId))
      if (collection) {
        setSelectedCollection(collection)
      }
    }
  }, [searchParams, p2pCollections])

  const fetchP2PCollections = async () => {
    try {
      setLoading(true)
      const userId = localStorage.getItem('userId')
      let url = '/api/collections/p2p'

      if (filter === 'mine' && userId) {
        url += `?peerId=${userId}`
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setP2pCollections(data.collections || [])

        if (userId) {
          const userP2PCollections = data.collections.filter((c: P2PCollection) => c.peerId === userId)
          setUserHasCollection(userP2PCollections.length > 0)
        }
      }
    } catch (error) {
      console.error('Error fetching P2P collections:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCollection = async (name: string, description: string) => {
    try {
      const userId = localStorage.getItem('userId')
      const response = await fetch('/api/collections/p2p', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          description,
          peerId: userId || `peer-${Date.now()}`,
          accessType: 'public'
        })
      })

      if (response.ok) {
        setShowCreateModal(false)
        fetchP2PCollections()
      }
    } catch (error) {
      console.error('Error creating collection:', error)
    }
  }

  const openCollection = (collection: P2PCollection) => {
    setSelectedCollection(collection)
    // Update URL without navigation
    window.history.pushState({}, '', `/collections?id=${encodeURIComponent(collection.id)}`)
  }

  const closeCollection = () => {
    setSelectedCollection(null)
    // Reset URL
    window.history.pushState({}, '', '/collections')
  }

  const handleShare = () => {
    if (!selectedCollection) return
    const shareUrl = `${window.location.origin}/collections?id=${encodeURIComponent(selectedCollection.id)}`
    navigator.clipboard.writeText(shareUrl)
    alert('P2P Collection link copied to clipboard!')
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const P2PCollectionCard = ({ collection }: { collection: P2PCollection }) => (
    <div
      className="bg-white dark:bg-gray-900 border-l-4 border-gray-900 dark:border-gray-100 border-t border-r border-b border-gray-300 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-100 transition-colors cursor-pointer p-6"
      onClick={() => openCollection(collection)}
    >
      <div className="mb-4 flex items-center">
        <div className="w-2 h-2 bg-gray-600 dark:bg-gray-400 mr-2"></div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{collection.name}</h3>
      </div>

      {collection.description && (
        <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{collection.description}</p>
      )}

      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        <div className="mb-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">Created by:</span>{' '}
          <span className="text-gray-900 dark:text-white">{collection.username}</span>
        </div>
        <div className="truncate">OrbitDB: {collection.orbitAddress}</div>
        <div>Peer: {collection.peerId.slice(0, 12)}...</div>
      </div>

      <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
        <span>{collection.documentCount} documents</span>
        <div className="flex items-center space-x-2">
          <span>{collection.peers.length} peers</span>
          <div className="w-2 h-2 bg-gray-600 dark:bg-gray-400" title="P2P Active"></div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Collections</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Decentralized P2P Collections
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-4 py-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                P2P Mode
              </span>
            </div>
            <div className="flex bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700">
              {(['all', 'mine'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filter === f
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-black'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {f === 'all' ? 'All Collections' : 'My Collections'}
                </button>
              ))}
            </div>

            <div className="flex bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700">
              <button
                onClick={() => setView('grid')}
                className={`p-2 ${view === 'grid' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-2 ${view === 'list' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {!userHasCollection && userId ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-gray-900 dark:bg-gray-100 text-white dark:text-black px-4 py-2 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
              >
                New P2P Collection
              </button>
            ) : userId ? (
              <div className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm">
                You have your collection
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
          </div>
        ) : p2pCollections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No P2P collections found
            </p>
          </div>
        ) : (
          <div className={view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {p2pCollections.map(collection => (
              view === 'grid' ? (
                <P2PCollectionCard key={collection.id} collection={collection} />
              ) : (
                <div
                  key={collection.id}
                  className="bg-white dark:bg-gray-900 border-l-4 border-gray-900 dark:border-gray-100 border-t border-r border-b border-gray-300 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-100 transition-colors cursor-pointer p-4"
                  onClick={() => openCollection(collection)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center mb-1">
                        <div className="w-2 h-2 bg-gray-600 dark:bg-gray-400 mr-2"></div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{collection.name}</h3>
                      </div>
                      {collection.description && (
                        <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">{collection.description}</p>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <div className="mb-1">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Created by:</span>{' '}
                          <span className="text-gray-900 dark:text-white">{collection.username}</span>
                        </div>
                        <div>OrbitDB: {collection.orbitAddress}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {collection.documentCount} documents
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {collection.peers.length} peers
                      </span>
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* Collection Detail Overlay */}
      {selectedCollection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="min-h-screen bg-white dark:bg-black">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Close button in top-right corner */}
              <button
                onClick={closeCollection}
                className="fixed top-4 right-4 z-50 text-gray-900 dark:text-gray-100 hover:opacity-70 transition-opacity"
                aria-label="Close"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Collection Header */}
              <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center mb-2">
                      <div className="w-3 h-3 bg-gray-600 dark:bg-gray-400 mr-3"></div>
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        {selectedCollection.name}
                      </h1>
                    </div>
                    {selectedCollection.description && (
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{selectedCollection.description}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <div>
                        <p><strong>OrbitDB Address:</strong></p>
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 block mt-1 font-mono">
                          {selectedCollection.orbitAddress}
                        </code>
                      </div>
                      <div>
                        <p><strong>Created by:</strong> <span className="text-gray-900 dark:text-white">{selectedCollection.username}</span></p>
                        <p><strong>Peer ID:</strong> {selectedCollection.peerId.slice(0, 12)}...</p>
                        <p><strong>Connected Peers:</strong> {selectedCollection.peers.length}</p>
                        <p><strong>Created:</strong> {formatDate(selectedCollection.created)}</p>
                        <p><strong>Last Sync:</strong> {formatDate(selectedCollection.lastSync)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={handleShare}
                      className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300"
                    >
                      Share
                    </button>
                  </div>
                </div>
              </div>

              {/* P2P Network Status */}
              <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-3 w-3 mr-2 bg-gray-600 dark:bg-gray-400"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      P2P Network: Connected
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>OrbitDB Active</span>
                    <span>IPFS Gateway</span>
                    <span>{selectedCollection.peers.length} Peers</span>
                  </div>
                </div>
              </div>

              {/* P2P Documents */}
              <div className="mb-6">
                <P2PDocumentsApi collectionId={selectedCollection.id} />
              </div>

              {/* Pinned Documents - Hidden */}
              {/* {userId && (
                <div className="mb-6">
                  <PinnedDocuments
                    userId={userId}
                    collectionId={selectedCollection.id}
                    mode="p2p"
                  />
                </div>
              )} */}
            </div>
          </div>
        </div>
      )}

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-black border border-gray-300 dark:border-gray-700 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              Create New P2P Collection
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This collection will be stored on OrbitDB and synchronized across P2P peers
            </p>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              handleCreateCollection(
                formData.get('name') as string,
                formData.get('description') as string
              )
            }}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Collections() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
      </div>
    }>
      <CollectionsContent />
    </Suspense>
  )
}
