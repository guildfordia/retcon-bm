#!/bin/bash
# VPS Setup Script for Retcon Black Mountain
# Run this on a fresh Ubuntu 22.04 VPS

set -e  # Exit on error

echo "🚀 Retcon Black Mountain - VPS Setup Script"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
   echo "⚠️  Please run as root or with sudo"
   exit 1
fi

# Get configuration
read -p "Enter your domain name (e.g., demo.example.com): " DOMAIN
read -p "Enter your email for Let's Encrypt: " EMAIL
read -p "Generate new JWT secret? (y/n): " GENERATE_JWT

echo ""
echo "📋 Configuration:"
echo "  Domain: $DOMAIN"
echo "  Email: $EMAIL"
echo ""

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
    apt install -y docker-compose-plugin
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already installed"
fi

# Install utilities
echo "🔧 Installing utilities..."
apt install -y git make jq openssl certbot

# Configure firewall
echo "🔥 Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8443/tcp  # HTTPS (nginx)
ufw --force enable
echo "✅ Firewall configured"

# Clone repository (if not already done)
if [ ! -d "/opt/retcon-black-mountain" ]; then
    echo "📥 Cloning repository..."
    read -p "Enter Git repository URL: " REPO_URL
    git clone "$REPO_URL" /opt/retcon-black-mountain
    cd /opt/retcon-black-mountain
else
    echo "✅ Repository already exists"
    cd /opt/retcon-black-mountain
fi

# Generate JWT secret
if [ "$GENERATE_JWT" = "y" ]; then
    echo "🔐 Generating JWT secret..."
    JWT_SECRET=$(openssl rand -base64 32)
    echo "$JWT_SECRET" > .jwt_secret
    chmod 600 .jwt_secret
    echo "✅ JWT secret generated and saved to .jwt_secret"
else
    read -p "Enter your JWT secret: " JWT_SECRET
fi

# Create .env.production file
echo "⚙️  Creating production configuration..."
cat > .env.production <<EOF
# Production Environment Configuration
# Generated: $(date)

# Security
JWT_SECRET=$JWT_SECRET

# Domain
DOMAIN=$DOMAIN

# Service URLs
ORBITDB_SERVICE_URL=http://orbitdb:4001
NEXT_PUBLIC_ORBITDB_URL=https://${DOMAIN}/orbitdb
NEXT_PUBLIC_WS_URL=wss://${DOMAIN}/ws

# Database
DATABASE_URL=file:/data/sqlite.db

# Server
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=3000
ORBITDB_PORT=4001
ORBITDB_WS_PORT=9091
ORBITDB_DATA_DIR=/app/data

# Logging
LOG_LEVEL=info

# Let's Encrypt
LETSENCRYPT_EMAIL=$EMAIL
EOF

chmod 600 .env.production
echo "✅ Configuration file created"

# Generate SSL certificates
echo "🔒 Generating SSL certificates..."
read -p "Generate Let's Encrypt certificate now? (requires DNS to be configured) (y/n): " GEN_CERT

if [ "$GEN_CERT" = "y" ]; then
    # Stop any running nginx
    docker compose down nginx 2>/dev/null || true

    # Generate certificate
    certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

    # Create certs directory
    mkdir -p certs

    # Copy certificates
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem certs/cert.pem
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem certs/key.pem
    chmod 644 certs/cert.pem
    chmod 600 certs/key.pem

    echo "✅ SSL certificates generated"
else
    echo "⚠️  Generating self-signed certificate (for testing only)..."
    mkdir -p certs
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout certs/key.pem \
        -out certs/cert.pem \
        -subj "/CN=$DOMAIN"
    echo "✅ Self-signed certificate generated"
fi

# Setup certificate auto-renewal
if [ "$GEN_CERT" = "y" ]; then
    echo "🔄 Setting up certificate auto-renewal..."
    CRON_CMD="0 0,12 * * * certbot renew --quiet --deploy-hook 'cd /opt/retcon-black-mountain && docker compose restart nginx'"
    (crontab -l 2>/dev/null || echo ""; echo "$CRON_CMD") | crontab -
    echo "✅ Auto-renewal configured"
fi

# Build and start services
echo "🏗️  Building Docker images (this may take 5-10 minutes)..."
make build

echo "🚀 Starting services..."
make up

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check status
echo ""
echo "📊 Service Status:"
make status || true

echo ""
echo "============================================"
echo "✅ Setup Complete!"
echo "============================================"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Verify services are healthy:"
echo "   make status"
echo ""
echo "2. Test the application:"
echo "   https://$DOMAIN"
echo ""
echo "3. View logs if needed:"
echo "   make logs"
echo ""
echo "4. Default login:"
echo "   Username: theodore"
echo "   Password: password123"
echo "   ⚠️  CHANGE PASSWORD IMMEDIATELY"
echo ""
echo "5. Read the client demo guide:"
echo "   cat CLIENT_DEMO.md"
echo ""
echo "============================================"
echo "🎉 Deployment successful!"
echo "============================================"