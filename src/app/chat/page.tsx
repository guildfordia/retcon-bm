/**
 * P2P Chat Page
 *
 * IRC-style chat interface with a single global channel.
 * Messages are stored in OrbitDB for P2P distribution.
 */

'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface ChatMessage {
  id: string
  userId: string
  username: string
  message: string
  type: 'message' | 'join' | 'leave' | 'system'
  timestamp: number
  channel: string
}

interface OnlineUser {
  userId: string
  username: string
  lastSeen: number
  status: string
}

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [offlineUsers, setOfflineUsers] = useState<OnlineUser[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)


  // Connect to WebSocket
  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/chat-ws`

    console.log('Connecting to WebSocket:', wsUrl)
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected')
      wsRef.current = ws
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // Real-time notification - reload chat data
        if (data.type === 'chat_update' || data.type === 'presence_update') {
          loadChat()
        }
      } catch (error) {
        console.error('WebSocket message error:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      wsRef.current = null

      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...')
        connectWebSocket()
      }, 3000)
    }

    return ws
  }

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('token')
    const userId = localStorage.getItem('userId')
    const username = localStorage.getItem('username')

    if (!token || !userId) {
      router.push('/auth')
      return
    }

    setCurrentUser({ id: userId, username: username || 'Anonymous' })

    // Initial load
    loadChat()

    // Send join message
    sendJoinMessage(username || 'Anonymous')

    // Connect WebSocket for real-time updates
    connectWebSocket()

    // Send presence heartbeat every 30 seconds
    presenceIntervalRef.current = setInterval(() => {
      updatePresence()
    }, 30000)

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current)
      }
      // Send leave message
      sendLeaveMessage(username || 'Anonymous')
    }
  }, [])

  const loadChat = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/chat', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
        setOnlineUsers(data.onlineUsers || [])
        setOfflineUsers(data.offlineUsers || [])
      }
    } catch (error) {
      console.error('Failed to load chat:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim()) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: inputMessage,
          type: 'message'
        })
      })

      if (response.ok) {
        setInputMessage('')
        // Immediately reload to show the message
        await loadChat()
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const sendJoinMessage = async (username: string) => {
    try {
      const token = localStorage.getItem('token')
      await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: `${username} has joined #global`,
          type: 'join'
        })
      })
    } catch (error) {
      console.error('Failed to send join message:', error)
    }
  }

  const sendLeaveMessage = async (username: string) => {
    try {
      const token = localStorage.getItem('token')
      await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: `${username} has left #global`,
          type: 'leave'
        })
      })
    } catch (error) {
      console.error('Failed to send leave message:', error)
    }
  }

  const updatePresence = async () => {
    try {
      const token = localStorage.getItem('token')
      await fetch('/api/chat', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'online'
        })
      })
    } catch (error) {
      console.error('Failed to update presence:', error)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'join': return 'text-gray-600 dark:text-gray-400'
      case 'leave': return 'text-gray-600 dark:text-gray-400'
      case 'system': return 'text-gray-600 dark:text-gray-400'
      default: return 'text-gray-900 dark:text-gray-100'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Connecting to chat...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Chat</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Global P2P chat - {messages.length} messages
          </p>
        </div>

      <div className="flex h-[600px] border border-gray-300 dark:border-gray-700">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col bg-white dark:bg-black">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1 text-sm">
            {messages.map((msg) => (
              <div key={msg.id} className={`${getMessageColor(msg.type)}`}>
                <span className="text-gray-500 dark:text-gray-500">[{formatTime(msg.timestamp)}]</span>
                {' '}
                {msg.type === 'message' ? (
                  <>
                    <span className={msg.userId === currentUser?.id ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-600 dark:text-gray-400 font-semibold'}>
                      &lt;{msg.username}&gt;
                    </span>
                    {' '}
                    <span className="text-gray-900 dark:text-gray-100">{msg.message}</span>
                  </>
                ) : (
                  <span className="italic">* {msg.message}</span>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-300 dark:border-gray-700 bg-white dark:bg-black p-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 bg-white dark:bg-black border border-gray-300 dark:border-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-gray-100"
                autoFocus
              />
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim()}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Send
              </button>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-2">
              Press Enter to send
            </p>
          </div>
        </div>

        {/* Users sidebar */}
        <div className="w-64 bg-white dark:bg-black border-l border-gray-300 dark:border-gray-700 overflow-y-auto">
          {/* Online Users */}
          <div className="p-4 border-b border-gray-300 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              ONLINE ({onlineUsers.length})
            </h2>
          </div>
          <div className="p-2 space-y-1 border-b border-gray-300 dark:border-gray-700 pb-4">
            {onlineUsers.map((user) => (
              <div
                key={user.userId}
                className="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-900"
              >
                <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100"></div>
                <span className={`text-sm ${user.userId === currentUser?.id ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                  {user.username}
                  {user.userId === currentUser?.id && ' (you)'}
                </span>
              </div>
            ))}
            {onlineUsers.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
                No users online
              </p>
            )}
          </div>

          {/* Offline Users */}
          <div className="p-4 border-b border-gray-300 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
              OFFLINE ({offlineUsers.length})
            </h2>
          </div>
          <div className="p-2 space-y-1">
            {offlineUsers.map((user) => (
              <div
                key={user.userId}
                className="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-900"
              >
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-600"></div>
                <span className="text-sm text-gray-500 dark:text-gray-500">
                  {user.username}
                </span>
              </div>
            ))}
            {offlineUsers.length === 0 && (
              <p className="text-gray-500 dark:text-gray-500 text-sm text-center py-4">
                No offline users
              </p>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}