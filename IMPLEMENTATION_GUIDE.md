# Backend Socket.IO Implementation Guide for Multi-Operator Chat Synchronization

This guide explains how to update your backend Socket.IO server to support real-time synchronization of chat messages across all connected operators, enabling admin supervision.

## Overview

The frontend has been updated to support multi-operator chat synchronization. All operators can now see messages from other operators in real-time, allowing admins to supervise all conversations.

## Architecture Changes

### Previous Flow
```
Operator A → Socket Server → Client
```

### New Flow
```
Operator A → Socket Server → Client
                ↓
          Broadcast to All Other Operators (B, C, D...)
```

## Required Backend Changes

### 1. Track Operator Connections

You need to maintain a mapping of operator socket IDs to their information.

```javascript
// At the top of your socket server file
const operatorSockets = new Map(); // socketId -> { operatorId, name, socketId }
```

### 2. Update the "join" Event Handler

When operators connect, they now send additional information:

**Incoming Event:**
```javascript
{
  role: "operator",
  name: "John Doe",        // Operator's full name
  operatorId: 123          // Database ID of the operator
}
```

**Implementation:**
```javascript
socket.on("join", (data) => {
  if (data.role === "operator") {
    // Store operator information
    operatorSockets.set(socket.id, {
      socketId: socket.id,
      operatorId: data.operatorId,
      name: data.name || "Operador",
    });

    console.log(`✅ Operator joined: ${data.name} (ID: ${data.operatorId})`);

    // Optional: Notify other operators
    socket.broadcast.emit("operatorConnected", {
      operatorId: data.operatorId,
      name: data.name,
    });
  } else if (data.role === "client") {
    // Existing client join logic
    // ...
  }
});
```

### 3. Update the "operatorMessage" Event Handler

This is the critical change. When an operator sends a message, you need to:
1. Send the message to the client (existing behavior)
2. **NEW:** Broadcast to all other operators

**Incoming Event Structure:**
```javascript
{
  to: "client-socket-id",           // Client socket ID
  type: "text" | "image",            // Message type
  message: "Hello",                  // Text content (if type === "text")
  image: "data:image/png;base64...", // Base64 image (if type === "image")
  name: "image.png",                 // Image filename (if type === "image")
  mimeType: "image/png",             // MIME type (if type === "image")
  size: 12345,                       // File size in bytes (if type === "image")
  operatorId: 123,                   // NEW: Database ID of sending operator
  operatorName: "John Doe"           // NEW: Name of sending operator
}
```

**Implementation:**
```javascript
socket.on("operatorMessage", (data) => {
  const {
    to,                    // Client socket ID
    type,                  // "text" or "image"
    message,               // Text message
    image,                 // Base64 image
    name,                  // Image filename
    mimeType,              // Image MIME type
    size,                  // Image size
    operatorId,            // NEW: Operator's DB ID
    operatorName           // NEW: Operator's name
  } = data;

  // 1. Send message to the client (existing behavior)
  if (type === "text") {
    io.to(to).emit("incomingOperatorMessage", {
      from: socket.id,
      type: "text",
      message: message,
    });
  } else if (type === "image") {
    io.to(to).emit("incomingOperatorMessage", {
      from: socket.id,
      type: "image",
      image: image,
      name: name,
      mimeType: mimeType,
    });
  }

  // 2. NEW: Broadcast to all other operators for supervision
  const messageForOperators = {
    from: type === "text" ? "operator" : "operator",
    text: message,
    image: image,
    mimeType: mimeType,
    name: name,
    timestamp: new Date().toISOString(),
    operatorId: operatorId,
    operatorName: operatorName,
  };

  // Broadcast to all operators EXCEPT the sender
  socket.broadcast.emit("operatorMessageBroadcast", {
    clientId: to,                    // Which client received this message
    message: messageForOperators,    // The message content
    operatorId: operatorId,          // Who sent it
    operatorName: operatorName,      // Operator's name
  });

  console.log(`📤 Message from ${operatorName} to client ${to} broadcasted to all operators`);
});
```

### 4. Handle Operator Disconnection

Clean up the operator mapping when they disconnect:

```javascript
socket.on("disconnect", () => {
  const operator = operatorSockets.get(socket.id);

  if (operator) {
    console.log(`👋 Operator disconnected: ${operator.name} (ID: ${operator.operatorId})`);

    // Optional: Notify other operators
    socket.broadcast.emit("operatorDisconnected", {
      operatorId: operator.operatorId,
      name: operator.name,
    });

    // Remove from tracking
    operatorSockets.delete(socket.id);
  }

  // Existing client disconnect logic
  // ...
});
```

### 5. Optional: Add Operator List Endpoint

You can provide a list of currently connected operators:

```javascript
socket.on("getConnectedOperators", () => {
  const operators = Array.from(operatorSockets.values()).map(op => ({
    operatorId: op.operatorId,
    name: op.name,
  }));

  socket.emit("connectedOperatorsList", operators);
});
```

## Complete Example Implementation

Here's a complete Socket.IO server implementation with all changes:

```javascript
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Configure appropriately for production
    methods: ["GET", "POST"],
  },
  path: "/chat",
});

// Track connected operators
const operatorSockets = new Map(); // socketId -> { operatorId, name, socketId }

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // JOIN: Operator or Client connects
  socket.on("join", (data) => {
    const { role, name, operatorId } = data;

    if (role === "operator") {
      operatorSockets.set(socket.id, {
        socketId: socket.id,
        operatorId: operatorId,
        name: name || "Operador",
      });
      console.log(`✅ Operator joined: ${name} (ID: ${operatorId})`);
    } else if (role === "client") {
      console.log(`✅ Client joined: ${data.username}`);

      // Notify all operators about new client
      socket.broadcast.emit("newChat", {
        clientId: socket.id,
        username: data.username,
      });
    }
  });

  // OPERATOR MESSAGE: Operator sends message to client
  socket.on("operatorMessage", (data) => {
    const {
      to,
      type,
      message,
      image,
      name,
      mimeType,
      size,
      operatorId,
      operatorName,
    } = data;

    // Send to client
    if (type === "text") {
      io.to(to).emit("incomingOperatorMessage", {
        from: socket.id,
        type: "text",
        message: message,
      });
    } else if (type === "image") {
      io.to(to).emit("incomingOperatorMessage", {
        from: socket.id,
        type: "image",
        image: image,
        name: name,
        mimeType: mimeType,
      });
    }

    // Broadcast to all other operators
    const messageForOperators = {
      from: "operator",
      text: message,
      image: image,
      mimeType: mimeType,
      name: name,
      timestamp: new Date().toISOString(),
      operatorId: operatorId,
      operatorName: operatorName,
    };

    socket.broadcast.emit("operatorMessageBroadcast", {
      clientId: to,
      message: messageForOperators,
      operatorId: operatorId,
      operatorName: operatorName,
    });

    console.log(`📤 ${operatorName} → Client ${to} (${type})`);
  });

  // CLIENT MESSAGE: Client sends message to operator
  socket.on("clientMessage", (data) => {
    const { type, message, image, name, mimeType, size } = data;

    // Broadcast to ALL operators (not just one)
    const payload = {
      from: socket.id,
      type: type,
    };

    if (type === "text") {
      payload.message = message;
    } else if (type === "image") {
      payload.image = image;
      payload.name = name;
      payload.mimeType = mimeType;
      payload.size = size;
    }

    io.emit("incomingMessage", payload);
    console.log(`📥 Client ${socket.id} sent ${type} message to all operators`);
  });

  // OPERATOR TYPING: Notify client that operator is typing
  socket.on("operatorTyping", (data) => {
    io.to(data.to).emit("operatorTyping", {
      isTyping: data.isTyping,
    });
  });

  // CLIENT TYPING: Notify operators that client is typing
  socket.on("clientTyping", (data) => {
    socket.broadcast.emit("clientTyping", {
      from: socket.id,
      isTyping: data.isTyping,
    });
  });

  // DISCONNECT: Clean up on disconnect
  socket.on("disconnect", () => {
    const operator = operatorSockets.get(socket.id);

    if (operator) {
      console.log(`👋 Operator disconnected: ${operator.name}`);
      operatorSockets.delete(socket.id);

      socket.broadcast.emit("operatorDisconnected", {
        operatorId: operator.operatorId,
        name: operator.name,
      });
    } else {
      console.log(`👋 Client disconnected: ${socket.id}`);

      // Notify operators that client left
      socket.broadcast.emit("chatEnded", {
        clientId: socket.id,
      });
    }
  });

  // Optional: Get list of connected operators
  socket.on("getConnectedOperators", () => {
    const operators = Array.from(operatorSockets.values()).map(op => ({
      operatorId: op.operatorId,
      name: op.name,
    }));

    socket.emit("connectedOperatorsList", operators);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`📡 WebSocket path: /chat`);
});
```

## Socket Events Reference

### Client → Server Events

| Event | Role | Data | Description |
|-------|------|------|-------------|
| `join` | Both | `{ role: "operator"\|"client", name: string, operatorId?: number, username?: string }` | Initial connection |
| `operatorMessage` | Operator | `{ to: string, type: "text"\|"image", message?: string, image?: string, name?: string, mimeType?: string, operatorId: number, operatorName: string }` | Operator sends message |
| `clientMessage` | Client | `{ type: "text"\|"image", message?: string, image?: string, name?: string, mimeType?: string }` | Client sends message |
| `operatorTyping` | Operator | `{ to: string, isTyping: boolean }` | Operator typing status |
| `clientTyping` | Client | `{ isTyping: boolean }` | Client typing status |

### Server → Client Events

| Event | Target | Data | Description |
|-------|--------|------|-------------|
| `newChat` | Operators | `{ clientId: string, username: string }` | New client connected |
| `incomingMessage` | Operators | `{ from: string, type: "text"\|"image", message?: string, image?: string, name?: string, mimeType?: string }` | Client sent message |
| `incomingOperatorMessage` | Client | `{ from: string, type: "text"\|"image", message?: string, image?: string, name?: string, mimeType?: string }` | Operator sent message to client |
| `operatorMessageBroadcast` | **NEW** Operators | `{ clientId: string, message: Message, operatorId: number, operatorName: string }` | Another operator sent a message |
| `clientTyping` | Operators | `{ from: string, isTyping: boolean }` | Client typing indicator |
| `operatorTyping` | Client | `{ isTyping: boolean }` | Operator typing indicator |
| `chatEnded` | Operators | `{ clientId: string }` | Client disconnected |
| `operatorConnected` | Operators (optional) | `{ operatorId: number, name: string }` | Another operator connected |
| `operatorDisconnected` | Operators (optional) | `{ operatorId: number, name: string }` | Another operator disconnected |

## Testing the Implementation

### 1. Test Multi-Operator Sync

1. Open the chat panel in two different browser windows/tabs
2. Log in as different operators in each
3. Send a message from Operator A
4. Verify that Operator B sees the message in real-time with Operator A's name

### 2. Test Message Attribution

1. Send messages from multiple operators
2. Verify each message shows the correct operator name
3. Verify your own messages don't show your name (only others' messages do)

### 3. Test Notifications

1. Have Operator A send a message to Client X
2. If Operator B is viewing Client Y's chat, they should see a toast notification
3. The notification should say: "[Operator A] sent a message to [Client X]"

### 4. Test Client Interactions

1. Ensure clients still receive messages from all operators
2. Verify clients are not affected by the operator broadcast feature
3. Test typing indicators work in both directions

## Security Considerations

### 1. Validate Operator Identity

Always verify the operator's identity server-side:

```javascript
socket.on("join", async (data) => {
  if (data.role === "operator") {
    // Validate JWT or session
    const isValid = await validateOperatorToken(data.token);
    if (!isValid) {
      socket.disconnect(true);
      return;
    }

    // Verify operatorId matches authenticated user
    // ...
  }
});
```

### 2. Implement Rate Limiting

Prevent spam and abuse:

```javascript
const messageRateLimiter = new Map(); // socketId -> { count, resetTime }

socket.on("operatorMessage", (data) => {
  const limit = messageRateLimiter.get(socket.id) || { count: 0, resetTime: Date.now() + 60000 };

  if (Date.now() > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = Date.now() + 60000;
  }

  if (limit.count >= 100) { // Max 100 messages per minute
    socket.emit("rateLimitExceeded", { message: "Too many messages" });
    return;
  }

  limit.count++;
  messageRateLimiter.set(socket.id, limit);

  // Process message
  // ...
});
```

### 3. Sanitize Message Content

Never trust client input:

```javascript
const sanitizeHtml = require("sanitize-html");

socket.on("operatorMessage", (data) => {
  if (data.type === "text" && data.message) {
    data.message = sanitizeHtml(data.message, {
      allowedTags: [],
      allowedAttributes: {},
    });
  }

  // Process message
  // ...
});
```

## Environment Variables

Update your `.env` file:

```bash
# Socket.IO Configuration
SOCKET_PORT=3001
SOCKET_PATH=/chat
CORS_ORIGIN=http://localhost:3000,https://yourapp.com

# Optional: Redis for multi-server support
REDIS_URL=redis://localhost:6379
```

## Multi-Server Support (Optional)

If running multiple backend instances, use Redis adapter:

```javascript
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("✅ Redis adapter connected");
});
```

## Troubleshooting

### Messages Not Syncing

1. Check that `operatorId` and `operatorName` are included in `operatorMessage` events
2. Verify `operatorMessageBroadcast` event is being emitted
3. Check browser console for errors
4. Verify Socket.IO server version compatibility (>=4.0.0)

### Duplicate Messages

1. Ensure deduplication logic is working (checking timestamp/id)
2. Verify `operatorId === user?.id` check in `operatorMessageBroadcast` handler
3. Check for multiple socket connections from same operator

### Missing Operator Names

1. Verify operator data is loaded in frontend (`useAuthStore`)
2. Check database query includes operator relation in `getChatHistoryAction`
3. Ensure operator information is stored in `operatorSockets` Map

## Next Steps

After implementing these changes:

1. ✅ Test with multiple operators simultaneously
2. ✅ Verify all messages sync in real-time
3. ✅ Check that operator names display correctly
4. ✅ Test with poor network conditions
5. ✅ Load test with many concurrent operators
6. ✅ Monitor for memory leaks in `operatorSockets` Map
7. ✅ Set up logging/monitoring for socket events
8. ✅ Document for your team

## Support

If you encounter issues:
- Check Socket.IO server logs
- Use browser DevTools → Network → WS tab to inspect WebSocket messages
- Enable Socket.IO debug mode: `DEBUG=socket.io:* node server.js`
- Verify frontend and backend are using compatible Socket.IO versions

---

**Last Updated:** 2025-11-28
**Frontend Version:** Updated with multi-operator sync support
**Required Backend Changes:** Complete
