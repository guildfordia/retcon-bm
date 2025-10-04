# Claude Code Assistant Instructions

## 🐳 CRITICAL: Docker-First Environment

**THIS APPLICATION RUNS ENTIRELY IN DOCKER CONTAINERS**

### Container Architecture
- **web**: Next.js app on port 3000 (internal) → https://localhost:8443 (external via nginx)
- **orbitdb**: P2P service on port 4001 (HTTP) and 9091 (WebSocket)
- **nginx**: HTTPS proxy on port 8443

### Command Mapping

❌ **NEVER RUN THESE DIRECTLY:**
```bash
npm install
npm run dev
npm test
npm run build
npm start
```

✅ **ALWAYS USE THESE INSTEAD:**
```bash
# Development
make up          # Start all services
make down        # Stop all services
make restart     # Restart services
make build       # Rebuild containers
make clean       # Clean restart

# Testing
docker exec retcon-black-mountain-web-1 npm test
docker exec retcon-black-mountain-web-1 npm run test:integration

# Logs & Status
make logs        # View logs
make status      # Check health

# Database/Files
# All data persists in Docker volumes - don't modify host files directly
```

### URL Access
- **Production**: https://localhost:8443 (nginx proxy)
- **Dev Direct**: http://localhost:3000 (only when Docker web container is running)
- **OrbitDB API**: http://localhost:4001
- **OrbitDB WebSocket**: ws://localhost:9091

### Before ANY npm command:
1. Check if Docker containers are running: `docker compose ps`
2. If containers are running, use Docker exec instead
3. If testing is needed, test inside containers or stop containers first

### Integration Testing
- OrbitDB integration tests connect to the running Docker OrbitDB service
- Never run integration tests while containers are running on same ports
- Use `make test-integration` (if available) or Docker exec approach

## 🚨 Failure Recovery
If you accidentally run npm commands and create conflicts:
```bash
# Kill any local processes
pkill -f "next\|node"
lsof -ti:3000,4001,9091 | xargs kill -9

# Restart clean
make clean
make build
make up
```

Remember: This is a **Docker-first application**. All development, testing, and production happens in containers.

## 📚 Collections & Documents

### Collections Architecture
- **P2P-Only**: All collections are P2P collections stored in OrbitDB
- **One Collection Per User**: Each user has exactly one collection
- **No Manual Creation**: Users cannot create new collections
- **Auto-Naming**: Collections are automatically named `{username}'s collection` (e.g., "theodore's collection", "dummy's collection")
- **No Renaming**: Collection names cannot be changed by users
- **No Descriptions**: Collections do not have descriptions

### Document Types

The application supports three types of documents:

### 1. Quote
Text excerpts from books with bibliographic information
- **Metadata**: ISO-690 citation format (author, title, publisher, year, ISBN, etc.)
- **Additional fields**: Keywords, page numbers

### 2. Link URL
Web links with comprehensive metadata
- **Metadata**: URL, title, description, author, publication date, site name, etc.
- **Additional fields**: All relevant metadata for web resources

### 3. Image
Visual documents with descriptive metadata
- **Metadata**: Title, description, creator, source, date, dimensions, format, etc.
- **Additional fields**: All relevant metadata for images