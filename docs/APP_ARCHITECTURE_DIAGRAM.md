# Retcon Black Mountain - Application Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT BROWSER                                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     Next.js React Application                          │ │
│  │                                                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │   /auth      │  │   /feed      │  │ /collections │              │ │
│  │  │   Login/     │  │   Global     │  │   User's     │              │ │
│  │  │   Register   │  │   Feed +     │  │   Collections│              │ │
│  │  │              │  │   Search Bar │  │              │              │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │ │
│  │         │                 │                  │                       │ │
│  │         └─────────────────┼──────────────────┘                       │ │
│  │                           │                                          │ │
│  │  ┌────────────────────────▼─────────────────────────────────────┐   │ │
│  │  │                    React Components                          │   │ │
│  │  │                                                               │   │ │
│  │  │  • GlobalFeedDocuments (search + display)                    │   │ │
│  │  │  • DocumentEditModal (edit with version history)             │   │ │
│  │  │  • DocumentVersionBrowser (view edit history)                │   │ │
│  │  │  • P2PDocumentsApi (collection management)                   │   │ │
│  │  │  • Navigation (app navigation)                               │   │ │
│  │  └───────────────────────┬───────────────────────────────────────┘   │ │
│  │                          │                                            │ │
│  │  ┌───────────────────────▼────────────────────────────────────────┐  │ │
│  │  │              Client-Side State Management                      │  │ │
│  │  │                                                                 │  │ │
│  │  │  • ThemeContext (dark/light mode)                             │  │ │
│  │  │  • Search filters state (types, keywords, title)              │  │ │
│  │  │  • Authentication state (localStorage: userId, username)      │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                                  │ HTTPS                                    │
│                                  ▼                                           │
└──────────────────────────────────────────────────────────────────────────────┘

                                   │
                                   │
                    ┌──────────────▼───────────────┐
                    │      NGINX (Port 8443)       │
                    │    SSL/TLS Termination       │
                    │    Reverse Proxy             │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │                              │
                    ▼                              ▼

┌───────────────────────────────────┐    ┌───────────────────────────────────┐
│   Next.js Server (Port 3000)     │    │  OrbitDB Service (Port 4001)      │
│                                   │    │                                   │
│  ┌─────────────────────────────┐ │    │  ┌─────────────────────────────┐ │
│  │    API Routes (REST)        │ │    │  │    HTTP API Server          │ │
│  │                             │ │    │  │                             │ │
│  │  /api/auth/p2p/*            │ │    │  │  POST /health               │ │
│  │  ├─ login                   │ │    │  │  POST /create-db            │ │
│  │  └─ register                │ │    │  │  POST /open-db              │ │
│  │                             │ │    │  │  POST /put                  │ │
│  │  /api/collections/*         │ │    │  │  POST /get                  │ │
│  │  ├─ GET/POST collections    │ │    │  │  POST /all                  │ │
│  │  ├─ [id] - single collection│ │    │  │  POST /close-db             │ │
│  │  └─ p2p/* - P2P collections │ │    │  └─────────────────────────────┘ │
│  │                             │ │    │              │                    │
│  │  /api/documents/*           │ │    │              │                    │
│  │  ├─ GET/POST documents      │ │    │  ┌───────────▼───────────────┐   │
│  │  ├─ p2p/* - P2P docs        │ │    │  │   OrbitDB Instance        │   │
│  │  ├─ p2p/edit - edit docs    │ │    │  │                           │   │
│  │  ├─ fork - fork document    │ │    │  │  • KeyValue Stores        │   │
│  │  └─ pin - pin document      │ │    │  │  • Documents Store        │   │
│  │                             │ │    │  │  • Collections Store      │   │
│  │  /api/feed/*                │ │    │  │  • User Registry          │   │
│  │  ├─ GET - all documents     │ │    │  └───────────────────────────┘   │
│  │  └─ search - filtered docs  │ │    │              │                    │
│  │                             │ │    │              │                    │
│  │  /api/seed                  │ │    │  ┌───────────▼───────────────┐   │
│  │  └─ POST - seed test data   │ │    │  │      IPFS/Helia           │   │
│  └─────────────┬───────────────┘ │    │  │                           │   │
│                │                  │    │  │  • Content Addressing     │   │
│  ┌─────────────▼───────────────┐ │    │  │  • P2P File Storage       │   │
│  │   Server-Side Libraries     │ │    │  │  • Block Storage          │   │
│  │                             │ │    │  └───────────────────────────┘   │
│  │  • orbitdb-client.ts        │ │    │              │                    │
│  │    └─ HTTP client wrapper   │ │    │              │                    │
│  │                             │ │    │  ┌───────────▼───────────────┐   │
│  │  • user-collection-registry │ │    │  │     libp2p Network        │   │
│  │    └─ Maps DIDs to stores   │ │    │  │                           │   │
│  │                             │ │    │  │  • Peer Discovery         │   │
│  │  • database.ts              │ │    │  │  • Network Transport      │   │
│  │    └─ SQLite wrapper        │ │    │  │  • Peer Routing           │   │
│  │                             │ │    │  └───────────────────────────┘   │
│  │  • auth-middleware.ts       │ │    │                                   │
│  │    └─ JWT validation        │ │    │  WebSocket (Port 9091)            │
│  │                             │ │    │  └─ Real-time P2P sync            │
│  └─────────────────────────────┘ │    └───────────────────────────────────┘
│                                   │
│  ┌─────────────────────────────┐ │
│  │    SQLite Database          │ │
│  │    (rbm.db)                 │ │
│  │                             │ │
│  │  Tables:                    │ │
│  │  • users (id, username,     │ │
│  │    passwordHash, did)       │ │
│  └─────────────────────────────┘ │
└───────────────────────────────────┘
```

## Data Flow Architecture

### 1. Authentication Flow

```
┌─────────┐         ┌──────────────┐         ┌──────────┐         ┌─────────┐
│ Browser │────────▶│ POST /api/   │────────▶│ Generate │────────▶│  Store  │
│         │  creds  │ auth/p2p/    │  hash   │   DID    │   JWT   │ in      │
│         │         │ register     │ password│ (P2P ID) │         │ SQLite  │
└─────────┘         └──────────────┘         └──────────┘         └─────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Return JWT + │
                    │ User Info    │
                    └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ localStorage │
                    │ • userId     │
                    │ • username   │
                    │ • did        │
                    └──────────────┘
```

### 2. Collection Creation Flow

```
┌─────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Browser │───▶│ POST /api/   │───▶│ OrbitDB      │───▶│ Create       │
│         │    │ collections/ │    │ Client       │    │ KeyValue     │
│         │    │ p2p          │    │ HTTP Request │    │ Store        │
└─────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                            │                   │
                                            ▼                   ▼
                                    ┌──────────────┐    ┌──────────────┐
                                    │ POST         │    │ OrbitDB      │
                                    │ localhost:   │    │ Service      │
                                    │ 4001/        │    │ Creates DB   │
                                    │ create-db    │    └──────────────┘
                                    └──────────────┘            │
                                            │                   ▼
                                            │           ┌──────────────┐
                                            │           │ Store        │
                                            │           │ Address in   │
                                            │           │ Registry     │
                                            │           └──────────────┘
                                            ▼
                                    ┌──────────────┐
                                    │ Return       │
                                    │ Collection   │
                                    │ Address      │
                                    └──────────────┘
```

### 3. Document Upload Flow

```
┌─────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Browser │───▶│ POST /api/   │───▶│ Create       │───▶│ Store in     │
│         │    │ documents/   │    │ Document     │    │ OrbitDB      │
│ Upload  │    │ p2p          │    │ Object       │    │ Collection   │
│ Quote/  │    │              │    │              │    │              │
│ Link/   │    │              │    │ {            │    │ PUT key:     │
│ Image   │    │              │    │   id,        │    │ doc-{id}     │
│         │    │              │    │   type,      │    │              │
│         │    │              │    │   metadata,  │    │ value:       │
│         │    │              │    │   created,   │    │ document     │
│         │    │              │    │   version: 1,│    │              │
│         │    │              │    │   ...        │    │              │
│         │    │              │    │ }            │    │              │
└─────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                │
                                                                ▼
                                                        ┌──────────────┐
                                                        │ OrbitDB      │
                                                        │ broadcasts   │
                                                        │ to P2P       │
                                                        │ network      │
                                                        └──────────────┘
```

### 4. Search Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser - Feed Page                          │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Search Bar (Always Visible)                   │    │
│  │                                                             │    │
│  │  Input: "type:quote keywords:philosophy,distributed"       │    │
│  └────────────────────┬───────────────────────────────────────┘    │
│                       │                                             │
│                       │ 300ms debounce                             │
│                       ▼                                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              parseSearchQuery()                            │    │
│  │                                                             │    │
│  │  Extract:                                                   │    │
│  │  • types: ['quote']                                        │    │
│  │  • keywords: ['philosophy', 'distributed']                 │    │
│  │  • title: '' (remaining text)                              │    │
│  └────────────────────┬───────────────────────────────────────┘    │
│                       │                                             │
│                       │ Pass filters as props                       │
│                       ▼                                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │         GlobalFeedDocuments Component                      │    │
│  │                                                             │    │
│  │  useEffect triggers on filter change                       │    │
│  └────────────────────┬───────────────────────────────────────┘    │
└────────────────────────┼────────────────────────────────────────────┘
                         │
                         │ GET request with params
                         ▼
            ┌────────────────────────────────────┐
            │ GET /api/feed/search?              │
            │   type=quote&                      │
            │   keywords=philosophy,distributed  │
            └────────────────┬───────────────────┘
                             │
                             ▼
            ┌────────────────────────────────────┐
            │  Server-Side Search API            │
            │                                    │
            │  1. Get all collections from       │
            │     userCollectionRegistry         │
            │                                    │
            │  2. Fetch documents from each      │
            │     collection via OrbitDB         │
            │                                    │
            │  3. Apply filters:                 │
            │     • Type filter (documentType)   │
            │     • Keywords (metadata.keywords) │
            │     • Title (title/description)    │
            │                                    │
            │  4. Sort by creation date          │
            │                                    │
            │  5. Paginate (offset/limit)        │
            └────────────────┬───────────────────┘
                             │
                             │ Return filtered results
                             ▼
            ┌────────────────────────────────────┐
            │ Response:                          │
            │ {                                  │
            │   items: [...],                    │
            │   total: 4,                        │
            │   hasMore: false,                  │
            │   filters: { type, keywords, ... } │
            │ }                                  │
            └────────────────┬───────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Browser Updates Display                         │
│                                                                    │
│  • Show filtered documents in grid                                │
│  • Display result count                                           │
│  • Show "No results found" if empty                               │
│  • Keep previous results visible during search                    │
└────────────────────────────────────────────────────────────────────┘
```

### 5. Document Edit Flow with Version History

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Browser - Document Card                          │
│                                                                     │
│  User clicks "Edit" button                                         │
│  ├─▶ Opens DocumentEditModal                                       │
│  │                                                                  │
│  │   ┌────────────────────────────────────────────────────────┐   │
│  │   │  DocumentEditModal                                     │   │
│  │   │                                                         │   │
│  │   │  • Pre-filled with current metadata                    │   │
│  │   │  • Read-only fields: quoteContent, URL                 │   │
│  │   │  • Editable: author, title, keywords, etc.             │   │
│  │   │  • Required: changeComment (edit description)          │   │
│  │   └────────────┬───────────────────────────────────────────┘   │
│  │                │                                                │
│  │                │ User edits and clicks Save                     │
│  │                ▼                                                │
└──┼────────────────────────────────────────────────────────────────┘
   │
   │ POST /api/documents/p2p/edit
   │
   ▼
┌────────────────────────────────────────────────────────────────────┐
│              Server - Edit API Route                               │
│                                                                    │
│  1. Fetch current document from OrbitDB                           │
│     currentVersion = doc.version || 1                             │
│                                                                    │
│  2. Create version history entry:                                 │
│     {                                                              │
│       version: currentVersion,  // Store OLD version (e.g., 1)    │
│       editedBy: peerId,                                           │
│       editedAt: timestamp,                                        │
│       changeComment: "Updated author field",                      │
│       previousMetadata: { ...oldMetadata }                        │
│     }                                                              │
│                                                                    │
│  3. Push to versionHistory array                                  │
│                                                                    │
│  4. Update document:                                              │
│     {                                                              │
│       ...currentDocument,                                         │
│       metadata: updatedMetadata,                                  │
│       version: currentVersion + 1,  // NEW version (e.g., 2)      │
│       versionHistory: [...history, newEntry]                      │
│     }                                                              │
│                                                                    │
│  5. Store updated document in OrbitDB                             │
└────────────────────┬───────────────────────────────────────────────┘
                     │
                     │ Success response
                     ▼
┌────────────────────────────────────────────────────────────────────┐
│              Browser - View Version History                        │
│                                                                    │
│  User clicks "Version History" button                             │
│  ├─▶ Opens DocumentVersionBrowser                                 │
│  │                                                                 │
│  │   ┌─────────────────────┬─────────────────────────────────┐   │
│  │   │  Version List       │  Metadata Details               │   │
│  │   │                     │                                 │   │
│  │   │  ✓ v3 (Current)     │  Current State:                 │   │
│  │   │  │ - Latest         │  • author: "Third Edit Author"  │   │
│  │   │                     │  • title: "..."                 │   │
│  │   │  □ v2               │  • keywords: [...]              │   │
│  │   │  │ "Second edit"    │                                 │   │
│  │   │  │ 2025-10-01       │  Click v2 to see:               │   │
│  │   │                     │  • author: "Second Edit Author" │   │
│  │   │  □ v1               │  • title: "..."                 │   │
│  │   │  │ "First edit"     │  • keywords: [...]              │   │
│  │   │  │ 2025-10-01       │                                 │   │
│  │   └─────────────────────┴─────────────────────────────────┘   │
│  │                                                                 │
│  │   Version history shows:                                       │
│  │   • All past versions                                          │
│  │   • Edit comments                                              │
│  │   • Timestamps                                                 │
│  │   • Editor (DID)                                               │
│  │   • Previous metadata snapshot                                │
└────────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
App
│
├─ ThemeContext (Provider)
│  └─ Wraps entire app for dark/light mode
│
├─ Navigation
│  ├─ Links to: Feed, Collections, Profile, Chat
│  └─ Shows: Current user, theme toggle
│
├─ Pages
│  │
│  ├─ /auth
│  │  ├─ Login/Register forms
│  │  └─ Creates user → localStorage
│  │
│  ├─ /feed (MAIN FEATURE)
│  │  │
│  │  ├─ Search Bar (Always Visible)
│  │  │  ├─ Input field with command syntax
│  │  │  ├─ parseSearchQuery() function
│  │  │  ├─ 300ms debounce
│  │  │  └─ Passes filters to GlobalFeedDocuments
│  │  │
│  │  └─ GlobalFeedDocuments
│  │     ├─ Receives filters as props
│  │     ├─ useEffect on filter changes
│  │     ├─ Fetches from /api/feed or /api/feed/search
│  │     ├─ Displays document grid
│  │     │
│  │     ├─ Document Cards (click to expand)
│  │     │  ├─ Quote cards: show quote, author
│  │     │  ├─ Link cards: show title, description, URL
│  │     │  ├─ Image cards: show preview, metadata
│  │     │  └─ Each card shows: owner, collection, date
│  │     │
│  │     ├─ DocumentEditModal (on edit button)
│  │     │  ├─ Type-specific forms
│  │     │  ├─ Read-only: quoteContent, URL
│  │     │  ├─ Editable: author, title, keywords, etc.
│  │     │  ├─ Required: changeComment
│  │     │  └─ Save → POST /api/documents/p2p/edit
│  │     │
│  │     └─ DocumentVersionBrowser
│  │        ├─ Two-column layout
│  │        ├─ Left: Version list with timestamps
│  │        ├─ Right: Metadata for selected version
│  │        └─ Shows complete edit history
│  │
│  ├─ /collections
│  │  ├─ User's collections list
│  │  ├─ Create new collection
│  │  └─ View collection details
│  │
│  └─ /collections/[id]
│     ├─ Collection details
│     ├─ Upload documents (quote/link/image)
│     └─ P2PDocumentsApi component
│
└─ Modals (Reusable)
   ├─ DocumentEditModal
   ├─ DocumentVersionBrowser
   └─ Document detail modals
```

## Data Models

### User (SQLite)
```typescript
{
  id: string              // Auto-generated
  username: string        // Unique
  passwordHash: string    // bcrypt hashed
  did: string            // did:p2p:{hash} - P2P identity
  createdAt: number      // Timestamp
}
```

### Collection (OrbitDB KeyValue Store)
```typescript
{
  id: string              // collection-{did}-{timestamp}
  name: string
  description: string
  owner: string           // DID
  created: number
  lastUpdated: number
  type: "COLLECTION"
  address: string         // /orbitdb/zdpu...
}
```

### Document (OrbitDB KeyValue Store)
```typescript
{
  id: string              // doc-{timestamp}-{random}
  documentType: "quote" | "link" | "image"
  title: string
  description: string
  collectionId: string
  uploadedBy: string      // DID
  created: number
  lastAccessed: number
  replicas: string[]      // DIDs of peers with copies
  pinned: boolean
  version: number         // Incremented on each edit
  versionHistory: [       // Array of past versions
    {
      version: number     // OLD version number
      editedBy: string    // DID
      editedAt: number
      changeComment: string
      previousMetadata: {...}  // Snapshot of metadata
    }
  ]

  // Type-specific metadata
  metadata: {
    // Quote
    quoteContent?: string  // READ-ONLY after creation
    author?: string
    title?: string
    publisher?: string
    year?: string
    pageNumbers?: string
    keywords?: string[]

    // Link
    url?: string          // READ-ONLY after creation
    title?: string
    author?: string
    siteName?: string
    description?: string
    keywords?: string[]

    // Image
    filename?: string
    mimeType?: string
    creator?: string
    title?: string
    description?: string
    keywords?: string[]
  }
}
```

### User Collection Registry (OrbitDB KeyValue Store)
```typescript
// Key: "user:{did}"
// Value:
{
  collections: string[]   // Array of collection store names
}
```

## Technology Stack

### Frontend
- **Next.js 15.4.5** - React framework with App Router
- **React 19.1.0** - UI library
- **Tailwind CSS 3.4.0** - Styling
- **TypeScript 5** - Type safety

### Backend (Next.js API Routes)
- **Node.js 20** - Runtime
- **SQLite (better-sqlite3)** - User authentication
- **JWT (jose)** - Token-based auth
- **bcrypt** - Password hashing

### P2P Storage
- **OrbitDB 3.0.2** - Distributed database
- **Helia 5.5.1** - IPFS implementation
- **libp2p 2.10.0** - P2P networking

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Nginx** - Reverse proxy with SSL
- **Jest** - Testing framework

## Key Features

1. **P2P Document Management**
   - Distributed storage using OrbitDB
   - No central server for documents
   - Peer-to-peer replication

2. **Document Types**
   - Quotes (text, author, source)
   - Links (URL, metadata)
   - Images (file, metadata)

3. **Version History**
   - Track all document edits
   - Store previous metadata states
   - View complete edit history
   - Edit comments for audit trail

4. **Search Functionality**
   - Command-based syntax (type:, keywords:)
   - Real-time filtering
   - Debounced search (300ms)
   - Always-visible search bar
   - Multiple filter types working together

5. **Collections**
   - Organize documents
   - Per-user collections
   - Share via P2P network

6. **Global Feed**
   - View all documents from all users
   - Search and filter
   - Infinite scroll pagination

## Port Mapping

```
External (Browser) → Nginx (8443) → Services
                         │
                         ├─→ Next.js Server (3000)
                         │   └─→ API Routes
                         │       └─→ OrbitDB Client
                         │           └─→ HTTP to OrbitDB Service
                         │
                         └─→ OrbitDB Service (4001, 9091)
                             ├─→ HTTP API (4001)
                             └─→ WebSocket (9091)
```

## Development vs Production

### Development
```bash
make up              # Start containers
make logs           # View logs
make restart        # Restart services
docker exec web-1 npm test  # Run tests
```

### Production
```bash
make build          # Build optimized containers
make up             # Start in production mode
```

All data persists in Docker volumes across rebuilds.
