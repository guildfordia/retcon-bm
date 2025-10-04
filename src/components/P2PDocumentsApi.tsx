'use client'

import { useState, useEffect } from 'react'
import DocumentEditModal from './DocumentEditModal'
import DocumentVersionBrowser from './DocumentVersionBrowser'

interface P2PDocument {
  id: string
  documentType: 'quote' | 'link' | 'image'
  title: string
  description?: string
  filename?: string
  ipfsHash?: string
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
}

interface P2PDocumentsApiProps {
  collectionId: string
}

export default function P2PDocumentsApi({ collectionId }: P2PDocumentsApiProps) {
  const [documents, setDocuments] = useState<P2PDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadStep, setUploadStep] = useState<'type' | 'form'>('type') // Two-step flow
  const [documentType, setDocumentType] = useState<'quote' | 'link' | 'image'>('quote')
  const [selectedDocument, setSelectedDocument] = useState<P2PDocument | null>(null)
  const [editingDocument, setEditingDocument] = useState<P2PDocument | null>(null)
  const [viewingHistory, setViewingHistory] = useState<P2PDocument | null>(null)
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    file: null as File | null,
    // Quote metadata
    quoteContent: '',
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
    // Image metadata
    creator: '',
    source: '',
    date: '',
    format: ''
  })

  useEffect(() => {
    loadDocuments()
  }, [collectionId])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const peerId = localStorage.getItem('userId') || ''
      const url = `/api/documents/p2p?collectionId=${encodeURIComponent(collectionId)}&peerId=${encodeURIComponent(peerId)}`
      const response = await fetch(url)

      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents || [])
      } else {
        console.error('Failed to load documents:', await response.text())
      }
    } catch (error) {
      console.error('Error loading P2P documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
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
      if (uploadForm.file.size > 1024 * 1024) {
        alert('Image size exceeds 1 MB limit')
        return
      }
      if (!uploadForm.file.type.startsWith('image/')) {
        alert('Please upload an image file')
        return
      }
    }

    setUploading(true)

    try {
      const formData = new FormData()
      if (uploadForm.file) {
        formData.append('file', uploadForm.file)
      }
      formData.append('documentType', documentType)
      formData.append('title', uploadForm.title)
      formData.append('description', uploadForm.description || '')
      formData.append('collectionId', collectionId)
      formData.append('peerId', localStorage.getItem('userId') || 'anonymous')

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
          keywords: uploadForm.keywords
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

      const response = await fetch('/api/documents/p2p', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Document uploaded:', data)
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
          creator: '',
          source: '',
          date: '',
          format: ''
        })
        setUploadStep('type')
        setShowUpload(false)
        await loadDocuments()
      } else {
        const error = await response.json()
        alert('Upload failed: ' + error.error)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed: ' + (error as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = (doc: P2PDocument) => {
    // Simulate download - in real implementation would fetch from IPFS
    console.log(`Downloading document: ${doc.filename} (${doc.ipfsHash})`)
    alert(`Download initiated for ${doc.filename}\nIPFS Hash: ${doc.ipfsHash}`)
  }

  const handlePin = async (doc: P2PDocument) => {
    try {
      const userId = localStorage.getItem('userId')
      if (!userId) {
        alert('Please log in to pin documents')
        return
      }

      const response = await fetch('/api/documents/p2p-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          documentId: doc.id,
          ipfsHash: doc.ipfsHash,
          sourceCollectionId: doc.collectionId,
          documentData: {
            title: doc.filename,
            description: `IPFS document: ${doc.filename}`
          }
        })
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Document "${doc.filename}" pinned successfully!`)
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

  const handleEditDocument = (doc: P2PDocument, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingDocument(doc)
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
        documentId: editingDocument.id,
        collectionId: collectionId,
        peerId: userId,
        updatedMetadata,
        changeComment,
        documentType: editingDocument.documentType
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update document')
    }

    // Refresh documents list
    const userId2 = localStorage.getItem('userId')
    if (!userId2) return

    try {
      setLoading(true)
      const response = await fetch(`/api/documents/p2p?collectionId=${collectionId}&peerId=${userId2}`)
      if (!response.ok) throw new Error('Failed to fetch documents')

      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }

    setEditingDocument(null)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            P2P Documents
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Collection: {collectionId}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload to P2P
        </button>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-500">Loading P2P documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg mb-2">No P2P documents yet</p>
          <p className="text-sm">Upload your first document to the decentralized network</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => setSelectedDocument(doc)}
              className="border dark:border-gray-700 p-4 hover:border-gray-900 dark:hover:border-gray-100 transition-colors cursor-pointer bg-white dark:bg-gray-900"
            >
              {/* Quote */}
              {doc.documentType === 'quote' && (
                <div>
                  <blockquote className="text-gray-700 dark:text-gray-300 italic mb-3 line-clamp-3">
                    "{doc.metadata?.quoteContent}"
                  </blockquote>
                  <p className="text-sm text-gray-900 dark:text-white font-medium">— {doc.metadata?.author}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{doc.title}</p>
                </div>
              )}

              {/* Link */}
              {doc.documentType === 'link' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
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

              {/* Image */}
              {doc.documentType === 'image' && (
                <div>
                  <div className="bg-gray-100 dark:bg-gray-800 h-40 flex items-center justify-center mb-3">
                    <span className="text-gray-400">Image Preview</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
                    {doc.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {doc.mimeType} • {formatFileSize(doc.size || 0)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog - Two-step flow */}
      {showUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white dark:bg-black border border-gray-300 dark:border-gray-700 p-6 w-full max-w-2xl my-8">
            {/* Step 1: Choose Document Type */}
            {uploadStep === 'type' && (
              <>
                <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Choose Document Type</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Select the type of document you want to add to your collection
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <button
                    onClick={() => {
                      setDocumentType('quote')
                      setUploadStep('form')
                    }}
                    className="p-6 border-2 border-gray-300 dark:border-gray-600 hover:border-gray-900 dark:hover:border-gray-100 transition-colors text-center"
                  >
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Quote</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Text excerpt from books with bibliographic info</p>
                  </button>

                  <button
                    onClick={() => {
                      setDocumentType('link')
                      setUploadStep('form')
                    }}
                    className="p-6 border-2 border-gray-300 dark:border-gray-600 hover:border-gray-900 dark:hover:border-gray-100 transition-colors text-center"
                  >
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Link URL</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Web link with comprehensive metadata</p>
                  </button>

                  <button
                    onClick={() => {
                      setDocumentType('image')
                      setUploadStep('form')
                    }}
                    className="p-6 border-2 border-gray-300 dark:border-gray-600 hover:border-gray-900 dark:hover:border-gray-100 transition-colors text-center"
                  >
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Image</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Visual document with descriptive metadata (max 1MB)</p>
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowUpload(false)
                      setUploadStep('type')
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                </button>
                </div>
              </>
            )}

            {/* Step 2: Fill Form based on selected type */}
            {uploadStep === 'form' && (
              <>
                <div className="flex items-center mb-4">
                  <button
                    onClick={() => setUploadStep('type')}
                    className="mr-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Add {documentType === 'quote' ? 'Quote' : documentType === 'link' ? 'Link URL' : 'Image'}
                  </h3>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  {/* Common fields */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Title of Source *</label>
                    <input
                      type="text"
                      value={uploadForm.title}
                      onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      placeholder="Enter title of source"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      value={uploadForm.description}
                      onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      rows={2}
                      placeholder="Enter description"
                    />
                  </div>

                  {/* Quote fields */}
                  {documentType === 'quote' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1">Quote Content *</label>
                        <textarea
                          value={uploadForm.quoteContent}
                          onChange={(e) => setUploadForm({ ...uploadForm, quoteContent: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          rows={4}
                          placeholder="Paste or type the quote text here..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Author *</label>
                        <input
                          type="text"
                          value={uploadForm.author}
                          onChange={(e) => setUploadForm({ ...uploadForm, author: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
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
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Year</label>
                          <input
                            type="text"
                            value={uploadForm.year}
                            onChange={(e) => setUploadForm({ ...uploadForm, year: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Keywords (comma-separated)</label>
                        <input
                          type="text"
                          value={uploadForm.keywords.join(', ')}
                          onChange={(e) => setUploadForm({ ...uploadForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          placeholder="keyword1, keyword2"
                        />
                      </div>
                    </>
                  )}

                  {/* Link fields */}
                  {documentType === 'link' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1">URL *</label>
                        <input
                          type="url"
                          value={uploadForm.url}
                          onChange={(e) => setUploadForm({ ...uploadForm, url: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
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
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Site Name</label>
                          <input
                            type="text"
                            value={uploadForm.siteName}
                            onChange={(e) => setUploadForm({ ...uploadForm, siteName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Keywords (comma-separated)</label>
                        <input
                          type="text"
                          value={uploadForm.keywords.join(', ')}
                          onChange={(e) => setUploadForm({ ...uploadForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          placeholder="keyword1, keyword2"
                        />
                      </div>
                    </>
                  )}

                  {/* Image fields */}
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
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Source</label>
                          <input
                            type="text"
                            value={uploadForm.source}
                            onChange={(e) => setUploadForm({ ...uploadForm, source: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Keywords (comma-separated)</label>
                        <input
                          type="text"
                          value={uploadForm.keywords.join(', ')}
                          onChange={(e) => setUploadForm({ ...uploadForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          placeholder="keyword1, keyword2"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end space-x-2 mt-6">
                  <button
                    onClick={() => {
                      setShowUpload(false)
                      setUploadStep('type')
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading ? 'Adding...' : 'Add Document'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDocument(null)}>
          <div className="bg-white dark:bg-black border border-gray-300 dark:border-gray-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedDocument.title}</h3>
              <div className="flex items-center gap-3">
                {selectedDocument.versionHistory && selectedDocument.versionHistory.length > 0 && (
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
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Quote Detail */}
            {selectedDocument.documentType === 'quote' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Quote</h4>
                  <blockquote className="text-lg italic text-gray-700 dark:text-gray-300 border-l-4 border-gray-300 dark:border-gray-600 pl-4">
                    "{selectedDocument.metadata?.quoteContent}"
                  </blockquote>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selectedDocument.metadata?.author && <div><strong>Author:</strong> {selectedDocument.metadata.author}</div>}
                  {selectedDocument.metadata?.publisher && <div><strong>Publisher:</strong> {selectedDocument.metadata.publisher}</div>}
                  {selectedDocument.metadata?.year && <div><strong>Year:</strong> {selectedDocument.metadata.year}</div>}
                  {selectedDocument.metadata?.isbn && <div><strong>ISBN:</strong> {selectedDocument.metadata.isbn}</div>}
                  {selectedDocument.metadata?.pageNumbers && <div><strong>Pages:</strong> {selectedDocument.metadata.pageNumbers}</div>}
                </div>
                {selectedDocument.metadata?.keywords && selectedDocument.metadata.keywords.length > 0 && (
                  <div>
                    <strong className="text-sm">Keywords:</strong>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedDocument.metadata.keywords.map((keyword: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-xs">{keyword}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Link Detail */}
            {selectedDocument.documentType === 'link' && (
              <div className="space-y-4">
                {selectedDocument.metadata?.description && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Description</h4>
                    <p className="text-gray-700 dark:text-gray-300">{selectedDocument.metadata.description}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">URL</h4>
                  <a href={selectedDocument.metadata?.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline break-all">
                    {selectedDocument.metadata?.url}
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selectedDocument.metadata?.author && <div><strong>Author:</strong> {selectedDocument.metadata.author}</div>}
                  {selectedDocument.metadata?.siteName && <div><strong>Site:</strong> {selectedDocument.metadata.siteName}</div>}
                  {selectedDocument.metadata?.publicationDate && <div><strong>Date:</strong> {selectedDocument.metadata.publicationDate}</div>}
                </div>
                {selectedDocument.metadata?.keywords && selectedDocument.metadata.keywords.length > 0 && (
                  <div>
                    <strong className="text-sm">Keywords:</strong>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedDocument.metadata.keywords.map((keyword: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-xs">{keyword}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Image Detail */}
            {selectedDocument.documentType === 'image' && (
              <div className="space-y-4">
                <div className="bg-gray-100 dark:bg-gray-800 h-64 flex items-center justify-center">
                  <span className="text-gray-400">Image Preview (IPFS: {selectedDocument.ipfsHash})</span>
                </div>
                {selectedDocument.description && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Description</h4>
                    <p className="text-gray-700 dark:text-gray-300">{selectedDocument.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selectedDocument.filename && <div><strong>Filename:</strong> {selectedDocument.filename}</div>}
                  {selectedDocument.mimeType && <div><strong>Type:</strong> {selectedDocument.mimeType}</div>}
                  {selectedDocument.size && <div><strong>Size:</strong> {formatFileSize(selectedDocument.size)}</div>}
                  {selectedDocument.metadata?.creator && <div><strong>Creator:</strong> {selectedDocument.metadata.creator}</div>}
                  {selectedDocument.metadata?.source && <div><strong>Source:</strong> {selectedDocument.metadata.source}</div>}
                  {selectedDocument.metadata?.date && <div><strong>Date:</strong> {selectedDocument.metadata.date}</div>}
                </div>
                {selectedDocument.ipfsHash && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">IPFS Hash</h4>
                    <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 break-all">{selectedDocument.ipfsHash}</code>
                  </div>
                )}
                {selectedDocument.metadata?.keywords && selectedDocument.metadata.keywords.length > 0 && (
                  <div>
                    <strong className="text-sm">Keywords:</strong>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedDocument.metadata.keywords.map((keyword: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-xs">{keyword}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Common Info */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div><strong>Created:</strong> {new Date(selectedDocument.created).toLocaleString()}</div>
                <div><strong>Version:</strong> {selectedDocument.version || 1}</div>
                <div><strong>Replicas:</strong> {selectedDocument.replicas.length} peers</div>
                <div><strong>Pinned:</strong> {selectedDocument.pinned ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Version History */}
            {selectedDocument.versionHistory && selectedDocument.versionHistory.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Version History</h3>
                <div className="space-y-4">
                  {selectedDocument.versionHistory.map((version, index) => (
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

            <div className="flex justify-end gap-2 mt-6">
              {selectedDocument.documentType === 'link' && selectedDocument.metadata?.url && (
                <a
                  href={selectedDocument.metadata.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700"
                >
                  Visit Link
                </a>
              )}
              <button
                onClick={() => handlePin(selectedDocument)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Pin to My Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingDocument && (
        <DocumentEditModal
          document={editingDocument}
          onClose={() => setEditingDocument(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Version Browser */}
      {viewingHistory && (
        <DocumentVersionBrowser
          document={viewingHistory}
          onClose={() => setViewingHistory(null)}
        />
      )}
    </div>
  )
}