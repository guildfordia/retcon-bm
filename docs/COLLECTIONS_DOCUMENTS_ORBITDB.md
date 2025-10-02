# Collections, Documents & OrbitDB Architecture

## Simple Overview Diagram

```mermaid
graph TB
    subgraph "User Layer"
        User[User with DID<br/>did:p2p:abc123]
    end

    subgraph "Collection Layer"
        Coll1[Collection: My Quotes<br/>ID: collection-abc-001]
        Coll2[Collection: Research Links<br/>ID: collection-abc-002]
        Coll3[Collection: Photos<br/>ID: collection-abc-003]
    end

    subgraph "Document Layer"
        Doc1[Quote Document<br/>Nietzsche quote]
        Doc2[Quote Document<br/>Plato quote]
        Doc3[Link Document<br/>Wikipedia article]
        Doc4[Link Document<br/>Blog post]
        Doc5[Image Document<br/>Sunset photo]
    end

    subgraph "OrbitDB Layer"
        Store1[(OrbitDB KeyValue Store<br/>/orbitdb/zdpu...AAA)]
        Store2[(OrbitDB KeyValue Store<br/>/orbitdb/zdpu...BBB)]
        Store3[(OrbitDB KeyValue Store<br/>/orbitdb/zdpu...CCC)]
    end

    subgraph "IPFS Layer"
        IPFS[Helia/IPFS<br/>Distributed Storage<br/>P2P Network]
    end

    User -->|owns| Coll1
    User -->|owns| Coll2
    User -->|owns| Coll3

    Coll1 -->|contains| Doc1
    Coll1 -->|contains| Doc2
    Coll2 -->|contains| Doc3
    Coll2 -->|contains| Doc4
    Coll3 -->|contains| Doc5

    Coll1 -.->|stored in| Store1
    Coll2 -.->|stored in| Store2
    Coll3 -.->|stored in| Store3

    Store1 -->|uses| IPFS
    Store2 -->|uses| IPFS
    Store3 -->|uses| IPFS

    style User fill:#4CAF50
    style Coll1 fill:#2196F3
    style Coll2 fill:#2196F3
    style Coll3 fill:#2196F3
    style Doc1 fill:#FFC107
    style Doc2 fill:#FFC107
    style Doc3 fill:#FF9800
    style Doc4 fill:#FF9800
    style Doc5 fill:#9C27B0
    style IPFS fill:#E91E63
```

---

## How It Works Step-by-Step

### 1. **User Creates a Collection**

```mermaid
sequenceDiagram
    participant User
    participant API as Next.js API
    participant OrbitDB
    participant IPFS

    User->>API: Create "My Philosophy Quotes"
    API->>API: Generate ID:<br/>collection-did:p2p:abc-1234567890
    API->>OrbitDB: Create new KeyValue store
    OrbitDB->>IPFS: Initialize storage
    IPFS-->>OrbitDB: Return address:<br/>/orbitdb/zdpu...
    OrbitDB-->>API: Collection ready
    API-->>User: Collection created!
```

**What happens:**
- Each collection gets a unique ID
- OrbitDB creates a dedicated KeyValue database for it
- This database gets an IPFS address
- All documents in this collection will be stored in this database

---

### 2. **User Adds Documents to Collection**

```mermaid
sequenceDiagram
    participant User
    participant API
    participant Collection as Collection Store
    participant IPFS

    User->>API: Upload Quote Document
    API->>API: Create document object:<br/>{<br/>  id: "doc-123",<br/>  type: "quote",<br/>  metadata: {...},<br/>  version: 1<br/>}
    API->>Collection: PUT("doc-123", document)
    Collection->>IPFS: Store document data
    IPFS-->>Collection: Content stored
    Collection-->>API: Document saved
    API-->>User: Quote added to collection!
```

**What happens:**
- Document is created with unique ID
- Stored in the collection's OrbitDB KeyValue store
- Key = document ID (e.g., "doc-123")
- Value = entire document object
- IPFS handles the actual storage and replication

---

### 3. **Data Structure Deep Dive**

```mermaid
graph TB
    subgraph "Collection Object"
        CollObj["Collection {<br/>id: 'collection-did-123',<br/>name: 'My Quotes',<br/>owner: 'did:p2p:abc',<br/>address: '/orbitdb/zdpu...'<br/>}"]
    end

    subgraph "OrbitDB KeyValue Store"
        KV["KeyValue Store<br/>Address: /orbitdb/zdpu..."]

        Entry1["Key: 'doc-001'<br/>Value: Quote Document"]
        Entry2["Key: 'doc-002'<br/>Value: Quote Document"]
        Entry3["Key: 'doc-003'<br/>Value: Quote Document"]

        KV --> Entry1
        KV --> Entry2
        KV --> Entry3
    end

    subgraph "Document Example"
        DocObj["Document {<br/>id: 'doc-001',<br/>type: 'quote',<br/>title: 'Nietzsche Quote',<br/>collectionId: 'collection-did-123',<br/>version: 2,<br/>metadata: {<br/>  quoteContent: '...',<br/>  author: 'Nietzsche',<br/>  keywords: ['philosophy']<br/>},<br/>versionHistory: [...]<br/>}"]
    end

    CollObj -.->|points to| KV
    Entry1 -.->|contains| DocObj

    style CollObj fill:#2196F3
    style KV fill:#FF9800
    style DocObj fill:#FFC107
```

---

### 4. **Searching Across All Collections**

```mermaid
flowchart TD
    Start[User Searches:<br/>'type:quote keywords:philosophy'] --> API[API: /api/feed/search]

    API --> GetColls[Get ALL collections<br/>from OrbitDB]

    GetColls --> Coll1Check{Collection 1}
    GetColls --> Coll2Check{Collection 2}
    GetColls --> Coll3Check{Collection 3}

    Coll1Check --> Docs1[Get all documents<br/>from Collection 1 store]
    Coll2Check --> Docs2[Get all documents<br/>from Collection 2 store]
    Coll3Check --> Docs3[Get all documents<br/>from Collection 3 store]

    Docs1 --> Merge[Merge all documents]
    Docs2 --> Merge
    Docs3 --> Merge

    Merge --> Filter[Apply filters:<br/>- type = quote<br/>- keywords contains 'philosophy']

    Filter --> Sort[Sort by date]
    Sort --> Return[Return results to user]

    style Start fill:#4CAF50
    style Merge fill:#FF9800
    style Filter fill:#2196F3
    style Return fill:#9C27B0
```

**What happens:**
- API fetches list of all collections
- Opens each collection's OrbitDB store
- Gets all documents from each store
- Merges them into one big list
- Applies search filters
- Returns matching documents

---

## Key Concepts

### Collection = Container
```
Collection "My Philosophy Quotes"
├── Quote from Nietzsche
├── Quote from Plato
└── Quote from Aristotle
```

### OrbitDB = Database per Collection
```
Collection "My Philosophy Quotes"
    ↓
OrbitDB KeyValue Store (/orbitdb/zdpu...ABC)
    ↓
IPFS Distributed Storage
```

### Document = Individual Item
```
Document {
  id: "doc-001",
  type: "quote",
  collectionId: "collection-123",
  metadata: {
    quoteContent: "That which does not kill us...",
    author: "Friedrich Nietzsche",
    keywords: ["philosophy", "strength"]
  },
  version: 1
}
```

---

## Why This Architecture?

1. **Decentralized**: Each collection is a separate OrbitDB database
2. **P2P Replication**: IPFS automatically syncs data across peers
3. **Version Control**: Documents track their edit history
4. **Searchable**: Can query across all collections efficiently
5. **Ownership**: Each collection tied to a user's DID

---

## Storage Hierarchy

```
User (DID)
  └── Collections
        └── OrbitDB KeyValue Store (unique address)
              └── Documents (key-value pairs)
                    └── IPFS Blocks (distributed storage)
```

---

## View on GitHub

Once pushed to GitHub, these diagrams will render automatically!
