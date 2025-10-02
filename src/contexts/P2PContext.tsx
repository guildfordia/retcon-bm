'use client'

import React, { createContext, useContext, useState, useRef } from 'react'
import { P2PCollectionSystem } from '@/lib/p2p-collections'
import { SimpleP2P } from '@/lib/simple-p2p'
import { MockP2PSystem } from '@/lib/p2p-loader'

// Temporary stub types for missing P2P modules
type P2PPresenceSystem = any
type PresenceEntry = {
  peerId: string
  username: string
  lastSeen: number
}

interface P2PContextType {
  collectionSystem: P2PCollectionSystem | null
  presenceSystem: P2PPresenceSystem | null
  isConnected: boolean
  peerId: string
  peerCount: number
  onlineUsers: PresenceEntry[]
  initializeP2P: (userId: string) => Promise<void>
}

const P2PContext = createContext<P2PContextType>({
  collectionSystem: null,
  presenceSystem: null,
  isConnected: false,
  peerId: '',
  peerCount: 0,
  onlineUsers: [],
  initializeP2P: async () => {}
})

export function P2PProvider({ children }: { children: React.ReactNode }) {
  const [collectionSystem, setCollectionSystem] = useState<P2PCollectionSystem | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [peerId, setPeerId] = useState('')
  const [peerCount, setPeerCount] = useState(0)
  const [onlineUsers, setOnlineUsers] = useState<PresenceEntry[]>([])
  const initializingRef = useRef(false)
  const simpleP2PRef = useRef<SimpleP2P | null>(null)

  const initializeP2P = async (userId: string) => {
    // Prevent duplicate initialization
    if (initializingRef.current || isConnected) {
      // Silently skip - this is normal behavior
      return
    }

    initializingRef.current = true

    try {
      console.log('Initializing P2P system for user:', userId)

      // Create collection system
      const p2pCollectionSystem = new P2PCollectionSystem()
      await p2pCollectionSystem.initialize()
      setCollectionSystem(p2pCollectionSystem)

      // Note: SimpleP2P signaling is disabled for demo
      // Using OrbitDB's built-in P2P capabilities instead
      // simpleP2PRef.current is kept null

      setPeerId(userId)
      setIsConnected(true)
      setPeerCount(1) // Self

      console.log('P2P system initialized successfully')
    } catch (error) {
      console.error('P2P initialization failed:', error)
      // Set minimal working state even if connection fails
      setCollectionSystem(new P2PCollectionSystem())
      setPeerId(userId)
      setIsConnected(false)
      setPeerCount(0)
    } finally {
      initializingRef.current = false
    }
  }

  const value: P2PContextType = {
    collectionSystem,
    presenceSystem: null,
    isConnected,
    peerId,
    peerCount,
    onlineUsers,
    initializeP2P
  }

  return (
    <P2PContext.Provider value={value}>
      {children}
    </P2PContext.Provider>
  )
}

export function useP2P() {
  const context = useContext(P2PContext)
  if (!context) {
    throw new Error('useP2P must be used within a P2PProvider')
  }
  return context
}