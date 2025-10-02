# ⚡ Quick Start - Retcon Black Mountain

## For VPS Deployment (Recommended)

```bash
# 1. SSH into your VPS
ssh root@your-vps-ip

# 2. Clone repository
git clone YOUR_REPO_URL
cd retcon-black-mountain

# 3. Run setup script (Ubuntu 22.04)
sudo bash scripts/setup-vps.sh

# 4. Access your application
# https://yourdomain.com
```

**That's it!** The script handles everything:
- Docker installation
- SSL certificates
- Environment configuration
- Service deployment

---

## For Local Development

```bash
# 1. Clone repository
git clone YOUR_REPO_URL
cd retcon-black-mountain

# 2. Install dependencies
npm install

# 3. Start services
make dev

# 4. Access application
# http://localhost:3000
```

---

## Essential Commands

### Check Status
```bash
make status
```

### View Logs
```bash
make logs
```

### Restart Services
```bash
make restart
```

### Stop Services
```bash
make down
```

### Test OrbitDB
```bash
make test-orbit
```

---

## Default Login

**Username**: `theodore`
**Password**: `password123`

⚠️ **Change password immediately in production!**

---

## Key URLs

### Production (VPS)
- **Main App**: `https://yourdomain.com`
- **OrbitDB Dashboard**: `https://yourdomain.com/test-orbitdb-dashboard`
- **Health Check**: `https://yourdomain.com/api/health`

### Local Development
- **Main App**: `http://localhost:3000`
- **OrbitDB Dashboard**: `http://localhost:3000/test-orbitdb-dashboard`
- **Health Check**: `http://localhost:3000/api/health`

---

## Quick Troubleshooting

### Services won't start?
```bash
make clean
make build
make up
```

### Can't connect to OrbitDB?
```bash
curl http://localhost:4001/health
# or
curl https://yourdomain.com/orbitdb/health
```

### SSL certificate issues?
```bash
# Check certificate
openssl x509 -in certs/cert.pem -text -noout

# Regenerate if needed
sudo certbot renew
```

### Need to rebuild?
```bash
make down
make build
make up
```

---

## Documentation

- **📖 Full Deployment Guide**: `DEPLOYMENT.md`
- **🎯 Client Demo Script**: `CLIENT_DEMO.md`
- **🏗️ Architecture**: `docs/SIMPLIFIED_ARCHITECTURE.md`
- **✅ What Was Improved**: `IMPROVEMENTS_SUMMARY.md`

---

## Environment Configuration

### Development
Uses defaults from `docker-compose.yml`

### Production
1. Copy template: `cp .env.production.template .env.production`
2. Edit values: `nano .env.production`
3. Set JWT_SECRET (generate with: `openssl rand -base64 32`)
4. Set your DOMAIN
5. Rebuild: `make build && make up`

---

## Common Tasks

### Upload Test Document
1. Login to web interface
2. Go to Collections
3. Create a collection
4. Upload a file

### Test P2P Sync
1. Open two browsers
2. Login to both
3. Navigate to same collection
4. Upload in one, see in other

### View Peer Info
```bash
curl https://yourdomain.com/orbitdb/peerinfo
```

### Grant Access to Peer
```bash
curl -X POST https://yourdomain.com/orbitdb/kv/grant \
  -H "Content-Type: application/json" \
  -d '{"name":"collection-name","peerId":"peer-id-here"}'
```

---

## Support

- **Logs**: `make logs`
- **Status**: `make status`
- **Documentation**: `/docs` folder
- **Issues**: [Your GitHub repo issues]

---

**Ready to demo!** 🚀

See `CLIENT_DEMO.md` for full demo script.