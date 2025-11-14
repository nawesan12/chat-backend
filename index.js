// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

// CORS para API REST (si la usás)
app.use(
  cors({
    origin: "*", // o tu dominio/lading real
    methods: ["GET", "POST"],
  }),
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // o ["https://tu-dominio.com"]
    methods: ["GET", "POST"],
  },
  path: "/chat",
  transports: ["websocket", "polling"],
  // 🔧 Tunear heartbeats para conexiones inestables / hosting
  pingInterval: 25000, // cada 25s manda ping
  pingTimeout: 60000, // espera hasta 60s antes de dar por muerto al cliente

  // 👇 AUMENTAR TAMAÑO MÁXIMO DEL PAYLOAD (por defecto: 1 MB)
  maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB
});

const clients = new Map(); // client.id → { socket, username }
const operators = new Map(); // operator.id → { socket, name }

io.on("connection", (socket) => {
  console.log("🟢 Nueva conexión:", socket.id);

  socket.on("join", (data) => {
    if (data?.role === "operator") {
      // 👨‍💼 Operador
      operators.set(socket.id, { socket, name: data.name || "Operador" });
      console.log(`👨‍💼 Operador conectado: ${data.name || "Operador"}`);

      socket.emit("serverMessage", {
        type: "text",
        message: "Conectado como operador ✅",
      });
    } else {
      // 🙋 Cliente
      const username = data?.user || "Anon";
      clients.set(socket.id, { socket, username });

      console.log(`🙋 Cliente conectado: ${username} (socket: ${socket.id})`);

      socket.emit("serverMessage", {
        type: "text",
        message: "¡Bienvenido al chat de Ganamos!",
      });

      // Notificar a los operadores del nuevo chat
      for (const [, op] of operators) {
        op.socket.emit("newChat", {
          clientId: socket.id,
          username,
        });
      }
    }
  });

  // 👉 Mensaje que viene del CLIENTE (texto o imagen)
  socket.on("clientMessage", (data = {}) => {
    if (data.type === "image" && data.image) {
      console.log(
        "🖼️ Imagen del cliente:",
        socket.id,
        data.name,
        data.mimeType,
        data.size,
        "| base64 length:",
        data.image.length,
      );

      for (const [, op] of operators) {
        op.socket.emit("incomingMessage", {
          from: socket.id,
          type: "image",
          image: data.image,
          name: data.name,
          mimeType: data.mimeType,
          size: data.size,
        });
      }
      return;
    }

    const msg = data.message ?? "";
    console.log("💬 Mensaje cliente:", socket.id, "→", msg);

    for (const [, op] of operators) {
      op.socket.emit("incomingMessage", {
        from: socket.id,
        type: "text",
        message: msg,
      });
    }
  });

  // 👉 Mensaje que viene del OPERADOR (texto o imagen)
  socket.on("operatorMessage", (data = {}) => {
    const target = clients.get(data.to);
    if (!target) {
      console.warn("⚠️ operatorMessage: cliente no encontrado:", data.to);
      return;
    }

    if (data.type === "image" && data.image) {
      console.log(
        "🖼️ Imagen del operador para:",
        data.to,
        data.name,
        data.mimeType,
      );

      target.socket.emit("serverMessage", {
        type: "image",
        image: data.image,
        name: data.name,
        mimeType: data.mimeType,
      });
    } else {
      console.log("💬 Mensaje operador →", data.to, ":", data.message);

      target.socket.emit("serverMessage", {
        type: "text",
        message: data.message,
      });
    }
  });

  // 🧹 Cuando se desconecta alguien
  socket.on("disconnect", (reason) => {
    const wasClient = clients.delete(socket.id);
    const wasOperator = operators.delete(socket.id);

    console.log(
      "🔴 Desconectado:",
      socket.id,
      "| era cliente:",
      wasClient,
      "| era operador:",
      wasOperator,
      "| razón:",
      reason,
    );
  });

  // (Opcional) ver si el servidor recibe errores raros
  socket.on("error", (err) => {
    console.error("⚠️ Socket error en", socket.id, ":", err);
  });
});

// Para Render/Onrender normalmente usás process.env.PORT
const PORT = process.env.PORT || 8080;
server.listen(PORT, () =>
  console.log(`✅ Socket.IO server listening on port ${PORT}`),
);
