// Singleton P2P Core Module
// This module ensures that libp2p, Helia, and OrbitDB are only initialized once per browser tab
// 
// ARCHITECTURE:
// - Browser: WebRTC (listen) + WebSockets (dial-only) + Circuit Relay
// - Server: TCP + WebSockets (listen) + Relay Hop
// - Never create WebSocket listeners in browser!

import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { createHelia } from 'helia'
import { createOrbitDB } from '@orbitdb/core'

export interface P2PCore {
  libp2p: any
  helia: any
  orbitdb: any
  userId: string
  started: boolean
  initTime: number
}

// Store singleton on globalThis to survive HMR/Fast Refresh
declare global {
  var __P2P_CORE__: P2PCore | undefined
}

let initializationPromise: Promise<P2PCore> | null = null

export async function getOrCreateP2PCore(
  userId: string,
  onProgress?: (msg: string) => void
): Promise<P2PCore> {
  // Ensure we're only running in browser
  if (typeof window === 'undefined') {
    throw new Error('P2P Core can only be initialized in the browser')
  }
  
  const progress = (msg: string) => {
    console.log(' P2P Core:', msg)
    onProgress?.(msg)
  }
  
  // Version marker to ensure we're using the latest code
  progress('P2P Core Version: 4.0 - libp2p v1.x with compatible packages')

  // Check if we already have a core instance for this user
  if (globalThis.__P2P_CORE__) {
    const core = globalThis.__P2P_CORE__
    
    // If it's the same user, return existing instance
    if (core.userId === userId && core.started) {
      progress(`Reusing existing P2P core (initialized ${Math.round((Date.now() - core.initTime) / 1000)}s ago)`)
      return core
    }
    
    // If different user, need to stop and recreate
    if (core.userId !== userId) {
      progress('Different user detected, stopping existing P2P core...')
      await stopP2PCore()
    }
  }

  // Prevent concurrent initialization
  if (initializationPromise) {
    progress('P2P core initialization already in progress, waiting...')
    return initializationPromise
  }

  // Start new initialization
  initializationPromise = initializeP2PCore(userId, progress)
  
  try {
    const core = await initializationPromise
    return core
  } finally {
    initializationPromise = null
  }
}

async function initializeP2PCore(
  userId: string,
  progress: (msg: string) => void
): Promise<P2PCore> {
  try {
    progress(' === INITIALIZING P2P CORE SINGLETON ===')
    progress(` User ID: ${userId}`)
    
    // Create libp2p node
    progress('Creating libp2p node...')
    
    // Browser can only listen on WebRTC, not WebSocket
    const isBrowser = typeof window !== 'undefined'
    
    // Build configuration step by step
    let config: any = {
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {},
      connectionGater: {
        denyDialMultiaddr: async () => false
      }
    }
    
    if (isBrowser) {
      progress(' Configuring BROWSER transports...')
      
      // Step 1: Start with WebRTC only
      progress('Step 1: Adding WebRTC transport...')
      try {
        const { webRTC } = await import('@libp2p/webrtc')
        config.transports = [webRTC()]
        config.addresses = {
          listen: ['/webrtc'] // ONLY WebRTC listening
        }
        progress(' WebRTC transport configured (listen on /webrtc)')
      } catch (err) {
        progress(' WebRTC not available: ' + err)
        config.transports = []
        config.addresses = { listen: [] }
      }
      
      // Step 2: Add WebSockets (dial-only)
      progress('Step 2: Adding WebSocket transport (dial-only)...')
      config.transports.push(
        webSockets() // WebSockets transport for dial-only
      )
      progress(' WebSocket transport added (dial-only for WSS)')
      
      // Step 3: Add circuit relay
      progress('Step 3: Adding circuit relay...')
      config.transports.push(circuitRelayTransport())
      progress(' Circuit relay transport added')
      
      // Step 4: Add services
      progress('Step 4: Adding services...')
      config.services.identify = identify()
      config.services.pubsub = gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: true,
        canRelayMessage: true,
        fallbackToFloodsub: true,
        floodPublish: true,
        doPX: false
      })
      progress(' Services added (identify, gossipsub)')
      
      progress(' Browser configuration complete:')
      progress('   → Listen: /webrtc only')
      progress('   → WebSockets: dial-only (no listening!)')
      progress('   → Circuit relay enabled for NAT traversal')
      
    } else {
      progress('  Configuring SERVER transports...')
      
      // Server configuration (Node.js environment)
      config.transports = []
      
      // 1. TCP transport
      try {
        const { tcp } = await import('@libp2p/tcp')
        config.transports.push(tcp())
        progress(' TCP transport added')
      } catch (err) {
        progress(' TCP not available (normal in some environments)')
      }
      
      // 2. WebSockets with LISTENING enabled for browser connections
      config.transports.push(
        webSockets() // WebSocket transport with listening
      )
      progress(' WebSocket transport added (with listeners)')
      
      // 3. Circuit relay hop - act as relay for browser peers
      const { circuitRelayServer } = await import('@libp2p/circuit-relay-v2')
      config.services.relay = circuitRelayServer({
        reservations: {
          maxReservations: 100
        }
      })
      progress(' Circuit relay server (hop) added')
      
      // Add services
      config.services.identify = identify()
      config.services.pubsub = gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: true,
        canRelayMessage: true,
        fallbackToFloodsub: true,
        floodPublish: true,
        doPX: false
      })
      
      //  SERVER: Listen on TCP and WebSocket for browser connections
      config.addresses = {
        listen: [
          '/ip4/0.0.0.0/tcp/9091/ws',  // WebSocket for browser connections
          '/ip6/::/tcp/9091/ws',        // IPv6 WebSocket
          '/ip4/0.0.0.0/tcp/9092',      // TCP for server-to-server
          '/ip6/::/tcp/9092'            // IPv6 TCP
        ]
      }
      progress(' Server listen: TCP + WebSocket')
      progress('   → /tcp/9091/ws - browsers can dial this')
      progress('   → /tcp/9092 - server-to-server connections')
    }
    
    // Log the config for debugging
    progress('Libp2p config: ' + JSON.stringify({
      hasAddresses: !!config.addresses,
      listenCount: config.addresses?.listen?.length || 0,
      transportCount: config.transports?.length || 0,
      servicesCount: Object.keys(config.services || {}).length
    }))
    
    // Create the libp2p node
    progress('About to create libp2p with config...')
    let libp2p
    try {
      libp2p = await createLibp2p(config)
      progress(' libp2p instance created successfully')
    } catch (err) {
      progress(' Failed to create libp2p: ' + err)
      throw err
    }
    
    progress('Starting libp2p...')
    await libp2p.start()
    const peerId = libp2p.peerId.toString()
    progress(` Libp2p started with Peer ID: ${peerId}`)
    
    // Try to connect to bootstrap peers if available
    progress('Checking for bootstrap connections...')
    // Bootstrap connection will be handled by the application layer
    // to avoid version conflicts with multiaddr
    
    // Create Helia (IPFS) using the same libp2p instance
    progress('Creating Helia (IPFS)...')
    const helia = await createHelia({ libp2p })
    progress(' Helia created with existing libp2p instance')
    
    // Create OrbitDB
    progress('Creating OrbitDB...')
    const orbitdb = await createOrbitDB({
      ipfs: helia,
      directory: userId
    })
    progress(' OrbitDB created')
    
    // Create and store the core instance
    const core: P2PCore = {
      libp2p,
      helia,
      orbitdb,
      userId,
      started: true,
      initTime: Date.now()
    }
    
    // Store as singleton
    globalThis.__P2P_CORE__ = core
    
    // Set up connection monitoring
    libp2p.addEventListener('peer:connect', (evt: any) => {
      const connections = libp2p.getConnections().length
      console.log(' Peer connected:', evt.detail?.remotePeer?.toString())
      console.log(' Total peers:', connections)
    })
    
    libp2p.addEventListener('peer:disconnect', (evt: any) => {
      const connections = libp2p.getConnections().length
      console.log(' Peer disconnected:', evt.detail?.remotePeer?.toString())
      console.log(' Total peers:', connections)
    })
    
    // Add shutdown hooks
    if (typeof window !== 'undefined') {
      // Browser environment
      window.addEventListener('beforeunload', handleBeforeUnload)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    
    progress(' === P2P CORE SINGLETON READY ===')
    progress(' Helia/libp2p initialized once and stored globally')
    
    // Verify setup
    progress('Verification:')
    progress(`  - libp2p status: Started`)
    progress(`  - Multiaddrs: ${libp2p.getMultiaddrs().map((ma: any) => ma.toString()).join(', ')}`)
    progress(`  - Transports: ${config.transports.length}`)
    progress(`  - Services: ${Object.keys(config.services).join(', ')}`)
    
    return core
  } catch (error) {
    progress(` P2P core initialization failed: ${error}`)
    throw error
  }
}

export async function stopP2PCore(): Promise<void> {
  const core = globalThis.__P2P_CORE__
  
  if (!core || !core.started) {
    console.log(' P2P Core: No active core to stop')
    return
  }
  
  console.log(' P2P Core: Stopping P2P core...')
  
  try {
    // Stop Helia first (it depends on libp2p)
    if (core.helia) {
      await core.helia.stop()
      console.log(' P2P Core: Helia stopped')
    }
    
    // Stop libp2p
    if (core.libp2p) {
      await core.libp2p.stop()
      console.log(' P2P Core: libp2p stopped')
    }
    
    // Mark as stopped
    core.started = false
    
    // Clear the singleton
    globalThis.__P2P_CORE__ = undefined
    
    console.log(' P2P Core:  P2P core stopped and cleared')
  } catch (error) {
    console.error(' P2P Core: Error stopping P2P core:', error)
  }
}

// Cleanup handlers
function handleBeforeUnload() {
  console.log(' P2P Core: Page unloading, stopping P2P core...')
  // Use synchronous cleanup if possible
  const core = globalThis.__P2P_CORE__
  if (core && core.started) {
    // Mark as stopped to prevent further operations
    core.started = false
    
    // Schedule async cleanup (may not complete)
    stopP2PCore().catch(console.error)
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    console.log(' P2P Core: Page hidden, preparing for potential cleanup...')
    // Could implement connection throttling here if needed
  }
}

// Export utility to check if core is initialized
export function isP2PCoreInitialized(): boolean {
  return globalThis.__P2P_CORE__?.started === true
}

// Export utility to get current peer ID
export function getCurrentPeerId(): string | null {
  const core = globalThis.__P2P_CORE__
  if (core?.libp2p?.peerId) {
    return core.libp2p.peerId.toString()
  }
  return null
}

// Export utility to get connection count
export function getConnectionCount(): number {
  const core = globalThis.__P2P_CORE__
  if (core?.libp2p) {
    return core.libp2p.getConnections().length
  }
  return 0
}