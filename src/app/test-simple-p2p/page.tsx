'use client'

import { useState, useEffect, useRef } from 'react'

// SimpleP2P class type for proper typing
interface SimpleP2PType {
  connect: (signalServer: string) => Promise<void>
  onMessage: (callback: (data: any, fromPeer: string) => void) => void
  onPeer: (callback: (peerId: string, connected: boolean) => void) => void
  broadcast: (data: any) => void
  getConnectedPeers: () => string[]
  disconnect: () => void
}

export default function TestSimpleP2P() {
  const [status, setStatus] = useState('Initializing...')
  const [peerId] = useState(() => `peer-${Math.random().toString(36).substr(2, 9)}`)
  const [peers, setPeers] = useState<string[]>([])
  const [entries, setEntries] = useState<Map<string, string>>(new Map())
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const p2pRef = useRef<SimpleP2PType | null>(null)
  const dataRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    initP2P()
    return () => {
      p2pRef.current?.disconnect()
    }
  }, [])

  const initP2P = async () => {
    try {
      setStatus('Loading P2P module...')

      // Dynamic import to avoid SSR issues
      const { SimpleP2P } = await import('@/lib/simple-p2p')
      const p2p = new SimpleP2P(peerId)
      p2pRef.current = p2p

      setStatus('Connecting to signaling server...')
      
      // Set up message handler
      p2p.onMessage((data, fromPeer) => {
        console.log(`Received from ${fromPeer}:`, data)
        
        if (data.type === 'update') {
          dataRef.current.set(data.key, data.value)
          setEntries(new Map(dataRef.current))
        } else if (data.type === 'sync') {
          // Sync request - send all our data
          dataRef.current.forEach((value, key) => {
            p2p.broadcast({ type: 'update', key, value })
          })
        } else if (data.type === 'delete') {
          dataRef.current.delete(data.key)
          setEntries(new Map(dataRef.current))
        }
      })
      
      // Set up peer connection handler
      p2p.onPeer((peerId, connected) => {
        console.log(`Peer ${peerId} ${connected ? 'connected' : 'disconnected'}`)
        if (connected) {
          // Request sync when new peer connects
          p2p.broadcast({ type: 'sync' })
        }
        setPeers(p2p.getConnectedPeers())
      })
      
      // Connect to signaling server
      const signalServer = window.location.origin
      await p2p.connect(signalServer)
      
      setStatus('Connected! Waiting for peers...')
    } catch (error: any) {
      console.error('P2P initialization error:', error)
      setStatus(`Error: ${error.message}`)
    }
  }

  const handlePut = () => {
    if (!key || !value || !p2pRef.current) return
    
    // Update local data
    dataRef.current.set(key, value)
    setEntries(new Map(dataRef.current))
    
    // Broadcast to peers
    p2pRef.current.broadcast({ type: 'update', key, value })
    
    setKey('')
    setValue('')
    setStatus(`Added: ${key} = ${value}`)
  }

  const handleDelete = (k: string) => {
    if (!p2pRef.current) return
    
    // Update local data
    dataRef.current.delete(k)
    setEntries(new Map(dataRef.current))
    
    // Broadcast to peers
    p2pRef.current.broadcast({ type: 'delete', key: k })
    
    setStatus(`Deleted: ${k}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
          Simple P2P Test (WebRTC + Socket.IO)
        </h1>
        
        {/* Status Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            P2P Status
          </h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold">Status:</span> {status}</p>
            <p><span className="font-semibold">Your Peer ID:</span> {peerId}</p>
            <p><span className="font-semibold">Connected Peers:</span> {peers.length}</p>
          </div>
        </div>

        {/* Connected Peers */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Connected Peers ({peers.length})
          </h2>
          {peers.length === 0 ? (
            <p className="text-gray-500">No peers connected yet. Open this page in another browser!</p>
          ) : (
            <ul className="space-y-1">
              {peers.map((peer, i) => (
                <li key={i} className="text-xs font-mono text-gray-600 dark:text-gray-400">
                  {peer}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add Entry */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Add Entry (P2P)
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
            <input
              type="text"
              placeholder="Value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
            <button
              onClick={handlePut}
              disabled={!key || !value}
              className={`px-4 py-2 rounded text-white ${
                key && value 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Add & Broadcast
            </button>
          </div>
        </div>

        {/* Entries */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Shared Data ({entries.size} entries)
          </h2>
          <div className="space-y-2">
            {entries.size === 0 ? (
              <p className="text-gray-500">No data yet. Add some entries!</p>
            ) : (
              Array.from(entries.entries()).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded">
                  <span className="font-mono text-sm">
                    {k}: {v}
                  </span>
                  <button
                    onClick={() => handleDelete(k)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            How This Works:
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>Each browser gets a unique Peer ID</li>
            <li>Socket.IO handles signaling (peer discovery)</li>
            <li>WebRTC DataChannels handle direct P2P data transfer</li>
            <li>Data syncs automatically when peers connect</li>
            <li>Works best with 2+ browsers on same network</li>
          </ol>
        </div>
      </div>
    </div>
  )
}