# Backend Socket.IO Implementation Guide

## Overview

This guide provides a complete implementation for your Socket.IO backend server that handles real-time chat between clients and operators. The frontend (CRM) already persists all messages to the database - this backend handles the real-time message routing.

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Clients   │◄──────►│  Socket.IO       │◄──────►│  Operators  │
│  (Players)  │         │  Backend Server  │         │    (CRM)    │
└─────────────┘         └──────────────────┘         └─────────────┘
                                │
                                ▼
                    Real-time message routing
                    (Frontend persists to DB)
```

## Environment Variables

Create a `.env` file in your backend:

```env
PORT=3001
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
```

## Dependencies

```bash
npm install express socket.io cors dotenv
npm install --save-dev @types/express @types/cors typescript ts-node nodemon
```

## Complete Backend Implementation

### 1. Main Server File (`server.ts` or `index.ts`)

```typescript
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Configure CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Socket.IO server with CORS
const io = new Server(httpServer, {
  path: '/chat',
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// --------------- TYPES ---------------

interface UserConnection {
  socketId: string;
  role: 'client' | 'operator';
  name: string;
  username?: string;
  phone?: string;
  operatorId?: number;
  connectedAt: Date;
}

interface ChatMessage {
  type: 'text' | 'image';
  message?: string;
  image?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  timestamp: string;
}

interface OperatorMessage extends ChatMessage {
  operatorId: number;
  operatorName: string;
}

// --------------- STATE MANAGEMENT ---------------

// Track all connected users (clients and operators)
const connections = new Map<string, UserConnection>();

// Map client socket IDs to their associated operators (for chat routing)
const activeChats = new Map<string, Set<string>>(); // clientId -> Set<operatorSocketId>

// --------------- UTILITY FUNCTIONS ---------------

function logEvent(event: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${event}`, data ? JSON.stringify(data, null, 2) : '');
}

function getClientSockets(): string[] {
  return Array.from(connections.entries())
    .filter(([_, conn]) => conn.role === 'client')
    .map(([socketId]) => socketId);
}

function getOperatorSockets(): string[] {
  return Array.from(connections.entries())
    .filter(([_, conn]) => conn.role === 'operator')
    .map(([socketId]) => socketId);
}

// --------------- SOCKET.IO EVENT HANDLERS ---------------

io.on('connection', (socket: Socket) => {
  logEvent('🔌 New connection', { socketId: socket.id });

  // --------------- CONNECTION SETUP ---------------

  /**
   * Event: 'join'
   * Sent by clients and operators when they first connect
   * Payload: { role: 'client' | 'operator', name: string, username?: string, phone?: string, operatorId?: number }
   */
  socket.on('join', (data: {
    role: 'client' | 'operator';
    name: string;
    username?: string;
    phone?: string;
    operatorId?: number;
  }) => {
    logEvent('👤 User joined', { socketId: socket.id, ...data });

    // Store connection info
    connections.set(socket.id, {
      socketId: socket.id,
      role: data.role,
      name: data.name,
      username: data.username,
      phone: data.phone,
      operatorId: data.operatorId,
      connectedAt: new Date()
    });

    if (data.role === 'client') {
      // Notify all operators about new client
      const operatorSockets = getOperatorSockets();

      operatorSockets.forEach(opSocketId => {
        io.to(opSocketId).emit('newChat', {
          clientId: socket.id,
          username: data.username || data.name,
          phone: data.phone
        });
      });

      logEvent('📢 Notified operators about new client', {
        clientId: socket.id,
        username: data.username || data.name,
        operatorsNotified: operatorSockets.length
      });
    } else if (data.role === 'operator') {
      // Send list of all active clients to this operator
      const clientSockets = getClientSockets();

      clientSockets.forEach(clientId => {
        const clientConn = connections.get(clientId);
        if (clientConn) {
          socket.emit('newChat', {
            clientId: clientId,
            username: clientConn.username || clientConn.name,
            phone: clientConn.phone
          });
        }
      });

      logEvent('📋 Sent active clients to operator', {
        operatorId: socket.id,
        activeClients: clientSockets.length
      });
    }
  });

  // --------------- CLIENT MESSAGES ---------------

  /**
   * Event: 'clientMessage'
   * Sent by clients when they send a message
   * Payload: { type: 'text' | 'image', message?: string, image?: string, name?: string, mimeType?: string }
   */
  socket.on('clientMessage', (data: ChatMessage) => {
    const client = connections.get(socket.id);

    if (!client || client.role !== 'client') {
      logEvent('❌ Invalid client message', { socketId: socket.id });
      return;
    }

    logEvent('📨 Client message received', {
      clientId: socket.id,
      type: data.type,
      hasText: !!data.message,
      hasImage: !!data.image
    });

    // Broadcast to ALL operators
    const operatorSockets = getOperatorSockets();

    const messagePayload = {
      from: socket.id,
      type: data.type,
      message: data.message,
      image: data.image,
      name: data.name,
      mimeType: data.mimeType,
      size: data.size,
      timestamp: data.timestamp || new Date().toISOString()
    };

    operatorSockets.forEach(opSocketId => {
      io.to(opSocketId).emit('incomingMessage', messagePayload);
    });

    logEvent('✅ Message forwarded to operators', {
      clientId: socket.id,
      operatorsNotified: operatorSockets.length
    });
  });

  // --------------- OPERATOR MESSAGES ---------------

  /**
   * Event: 'operatorMessage'
   * Sent by operators when they send a message to a client
   * Payload: { to: string, type: 'text' | 'image', message?: string, image?: string, operatorId: number, operatorName: string }
   */
  socket.on('operatorMessage', (data: {
    to: string;
    type: 'text' | 'image';
    message?: string;
    image?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    operatorId: number;
    operatorName: string;
  }) => {
    const operator = connections.get(socket.id);

    if (!operator || operator.role !== 'operator') {
      logEvent('❌ Invalid operator message', { socketId: socket.id });
      return;
    }

    logEvent('📨 Operator message received', {
      operatorId: socket.id,
      targetClient: data.to,
      type: data.type
    });

    const timestamp = new Date().toISOString();

    // Send message to the target client
    io.to(data.to).emit('operatorMessage', {
      type: data.type,
      message: data.message,
      image: data.image,
      name: data.name,
      mimeType: data.mimeType,
      operatorName: data.operatorName,
      timestamp
    });

    // Broadcast to ALL OTHER operators (for multi-operator support)
    const operatorSockets = getOperatorSockets().filter(id => id !== socket.id);

    operatorSockets.forEach(opSocketId => {
      io.to(opSocketId).emit('operatorBroadcast', {
        clientId: data.to,
        operatorId: data.operatorId,
        operatorName: data.operatorName,
        type: data.type,
        message: data.message,
        image: data.image,
        name: data.name,
        mimeType: data.mimeType,
        timestamp
      });
    });

    logEvent('✅ Message sent to client and broadcasted to operators', {
      targetClient: data.to,
      otherOperatorsNotified: operatorSockets.length
    });
  });

  // --------------- TYPING INDICATORS ---------------

  /**
   * Event: 'clientTyping'
   * Sent by clients when they start/stop typing
   * Payload: { isTyping: boolean }
   */
  socket.on('clientTyping', (data: { isTyping: boolean }) => {
    const client = connections.get(socket.id);

    if (!client || client.role !== 'client') return;

    // Broadcast to all operators
    const operatorSockets = getOperatorSockets();

    operatorSockets.forEach(opSocketId => {
      io.to(opSocketId).emit('clientTyping', {
        from: socket.id,
        isTyping: data.isTyping
      });
    });
  });

  /**
   * Event: 'operatorTyping'
   * Sent by operators when they start/stop typing
   * Payload: { to: string, isTyping: boolean }
   */
  socket.on('operatorTyping', (data: { to: string; isTyping: boolean }) => {
    const operator = connections.get(socket.id);

    if (!operator || operator.role !== 'operator') return;

    // Send to the target client
    io.to(data.to).emit('operatorTyping', {
      isTyping: data.isTyping
    });
  });

  // --------------- CHAT MANAGEMENT ---------------

  /**
   * Event: 'endChat'
   * Sent by either party to end a chat session
   * Payload: { clientId?: string, operatorId?: number }
   */
  socket.on('endChat', (data: { clientId?: string; operatorId?: number }) => {
    const user = connections.get(socket.id);

    if (!user) return;

    const clientId = user.role === 'client' ? socket.id : data.clientId;

    if (!clientId) return;

    logEvent('🔚 Chat ended', { clientId, endedBy: user.role });

    // Notify all operators
    const operatorSockets = getOperatorSockets();
    operatorSockets.forEach(opSocketId => {
      io.to(opSocketId).emit('chatEnded', { clientId });
    });

    // Notify client if they didn't initiate
    if (user.role === 'operator') {
      io.to(clientId).emit('chatEnded', {
        message: 'El operador ha finalizado la conversación'
      });
    }
  });

  // --------------- DISCONNECT HANDLING ---------------

  socket.on('disconnect', () => {
    const user = connections.get(socket.id);

    if (!user) {
      logEvent('🔌 Disconnected (unknown user)', { socketId: socket.id });
      return;
    }

    logEvent('🔌 User disconnected', {
      socketId: socket.id,
      role: user.role,
      name: user.name
    });

    if (user.role === 'client') {
      // Notify all operators that this client disconnected
      const operatorSockets = getOperatorSockets();
      operatorSockets.forEach(opSocketId => {
        io.to(opSocketId).emit('chatEnded', {
          clientId: socket.id,
          reason: 'disconnect'
        });
      });
    }

    // Remove from connections
    connections.delete(socket.id);
    activeChats.delete(socket.id);
  });

  // --------------- ERROR HANDLING ---------------

  socket.on('error', (error) => {
    logEvent('❌ Socket error', { socketId: socket.id, error: error.message });
  });
});

// --------------- HEALTH CHECK ENDPOINT ---------------

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connections: {
      total: connections.size,
      clients: getClientSockets().length,
      operators: getOperatorSockets().length
    }
  });
});

// --------------- SERVER STATISTICS (Optional) ---------------

app.get('/stats', (req, res) => {
  const clients = Array.from(connections.entries())
    .filter(([_, conn]) => conn.role === 'client')
    .map(([id, conn]) => ({
      socketId: id,
      name: conn.name,
      username: conn.username,
      connectedAt: conn.connectedAt
    }));

  const operators = Array.from(connections.entries())
    .filter(([_, conn]) => conn.role === 'operator')
    .map(([id, conn]) => ({
      socketId: id,
      name: conn.name,
      operatorId: conn.operatorId,
      connectedAt: conn.connectedAt
    }));

  res.json({
    timestamp: new Date().toISOString(),
    summary: {
      totalConnections: connections.size,
      totalClients: clients.length,
      totalOperators: operators.length
    },
    clients,
    operators
  });
});

// --------------- START SERVER ---------------

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('🚀 Socket.IO Chat Server Running');
  console.log('='.repeat(60));
  console.log(`📍 Server:    http://localhost:${PORT}`);
  console.log(`🔌 Socket:    ws://localhost:${PORT}/chat`);
  console.log(`💚 Health:    http://localhost:${PORT}/health`);
  console.log(`📊 Stats:     http://localhost:${PORT}/stats`);
  console.log(`🌍 CORS:      ${process.env.CORS_ORIGIN || '*'}`);
  console.log('='.repeat(60));
  console.log('');
});

// --------------- GRACEFUL SHUTDOWN ---------------

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
});
```

## Socket Events Reference

### Events Emitted BY Clients

| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{ role: 'client', name: string, username?: string, phone?: string }` | Client connects and identifies |
| `clientMessage` | `{ type: 'text' \| 'image', message?: string, image?: string, name?: string, mimeType?: string }` | Client sends a message |
| `clientTyping` | `{ isTyping: boolean }` | Client typing indicator |
| `endChat` | `{}` | Client ends the chat |

### Events Emitted BY Operators

| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{ role: 'operator', name: string, operatorId: number }` | Operator connects and identifies |
| `operatorMessage` | `{ to: string, type: 'text' \| 'image', message?: string, image?: string, operatorId: number, operatorName: string }` | Operator sends message to client |
| `operatorTyping` | `{ to: string, isTyping: boolean }` | Operator typing indicator |
| `endChat` | `{ clientId: string }` | Operator ends a chat |

### Events Received BY Clients

| Event | Payload | Description |
|-------|---------|-------------|
| `operatorMessage` | `{ type: 'text' \| 'image', message?: string, image?: string, operatorName: string, timestamp: string }` | Message from operator |
| `operatorTyping` | `{ isTyping: boolean }` | Operator typing indicator |
| `chatEnded` | `{ message?: string }` | Chat ended by operator |

### Events Received BY Operators

| Event | Payload | Description |
|-------|---------|-------------|
| `newChat` | `{ clientId: string, username: string, phone?: string }` | New client connected |
| `incomingMessage` | `{ from: string, type: 'text' \| 'image', message?: string, image?: string, timestamp: string }` | Message from client |
| `clientTyping` | `{ from: string, isTyping: boolean }` | Client typing indicator |
| `chatEnded` | `{ clientId: string, reason?: string }` | Client disconnected or ended chat |
| `operatorBroadcast` | `{ clientId: string, operatorId: number, operatorName: string, type: 'text' \| 'image', message?: string, image?: string, timestamp: string }` | Another operator sent a message (for multi-operator coordination) |

## Development Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "lint": "eslint src --ext .ts"
  }
}
```

## TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Deployment Considerations

### For Render.com (your current backend host)

1. **Environment Variables:**
   - Set `PORT` (Render provides this automatically)
   - Set `CORS_ORIGIN` to your frontend URL
   - Set `NODE_ENV=production`

2. **Build Command:**
   ```bash
   npm install && npm run build
   ```

3. **Start Command:**
   ```bash
   npm start
   ```

### For Railway/Heroku

Similar configuration, ensure:
- WebSocket support is enabled (usually automatic)
- `socket.io` path is configured correctly
- CORS is properly set

## Testing the Backend

### 1. Test Health Endpoint

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-29T...",
  "connections": {
    "total": 0,
    "clients": 0,
    "operators": 0
  }
}
```

### 2. Test Socket Connection (using JavaScript)

Create a test file `test-client.js`:

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  path: '/chat',
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);

  socket.emit('join', {
    role: 'client',
    name: 'Test Client',
    username: 'test123'
  });
});

socket.on('operatorMessage', (data) => {
  console.log('📨 Received from operator:', data);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected');
});

// Send a test message after 2 seconds
setTimeout(() => {
  socket.emit('clientMessage', {
    type: 'text',
    message: 'Hello from test client!',
    timestamp: new Date().toISOString()
  });
}, 2000);
```

Run: `node test-client.js`

## Security Improvements (Production)

For production, consider adding:

1. **Authentication:**
```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (isValidToken(token)) {
    next();
  } else {
    next(new Error('Authentication error'));
  }
});
```

2. **Rate Limiting:**
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/health', limiter);
```

3. **Message Validation:**
```typescript
import Joi from 'joi';

const messageSchema = Joi.object({
  type: Joi.string().valid('text', 'image').required(),
  message: Joi.string().max(5000),
  image: Joi.string().max(10000000), // ~10MB base64
});
```

## Monitoring & Logging

Consider adding:

1. **Winston for logging:**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

2. **Metrics tracking:**
```typescript
let messageCount = 0;
let connectionCount = 0;

app.get('/metrics', (req, res) => {
  res.json({
    totalMessages: messageCount,
    totalConnections: connectionCount,
    uptime: process.uptime()
  });
});
```

## Troubleshooting

### Issue: CORS errors
**Solution:** Ensure `CORS_ORIGIN` in backend matches your frontend URL exactly

### Issue: Messages not received
**Solution:** Check that socket path matches: frontend uses `/chat`, backend serves on `/chat`

### Issue: WebSocket connection fails
**Solution:** Ensure your hosting provider supports WebSockets (Render, Railway, Heroku do)

## Next Steps

1. ✅ Your frontend already persists all messages to the database
2. ✅ Implement this backend server
3. ✅ Test with your frontend
4. ✅ Deploy to your hosting provider
5. ✅ Update frontend `.env` with your backend URL

## Summary

**What this backend does:**
- ✅ Routes messages between clients and operators in real-time
- ✅ Handles typing indicators
- ✅ Manages connections and disconnections
- ✅ Supports multi-operator coordination
- ✅ Provides health check and stats endpoints

**What it does NOT do:**
- ❌ Persist messages to database (your frontend handles this)
- ❌ User authentication (you can add this)
- ❌ File storage (images are sent as base64 strings)

**Your frontend persists:**
- ✅ All client messages (text and images)
- ✅ All operator messages (text and images)
- ✅ Message timestamps
- ✅ Read status
- ✅ Operator information
- ✅ Guest user data

Everything is already working perfectly on your frontend side! Just implement this backend and you'll have a complete real-time chat system with full persistence.
