# Retcon Black Mountain - Visual Architecture Diagrams

## How to View These Diagrams

These are Mermaid diagrams. You can view them by:
1. **GitHub**: Push this file to GitHub - it will render automatically
2. **VS Code**: Install "Markdown Preview Mermaid Support" extension
3. **Online**: Copy the code to https://mermaid.live/
4. **Export**: Use mermaid.live to export as PNG/SVG

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Client Browser"
        UI[Next.js React App<br/>Port: Browser]
        SearchBar[Search Bar<br/>Always Visible]
        Feed[Global Feed]
        Collections[Collections]
        Components[React Components]

        UI --> SearchBar
        UI --> Feed
        UI --> Collections
        UI --> Components
    end

    subgraph "Nginx Reverse Proxy"
        Nginx[Nginx<br/>Port 8443 HTTPS]
    end

    subgraph "Next.js Server"
        NextServer[Next.js<br/>Port 3000]
        APIRoutes[API Routes]
        AuthAPI[/api/auth/p2p/*]
        FeedAPI[/api/feed/*]
        DocsAPI[/api/documents/*]
        CollAPI[/api/collections/*]

        NextServer --> APIRoutes
        APIRoutes --> AuthAPI
        APIRoutes --> FeedAPI
        APIRoutes --> DocsAPI
        APIRoutes --> CollAPI

        SQLite[(SQLite DB<br/>Users)]
        OrbitClient[OrbitDB Client<br/>HTTP Wrapper]

        AuthAPI --> SQLite
        FeedAPI --> OrbitClient
        DocsAPI --> OrbitClient
        CollAPI --> OrbitClient
    end

    subgraph "OrbitDB Service"
        OrbitServer[OrbitDB HTTP Server<br/>Port 4001]
        OrbitDB[(OrbitDB<br/>Distributed DB)]
        IPFS[IPFS/Helia<br/>Content Storage]
        LibP2P[libp2p Network<br/>P2P Layer]

        OrbitServer --> OrbitDB
        OrbitDB --> IPFS
        OrbitDB --> LibP2P

        WS[WebSocket<br/>Port 9091]
        OrbitDB --> WS
    end

    UI -->|HTTPS| Nginx
    Nginx --> NextServer
    OrbitClient -->|HTTP| OrbitServer

    style SearchBar fill:#4CAF50
    style Feed fill:#2196F3
    style OrbitDB fill:#FF9800
    style IPFS fill:#9C27B0
```

---

## 2. Search Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant SearchBar as Search Bar<br/>(Always Visible)
    participant Parser as Query Parser
    participant Component as GlobalFeedDocuments
    participant API as /api/feed/search
    participant OrbitDB as OrbitDB Service
    participant Display as Feed Display

    User->>SearchBar: Type "type:quote keywords:philosophy"
    SearchBar->>SearchBar: Wait 300ms (debounce)
    SearchBar->>Parser: parseSearchQuery()
    Parser->>Parser: Extract filters:<br/>types: ["quote"]<br/>keywords: ["philosophy"]<br/>title: ""
    Parser->>Component: Pass filters as props
    Component->>Component: useEffect triggered
    Component->>API: GET /api/feed/search?<br/>type=quote&keywords=philosophy
    API->>OrbitDB: Fetch all collections
    OrbitDB-->>API: Return collections
    API->>OrbitDB: Get documents from each collection
    OrbitDB-->>API: Return all documents
    API->>API: Apply filters:<br/>1. Filter by type<br/>2. Filter by keywords<br/>3. Sort by date
    API->>API: Paginate (offset/limit)
    API-->>Component: Return filtered results
    Component->>Display: Update grid with results
    Display-->>User: Show filtered documents

    Note over SearchBar,Display: Search bar stays visible<br/>throughout entire process
```

---

## 3. Document Edit Flow with Version History

```mermaid
sequenceDiagram
    participant User
    participant Card as Document Card
    participant Modal as DocumentEditModal
    participant API as /api/documents/p2p/edit
    participant OrbitDB as OrbitDB Service
    participant History as Version History

    User->>Card: Click "Edit" button
    Card->>Modal: Open modal with current data
    Modal->>Modal: Display form:<br/>- Read-only: quote/URL<br/>- Editable: metadata<br/>- Required: changeComment
    User->>Modal: Edit metadata<br/>Add change comment
    User->>Modal: Click "Save"
    Modal->>API: POST with:<br/>- documentId<br/>- updatedMetadata<br/>- changeComment

    API->>OrbitDB: Fetch current document
    OrbitDB-->>API: Return document (v1)

    API->>API: Create version entry:<br/>{<br/>  version: 1 (OLD),<br/>  editedBy: DID,<br/>  editedAt: timestamp,<br/>  changeComment: "...",<br/>  previousMetadata: {...}<br/>}

    API->>API: Update document:<br/>{<br/>  ...currentDoc,<br/>  metadata: new,<br/>  version: 2 (NEW),<br/>  versionHistory: [entry]<br/>}

    API->>OrbitDB: Store updated document
    OrbitDB-->>API: Success
    API-->>Modal: Document updated
    Modal->>Card: Refresh display

    User->>Card: Click "Version History"
    Card->>History: Open version browser
    History->>History: Display:<br/>✓ v2 (Current)<br/>□ v1 "First edit"
    User->>History: Click v1
    History->>History: Show v1 metadata snapshot
```

---

## 4. Collection & Document Creation Flow

```mermaid
flowchart TD
    Start([User Creates Collection]) --> Auth{Authenticated?}
    Auth -->|No| Login[Redirect to /auth]
    Auth -->|Yes| CreateForm[Fill Collection Form<br/>Name + Description]

    CreateForm --> Submit[POST /api/collections/p2p]
    Submit --> GenID[Generate Collection ID<br/>collection-DID-timestamp]
    GenID --> OrbitCreate[OrbitDB: Create KeyValue Store]
    OrbitCreate --> StoreAddr[Get OrbitDB Address<br/>/orbitdb/zdpu...]
    StoreAddr --> Registry[Update User Registry<br/>Add collection to user's list]
    Registry --> SaveMeta[Store Collection Metadata<br/>in OrbitDB]
    SaveMeta --> Return[Return Collection Info]

    Return --> UploadDoc{Upload Document?}
    UploadDoc -->|Yes| DocType{Document Type}
    UploadDoc -->|No| End([Done])

    DocType -->|Quote| QuoteForm[Quote Form:<br/>- Content<br/>- Author<br/>- Source<br/>- Keywords]
    DocType -->|Link| LinkForm[Link Form:<br/>- URL<br/>- Title<br/>- Description<br/>- Keywords]
    DocType -->|Image| ImageForm[Image Form:<br/>- File<br/>- Metadata<br/>- Keywords]

    QuoteForm --> CreateDoc[Create Document Object]
    LinkForm --> CreateDoc
    ImageForm --> CreateDoc

    CreateDoc --> DocID[Generate doc-timestamp-random]
    DocID --> InitVersion[Set version: 1<br/>versionHistory: []]
    InitVersion --> StoreDoc[Store in Collection<br/>PUT doc-{id}]
    StoreDoc --> Broadcast[OrbitDB Broadcasts<br/>to P2P Network]
    Broadcast --> End

    style QuoteForm fill:#E1F5FE
    style LinkForm fill:#FFF9C4
    style ImageForm fill:#F3E5F5
    style OrbitCreate fill:#FF9800
    style Broadcast fill:#4CAF50
```

---

## 5. Authentication Flow

```mermaid
flowchart LR
    subgraph "Registration"
        RegStart([User Registers]) --> RegForm[Enter:<br/>- Username<br/>- Password]
        RegForm --> RegAPI[POST /api/auth/p2p/register]
        RegAPI --> Hash[bcrypt Hash Password]
        Hash --> GenDID[Generate DID<br/>did:p2p:hash]
        GenDID --> SaveUser[(Save to SQLite:<br/>users table)]
        SaveUser --> GenJWT[Generate JWT Token]
        GenJWT --> RegStore[Store in localStorage:<br/>- userId<br/>- username<br/>- did]
        RegStore --> RegEnd([Authenticated])
    end

    subgraph "Login"
        LoginStart([User Logs In]) --> LoginForm[Enter:<br/>- Username<br/>- Password]
        LoginForm --> LoginAPI[POST /api/auth/p2p/login]
        LoginAPI --> Verify[Verify Password<br/>bcrypt.compare]
        Verify -->|Invalid| LoginFail[Return 401]
        Verify -->|Valid| FindUser[(Find User in SQLite)]
        FindUser --> LoginJWT[Generate JWT Token]
        LoginJWT --> LoginStore[Store in localStorage:<br/>- userId<br/>- username<br/>- did]
        LoginStore --> LoginEnd([Authenticated])
    end

    subgraph "Protected Routes"
        Request([API Request]) --> CheckToken{JWT Valid?}
        CheckToken -->|No| Reject[401 Unauthorized]
        CheckToken -->|Yes| GetDID[Extract DID from JWT]
        GetDID --> AuthReq[Process Request<br/>with User Context]
        AuthReq --> Response([Return Data])
    end

    style Hash fill:#FF5722
    style GenDID fill:#9C27B0
    style GenJWT fill:#4CAF50
    style LoginJWT fill:#4CAF50
```

---

## 6. Component Hierarchy

```mermaid
graph TD
    App[App Root]

    App --> Theme[ThemeContext Provider<br/>Dark/Light Mode]

    Theme --> Nav[Navigation Component<br/>User Info + Links]
    Theme --> Pages[Pages]

    Pages --> Auth[/auth - Login/Register]
    Pages --> Feed[/feed - Global Feed]
    Pages --> Coll[/collections - User Collections]
    Pages --> CollID[/collections/id - Collection Detail]
    Pages --> Profile[/profile - User Profile]

    Feed --> FeedSearch[Search Bar Component<br/>ALWAYS VISIBLE]
    Feed --> FeedDocs[GlobalFeedDocuments]

    FeedSearch --> Parser[parseSearchQuery Function]
    Parser --> FeedDocs

    FeedDocs --> Grid[Document Grid<br/>Infinite Scroll]
    Grid --> QuoteCard[Quote Cards]
    Grid --> LinkCard[Link Cards]
    Grid --> ImageCard[Image Cards]

    QuoteCard --> EditModal[DocumentEditModal]
    LinkCard --> EditModal
    ImageCard --> EditModal

    QuoteCard --> VersionModal[DocumentVersionBrowser]
    LinkCard --> VersionModal
    ImageCard --> VersionModal

    CollID --> P2PDocs[P2PDocumentsApi]
    P2PDocs --> Upload[Upload Forms]
    P2PDocs --> DocList[Document List]

    style FeedSearch fill:#4CAF50,stroke:#2E7D32,stroke-width:3px
    style Feed fill:#2196F3
    style EditModal fill:#FF9800
    style VersionModal fill:#9C27B0
```

---

## 7. Data Models

```mermaid
erDiagram
    USER ||--o{ COLLECTION : creates
    COLLECTION ||--o{ DOCUMENT : contains
    DOCUMENT ||--o{ VERSION_HISTORY : tracks

    USER {
        string id PK
        string username UK
        string passwordHash
        string did UK
        number createdAt
    }

    COLLECTION {
        string id PK
        string name
        string description
        string owner FK
        number created
        number lastUpdated
        string address
        string type
    }

    DOCUMENT {
        string id PK
        string documentType
        string title
        string description
        string collectionId FK
        string uploadedBy FK
        number created
        number lastAccessed
        array replicas
        boolean pinned
        number version
        array versionHistory
        object metadata
    }

    VERSION_HISTORY {
        number version
        string editedBy
        number editedAt
        string changeComment
        object previousMetadata
    }

    QUOTE_METADATA {
        string quoteContent
        string author
        string title
        string publisher
        string year
        string pageNumbers
        array keywords
    }

    LINK_METADATA {
        string url
        string title
        string author
        string siteName
        string description
        array keywords
    }

    IMAGE_METADATA {
        string filename
        string mimeType
        string creator
        string title
        string description
        array keywords
    }

    DOCUMENT ||--o| QUOTE_METADATA : "if type=quote"
    DOCUMENT ||--o| LINK_METADATA : "if type=link"
    DOCUMENT ||--o| IMAGE_METADATA : "if type=image"
```

---

## 8. Technology Stack

```mermaid
graph LR
    subgraph "Frontend"
        React[React 19.1.0]
        Next[Next.js 15.4.5]
        TS[TypeScript 5]
        Tailwind[Tailwind CSS 3.4.0]

        Next --> React
        Next --> TS
        React --> Tailwind
    end

    subgraph "Backend"
        Node[Node.js 20]
        SQLite[SQLite<br/>better-sqlite3]
        JWT[JWT - jose]
        Bcrypt[bcrypt]

        Node --> SQLite
        Node --> JWT
        Node --> Bcrypt
    end

    subgraph "P2P Layer"
        OrbitDB[OrbitDB 3.0.2]
        Helia[Helia 5.5.1<br/>IPFS]
        LibP2P[libp2p 2.10.0]

        OrbitDB --> Helia
        OrbitDB --> LibP2P
    end

    subgraph "Infrastructure"
        Docker[Docker]
        Compose[Docker Compose]
        Nginx[Nginx]
        Jest[Jest Testing]

        Docker --> Compose
        Compose --> Nginx
    end

    Next -.->|API| Node
    Node -.->|HTTP| OrbitDB
    Compose -.->|Orchestrates| Docker

    style OrbitDB fill:#FF9800
    style Helia fill:#9C27B0
    style Next fill:#2196F3
    style Docker fill:#0DB7ED
```

---

## 9. Port Architecture

```mermaid
graph TB
    Browser[Browser Client<br/>HTTPS]

    subgraph "External Layer"
        Nginx[Nginx Reverse Proxy<br/>Port 8443 HTTPS]
    end

    subgraph "Application Layer"
        NextJS[Next.js Server<br/>Port 3000 HTTP]
        OrbitHTTP[OrbitDB HTTP API<br/>Port 4001]
        OrbitWS[OrbitDB WebSocket<br/>Port 9091]
    end

    subgraph "Storage Layer"
        SQLite[(SQLite Database<br/>rbm.db)]
        OrbitData[(OrbitDB Data<br/>Docker Volume)]
        IPFS[(IPFS Blocks<br/>Docker Volume)]
    end

    Browser -->|https://localhost:8443| Nginx
    Nginx -->|Proxy Pass| NextJS
    Nginx -->|Proxy Pass| OrbitHTTP

    NextJS -->|Query| SQLite
    NextJS -->|HTTP Client| OrbitHTTP

    OrbitHTTP -->|Read/Write| OrbitData
    OrbitHTTP -->|Store Blocks| IPFS
    OrbitWS -->|P2P Sync| OrbitData

    style Nginx fill:#00C853
    style NextJS fill:#2196F3
    style OrbitHTTP fill:#FF9800
    style OrbitWS fill:#FF5722
```

---

## How to Export as Image

### Option 1: GitHub (Easiest)
1. Commit this file to your repository
2. Push to GitHub
3. Open the file on GitHub - it will render automatically
4. Take a screenshot or use GitHub's built-in export

### Option 2: Mermaid Live Editor
1. Go to https://mermaid.live/
2. Copy any diagram code from above
3. Paste into the editor
4. Click "Actions" → "PNG" or "SVG" to download

### Option 3: VS Code
1. Install extension: "Markdown Preview Mermaid Support"
2. Open this file in VS Code
3. Click preview button
4. Right-click diagram → "Copy Image" or screenshot

### Option 4: CLI Tools
```bash
# Install mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# Convert to image
mmdc -i ARCHITECTURE_MERMAID.md -o architecture.png
```

---

## Recommended Viewing Order

1. **System Architecture Overview** - See the big picture
2. **Search Flow Diagram** - Understand the main feature
3. **Component Hierarchy** - Learn the UI structure
4. **Document Edit Flow** - See version history in action
5. **Data Models** - Understand the data structure
6. **Technology Stack** - Know the tools used

Each diagram can be exported separately as needed!
