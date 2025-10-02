export class SimpleP2P {
  private socket: any | null = null
  private peers: Map<string, RTCPeerConnection> = new Map()
  private dataChannels: Map<string, RTCDataChannel> = new Map()
  private onMessageCallback: ((data: any, peerId: string) => void) | null = null
  private onPeerCallback: ((peerId: string, connected: boolean) => void) | null = null
  private localPeerId: string

  constructor(peerId: string) {
    this.localPeerId = peerId
  }

  async connect(signalServer: string) {
    // Dynamically import socket.io-client to avoid SSR issues
    const { io } = await import('socket.io-client')
    this.socket = io(signalServer, {
      transports: ['websocket']
    })

    this.socket.on('connect', () => {
      console.log('Connected to signaling server')
      this.socket!.emit('register', this.localPeerId)
    })

    this.socket.on('peers:list', (peers: any[]) => {
      console.log('Existing peers:', peers)
      // Initiate connections to existing peers
      peers.forEach(peer => {
        this.createPeerConnection(peer.peerId, true)
      })
    })

    this.socket.on('peer:joined', (data: any) => {
      console.log('New peer joined:', data.peerId)
      // Wait for them to initiate
    })

    this.socket.on('signal', async (data: any) => {
      console.log('Received signal from:', data.from)
      await this.handleSignal(data.from, data.signal)
    })

    this.socket.on('peer:left', (data: any) => {
      console.log('Peer left:', data.peerId)
      this.closePeerConnection(data.peerId)
    })
  }

  private async createPeerConnection(peerId: string, initiator: boolean) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    })

    this.peers.set(peerId, pc)

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('signal', {
          to: peerId,
          from: this.localPeerId,
          signal: { type: 'ice', candidate: event.candidate }
        })
      }
    }

    if (initiator) {
      const channel = pc.createDataChannel('data')
      this.setupDataChannel(channel, peerId)
      
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      if (this.socket) {
        this.socket.emit('signal', {
          to: peerId,
          from: this.localPeerId,
          signal: { type: 'offer', offer }
        })
      }
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel, peerId)
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string) {
    channel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`)
      this.dataChannels.set(peerId, channel)
      this.onPeerCallback?.(peerId, true)
    }

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.onMessageCallback?.(data, peerId)
      } catch (e) {
        console.error('Error parsing message:', e)
      }
    }

    channel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`)
      this.dataChannels.delete(peerId)
      this.onPeerCallback?.(peerId, false)
    }
  }

  private async handleSignal(from: string, signal: any) {
    let pc = this.peers.get(from)
    
    if (!pc) {
      await this.createPeerConnection(from, false)
      pc = this.peers.get(from)!
    }

    if (signal.type === 'offer') {
      await pc.setRemoteDescription(signal.offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      if (this.socket) {
        this.socket.emit('signal', {
          to: from,
          from: this.localPeerId,
          signal: { type: 'answer', answer }
        })
      }
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(signal.answer)
    } else if (signal.type === 'ice') {
      await pc.addIceCandidate(signal.candidate)
    }
  }

  private closePeerConnection(peerId: string) {
    const pc = this.peers.get(peerId)
    if (pc) {
      pc.close()
      this.peers.delete(peerId)
    }
    
    const channel = this.dataChannels.get(peerId)
    if (channel) {
      channel.close()
      this.dataChannels.delete(peerId)
    }
    
    this.onPeerCallback?.(peerId, false)
  }

  broadcast(data: any) {
    const message = JSON.stringify(data)
    this.dataChannels.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(message)
      }
    })
  }

  onMessage(callback: (data: any, peerId: string) => void) {
    this.onMessageCallback = callback
  }

  onPeer(callback: (peerId: string, connected: boolean) => void) {
    this.onPeerCallback = callback
  }

  getConnectedPeers(): string[] {
    return Array.from(this.dataChannels.keys())
  }

  disconnect() {
    this.peers.forEach((_pc, peerId) => {
      this.closePeerConnection(peerId)
    })
    
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }
}