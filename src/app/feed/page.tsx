'use client'
import { useEffect, useState } from 'react'
import GlobalFeedDocuments from '@/components/GlobalFeedDocuments'

export default function FeedPage() {
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [parsedFilters, setParsedFilters] = useState<{
    types: string[]
    keywords: string[]
    title: string
  }>({ types: [], keywords: [], title: '' })

  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true)

      // Check if user is logged in (P2P auth)
      const userId = localStorage.getItem('userId')

      if (!userId) {
        // Redirect to auth if not logged in
        window.location.href = '/auth'
        return
      }

      setLoading(false)
    }

    checkAuth()
  }, [])

  // Parse search query to extract commands
  const parseSearchQuery = (query: string) => {
    const types: string[] = []
    const keywords: string[] = []
    let titleSearch = ''

    // Extract type: commands
    const typeMatches = query.match(/type:(quote|link|image)/g)
    if (typeMatches) {
      typeMatches.forEach(match => {
        const type = match.replace('type:', '')
        if (!types.includes(type)) {
          types.push(type)
        }
      })
    }

    // Extract keywords: command
    const keywordsMatch = query.match(/keywords:([^\s]+)/)
    if (keywordsMatch) {
      const keywordStr = keywordsMatch[1]
      keywords.push(...keywordStr.split(',').filter(k => k.trim()))
    }

    // Remove all commands to get title search
    titleSearch = query
      .replace(/type:(quote|link|image)/g, '')
      .replace(/keywords:[^\s]+/g, '')
      .trim()

    return { types, keywords, title: titleSearch }
  }

  // Debounce search query and parse
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseSearchQuery(searchQuery)
      setParsedFilters(parsed)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const clearFilters = () => {
    setSearchQuery('')
    setParsedFilters({ types: [], keywords: [], title: '' })
  }

  const hasActiveFilters = parsedFilters.title || parsedFilters.keywords.length > 0 || parsedFilters.types.length > 0

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Global Feed</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Latest documents from all users and collections
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                OrbitDB Connected
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar - Always visible */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search... (try: type:quote keywords:philosophy,test search term)"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-gray-900 dark:text-white text-lg"
            />
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Helper text */}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {hasActiveFilters ? (
              <span>
                {parsedFilters.types.length > 0 && `Type: ${parsedFilters.types.join(', ')} • `}
                {parsedFilters.keywords.length > 0 && `Keywords: ${parsedFilters.keywords.join(', ')} • `}
                {parsedFilters.title && `Search: "${parsedFilters.title}"`}
              </span>
            ) : (
              <span>Use type:quote type:link type:image keywords:word1,word2 or just search text</span>
            )}
          </div>
        </div>

        {/* Loading state during auth check */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-center">
              <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mb-4 mx-auto"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading feed...</p>
            </div>
          </div>
        ) : (
          <GlobalFeedDocuments filters={parsedFilters} />
        )}
      </div>
    </div>
  )
}