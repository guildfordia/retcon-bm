// Simplified P2P initialization for production
// Uses direct imports instead of dynamic imports to avoid bundling issues

import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { createHelia } from 'helia'
import { createOrbitDB } from '@orbitdb/core'

export async function initializeP2PSystem(userId: string, onProgress?: (msg: string) => void) {
  const progress = (msg: string) => {
    console.log('P2P:', msg)
    onProgress?.(msg)
  }
  
  try {
    progress('Creating libp2p node...')
    
    // Create libp2p node directly
    const libp2p = await createLibp2p({
      addresses: {
        listen: []
      },
      transports: [
        webSockets(),
        circuitRelayTransport()
      ],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),
        pubsub: gossipsub({
          allowPublishToZeroTopicPeers: true,
          emitSelf: true,
          canRelayMessage: true,
          fallbackToFloodsub: true,
          floodPublish: true,
          doPX: false
        })
      },
      connectionGater: {
        denyDialMultiaddr: async () => false
      }
    })
    
    await libp2p.start()
    progress('Libp2p started')
    
    // Create Helia
    progress('Creating Helia (IPFS)...')
    const helia = await createHelia({ libp2p })
    progress('Helia created')
    
    // Create OrbitDB
    progress('Creating OrbitDB...')
    const orbitdb = await createOrbitDB({
      ipfs: helia,
      directory: userId
    })
    progress('OrbitDB created')
    
    return {
      libp2p,
      helia,
      orbitdb
    }
  } catch (error) {
    console.error('P2P initialization error:', error)
    throw error
  }
}