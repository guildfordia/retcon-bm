'use client'
import { useState } from 'react'

interface VersionHistoryEntry {
  version: number
  editedBy: string
  editedAt: number
  changeComment: string
  previousMetadata: any
}

interface P2PDocument {
  id: string
  documentType: 'quote' | 'link' | 'image'
  title: string
  description?: string
  metadata?: any
  version?: number
  versionHistory?: VersionHistoryEntry[]
}

interface DocumentVersionBrowserProps {
  document: P2PDocument
  onClose: () => void
}

export default function DocumentVersionBrowser({ document, onClose }: DocumentVersionBrowserProps) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)

  // Get current metadata
  const currentMetadata = document.metadata || {}

  // Build full version list including current
  const allVersions = [
    {
      version: document.version || 1,
      editedBy: 'Current',
      editedAt: Date.now(),
      changeComment: 'Current version',
      metadata: currentMetadata
    },
    ...(document.versionHistory || []).map(v => ({
      ...v,
      metadata: v.previousMetadata
    }))
  ].sort((a, b) => b.version - a.version)

  const displayedMetadata = selectedVersion !== null
    ? allVersions.find(v => v.version === selectedVersion)?.metadata
    : currentMetadata

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-100 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-900 dark:border-gray-100 p-6 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Version History
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {document.documentType.toUpperCase()} • {allVersions.length} version{allVersions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* Content - Two Columns */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Version List */}
          <div className="w-1/3 border-r border-gray-900 dark:border-gray-100 overflow-y-auto">
            <div className="p-4 space-y-2">
              {allVersions.map((version) => (
                <button
                  key={version.version}
                  onClick={() => setSelectedVersion(version.version)}
                  className={`w-full text-left p-4 border transition-colors ${
                    selectedVersion === version.version
                      ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800'
                      : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-gray-900 dark:text-white">
                      Version {version.version}
                      {version.version === (document.version || 1) && (
                        <span className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5">CURRENT</span>
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {new Date(version.editedAt).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {version.changeComment}
                  </div>
                  {version.version !== (document.version || 1) && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      By: {version.editedBy}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Version Details */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedVersion !== null ? (
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Version {selectedVersion} Metadata
                </h3>

                {/* Quote Metadata */}
                {document.documentType === 'quote' && displayedMetadata && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Quote Content
                      </label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white whitespace-pre-wrap">
                        {displayedMetadata.quoteContent || 'N/A'}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Author</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.author || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.title || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Publisher</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.publisher || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.year || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ISBN</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.isbn || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page Numbers</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.pageNumbers || 'N/A'}
                        </div>
                      </div>
                    </div>
                    {displayedMetadata.keywords && displayedMetadata.keywords.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keywords</label>
                        <div className="flex flex-wrap gap-2">
                          {displayedMetadata.keywords.map((keyword: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Link Metadata */}
                {document.documentType === 'link' && displayedMetadata && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL</label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white break-all">
                        {displayedMetadata.url || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                        {displayedMetadata.title || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white whitespace-pre-wrap">
                        {displayedMetadata.description || 'N/A'}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Author</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.author || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Name</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.siteName || 'N/A'}
                        </div>
                      </div>
                    </div>
                    {displayedMetadata.keywords && displayedMetadata.keywords.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keywords</label>
                        <div className="flex flex-wrap gap-2">
                          {displayedMetadata.keywords.map((keyword: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Image Metadata */}
                {document.documentType === 'image' && displayedMetadata && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                        {displayedMetadata.title || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white whitespace-pre-wrap">
                        {displayedMetadata.description || 'N/A'}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Creator</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.creator || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                          {displayedMetadata.source || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                        {displayedMetadata.date || 'N/A'}
                      </div>
                    </div>
                    {displayedMetadata.keywords && displayedMetadata.keywords.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keywords</label>
                        <div className="flex flex-wrap gap-2">
                          {displayedMetadata.keywords.map((keyword: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <p>Select a version from the list to view its metadata</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-900 dark:border-gray-100 p-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
