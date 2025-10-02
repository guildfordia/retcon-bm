'use client'

import { useState, useEffect, useRef } from 'react'

export default function TestP2P() {
  const [status, setStatus] = useState('Initializing...')
  const [peerId, setPeerId] = useState('')
  const [connected, setConnected] = useState(false)
  const [peers, setPeers] = useState<string[]>([])
  const [storeAddress, setStoreAddress] = useState('')
  const [entries, setEntries] = useState<any[]>([])
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  
  const libp2pRef = useRef<any>(null)
  const orbitdbRef = useRef<any>(null)
  const dbRef = useRef<any>(null)

  useEffect(() => {
    initP2P()
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = async () => {
    try {
      if (dbRef.current) await dbRef.current.close()
      if (orbitdbRef.current) await orbitdbRef.current.stop()
      if (libp2pRef.current) await libp2pRef.current.stop()
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  }

  const initP2P = async () => {
    try {
      setStatus('Loading P2P modules...')
      
      // Step 1: Import modules with better error handling
      const { loadP2PModules, createP2PNode } = await import('@/lib/p2p-loader')
      const modules = await loadP2PModules((msg) => setStatus(msg))
      
      if (!modules) {
        setStatus('Failed to load P2P modules. Try refreshing the page.')
        setLoading(false)
        return
      }

      const { createHelia, createOrbitDB, multiaddr } = modules
      
      setStatus('Getting server peer info...')
      
      // Step 2: Get server peer info for bootstrap
      const baseUrl = window.location.origin
      const peerInfoRes = await fetch(`${baseUrl}/orbitdb/peerinfo`)
      
      if (!peerInfoRes.ok) {
        throw new Error('Failed to get server peer info')
      }
      
      const peerInfo = await peerInfoRes.json()
      console.log('Server peer:', peerInfo)
      
      setStatus('Creating P2P node...')
      
      // Step 3: Create libp2p with minimal config for browser
      const libp2p = await createP2PNode(modules)
      
      libp2pRef.current = libp2p
      setPeerId(libp2p.peerId.toString())
      
      // Step 4: Try to connect to server peer
      setStatus('Connecting to server...')
      try {
        // Use WebSocket connection through proxy
        const wsAddr = `/dns4/${window.location.hostname}/tcp/${window.location.port || '443'}/wss/p2p/${peerInfo.wsMultiaddrPublic.split('/').pop()}`
        console.log('Attempting connection to:', wsAddr)
        
        await libp2p.dial(multiaddr(wsAddr))
        setConnected(true)
        setStatus('Connected to server!')
      } catch (err) {
        console.warn('Could not connect to server directly:', err)
        setStatus('Running in standalone mode')
      }
      
      // Step 5: Create Helia and OrbitDB
      setStatus('Initializing OrbitDB...')
      
      const helia = await createHelia({ 
        libp2p,
        start: false
      })
      
      await helia.start()
      
      const orbitdb = await createOrbitDB({ 
        ipfs: helia,
        directory: './orbitdb'
      })
      
      orbitdbRef.current = orbitdb
      
      // Step 6: Open or create database
      setStatus('Opening database...')
      
      const db = await orbitdb.open('test-p2p-store', {
        type: 'keyvalue',
        create: true
      })
      
      dbRef.current = db
      setStoreAddress(db.address.toString())
      
      // Set up event listeners
      db.events.on('update', async () => {
        console.log('Database updated')
        await loadEntries()
      })
      
      libp2p.addEventListener('peer:connect', (evt: any) => {
        console.log('Peer connected:', evt.detail.id.toString())
        updatePeers()
      })
      
      libp2p.addEventListener('peer:disconnect', (evt: any) => {
        console.log('Peer disconnected:', evt.detail.id.toString())
        updatePeers()
      })
      
      // Load initial data
      await loadEntries()
      
      setStatus('P2P Ready!')
      setLoading(false)
      
    } catch (error: any) {
      console.error('P2P initialization error:', error)
      setStatus(`Error: ${error.message}`)
      setLoading(false)
    }
  }


  const updatePeers = () => {
    if (!libp2pRef.current) return
    const connections = libp2pRef.current.getConnections()
    setPeers(connections.map((c: any) => c.remotePeer.toString()))
  }

  const loadEntries = async () => {
    if (!dbRef.current) return
    const all = await dbRef.current.all()
    setEntries(Object.entries(all))
  }

  const handlePut = async () => {
    if (!dbRef.current || !key || !value) return
    
    try {
      await dbRef.current.put(key, value)
      setKey('')
      setValue('')
      setStatus(`Added: ${key} = ${value}`)
      await loadEntries()
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }
  }

  const handleDelete = async (k: string) => {
    if (!dbRef.current) return
    
    try {
      await dbRef.current.del(k)
      setStatus(`Deleted: ${k}`)
      await loadEntries()
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
          Full P2P OrbitDB Test
        </h1>
        
        {/* Status Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            P2P Status
          </h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold">Status:</span> {status}</p>
            <p><span className="font-semibold">Peer ID:</span> {peerId || 'Not initialized'}</p>
            <p><span className="font-semibold">Connected:</span> 
              <span className={connected ? 'text-green-600 ml-2' : 'text-red-600 ml-2'}>
                {connected ? ' Connected' : '○ Disconnected'}
              </span>
            </p>
            <p><span className="font-semibold">Store Address:</span> {storeAddress || 'Not opened'}</p>
          </div>
        </div>

        {/* Connected Peers */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Connected Peers ({peers.length})
          </h2>
          {peers.length === 0 ? (
            <p className="text-gray-500">No peers connected</p>
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
        {!loading && (
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
                Add to P2P Store
              </button>
            </div>
          </div>
        )}

        {/* Entries */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            P2P Store Entries ({entries.length})
          </h2>
          <div className="space-y-2">
            {entries.length === 0 ? (
              <p className="text-gray-500">No entries yet</p>
            ) : (
              entries.map(([k, v]) => (
                <div key={k} className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded">
                  <span className="font-mono text-sm">
                    {k}: {JSON.stringify(v)}
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
            How to Test P2P:
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>Open this page in two different browsers or devices</li>
            <li>Both should show their unique Peer IDs</li>
            <li>Add data in one browser</li>
            <li>Data should appear in the other browser automatically</li>
            <li>Works best with multiple tabs/windows</li>
          </ol>
        </div>
      </div>
    </div>
  )
}