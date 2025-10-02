'use client'

import { useState, useEffect } from 'react'

interface PinnedDocument {
  id: string
  user_id: string
  collection_id: string
  original_document_id: string
  source_collection_id: string
  document_title: string
  document_description?: string
  created_at: string
  source_collection_name?: string
  source_collection_owner?: string
}

interface P2PPinnedDocument {
  id: string
  userId: string
  documentId: string
  ipfsHash: string
  sourceCollectionId: string
  documentTitle: string
  documentDescription?: string
  created: number
}

interface PinnedDocumentsProps {
  userId: string
  collectionId: string
  mode: 'traditional' | 'p2p'
}

export default function PinnedDocuments({ userId, collectionId, mode }: PinnedDocumentsProps) {
  const [pinnedDocs, setPinnedDocs] = useState<(PinnedDocument | P2PPinnedDocument)[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (userId) {
      loadPinnedDocuments()
    }
  }, [userId, collectionId, mode])

  const loadPinnedDocuments = async () => {
    try {
      setLoading(true)
      const endpoint = mode === 'p2p'
        ? `/api/documents/p2p-pin?userId=${userId}`
        : `/api/documents/pin?userId=${userId}&collectionId=${collectionId}`

      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()
        setPinnedDocs(data.pinnedDocuments || [])
      }
    } catch (error) {
      console.error('Error loading pinned documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUnpin = async (pinId: string) => {
    if (!confirm('Are you sure you want to unpin this document?')) return

    try {
      const endpoint = mode === 'p2p'
        ? `/api/documents/p2p-pin?pinId=${pinId}&userId=${userId}`
        : `/api/documents/pin?pinId=${pinId}&userId=${userId}`

      const response = await fetch(endpoint, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadPinnedDocuments()
      } else {
        const error = await response.json()
        alert('Unpin failed: ' + error.error)
      }
    } catch (error) {
      console.error('Unpin error:', error)
      alert('Unpin failed')
    }
  }

  const formatDate = (dateInput: string | number) => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : new Date(dateInput)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const isPinnedDoc = (doc: PinnedDocument | P2PPinnedDocument): doc is PinnedDocument => {
    return 'created_at' in doc
  }

  const isP2PPinnedDoc = (doc: PinnedDocument | P2PPinnedDocument): doc is P2PPinnedDocument => {
    return 'created' in doc
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-2"></div>
          <p className="text-gray-500">Loading pinned documents...</p>
        </div>
      </div>
    )
  }

  if (pinnedDocs.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          Pinned Documents
          {mode === 'p2p' && <span className="ml-2 text-gray-500 dark:text-gray-400">P2P</span>}
        </h2>
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg mb-2">No pinned documents yet</p>
          <p className="text-sm">
            Pin documents from other collections to keep them easily accessible in your collection
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
        Pinned Documents ({pinnedDocs.length})
        {mode === 'p2p' && <span className="ml-2 text-gray-500 dark:text-gray-400">P2P</span>}
      </h2>

      <div className="space-y-4">
        {pinnedDocs.map((doc) => (
          <div
            key={doc.id}
            className="border dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800 border-l-4 border-l-gray-900 dark:border-l-gray-100"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center mb-2">
                  <div className={`w-2 h-2 rounded-full mr-2 ${mode === 'p2p' ? 'bg-blue-500' : 'bg-green-500'} animate-pulse`}></div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {isPinnedDoc(doc) ? doc.document_title : doc.documentTitle}
                  </h3>
                </div>

                {((isPinnedDoc(doc) && doc.document_description) || (isP2PPinnedDoc(doc) && doc.documentDescription)) && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                    {isPinnedDoc(doc) ? doc.document_description : doc.documentDescription}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div>
                    <p><strong>Pinned:</strong> {isPinnedDoc(doc) ? formatDate(doc.created_at) : formatDate(doc.created)}</p>
                    {isPinnedDoc(doc) && doc.source_collection_name && (
                      <p><strong>From:</strong> {doc.source_collection_name}</p>
                    )}
                    {isPinnedDoc(doc) && doc.source_collection_owner && (
                      <p><strong>Owner:</strong> {doc.source_collection_owner}</p>
                    )}
                  </div>
                  <div>
                    {isP2PPinnedDoc(doc) && (
                      <>
                        <p><strong>IPFS:</strong> <code className="text-xs bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded">{doc.ipfsHash.slice(0, 12)}...</code></p>
                        <p><strong>Document ID:</strong> {doc.documentId}</p>
                      </>
                    )}
                    {isPinnedDoc(doc) && (
                      <p><strong>Original ID:</strong> {doc.original_document_id.slice(0, 12)}...</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex space-x-2 ml-4">
                {isP2PPinnedDoc(doc) && (
                  <button
                    onClick={() => navigator.clipboard.writeText(doc.ipfsHash)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    title="Copy IPFS Hash"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleUnpin(doc.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  title="Unpin document"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}