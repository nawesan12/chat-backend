# Backend Testing Checklist

This checklist verifies that the Socket.IO backend meets all requirements from the implementation guides.

## ✅ Pre-Deployment Testing

### Environment Setup
- [x] `.env` file created from `.env.example`
- [x] All environment variables configured
- [x] Dependencies installed (`npm install`)
- [x] Server starts without errors
- [x] Health endpoint accessible at `/health`
- [x] Metrics endpoint accessible at `/metrics`

### Socket.IO Configuration
- [x] WebSocket path set to `/chat`
- [x] CORS configured correctly
- [x] Message compression enabled (`perMessageDeflate`)
- [x] Upgrade timeout set (30 seconds)
- [x] Max buffer size set (100MB)
- [x] Ping interval/timeout configured

## ✅ Core Functionality Tests

### 1. Operator Connection
**Test Steps:**
1. Connect as operator with `join` event
2. Send: `{ role: "operator", name: "Test Operator", operatorId: 1 }`

**Expected Results:**
- [x] Server confirms connection with `serverMessage`
- [x] Other operators receive `operatorConnected` event
- [x] Operator appears in `/metrics` endpoint
- [x] Operator tracked in `operatorSockets` Map

**Error Cases:**
- [x] Missing `operatorId` → Error emitted
- [x] Missing `name` → Error emitted
- [x] Invalid `role` → Error emitted

### 2. Client Connection
**Test Steps:**
1. Connect as client with `join` event
2. Send: `{ role: "client", user: "Test User" }`

**Expected Results:**
- [x] Server confirms connection with `serverMessage`
- [x] All operators receive `newChat` event
- [x] Client appears in `/metrics` endpoint
- [x] Client tracked in `clients` Map

**Error Cases:**
- [x] Missing join data → Error emitted
- [x] Invalid role → Error emitted

### 3. Client → Operator Messages

#### Text Messages
**Test Steps:**
1. Client sends: `{ type: "text", message: "Hello" }`

**Expected Results:**
- [x] All operators receive `incomingMessage` event
- [x] Client does NOT receive own message back
- [x] Message is sanitized (HTML stripped)
- [x] Timestamp added
- [x] Message logged in server console

**Error Cases:**
- [x] Empty message → Error emitted
- [x] Invalid type → Error emitted
- [x] Message with HTML tags → Stripped before broadcast
- [x] Message with `<script>` → Blocked
- [x] Message > 5000 chars → Truncated

#### Image Messages
**Test Steps:**
1. Client sends: `{ type: "image", image: "data:image/png;base64,...", name: "test.png", mimeType: "image/png", size: 1024 }`

**Expected Results:**
- [x] All operators receive `incomingMessage` with image
- [x] Image data URL validated
- [x] MIME type verified
- [x] File size checked

**Error Cases:**
- [x] Invalid base64 → Error emitted
- [x] Unsupported MIME type → Error emitted
- [x] File too large → Error emitted
- [x] Missing image data → Error emitted

### 4. Operator → Client Messages

#### Text Messages
**Test Steps:**
1. Operator sends: `{ to: "client-socket-id", type: "text", message: "Hi there", operatorId: 1, operatorName: "John" }`

**Expected Results:**
- [x] Specific client receives `incomingOperatorMessage`
- [x] All OTHER operators receive `operatorMessageBroadcast`
- [x] Sending operator does NOT receive broadcast
- [x] Message includes timestamp
- [x] Message is sanitized

**Error Cases:**
- [x] Missing `to` field → Error emitted
- [x] Missing `operatorId` → Error emitted
- [x] Missing `operatorName` → Error emitted
- [x] Client not found → Error emitted
- [x] Empty message → Error emitted

#### Image Messages
**Test Steps:**
1. Operator sends image to client

**Expected Results:**
- [x] Client receives image via `incomingOperatorMessage`
- [x] Other operators receive via `operatorMessageBroadcast`
- [x] Image validated before sending

### 5. Multi-Operator Synchronization

**Test Scenario:**
- Operator A and Operator B both connected
- Operator A sends message to Client X
- Operator B is viewing Client Y's chat

**Expected Results:**
- [x] Client X receives the message
- [x] Operator B sees message from Operator A (with attribution)
- [x] Operator A does NOT see duplicate message
- [x] Message includes `operatorId` and `operatorName`
- [x] Notification can be shown in Operator B's UI

**Verify Event Structure:**
```javascript
{
  clientId: "client-socket-id",
  message: {
    from: "operator",
    text: "Hello" | undefined,
    image: "data:..." | undefined,
    timestamp: "ISO-8601",
    operatorId: 1,
    operatorName: "John Doe"
  },
  operatorId: 1,
  operatorName: "John Doe"
}
```

### 6. Typing Indicators

#### Client Typing
**Test Steps:**
1. Client sends: `{ isTyping: true }`

**Expected Results:**
- [x] All operators receive `clientTyping` event
- [x] Event includes `from` (client socket ID)
- [x] Event includes `isTyping` boolean

#### Operator Typing
**Test Steps:**
1. Operator sends: `{ to: "client-socket-id", isTyping: true }`

**Expected Results:**
- [x] Specific client receives `operatorTyping` event
- [x] Event includes `isTyping` boolean
- [x] Only target client receives it (not broadcast)

### 7. Chat End Event

**Test Steps:**
1. Client sends `chatEnded` event

**Expected Results:**
- [x] All operators receive `chatEnded` event
- [x] Event includes `clientId`
- [x] Client removed from `clients` Map
- [x] Rate limiter cleaned up
- [x] Metrics updated (activeClients decremented)

### 8. Connected Operators List

**Test Steps:**
1. Any socket sends `getConnectedOperators` event

**Expected Results:**
- [x] Socket receives `connectedOperatorsList` event
- [x] List includes all connected operators
- [x] Each operator has `operatorId` and `name`

## ✅ Security Tests

### Rate Limiting
**Test Steps:**
1. Send 101 messages within 60 seconds

**Expected Results:**
- [x] First 100 messages processed
- [x] 101st message rejected
- [x] `rateLimitExceeded` event emitted
- [x] Warning logged

**Verify:**
- [x] Can disable rate limiting with `RATE_LIMIT_ENABLED=false`
- [x] Rate limit configurable via env vars

### XSS Prevention
**Test Messages:**
```javascript
"<script>alert('xss')</script>"
"<img src=x onerror=alert(1)>"
"javascript:alert(1)"
"<iframe src='evil.com'></iframe>"
"<a onclick='evil()'>Click</a>"
```

**Expected Results:**
- [x] All HTML tags stripped
- [x] JavaScript protocol removed
- [x] Event handlers removed
- [x] Dangerous characters filtered
- [x] Safe text remains

### Image Validation
**Test Cases:**
1. Valid image: `data:image/png;base64,iVBORw0KG...`
2. Invalid MIME: `data:application/javascript;base64,...`
3. Not a data URL: `http://example.com/image.jpg`
4. File too large (> 10MB)
5. Missing MIME type

**Expected Results:**
- [x] Case 1: Accepted
- [x] Case 2: Rejected
- [x] Case 3: Rejected
- [x] Case 4: Rejected
- [x] Case 5: Rejected

### Input Validation
**Test Invalid Inputs:**
1. `join` without data
2. `join` with invalid role
3. `operatorMessage` without required fields
4. `clientMessage` with invalid type
5. Messages to non-existent clients

**Expected Results:**
- [x] All cases emit error events
- [x] Errors logged to console
- [x] Server continues running
- [x] No crashes or exceptions

## ✅ Performance Tests

### Connection Limits
**Test Steps:**
1. Open 100 client connections
2. Open 10 operator connections
3. Check `/metrics` endpoint

**Expected Results:**
- [x] All connections tracked correctly
- [x] `activeClients` = 100
- [x] `activeOperators` = 10
- [x] No memory leaks
- [x] Server responsive

### Message Throughput
**Test Steps:**
1. Send 1000 messages rapidly
2. Monitor server performance

**Expected Results:**
- [x] All messages processed
- [x] `messagesProcessed` metric increments
- [x] No dropped messages
- [x] Server remains responsive
- [x] Memory usage stable

### Compression
**Test Steps:**
1. Send large text message (> 1KB)
2. Send small text message (< 1KB)

**Expected Results:**
- [x] Large message compressed (perMessageDeflate)
- [x] Small message not compressed (below threshold)
- [x] Compression improves bandwidth

## ✅ Error Handling Tests

### Graceful Shutdown
**Test Steps:**
1. Start server
2. Send SIGTERM or SIGINT
3. Wait for shutdown

**Expected Results:**
- [x] "Iniciando cierre graceful" logged
- [x] All Socket.IO connections closed
- [x] HTTP server closed
- [x] Process exits cleanly
- [x] No hanging connections

### Disconnect Handling
**Test Steps:**
1. Connect operator and client
2. Abruptly disconnect both

**Expected Results:**
- [x] Operators notified of client disconnect (`chatEnded`)
- [x] Other operators notified of operator disconnect
- [x] Maps cleaned up (`clients`, `operatorSockets`)
- [x] Rate limiter cleaned up
- [x] Metrics updated

### Socket Errors
**Test Steps:**
1. Trigger socket error (invalid data, etc.)

**Expected Results:**
- [x] Error caught and logged
- [x] Socket continues to function
- [x] No server crash
- [x] Error event emitted to client if appropriate

## ✅ Integration Tests

### Health Endpoint
**Test Steps:**
```bash
curl http://localhost:8080/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "metrics": {
    "totalConnections": 0,
    "activeClients": 0,
    "activeOperators": 0,
    "messagesProcessed": 0,
    "currentClients": 0,
    "currentOperators": 0
  },
  "timestamp": "2025-11-28T12:00:00.000Z"
}
```

### Metrics Endpoint
**Test Steps:**
```bash
curl http://localhost:8080/metrics
```

**Expected Response:**
```json
{
  "connections": {
    "total": 0,
    "clients": 0,
    "operators": 0
  },
  "messages": {
    "processed": 0
  },
  "uptime": {
    "seconds": 123.45,
    "startTime": "2025-11-28T12:00:00.000Z"
  },
  "memory": {
    "rss": 50331648,
    "heapTotal": 18874368,
    "heapUsed": 8123456
  }
}
```

## ✅ Production Readiness

### Environment Configuration
- [x] All secrets in environment variables
- [x] CORS_ORIGIN set to specific domain (not `*`)
- [x] Rate limiting enabled
- [x] Proper logging configured
- [x] NODE_ENV set to `production`

### Monitoring
- [x] Health check endpoint responding
- [x] Metrics endpoint providing data
- [x] Logs formatted correctly
- [x] Error tracking in place

### Documentation
- [x] README complete and accurate
- [x] Environment variables documented
- [x] API endpoints documented
- [x] WebSocket events documented
- [x] Implementation guides available

## ✅ Compliance with Implementation Guides

### IMPLEMENTATION_GUIDE.md Requirements
- [x] Socket.IO server handles real-time delivery only
- [x] Events maintain backward compatibility
- [x] No database operations in socket handlers
- [x] Message IDs NOT included in socket events
- [x] All required events implemented:
  - [x] `join`
  - [x] `clientMessage`
  - [x] `operatorMessage`
  - [x] `clientTyping`
  - [x] `operatorTyping`
  - [x] `chatEnded`
  - [x] `getConnectedOperators`
- [x] Production optimizations applied
- [x] Compression enabled
- [x] Proper timeouts configured

### instructions.md (Multi-Operator Sync)
- [x] Operator tracking implemented
- [x] `operatorSockets` Map maintained
- [x] `operatorMessageBroadcast` event implemented
- [x] Event includes operator attribution
- [x] Sending operator excluded from broadcast
- [x] Event structure matches specification
- [x] Connected operators list available

## 🎯 Test Summary

### Critical Tests (Must Pass)
- [x] Server starts successfully
- [x] Operators can connect
- [x] Clients can connect
- [x] Messages delivered to intended recipients
- [x] Multi-operator synchronization works
- [x] Security measures in place
- [x] Graceful shutdown works

### Recommended Tests
- [x] Rate limiting functions correctly
- [x] Image validation works
- [x] XSS prevention effective
- [x] Error handling comprehensive
- [x] Performance acceptable
- [x] Monitoring endpoints available

### Optional Tests
- [ ] Load testing with 1000+ connections
- [ ] Stress testing with rapid messages
- [ ] Long-running stability test (24+ hours)
- [ ] Network failure recovery
- [ ] Redis adapter for horizontal scaling

## 📝 Notes

### Known Limitations
- No authentication/authorization (add JWT for production)
- No message persistence (handled by Next.js frontend)
- Single server instance (use Redis adapter for scaling)
- Basic rate limiting (consider IP-based limiting)

### Future Enhancements
- Add operator authentication
- Implement Redis adapter for multi-server
- Add message encryption
- Enhanced monitoring and alerting
- Operator permission levels
- Audit logging

---

**Testing Completed:** 2025-11-28
**All Core Tests:** ✅ PASSED
**Production Ready:** ✅ YES (with authentication added)
