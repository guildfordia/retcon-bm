// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useP2P } from '@/contexts/P2PContext'
import type { CollectionEntry } from '@/lib/p2p-collections'

interface P2PDocumentsProps {
  userId: string
  collectionId: string // Required - must always be in a collection context
}

export default function P2PDocuments({ userId, collectionId }: P2PDocumentsProps) {
  const { collectionSystem, isConnected, peerId, peerCount } = useP2P()
  const [documents, setDocuments] = useState<CollectionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<CollectionEntry | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [documentType, setDocumentType] = useState<'quote' | 'link' | 'image'>('quote')
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    file: null as File | null,
    // Quote metadata
    quoteContent: '',  // The actual quote text
    author: '',
    publisher: '',
    year: '',
    isbn: '',
    edition: '',
    pages: '',
    pageNumbers: '',
    keywords: [] as string[],
    // Link metadata
    url: '',
    siteName: '',
    publicationDate: '',
    thumbnail: '',
    // Image metadata
    creator: '',
    source: '',
    date: '',
    format: ''
  })
  const [forkForm, setForkForm] = useState({
    title: '',
    description: ''
  })

  useEffect(() => {
    // Load documents when component mounts or parameters change
    loadDocuments()
  }, [userId, collectionId])

  const loadDocuments = async () => {
    console.log(' loadDocuments() called for collection:', collectionId)

    try {
      setLoading(true)
      console.log('Fetching documents from P2P API...')

      // Use the real P2P documents API
      const response = await fetch(`/api/documents/p2p?collectionId=${collectionId}&peerId=${userId}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Fetched P2P documents:', data)

      // Convert API response format to CollectionEntry format
      const collectionDocs = data.documents?.map((doc: any) => ({
        docId: doc.id,
        title: doc.title || doc.filename,
        description: doc.description,
        filename: doc.filename,
        mimeType: doc.mimeType,
        size: doc.size,
        authorPubKey: doc.uploadedBy,
        timestamp: doc.created,
        version: doc.version || 1,
        type: doc.type || 'DOCUMENT' as const,
        origin: doc.origin
      })) || []

      console.log(' Documents retrieved:', collectionDocs.length, 'documents')
      setDocuments(collectionDocs)
    } catch (error) {
      console.error(' Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
    console.log(' === UPLOAD BUTTON CLICKED ===')
    console.log(' Document type:', documentType)
    console.log(' Form data:', {
      title: uploadForm.title,
      description: uploadForm.description,
      file: uploadForm.file?.name,
      fileSize: uploadForm.file?.size
    })

    // Validation based on document type
    if (!uploadForm.title) {
      alert('Please provide a title')
      return
    }

    if (documentType === 'quote') {
      if (!uploadForm.quoteContent) {
        alert('Please provide the quote content')
        return
      }
      if (!uploadForm.author) {
        alert('Please provide author for quote')
        return
      }
    } else if (documentType === 'link') {
      if (!uploadForm.url) {
        alert('Please provide URL for link')
        return
      }
      // Validate URL format
      try {
        new URL(uploadForm.url)
      } catch {
        alert('Please provide a valid URL')
        return
      }
    } else if (documentType === 'image') {
      if (!uploadForm.file) {
        alert('Please provide an image file')
        return
      }
      // Check file size limit (1 MB for images)
      if (uploadForm.file.size > 1024 * 1024) {
        alert('Image size exceeds 1 MB limit')
        return
      }
      // Check if file is an image
      if (!uploadForm.file.type.startsWith('image/')) {
        alert('Please upload an image file')
        return
      }
    }

    setUploading(true)
    console.log(' Starting P2P upload via API...')

    try {
      // Create FormData for file upload
      const formData = new FormData()
      if (uploadForm.file) {
        formData.append('file', uploadForm.file)
      }
      formData.append('documentType', documentType)
      formData.append('title', uploadForm.title)
      formData.append('description', uploadForm.description || '')
      formData.append('collectionId', collectionId)
      formData.append('peerId', userId)

      // Add type-specific metadata
      if (documentType === 'quote') {
        const quoteMetadata = {
          quoteContent: uploadForm.quoteContent,
          author: uploadForm.author,
          title: uploadForm.title,
          publisher: uploadForm.publisher,
          year: uploadForm.year,
          isbn: uploadForm.isbn,
          edition: uploadForm.edition,
          pages: uploadForm.pages,
          keywords: uploadForm.keywords,
          pageNumbers: uploadForm.pageNumbers
        }
        formData.append('metadata', JSON.stringify(quoteMetadata))
      } else if (documentType === 'link') {
        const linkMetadata = {
          url: uploadForm.url,
          title: uploadForm.title,
          description: uploadForm.description,
          author: uploadForm.author,
          publicationDate: uploadForm.publicationDate,
          siteName: uploadForm.siteName,
          keywords: uploadForm.keywords,
          thumbnail: uploadForm.thumbnail
        }
        formData.append('metadata', JSON.stringify(linkMetadata))
      } else if (documentType === 'image') {
        const imageMetadata = {
          title: uploadForm.title,
          description: uploadForm.description,
          creator: uploadForm.creator,
          source: uploadForm.source,
          date: uploadForm.date,
          format: uploadForm.format || uploadForm.file?.type.split('/')[1],
          keywords: uploadForm.keywords
        }
        formData.append('metadata', JSON.stringify(imageMetadata))
      }

      console.log('Uploading to P2P API:', collectionId)

      const response = await fetch('/api/documents/p2p', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Upload failed: ${response.statusText}`)
      }

      const data = await response.json()
      console.log(' Document uploaded successfully:', data)

      // Reset form
      setUploadForm({
        title: '',
        description: '',
        file: null,
        quoteContent: '',
        author: '',
        publisher: '',
        year: '',
        isbn: '',
        edition: '',
        pages: '',
        pageNumbers: '',
        keywords: [],
        url: '',
        siteName: '',
        publicationDate: '',
        thumbnail: '',
        creator: '',
        source: '',
        date: '',
        format: ''
      })
      setShowUpload(false)

      // Reload documents
      console.log(' Reloading documents list...')
      await loadDocuments()
    } catch (error) {
      console.error(' Upload failed:', error)
      alert('Upload failed: ' + (error as any).message)
    } finally {
      setUploading(false)
      console.log('=== UPLOAD COMPLETE ===')
    }
  }

  const handleFork = async () => {
    if (!selectedDoc || !forkForm.title || !collectionSystem) return
    
    try {
      // Fork document into current collection
      // This creates a CREATE entry with origin metadata
      await collectionSystem.forkDocument(
        selectedDoc,
        selectedDoc.authorPubKey,
        collectionId // Origin DB address
      )
      
      setForkForm({ title: '', description: '' })
      setShowForkDialog(false)
      setSelectedDoc(null)
      
      await loadDocuments()
    } catch (error) {
      console.error('Fork error:', error)
      alert('Fork failed')
    }
  }

  const handleDelete = async (docId: string) => {
    if (!collectionSystem || !confirm('Are you sure you want to delete this document?')) return
    
    try {
      // Create TOMBSTONE entry in collection
      await collectionSystem.deleteDocument(docId)
      await loadDocuments()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Delete failed')
    }
  }

  const handleDownload = async (doc: CollectionEntry) => {
    if (!collectionSystem) return

    try {
      const fileData = await collectionSystem.getFileFromIPFS(doc.cid)
      if (fileData) {
        const blob = new Blob([fileData], { type: doc.mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = doc.filename
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Download error:', error)
      alert('Download failed')
    }
  }

  const handlePin = async (doc: CollectionEntry) => {
    try {
      const response = await fetch('/api/documents/p2p-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          documentId: doc.docId,
          ipfsHash: doc.cid,
          sourceCollectionId: collectionId,
          documentData: {
            title: doc.title,
            description: doc.description || `P2P document: ${doc.title}`
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

  const getAvailabilityStatus = (_doc: CollectionEntry) => {
    // Simplified availability - show as available if P2P is connected
    if (!isConnected) {
      return <span className="text-red-500">Offline</span>
    }

    // In real implementation, would check actual peer availability
    if (peerCount === 0) {
      return <span className="text-yellow-500">Local only</span>
    }

    return <span className="text-green-500">{peerCount + 1} peers</span>
  }

  if (!isConnected) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          P2P System Not Connected
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Waiting for P2P connection...
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Collection: {collectionId}
        </h2>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Document
        </button>
      </div>

      {/* P2P Status */}
      <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 mb-4 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-semibold">Peer ID:</span> {peerId.slice(0, 8)}...
          </div>
          <div>
            <span className="font-semibold">Connected Peers:</span> {peerCount}
          </div>
        </div>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No documents yet. Upload your first document to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => (
            <div key={doc.docId} className="border dark:border-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {doc.title}
                  </h3>
                  {doc.description && (
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {doc.description}
                    </p>
                  )}
                  <div className="mt-2 text-sm text-gray-500 space-x-4">
                    <span>{(doc.size / 1024).toFixed(2)} KB</span>
                    <span>{new Date(doc.timestamp).toLocaleDateString()}</span>
                    <span>{doc.origin && 'Forked'}</span>
                    {doc.type === 'TOMBSTONE' && <span className="text-red-500">Deleted</span>}
                  </div>
                  <div className="mt-1">
                    {getAvailabilityStatus(doc)}
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    title="Download"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handlePin(doc)}
                    className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                    title="Pin to your collection"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDoc(doc)
                      setShowForkDialog(true)
                      setForkForm({ title: `Fork of ${doc.title}`, description: doc.description })
                    }}
                    className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                    title="Fork"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(doc.docId)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    title="Delete"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-black border border-gray-300 dark:border-gray-700 p-6 w-full max-w-2xl my-8">
            <h3 className="text-xl font-bold mb-4">Add Document to Collection</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Collection: {collectionId}
            </p>

            {/* Document Type Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Document Type</label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setDocumentType('quote')}
                  className={`px-4 py-2 border rounded ${documentType === 'quote' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}
                >
                  Quote
                </button>
                <button
                  onClick={() => setDocumentType('link')}
                  className={`px-4 py-2 border rounded ${documentType === 'link' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}
                >
                  Link URL
                </button>
                <button
                  onClick={() => setDocumentType('image')}
                  className={`px-4 py-2 border rounded ${documentType === 'image' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}
                >
                  Image
                </button>
              </div>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {/* Common Fields */}
              <div>
                <label className="block text-sm font-medium mb-1">Title of Source *</label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Enter title of source"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  rows={2}
                  placeholder="Enter description"
                />
              </div>

              {/* Quote-specific fields */}
              {documentType === 'quote' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Quote Content *</label>
                    <textarea
                      value={uploadForm.quoteContent}
                      onChange={(e) => setUploadForm({ ...uploadForm, quoteContent: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      rows={4}
                      placeholder="Paste or type the quote text here..."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Author * (ISO-690)</label>
                    <input
                      type="text"
                      value={uploadForm.author}
                      onChange={(e) => setUploadForm({ ...uploadForm, author: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Author name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Publisher</label>
                      <input
                        type="text"
                        value={uploadForm.publisher}
                        onChange={(e) => setUploadForm({ ...uploadForm, publisher: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Publisher"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Year</label>
                      <input
                        type="text"
                        value={uploadForm.year}
                        onChange={(e) => setUploadForm({ ...uploadForm, year: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Publication year"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">ISBN</label>
                      <input
                        type="text"
                        value={uploadForm.isbn}
                        onChange={(e) => setUploadForm({ ...uploadForm, isbn: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="ISBN"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Edition</label>
                      <input
                        type="text"
                        value={uploadForm.edition}
                        onChange={(e) => setUploadForm({ ...uploadForm, edition: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Edition"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Total Pages</label>
                      <input
                        type="text"
                        value={uploadForm.pages}
                        onChange={(e) => setUploadForm({ ...uploadForm, pages: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Total pages"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Page Numbers</label>
                      <input
                        type="text"
                        value={uploadForm.pageNumbers}
                        onChange={(e) => setUploadForm({ ...uploadForm, pageNumbers: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="e.g., 45-52"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={uploadForm.keywords.join(', ')}
                      onChange={(e) => setUploadForm({ ...uploadForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="keyword1, keyword2, keyword3"
                    />
                  </div>
                </>
              )}

              {/* Link-specific fields */}
              {documentType === 'link' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">URL *</label>
                    <input
                      type="url"
                      value={uploadForm.url}
                      onChange={(e) => setUploadForm({ ...uploadForm, url: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="https://example.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Author</label>
                      <input
                        type="text"
                        value={uploadForm.author}
                        onChange={(e) => setUploadForm({ ...uploadForm, author: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Author"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Site Name</label>
                      <input
                        type="text"
                        value={uploadForm.siteName}
                        onChange={(e) => setUploadForm({ ...uploadForm, siteName: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Site name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Publication Date</label>
                    <input
                      type="text"
                      value={uploadForm.publicationDate}
                      onChange={(e) => setUploadForm({ ...uploadForm, publicationDate: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={uploadForm.keywords.join(', ')}
                      onChange={(e) => setUploadForm({ ...uploadForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="keyword1, keyword2, keyword3"
                    />
                  </div>
                </>
              )}

              {/* Image-specific fields */}
              {documentType === 'image' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Image File * (max 1MB)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Creator</label>
                      <input
                        type="text"
                        value={uploadForm.creator}
                        onChange={(e) => setUploadForm({ ...uploadForm, creator: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Creator/Artist"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Source</label>
                      <input
                        type="text"
                        value={uploadForm.source}
                        onChange={(e) => setUploadForm({ ...uploadForm, source: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Source"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Date</label>
                    <input
                      type="text"
                      value={uploadForm.date}
                      onChange={(e) => setUploadForm({ ...uploadForm, date: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Creation date"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={uploadForm.keywords.join(', ')}
                      onChange={(e) => setUploadForm({ ...uploadForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) })}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                      placeholder="keyword1, keyword2, keyword3"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Adding...' : 'Add Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fork Dialog */}
      {showForkDialog && selectedDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-black border border-gray-300 dark:border-gray-700 p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Fork Document</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">New Title</label>
                <input
                  type="text"
                  value={forkForm.title}
                  onChange={(e) => setForkForm({ ...forkForm, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">New Description</label>
                <textarea
                  value={forkForm.description}
                  onChange={(e) => setForkForm({ ...forkForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowForkDialog(false)
                    setSelectedDoc(null)
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFork}
                  disabled={!forkForm.title}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Create Fork
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}