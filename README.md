# Chat Backend - Real-time Multi-Operator Chat System

A production-ready Socket.IO backend for real-time chat with multi-operator synchronization, designed for customer support and team collaboration.

## Features

### Core Functionality
- **Real-time Communication**: WebSocket-based instant messaging
- **Multi-Operator Support**: Multiple operators can monitor all conversations simultaneously
- **Operator Synchronization**: All operators see messages from other operators in real-time
- **Client-Operator Chat**: Direct messaging between clients and support operators
- **Image Support**: Send and receive images in chat
- **Typing Indicators**: Real-time typing status for both clients and operators

### Production Features
- **Health Monitoring**: `/health` endpoint for container orchestration
- **Metrics Endpoint**: `/metrics` for monitoring connections and messages
- **Rate Limiting**: Configurable spam protection (can be disabled)
- **Message Sanitization**: Advanced XSS and injection attack prevention
- **Image Validation**: File type, size, and format validation
- **Message Compression**: Per-message compression for bandwidth optimization
- **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT
- **Environment Configuration**: Full `.env` support
- **Docker Support**: Ready-to-deploy containers
- **Comprehensive Logging**: Timestamped logs with severity levels
- **Input Validation**: All incoming events are validated
- **Error Handling**: Comprehensive error responses and logging

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm, yarn, or bun

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd chat-backend
```

2. Install dependencies:
```bash
npm install
# or
bun install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`

5. Start the server:
```bash
npm start
# or for development with auto-reload
npm run dev
```

The server will start on `http://localhost:8080` (or your configured PORT)

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
docker-compose up -d
```

### Using Docker

Build the image:
```bash
docker build -t chat-backend .
```

Run the container:
```bash
docker run -p 8080:8080 --env-file .env chat-backend
```

## Configuration

All configuration is done via environment variables. See `.env.example` for all available options:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `8080` | Server port |
| `SOCKET_PATH` | `/chat` | WebSocket path |
| `CORS_ORIGIN` | `*` | CORS allowed origins (comma-separated) |
| `PING_INTERVAL` | `25000` | Socket.IO ping interval (ms) |
| `PING_TIMEOUT` | `60000` | Socket.IO ping timeout (ms) |
| `UPGRADE_TIMEOUT` | `30000` | Socket.IO upgrade timeout (ms) |
| `MAX_BUFFER_SIZE` | `104857600` | Max message buffer size (100MB) |
| `MAX_IMAGE_SIZE` | `10485760` | Max image file size (10MB) |
| `RATE_LIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `RATE_LIMIT_MAX_MESSAGES` | `100` | Max messages per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |

### Disabling Rate Limiting

If you want unlimited messages (good for trusted environments), set:
```env
RATE_LIMIT_ENABLED=false
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server health status and metrics. Useful for load balancers and container orchestration.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "metrics": {
    "totalConnections": 150,
    "activeClients": 10,
    "activeOperators": 3,
    "messagesProcessed": 1234,
    "currentClients": 10,
    "currentOperators": 3
  },
  "timestamp": "2025-11-28T12:00:00.000Z"
}
```

### Metrics
```
GET /metrics
```
Detailed metrics for monitoring.

**Response:**
```json
{
  "connections": {
    "total": 150,
    "clients": 10,
    "operators": 3
  },
  "messages": {
    "processed": 1234
  },
  "uptime": {
    "seconds": 123.45,
    "startTime": "2025-11-28T10:00:00.000Z"
  },
  "memory": {
    "rss": 50331648,
    "heapTotal": 18874368,
    "heapUsed": 8123456
  }
}
```

## WebSocket Events

### Client → Server

#### `join`
Connect as an operator or client.

**Operator:**
```javascript
socket.emit("join", {
  role: "operator",
  name: "John Doe",
  operatorId: 123
});
```

**Client:**
```javascript
socket.emit("join", {
  role: "client",
  user: "Customer Name"
});
```

#### `clientMessage`
Client sends a message.

**Text:**
```javascript
socket.emit("clientMessage", {
  type: "text",
  message: "Hello, I need help"
});
```

**Image:**
```javascript
socket.emit("clientMessage", {
  type: "image",
  image: "data:image/png;base64,...",
  name: "screenshot.png",
  mimeType: "image/png",
  size: 12345
});
```

#### `operatorMessage`
Operator sends a message to a specific client.

```javascript
socket.emit("operatorMessage", {
  to: "client-socket-id",
  type: "text",
  message: "How can I help you?",
  operatorId: 123,
  operatorName: "John Doe"
});
```

#### `clientTyping`
Client typing indicator.

```javascript
socket.emit("clientTyping", {
  isTyping: true
});
```

#### `operatorTyping`
Operator typing indicator for specific client.

```javascript
socket.emit("operatorTyping", {
  to: "client-socket-id",
  isTyping: true
});
```

#### `getConnectedOperators`
Get list of connected operators.

```javascript
socket.emit("getConnectedOperators");
```

### Server → Client

#### `newChat`
New client connected (sent to all operators).

```javascript
{
  clientId: "socket-id",
  username: "Customer Name"
}
```

#### `incomingMessage`
Message from client (sent to all operators).

```javascript
{
  from: "client-socket-id",
  type: "text",
  message: "Hello",
  timestamp: "2025-11-28T12:00:00.000Z"
}
```

#### `incomingOperatorMessage`
Message from operator (sent to specific client).

```javascript
{
  from: "operator-socket-id",
  type: "text",
  message: "How can I help?",
  timestamp: "2025-11-28T12:00:00.000Z"
}
```

#### `operatorMessageBroadcast`
Another operator sent a message (sent to all other operators).

```javascript
{
  clientId: "client-socket-id",
  message: {
    from: "operator",
    text: "Hello",
    timestamp: "2025-11-28T12:00:00.000Z",
    operatorId: 123,
    operatorName: "John Doe"
  },
  operatorId: 123,
  operatorName: "John Doe"
}
```

#### `operatorConnected`
Another operator connected.

```javascript
{
  operatorId: 123,
  name: "John Doe"
}
```

#### `operatorDisconnected`
Operator disconnected.

```javascript
{
  operatorId: 123,
  name: "John Doe"
}
```

#### `chatEnded`
Client disconnected.

```javascript
{
  clientId: "socket-id"
}
```

#### `clientTyping`
Client is typing.

```javascript
{
  from: "client-socket-id",
  isTyping: true
}
```

#### `operatorTyping`
Operator is typing.

```javascript
{
  isTyping: true
}
```

#### `connectedOperatorsList`
List of connected operators.

```javascript
[
  {
    operatorId: 123,
    name: "John Doe"
  },
  {
    operatorId: 456,
    name: "Jane Smith"
  }
]
```

#### `rateLimitExceeded`
Rate limit exceeded (if enabled).

```javascript
{
  message: "Too many messages. Please wait."
}
```

## Architecture

### Multi-Operator Synchronization

When Operator A sends a message to a client:
1. Message is delivered to the client
2. Message is broadcast to all other operators (Operator B, C, D...)
3. Other operators see the message with attribution (who sent it)
4. Prevents duplicate display for the sending operator

```
Client ← Message from Operator A
         ↓
    Broadcast to Operators B, C, D
```

### Data Stores

- `clients` - Map of connected clients (socketId → client info)
- `operatorSockets` - Map of connected operators (socketId → operator info)
- `messageRateLimiter` - Map for rate limiting (socketId → rate limit data)
- `connectionMetrics` - Global metrics object

## Security Considerations

### Message Sanitization
All text messages are sanitized to prevent XSS and injection attacks:
- **HTML tags** are completely stripped (`<script>`, `<iframe>`, etc.)
- **JavaScript protocols** are removed (`javascript:`, `data:`)
- **Event handlers** are blocked (`onclick=`, `onerror=`, etc.)
- **Dangerous characters** are filtered (`<`, `>`, `'`, `"`)
- Messages are limited to **5000 characters**

### Image Validation
Images are validated before processing:
- Must be valid **base64 data URLs**
- Only allowed formats: **JPEG, PNG, GIF, WebP**
- **File size limits** enforced (default 10MB)
- **MIME type verification**

### Rate Limiting
Configurable rate limiting prevents spam and DoS attacks:
- Default: **100 messages per 60 seconds** per socket
- Automatically resets after window expires
- Can be adjusted or disabled via environment variables
- Applies to both clients and operators

### Input Validation
All incoming events are validated:
- **Required fields** are checked before processing
- **Message types** are validated (`text` or `image` only)
- **Role validation** on join (`operator` or `client`)
- **Error messages** sent back on validation failures

### CORS Configuration
Configure `CORS_ORIGIN` in production to limit allowed origins:
```env
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com
```

### Production Security Checklist
- [ ] Set specific `CORS_ORIGIN` (not `*`)
- [ ] Enable rate limiting in production
- [ ] Use environment variables for secrets
- [ ] Deploy behind HTTPS/TLS
- [ ] Implement operator authentication (JWT/session)
- [ ] Set up logging and monitoring
- [ ] Configure firewall rules
- [ ] Regular security audits

### Future Security Enhancements
Consider adding:
- JWT authentication for operators
- Session validation with Redis
- IP-based rate limiting
- End-to-end message encryption
- Operator permission levels
- Audit logging for compliance

## Monitoring

### Health Checks
For Kubernetes/Docker:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30
```

### Logging
All logs include:
- ISO timestamp
- Severity level (info, success, warning, error, debug)
- Event details

Example:
```
[2025-11-28T12:00:00.000Z] ✅ Operador conectado: John Doe (ID: 123)
[2025-11-28T12:00:01.000Z] ℹ️ Mensaje cliente: abc123 → Hello
```

## Scaling

### Horizontal Scaling with Redis (Future)
For multiple server instances, add Redis adapter:

1. Uncomment Redis in `docker-compose.yml`
2. Install Redis adapter:
```bash
npm install @socket.io/redis-adapter redis
```
3. Update `index.js` with Redis configuration
4. Set `REDIS_URL` in environment

## Development

### Scripts
```bash
npm start      # Production mode
npm run dev    # Development with auto-reload
npm test       # Run tests (not yet implemented)
```

### Debug Mode
Enable Socket.IO debug logs:
```bash
DEBUG=socket.io:* node index.js
```

## Project Structure

```
chat-backend/
├── index.js                    # Main server file
├── package.json                # Dependencies and scripts
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
├── Dockerfile                  # Docker container config
├── docker-compose.yml          # Docker Compose config
├── .dockerignore              # Docker ignore rules
├── README.md                   # This file
└── IMPLEMENTATION_GUIDE.md     # Detailed implementation guide
```

## Troubleshooting

### Messages Not Syncing
- Verify `operatorId` and `operatorName` are sent in `operatorMessage`
- Check browser console for WebSocket errors
- Ensure Socket.IO versions match between client and server

### Connection Issues
- Check CORS configuration
- Verify WebSocket path matches on client (`/chat`)
- Check firewall/proxy settings

### Rate Limit Too Strict
- Adjust `RATE_LIMIT_MAX_MESSAGES` and `RATE_LIMIT_WINDOW_MS`
- Or disable completely with `RATE_LIMIT_ENABLED=false`

## Implementation Guides

### Frontend Integration

- **[CLIENT_IMPLEMENTATION_GUIDE.md](./CLIENT_IMPLEMENTATION_GUIDE.md)** - Complete guide for implementing the customer-facing chat widget (for end-users)
- **[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)** - Backend setup and operator interface implementation (for support teams)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

For issues and questions:
- Check the troubleshooting section
- Review server logs
- Use browser DevTools → Network → WS tab
- Enable debug mode for detailed logs
