import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { createOrbitDB } from '@orbitdb/core'
import { multiaddr } from '@multiformats/multiaddr'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import multer from 'multer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.ORBITDB_DATA_DIR || join(__dirname, 'data')

// For testing: We'll use a different approach with OrbitDB v2

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true })

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' })) // Increase limit for base64 encoded images

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() })

const PORT = process.env.PORT || 4001
const WS_PORT = process.env.WS_PORT || 9091
const CHAT_WS_PORT = process.env.CHAT_WS_PORT || 9092
const HOST = '0.0.0.0'

// Track if libp2p is ready
let libp2pReady = false

// Create libp2p node with WebSockets only
const libp2p = await createLibp2p({
  addresses: {
    listen: [`/ip4/${HOST}/tcp/${WS_PORT}/ws`]
  },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
      emitSelf: true
    })
  }
})

// Create Helia and OrbitDB instances
const helia = await createHelia({
  libp2p,
  datastore: null // Will use default
})

// Create UnixFS instance for file storage
const fs_ipfs = unixfs(helia)

const orbitdb = await createOrbitDB({
  ipfs: helia,
  directory: DATA_DIR
})

// Store for opened databases
const databases = new Map()

// Check if libp2p has WebSocket addresses
const wsAddresses = libp2p.getMultiaddrs().filter(addr => 
  addr.toString().includes('/ws')
)
libp2pReady = wsAddresses.length > 0

// Log startup info
console.log('=== OrbitDB Service Started ===')
console.log(`PeerId: ${libp2p.peerId.toString()}`)
console.log(`HTTP API: http://${HOST}:${PORT}`)
console.log(`WebSocket listening on:`)
libp2p.getMultiaddrs().forEach(addr => {
  console.log(`  ${addr.toString()}`)
})
console.log('Encryption: noise')
console.log('Stream Muxer: yamux')
console.log('Services: identify, gossipsub')
console.log('================================')

// Health check endpoint
app.get('/health', (req, res) => {
  if (!libp2pReady) {
    return res.status(503).json({
      ok: false,
      reason: 'starting'
    })
  }

  res.json({
    ok: true,
    peerId: libp2p.peerId.toString(),
    connections: libp2p.getConnections().length
  })
})

// Broadcast notification to all WebSocket clients
app.post('/notify', (req, res) => {
  try {
    const { type, data } = req.body

    const message = JSON.stringify({ type, data, timestamp: Date.now() })

    // Broadcast to all connected chat clients
    chatClients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(message)
      }
    })

    res.json({
      success: true,
      clientCount: chatClients.size
    })
  } catch (error) {
    console.error('Notification error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Peer info endpoint
app.get('/peerinfo', (req, res) => {
  const host = req.get('host')?.split(':')[0] || 'localhost'
  const protocol = req.protocol
  
  // Determine if we're in HTTPS/WSS mode (prod)
  const isSecure = protocol === 'https' || req.get('x-forwarded-proto') === 'https'
  
  // For dev, always use ws. For prod with HTTPS, use wss
  let wsMultiaddrPublic
  if (isSecure) {
    // Production HTTPS mode
    wsMultiaddrPublic = `/dns4/${host}/tcp/${WS_PORT}/wss/p2p/${libp2p.peerId.toString()}`
  } else {
    // Dev mode
    wsMultiaddrPublic = `/dns4/${host}/tcp/${WS_PORT}/ws/p2p/${libp2p.peerId.toString()}`
  }
  
  res.json({
    wsMultiaddrPublic
  })
})

// Open or create a KV store
app.post('/kv/open', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Store name required' })
    }

    // Check if already opened
    if (databases.has(name)) {
      const db = databases.get(name)
      return res.json({ 
        address: db.address.toString(),
        type: 'keyvalue'
      })
    }

    // Open or create the database with identity-based access control
    // For demo: Allow the database creator + specific peer IDs
    const db = await orbitdb.open(name, {
      type: 'keyvalue',
      create: true,
      replicator: true, // Enable replication for P2P sync
      syncAutomatically: true,
      // Access control: database creator has write access by default
      // Additional writers can be granted via /kv/grant endpoint
      accessController: {
        type: 'orbitdb',
        write: [orbitdb.identity.id]  // Only creator can write initially
      }
    })
    
    console.log(`Store created: ${name}`)
    console.log(`Store address: ${db.address}`)
    console.log(`Store identity: ${db.identity.id}`)
    
    databases.set(name, db)
    
    console.log(`Opened KV store: ${name} at ${db.address.toString()}`)
    
    res.json({ 
      address: db.address.toString(),
      type: 'keyvalue'
    })
  } catch (error) {
    console.error('Error opening KV store:', error)
    res.status(500).json({ error: error.message })
  }
})

// DEPRECATED: Put endpoint - clients should write directly to OrbitDB
// Keeping for backward compatibility but will log a warning
app.post('/kv/put', async (req, res) => {
  console.warn('⚠️  DEPRECATED: /kv/put endpoint used. Clients should write directly to OrbitDB.')
  try {
    const { name, key, value } = req.body
    if (!name || !key) {
      return res.status(400).json({ error: 'Store name and key required' })
    }

    const db = databases.get(name)
    if (!db) {
      return res.status(404).json({ error: 'Store not found. Open it first.' })
    }

    const hash = await db.put(key, value)
    console.log(`Put to ${name}: ${key} = ${JSON.stringify(value)}`)

    res.json({ hash, key, value })
  } catch (error) {
    console.error('Error putting to KV store:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get value from KV store
app.get('/kv/get', async (req, res) => {
  try {
    const { name, key } = req.query
    if (!name || !key) {
      return res.status(400).json({ error: 'Store name and key required' })
    }

    const db = databases.get(name)
    if (!db) {
      return res.status(404).json({ error: 'Store not found. Open it first.' })
    }

    const value = await db.get(key)
    console.log(`Get from ${name}: ${key} = ${JSON.stringify(value)}`)
    
    res.json({ key, value })
  } catch (error) {
    console.error('Error getting from KV store:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get all entries from KV store
app.get('/kv/all', async (req, res) => {
  try {
    const { name } = req.query
    if (!name) {
      return res.status(400).json({ error: 'Store name required' })
    }

    const db = databases.get(name)
    if (!db) {
      return res.status(404).json({ error: 'Store not found. Open it first.' })
    }

    const all = await db.all()
    console.log(`Retrieved all entries from ${name}: ${Object.keys(all).length} entries`)

    res.json(all)
  } catch (error) {
    console.error('Error getting all entries:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete entry from KV store
app.post('/kv/delete', async (req, res) => {
  try {
    const { name, key } = req.body
    if (!name || !key) {
      return res.status(400).json({ error: 'Store name and key required' })
    }

    const db = databases.get(name)
    if (!db) {
      return res.status(404).json({ error: 'Store not found. Open it first.' })
    }

    // Delete by setting to null (OrbitDB del method)
    await db.del(key)
    console.log(`Deleted ${key} from ${name}`)

    res.json({ success: true, key })
  } catch (error) {
    console.error('Error deleting from KV store:', error)
    res.status(500).json({ error: error.message })
  }
})

// Grant write access to another peer
app.post('/kv/grant', async (req, res) => {
  try {
    const { name, peerId } = req.body
    if (!name || !peerId) {
      return res.status(400).json({ error: 'Store name and peerId required' })
    }

    const db = databases.get(name)
    if (!db) {
      return res.status(404).json({ error: 'Store not found. Open it first.' })
    }

    // Grant write access (if database supports it)
    if (db.access && db.access.grant) {
      await db.access.grant('write', peerId)
      console.log(`Granted write access to ${peerId} on ${name}`)
      res.json({ success: true, peerId, access: 'write' })
    } else {
      res.status(501).json({ error: 'Access control not supported for this database type' })
    }
  } catch (error) {
    console.error('Error granting access:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get database access info
app.get('/kv/access', async (req, res) => {
  try {
    const { name } = req.query
    if (!name) {
      return res.status(400).json({ error: 'Store name required' })
    }

    const db = databases.get(name)
    if (!db) {
      return res.status(404).json({ error: 'Store not found. Open it first.' })
    }

    const accessInfo = {
      type: db.access?.type || 'unknown',
      write: db.access?.write || [],
      creator: db.identity?.id
    }

    res.json(accessInfo)
  } catch (error) {
    console.error('Error getting access info:', error)
    res.status(500).json({ error: error.message })
  }
})

// ===== IPFS Content Storage Endpoints =====

/**
 * Upload content to IPFS
 * Supports both file uploads (multipart/form-data) and JSON text content
 * Returns CID (Content Identifier)
 */
app.post('/ipfs/upload', upload.single('file'), async (req, res) => {
  try {
    let content
    let contentType

    // Handle file upload (for images)
    if (req.file) {
      content = req.file.buffer
      contentType = req.file.mimetype
    }
    // Handle text content from JSON body (for quotes/links)
    else if (req.body.content) {
      content = new TextEncoder().encode(req.body.content)
      contentType = req.body.contentType || 'text/plain'
    }
    else {
      return res.status(400).json({ error: 'No content provided. Send either a file or { content: "text" }' })
    }

    // Add content to IPFS using UnixFS
    const cid = await fs_ipfs.addBytes(content)

    console.log(`✓ Uploaded to IPFS: ${cid.toString()} (${contentType})`)

    res.json({
      cid: cid.toString(),
      size: content.length,
      contentType
    })
  } catch (error) {
    console.error('Error uploading to IPFS:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Retrieve content from IPFS by CID
 * Returns the raw bytes with appropriate Content-Type header
 */
app.get('/ipfs/retrieve/:cid', async (req, res) => {
  try {
    const { cid } = req.params

    // Get content from IPFS
    const chunks = []
    for await (const chunk of fs_ipfs.cat(cid)) {
      chunks.push(chunk)
    }

    const content = Buffer.concat(chunks)

    console.log(`✓ Retrieved from IPFS: ${cid} (${content.length} bytes)`)

    // Set appropriate headers
    const contentType = req.query.contentType || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', content.length)
    res.send(content)
  } catch (error) {
    console.error('Error retrieving from IPFS:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Retrieve content from IPFS as base64
 * Useful for embedding images directly in JSON responses
 */
app.get('/ipfs/retrieve-base64/:cid', async (req, res) => {
  try {
    const { cid } = req.params

    // Get content from IPFS
    const chunks = []
    for await (const chunk of fs_ipfs.cat(cid)) {
      chunks.push(chunk)
    }

    const content = Buffer.concat(chunks)
    const base64 = content.toString('base64')

    console.log(`✓ Retrieved from IPFS as base64: ${cid} (${content.length} bytes)`)

    res.json({
      cid,
      base64,
      size: content.length,
      contentType: req.query.contentType || 'application/octet-stream'
    })
  } catch (error) {
    console.error('Error retrieving from IPFS:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create HTTP server for both Express and WebSocket
const httpServer = createServer(app)

// Create WebSocket server for chat signaling
const wss = new WebSocketServer({ server: httpServer, path: '/chat' })

// Track connected clients
const chatClients = new Set()

wss.on('connection', (ws) => {
  console.log('Chat client connected')
  chatClients.add(ws)

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString())

      // Broadcast to all connected clients except sender
      chatClients.forEach((client) => {
        if (client !== ws && client.readyState === 1) { // 1 = OPEN
          client.send(JSON.stringify(data))
        }
      })
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  })

  ws.on('close', () => {
    console.log('Chat client disconnected')
    chatClients.delete(ws)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
    chatClients.delete(ws)
  })
})

// Start HTTP server with WebSocket
httpServer.listen(PORT, HOST, () => {
  console.log(`HTTP API listening on http://${HOST}:${PORT}`)
  console.log(`Chat WebSocket listening on ws://${HOST}:${PORT}/chat`)
})