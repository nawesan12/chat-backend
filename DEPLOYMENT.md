# Deployment Guide

Complete guide for deploying the Chat Backend to production environments.

## 📋 Pre-Deployment Checklist

### Code & Configuration
- [ ] All tests passing (see `TESTING_CHECKLIST.md`)
- [ ] Environment variables configured for production
- [ ] CORS origins set to specific domains (not `*`)
- [ ] Rate limiting enabled
- [ ] Secrets moved to secure storage (environment variables)
- [ ] Latest dependencies installed (`npm install`)

### Security
- [ ] HTTPS/TLS certificates obtained and configured
- [ ] Operator authentication mechanism chosen (JWT/session)
- [ ] Firewall rules configured
- [ ] Security headers configured
- [ ] DDoS protection in place
- [ ] Logging and monitoring configured

### Infrastructure
- [ ] Server/container specifications adequate
- [ ] Load balancer configured (if needed)
- [ ] Domain/subdomain configured
- [ ] SSL certificate installed
- [ ] Backup strategy in place
- [ ] Disaster recovery plan documented

## 🚀 Deployment Options

### Option 1: Docker (Recommended)

#### Prerequisites
- Docker installed
- docker-compose installed (optional but recommended)

#### Steps

1. **Create Production Environment File**:
```bash
cp .env.example .env.production
nano .env.production
```

2. **Configure Production Variables**:
```env
NODE_ENV=production
PORT=8080
SOCKET_PATH=/chat
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com
RATE_LIMIT_ENABLED=true
```

3. **Build Docker Image**:
```bash
docker build -t chat-backend:2.0.0 .
```

4. **Run Container**:
```bash
docker run -d \
  --name chat-backend \
  -p 8080:8080 \
  --env-file .env.production \
  --restart unless-stopped \
  chat-backend:2.0.0
```

5. **Verify Deployment**:
```bash
curl http://localhost:8080/health
```

#### Using Docker Compose

1. **Create `docker-compose.yml`**:
```yaml
version: '3.8'

services:
  chat-backend:
    build: .
    container_name: chat-backend
    ports:
      - "8080:8080"
    env_file:
      - .env.production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Optional: Redis for multi-server scaling
  # redis:
  #   image: redis:7-alpine
  #   container_name: chat-redis
  #   restart: unless-stopped
  #   volumes:
  #     - redis-data:/data
  #   command: redis-server --appendonly yes

# volumes:
#   redis-data:
```

2. **Deploy**:
```bash
docker-compose up -d
```

3. **Check Logs**:
```bash
docker-compose logs -f chat-backend
```

### Option 2: Node.js Direct Deployment

#### Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- Process manager (PM2 recommended)

#### Steps

1. **Install PM2** (if not already installed):
```bash
npm install -g pm2
```

2. **Clone & Install**:
```bash
git clone <repository-url>
cd chat-backend
npm install --production
```

3. **Configure Environment**:
```bash
cp .env.example .env
nano .env
```

4. **Create PM2 Ecosystem File** (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: 'chat-backend',
    script: './index.js',
    instances: 1, // or 'max' for cluster mode
    exec_mode: 'fork', // or 'cluster'
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '500M',
    autorestart: true,
    watch: false
  }]
}
```

5. **Start with PM2**:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup # Follow instructions to enable auto-start
```

6. **Monitor**:
```bash
pm2 monit
pm2 logs chat-backend
```

### Option 3: Cloud Platforms

#### Heroku

1. **Create Heroku App**:
```bash
heroku create chat-backend-prod
```

2. **Set Environment Variables**:
```bash
heroku config:set NODE_ENV=production
heroku config:set CORS_ORIGIN=https://yourdomain.com
heroku config:set RATE_LIMIT_ENABLED=true
```

3. **Deploy**:
```bash
git push heroku main
```

4. **Check Status**:
```bash
heroku logs --tail
heroku open
```

#### AWS (EC2)

1. **Launch EC2 Instance** (Ubuntu/Amazon Linux)
2. **Install Node.js**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Clone & Deploy** (same as Node.js Direct)
4. **Configure Security Group** (allow port 8080)
5. **Set up Nginx as Reverse Proxy** (optional but recommended)

#### Google Cloud Run

1. **Create `Dockerfile`** (already exists)
2. **Build & Push**:
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/chat-backend
```

3. **Deploy**:
```bash
gcloud run deploy chat-backend \
  --image gcr.io/PROJECT_ID/chat-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## 🔧 Nginx Configuration (Reverse Proxy)

For production, use Nginx as a reverse proxy with SSL:

```nginx
upstream chat_backend {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name chat.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name chat.yourdomain.com;

    ssl_certificate /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # WebSocket Support
    location /chat {
        proxy_pass http://chat_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Health & Metrics Endpoints
    location /health {
        proxy_pass http://chat_backend/health;
        access_log off;
    }

    location /metrics {
        proxy_pass http://chat_backend/metrics;
        # Optional: Add basic auth for security
        # auth_basic "Restricted";
        # auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

## 📊 Monitoring & Logging

### Health Checks

Configure your monitoring system to check:
```bash
curl -f http://localhost:8080/health || exit 1
```

**Expected Response:**
```json
{
  "status": "healthy",
  "uptime": 12345.67,
  "metrics": { ... },
  "timestamp": "2025-11-28T12:00:00.000Z"
}
```

### Metrics Collection

Poll metrics endpoint:
```bash
curl http://localhost:8080/metrics
```

Send to monitoring systems like:
- Prometheus
- Grafana
- DataDog
- New Relic
- CloudWatch

### Log Management

#### Using PM2:
```bash
pm2 logs chat-backend --lines 100
pm2 flush # Clear logs
```

#### Using Docker:
```bash
docker logs chat-backend -f --tail 100
```

#### Log Aggregation:
- Use ELK Stack (Elasticsearch, Logstash, Kibana)
- Use cloud services (CloudWatch, Stackdriver)
- Use centralized logging (Papertrail, Loggly)

### Recommended Alerts

Set up alerts for:
- [ ] Server down (health check fails)
- [ ] High memory usage (> 80%)
- [ ] High CPU usage (> 80%)
- [ ] Error rate spike (> 10 errors/minute)
- [ ] Active connections > threshold
- [ ] Response time > 1 second

## 🔒 Security Hardening

### Firewall Rules

**Allow:**
- Port 80 (HTTP - redirects to HTTPS)
- Port 443 (HTTPS)
- Port 22 (SSH - from specific IPs only)

**Block:**
- All other ports
- Direct access to port 8080 (use Nginx proxy)

### Environment Variables Security

Never commit `.env` files. Use:
- AWS Secrets Manager
- Google Secret Manager
- Azure Key Vault
- HashiCorp Vault
- Kubernetes Secrets

### Rate Limiting

Production settings:
```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_MESSAGES=50  # Lower for production
RATE_LIMIT_WINDOW_MS=60000
```

### CORS

Strict CORS in production:
```env
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com
```

## 🎯 Performance Optimization

### Horizontal Scaling with Redis

1. **Install Redis Adapter**:
```bash
npm install @socket.io/redis-adapter redis
```

2. **Update `index.js`**:
```javascript
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

3. **Configure Redis**:
```env
REDIS_URL=redis://localhost:6379
```

4. **Deploy Multiple Instances**:
```bash
# Instance 1
PORT=8081 node index.js

# Instance 2
PORT=8082 node index.js
```

5. **Load Balancer** (Nginx):
```nginx
upstream chat_backends {
    least_conn;
    server 127.0.0.1:8081;
    server 127.0.0.1:8082;
}
```

### Connection Pooling

For databases (if added later):
```env
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=20
```

### CDN for Static Assets

Serve static files from CDN to reduce server load.

## 🧪 Post-Deployment Testing

### Smoke Tests

1. **Health Check**:
```bash
curl https://chat.yourdomain.com/health
```

2. **WebSocket Connection**:
```javascript
const socket = io('https://chat.yourdomain.com', { path: '/chat' });
socket.on('connect', () => console.log('Connected'));
```

3. **Operator Connection**:
```javascript
socket.emit('join', {
  role: 'operator',
  name: 'Test Operator',
  operatorId: 1
});
```

4. **Send Message**:
```javascript
socket.emit('operatorMessage', {
  to: 'client-socket-id',
  type: 'text',
  message: 'Test',
  operatorId: 1,
  operatorName: 'Test'
});
```

### Load Testing

Use tools like:
- Artillery
- k6
- JMeter
- Apache Bench

Example with Artillery:
```yaml
config:
  target: 'https://chat.yourdomain.com'
  phases:
    - duration: 60
      arrivalRate: 10
  engines:
    socketio:
      query:
        path: "/chat"

scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: "join"
          data:
            role: "client"
            user: "Load Test User"
      - emit:
          channel: "clientMessage"
          data:
            type: "text"
            message: "Hello"
```

## 🔄 Rolling Updates

### Zero-Downtime Deployment

1. **Deploy to Instance 1**:
```bash
# Stop instance 1
pm2 stop chat-backend

# Update code
git pull
npm install

# Start instance 1
pm2 start chat-backend
```

2. **Verify Instance 1**:
```bash
curl http://localhost:8081/health
```

3. **Deploy to Instance 2**:
```bash
# Repeat for instance 2
```

### Docker Rolling Update

```bash
# Build new image
docker build -t chat-backend:2.0.1 .

# Update service
docker service update --image chat-backend:2.0.1 chat-backend
```

## 📱 Monitoring Dashboard

### Example Grafana Dashboard

Metrics to track:
- Active connections (clients + operators)
- Messages per second
- Error rate
- Response time (health endpoint)
- Memory usage
- CPU usage
- Uptime percentage

## 🆘 Troubleshooting

### Common Issues

1. **WebSocket Connection Fails**:
   - Check CORS configuration
   - Verify Nginx WebSocket support
   - Check firewall rules
   - Verify SSL certificate

2. **High Memory Usage**:
   - Check for memory leaks
   - Verify cleanup on disconnect
   - Check connection limits
   - Consider increasing server resources

3. **Messages Not Delivered**:
   - Check client socket ID is valid
   - Verify client is connected
   - Check logs for errors
   - Verify event names match

4. **Rate Limit Too Strict**:
   - Adjust `RATE_LIMIT_MAX_MESSAGES`
   - Adjust `RATE_LIMIT_WINDOW_MS`
   - Consider IP-based limiting instead

## 📞 Support

For production issues:
1. Check server logs
2. Review metrics endpoint
3. Check health endpoint
4. Review recent deployments
5. Check monitoring alerts
6. Review error tracking

---

**Document Version:** 1.0
**Last Updated:** 2025-11-28
**Status:** Production Ready
