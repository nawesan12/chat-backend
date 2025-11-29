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
  maxHttpBufferSize: parseInt(process.env.MAX_BUFFER_SIZE) || 10 * 1024 * 1024,
});

// Data stores
const clients = new Map();
const operatorSockets = new Map();
const messageRateLimiter = new Map();
const connectionMetrics = {
  totalConnections: 0,
  activeClients: 0,
  activeOperators: 0,
  messagesProcessed: 0,
  startTime: new Date(),
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

// Helper: Sanitize message
function sanitizeMessage(message) {
  if (typeof message !== "string") return "";
  return message
    .replace(/[<>]/g, "")
    .substring(0, 5000)
    .trim();
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

// Metrics endpoint
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

  // JOIN EVENT
  socket.on("join", (data) => {
    const { role, name, operatorId, user } = data || {};

    if (role === "operator") {
      operatorSockets.set(socket.id, {
        socketId: socket.id,
        operatorId: operatorId,
        name: name || "Operador",
      });

      connectionMetrics.activeOperators++;
      log("success", `Operador conectado: ${name || "Operador"} (ID: ${operatorId})`);

      socket.emit("serverMessage", {
        type: "text",
        message: "Conectado como operador",
      });

      socket.broadcast.emit("operatorConnected", {
        operatorId: operatorId,
        name: name || "Operador",
      });
    } else {
      const username = user || "Anon";
      clients.set(socket.id, {
        socket,
        username,
        connectedAt: new Date().toISOString(),
      });

      connectionMetrics.activeClients++;
      log("success", `Cliente conectado: ${username} (socket: ${socket.id})`);

      socket.emit("serverMessage", {
        type: "text",
        message: "Bienvenido al chat",
      });

      socket.broadcast.emit("newChat", {
        clientId: socket.id,
        username,
      });
    }
  });

  // CLIENT MESSAGE
  socket.on("clientMessage", (data = {}) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit("rateLimitExceeded", {
        message: "Demasiados mensajes. Por favor, espera un momento.",
      });
      log("warning", "Rate limit excedido para cliente:", socket.id);
      return;
    }

    connectionMetrics.messagesProcessed++;

    if (data.type === "image" && data.image) {
      log("info", `Imagen del cliente: ${socket.id} | ${data.name} | ${data.mimeType}`);

      io.emit("incomingMessage", {
        from: socket.id,
        type: "image",
        image: data.image,
        name: data.name,
        mimeType: data.mimeType,
        size: data.size,
        timestamp: new Date().toISOString(),
      });
    } else {
      const sanitized = sanitizeMessage(data.message);
      log("info", `Mensaje cliente: ${socket.id} → ${sanitized}`);

      io.emit("incomingMessage", {
        from: socket.id,
        type: "text",
        message: sanitized,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // OPERATOR MESSAGE
  socket.on("operatorMessage", (data = {}) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit("rateLimitExceeded", {
        message: "Demasiados mensajes. Por favor, espera un momento.",
      });
      log("warning", "Rate limit excedido para operador:", socket.id);
      return;
    }

    const { to, type, message, image, name, mimeType, size, operatorId, operatorName } = data;

    const targetClient = clients.get(to);
    if (!targetClient) {
      log("warning", `Cliente no encontrado: ${to}`);
      socket.emit("error", { message: "Cliente no encontrado" });
      return;
    }

    connectionMetrics.messagesProcessed++;

    if (type === "image" && image) {
      log("info", `Imagen del operador ${operatorName} para: ${to}`);

      io.to(to).emit("incomingOperatorMessage", {
        from: socket.id,
        type: "image",
        image: image,
        name: name,
        mimeType: mimeType,
        timestamp: new Date().toISOString(),
      });
    } else {
      const sanitized = sanitizeMessage(message);
      log("info", `Mensaje operador ${operatorName} → ${to}: ${sanitized}`);

      io.to(to).emit("incomingOperatorMessage", {
        from: socket.id,
        type: "text",
        message: sanitized,
        timestamp: new Date().toISOString(),
      });
    }

    const messageForOperators = {
      from: "operator",
      text: type === "text" ? sanitizeMessage(message) : undefined,
      image: type === "image" ? image : undefined,
      mimeType: type === "image" ? mimeType : undefined,
      name: type === "image" ? name : undefined,
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

    log("debug", `Mensaje de ${operatorName} transmitido a otros operadores`);
  });

  // OPERATOR TYPING INDICATOR
  socket.on("operatorTyping", (data) => {
    if (data?.to) {
      io.to(data.to).emit("operatorTyping", {
        isTyping: data.isTyping || false,
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

  // GET CONNECTED OPERATORS
  socket.on("getConnectedOperators", () => {
    const operators = Array.from(operatorSockets.values()).map((op) => ({
      operatorId: op.operatorId,
      name: op.name,
    }));

    socket.emit("connectedOperatorsList", operators);
  });

  // DISCONNECT
  socket.on("disconnect", (reason) => {
    const operator = operatorSockets.get(socket.id);

    if (operator) {
      log("info", `Operador desconectado: ${operator.name} (Razón: ${reason})`);
      connectionMetrics.activeOperators = Math.max(0, connectionMetrics.activeOperators - 1);
      operatorSockets.delete(socket.id);

      socket.broadcast.emit("operatorDisconnected", {
        operatorId: operator.operatorId,
        name: operator.name,
      });
    } else if (clients.has(socket.id)) {
      const client = clients.get(socket.id);
      log("info", `Cliente desconectado: ${client?.username} (Razón: ${reason})`);
      connectionMetrics.activeClients = Math.max(0, connectionMetrics.activeClients - 1);
      clients.delete(socket.id);

      socket.broadcast.emit("chatEnded", {
        clientId: socket.id,
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
