'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface P2PDocument {
  id: string
  documentType: 'quote' | 'link' | 'image'
  title: string
  description?: string
  ipfsCID?: string
  contentType?: string
  metadata?: any
  version?: number
  uploadedBy: string
  addedBy?: string
  addedAt?: number
  created: number
}

export default function MyCollection() {
  const router = useRouter()
  const [documents, setDocuments] = useState<P2PDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [selectedDocument, setSelectedDocument] = useState<P2PDocument | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/auth')
      return
    }

    const user = localStorage.getItem('userId')
    if (user) {
      setUserId(user)
      fetchMyCollection(user)
    }
  }, [])

  const fetchMyCollection = async (peerId: string) => {
    try {
      setLoading(true)
      const collectionId = `collection-${peerId}-main`

      const response = await fetch(`/api/documents/p2p?collectionId=${collectionId}`)

      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents || [])
      }
    } catch (error) {
      console.error('Error fetching my collection:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveFromCollection = async (documentId: string) => {
    if (!confirm('Remove this document from your collection?')) return

    try {
      const response = await fetch('/api/documents/p2p/collection/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId,
          peerId: userId
        })
      })

      if (response.ok) {
        // Refresh the collection
        fetchMyCollection(userId)
        setSelectedDocument(null)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to remove document')
      }
    } catch (error) {
      console.error('Error removing from collection:', error)
      alert('Failed to remove document from collection')
    }
  }

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

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Collection</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Documents you've added to your personal collection
            </p>
          </div>
          <button
            onClick={() => router.push('/feed')}
            className="px-4 py-2 border border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Browse Global Feed
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-8">
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">
              Your collection is empty
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
              Browse the global feed and add documents to your collection
            </p>
            <button
              onClick={() => router.push('/feed')}
              className="px-6 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300"
            >
              Go to Global Feed
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setSelectedDocument(doc)}
                className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-100 transition-colors p-6 cursor-pointer"
              >
                {/* Document content based on type */}
                {doc.documentType === 'quote' && (
                  <div>
                    <blockquote className="italic text-gray-700 dark:text-gray-300 mb-3 line-clamp-3">
                      "{doc.metadata?.quoteContent}"
                    </blockquote>
                    <p className="font-medium text-gray-900 dark:text-white mb-1">
                      — {doc.metadata?.author}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {doc.title}
                    </p>
                  </div>
                )}

                {doc.documentType === 'link' && (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                      {doc.title}
                    </h3>
                    {doc.metadata?.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                        {doc.metadata.description}
                      </p>
                    )}
                    <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                      {doc.metadata?.url}
                    </p>
                  </div>
                )}

                {doc.documentType === 'image' && (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">
                      {doc.title}
                    </h3>
                  </div>
                )}

                {/* Added date */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Added {formatDate(doc.addedAt || doc.created)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Detail Modal */}
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
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedDocument.title}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleRemoveFromCollection(selectedDocument.id)}
                    className="px-4 py-2 border border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 text-sm"
                  >
                    Remove from Collection
                  </button>
                  <button
                    onClick={() => setSelectedDocument(null)}
                    className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Document content */}
              {selectedDocument.documentType === 'quote' && selectedDocument.metadata && (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-800 p-6 border-l-4 border-gray-900 dark:border-gray-100">
                    <blockquote className="text-lg italic text-gray-700 dark:text-gray-300 mb-4">
                      "{selectedDocument.metadata.quoteContent}"
                    </blockquote>
                    <p className="font-medium text-gray-900 dark:text-white">
                      — {selectedDocument.metadata.author}
                    </p>
                  </div>
                  {selectedDocument.metadata.title && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Source: </span>
                      <span className="text-gray-900 dark:text-white">{selectedDocument.metadata.title}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedDocument.documentType === 'link' && selectedDocument.metadata && (
                <div className="space-y-4">
                  {selectedDocument.metadata.description && (
                    <p className="text-gray-700 dark:text-gray-300">
                      {selectedDocument.metadata.description}
                    </p>
                  )}
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">URL: </span>
                    <a
                      href={selectedDocument.metadata.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                    >
                      {selectedDocument.metadata.url}
                    </a>
                  </div>
                </div>
              )}

              {selectedDocument.documentType === 'image' && (
                <div className="space-y-4">
                  {selectedDocument.description && (
                    <p className="text-gray-700 dark:text-gray-300">
                      {selectedDocument.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
