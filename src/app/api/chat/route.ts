/**
 * P2P Chat API
 *
 * IRC-style chat system using OrbitDB for message storage.
 * All messages are stored in a single global chat channel.
 *
 * Features:
 * - Real-time P2P messaging
 * - Persistent message history in OrbitDB
 * - User presence tracking
 * - Single global channel (like IRC)
 */

import { NextRequest, NextResponse } from 'next/server'
import { orbitdbClient } from '@/lib/orbitdb-client'
import { verifyAuth } from '@/lib/auth-middleware'

const CHAT_STORE_NAME = 'global-p2p-chat'
const PRESENCE_STORE_NAME = 'chat-presence'

// Notify WebSocket clients about chat updates
async function notifyClients(type: 'chat_update' | 'presence_update') {
  try {
    const orbitdbUrl = process.env.ORBITDB_SERVICE_URL || 'http://orbitdb:4001'
    await fetch(`${orbitdbUrl}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data: {} })
    })
  } catch (error) {
    // Silently fail - WebSocket is for real-time updates only
    console.error('WebSocket notification error:', error)
  }
}

/**
 * GET /api/chat
 *
 * Retrieve chat messages and all users (online/offline)
 *
 * Query params:
 * - limit: Number of recent messages to fetch (default: 100)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')

    // Ensure chat store exists
    await orbitdbClient.openKV(CHAT_STORE_NAME)
    await orbitdbClient.openKV(PRESENCE_STORE_NAME)

    // Get all messages
    const allMessages = await orbitdbClient.getAllKV(CHAT_STORE_NAME)

    // Convert to array and sort by timestamp
    const messages = Object.entries(allMessages)
      .filter(([key]) => key.startsWith('msg-'))
      .map(([_, value]) => value)
      .sort((a: any, b: any) => a.timestamp - b.timestamp)
      .slice(-limit) // Get last N messages

    // Get all presence data
    const allPresence = await orbitdbClient.getAllKV(PRESENCE_STORE_NAME)
    const now = Date.now()

    // Collect all registered users from presence store
    const allRegisteredUsers = Object.entries(allPresence)
      .filter(([key]) => key.startsWith('user-'))
      .map(([_, value]: [string, any]) => value)

    // Split into online (active in last 2 minutes) and offline
    const onlineUsers = allRegisteredUsers
      .filter((user: any) => now - user.lastSeen < 120000)
      .sort((a: any, b: any) => b.lastSeen - a.lastSeen)

    const offlineUsers = allRegisteredUsers
      .filter((user: any) => now - user.lastSeen >= 120000)
      .sort((a: any, b: any) => b.lastSeen - a.lastSeen)

    return NextResponse.json({
      messages,
      onlineUsers,
      offlineUsers,
      channelName: '#global',
      totalMessages: messages.length
    })

  } catch (error) {
    console.error('Chat GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat messages', details: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/chat
 *
 * Send a new message to the chat
 *
 * Body:
 * - message: string - The chat message
 * - type: 'message' | 'join' | 'leave' - Message type (default: 'message')
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { message, type = 'message' } = body

    if (!message && type === 'message') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Ensure chat store exists
    await orbitdbClient.openKV(CHAT_STORE_NAME)
    await orbitdbClient.openKV(PRESENCE_STORE_NAME)

    const timestamp = Date.now()
    const messageId = `msg-${timestamp}-${Math.random().toString(36).substr(2, 9)}`

    // Create message object
    const chatMessage = {
      id: messageId,
      userId: user.id,
      username: user.username,
      message,
      type,
      timestamp,
      channel: '#global'
    }

    // Store message in OrbitDB
    await orbitdbClient.putKV(CHAT_STORE_NAME, messageId, chatMessage)

    // Update user presence
    await orbitdbClient.putKV(PRESENCE_STORE_NAME, `user-${user.id}`, {
      userId: user.id,
      username: user.username,
      lastSeen: timestamp,
      status: 'online'
    })

    // Notify WebSocket clients
    await notifyClients('chat_update')

    return NextResponse.json({
      message: 'Message sent',
      data: chatMessage
    }, { status: 201 })

  } catch (error) {
    console.error('Chat POST error:', error)
    return NextResponse.json(
      { error: 'Failed to send message', details: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/chat
 *
 * Update user presence (heartbeat)
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { status = 'online' } = body

    // Ensure presence store exists
    await orbitdbClient.openKV(PRESENCE_STORE_NAME)

    // Update user presence
    await orbitdbClient.putKV(PRESENCE_STORE_NAME, `user-${user.id}`, {
      userId: user.id,
      username: user.username,
      lastSeen: Date.now(),
      status
    })

    // Notify WebSocket clients
    await notifyClients('presence_update')

    return NextResponse.json({
      message: 'Presence updated'
    })

  } catch (error) {
    console.error('Chat presence error:', error)
    return NextResponse.json(
      { error: 'Failed to update presence', details: (error as Error).message },
      { status: 500 }
    )
  }
}