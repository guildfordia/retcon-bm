# Retcon Black Mountain - Route Map

## Frontend Pages (User-Facing URLs)

### Main Pages
- **`/`** - Home/Landing page
- **`/auth`** - Login/Register page
- **`/dashboard`** - User dashboard
- **`/profile`** - User profile and account info (shows DID, email, JWT token) ✅ NEW

### Collections
- **`/collections`** - List all P2P collections (grid/list view)
  - API: `GET /api/collections/p2p`
  - Shows all collections from OrbitDB

- **`/collections/p2p-[id]`** - View specific P2P collection
  - Example: `/collections/p2p-collection-did:p2p:abc123-456`
  - API: `GET /api/collections/p2p/[id]`
  - Shows collection details and documents

### Documents
- **`/documents`** - List all documents across all collections
  - API: `GET /api/documents`

### Feed
- **`/feed`** - Global activity feed

---

## Backend API Routes

### Authentication (P2P)
- **`POST /api/auth/p2p/register`** - Register new user with P2P DID
- **`POST /api/auth/p2p/login`** - Login with P2P credentials
- **`GET /api/auth/verify`** - Verify JWT token

### Collections (P2P - OrbitDB) ✅ ACTIVE
- **`GET /api/collections/p2p`** - List all P2P collections
  - Optional query param: `?peerId=did:p2p:...` to filter by user
  - Returns: `{ collections: [], type: 'p2p', network: 'orbitdb', status: 'connected' }`

- **`POST /api/collections/p2p`** - Create new P2P collection
  - Body: `{ name, description, peerId, accessType }`
  - Creates OrbitDB store
  - Registers in P2P registry (also stored in OrbitDB)
  - Limit: 1 collection per user

- **`GET /api/collections/p2p/[id]`** - Get specific P2P collection ✅ NEW
  - URL param: collection store name (e.g., `collection-did:p2p:abc-123`)
  - Returns: `{ collection: { id, name, description, orbitAddress, ... } }`

### Documents (P2P)
- **`GET /api/documents/p2p`** - List P2P documents
- **`POST /api/documents/p2p`** - Upload document to P2P collection
- **`POST /api/documents/p2p-pin`** - Pin document to user's collection

### Health
- **`GET /api/health`** - Web service health check
- **`GET http://localhost:4001/health`** - OrbitDB service health check

---

## Old Routes (SQLite - To Be Removed)

### Collections (SQLite) ⚠️ DEPRECATED
- `GET /api/collections` - List SQLite collections
- `POST /api/collections` - Create SQLite collection
- `GET /api/collections/[id]` - Get SQLite collection by ID
- `PUT /api/collections/[id]` - Update SQLite collection
- `DELETE /api/collections/[id]` - Delete SQLite collection

### Documents (SQLite) ⚠️ DEPRECATED
- `GET /api/documents` - List SQLite documents (still used by `/documents` page)
- `POST /api/documents` - Upload document to SQLite
- `GET /api/documents/download` - Download document
- `POST /api/documents/fork` - Fork a document
- `POST /api/documents/pin` - Pin document (SQLite version)

---

## How It Works

### Creating a Collection
1. User clicks "New P2P Collection" on `/collections`
2. Form submits to `POST /api/collections/p2p`
3. Backend creates OrbitDB store: `collection-did:p2p:USER_DID-TIMESTAMP`
4. Backend stores metadata in that OrbitDB store under key `metadata`
5. Backend registers the store name in P2P registry: `user:USER_DID` → `{ collections: [storeName] }`
6. Collection appears in `/collections` list

### Viewing a Collection
1. User clicks collection card on `/collections`
2. Navigates to `/collections/p2p-collection-did:p2p:abc-123`
3. Page extracts `params.id` = `collection-did:p2p:abc-123`
4. Fetches from `GET /api/collections/p2p/collection-did:p2p:abc-123`
5. API reads metadata from OrbitDB store
6. Page displays collection details

### P2P Registry (OrbitDB)
- **Store Name**: `global-user-collection-registry`
- **Structure**:
  ```
  user:did:p2p:abc123 → { collections: ["collection-did:p2p:abc-123"] }
  ```
- **Persistence**: Stored in OrbitDB, persists across restarts
- **Location**: `/app/data` in OrbitDB Docker container

---

## Data Flow

```
User Browser
    ↓
Next.js App (port 3000)
    ↓
/api/* routes
    ↓
OrbitDB Client Library (src/lib/orbitdb-client.ts)
    ↓
HTTP requests to OrbitDB Service
    ↓
OrbitDB Service (port 4001 HTTP, 9091 WebSocket)
    ↓
OrbitDB + Helia (IPFS) + libp2p
    ↓
Persistent Storage: /app/data (Docker volume)
```

---

## Next Steps

1. ✅ Create `/profile` page for user data
2. ⏳ Fix collection routing issue
3. 🔄 Remove old SQLite collection routes
4. 🔄 Migrate all documents to P2P
5. 🔄 Remove SQLite database entirely