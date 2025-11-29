# Backend Implementation Guide: Chat Persistence & Notifications

This guide covers the backend changes needed to support the enhanced chat system with full persistence, message status tracking, and sound notifications.

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Socket.io Event Handling](#socketio-event-handling)
4. [Message Persistence Flow](#message-persistence-flow)
5. [API Endpoints](#api-endpoints)
6. [Implementation Examples](#implementation-examples)
7. [Testing](#testing)
8. [Deployment Checklist](#deployment-checklist)

---

## Overview

### What's New?
- ✅ All chat messages are now persisted to the database
- ✅ Messages include unique IDs for tracking delivery status
- ✅ Operators can see when messages are saved (checkmark indicator)
- ✅ Chat history loads automatically when operators connect
- ✅ Messages are marked as read when operators view them
- ✅ Sound notifications play for incoming messages

### Frontend Expectations

The frontend now expects:
1. All messages to be saved to database with unique IDs
2. Socket events to maintain backward compatibility
3. Database to track message delivery and read status
4. Recent chat history to be available via API

---

## Database Schema

### Required Tables

Your database should already have these tables from Prisma schema. Verify they exist:

#### 1. **ChatMessage Table**
```prisma
model ChatMessage {
  id              Int             @id @default(autoincrement())
  clientId        Int
  clientSocketId  String?
  senderType      MessageSenderType
  operatorId      Int?
  messageType     MessageType
  text            String?
  imageUrl        String?
  imageName       String?
  mimeType        String?
  sessionId       String?
  isRead          Boolean         @default(false)
  readAt          DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  client          Client          @relation(fields: [clientId], references: [id])
  operator        User?           @relation(fields: [operatorId], references: [id])
}
```

#### 2. **Required Enums**
```prisma
enum MessageSenderType {
  CLIENT
  OPERATOR
}

enum MessageType {
  TEXT
  IMAGE
}
```

### Database Indexes (Important for Performance!)

Add these indexes to improve query performance:

```sql
-- Index for fetching chat history
CREATE INDEX idx_chat_messages_client_created
ON ChatMessage(clientId, createdAt DESC);

-- Index for unread count queries
CREATE INDEX idx_chat_messages_unread
ON ChatMessage(clientId, senderType, isRead);

-- Index for session-based queries
CREATE INDEX idx_chat_messages_session
ON ChatMessage(sessionId, createdAt DESC);

-- Index for operator queries
CREATE INDEX idx_chat_messages_operator
ON ChatMessage(operatorId, createdAt DESC);
```

---

## Socket.io Event Handling

### Current Events (Keep These)

Your Socket.io server should already handle these events. **DO NOT CHANGE THEM:**

#### From Client
- `join` - Client joins chat
- `clientMessage` - Client sends text message
- `clientTyping` - Client typing indicator
- `chatEnded` - Client ends conversation

#### From Operator
- `join` - Operator connects (with `role: "operator"`)
- `operatorMessage` - Operator sends message
- `operatorTyping` - Operator typing indicator

#### To Client
- `operatorMessage` - Forward operator message to client
- `operatorTyping` - Forward operator typing status

#### To Operator
- `newChat` - New client connected
- `incomingMessage` - Client sent a message
- `clientTyping` - Client is typing
- `chatEnded` - Client ended chat

### ⚠️ Important: Message ID Handling

**The frontend does NOT expect message IDs from Socket.io events.**

The flow works like this:
1. Frontend receives Socket.io event with message data
2. Frontend saves message to database via API action
3. Frontend gets database ID back from API
4. Frontend updates UI with the ID (shows checkmark)

**Your Socket.io server should:**
- Continue emitting events as before
- NOT include database IDs in socket events
- Focus on real-time delivery only
- Let the Next.js API handle database operations

---

## Message Persistence Flow

### Complete Flow Diagram

```
┌─────────────┐                  ┌─────────────┐                  ┌──────────────┐
│   Client    │                  │  Socket.io  │                  │  Operator    │
│   (Web)     │                  │   Server    │                  │  Dashboard   │
└──────┬──────┘                  └──────┬──────┘                  └──────┬───────┘
       │                                │                                │
       │ 1. Send message (Socket)       │                                │
       │───────────────────────────────>│                                │
       │                                │                                │
       │                                │ 2. Emit "incomingMessage"      │
       │                                │───────────────────────────────>│
       │                                │                                │
       │                                │                                │ 3. Save to DB
       │                                │                                │    via API
       │                                │                                │──────┐
       │                                │                                │      │
       │                                │                                │<─────┘
       │                                │                                │
       │                                │ 4. Operator replies (Socket)   │
       │                                │<───────────────────────────────│
       │                                │                                │
       │ 5. Emit "operatorMessage"      │                                │
       │<───────────────────────────────│                                │
       │                                │                                │
       │                                │                                │ 6. Save to DB
       │                                │                                │    via API
       │                                │                                │──────┐
       │                                │                                │      │
       │                                │                                │<─────┘
```

### Key Points

1. **Socket.io handles real-time delivery only**
   - Fast, instant message delivery
   - No database operations in socket handlers
   - Keep it lightweight and responsive

2. **Next.js API handles persistence**
   - All database writes go through API actions
   - Proper validation with Zod schemas
   - Error handling and logging
   - Returns database IDs to frontend

3. **Why this architecture?**
   - Separation of concerns
   - Socket.io server stays simple and fast
   - Next.js handles business logic
   - Easier to test and maintain
   - Better error handling

---

## API Endpoints

The frontend uses these Next.js Server Actions (already implemented):

### 1. **saveChatMessageAction**
```typescript
// Location: /actions/chat.ts
// Called after every message (client or operator)

Input:
{
  clientId: number,
  clientSocketId?: string,
  senderType: "CLIENT" | "OPERATOR",
  operatorId?: number,
  messageType: "TEXT" | "IMAGE",
  text?: string,
  imageUrl?: string,
  imageName?: string,
  mimeType?: string,
  sessionId?: string
}

Returns:
{
  id: number,  // Database message ID
  // ... other fields
}
```

### 2. **getChatHistoryAction**
```typescript
// Location: /actions/chat.ts
// Called when loading chat history

Input:
{
  clientId: number,
  limit?: number,  // Default 100
  sessionId?: string  // Optional filter
}

Returns: Array of messages with operator info
```

### 3. **getRecentChatsAction**
```typescript
// Location: /actions/chat.ts
// Called when operator panel loads

Input: None (reads all recent chats)

Returns:
[
  {
    client: { id, username, phone, status },
    lastMessage: { text, createdAt, ... },
    unreadCount: number
  }
]
```

### 4. **markMessagesAsReadAction**
```typescript
// Location: /actions/chat.ts
// Called when operator views a chat

Input:
{
  clientId: number,
  operatorId: number
}

Returns: Update count
```

---

## Implementation Examples

### Socket.io Server Example

Here's a complete Socket.io server implementation that works with the new frontend:

```javascript
const io = require('socket.io')(server, {
  path: '/chat',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Store connected clients and operators
const clients = new Map(); // clientId -> socket
const operators = new Map(); // operatorId -> socket

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Handle join event
  socket.on('join', (data) => {
    const { role, name, operatorId } = data;

    if (role === 'client') {
      // Client joining
      const clientId = socket.id;
      clients.set(clientId, socket);

      console.log(`Client joined: ${name} (${clientId})`);

      // Notify all operators about new chat
      operators.forEach((operatorSocket) => {
        operatorSocket.emit('newChat', {
          clientId,
          username: name
        });
      });

    } else if (role === 'operator') {
      // Operator joining
      operators.set(operatorId || socket.id, socket);
      console.log(`Operator joined: ${name} (${operatorId})`);
    }
  });

  // Handle client messages
  socket.on('clientMessage', (data) => {
    const { type, message, image, name, mimeType, size } = data;
    const clientId = socket.id;

    console.log(`Message from client ${clientId}:`, type);

    // Forward to all operators
    operators.forEach((operatorSocket) => {
      operatorSocket.emit('incomingMessage', {
        from: clientId,
        type,
        message,
        image,
        name,
        mimeType,
        size,
        timestamp: new Date().toISOString()
      });
    });

    // NOTE: Database saving happens on frontend via API
    // We just handle real-time delivery here
  });

  // Handle operator messages
  socket.on('operatorMessage', (data) => {
    const { to, type, message, image, name, mimeType, operatorId, operatorName } = data;

    console.log(`Message from operator to ${to}:`, type);

    // Forward to specific client
    const clientSocket = clients.get(to);
    if (clientSocket) {
      clientSocket.emit('operatorMessage', {
        type,
        message,
        image,
        name,
        mimeType,
        operatorName,
        timestamp: new Date().toISOString()
      });
    } else {
      console.warn(`Client ${to} not found`);
    }

    // Also broadcast to other operators (for multi-operator support)
    operators.forEach((operatorSocket, opId) => {
      // Don't send back to the sender
      if (opId !== operatorId) {
        operatorSocket.emit('operatorBroadcast', {
          clientId: to,
          operatorId,
          operatorName,
          type,
          message,
          image,
          timestamp: new Date().toISOString()
        });
      }
    });

    // NOTE: Database saving happens on frontend via API
  });

  // Handle typing indicators
  socket.on('clientTyping', (data) => {
    const clientId = socket.id;
    operators.forEach((operatorSocket) => {
      operatorSocket.emit('clientTyping', {
        from: clientId,
        isTyping: data.isTyping
      });
    });
  });

  socket.on('operatorTyping', (data) => {
    const { to, isTyping, operatorName } = data;
    const clientSocket = clients.get(to);
    if (clientSocket) {
      clientSocket.emit('operatorTyping', {
        isTyping,
        operatorName
      });
    }
  });

  // Handle chat ended
  socket.on('chatEnded', () => {
    const clientId = socket.id;
    console.log(`Chat ended by client: ${clientId}`);

    operators.forEach((operatorSocket) => {
      operatorSocket.emit('chatEnded', { clientId });
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);

    // Remove from clients map
    clients.delete(socket.id);

    // Remove from operators map
    operators.forEach((_, key) => {
      if (operators.get(key).id === socket.id) {
        operators.delete(key);
      }
    });
  });
});

console.log('Socket.io server running on /chat');
```

### Environment Variables

Add these to your `.env`:

```bash
# Socket.io Configuration
SOCKET_PORT=3001
FRONTEND_URL=http://localhost:3000

# For production
# FRONTEND_URL=https://your-domain.com
```

---

## Testing

### Manual Testing Checklist

#### 1. **Message Persistence**
- [ ] Client sends text message → Appears in operator dashboard
- [ ] Operator sends reply → Client receives it
- [ ] Refresh operator dashboard → All messages still visible
- [ ] Check database → Messages have unique IDs
- [ ] Operator message shows checkmark after saving

#### 2. **Chat History**
- [ ] New operator logs in → Sees all recent chats
- [ ] Click on chat → Full history loads from database
- [ ] Messages show in correct order (oldest to newest)
- [ ] Operator names appear on operator messages
- [ ] Images load correctly from database

#### 3. **Read Status**
- [ ] Unread count shows on chat list
- [ ] Click chat → Unread count goes to 0
- [ ] Database updated with `isRead: true`
- [ ] `readAt` timestamp is set

#### 4. **Multi-Operator**
- [ ] Two operators online
- [ ] One sends message → Other sees it
- [ ] Both can see same chat history
- [ ] Messages attributed to correct operator

#### 5. **Error Handling**
- [ ] Database down → Messages still sent via Socket
- [ ] Socket disconnected → Messages saved to DB
- [ ] Invalid data → Proper error messages
- [ ] Network timeout → Retry logic works

### Automated Testing

#### Unit Tests
```javascript
describe('Socket.io Chat Server', () => {
  it('should emit newChat when client joins', (done) => {
    // Test implementation
  });

  it('should forward client messages to operators', (done) => {
    // Test implementation
  });

  it('should forward operator messages to clients', (done) => {
    // Test implementation
  });

  it('should handle disconnect gracefully', (done) => {
    // Test implementation
  });
});
```

#### Integration Tests
```javascript
describe('Chat Persistence Flow', () => {
  it('should save message and return ID', async () => {
    const message = await saveChatMessageAction({
      clientId: 1,
      senderType: 'OPERATOR',
      messageType: 'TEXT',
      text: 'Test message'
    });

    expect(message.id).toBeDefined();
    expect(message.text).toBe('Test message');
  });

  it('should load chat history', async () => {
    const history = await getChatHistoryAction({
      clientId: 1,
      limit: 10
    });

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeLessThanOrEqual(10);
  });
});
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Database migrations applied
- [ ] Indexes created for performance
- [ ] Environment variables set
- [ ] Socket.io CORS configured for production domain
- [ ] SSL/TLS certificates ready (for wss://)
- [ ] Load balancer configured for WebSocket support

### Database

- [ ] Backup current database
- [ ] Run Prisma migrations: `npx prisma migrate deploy`
- [ ] Verify all tables exist
- [ ] Verify indexes are created
- [ ] Test queries perform well

### Socket.io Server

- [ ] Update CORS origin to production URL
- [ ] Enable WebSocket compression
- [ ] Configure reconnection settings
- [ ] Set up monitoring/logging
- [ ] Test connection limits

### Frontend

- [ ] Update `NEXT_PUBLIC_SOCKET_URL` environment variable
- [ ] Update `NEXT_PUBLIC_SOCKET_PATH` if needed
- [ ] Test connection to production Socket server
- [ ] Verify SSL certificate works with WebSocket

### Monitoring

Set up monitoring for:
- Socket.io connection count
- Message delivery rate
- Database query performance
- Error rates
- API response times

### Example Production Socket.io Config

```javascript
const io = require('socket.io')(server, {
  path: '/chat',
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  },
  // Production optimizations
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8, // 100MB for images
  transports: ['websocket', 'polling'],
  // Enable compression
  perMessageDeflate: {
    threshold: 1024
  }
});
```

---

## Performance Optimization

### Socket.io Performance

1. **Use Redis Adapter** (for multiple server instances)
```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
});
```

2. **Rate Limiting**
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 5 // 5 messages per second
});

io.use((socket, next) => {
  limiter(socket.request, {}, next);
});
```

### Database Performance

1. **Connection Pooling**
```javascript
// In Prisma, configure pool size
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Add connection pool settings in DATABASE_URL:
  // postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=20
}
```

2. **Batch Operations**
```javascript
// When saving multiple messages
await prisma.chatMessage.createMany({
  data: messages,
  skipDuplicates: true
});
```

---

## Troubleshooting

### Common Issues

#### 1. Messages not saving to database
**Symptoms:** Operators see messages disappear after refresh
**Solution:** Check Next.js server logs for API errors

#### 2. Checkmark not appearing
**Symptoms:** Messages sent but no checkmark
**Solution:** Verify `saveChatMessageAction` returns message with `id`

#### 3. Chat history not loading
**Symptoms:** Empty chat when clicking on conversation
**Solution:** Verify client has database ID (`clientDbId`)

#### 4. Multiple duplicate messages
**Symptoms:** Same message appears multiple times
**Solution:** Check socket event handlers aren't duplicated

#### 5. WebSocket connection fails
**Symptoms:** "Disconnected" status in operator panel
**Solution:**
- Verify Socket.io server is running
- Check CORS configuration
- Verify firewall allows WebSocket connections
- Check SSL certificate for wss://

### Debug Mode

Enable debug logging:

```javascript
// Socket.io server
process.env.DEBUG = 'socket.io:*';

// Frontend (add to .env.local)
NEXT_PUBLIC_DEBUG_SOCKETS=true
```

---

## Security Considerations

### Authentication

The current implementation uses operator IDs. Consider adding:

```javascript
// JWT authentication for Socket.io
const jwt = require('jsonwebtoken');

io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});
```

### Input Validation

Always validate incoming data:

```javascript
socket.on('clientMessage', (data) => {
  // Validate message
  if (!data.message || typeof data.message !== 'string') {
    socket.emit('error', { message: 'Invalid message format' });
    return;
  }

  // Sanitize message (prevent XSS)
  const sanitizedMessage = sanitizeHtml(data.message);

  // Continue processing...
});
```

### Rate Limiting

Prevent abuse:

```javascript
const messageRates = new Map();

socket.on('clientMessage', (data) => {
  const clientId = socket.id;
  const now = Date.now();
  const rate = messageRates.get(clientId) || { count: 0, timestamp: now };

  // Reset if more than 1 second passed
  if (now - rate.timestamp > 1000) {
    rate.count = 0;
    rate.timestamp = now;
  }

  rate.count++;

  // Max 5 messages per second
  if (rate.count > 5) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }

  messageRates.set(clientId, rate);

  // Continue processing...
});
```

---

## Support & Resources

### Documentation
- [Socket.io Documentation](https://socket.io/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

### Example Repositories
- This project's frontend implementation: `/components/OperatorChatPanel.tsx`
- Database actions: `/actions/chat.ts`

### Need Help?

If you encounter issues:
1. Check the troubleshooting section
2. Enable debug mode
3. Review server logs
4. Check database query performance
5. Verify network connectivity

---

## Changelog

### Version 2.0 (Current)
- ✅ Full message persistence
- ✅ Chat history loading
- ✅ Read status tracking
- ✅ Message delivery confirmation
- ✅ Sound notifications
- ✅ Multi-operator support

### Version 1.0 (Previous)
- ✅ Basic real-time chat
- ✅ Socket.io communication
- ✅ Typing indicators

---

## Summary

**What the backend needs to do:**
1. ✅ Keep Socket.io server running (no major changes needed)
2. ✅ Ensure database schema is up to date
3. ✅ Add performance indexes
4. ✅ Configure CORS for production
5. ✅ Set up monitoring

**What the backend does NOT need to do:**
- ❌ Save messages in Socket.io handlers (frontend handles this)
- ❌ Return database IDs in Socket events
- ❌ Implement new Socket events
- ❌ Change message format

**The architecture is simple:**
- Socket.io = Real-time delivery
- Next.js API = Database persistence
- Database = Source of truth

This separation makes the system:
- Faster (Socket.io stays lightweight)
- More reliable (Database handles consistency)
- Easier to maintain (Clear responsibilities)
- More scalable (Can optimize each part independently)

---

**Questions?** Review the implementation examples and troubleshooting sections. The system is designed to work with minimal backend changes!
