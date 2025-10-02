# Simplified Architecture for Client Demo

## Overview

Retcon Black Mountain uses a **hybrid architecture** that combines the best of centralized and decentralized approaches:

- **OrbitDB (P2P)**: Primary storage for documents and collections
- **SQLite**: Authentication and activity logging only
- **WebSocket**: Real-time P2P synchronization

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Next.js    │  │   OrbitDB    │  │  WebSocket      │  │
│  │   React UI   │  │   Client     │  │  Connection     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
└─────────┼──────────────────┼──────────────────┼───────────┘
          │                  │                  │
          │ HTTPS            │ HTTPS            │ WSS
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                         Nginx Proxy                          │
│                    (SSL Termination)                         │
└──────┬────────────────┬────────────────────┬─────────────────┘
       │                │                    │
       │ :3000          │ :4001              │ :9091
       ▼                ▼                    ▼
┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐
│   Next.js   │  │  OrbitDB Service │  │  P2P WebSocket     │
│   Web App   │  │  (HTTP API)      │  │  (libp2p)          │
│             │  │                  │  │                    │
│  ┌────────┐ │  │  ┌────────────┐ │  │  ┌──────────────┐ │
│  │ SQLite │ │  │  │  OrbitDB   │ │  │  │  Peer-to-    │ │
│  │  Auth  │ │  │  │  Registry  │ │  │  │  Peer Sync   │ │
│  │ Activity│ │  │  │ Collection │ │  │  │              │ │
│  └────────┘ │  │  │ Documents  │ │  │  └──────────────┘ │
│             │  │  └────────────┘ │  │                    │
└─────────────┘  └──────────────────┘  └────────────────────┘
       │                  │                    │
       ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      Docker Volumes                          │
│  web-data/        orbitdb-data/        (ephemeral)          │
│  └── sqlite.db    └── ipfs/                                 │
│                   └── orbitdb/                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. User Authentication (Centralized)
```
Browser → Nginx → Next.js → SQLite
                    ↓
                  JWT Token
                    ↓
                  Browser
```
- Uses traditional username/password
- SQLite stores user accounts
- JWT tokens for session management

### 2. Collection Creation (P2P)
```
Browser → Nginx → OrbitDB Service
                    ↓
            Create Registry Entry
                    ↓
            Create Collection DB
                    ↓
        Return OrbitDB Address
                    ↓
                  Browser
```
- Collections are fully P2P
- Stored in OrbitDB
- Can be replicated across peers

### 3. Document Upload (Hybrid)
```
Browser → Nginx → Next.js (validate)
                    ↓
            OrbitDB Service (store)
                    ↓
            IPFS (content addressing)
                    ↓
        OrbitDB Collection (metadata)
                    ↓
            SQLite (activity log)
                    ↓
                  Browser
```

### 4. P2P Replication (Decentralized)
```
Browser A ←─ WebSocket ─→ OrbitDB Service ←─ WebSocket ─→ Browser B
    │                           │                           │
OrbitDB                     Facilitates                 OrbitDB
 Client                     Discovery                    Client
    │                           │                           │
    └───────── Direct P2P Sync ─────────────────────────────┘
```

## Component Responsibilities

### Next.js Web App
**Purpose**: User interface and authentication
- ✅ User login/registration
- ✅ UI rendering
- ✅ Activity logging (SQLite)
- ❌ No document storage
- ❌ No P2P logic (except client-side OrbitDB)

### OrbitDB Service
**Purpose**: P2P document management
- ✅ OrbitDB database management
- ✅ IPFS content storage
- ✅ P2P peer discovery
- ✅ Collection registry
- ✅ Access control
- ❌ No authentication logic

### SQLite Database
**Purpose**: Minimal centralized data
- ✅ User accounts
- ✅ Activity logs (for analytics)
- ❌ No document content
- ❌ No collection data

### Nginx Proxy
**Purpose**: SSL termination and routing
- ✅ HTTPS/WSS termination
- ✅ Route to appropriate service
- ✅ SSL certificate management
- ❌ No application logic

## Key Design Decisions

### Why Hybrid Architecture?

1. **Authentication Needs Centralization**
   - Username/password requires server verification
   - JWT tokens need secure signing
   - Alternative: P2P cryptographic identities (future)

2. **P2P for Data = Resilience**
   - Documents survive even if server goes down
   - Peers can sync directly
   - No single point of failure for content

3. **Activity Logging for Analytics**
   - Helps understand usage patterns
   - Can be removed if full decentralization needed
   - Optional: could move to P2P activity streams

### Migration Path to Full P2P

When ready for full decentralization:

**Phase 1** (Current): Hybrid
- SQLite: User accounts + activity logs
- OrbitDB: Collections + documents

**Phase 2** (Next): Crypto-based auth
- Remove: SQLite user accounts
- Add: P2P cryptographic identities (DID)
- Keep: SQLite activity logs (optional)

**Phase 3** (Future): Fully P2P
- Remove: All SQLite
- Add: P2P activity streams
- Add: Local-only analytics

## Performance Characteristics

| Operation | Speed | Offline | P2P |
|-----------|-------|---------|-----|
| Login | Fast | ❌ | ❌ |
| View Collections | Fast | ⚠️ Cached | ✅ |
| Create Document | Medium | ❌ | ⚠️ Queue |
| Read Document | Fast | ✅ | ✅ |
| Sync with Peer | Automatic | ❌ | ✅ |

## Security Model

### Authentication Layer
- **Method**: JWT tokens
- **Storage**: HTTP-only cookies (future)
- **Scope**: API access only
- **Threat Model**: Protects against unauthorized API calls

### P2P Layer
- **Method**: OrbitDB access control
- **Storage**: OrbitDB identity system
- **Scope**: Write access to databases
- **Threat Model**: Prevents unauthorized writes

### Network Layer
- **Method**: TLS/SSL (HTTPS/WSS)
- **Storage**: Let's Encrypt certificates
- **Scope**: Transport encryption
- **Threat Model**: Prevents man-in-the-middle attacks

## Deployment Topology

### Single VPS (Current)
```
Internet → VPS (Docker Compose)
             ├── nginx
             ├── web
             └── orbitdb
```
**Pros**: Simple, cost-effective
**Cons**: Single point of failure

### Multi-VPS (Future)
```
Internet → Load Balancer
             ├── VPS 1 (web + orbitdb)
             ├── VPS 2 (web + orbitdb)
             └── VPS 3 (web + orbitdb)
```
**Pros**: High availability, scalable
**Cons**: Complex, expensive

### Fully Distributed (Vision)
```
Peer 1 ←─┐
          ├──→ OrbitDB Network (DHT)
Peer 2 ←─┤
          ├──→ Discovery
Peer 3 ←─┘

Optional: Bootstrap Server (for initial discovery only)
```
**Pros**: No central server needed
**Cons**: Complex peer discovery

## Client Demo Features

For your client demo, focus on:

1. **Core P2P Functionality**
   - Create a collection
   - Upload a document
   - View in two browsers simultaneously
   - Show real-time sync

2. **User Experience**
   - Clean, modern UI
   - Fast response times
   - Mobile-responsive

3. **Resilience**
   - Show document persistence
   - Demonstrate offline caching (future)
   - Explain P2P benefits

4. **Security**
   - HTTPS everywhere
   - Proper authentication
   - Access control on collections

## Next Steps for Production

- [ ] Replace default user with proper registration
- [ ] Add rate limiting
- [ ] Implement CSRF protection
- [ ] Set up monitoring (Grafana/Prometheus)
- [ ] Add automated backups
- [ ] Configure CDN (Cloudflare)
- [ ] Implement search functionality
- [ ] Add comprehensive error handling
- [ ] Create admin dashboard
- [ ] Mobile app (React Native)