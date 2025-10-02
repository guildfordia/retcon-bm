.PHONY: help build up down restart logs clean status test-orbit deps build-only dev tailscale
.PHONY: prod-build prod-up prod-down prod-restart prod-logs prod-status prod-clean prod-backup prod-restore
.PHONY: seed-db rebuild clean-rebuild

# Default target
help:
	@echo "=== Development Commands ==="
	@echo "  make dev         - Full dev setup (clean + build + up)"
	@echo "  make build       - Install deps and build Docker images"
	@echo "  make up          - Start all services"
	@echo "  make down        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - View all logs"
	@echo "  make clean       - Clean up containers, volumes, and caches"
	@echo "  make status      - Check service status"
	@echo "  make test-orbit  - Test OrbitDB connectivity"
	@echo "  make deps        - Install dependencies (generates package-lock.json)"
	@echo "  make seed-db     - Seed database with example data"
	@echo "  make rebuild     - Rebuild and restart (keeps DB data)"
	@echo "  make clean-rebuild - Rebuild and restart (removes DB data)"
	@echo ""
	@echo "=== Production Commands ==="
	@echo "  make prod-build  - Build production images"
	@echo "  make prod-up     - Start production stack"
	@echo "  make prod-down   - Stop production stack"
	@echo "  make prod-restart- Restart production services"
	@echo "  make prod-logs   - View production logs"
	@echo "  make prod-status - Check production status"
	@echo "  make prod-clean  - Clean production (CAREFUL: removes volumes)"
	@echo "  make prod-backup - Create backup of production data"
	@echo "  make prod-restore- Restore from backup"
	@echo ""
	@echo "Quick start dev: make dev"
	@echo "Quick start prod: make prod-build && make prod-up"

# Install dependencies and generate package-lock.json files
deps:
	@echo "=== Installing main app dependencies ==="
	@if [ ! -f package-lock.json ]; then \
		echo "Generating package-lock.json..."; \
		npm install; \
	else \
		echo "package-lock.json exists, skipping..."; \
	fi
	@echo "=== Installing OrbitDB service dependencies ==="
	@if [ ! -f orbitdb-service/package-lock.json ]; then \
		echo "Generating orbitdb-service/package-lock.json..."; \
		cd orbitdb-service && npm install; \
	else \
		echo "orbitdb-service/package-lock.json exists, skipping..."; \
	fi

# Build all images with no cache (runs deps first)
build: deps build-only

# Just build without deps check
build-only:
	docker compose build --no-cache

# Start all services
up:
	docker compose up -d
	@echo ""
	@echo "✅ Services started!"
	@echo "   Web app: http://localhost:3000"
	@echo "   OrbitDB test: http://localhost:3000/test-browser-orbit"
	@echo "   OrbitDB dashboard: http://localhost:3000/test-orbitdb-dashboard"

# Stop all services
down:
	docker compose down

# Restart services
restart:
	docker compose restart

# View logs
logs:
	docker compose logs -f

# Clean everything
clean:
	@echo "=== Stopping services ==="
	docker compose down -v
	@echo "=== Removing build artifacts ==="
	rm -rf .next node_modules package-lock.json
	rm -rf orbitdb-service/node_modules orbitdb-service/package-lock.json
	rm -rf orbitdb-service/data orbitdb-service/test-data
	@echo "=== Cleaning Docker system ==="
	docker system prune -f
	@echo "✅ Clean complete!"

# Development workflow: clean, build, and start
dev: clean build up
	@echo "✅ Development environment ready!"
	@make status

# Setup for Tailscale remote access
tailscale:
	@./scripts/setup-tailscale.sh

# Check status
status:
	@echo "=== Service Status ==="
	@docker compose ps
	@echo ""
	@echo "=== Health Checks ==="
	@curl -s http://localhost:3000/api/health | jq . || echo "Web service not responding"
	@echo ""
	@curl -s http://localhost:4001/health | jq . || echo "OrbitDB service not responding"
	@echo ""
	@echo "=== Peer Info ==="
	@curl -s http://localhost:4001/peerinfo | jq . || echo "Cannot fetch peer info"

# Test OrbitDB connectivity
test-orbit:
	@echo "=== Testing OrbitDB ==="
	@echo "1. Fetching peer info..."
	@curl -s http://localhost:4001/peerinfo | jq .
	@echo ""
	@echo "2. Opening KV store..."
	@curl -s -X POST http://localhost:4001/kv/open \
		-H "Content-Type: application/json" \
		-d '{"name":"test-kv-store"}' | jq .
	@echo ""
	@echo "3. Putting test value..."
	@curl -s -X POST http://localhost:4001/kv/put \
		-H "Content-Type: application/json" \
		-d '{"name":"test-kv-store","key":"test","value":"hello from makefile"}' | jq .
	@echo ""
	@echo "4. Getting test value..."
	@curl -s "http://localhost:4001/kv/get?name=test-kv-store&key=test" | jq .
	@echo ""
	@echo "✅ OrbitDB test complete. Visit http://localhost:3000/test-browser-orbit to test browser connection."

# Seed database with example data
seed-db:
	@echo "=== Seeding database with example data ==="
	@curl -s -X POST http://localhost:3000/api/seed | jq .
	@echo ""
	@echo "✅ Database seeded!"

# Rebuild and restart (preserves database)
rebuild:
	@echo "=== Rebuilding (preserving database) ==="
	docker compose down
	docker compose build --no-cache
	docker compose up -d
	@echo "✅ Rebuild complete with database preserved!"
	@echo "   Database data persists in Docker volume 'web-data'"

# Clean rebuild (removes database)
clean-rebuild:
	@echo "=== Clean rebuild (removing all data) ==="
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d
	@echo "✅ Clean rebuild complete!"
	@echo "⚠️  All database data has been removed"
	@echo "   Run 'make seed-db' to populate with example data"

# ===== PRODUCTION COMMANDS =====

# Production build
prod-build:
	@echo "=== Building production images ==="
	@echo "This may take a while, especially on first build..."
	docker-compose -f docker-compose.production.yml build --no-cache || \
		(echo "Build failed, retrying with --pull flag..." && \
		 docker-compose -f docker-compose.production.yml build --pull)
	@echo "✅ Production build complete!"

# Production build with cache (faster)
prod-build-cached:
	@echo "=== Building production images (with cache) ==="
	docker-compose -f docker-compose.production.yml build
	@echo "✅ Production build complete!"

# Start production stack
prod-up:
	@echo "=== Starting production stack ==="
	docker-compose -f docker-compose.production.yml up -d
	@echo ""
	@echo "✅ Production services started!"
	@echo "   HTTPS: https://192.168.10.103:8443"
	@echo "   HTTP->HTTPS redirect: http://192.168.10.103"
	@echo ""
	@echo "Services:"
	@echo "   - Web app (Next.js)"
	@echo "   - OrbitDB service"
	@echo "   - Signaling server (WebRTC)"
	@echo "   - COTURN (STUN/TURN)"
	@echo "   - Nginx (HTTPS proxy)"
	@echo "   - Backup service"

# Stop production stack
prod-down:
	docker-compose -f docker-compose.production.yml down

# Restart production services
prod-restart:
	docker-compose -f docker-compose.production.yml restart

# View production logs
prod-logs:
	docker-compose -f docker-compose.production.yml logs -f

# Check production status
prod-status:
	@echo "=== Production Service Status ==="
	@docker-compose -f docker-compose.production.yml ps
	@echo ""
	@echo "=== Health Checks ==="
	@curl -sk https://192.168.10.103:8443/api/health | jq . || echo "Web service not responding"
	@echo ""
	@curl -sk https://192.168.10.103:8443/orbitdb/health | jq . || echo "OrbitDB service not responding"
	@echo ""
	@curl -sk https://192.168.10.103:8443/signaling/health | jq . || echo "Signaling service not responding"
	@echo ""
	@echo "=== Peer Info ==="
	@curl -sk https://192.168.10.103:8443/orbitdb/peerinfo | jq . || echo "Cannot fetch peer info"

# Clean production (WARNING: removes volumes)
prod-clean:
	@echo "⚠️  WARNING: This will remove all production data!"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	docker-compose -f docker-compose.production.yml down -v
	@echo "✅ Production cleanup complete!"

# Backup production data
prod-backup:
	@echo "=== Creating production backup ==="
	docker exec retcon-black-mountain-backup-1 /scripts/backup.sh
	@echo "✅ Backup complete!"

# Restore production data
prod-restore:
	@echo "=== Restoring from backup ==="
	@read -p "Enter backup filename (e.g., backup-2025-09-02-1430.tar.gz): " backup_file; \
	docker exec retcon-black-mountain-backup-1 /scripts/restore.sh /backups/$$backup_file
	@echo "✅ Restore complete! Restart services with: make prod-restart"

# Quick production deployment
prod-deploy: prod-build prod-up prod-status
	@echo "✅ Production deployment complete!"

# View specific service logs
prod-logs-web:
	docker-compose -f docker-compose.production.yml logs -f web

prod-logs-orbitdb:
	docker-compose -f docker-compose.production.yml logs -f orbitdb

prod-logs-signaling:
	docker-compose -f docker-compose.production.yml logs -f signaling

prod-logs-nginx:
	docker-compose -f docker-compose.production.yml logs -f nginx

prod-logs-coturn:
	docker-compose -f docker-compose.production.yml logs -f coturn

# Rebuild specific service
prod-rebuild-web:
	docker-compose -f docker-compose.production.yml build web
	docker-compose -f docker-compose.production.yml restart web nginx

# Test production OrbitDB
prod-test-orbit:
	@echo "=== Testing Production OrbitDB ==="
	@echo "1. Fetching peer info..."
	@curl -sk https://192.168.10.103:8443/orbitdb/peerinfo | jq .
	@echo ""
	@echo "2. Testing from browser:"
	@echo "   https://192.168.10.103:8443/test-browser-orbit"
	@echo "   https://192.168.10.103:8443/test-mobile"