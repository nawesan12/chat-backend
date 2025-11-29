# Socket Events Guide - Complete Reference

This guide provides a comprehensive reference for all Socket.IO events used in the chat backend. Use this to ensure proper synchronization between your client, operator, and backend implementations.

## Table of Contents

1. [Connection Setup](#connection-setup)
2. [Client Events](#client-events)
3. [Operator Events](#operator-events)
4. [Events Received by Clients](#events-received-by-clients)
5. [Events Received by Operators](#events-received-by-operators)
6. [Common Events](#common-events)
7. [Error Handling](#error-handling)
8. [Testing Examples](#testing-examples)

---

## Connection Setup

### Server Configuration

```javascript
// Socket.IO connection
const socket = io('http://localhost:8080', {
  path: '/chat',
  transports: ['websocket', 'polling']
});
```

---

## Client Events

Events that **clients send** to the server.

### 1. `join` - Client Connection

**When to emit:** When a client first connects to the chat

**Payload:**
```javascript
{
  role: 'client',           // Required: Must be 'client'
  name: string,             // Required: Display name
  username?: string,        // Optional: Username
  phone?: string            // Optional: Phone number
}
```

**Example:**
```javascript
socket.emit('join', {
  role: 'client',
  name: 'John Doe',
  username: 'john123',
  phone: '+1234567890'
});
```

**What happens:**
- Client is registered in the system
- All connected operators receive a `newChat` event
- Client can start sending messages

---

### 2. `clientMessage` - Send Message

**When to emit:** When a client sends a text or image message

**Payload:**
```javascript
{
  type: 'text' | 'image',   // Required: Message type
  message?: string,         // Required for text messages
  image?: string,           // Required for image messages (base64 data URL)
  name?: string,            // Optional: Filename for images
  mimeType?: string,        // Optional: MIME type (image/jpeg, image/png, etc.)
  size?: number,            // Optional: File size in bytes
  timestamp?: string        // Optional: ISO timestamp (auto-generated if not provided)
}
```

**Example - Text Message:**
```javascript
socket.emit('clientMessage', {
  type: 'text',
  message: 'Hello, I need help!',
  timestamp: new Date().toISOString()
});
```

**Example - Image Message:**
```javascript
socket.emit('clientMessage', {
  type: 'image',
  image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  name: 'screenshot.jpg',
  mimeType: 'image/jpeg',
  size: 245678,
  timestamp: new Date().toISOString()
});
```

**What happens:**
- Message is validated and sanitized (text) or validated (image)
- Message is broadcasted to **all operators** via `incomingMessage` event
- Message is NOT sent back to the sender

**Validation Rules:**
- Text messages: Max 5000 characters, HTML/script tags removed
- Image messages: Max 10MB, must be data URL, allowed types: JPEG, PNG, GIF, WebP

---

### 3. `clientTyping` - Typing Indicator

**When to emit:** When client starts or stops typing

**Payload:**
```javascript
{
  isTyping: boolean         // Required: true when typing, false when stopped
}
```

**Example:**
```javascript
// Start typing
socket.emit('clientTyping', { isTyping: true });

// Stop typing
socket.emit('clientTyping', { isTyping: false });
```

**What happens:**
- All operators receive `clientTyping` event with client's socket ID

---

### 4. `endChat` - End Conversation

**When to emit:** When client wants to end the conversation

**Payload:**
```javascript
{}  // Empty object or no payload
```

**Example:**
```javascript
socket.emit('endChat');
```

**What happens:**
- All operators receive `chatEnded` event with client's ID

---

## Operator Events

Events that **operators send** to the server.

### 1. `join` - Operator Connection

**When to emit:** When an operator first connects to the chat system

**Payload:**
```javascript
{
  role: 'operator',         // Required: Must be 'operator'
  name: string,             // Required: Operator display name
  operatorId: number        // Required: Unique operator ID
}
```

**Example:**
```javascript
socket.emit('join', {
  role: 'operator',
  name: 'Agent Smith',
  operatorId: 42
});
```

**What happens:**
- Operator is registered in the system
- Operator receives `newChat` events for **all currently connected clients**
- Operator can start receiving and sending messages

---

### 2. `operatorMessage` - Send Message to Client

**When to emit:** When operator sends a message to a specific client

**Payload:**
```javascript
{
  to: string,               // Required: Client's socket ID
  type: 'text' | 'image',   // Required: Message type
  message?: string,         // Required for text messages
  image?: string,           // Required for image messages (base64 data URL)
  name?: string,            // Optional: Filename for images
  mimeType?: string,        // Optional: MIME type
  size?: number,            // Optional: File size in bytes
  operatorId: number,       // Required: Operator's ID
  operatorName: string      // Required: Operator's name
}
```

**Example - Text Message:**
```javascript
socket.emit('operatorMessage', {
  to: 'client-socket-id-123',
  type: 'text',
  message: 'Hello! How can I help you?',
  operatorId: 42,
  operatorName: 'Agent Smith'
});
```

**Example - Image Message:**
```javascript
socket.emit('operatorMessage', {
  to: 'client-socket-id-123',
  type: 'image',
  image: 'data:image/png;base64,iVBORw0KGgo...',
  name: 'solution.png',
  mimeType: 'image/png',
  size: 152340,
  operatorId: 42,
  operatorName: 'Agent Smith'
});
```

**What happens:**
- Message is sent to the **specific client** via `operatorMessage` event
- Message is broadcasted to **all other operators** via `operatorBroadcast` event
- Sending operator does NOT receive the broadcast

---

### 3. `operatorTyping` - Typing Indicator

**When to emit:** When operator starts or stops typing to a client

**Payload:**
```javascript
{
  to: string,               // Required: Client's socket ID
  isTyping: boolean         // Required: true when typing, false when stopped
}
```

**Example:**
```javascript
socket.emit('operatorTyping', {
  to: 'client-socket-id-123',
  isTyping: true
});
```

**What happens:**
- Specific client receives `operatorTyping` event

---

### 4. `endChat` - End Client Conversation

**When to emit:** When operator wants to end a conversation with a client

**Payload:**
```javascript
{
  clientId: string,         // Required: Client's socket ID
  operatorId?: number       // Optional: Operator's ID
}
```

**Example:**
```javascript
socket.emit('endChat', {
  clientId: 'client-socket-id-123',
  operatorId: 42
});
```

**What happens:**
- All operators receive `chatEnded` event
- Client receives `chatEnded` event with a message

---

### 5. `getConnectedOperators` - Get Operator List

**When to emit:** When you need a list of all connected operators

**Payload:**
```javascript
{}  // Empty or no payload
```

**Example:**
```javascript
socket.emit('getConnectedOperators');
```

**What happens:**
- Operator receives `connectedOperatorsList` event with array of operators

---

## Events Received by Clients

Events that **clients listen for** from the server.

### 1. `operatorMessage` - Message from Operator

**When received:** When an operator sends a message to this client

**Payload:**
```javascript
{
  type: 'text' | 'image',   // Message type
  message?: string,         // Text message content (if type is 'text')
  image?: string,           // Image data URL (if type is 'image')
  name?: string,            // Filename (for images)
  mimeType?: string,        // MIME type (for images)
  operatorName: string,     // Name of the operator who sent it
  timestamp: string         // ISO timestamp
}
```

**Example:**
```javascript
socket.on('operatorMessage', (data) => {
  console.log(`Message from ${data.operatorName}: ${data.message}`);
  // Display message in chat UI
});
```

---

### 2. `operatorTyping` - Operator Typing Indicator

**When received:** When operator starts or stops typing

**Payload:**
```javascript
{
  isTyping: boolean         // true when typing, false when stopped
}
```

**Example:**
```javascript
socket.on('operatorTyping', (data) => {
  if (data.isTyping) {
    console.log('Operator is typing...');
  } else {
    console.log('Operator stopped typing');
  }
});
```

---

### 3. `chatEnded` - Chat Ended

**When received:** When operator ends the chat or client disconnects

**Payload:**
```javascript
{
  message?: string,         // Optional: Reason message
  reason?: string           // Optional: 'disconnect' if client disconnected
}
```

**Example:**
```javascript
socket.on('chatEnded', (data) => {
  console.log('Chat ended:', data.message);
  // Close chat window or show "conversation ended" message
});
```

---

## Events Received by Operators

Events that **operators listen for** from the server.

### 1. `newChat` - New Client Connected

**When received:**
- When a new client connects (sent to all operators)
- When operator first connects (receives one event per existing client)

**Payload:**
```javascript
{
  clientId: string,         // Client's socket ID
  username: string,         // Client's username or name
  phone?: string            // Optional: Client's phone number
}
```

**Example:**
```javascript
socket.on('newChat', (data) => {
  console.log(`New client: ${data.username} (${data.clientId})`);
  // Add client to active chats list in UI
});
```

---

### 2. `incomingMessage` - Message from Client

**When received:** When any client sends a message

**Payload:**
```javascript
{
  from: string,             // Client's socket ID
  type: 'text' | 'image',   // Message type
  message?: string,         // Text message (if type is 'text')
  image?: string,           // Image data URL (if type is 'image')
  name?: string,            // Filename (for images)
  mimeType?: string,        // MIME type (for images)
  size?: number,            // File size in bytes (for images)
  timestamp: string         // ISO timestamp
}
```

**Example:**
```javascript
socket.on('incomingMessage', (data) => {
  console.log(`Message from client ${data.from}: ${data.message}`);
  // Display message in chat UI for this client
  // Play notification sound
  // Increment unread count
});
```

---

### 3. `clientTyping` - Client Typing Indicator

**When received:** When any client starts or stops typing

**Payload:**
```javascript
{
  from: string,             // Client's socket ID
  isTyping: boolean         // true when typing, false when stopped
}
```

**Example:**
```javascript
socket.on('clientTyping', (data) => {
  if (data.isTyping) {
    console.log(`Client ${data.from} is typing...`);
    // Show typing indicator for this client
  } else {
    // Hide typing indicator
  }
});
```

---

### 4. `chatEnded` - Client Ended Chat

**When received:** When a client ends chat or disconnects

**Payload:**
```javascript
{
  clientId: string,         // Client's socket ID
  reason?: string,          // Optional: 'disconnect' if disconnected
  username?: string         // Optional: Client's username
}
```

**Example:**
```javascript
socket.on('chatEnded', (data) => {
  console.log(`Chat ended with client ${data.clientId}`);
  // Remove client from active chats list
  // Update UI to show client as offline
});
```

---

### 5. `operatorBroadcast` - Another Operator Sent Message

**When received:** When another operator sends a message to a client (for multi-operator coordination)

**Payload:**
```javascript
{
  clientId: string,         // Client's socket ID
  operatorId: number,       // Operator who sent the message
  operatorName: string,     // Operator's name
  type: 'text' | 'image',   // Message type
  message?: string,         // Text message (if type is 'text')
  image?: string,           // Image data URL (if type is 'image')
  name?: string,            // Filename (for images)
  mimeType?: string,        // MIME type (for images)
  timestamp: string         // ISO timestamp
}
```

**Example:**
```javascript
socket.on('operatorBroadcast', (data) => {
  console.log(`${data.operatorName} sent message to client ${data.clientId}`);
  // Display message in chat UI (marked as sent by another operator)
  // Useful for seeing what other operators are telling clients
});
```

---

### 6. `connectedOperatorsList` - List of Connected Operators

**When received:** In response to `getConnectedOperators` event

**Payload:**
```javascript
[
  {
    operatorId: number,     // Operator's ID
    name: string            // Operator's name
  },
  // ... more operators
]
```

**Example:**
```javascript
socket.on('connectedOperatorsList', (operators) => {
  console.log(`${operators.length} operators online`);
  operators.forEach(op => {
    console.log(`- ${op.name} (ID: ${op.operatorId})`);
  });
});
```

---

## Common Events

Events used by both clients and operators.

### 1. `error` - Error Event

**When received:** When an error occurs (validation, rate limit, etc.)

**Payload:**
```javascript
{
  message: string           // Error message
}
```

**Example:**
```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.message);
  // Show error message to user
});
```

---

### 2. `rateLimitExceeded` - Rate Limit Error

**When received:** When client/operator sends too many messages

**Payload:**
```javascript
{
  message: string           // Rate limit message
}
```

**Example:**
```javascript
socket.on('rateLimitExceeded', (data) => {
  console.warn('Rate limit:', data.message);
  // Show "please wait" message to user
});
```

---

### 3. `disconnect` - Connection Lost

**When received:** When socket disconnects from server

**Payload:** None (standard Socket.IO event)

**Example:**
```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // Show "connection lost" message
  // Attempt reconnection
});
```

---

### 4. `connect` - Connection Established

**When received:** When socket successfully connects to server

**Payload:** None (standard Socket.IO event)

**Example:**
```javascript
socket.on('connect', () => {
  console.log('Connected:', socket.id);
  // Emit 'join' event to identify as client or operator
});
```

---

## Error Handling

### Rate Limiting

- **Default Limit:** 100 messages per 60 seconds
- **Can be disabled:** Set `RATE_LIMIT_ENABLED=false` in `.env`
- **Event:** `rateLimitExceeded`

### Validation Errors

Common validation errors and their messages:

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid role" | Role is not 'client' or 'operator' | Use correct role |
| "Invalid message type" | Type is not 'text' or 'image' | Use 'text' or 'image' |
| "Message cannot be empty" | Text message is empty | Send non-empty message |
| "Invalid image type" | Image MIME type not allowed | Use JPEG, PNG, GIF, or WebP |
| "Image too large" | Image exceeds 10MB | Compress or resize image |
| "Cliente no encontrado" | Target client doesn't exist | Check client is still connected |

---

## Testing Examples

### Test Client Connection

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:8080', {
  path: '/chat',
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);

  // Join as client
  socket.emit('join', {
    role: 'client',
    name: 'Test Client',
    username: 'test123',
    phone: '+1234567890'
  });

  // Send test message
  setTimeout(() => {
    socket.emit('clientMessage', {
      type: 'text',
      message: 'Hello from test client!',
      timestamp: new Date().toISOString()
    });
  }, 2000);
});

socket.on('operatorMessage', (data) => {
  console.log('📨 Received from operator:', data);
});

socket.on('operatorTyping', (data) => {
  console.log('⌨️ Operator typing:', data.isTyping);
});

socket.on('chatEnded', (data) => {
  console.log('🔚 Chat ended:', data);
});

socket.on('error', (data) => {
  console.error('❌ Error:', data);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected');
});
```

### Test Operator Connection

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:8080', {
  path: '/chat',
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);

  // Join as operator
  socket.emit('join', {
    role: 'operator',
    name: 'Test Operator',
    operatorId: 1
  });

  // Get connected operators
  socket.emit('getConnectedOperators');
});

socket.on('newChat', (data) => {
  console.log('👤 New client:', data);
});

socket.on('incomingMessage', (data) => {
  console.log('📨 Message from client:', data);

  // Auto-reply
  socket.emit('operatorMessage', {
    to: data.from,
    type: 'text',
    message: 'Thank you for your message!',
    operatorId: 1,
    operatorName: 'Test Operator'
  });
});

socket.on('clientTyping', (data) => {
  console.log('⌨️ Client typing:', data);
});

socket.on('operatorBroadcast', (data) => {
  console.log('📢 Another operator sent:', data);
});

socket.on('connectedOperatorsList', (operators) => {
  console.log('👥 Connected operators:', operators);
});

socket.on('chatEnded', (data) => {
  console.log('🔚 Chat ended:', data);
});
```

---

## HTTP Endpoints

### Health Check

**URL:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "metrics": {
    "totalConnections": 10,
    "activeClients": 3,
    "activeOperators": 2,
    "messagesProcessed": 45,
    "startTime": "2025-11-29T00:00:00.000Z",
    "currentClients": 3,
    "currentOperators": 2
  },
  "timestamp": "2025-11-29T01:23:45.678Z"
}
```

### Statistics

**URL:** `GET /stats`

**Response:**
```json
{
  "timestamp": "2025-11-29T01:23:45.678Z",
  "summary": {
    "totalConnections": 10,
    "totalClients": 3,
    "totalOperators": 2
  },
  "clients": [
    {
      "socketId": "abc123",
      "name": "John Doe",
      "username": "john123",
      "connectedAt": "2025-11-29T01:00:00.000Z"
    }
  ],
  "operators": [
    {
      "socketId": "xyz789",
      "name": "Agent Smith",
      "operatorId": 42,
      "connectedAt": "2025-11-29T00:30:00.000Z"
    }
  ]
}
```

---

## Best Practices

1. **Always handle the `connect` event** before emitting any events
2. **Always emit `join` immediately** after connecting
3. **Handle reconnection** by re-emitting the `join` event
4. **Store client/operator info** in state after successful join
5. **Show typing indicators** with a debounce (e.g., 500ms after typing stops)
6. **Validate data** before sending to prevent errors
7. **Handle all error events** to provide good UX
8. **Clean up listeners** when unmounting components (React/Vue)
9. **Use timestamps** from server to ensure message ordering
10. **Test with multiple tabs** to simulate multi-operator scenarios

---

## Common Pitfalls

1. ❌ **Sending messages before joining**
   - ✅ Always emit `join` first, then wait for confirmation

2. ❌ **Not handling disconnect/reconnect**
   - ✅ Re-join on reconnect and restore state

3. ❌ **Assuming message delivery**
   - ✅ Implement acknowledgments for critical operations

4. ❌ **Not cleaning up event listeners**
   - ✅ Remove listeners on component unmount

5. ❌ **Sending base64 images without compression**
   - ✅ Compress images before converting to base64

6. ❌ **Not handling rate limits**
   - ✅ Show user-friendly message when rate limited

7. ❌ **Hardcoding socket URLs**
   - ✅ Use environment variables for URLs and paths

---

## Summary

This backend implementation provides:

✅ Real-time bidirectional communication
✅ Multi-operator support with message broadcasting
✅ Rate limiting and security features
✅ Message validation and sanitization
✅ Typing indicators
✅ Graceful connection handling
✅ Comprehensive error handling
✅ Health check and statistics endpoints

**Remember:** This backend handles real-time message routing only. Your frontend (CRM) is responsible for persisting messages to the database.
