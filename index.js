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
      socket.emit("serverMessage", { message: "Conectado como operador ✅" });
    } else {
      clients.set(socket.id, { socket, username: data.user || "Anon" });
      console.log(`🙋 Cliente conectado: ${data.user}`);
      socket.emit("serverMessage", {
        message: "¡Bienvenido al chat de Ganamos!",
      });

      // notify operators of new chat
      io.emit("newChat", {
        clientId: socket.id,
        username: data.user,
      });
    }
  });

  socket.on("clientMessage", (data) => {
    console.log("💬 Mensaje cliente:", data.message);
    // broadcast to all operators
    for (const [_, op] of operators) {
      op.socket.emit("incomingMessage", {
        from: socket.id,
        message: data.message,
      });
    }
  });

  socket.on("operatorMessage", (data) => {
    const target = clients.get(data.to);
    if (target) {
      target.socket.emit("serverMessage", {
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
