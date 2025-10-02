// @ts-nocheck
'use client'

import { useState } from 'react'
import { useP2P } from '@/contexts/P2PContext'

export default function OnlineUsers() {
  const { onlineUsers, isConnected } = useP2P()
  const [isExpanded, setIsExpanded] = useState(true)

  if (!isConnected) {
    return null
  }

  const formatLastSeen = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="fixed right-4 top-20 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg z-40">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 border-b dark:border-gray-700 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <div className="relative">
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            {onlineUsers.length > 0 && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">
            Online Users ({onlineUsers.length})
          </span>
        </div>
        <svg 
          className={`w-4 h-4 text-gray-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* User List */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {onlineUsers.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              No other users online
            </div>
          ) : (
            <div className="divide-y dark:divide-gray-700">
              {onlineUsers.map(user => (
                <div 
                  key={user.ownerPubKey} 
                  className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  title={`Peer ID: ${user.peerId}\nLast seen: ${formatLastSeen(user.lastSeen)}`}
                >
                  <div className="flex items-start space-x-3">
                    {/* Avatar placeholder */}
                    <div className="relative">
                      <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                        <span className="text-gray-600 dark:text-gray-300 font-semibold">
                          {(user.username || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusColor(user.status)} rounded-full border-2 border-white dark:border-gray-800`}></div>
                    </div>

                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {user.username || user.ownerPubKey.slice(0, 8) + '...'}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatLastSeen(user.lastSeen)}
                        </span>
                      </div>
                      
                      {/* Collections info */}
                      {user.collections && user.collections.length > 0 && (
                        <div className="mt-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {user.collections.length} collection{user.collections.length !== 1 ? 's' : ''}
                            {user.collections.reduce((sum: number, c: any) => sum + c.count, 0) > 0 &&
                              ` • ${user.collections.reduce((sum: number, c: any) => sum + c.count, 0)} docs`
                            }
                          </p>
                          
                          {/* Collection badges */}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {user.collections.slice(0, 3).map((collection, idx) => (
                              <span 
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                title={`${collection.count} documents • Updated ${formatLastSeen(collection.lastUpdated)}`}
                              >
                                {collection.name}
                              </span>
                            ))}
                            {user.collections.length > 3 && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                +{user.collections.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Peer ID on hover/inspect */}
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-1 opacity-0 hover:opacity-100 transition-opacity">
                        {user.peerId.slice(0, 20)}...
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {isExpanded && onlineUsers.length > 0 && (
        <div className="p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Presence updates every 30s
          </p>
        </div>
      )}
    </div>
  )
}