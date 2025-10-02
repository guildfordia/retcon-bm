// WebRTC Signaling Client
// Connects to the signaling server for WebRTC peer discovery and negotiation

export class SignalingClient {
  private ws: WebSocket | null = null
  private peerId: string | null = null
  private authenticated = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private messageHandlers = new Map<string, Function>()
  private token: string | null = null
  
  constructor(
    private signalingUrl: string,
    private onPeerJoined?: (peerId: string, metadata: any) => void,
    private onPeerLeft?: (peerId: string) => void,
    private onMessage?: (type: string, data: any) => void
  ) {}
  
  // Connect to signaling server with JWT authentication
  async connect(token: string, peerId?: string): Promise<void> {
    this.token = token
    this.peerId = peerId || null
    
    return new Promise((resolve, reject) => {
      try {
        console.log(' Connecting to signaling server:', this.signalingUrl)
        this.ws = new WebSocket(this.signalingUrl)
        
        this.ws.onopen = () => {
          console.log(' WebSocket connected, authenticating...')
          this.authenticate()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
            
            // Resolve on successful authentication
            if (message.type === 'authenticated' && !this.authenticated) {
              this.authenticated = true
              this.peerId = message.peerId
              console.log(' Authenticated with peer ID:', this.peerId)
              resolve()
            }
          } catch (err) {
            console.error('Error parsing message:', err)
          }
        }
        
        this.ws.onerror = (error) => {
          console.error(' WebSocket error:', error)
          if (!this.authenticated) {
            reject(error)
          }
        }
        
        this.ws.onclose = () => {
          console.log(' WebSocket disconnected')
          this.authenticated = false
          this.handleReconnect()
        }
        
      } catch (err) {
        reject(err)
      }
    })
  }
  
  // Send authentication message
  private authenticate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    
    this.send({
      type: 'auth',
      token: this.token,
      peerId: this.peerId,
      metadata: {
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      }
    })
  }
  
  // Handle incoming messages
  private handleMessage(message: any) {
    console.log(' Received:', message.type)
    
    switch (message.type) {
      case 'auth_required':
        // Server is requesting authentication
        break
        
      case 'error':
        console.error(' Server error:', message.message)
        break
        
      case 'peers_list':
        // Initial list of peers in room
        console.log(` ${message.peers.length} peers in room ${message.room}`)
        message.peers.forEach((peer: any) => {
          this.onPeerJoined?.(peer.peerId, peer.metadata)
        })
        break
        
      case 'peer_joined':
        console.log(' Peer joined:', message.peerId)
        this.onPeerJoined?.(message.peerId, message.metadata)
        break
        
      case 'peer_left':
      case 'peer_disconnected':
        console.log(' Peer left:', message.peerId)
        this.onPeerLeft?.(message.peerId)
        break
        
      case 'offer':
      case 'answer':
      case 'ice_candidate':
        // WebRTC negotiation messages
        const handler = this.messageHandlers.get(message.type)
        if (handler) {
          handler(message.fromPeerId, message.data)
        }
        break
        
      default:
        this.onMessage?.(message.type, message)
    }
  }
  
  // Join a room for peer discovery
  joinRoom(room = 'global') {
    this.send({ type: 'join', room })
  }
  
  // Leave a room
  leaveRoom(room = 'global') {
    this.send({ type: 'leave', room })
  }
  
  // Send WebRTC offer to a peer
  sendOffer(targetPeerId: string, offer: RTCSessionDescriptionInit) {
    this.send({
      type: 'offer',
      targetPeerId,
      data: offer
    })
  }
  
  // Send WebRTC answer to a peer
  sendAnswer(targetPeerId: string, answer: RTCSessionDescriptionInit) {
    this.send({
      type: 'answer',
      targetPeerId,
      data: answer
    })
  }
  
  // Send ICE candidate to a peer
  sendIceCandidate(targetPeerId: string, candidate: RTCIceCandidate) {
    this.send({
      type: 'ice_candidate',
      targetPeerId,
      data: candidate
    })
  }
  
  // Register handler for WebRTC negotiation messages
  onWebRTCMessage(type: 'offer' | 'answer' | 'ice_candidate', handler: Function) {
    this.messageHandlers.set(type, handler)
  }
  
  // Send message to server
  private send(message: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message, WebSocket not open')
      return
    }
    
    this.ws.send(JSON.stringify(message))
  }
  
  // Handle reconnection
  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }
    
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    
    setTimeout(async () => {
      if (this.token) {
        try {
          await this.connect(this.token, this.peerId || undefined)
          this.reconnectAttempts = 0 // Reset on successful connection
        } catch (err) {
          console.error('Reconnection failed:', err)
        }
      }
    }, delay)
  }
  
  // Disconnect from signaling server
  disconnect() {
    if (this.ws) {
      this.authenticated = false
      this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
      this.ws.close()
      this.ws = null
    }
  }
  
  // Check if connected and authenticated
  isConnected(): boolean {
    return this.ws !== null && 
           this.ws.readyState === WebSocket.OPEN && 
           this.authenticated
  }
  
  getPeerId(): string | null {
    return this.peerId
  }
}