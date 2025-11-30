import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true,
  }),
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: process.env.SOCKET_PATH || "/chat",
  transports: ["websocket", "polling"],
  pingInterval: parseInt(process.env.PING_INTERVAL) || 25000,
  pingTimeout: parseInt(process.env.PING_TIMEOUT) || 60000,
  upgradeTimeout: parseInt(process.env.UPGRADE_TIMEOUT) || 30000,
  maxHttpBufferSize: parseInt(process.env.MAX_BUFFER_SIZE) || 100 * 1024 * 1024, // 100MB for images
  // Enable compression for production performance
  perMessageDeflate: {
    threshold: 1024, // Only compress messages larger than 1KB
  },
  // Connection options
  allowEIO3: true, // Allow Engine.IO v3 clients
});

// Data stores
const clients = new Map();
const operatorSockets = new Map();
const messageRateLimiter = new Map();
const pendingMessages = new Map(); // clientId -> array of pending messages
const connectionMetrics = {
  totalConnections: 0,
  activeClients: 0,
  activeOperators: 0,
  messagesProcessed: 0,
  startTime: new Date(),
};

// Operator status enum
const OperatorStatus = {
  ONLINE: "online",
  AWAY: "away",
  BUSY: "busy",
  OFFLINE: "offline",
};

// Helper: Check rate limit (configurable via env)
function checkRateLimit(socketId) {
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";
  if (!rateLimitEnabled) return true;

  const maxMessages = parseInt(process.env.RATE_LIMIT_MAX_MESSAGES) || 100;
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;

  const now = Date.now();
  const limit = messageRateLimiter.get(socketId) || {
    count: 0,
    resetTime: now + windowMs,
  };

  if (now > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = now + windowMs;
  }

  if (limit.count >= maxMessages) {
    return false;
  }

  limit.count++;
  messageRateLimiter.set(socketId, limit);
  return true;
}

// Helper: Sanitize message (prevent XSS and injection attacks)
function sanitizeMessage(message) {
  if (typeof message !== "string") return "";

  // Remove HTML tags, scripts, and potentially dangerous characters
  return message
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, "") // Remove event handlers like onclick=
    .replace(/[<>'"]/g, "") // Remove dangerous characters
    .substring(0, 5000) // Limit length
    .trim();
}

// Helper: Validate image data
function validateImageData(data) {
  if (!data.image || typeof data.image !== "string") {
    return { valid: false, error: "Invalid image data" };
  }

  // Check if it's a valid base64 data URL
  if (!data.image.startsWith("data:image/")) {
    return { valid: false, error: "Image must be a data URL" };
  }

  // Validate MIME type
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!data.mimeType || !allowedMimeTypes.includes(data.mimeType.toLowerCase())) {
    return { valid: false, error: "Invalid image type. Allowed: JPEG, PNG, GIF, WebP" };
  }

  // Check file size (limit to 10MB)
  const maxSize = parseInt(process.env.MAX_IMAGE_SIZE) || 10 * 1024 * 1024;
  if (data.size && data.size > maxSize) {
    return { valid: false, error: `Image too large. Max size: ${maxSize / 1024 / 1024}MB` };
  }

  return { valid: true };
}

// Helper: Log with timestamp
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌",
    debug: "🔍",
  }[level] || "📝";
  console.log(`[${timestamp}] ${prefix}`, ...args);
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    metrics: {
      ...connectionMetrics,
      currentClients: clients.size,
      currentOperators: operatorSockets.size,
    },
    timestamp: new Date().toISOString(),
  });
});

// Stats endpoint (matching instruction.md)
app.get("/stats", (req, res) => {
  const clientList = Array.from(clients.entries()).map(([id, conn]) => ({
    socketId: id,
    name: conn.username,
    username: conn.username,
    connectedAt: conn.connectedAt,
  }));

  const operatorList = Array.from(operatorSockets.entries()).map(([id, conn]) => ({
    socketId: id,
    name: conn.name,
    operatorId: conn.operatorId,
    connectedAt: conn.connectedAt || new Date().toISOString(),
  }));

  res.json({
    timestamp: new Date().toISOString(),
    summary: {
      totalConnections: connectionMetrics.totalConnections,
      totalClients: clientList.length,
      totalOperators: operatorList.length,
    },
    clients: clientList,
    operators: operatorList,
  });
});

// Additional metrics endpoint (keeping for backwards compatibility)
app.get("/metrics", (req, res) => {
  res.json({
    connections: {
      total: connectionMetrics.totalConnections,
      clients: clients.size,
      operators: operatorSockets.size,
    },
    messages: {
      processed: connectionMetrics.messagesProcessed,
    },
    uptime: {
      seconds: process.uptime(),
      startTime: connectionMetrics.startTime,
    },
    memory: process.memoryUsage(),
  });
});

// WebSocket connection handling
io.on("connection", (socket) => {
  connectionMetrics.totalConnections++;
  log("info", "Nueva conexión:", socket.id);

  // JOIN EVENT - Initial connection for operators and clients
  socket.on("join", (data) => {
    // Validate join data
    if (!data) {
      socket.emit("error", { message: "Join data is required" });
      log("warning", `Join attempted without data: ${socket.id}`);
      return;
    }

    const { role, name, operatorId, user } = data;

    // Validate role
    if (!role || !["operator", "client"].includes(role)) {
      socket.emit("error", { message: "Invalid role. Must be 'operator' or 'client'" });
      log("warning", `Invalid role attempted: ${role} from ${socket.id}`);
      return;
    }

    if (role === "operator") {
      // Validate operator data
      if (!operatorId || !name) {
        socket.emit("error", { message: "Operator must provide operatorId and name" });
        log("warning", `Operator join missing required fields: ${socket.id}`);
        return;
      }

      // Store operator information
      operatorSockets.set(socket.id, {
        socketId: socket.id,
        operatorId: operatorId,
        name: name,
        status: OperatorStatus.ONLINE,
        connectedAt: new Date().toISOString(),
      });

      connectionMetrics.activeOperators++;
      log("success", `Operador conectado: ${name} (ID: ${operatorId})`);

      // Send list of all active clients to this operator (matching instruction.md)
      clients.forEach((client, clientId) => {
        socket.emit("newChat", {
          clientId: clientId,
          username: client.username,
          phone: client.phone,
        });
      });

      log("info", `Sent ${clients.size} active clients to operator ${name}`);
    } else {
      // Client connection
      const username = data.username || user || name || "Anónimo";
      const phone = data.phone;

      clients.set(socket.id, {
        socket,
        username,
        phone,
        connectedAt: new Date().toISOString(),
      });

      connectionMetrics.activeClients++;
      log("success", `Cliente conectado: ${username} (socket: ${socket.id})`);

      // Notify ALL operators about new client (matching instruction.md)
      socket.broadcast.emit("newChat", {
        clientId: socket.id,
        username,
        phone,
      });

      // Send any pending messages to the client
      const pending = pendingMessages.get(socket.id);
      if (pending && pending.length > 0) {
        log("info", `Sending ${pending.length} pending messages to client ${socket.id}`);
        pending.forEach((msg) => {
          socket.emit("operatorMessage", msg);
          // Mark as delivered
          socket.emit("messageDelivered", {
            messageId: msg.messageId,
            timestamp: new Date().toISOString(),
          });
        });
        // Clear pending messages
        pendingMessages.delete(socket.id);
      }
    }
  });

  // CLIENT MESSAGE - Client sends message to operators
  socket.on("clientMessage", (data = {}) => {
    // Rate limiting
    if (!checkRateLimit(socket.id)) {
      socket.emit("rateLimitExceeded", {
        message: "Demasiados mensajes. Por favor, espera un momento.",
      });
      log("warning", "Rate limit excedido para cliente:", socket.id);
      return;
    }

    // Validate message type
    if (!data.type || !["text", "image"].includes(data.type)) {
      socket.emit("error", { message: "Invalid message type" });
      return;
    }

    connectionMetrics.messagesProcessed++;

    if (data.type === "image") {
      // Validate image data
      const validation = validateImageData(data);
      if (!validation.valid) {
        socket.emit("error", { message: validation.error });
        log("warning", `Invalid image from client ${socket.id}: ${validation.error}`);
        return;
      }

      log("info", `Imagen del cliente: ${socket.id} | ${data.name} | ${data.mimeType}`);

      // Broadcast to ALL operators only (not back to the client)
      socket.broadcast.emit("incomingMessage", {
        from: socket.id,
        type: "image",
        image: data.image,
        name: data.name,
        mimeType: data.mimeType,
        size: data.size,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Validate text message
      if (!data.message || typeof data.message !== "string") {
        socket.emit("error", { message: "Invalid text message" });
        return;
      }

      const sanitized = sanitizeMessage(data.message);
      if (!sanitized) {
        socket.emit("error", { message: "Message cannot be empty" });
        return;
      }

      log("info", `Mensaje cliente: ${socket.id} → ${sanitized.substring(0, 50)}...`);

      // Broadcast to ALL operators only (not back to the client)
      socket.broadcast.emit("incomingMessage", {
        from: socket.id,
        type: "text",
        message: sanitized,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // OPERATOR MESSAGE - Operator sends message to client
  socket.on("operatorMessage", (data = {}) => {
    // Rate limiting
    if (!checkRateLimit(socket.id)) {
      socket.emit("rateLimitExceeded", {
        message: "Demasiados mensajes. Por favor, espera un momento.",
      });
      log("warning", "Rate limit excedido para operador:", socket.id);
      return;
    }

    const { to, type, message, image, name, mimeType, size, operatorId, operatorName } = data;

    // Validate required fields
    if (!to || !type || !operatorId || !operatorName) {
      socket.emit("error", { message: "Missing required fields: to, type, operatorId, operatorName" });
      return;
    }

    // Validate message type
    if (!["text", "image"].includes(type)) {
      socket.emit("error", { message: "Invalid message type" });
      return;
    }

    // Check if target client exists (online or offline)
    const targetClient = clients.get(to);
    const isClientOnline = !!targetClient;

    connectionMetrics.messagesProcessed++;

    // Generate unique message ID for delivery tracking
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Get all other operators (excluding sender) - declare once for both branches
    const otherOperators = Array.from(operatorSockets.keys()).filter(id => id !== socket.id);
    const timestamp = new Date().toISOString();

    if (type === "image") {
      // Validate image data
      const validation = validateImageData({ image, mimeType, size });
      if (!validation.valid) {
        socket.emit("error", { message: validation.error });
        log("warning", `Invalid image from operator ${operatorName}: ${validation.error}`);
        return;
      }

      log("info", `Imagen del operador ${operatorName} para: ${to}`);

      const imageMessage = {
        messageId: messageId,
        type: "image",
        image: image,
        name: name,
        mimeType: mimeType,
        operatorName: operatorName,
        operatorId: operatorId,
        timestamp: timestamp,
      };

      // Send to specific client if online, otherwise queue
      if (isClientOnline) {
        io.to(to).emit("operatorMessage", imageMessage);
        log("debug", `Image message ${messageId} sent to online client ${to}`);
      } else {
        // Queue message for offline client
        if (!pendingMessages.has(to)) {
          pendingMessages.set(to, []);
        }
        pendingMessages.get(to).push(imageMessage);
        log("info", `Image message ${messageId} queued for offline client ${to}`);

        // Notify operator that client is offline
        socket.emit("messageQueued", {
          messageId: messageId,
          clientId: to,
          reason: "Client offline - message will be delivered when they reconnect",
        });
      }

      // Broadcast to ALL OTHER operators (excluding sender)
      otherOperators.forEach(opSocketId => {
        io.to(opSocketId).emit("operatorBroadcast", {
          clientId: to,
          operatorId: operatorId,
          operatorName: operatorName,
          type: "image",
          image: image,
          name: name,
          mimeType: mimeType,
          timestamp: timestamp,
        });
      });
    } else {
      // Validate text message
      if (!message || typeof message !== "string") {
        socket.emit("error", { message: "Invalid text message" });
        return;
      }

      const sanitized = sanitizeMessage(message);
      if (!sanitized) {
        socket.emit("error", { message: "Message cannot be empty" });
        return;
      }

      log("info", `Mensaje operador ${operatorName} → ${to}: ${sanitized.substring(0, 50)}...`);

      const textMessage = {
        messageId: messageId,
        type: "text",
        message: sanitized,
        operatorName: operatorName,
        operatorId: operatorId,
        timestamp: timestamp,
      };

      // Send to specific client if online, otherwise queue
      if (isClientOnline) {
        io.to(to).emit("operatorMessage", textMessage);
        log("debug", `Text message ${messageId} sent to online client ${to}`);
      } else {
        // Queue message for offline client
        if (!pendingMessages.has(to)) {
          pendingMessages.set(to, []);
        }
        pendingMessages.get(to).push(textMessage);
        log("info", `Text message ${messageId} queued for offline client ${to}`);

        // Notify operator that client is offline
        socket.emit("messageQueued", {
          messageId: messageId,
          clientId: to,
          reason: "Client offline - message will be delivered when they reconnect",
        });
      }

      // Broadcast to ALL OTHER operators (excluding sender)
      otherOperators.forEach(opSocketId => {
        io.to(opSocketId).emit("operatorBroadcast", {
          clientId: to,
          operatorId: operatorId,
          operatorName: operatorName,
          type: "text",
          message: sanitized,
          timestamp: timestamp,
        });
      });
    }

    // Confirm message sent to the sender
    socket.emit("messageSent", {
      messageId: messageId,
      clientId: to,
      timestamp: timestamp,
      queued: !isClientOnline,
    });

    log("debug", `Mensaje de ${operatorName} transmitido a ${otherOperators.length} otros operadores`);
  });

  // OPERATOR TYPING INDICATOR
  socket.on("operatorTyping", (data) => {
    const operator = operatorSockets.get(socket.id);

    if (data?.to && operator) {
      // Send to client with operator name
      io.to(data.to).emit("operatorTyping", {
        isTyping: data.isTyping || false,
        operatorName: operator.name,
        operatorId: operator.operatorId,
      });
    }
  });

  // CLIENT TYPING INDICATOR
  socket.on("clientTyping", (data) => {
    socket.broadcast.emit("clientTyping", {
      from: socket.id,
      isTyping: data?.isTyping || false,
    });
  });

  // MESSAGE DELIVERY ACKNOWLEDGMENT - Client confirms message received
  socket.on("messageReceived", (data) => {
    const { messageId } = data;
    if (!messageId) return;

    log("debug", `Client ${socket.id} acknowledged receipt of message ${messageId}`);

    // Notify all operators that message was delivered
    const operatorSocketIds = Array.from(operatorSockets.keys());
    operatorSocketIds.forEach(opSocketId => {
      io.to(opSocketId).emit("messageDelivered", {
        messageId: messageId,
        clientId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // MESSAGE READ - Client confirms message has been read/viewed
  socket.on("messageRead", (data) => {
    const { messageId } = data;
    if (!messageId) return;

    log("debug", `Client ${socket.id} marked message as read: ${messageId}`);

    // Notify all operators that message was read
    const operatorSocketIds = Array.from(operatorSockets.keys());
    operatorSocketIds.forEach(opSocketId => {
      io.to(opSocketId).emit("messageRead", {
        messageId: messageId,
        clientId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // GET CONNECTED OPERATORS - List all currently connected operators
  socket.on("getConnectedOperators", () => {
    const operators = Array.from(operatorSockets.values()).map((op) => ({
      operatorId: op.operatorId,
      name: op.name,
      status: op.status,
    }));

    socket.emit("connectedOperatorsList", operators);
    log("debug", `Operator list sent to ${socket.id}: ${operators.length} operators online`);
  });

  // OPERATOR STATUS CHANGE - Operator updates their availability status
  socket.on("operatorStatusChange", (data) => {
    const operator = operatorSockets.get(socket.id);
    if (!operator) {
      socket.emit("error", { message: "Only operators can change status" });
      return;
    }

    const { status } = data;
    const validStatuses = Object.values(OperatorStatus);

    if (!status || !validStatuses.includes(status)) {
      socket.emit("error", {
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
      return;
    }

    // Update operator status
    operator.status = status;
    operatorSockets.set(socket.id, operator);

    log("info", `Operator ${operator.name} changed status to: ${status}`);

    // Broadcast status change to all clients
    socket.broadcast.emit("operatorStatusChanged", {
      operatorId: operator.operatorId,
      operatorName: operator.name,
      status: status,
    });

    // Also broadcast to other operators
    const operatorSocketIds = Array.from(operatorSockets.keys()).filter(id => id !== socket.id);
    operatorSocketIds.forEach(opSocketId => {
      io.to(opSocketId).emit("operatorStatusChanged", {
        operatorId: operator.operatorId,
        operatorName: operator.name,
        status: status,
      });
    });
  });

  // END CHAT - Either party can end the conversation (matching instruction.md)
  socket.on("endChat", (data = {}) => {
    const user = operatorSockets.get(socket.id) || clients.get(socket.id);
    if (!user) return;

    const isOperator = operatorSockets.has(socket.id);
    const clientId = isOperator ? data.clientId : socket.id;

    if (!clientId) return;

    log("info", `Chat ended by ${isOperator ? 'operator' : 'client'}: ${clientId}`);

    // Notify all operators
    const operatorSocketIds = Array.from(operatorSockets.keys());
    operatorSocketIds.forEach(opSocketId => {
      io.to(opSocketId).emit("chatEnded", { clientId });
    });

    // If operator initiated, notify the client
    if (isOperator) {
      io.to(clientId).emit("chatEnded", {
        message: "El operador ha finalizado la conversación"
      });
    }
  });

  // DISCONNECT (matching instruction.md)
  socket.on("disconnect", (reason) => {
    const operator = operatorSockets.get(socket.id);

    if (operator) {
      log("info", `Operador desconectado: ${operator.name} (Razón: ${reason})`);
      connectionMetrics.activeOperators = Math.max(0, connectionMetrics.activeOperators - 1);
      operatorSockets.delete(socket.id);
    } else if (clients.has(socket.id)) {
      const client = clients.get(socket.id);
      log("info", `Cliente desconectado: ${client?.username} (Razón: ${reason})`);
      connectionMetrics.activeClients = Math.max(0, connectionMetrics.activeClients - 1);
      clients.delete(socket.id);

      // Notify all operators that this client disconnected (matching instruction.md)
      const operatorSocketIds = Array.from(operatorSockets.keys());
      operatorSocketIds.forEach(opSocketId => {
        io.to(opSocketId).emit("chatEnded", {
          clientId: socket.id,
          reason: "disconnect"
        });
      });
    }

    messageRateLimiter.delete(socket.id);
  });

  // ERROR HANDLING
  socket.on("error", (err) => {
    log("error", "Socket error en", socket.id, ":", err.message);
  });
});

// Graceful shutdown
const shutdown = () => {
  log("info", "Iniciando cierre graceful del servidor...");

  io.close(() => {
    log("success", "Todas las conexiones de Socket.IO cerradas");
  });

  server.close(() => {
    log("success", "Servidor HTTP cerrado");
    process.exit(0);
  });

  setTimeout(() => {
    log("error", "Forzando cierre después del timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  log("success", `Socket.IO server running on port ${PORT}`);
  log("info", `WebSocket path: ${process.env.SOCKET_PATH || "/chat"}`);
  log("info", `Environment: ${process.env.NODE_ENV || "development"}`);
});
