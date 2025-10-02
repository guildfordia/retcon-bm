// P2P Module Loader with retry and caching
let moduleCache: any = null

export async function loadP2PModules(onProgress?: (msg: string) => void) {
  if (moduleCache) return moduleCache

  const progress = (msg: string) => {
    console.log(msg)
    onProgress?.(msg)
  }

  try {
    progress('Loading Helia...')
    const heliaModule = await import('helia')
    console.log('Helia module:', heliaModule)
    const createHelia = heliaModule.createHelia
    
    progress('Loading libp2p...')
    const libp2pModule = await import('libp2p')
    console.log('libp2p module:', libp2pModule)
    console.log('libp2p keys:', Object.keys(libp2pModule))
    const createLibp2p = libp2pModule.createLibp2p
    
    if (!createLibp2p) {
      console.error('createLibp2p not found in module, trying default export')
      throw new Error('createLibp2p is not available in the libp2p module')
    }
    console.log('createLibp2p type:', typeof createLibp2p)
    
    progress('Loading WebSockets...')
    const { webSockets } = await import('@libp2p/websockets')
    const { all } = await import('@libp2p/websockets/filters')
    
    progress('Loading WebRTC...')
    let webRTC: any = null
    try {
      const webRTCModule = await import('@libp2p/webrtc')
      webRTC = webRTCModule.webRTC
    } catch (e) {
      console.warn('WebRTC not available, continuing without it')
    }
    
    progress('Loading encryption...')
    const { noise } = await import('@chainsafe/libp2p-noise')
    
    progress('Loading stream muxer...')
    const { yamux } = await import('@chainsafe/libp2p-yamux')
    
    progress('Loading pubsub...')
    const { gossipsub } = await import('@chainsafe/libp2p-gossipsub')
    
    progress('Loading services...')
    const { identify } = await import('@libp2p/identify')
    
    progress('Loading circuit relay...')
    const { circuitRelayTransport } = await import('@libp2p/circuit-relay-v2')
    
    progress('Loading OrbitDB...')
    const { createOrbitDB } = await import('@orbitdb/core')
    
    progress('Loading multiaddr...')
    const { multiaddr } = await import('@multiformats/multiaddr')
    
    moduleCache = {
      createHelia,
      createLibp2p,
      webSockets,
      all,
      webRTC,
      noise,
      yamux,
      gossipsub,
      identify,
      circuitRelayTransport,
      createOrbitDB,
      multiaddr
    }
    
    progress('All modules loaded!')
    return moduleCache
  } catch (error) {
    console.error('Module loading failed:', error)
    throw error
  }
}

export async function createP2PNode(modules: any, options: any = {}) {
  if (!modules) {
    throw new Error('P2P modules not provided')
  }
  
  const {
    createLibp2p,
    webSockets,
    all,
    webRTC,
    noise,
    yamux,
    gossipsub,
    identify,
    circuitRelayTransport
  } = modules

  const transports = [
    webSockets({
      filter: all
    }),
    circuitRelayTransport({
      discoverRelays: 1
    })
  ]

  // Add WebRTC if available with signaling server
  if (webRTC && options.signalingServer) {
    transports.push(webRTC({
      rtcConfiguration: {
        iceServers: [
          {
            urls: ['stun:stun.l.google.com:19302']
          },
          ...(options.iceServers || [])
        ]
      }
    }))
  } else if (webRTC) {
    transports.push(webRTC())
  }

  // Add bootstrap peers for connection
  const bootstrapPeers = [
    // Add the OrbitDB service multiaddr if available
    '/dns4/orbitdb/tcp/4001/ws',
    // Add any WebRTC signaling server addresses
    '/dns4/localhost/tcp/9090/ws'
  ].filter(Boolean)

  const libp2p = await createLibp2p({
    addresses: {
      listen: []
    },
    transports,
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: true,
        canRelayMessage: true,
        fallbackToFloodsub: true,
        floodPublish: true,
        doPX: false,
        directPeers: [],
        ...options.gossipsub
      })
    },
    connectionGater: {
      denyDialMultiaddr: async () => false
    },
    peerDiscovery: bootstrapPeers.length > 0 ? [{
      init: () => ({
        addEventListener: () => {},
        removeEventListener: () => {},
        start: async () => {
          // Try to connect to bootstrap peers
          for (const peer of bootstrapPeers) {
            try {
              await libp2p.dial(peer)
            } catch (e) {
              console.log('Could not connect to bootstrap peer:', peer)
            }
          }
        },
        stop: async () => {}
      })
    }] : [],
    ...options
  })

  return libp2p
}