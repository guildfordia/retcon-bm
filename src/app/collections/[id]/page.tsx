'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useP2P } from '@/contexts/P2PContext'
import P2PDocuments from '@/components/P2PDocuments'
import PinnedDocuments from '@/components/PinnedDocuments'

interface Collection {
  id: string
  name: string
  description?: string
  created_by: string
  creator_username?: string
  created_at: string
  updated_at?: string
  document_count?: number
}

export default function CollectionDetail() {
  const params = useParams()
  const router = useRouter()
  const { initializeP2P, isConnected, collectionSystem } = useP2P()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [isMainCollection, setIsMainCollection] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchCollectionDetails()
    }
  }, [params.id])

  const fetchCollectionDetails = async () => {
    try {
      const token = localStorage.getItem('token')
      const user = localStorage.getItem('userId')
      
      if (!token || !user) {
        router.push('/auth')
        return
      }
      
      setUserId(user)
      
      // Check if this is the special "main" collection
      if (params.id === 'main') {
        setIsMainCollection(true)
        // Create a virtual collection object for the user's main collection
        setCollection({
          id: 'main',
          name: 'My Main Collection',
          description: 'Your primary document collection',
          created_by: user,
          creator_username: localStorage.getItem('userEmail')?.split('@')[0] || 'You',
          created_at: new Date().toISOString(),
          document_count: 0
        })
      } else {
        const headers: HeadersInit = {
          'Authorization': `Bearer ${token}`
        }

        const collectionRes = await fetch(`/api/collections/${params.id}`, { headers })

        if (collectionRes.ok) {
          const collectionData = await collectionRes.json()
          setCollection(collectionData.collection)
        }
      }
      
      // Initialize P2P if not already done
      if (!isConnected) {
        await initializeP2P(user)
      }
    } catch (error) {
      console.error('Error fetching collection details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/collections/${collection?.id}`
    navigator.clipboard.writeText(shareUrl)
    alert('Collection link copied to clipboard!')
  }

  const handleDelete = async () => {
    // Can't delete the main collection
    if (isMainCollection) {
      alert('Cannot delete your main collection')
      return
    }
    
    if (!confirm('Are you sure you want to delete this collection?')) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/collections/${params.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      })

      if (response.ok) {
        router.push('/collections')
      }
    } catch (error) {
      console.error('Error deleting collection:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading collection...</p>
        </div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Collection not found</h2>
          <button
            onClick={() => router.push('/collections')}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300"
          >
            Back to Collections
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Collection Header */}
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {collection.name}
              </h1>
              {collection.description && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">{collection.description}</p>
              )}
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>Created by: {collection.creator_username || 'Unknown'}</span>
                <span>•</span>
                <span>{new Date(collection.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300"
              >
                Share
              </button>
              <button
                onClick={() => router.push('/collections')}
                className="px-4 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-900"
              >
                Back
              </button>
              {userId === collection.created_by && !isMainCollection && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* P2P Status */}
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-4 mb-6">
          <div className="flex items-center">
            <div className="h-3 w-3 mr-2 bg-gray-600 dark:bg-gray-400"></div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              P2P Documents: Ready
            </span>
            <span className="ml-auto text-xs text-gray-500">
              Documents stored in OrbitDB with IPFS
            </span>
          </div>
        </div>

        {/* P2P Documents for this collection */}
        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Collection Documents (P2P)
          </h2>

          <P2PDocuments userId={userId} collectionId={isMainCollection ? 'main' : (params.id as string)} />
        </div>

        {/* Pinned Documents - Show P2P pinned documents for this user */}
        {userId && (
          <div className="mb-6">
            <PinnedDocuments
              userId={userId}
              collectionId={isMainCollection ? 'main' : (params.id as string)}
              mode="p2p"
            />
          </div>
        )}
      </div>
    </div>
  )
}