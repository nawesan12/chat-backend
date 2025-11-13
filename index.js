// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  path: "/chat",
});

const clients = new Map(); // client.id → { socket, username }
const operators = new Map(); // operator.id → { socket, name }

io.on("connection", (socket) => {
  console.log("🟢 Nueva conexión:", socket.id);

  socket.on("join", (data) => {
    if (data.role === "operator") {
      operators.set(socket.id, { socket, name: data.name || "Operador" });
      console.log(`👨‍💼 Operador conectado: ${data.name}`);
      socket.emit("serverMessage", {
        type: "text",
        message: "Conectado como operador ✅",
      });
    } else {
      clients.set(socket.id, { socket, username: data.user || "Anon" });
      console.log(`🙋 Cliente conectado: ${data.user}`);
      socket.emit("serverMessage", {
        type: "text",
        message: "¡Bienvenido al chat de Ganamos!",
      });

      // Notificar a los operadores del nuevo chat
      for (const [_, op] of operators) {
        op.socket.emit("newChat", {
          clientId: socket.id,
          username: data.user,
        });
      }
    }
  });

  // 👉 Mensaje que viene del CLIENTE (texto o imagen)
  socket.on("clientMessage", (data) => {
    if (data.type === "image" && data.image) {
      console.log(
        "🖼️ Imagen del cliente:",
        socket.id,
        data.name,
        data.mimeType,
        data.size,
      );

      // reenviar a todos los operadores
      for (const [_, op] of operators) {
        op.socket.emit("incomingMessage", {
          from: socket.id,
          type: "image",
          image: data.image, // data URL (data:image/png;base64,...)
          name: data.name,
          mimeType: data.mimeType,
          size: data.size,
        });
      }
    } else {
      const msg = data.message ?? "";
      console.log("💬 Mensaje cliente:", msg);

      for (const [_, op] of operators) {
        op.socket.emit("incomingMessage", {
          from: socket.id,
          type: "text",
          message: msg,
        });
      }
    }
  });

  // 👉 Mensaje que viene del OPERADOR (texto o imagen)
  socket.on("operatorMessage", (data) => {
    const target = clients.get(data.to);
    if (!target) return;

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

  socket.on("disconnect", () => {
    clients.delete(socket.id);
    operators.delete(socket.id);
    console.log("🔴 Desconectado:", socket.id);
  });
});

server.listen(8080, () => console.log("✅ Socket.IO server on port 8080"));
