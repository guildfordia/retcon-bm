// Signaling client for WebRTC connections
export class SignalingClient {
  private ws: WebSocket | null = null
  private token: string
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private handlers: Map<string, Function[]> = new Map()
  private peerId: string | null = null
  private rooms: Set<string> = new Set()

  constructor(url: string, token: string) {
    this.url = url
    this.token = token
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Add token to URL
        const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('Connected to signaling server')
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
            
            // Resolve on welcome message
            if (message.type === 'welcome') {
              this.peerId = message.peerId
              resolve()
            }
          } catch (err) {
            console.error('Failed to parse message:', err)
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('Disconnected from signaling server')
          this.ws = null
          this.attemptReconnect()
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  private handleMessage(message: any) {
    const handlers = this.handlers.get(message.type) || []
    handlers.forEach(handler => handler(message))
  }

  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    this.handlers.get(event)!.push(handler)
  }

  off(event: string, handler: Function) {
    const handlers = this.handlers.get(event) || []
    const index = handlers.indexOf(handler)
    if (index !== -1) {
      handlers.splice(index, 1)
    }
  }

  join(roomId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to signaling server')
    }
    
    this.rooms.add(roomId)
    this.send({ type: 'join', room: roomId })
  }

  leave(roomId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    
    this.rooms.delete(roomId)
    this.send({ type: 'leave', room: roomId })
  }

  signal(to: string, signal: any, roomId?: string) {
    this.send({ 
      type: 'signal', 
      to, 
      signal,
      roomId 
    })
  }

  broadcast(roomId: string, data: any) {
    this.send({ 
      type: 'broadcast', 
      roomId, 
      data 
    })
  }

  getPeers(roomId: string) {
    this.send({ 
      type: 'peers', 
      room: roomId 
    })
  }

  private send(data: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: WebSocket not connected')
      return
    }
    
    this.ws.send(JSON.stringify(data))
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }
    
    this.reconnectAttempts++
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
    
    setTimeout(() => {
      this.connect().then(() => {
        // Rejoin rooms after reconnection
        this.rooms.forEach(roomId => this.join(roomId))
      }).catch(err => {
        console.error('Reconnection failed:', err)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
      })
    }, this.reconnectDelay)
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.handlers.clear()
    this.rooms.clear()
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  get id(): string | null {
    return this.peerId
  }
}

// TURN configuration helper
export function getTurnConfig(secret: string): RTCConfiguration {
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL || 'turn:192.168.10.104:3478'
  const username = `user-${Date.now()}`
  const credential = generateTurnCredential(username, secret)
  
  return {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      },
      {
        urls: turnUrl,
        username: username,
        credential: credential
      }
    ]
  }
}

function generateTurnCredential(_username: string, secret: string): string {
  // TURN credentials for coturn static-auth-secret mode
  // In this mode, coturn expects the secret directly
  // Dynamic credentials with HMAC would be implemented server-side in production
  return secret
}