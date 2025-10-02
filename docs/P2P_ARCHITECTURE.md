# P2P Architecture Documentation

## Overview

This document describes the peer-to-peer (P2P) architecture for the Retcon Black Mountain project using libp2p, Helia, and OrbitDB.

## Key Design Principles

### ✅ Browser Configuration
- **WebRTC**: Primary transport for browser-to-browser P2P connections
- **WebSockets**: Dial-only mode for connecting to signaling/relay servers (WSS)
- **Circuit Relay**: NAT traversal fallback
- **Listen addresses**: `/webrtc` only (no WebSocket listening!)

### ✅ Server Configuration  
- **TCP**: Server-to-server connections
- **WebSockets**: Listen mode enabled for browser connections
- **Circuit Relay Hop**: Act as relay for browser peers
- **Listen addresses**: `/tcp/9091/ws`, `/tcp/9092`

### ❌ Common Mistakes to Avoid
- Never create WebSocket listeners in the browser
- Don't use `/ip4/0.0.0.0/tcp/0/ws` as a browser listen address
- Always use WSS (secure WebSockets) for browser dial connections

## Transport Configuration

### Browser (Client-Side)

```javascript
// Browser transports configuration
const transports = [
  webRTC(),                    // Primary P2P transport
  webSockets({ filter: wss }), // Dial-only to WSS endpoints
  circuitRelayTransport()      // NAT traversal
]

// Browser listen addresses
addresses: {
  listen: ['/webrtc']  // ONLY WebRTC listening
}
```

### Server (Node.js)

```javascript
// Server transports configuration
const transports = [
  tcp(),                       // TCP for server connections
  webSockets({ filter: all }), // WebSocket with listening
  circuitRelayServer()         // Relay hop for browsers
]

// Server listen addresses
addresses: {
  listen: [
    '/ip4/0.0.0.0/tcp/9091/ws',  // WebSocket for browsers
    '/ip4/0.0.0.0/tcp/9092'       // TCP for servers
  ]
}
```

## Connection Flow

### Browser ↔ Browser (via WebRTC)

1. Both browsers connect to signaling server (WSS) with JWT auth
2. Exchange WebRTC offers/answers through signaling
3. Establish direct P2P connection via WebRTC data channels
4. Fall back to circuit relay if direct connection fails

### Browser → Server (via WebSocket)

1. Browser dials server's WebSocket address (e.g., `/dns4/server.com/tcp/443/wss`)
2. Server accepts incoming WebSocket connection
3. Data exchange over WebSocket transport
4. Used for bootstrap, relay, and fallback connectivity

### Server ↔ Server (via TCP)

1. Direct TCP connections between servers
2. No WebRTC or signaling required
3. Can also use WebSocket transport if needed

## WebRTC Signaling

### Signaling Server

- **Purpose**: Facilitate WebRTC peer discovery and connection negotiation
- **Authentication**: JWT required for all connections
- **Transport**: WebSocket (WSS when behind nginx)
- **Location**: `wss://example.com/signaling`

### Signaling Flow

```
Browser A                 Signaling Server              Browser B
    |                           |                           |
    |-- Connect + JWT Auth -->  |                           |
    |<-- Authenticated ---------|                           |
    |-- Join Room ------------> |                           |
    |                           | <-- Connect + JWT Auth ---|
    |                           |--- Authenticated -------->|
    |                           | <-- Join Room ------------|
    |<-- Peer Joined -----------|--- Peer Joined --------->|
    |-- Offer ----------------> |--- Offer --------------->|
    |<-- Answer ----------------|<-- Answer ---------------|
    |-- ICE Candidate --------> |--- ICE Candidate ------>|
    |<===== WebRTC Data Channel Established =============>|
```

## Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
         ┌────────▼────────┐     ┌───────▼────────┐
         │  nginx (TLS)    │     │  nginx (TLS)   │
         │  Port 443       │     │  Port 443      │
         └────────┬────────┘     └───────┬────────┘
                  │                       │
    ┌─────────────┼───────────────────────┼─────────────┐
    │             │                       │             │
    │   ┌─────────▼────────┐   ┌─────────▼────────┐   │
    │   │ Signaling Server │   │   OrbitDB Node   │   │
    │   │   Port 9090      │   │   Port 9091/ws   │   │
    │   │  (JWT Auth)      │   │   Port 9092/tcp  │   │
    │   └──────────────────┘   └──────────────────┘   │
    │                                                   │
    │              Docker Network (rbm-network)        │
    └───────────────────────────────────────────────────┘
                  │                       │
         ┌────────▼────────┐     ┌───────▼────────┐
         │   Browser A     │     │   Browser B    │
         │  - WebRTC       │     │  - WebRTC      │
         │  - WS dial-only │     │  - WS dial-only│
         └─────────────────┘     └────────────────┘
                  │                       │
                  └───────────────────────┘
                    Direct WebRTC Connection
```

## Security

### JWT Authentication
- Required for signaling server connections
- Token must include `userId` and `publicKey`
- Validated on every WebSocket connection

### TLS/SSL
- All WebSocket connections use WSS (TLS)
- nginx terminates TLS and proxies to backend services
- Self-signed certificates acceptable for development

### Rate Limiting
- nginx rate limits on signaling endpoints
- Prevents DoS attacks on WebSocket connections

## Bootstrap & Discovery

### Bootstrap Nodes
- Server nodes with known addresses
- Accept WebSocket connections from browsers
- Provide initial peer discovery

### Peer Discovery Methods
1. **Signaling Server**: Real-time peer announcements
2. **Circuit Relay**: Discovery through relay nodes
3. **OrbitDB Pubsub**: Application-level discovery
4. **Manual Bootstrap**: Connect to known peer addresses

## Troubleshooting

### Common Issues

1. **"WebSocket Servers can not be created in the browser!"**
   - Cause: Trying to listen on WebSocket addresses in browser
   - Fix: Use `/webrtc` as only listen address in browser

2. **WebRTC connections fail**
   - Check signaling server is running and accessible
   - Verify JWT token is valid
   - Ensure STUN/TURN servers are configured

3. **Cannot connect to bootstrap nodes**
   - Verify server has WebSocket listeners enabled
   - Check nginx is proxying WSS correctly
   - Ensure addresses are reachable

### Debug Logging

Enable verbose logging in P2P core:
```javascript
progress('🔷 P2P Core: ' + message)
```

Monitor in browser console:
- Connection status
- Transport configuration  
- Peer connections
- Error messages

## Configuration Files

### Production Docker Compose
- `docker-compose.production.yml`: Service definitions
- Signaling server with JWT_SECRET environment variable

### nginx Configuration  
- `nginx-production.conf`: WSS proxy settings
- `/signaling` location for WebRTC signaling
- `/ws` location for OrbitDB WebSocket

### Environment Variables
- `JWT_SECRET`: Shared secret for token validation
- `SIGNALING_PORT`: WebRTC signaling server port (default: 9090)
- `EXTERNAL_IP`: Public IP for STUN/TURN configuration