# Retcon Black Mountain

A decentralized peer-to-peer document management system using **Hybrid CQRS Architecture** with OrbitDB.

## 🎯 Vision

A scalable P2P document system that combines decentralization benefits with practical UX, using Command Query Responsibility Segregation (CQRS) optimized for peer-to-peer networks.

---

## 🚀 Quick Start

**For VPS Deployment:**
```bash
sudo bash scripts/setup-vps.sh
```

**For Local Development:**
```bash
make dev
```

See [QUICK_START.md](QUICK_START.md) for details.

---

## 📚 Documentation

- **⚡ [Quick Start](QUICK_START.md)** - Get running in 5 minutes
- **📖 [Deployment Guide](DEPLOYMENT.md)** - Complete VPS setup
- **🎯 [Client Demo](CLIENT_DEMO.md)** - How to demo to clients
- **🏗️ [Architecture](docs/SIMPLIFIED_ARCHITECTURE.md)** - System design
- **✅ [Improvements](IMPROVEMENTS_SUMMARY.md)** - Recent changes

---

## 🏗️ Architecture

```
Registry (KeyValue) → Discovery layer for all databases
├── Collections
│   ├── Ops Log (EventLog) → Commands/Write operations
│   └── Catalog (DocumentStore) → Queries/Read state
└── User Activity
    └── Activity Stream (EventLog) → Public activity feed
```

### Infrastructure

- **web**: Next.js application on port 3000
- **orbitdb**: Node.js microservice on port 4001 (HTTP API) and 9091 (WebSocket)
- **nginx**: HTTPS proxy for production (port 8443)
- Browsers connect to the OrbitDB service via WebSocket for P2P replication

## Requirements

- Docker and Docker Compose
- Ports 3000, 4001, 9091 available
- `jq` installed for pretty JSON output (optional)

## 🚀 Quick Start

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

### Docker Production
```bash
# Build and start all services
make build
make up

# Check status
make status

# Test OrbitDB
make test-orbit

# Access at https://localhost:8443
```

## 📁 Project Structure

```
src/
├── lib/p2p/               # Core P2P system
│   ├── p2p-system.ts     # Main orchestrator
│   ├── registry-manager.ts # Discovery layer
│   ├── collection-cqrs.ts # CQRS collections
│   ├── user-workspace.ts  # User drafts/feed
│   └── types.ts          # TypeScript definitions
├── app/                  # Next.js pages
│   ├── test-orbitdb-*    # Test interfaces
│   └── collections/      # Collection browser
└── components/           # React components
```

## Verification Steps

### 1. Check Services Health

```bash
# Both services should be healthy
docker compose ps

# Check health endpoints
curl http://localhost:3000/api/health
curl http://localhost:4001/health
```

### 2. Verify Peer Info

```bash
curl http://localhost:4001/peerinfo
```

Should return:
```json
{
  "wsMultiaddrPublic": "/dns4/<your-host>/tcp/9091/ws/p2p/<peerId>"
}
```

### 3. Test Browser Connection

1. Open http://localhost:3000/test-browser-orbit
2. Status should show "Connected"
3. Try put/get operations
4. Check that values persist

### 4. Cross-Machine Testing

If testing from another machine:
1. Ensure port 9091 is accessible (firewall rules)
2. The `wsMultiaddrPublic` should use the correct hostname/IP
3. For HTTPS sites, it should return `/wss` instead of `/ws`

## API Endpoints

### OrbitDB Service (port 4001)

- `GET /health` - Health check
- `GET /peerinfo` - Get peer multiaddr
- `POST /kv/open` - Open/create KV store
  ```json
  { "name": "store-name" }
  ```
- `POST /kv/put` - Put value
  ```json
  { "name": "store-name", "key": "key", "value": "value" }
  ```
- `GET /kv/get?name=store-name&key=key` - Get value

## Troubleshooting

### "NoValidAddressesError"
- Check that port 9091 is accessible
- Verify the multiaddr format in `/peerinfo`
- Ensure WebSocket connection is not blocked

### Connection Issues
- Check logs: `make logs`
- Verify services are healthy: `make status`
- Ensure no firewall blocking port 9091

### Clean Restart
```bash
make clean
make build
make up
```

## 🧪 Testing

### Automated Tests

```bash
# Run unit tests (schema validation, etc.)
npm test

# Run integration tests (real P2P/OrbitDB)
npm run test:integration

# Run both with coverage
npm run test:coverage
npm run test:integration -- --coverage
```

### Available Test Pages

- `/test-orbitdb-dashboard` - Comprehensive P2P testing dashboard
- `/test-browser-orbit` - Browser-side OrbitDB connectivity
- `/test-mobile` - Mobile-specific testing
- `/test-p2p-system` - P2P system integration
- `/test-api` - General API testing

## 🚀 New P2P System Usage

```typescript
import { P2PSystem, createDefaultConfig } from '@/lib/p2p'

// Initialize system
const config = createDefaultConfig('user-123')
const p2p = new P2PSystem(config)
await p2p.initialize()

// Publish document directly to collection (no drafts)
const document = await p2p.publishDocument('photos', file, {
  title: 'My Photo',
  description: 'A beautiful sunset',
  tags: ['nature', 'sunset']
})

// Get user's public activity
const activity = await p2p.getUserActivity({ limit: 10 })
```

## 📋 Current Status

- ✅ Core CQRS architecture implemented
- ✅ Registry-based discovery
- ✅ Fully public P2P system (no private data)
- ✅ User public activity streams
- ✅ Collection operations (CRUD)
- ✅ OrbitDB service working
- 🚧 Search integration (next)
- 🚧 Advanced UI/UX
- 🚧 Mobile optimization

## 📚 Documentation

- [Hybrid CQRS Architecture](./docs/architecture/HYBRID_P2P_ARCHITECTURE.md)
- [Development Roadmap](./TODO.md)

## Package Versions

All libp2p/OrbitDB packages are pinned to exact versions:
- libp2p: 2.4.1
- @libp2p/websockets: 9.0.0
- @chainsafe/libp2p-noise: 16.0.0
- @chainsafe/libp2p-yamux: 7.0.0
- @chainsafe/libp2p-gossipsub: 14.1.1
- @libp2p/identify: 3.0.0
- helia: 5.1.2
- @orbitdb/core: 2.4.0
- @multiformats/multiaddr: 12.3.4