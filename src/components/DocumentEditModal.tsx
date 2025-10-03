'use client'
import { useState } from 'react'

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

interface DocumentEditModalProps {
  document: P2PDocument
  onClose: () => void
  onSave: (updatedMetadata: any, changeComment: string) => Promise<void>
}

export default function DocumentEditModal({ document, onClose, onSave }: DocumentEditModalProps) {
  const [metadata, setMetadata] = useState(document.metadata || {})
  const [changeComment, setChangeComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newImageFile, setNewImageFile] = useState<File | null>(null)
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null)

  const handleSave = async () => {
    if (!changeComment.trim()) {
      setError('Change comment is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      let finalMetadata = { ...metadata }

      // If there's a new image file, upload it to IPFS first
      if (newImageFile && document.documentType === 'image') {
        const formData = new FormData()
        formData.append('file', newImageFile)

        const uploadResponse = await fetch('/orbitdb/ipfs/upload', {
          method: 'POST',
          body: formData
        })

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload image to IPFS')
        }

        const uploadData = await uploadResponse.json()

        // Update metadata with new IPFS CID
        finalMetadata = {
          ...finalMetadata,
          ipfsCID: uploadData.cid,
          contentType: uploadData.contentType,
          contentSize: uploadData.size
        }
      }

      await onSave(finalMetadata, changeComment)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const updateMetadataField = (field: string, value: any) => {
    setMetadata({ ...metadata, [field]: value })
  }

  const updateKeywords = (keywordsStr: string) => {
    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k.length > 0)
    updateMetadataField('keywords', keywords)
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setNewImageFile(file)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setNewImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-100 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-900 dark:border-gray-100 p-6 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Edit Document
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {document.documentType.toUpperCase()} • Version {document.version || 1}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* Edit Form */}
        <div className="p-6 space-y-6">
          {/* Quote Metadata */}
          {document.documentType === 'quote' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quote Content *
                </label>
                <textarea
                  value={metadata.quoteContent || ''}
                  onChange={e => updateMetadataField('quoteContent', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Author *
                </label>
                <input
                  type="text"
                  value={metadata.author || ''}
                  onChange={e => updateMetadataField('author', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Source Title *
                </label>
                <input
                  type="text"
                  value={metadata.title || ''}
                  onChange={e => updateMetadataField('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Publisher
                  </label>
                  <input
                    type="text"
                    value={metadata.publisher || ''}
                    onChange={e => updateMetadataField('publisher', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Year
                  </label>
                  <input
                    type="text"
                    value={metadata.year || ''}
                    onChange={e => updateMetadataField('year', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ISBN
                  </label>
                  <input
                    type="text"
                    value={metadata.isbn || ''}
                    onChange={e => updateMetadataField('isbn', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Page Numbers
                  </label>
                  <input
                    type="text"
                    value={metadata.pageNumbers || ''}
                    onChange={e => updateMetadataField('pageNumbers', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={(metadata.keywords || []).join(', ')}
                  onChange={e => updateKeywords(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>
            </>
          )}

          {/* Link Metadata */}
          {document.documentType === 'link' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL *
                </label>
                <input
                  type="url"
                  value={metadata.url || ''}
                  onChange={e => updateMetadataField('url', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={metadata.title || ''}
                  onChange={e => updateMetadataField('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={metadata.description || ''}
                  onChange={e => updateMetadataField('description', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Author
                  </label>
                  <input
                    type="text"
                    value={metadata.author || ''}
                    onChange={e => updateMetadataField('author', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Site Name
                  </label>
                  <input
                    type="text"
                    value={metadata.siteName || ''}
                    onChange={e => updateMetadataField('siteName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={(metadata.keywords || []).join(', ')}
                  onChange={e => updateKeywords(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>
            </>
          )}

          {/* Image Metadata */}
          {document.documentType === 'image' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload New Image (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
                {newImagePreview && (
                  <div className="mt-2">
                    <img src={newImagePreview} alt="Preview" className="max-h-48 object-contain" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={metadata.title || ''}
                  onChange={e => updateMetadataField('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={metadata.description || ''}
                  onChange={e => updateMetadataField('description', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Creator
                  </label>
                  <input
                    type="text"
                    value={metadata.creator || ''}
                    onChange={e => updateMetadataField('creator', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Source
                  </label>
                  <input
                    type="text"
                    value={metadata.source || ''}
                    onChange={e => updateMetadataField('source', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Date
                </label>
                <input
                  type="text"
                  value={metadata.date || ''}
                  onChange={e => updateMetadataField('date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={(metadata.keywords || []).join(', ')}
                  onChange={e => updateKeywords(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
                />
              </div>
            </>
          )}

          {/* Change Comment - Required for all types */}
          <div className="pt-4 border-t border-gray-300 dark:border-gray-600">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Change Comment * <span className="text-gray-500 text-xs">(required)</span>
            </label>
            <textarea
              value={changeComment}
              onChange={e => setChangeComment(e.target.value)}
              rows={2}
              placeholder="Describe what you changed and why..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-900 dark:text-red-100 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-900 dark:border-gray-100 p-6 flex justify-end gap-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-6 py-2 border border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
