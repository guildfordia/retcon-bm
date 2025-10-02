# Hybrid CQRS P2P Architecture

## 🎯 Vision
A scalable peer-to-peer document system that combines the benefits of decentralization with practical UX, using a CQRS (Command Query Responsibility Segregation) pattern optimized for P2P networks.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Registry (KeyValue)                      │
│  collections:photos → /orbitdb/Qm.../photos.catalog        │
│  users:alice → /orbitdb/Qm.../alice.activity               │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Collection    │    │   Collection    │    │   User Public   │
│    Ops Log      │◄──►│    Catalog      │    │   Activity      │
│   (EventLog)    │    │ (DocumentStore) │    │   (EventLog)    │
│                 │    │                 │    │                 │
│ • CREATE        │    │ • Current State │    │ • PUBLISH       │
│ • UPDATE        │    │ • Fast Queries  │    │ • COMMENT       │
│ • DELETE        │    │ • Metadata      │    │ • FOLLOW        │
│ • TAG           │    │ • Search Index  │    │ • ANNOUNCE      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Local Search Index                       │
│           (All public data, all collections)               │
└─────────────────────────────────────────────────────────────┘
```

## 🗃️ Database Design

### 1. Registry (KeyValue DB)
**Purpose**: Central discovery layer - the "phone book" for all databases

```typescript
interface RegistryEntry {
  type: 'collection' | 'user' | 'schema'
  address: string        // OrbitDB address
  metadata: {
    name: string
    description?: string
    created: number
    lastSeen: number
  }
}

// Example entries:
"collections:photos-2025" → {type: 'collection', address: '/orbitdb/Qm.../photos'}
"users:alice"            → {type: 'user', address: '/orbitdb/Qm.../alice-feed'}
"schemas:document-v1"    → {type: 'schema', address: 'QmSchema...'}
```

### 2. Collection Operations Log (EventLog)
**Purpose**: Append-only history of all changes - the source of truth

```typescript
interface Operation {
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'TAG' | 'RELATE'
  collectionId: string
  documentId: string
  authorDID: string
  timestamp: number
  data: any              // Operation-specific data
  signature: string      // ECDSA signature
  hash: string          // Content hash for integrity
}

// Example operations:
{
  type: 'CREATE',
  documentId: 'doc-123',
  data: {
    title: 'My Photo',
    ipfsCID: 'QmPhoto123...',
    tags: ['vacation', 'beach']
  }
}
```

### 3. Collection Catalog (DocumentStore)
**Purpose**: Current state derived from ops log - optimized for queries

```typescript
interface CatalogDocument {
  _id: string           // Document ID
  type: 'document' | 'media' | 'text'
  title: string
  description?: string
  tags: string[]
  authors: string[]     // DIDs
  ipfsCID: string      // File content on IPFS
  thumbCID?: string    // Thumbnail on IPFS
  provenance: {
    created: number
    updated: number
    version: number
  }
  lastOpCID: string    // Reference to creating/updating operation
  metadata: Record<string, any>
}
```

### 4. User Public Activity (EventLog)
**Purpose**: Public activity stream - all user actions are discoverable

```typescript
interface ActivityEntry {
  type: 'publish' | 'comment' | 'like' | 'follow' | 'announce' | 'tag'
  timestamp: number
  authorDID: string
  data: {
    // For 'publish'
    documentId?: string
    collectionId?: string
    title?: string
    // For 'comment'
    targetDocumentId?: string
    comment?: string
    // For 'follow'
    followedCollection?: string
    // For 'tag'
    taggedDocumentId?: string
    addedTags?: string[]
  }
  signature: string
}
```

**No private data** - everything is public and discoverable by design.

## 🔄 CQRS Workflow

### Write Path (Commands)
1. User creates/edits document **directly in collection**
2. Creates **Operation** in **Ops Log** immediately
3. Operation triggers **Catalog update** (derived state)
4. **Activity entry** added to user's public activity stream
5. **Search index** updated incrementally

### Read Path (Queries)
1. Search queries hit **Local Search Index** (fast)
2. Document browsing uses **Catalog DB** (current state)
3. History/audit uses **Ops Log** (full history)
4. User activity browsing uses **Activity Stream** (public feed)

## 🌐 P2P Network Behavior

### Discovery Flow
```
New Peer Joins:
1. Connect to known Registry address
2. Fetch collections/* entries
3. Subscribe to collections of interest
4. Build local search index
5. Announce own collections/feeds
```

### Replication Strategy
- **Registry**: Replicated by all peers (small, critical)
- **Collections**: Selective replication based on interest
- **User Activity Streams**: Public, replicated like collections
- **Search Index**: Built locally from all replicated public data

### Conflict Resolution
- **Ops Log**: Append-only, timestamps + author signatures prevent conflicts
- **Catalog**: Last-write-wins based on operation timestamps
- **Registry**: Eventually consistent with conflict-free resolution

## 🔍 Search Architecture

### Local Index (Per Peer)
```typescript
class LocalSearchIndex {
  private lunrIndex: lunr.Index
  private tagIndex: Map<string, Set<string>>  // tag → docIds
  private collections: Map<string, CatalogDB>

  async rebuildIndex() {
    // Scan all subscribed catalogs
    // Build full-text + tag indexes
    // Store locally for fast queries
  }

  search(query: string, filters?: {tags?: string[], collections?: string[]}) {
    // Fast local search with filtering
  }
}
```

### Global Discovery
- Each peer maintains local index of known collections
- Registry provides collection discovery
- Peer announcements share collection metadata
- No centralized search server needed

## 🔒 Security Model

### Access Control
- **Registry**: Public read, controlled write (registry operators)
- **Collections**: Public read, ACL-controlled write
- **User Workspaces**: Private by default, owner-controlled

### Identity & Signatures
- Each user has DID (Decentralized Identifier)
- All operations signed with user's private key
- Public key verification for all writes
- Signature verification prevents tampering

### Privacy Options
- Public collections: Metadata visible to all
- Private collections: Client-side encryption
- Anonymous browsing: No identity required for reading

## 🚀 Implementation Phases

### Phase 1: Core Architecture ← **WE ARE HERE**
- Registry Manager
- CQRS Collection System
- User Workspace
- Basic UI

### Phase 2: Search & Discovery
- Local search index
- Global collection discovery
- Recommendation engine

### Phase 3: Production Features
- Advanced UI/UX
- Mobile optimization
- Performance tuning
- Monitoring

## 📊 Expected Benefits

### For Users
- **Fast Search**: Local indexing = instant results
- **Offline Work**: Draft locally, publish when connected
- **Data Ownership**: You control your workspace
- **Selective Sync**: Only download collections you care about

### For Developers
- **Clear Separation**: Commands vs Queries well-defined
- **Scalable**: Each DB type optimized for its use case
- **Debuggable**: Full operation history available
- **Extensible**: New operation types easily added

### For Network
- **Efficient**: Minimal data transfer (metadata only)
- **Resilient**: No single points of failure
- **Growing**: Network effect as more peers join
- **Sustainable**: Storage cost shared across interested peers

## 🎯 Success Metrics

- **Discovery Time**: <30s for new peer to find collections
- **Search Speed**: <200ms for queries on 10k documents
- **Publish Flow**: <5 clicks to publish content
- **Scale**: 100+ concurrent users per collection
- **Reliability**: 99%+ availability with graceful degradation

---

*This architecture balances P2P ideals with practical usability, providing a foundation for scalable decentralized document management.*