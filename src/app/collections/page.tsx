'use client'
import { useState } from 'react'

export default function Collections() {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState<'all' | 'public' | 'private' | 'mine'>('all')

  const mockCollections = [
    {
      id: 1,
      name: "AI Research Archive",
      description: "Collection of foundational papers and research in artificial intelligence, machine learning, and deep learning.",
      documentCount: 47,
      isPublic: true,
      creator: "Dr. Sarah Chen",
      createdAt: "2024-01-15",
      lastActivity: "2 hours ago",
      participants: 8,
      tags: ["AI", "Machine Learning", "Research"]
    },
    {
      id: 2,
      name: "Climate Data Analysis",
      description: "Environmental data, climate models, and research papers on climate change impacts.",
      documentCount: 23,
      isPublic: true,
      creator: "Prof. Marcus Johnson",
      createdAt: "2024-02-03",
      lastActivity: "1 day ago",
      participants: 12,
      tags: ["Climate", "Environment", "Data"]
    },
    {
      id: 3,
      name: "Philosophy & Ethics",
      description: "Personal collection of philosophical texts and notes on ethics and moral philosophy.",
      documentCount: 15,
      isPublic: false,
      creator: "Alice Researcher",
      createdAt: "2024-02-20",
      lastActivity: "3 days ago",
      participants: 1,
      tags: ["Philosophy", "Ethics", "Theory"]
    },
    {
      id: 4,
      name: "Open Science Initiative",
      description: "Collaborative collection promoting open access research and reproducible science.",
      documentCount: 31,
      isPublic: true,
      creator: "Open Science Collective",
      createdAt: "2024-01-08",
      lastActivity: "5 hours ago",
      participants: 25,
      tags: ["Open Science", "Reproducibility", "Collaboration"]
    }
  ]

  const filteredCollections = mockCollections.filter(collection => {
    switch (filter) {
      case 'public': return collection.isPublic
      case 'private': return !collection.isPublic
      case 'mine': return collection.creator === "Alice Researcher"
      default: return true
    }
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Collections</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Collaborative document collections and research projects
        </p>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create Collection
          </button>
          
          {/* Filter Buttons */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'public', label: 'Public' },
              { key: 'private', label: 'Private' },
              { key: 'mine', label: 'Mine' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key as any)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filter === key
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">View:</span>
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setView('grid')}
              className={`p-2 rounded ${view === 'grid' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded ${view === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Collections Grid/List */}
      {view === 'grid' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCollections.map((collection) => (
            <div key={collection.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border hover:shadow-md transition-shadow cursor-pointer">
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {collection.name}
                  </h3>
                  <div className="flex items-center">
                    {collection.isPublic ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Public
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                        Private
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {collection.description}
                </p>
                
                <div className="flex flex-wrap gap-1 mb-4">
                  {collection.tags.map((tag, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {tag}
                    </span>
                  ))}
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center space-x-4">
                    <span>{collection.documentCount} docs</span>
                    <span>{collection.participants} participants</span>
                  </div>
                  <span>{collection.lastActivity}</span>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Created by {collection.creator}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredCollections.map((collection) => (
              <div key={collection.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {collection.name}
                      </h3>
                      {collection.isPublic ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Public
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                          Private
                        </span>
                      )}
                    </div>
                    
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      {collection.description}
                    </p>
                    
                    <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
                      <span>{collection.documentCount} documents</span>
                      <span>{collection.participants} participants</span>
                      <span>Created by {collection.creator}</span>
                      <span>Last activity: {collection.lastActivity}</span>
                    </div>
                  </div>
                  
                  <div className="ml-4">
                    <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredCollections.length === 0 && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No collections found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            No collections match your current filter.
          </p>
        </div>
      )}
    </div>
  )
}