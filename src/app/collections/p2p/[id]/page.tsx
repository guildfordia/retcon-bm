'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import P2PDocumentsApi from '@/components/P2PDocumentsApi'
import PinnedDocuments from '@/components/PinnedDocuments'

interface P2PCollection {
  id: string
  name: string
  description: string
  orbitAddress: string
  storeName?: string
  peerId: string
  accessType?: string
  created: number
  lastSync: number
  peers: string[]
  documentCount: number
}

export default function P2PCollectionDetail() {
  const params = useParams()
  const router = useRouter()
  const [collection, setCollection] = useState<P2PCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  // Extract the actual collection ID and decode URL encoding
  const rawId = params.id as string
  console.log('Raw params.id:', rawId)
  const collectionId = decodeURIComponent(rawId)
  console.log('Decoded collectionId:', collectionId)

  useEffect(() => {
    if (collectionId) {
      fetchCollectionDetails()
    }
  }, [collectionId])

  const fetchCollectionDetails = async () => {
    try {
      // Get user ID from localStorage
      const user = localStorage.getItem('userId')
      if (user) {
        setUserId(user)
      }

      // Fetch the specific P2P collection from the dedicated endpoint
      const apiUrl = `/api/collections/p2p/${encodeURIComponent(collectionId)}`
      console.log('Fetching from API URL:', apiUrl)
      const response = await fetch(apiUrl)

      if (response.ok) {
        const data = await response.json()
        setCollection(data.collection)
      } else {
        console.error('Collection not found:', collectionId)
        setCollection(null)
      }
    } catch (error) {
      console.error('Error fetching P2P collection details:', error)
      setCollection(null)
    } finally {
      setLoading(false)
    }
  }

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/collections/p2p/${collection?.id}`
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading P2P collection...</p>
        </div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">P2P Collection not found</h2>
          <button
            onClick={() => router.push('/collections')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Collections
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Collection Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6 border-l-4 border-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center mb-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3 animate-pulse"></div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {collection.name}
                </h1>
              </div>
              {collection.description && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">{collection.description}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
                <div>
                  <p><strong>OrbitDB Address:</strong></p>
                  <code className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded block mt-1">
                    {collection.orbitAddress}
                  </code>
                </div>
                <div>
                  <p><strong>Peer ID:</strong> {collection.peerId.slice(0, 12)}...</p>
                  <p><strong>Connected Peers:</strong> {collection.peers.length}</p>
                  <p><strong>Created:</strong> {formatDate(collection.created)}</p>
                  <p><strong>Last Sync:</strong> {formatDate(collection.lastSync)}</p>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Share P2P
              </button>
              <button
                onClick={() => router.push('/collections')}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Back
              </button>
            </div>
          </div>
        </div>

        {/* P2P Network Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="h-3 w-3 rounded-full mr-2 bg-green-500 animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                P2P Network: Connected
              </span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
              <span>OrbitDB Active</span>
              <span>IPFS Gateway</span>
              <span>{collection.peers.length} Peers</span>
            </div>
          </div>
        </div>

        {/* P2P Documents */}
        <div className="mb-6">
          <P2PDocumentsApi collectionId={collection.id} />
        </div>

        {/* Pinned Documents - Show P2P pinned documents for this user */}
        {userId && (
          <div className="mb-6">
            <PinnedDocuments
              userId={userId}
              collectionId={collection.id}
              mode="p2p"
            />
          </div>
        )}
      </div>
    </div>
  )
}