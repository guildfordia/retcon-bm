'use client'
import { useState } from 'react'

export default function Documents() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedCollection, setSelectedCollection] = useState('all')
  const [view, setView] = useState<'grid' | 'list'>('list')

  const mockDocuments = [
    {
      id: 1,
      title: "Introduction to Quantum Computing",
      description: "Comprehensive overview of quantum computing principles and applications",
      filename: "quantum_computing_intro.pdf",
      type: "application/pdf",
      size: "2.4 MB",
      uploader: "Dr. Sarah Chen",
      collection: "AI Research Archive",
      uploadedAt: "2024-01-20",
      forkCount: 8,
      views: 142,
      isForked: false,
      tags: ["Quantum", "Computing", "Physics"]
    },
    {
      id: 2,
      title: "Climate Change Data Analysis",
      description: "Statistical analysis of global temperature trends over the past century",
      filename: "climate_analysis_2024.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: "5.1 MB",
      uploader: "Prof. Marcus Johnson",
      collection: "Climate Data Analysis",
      uploadedAt: "2024-01-18",
      forkCount: 12,
      views: 89,
      isForked: false,
      tags: ["Climate", "Data", "Statistics"]
    },
    {
      id: 3,
      title: "Ethical AI Framework Notes",
      description: "Personal notes on developing ethical guidelines for AI systems",
      filename: "ai_ethics_notes.md",
      type: "text/markdown",
      size: "156 KB",
      uploader: "Alice Researcher",
      collection: "Philosophy & Ethics",
      uploadedAt: "2024-01-15",
      forkCount: 3,
      views: 67,
      isForked: false,
      tags: ["AI", "Ethics", "Philosophy"]
    },
    {
      id: 4,
      title: "Neural Network Architecture Diagram",
      description: "Visual representation of transformer architecture used in modern LLMs",
      filename: "transformer_architecture.png",
      type: "image/png",
      size: "892 KB",
      uploader: "Dr. Sarah Chen",
      collection: "AI Research Archive",
      uploadedAt: "2024-01-12",
      forkCount: 15,
      views: 203,
      isForked: false,
      tags: ["Neural Networks", "Architecture", "Transformers"]
    },
    {
      id: 5,
      title: "Quantum Computing Research Paper (Forked)",
      description: "Extended version with additional quantum algorithm implementations",
      filename: "quantum_computing_extended.pdf",
      type: "application/pdf",
      size: "3.2 MB",
      uploader: "Alice Researcher",
      collection: "Philosophy & Ethics",
      uploadedAt: "2024-01-22",
      forkCount: 0,
      views: 24,
      isForked: true,
      forkedFrom: "Introduction to Quantum Computing",
      tags: ["Quantum", "Computing", "Extended"]
    }
  ]

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return { icon: 'PDF', color: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400' }
    if (mimeType.includes('image')) return { icon: 'IMG', color: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400' }
    if (mimeType.includes('markdown') || mimeType.includes('text')) return { icon: 'MD', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400' }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return { icon: 'XLS', color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400' }
    return { icon: 'DOC', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' }
  }

  const filteredDocuments = mockDocuments.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = selectedType === 'all' || doc.type.includes(selectedType)
    const matchesCollection = selectedCollection === 'all' || doc.collection === selectedCollection
    return matchesSearch && matchesType && matchesCollection
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Documents</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Browse and manage archived documents across all collections
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-800 placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:text-white"
              />
            </div>
          </div>
          <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Document
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <select 
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Types</option>
              <option value="pdf">PDF</option>
              <option value="image">Images</option>
              <option value="markdown">Markdown</option>
              <option value="spreadsheet">Spreadsheets</option>
            </select>

            <select 
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Collections</option>
              <option value="AI Research Archive">AI Research Archive</option>
              <option value="Climate Data Analysis">Climate Data Analysis</option>
              <option value="Philosophy & Ethics">Philosophy & Ethics</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">View:</span>
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setView('list')}
                className={`p-2 rounded ${view === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={() => setView('grid')}
                className={`p-2 rounded ${view === 'grid' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Documents */}
      {view === 'list' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredDocuments.map((doc) => {
              const { icon, color } = getFileIcon(doc.type)
              return (
                <div key={doc.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
                        <span className="text-sm font-bold">{icon}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                            {doc.title}
                          </h3>
                          {doc.isForked && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                              </svg>
                              Fork
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{doc.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                          <span>By {doc.uploader}</span>
                          <span>•</span>
                          <span>{doc.collection}</span>
                          <span>•</span>
                          <span>{doc.size}</span>
                          <span>•</span>
                          <span>{doc.forkCount} forks</span>
                          <span>•</span>
                          <span>{doc.views} views</span>
                          <span>•</span>
                          <span>{doc.uploadedAt}</span>
                        </div>
                        {doc.isForked && doc.forkedFrom && (
                          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                            Forked from: {doc.forkedFrom}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => alert(`Would open viewer for: ${doc.title}`)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                      >
                        View
                      </button>
                      <button 
                        onClick={() => alert(`Would create fork of: ${doc.title}`)}
                        className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                      >
                        Fork
                      </button>
                      <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((doc) => {
            const { icon, color } = getFileIcon(doc.type)
            return (
              <div key={doc.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
                      <span className="text-sm font-bold">{icon}</span>
                    </div>
                    {doc.isForked && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                        Fork
                      </span>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{doc.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{doc.description}</p>
                  
                  <div className="flex flex-wrap gap-1 mb-4">
                    {doc.tags.map((tag, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-4">
                    <div>By {doc.uploader}</div>
                    <div>{doc.collection}</div>
                    <div>{doc.size} • {doc.forkCount} forks • {doc.views} views</div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button 
                      onClick={() => alert(`Would open viewer for: ${doc.title}`)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                    >
                      View
                    </button>
                    <button 
                      onClick={() => alert(`Would create fork of: ${doc.title}`)}
                      className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                    >
                      Fork
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {filteredDocuments.length === 0 && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No documents found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Try adjusting your search criteria or upload a new document.
          </p>
        </div>
      )}
    </div>
  )
}