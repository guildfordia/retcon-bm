# 🚀 VPS Deployment Guide - Retcon Black Mountain

This guide will help you deploy Retcon Black Mountain on a VPS with a domain name.

## Prerequisites

- VPS with at least 2GB RAM, 2 CPUs, 20GB disk
- Ubuntu 22.04 LTS (recommended) or similar Linux distro
- Domain name pointed to your VPS IP
- Root or sudo access

## 1. Initial VPS Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Add your user to docker group (logout/login after this)
sudo usermod -aG docker $USER

# Install required utilities
sudo apt install -y git make jq openssl
```

## 2. Clone and Configure

```bash
# Clone repository
cd ~
git clone https://github.com/yourusername/retcon-black-mountain.git
cd retcon-black-mountain

# Generate secure JWT secret
openssl rand -base64 32 > .jwt_secret

# Create production environment file
cp .env.production.template .env.production

# Edit configuration
nano .env.production
```

**Required changes in `.env.production`:**

1. Set `JWT_SECRET` to the value from `.jwt_secret` file
2. Replace `yourdomain.com` with your actual domain
3. Set `LETSENCRYPT_EMAIL` to your email

Example:
```env
JWT_SECRET=Xk7mP9vT3nQ8rL5wJ2bF6yH4zN1cV0oI==
DOMAIN=demo.retconblackmountain.com
LETSENCRYPT_EMAIL=admin@retconblackmountain.com
```

## 3. DNS Configuration

Point your domain to your VPS IP address:

```
Type: A Record
Name: @ (or subdemo for subdomain)
Value: YOUR_VPS_IP
TTL: 300
```

Verify DNS propagation:
```bash
dig yourdomain.com +short
# Should return your VPS IP
```

## 4. SSL Certificate Setup

### Option A: Let's Encrypt (Recommended for Production)

```bash
# Install certbot
sudo apt install -y certbot

# Stop nginx if running
make down

# Generate certificates
sudo certbot certonly --standalone -d yourdomain.com

# Create cert directory
mkdir -p certs

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem certs/key.pem
sudo chown -R $USER:$USER certs
```

### Option B: Self-Signed (For Testing Only)

```bash
# Create certs directory
mkdir -p certs

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/CN=yourdomain.com"
```

## 5. Update Docker Configuration

Edit `docker-compose.yml` to use environment variables:

```bash
# The file should already reference .env.production
# Verify the environment section includes:
#   - JWT_SECRET=${JWT_SECRET}
#   - NEXT_PUBLIC_ORBITDB_URL=${NEXT_PUBLIC_ORBITDB_URL}
#   - NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
```

## 6. Build and Deploy

```bash
# Build Docker images (first time only, takes 5-10 minutes)
make build

# Start services
make up

# Check status
make status

# View logs
make logs
```

## 7. Verify Deployment

```bash
# Test health endpoints
curl https://yourdomain.com/api/health
curl https://yourdomain.com/orbitdb/health

# Test OrbitDB connectivity
curl https://yourdomain.com/orbitdb/peerinfo
```

Expected responses:
```json
// Health
{"ok":true}

// Peer info
{"wsMultiaddrPublic":"/dns4/yourdomain.com/tcp/9091/wss/p2p/12D3..."}
```

## 8. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (for Let's Encrypt)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8443/tcp  # HTTPS (nginx proxy)
sudo ufw enable

# Verify
sudo ufw status
```

## 9. Access Your Application

Open your browser and navigate to:
- **Main App**: `https://yourdomain.com`
- **Test Dashboard**: `https://yourdomain.com/test-orbitdb-dashboard`
- **OrbitDB Test**: `https://yourdomain.com/test-browser-orbit`

**Default Login** (change password immediately):
- Username: `theodore`
- Password: `password123`

## 10. Maintenance Commands

```bash
# View logs
make logs

# Restart services
make restart

# Stop services
make down

# Update application
git pull
make build
make restart

# Backup data
docker run --rm -v retcon-black-mountain_web-data:/data \
  -v $(pwd)/backups:/backup \
  ubuntu tar czf /backup/backup-$(date +%Y%m%d-%H%M).tar.gz /data

# Clean restart (WARNING: destroys data)
make clean
make build
make up
```

## 11. SSL Certificate Renewal (Let's Encrypt)

Let's Encrypt certificates expire after 90 days. Set up auto-renewal:

```bash
# Test renewal
sudo certbot renew --dry-run

# Add cron job for auto-renewal
sudo crontab -e

# Add this line (runs twice daily):
0 0,12 * * * certbot renew --quiet --deploy-hook "cd /home/youruser/retcon-black-mountain && make restart"
```

## 12. Monitoring and Logs

```bash
# Real-time logs
make logs

# Specific service logs
docker compose logs -f web
docker compose logs -f orbitdb
docker compose logs -f nginx

# Container stats
docker stats

# Disk usage
docker system df
```

## Troubleshooting

### Issue: Containers won't start

```bash
# Check logs
make logs

# Check Docker system
docker system prune -af
make clean
make build
make up
```

### Issue: SSL certificate errors

```bash
# Verify certificates exist
ls -la certs/

# Check certificate validity
openssl x509 -in certs/cert.pem -text -noout

# Regenerate if needed
```

### Issue: OrbitDB connection failures

```bash
# Check OrbitDB service
curl http://localhost:4001/health

# Check WebSocket port
netstat -tulpn | grep 9091

# Verify DNS
dig yourdomain.com +short
```

### Issue: Can't connect from other devices

```bash
# Check firewall
sudo ufw status

# Test from external network
curl https://yourdomain.com/api/health

# Check nginx configuration
docker compose logs nginx
```

## Performance Tuning

### For production with expected load:

```yaml
# Add to docker-compose.yml services
resources:
  limits:
    cpus: '1.0'
    memory: 1G
  reservations:
    cpus: '0.5'
    memory: 512M
```

### Enable log rotation:

```bash
# Add to /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# Restart Docker
sudo systemctl restart docker
```

## Security Checklist

- [ ] Changed default `theodore` password
- [ ] Set strong JWT_SECRET (min 32 random characters)
- [ ] SSL certificates installed and valid
- [ ] Firewall configured (only ports 22, 80, 443, 8443 open)
- [ ] Regular backups configured
- [ ] SSH key authentication enabled
- [ ] Fail2ban installed for SSH protection
- [ ] System updates automated

## Client Demo Checklist

Before showing to client:

- [ ] All services healthy (`make status`)
- [ ] SSL certificate valid (no browser warnings)
- [ ] Test collection creation works
- [ ] Test document upload works
- [ ] Test P2P replication between two browsers
- [ ] Mobile responsive design works
- [ ] No console errors in browser dev tools

## Support

For issues or questions:
- Check logs: `make logs`
- GitHub Issues: [your-repo-url]
- Documentation: `/docs` folder