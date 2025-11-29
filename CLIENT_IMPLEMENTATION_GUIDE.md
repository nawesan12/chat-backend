# Client Chat Widget Implementation Guide

This guide provides complete instructions for implementing the customer-facing chat widget that connects to this backend. This is the interface your **end-users** (customers) will see, not your operators.

## Overview

Build a seamless, real-time chat widget where customers can:
- Send text messages to support operators
- Send images/screenshots
- See typing indicators when operators respond
- Receive instant responses from support team
- Resume conversations on reconnection

## Quick Start

### 1. Install Socket.IO Client

```bash
npm install socket.io-client
# or
yarn add socket.io-client
# or
bun add socket.io-client
```

### 2. Basic Implementation

```javascript
import { io } from "socket.io-client";

// Connect to backend
const socket = io("https://your-backend.com", {
  path: "/chat",
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Join as a client
socket.emit("join", {
  role: "client",
  user: "John Doe", // Customer name or anonymous ID
});

// Listen for operator messages
socket.on("incomingOperatorMessage", (data) => {
  displayMessage({
    text: data.message,
    image: data.image,
    from: "operator",
    timestamp: new Date(),
  });
});

// Send a message
function sendMessage(text) {
  socket.emit("clientMessage", {
    type: "text",
    message: text,
  });

  displayMessage({
    text: text,
    from: "user",
    timestamp: new Date(),
  });
}
```

## Complete Implementation Examples

### Vanilla JavaScript Implementation

```html
<!DOCTYPE html>
<html>
<head>
  <title>Customer Support Chat</title>
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  <style>
    .chat-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .chat-header {
      background: #0066cc;
      color: white;
      padding: 15px;
      border-radius: 10px 10px 0 0;
      font-weight: 600;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      background: #f5f5f5;
    }

    .message {
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
    }

    .message.user {
      align-items: flex-end;
    }

    .message.operator {
      align-items: flex-start;
    }

    .message-bubble {
      max-width: 70%;
      padding: 10px 15px;
      border-radius: 18px;
      word-wrap: break-word;
    }

    .message.user .message-bubble {
      background: #0066cc;
      color: white;
    }

    .message.operator .message-bubble {
      background: white;
      color: #333;
    }

    .message-image {
      max-width: 200px;
      border-radius: 10px;
      cursor: pointer;
    }

    .typing-indicator {
      padding: 10px;
      color: #666;
      font-size: 14px;
      font-style: italic;
    }

    .chat-input-container {
      display: flex;
      padding: 10px;
      border-top: 1px solid #ddd;
      background: white;
      border-radius: 0 0 10px 10px;
    }

    .chat-input {
      flex: 1;
      border: 1px solid #ddd;
      border-radius: 20px;
      padding: 10px 15px;
      outline: none;
      font-size: 14px;
    }

    .send-button {
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      margin-left: 10px;
      cursor: pointer;
      font-size: 18px;
    }

    .send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .image-button {
      background: #f0f0f0;
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      margin-left: 10px;
      cursor: pointer;
      font-size: 18px;
    }

    .connection-status {
      padding: 5px 10px;
      font-size: 12px;
      text-align: center;
      background: #ffc107;
      color: #333;
    }

    .connection-status.connected {
      background: #4caf50;
      color: white;
    }
  </style>
</head>
<body>
  <div class="chat-widget">
    <div class="chat-header">
      Customer Support
      <div id="connectionStatus" class="connection-status">Connecting...</div>
    </div>

    <div id="chatMessages" class="chat-messages"></div>

    <div id="typingIndicator" class="typing-indicator" style="display: none;">
      Operator is typing...
    </div>

    <div class="chat-input-container">
      <input type="file" id="imageInput" accept="image/*" style="display: none;">
      <button class="image-button" onclick="selectImage()">📎</button>
      <input
        type="text"
        id="messageInput"
        class="chat-input"
        placeholder="Type a message..."
        onkeypress="handleKeyPress(event)"
      >
      <button class="send-button" onclick="sendMessage()">➤</button>
    </div>
  </div>

  <script>
    // Configuration
    const BACKEND_URL = "https://your-backend.com";
    const SOCKET_PATH = "/chat";
    const USERNAME = "Customer " + Math.floor(Math.random() * 1000);

    // Initialize Socket.IO
    const socket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // DOM elements
    const messagesContainer = document.getElementById("chatMessages");
    const messageInput = document.getElementById("messageInput");
    const typingIndicator = document.getElementById("typingIndicator");
    const connectionStatus = document.getElementById("connectionStatus");
    const imageInput = document.getElementById("imageInput");

    let isTyping = false;
    let typingTimeout;

    // Socket event handlers
    socket.on("connect", () => {
      console.log("Connected to support chat");
      updateConnectionStatus(true);

      // Join as client
      socket.emit("join", {
        role: "client",
        user: USERNAME,
      });

      displaySystemMessage("Connected to support. An operator will be with you shortly.");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from support chat");
      updateConnectionStatus(false);
      displaySystemMessage("Connection lost. Reconnecting...");
    });

    socket.on("incomingOperatorMessage", (data) => {
      console.log("Operator message:", data);

      if (data.type === "text") {
        displayMessage({
          text: data.message,
          from: "operator",
          timestamp: new Date(),
        });
      } else if (data.type === "image") {
        displayMessage({
          image: data.image,
          imageName: data.name,
          from: "operator",
          timestamp: new Date(),
        });
      }

      // Play notification sound (optional)
      playNotificationSound();
    });

    socket.on("operatorTyping", (data) => {
      if (data.isTyping) {
        typingIndicator.style.display = "block";
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      } else {
        typingIndicator.style.display = "none";
      }
    });

    socket.on("rateLimitExceeded", (data) => {
      displaySystemMessage("⚠️ " + data.message);
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
      displaySystemMessage("An error occurred. Please try again.");
    });

    // Functions
    function updateConnectionStatus(connected) {
      if (connected) {
        connectionStatus.textContent = "Connected";
        connectionStatus.className = "connection-status connected";
      } else {
        connectionStatus.textContent = "Disconnected";
        connectionStatus.className = "connection-status";
      }
    }

    function displayMessage({ text, image, imageName, from, timestamp }) {
      const messageDiv = document.createElement("div");
      messageDiv.className = `message ${from}`;

      const bubbleDiv = document.createElement("div");
      bubbleDiv.className = "message-bubble";

      if (text) {
        bubbleDiv.textContent = text;
      } else if (image) {
        const img = document.createElement("img");
        img.src = image;
        img.alt = imageName || "Image";
        img.className = "message-image";
        img.onclick = () => window.open(image, "_blank");
        bubbleDiv.appendChild(img);
      }

      messageDiv.appendChild(bubbleDiv);
      messagesContainer.appendChild(messageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function displaySystemMessage(text) {
      const messageDiv = document.createElement("div");
      messageDiv.style.textAlign = "center";
      messageDiv.style.color = "#666";
      messageDiv.style.fontSize = "12px";
      messageDiv.style.margin = "10px 0";
      messageDiv.textContent = text;
      messagesContainer.appendChild(messageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function sendMessage() {
      const text = messageInput.value.trim();
      if (!text) return;

      socket.emit("clientMessage", {
        type: "text",
        message: text,
      });

      displayMessage({
        text: text,
        from: "user",
        timestamp: new Date(),
      });

      messageInput.value = "";
      stopTyping();
    }

    function handleKeyPress(event) {
      if (event.key === "Enter") {
        sendMessage();
      } else {
        handleTyping();
      }
    }

    function handleTyping() {
      if (!isTyping) {
        isTyping = true;
        socket.emit("clientTyping", { isTyping: true });
      }

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(stopTyping, 1000);
    }

    function stopTyping() {
      if (isTyping) {
        isTyping = false;
        socket.emit("clientTyping", { isTyping: false });
      }
    }

    function selectImage() {
      imageInput.click();
    }

    imageInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        alert("Image too large. Maximum size is 10MB.");
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }

      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target.result;

        socket.emit("clientMessage", {
          type: "image",
          image: base64Image,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        });

        displayMessage({
          image: base64Image,
          imageName: file.name,
          from: "user",
          timestamp: new Date(),
        });
      };

      reader.readAsDataURL(file);
      imageInput.value = ""; // Reset input
    });

    function playNotificationSound() {
      // Optional: Add notification sound
      const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA8PVqzn77JcGAg+ltrzwG8iBSx+zPLaizsIGGS57OihUBELTKXh8bllHAU2jdXz0H0pBSt6yvHdlUMJE1yw6O6rWBUIQJrb88N0JwYwhM/z24I1BhtwvvDjnUwPD1Kp5O+1YhoFPJLY88p1KgYqeMjw3I9ACRNat+rvqVIVC0aj4PK8aB8FM4nU8tGAMQYebcDv45ZLDwtVq+XwsmAZB0CY2/PAcSQFLYHO8diKOQgZaLvt559NEAxPqOPwtmUcBjiP1/PMeS0GI3fH8N2RQAoVXrTp66hVFApGnuDyvmwhBTGG0fPTgjQGHW7A7eSaRw8PVqvm8LJeGAhAl9vyv24hBS1+zPLaiTsIGGS56+mjTxELTKXh8bllHAU1jdT0z34qBSt6yvDem0QKFFGx5++rWRUIQJrb88N0JwYwg8/y3II0BhtwvO/knEwPD1On4++1YhoFPJLY88t2KwYqd8jw3I9ACRNbtefvqVIVC0aj4PK8aB8FM4nU8tGAMQYebcDv45ZLDwtVq+XwsmAZB0CY2/PAcSQFLIHP8t");
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore errors
    }

    // Initial welcome message
    displaySystemMessage("👋 Welcome! How can we help you today?");
  </script>
</body>
</html>
```

### React Implementation

```jsx
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = "https://your-backend.com";
const SOCKET_PATH = "/chat";

export default function ChatWidget() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isOperatorTyping, setIsOperatorTyping] = useState(false);
  const [username] = useState(`Customer ${Math.floor(Math.random() * 1000)}`);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on("connect", () => {
      console.log("Connected to support");
      setIsConnected(true);

      socket.emit("join", {
        role: "client",
        user: username,
      });

      addSystemMessage("Connected to support. An operator will assist you shortly.");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from support");
      setIsConnected(false);
      addSystemMessage("Connection lost. Reconnecting...");
    });

    socket.on("incomingOperatorMessage", (data) => {
      if (data.type === "text") {
        addMessage({
          text: data.message,
          from: "operator",
          timestamp: new Date(),
        });
      } else if (data.type === "image") {
        addMessage({
          image: data.image,
          imageName: data.name,
          from: "operator",
          timestamp: new Date(),
        });
      }

      playNotificationSound();
    });

    socket.on("operatorTyping", (data) => {
      setIsOperatorTyping(data.isTyping);
    });

    socket.on("rateLimitExceeded", (data) => {
      addSystemMessage("⚠️ " + data.message);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("incomingOperatorMessage");
      socket.off("operatorTyping");
      socket.off("rateLimitExceeded");
    };
  }, [socket, username]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOperatorTyping]);

  const addMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const addSystemMessage = (text) => {
    addMessage({
      text,
      from: "system",
      timestamp: new Date(),
    });
  };

  const sendMessage = () => {
    const text = inputMessage.trim();
    if (!text || !socket) return;

    socket.emit("clientMessage", {
      type: "text",
      message: text,
    });

    addMessage({
      text,
      from: "user",
      timestamp: new Date(),
    });

    setInputMessage("");
    stopTyping();
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    handleTyping();
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  const handleTyping = () => {
    if (!isTypingRef.current && socket) {
      isTypingRef.current = true;
      socket.emit("clientTyping", { isTyping: true });
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 1000);
  };

  const stopTyping = () => {
    if (isTypingRef.current && socket) {
      isTypingRef.current = false;
      socket.emit("clientTyping", { isTyping: false });
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("Image too large. Maximum size is 10MB.");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Image = event.target.result;

      socket.emit("clientMessage", {
        type: "image",
        image: base64Image,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      });

      addMessage({
        image: base64Image,
        imageName: file.name,
        from: "user",
        timestamp: new Date(),
      });
    };

    reader.readAsDataURL(file);
    e.target.value = ""; // Reset input
  };

  const playNotificationSound = () => {
    const audio = new Audio("/notification.mp3");
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Ignore errors
  };

  return (
    <div className="chat-widget">
      <div className="chat-header">
        <h3>Customer Support</h3>
        <span className={`status ${isConnected ? "connected" : "disconnected"}`}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.from}`}>
            {msg.from === "system" ? (
              <div className="system-message">{msg.text}</div>
            ) : (
              <div className="message-bubble">
                {msg.text && <p>{msg.text}</p>}
                {msg.image && (
                  <img
                    src={msg.image}
                    alt={msg.imageName || "Image"}
                    onClick={() => window.open(msg.image, "_blank")}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {isOperatorTyping && (
          <div className="typing-indicator">
            Operator is typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: "none" }}
        />

        <button onClick={() => fileInputRef.current?.click()}>📎</button>

        <input
          type="text"
          value={inputMessage}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          disabled={!isConnected}
        />

        <button onClick={sendMessage} disabled={!isConnected || !inputMessage.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
```

### React + TypeScript Implementation

```typescript
import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

const BACKEND_URL = "https://your-backend.com";
const SOCKET_PATH = "/chat";

interface Message {
  text?: string;
  image?: string;
  imageName?: string;
  from: "user" | "operator" | "system";
  timestamp: Date;
}

interface IncomingOperatorMessage {
  from: string;
  type: "text" | "image";
  message?: string;
  image?: string;
  name?: string;
  mimeType?: string;
}

export default function ChatWidget() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isOperatorTyping, setIsOperatorTyping] = useState(false);
  const [username] = useState(`Customer ${Math.floor(Math.random() * 1000)}`);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const isTypingRef = useRef(false);

  useEffect(() => {
    const newSocket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit("join", { role: "client", user: username });
      addSystemMessage("Connected to support");
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      addSystemMessage("Connection lost. Reconnecting...");
    };

    const handleIncomingMessage = (data: IncomingOperatorMessage) => {
      if (data.type === "text") {
        addMessage({ text: data.message, from: "operator", timestamp: new Date() });
      } else if (data.type === "image") {
        addMessage({
          image: data.image,
          imageName: data.name,
          from: "operator",
          timestamp: new Date(),
        });
      }
    };

    const handleOperatorTyping = (data: { isTyping: boolean }) => {
      setIsOperatorTyping(data.isTyping);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("incomingOperatorMessage", handleIncomingMessage);
    socket.on("operatorTyping", handleOperatorTyping);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("incomingOperatorMessage", handleIncomingMessage);
      socket.off("operatorTyping", handleOperatorTyping);
    };
  }, [socket, username]);

  const addMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const addSystemMessage = (text: string) => {
    addMessage({ text, from: "system", timestamp: new Date() });
  };

  const sendMessage = () => {
    const text = inputMessage.trim();
    if (!text || !socket) return;

    socket.emit("clientMessage", { type: "text", message: text });
    addMessage({ text, from: "user", timestamp: new Date() });
    setInputMessage("");
    stopTyping();
  };

  const handleTyping = () => {
    if (!isTypingRef.current && socket) {
      isTypingRef.current = true;
      socket.emit("clientTyping", { isTyping: true });
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 1000);
  };

  const stopTyping = () => {
    if (isTypingRef.current && socket) {
      isTypingRef.current = false;
      socket.emit("clientTyping", { isTyping: false });
    }
  };

  // ... rest of implementation
}
```

## Best Practices

### 1. Connection Management

```javascript
// Store user ID in localStorage for reconnection
const getUserId = () => {
  let userId = localStorage.getItem("chatUserId");
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("chatUserId", userId);
  }
  return userId;
};

// Use persistent user ID
socket.emit("join", {
  role: "client",
  user: getUserId(),
});
```

### 2. Message Persistence

```javascript
// Save messages to localStorage
const saveMessages = (messages) => {
  localStorage.setItem("chatHistory", JSON.stringify(messages));
};

// Load messages on init
const loadMessages = () => {
  const saved = localStorage.getItem("chatHistory");
  return saved ? JSON.parse(saved) : [];
};

// Clear old messages (optional)
const clearOldMessages = () => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const messages = loadMessages();
  const recent = messages.filter(m => new Date(m.timestamp) > oneDayAgo);
  saveMessages(recent);
};
```

### 3. Error Handling

```javascript
socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
  displaySystemMessage("Unable to connect. Please check your internet connection.");
});

socket.on("connect_timeout", () => {
  console.error("Connection timeout");
  displaySystemMessage("Connection timed out. Retrying...");
});

socket.on("error", (error) => {
  console.error("Socket error:", error);
  displaySystemMessage("An error occurred. Please refresh the page.");
});
```

### 4. Offline Detection

```javascript
window.addEventListener("online", () => {
  displaySystemMessage("Back online. Reconnecting...");
  socket.connect();
});

window.addEventListener("offline", () => {
  displaySystemMessage("You are offline. Messages will be sent when connection is restored.");
});
```

### 5. Image Optimization

```javascript
// Compress images before sending
async function compressImage(file, maxWidth = 1200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.8
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
```

### 6. Notification Permissions

```javascript
// Request notification permission
async function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

// Show desktop notification
function showNotification(message) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("New message from support", {
      body: message,
      icon: "/support-icon.png",
      badge: "/badge-icon.png",
    });
  }
}
```

## UI/UX Recommendations

### 1. Unread Message Badge

```javascript
let unreadCount = 0;

function incrementUnread() {
  if (document.hidden) {
    unreadCount++;
    updateBadge(unreadCount);
    updatePageTitle();
  }
}

function updateBadge(count) {
  const badge = document.getElementById("chatBadge");
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }
}

function updatePageTitle() {
  if (unreadCount > 0) {
    document.title = `(${unreadCount}) New Messages`;
  } else {
    document.title = "Support Chat";
  }
}

// Reset when user views chat
window.addEventListener("focus", () => {
  unreadCount = 0;
  updateBadge(0);
  updatePageTitle();
});
```

### 2. Minimize/Maximize Widget

```javascript
let isMinimized = false;

function toggleWidget() {
  const widget = document.getElementById("chatWidget");
  const button = document.getElementById("toggleButton");

  if (isMinimized) {
    widget.style.height = "500px";
    button.textContent = "−";
  } else {
    widget.style.height = "60px";
    button.textContent = "+";
  }

  isMinimized = !isMinimized;
}
```

### 3. Sound Preferences

```javascript
let soundEnabled = localStorage.getItem("chatSoundEnabled") !== "false";

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("chatSoundEnabled", soundEnabled);
  updateSoundIcon();
}

function playNotificationSound() {
  if (soundEnabled) {
    const audio = new Audio("/notification.mp3");
    audio.volume = 0.3;
    audio.play().catch(() => {});
  }
}
```

### 4. Timestamp Display

```javascript
function formatTimestamp(date) {
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute
  if (diff < 60000) return "Just now";

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }

  // Same day
  if (now.toDateString() === date.toDateString()) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Different day
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
```

## Mobile Optimization

### Responsive CSS

```css
@media (max-width: 768px) {
  .chat-widget {
    width: 100%;
    height: 100%;
    bottom: 0;
    right: 0;
    border-radius: 0;
    max-width: none;
  }

  .message-bubble {
    max-width: 80%;
  }

  .chat-input {
    padding: 15px;
  }
}

/* Prevent zoom on input focus (iOS) */
input {
  font-size: 16px;
}
```

### Touch Optimizations

```javascript
// Prevent pull-to-refresh while scrolling messages
const messagesContainer = document.getElementById("chatMessages");
let startY = 0;

messagesContainer.addEventListener("touchstart", (e) => {
  startY = e.touches[0].pageY;
});

messagesContainer.addEventListener("touchmove", (e) => {
  const y = e.touches[0].pageY;
  const scrollTop = messagesContainer.scrollTop;

  // Prevent pull-to-refresh if scrolled to top
  if (scrollTop === 0 && y > startY) {
    e.preventDefault();
  }
});
```

## Security Considerations

### 1. Sanitize User Input

```javascript
function sanitizeMessage(text) {
  // Remove HTML tags
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Use when displaying messages
messageElement.textContent = sanitizeMessage(message.text);
```

### 2. Validate Images

```javascript
function validateImage(file) {
  // Check file type
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type");
  }

  // Check file size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File too large");
  }

  return true;
}
```

### 3. Rate Limiting (Client-Side)

```javascript
const MESSAGE_COOLDOWN = 500; // ms
let lastMessageTime = 0;

function canSendMessage() {
  const now = Date.now();
  if (now - lastMessageTime < MESSAGE_COOLDOWN) {
    return false;
  }
  lastMessageTime = now;
  return true;
}
```

## Testing

### Unit Tests (Jest + React Testing Library)

```javascript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatWidget from "./ChatWidget";

test("sends message when user clicks send", async () => {
  render(<ChatWidget />);

  const input = screen.getByPlaceholderText("Type a message...");
  const sendButton = screen.getByText("Send");

  await userEvent.type(input, "Hello support");
  await userEvent.click(sendButton);

  await waitFor(() => {
    expect(screen.getByText("Hello support")).toBeInTheDocument();
  });
});

test("displays operator messages", async () => {
  const { socket } = render(<ChatWidget />);

  // Simulate incoming message
  socket.emit("incomingOperatorMessage", {
    type: "text",
    message: "How can I help?",
  });

  await waitFor(() => {
    expect(screen.getByText("How can I help?")).toBeInTheDocument();
  });
});
```

### E2E Tests (Playwright)

```javascript
import { test, expect } from "@playwright/test";

test("user can send and receive messages", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // Send message
  await page.fill('input[placeholder="Type a message..."]', "Test message");
  await page.click('button:has-text("Send")');

  // Verify message appears
  await expect(page.locator(".message.user")).toContainText("Test message");

  // Wait for operator response (mock)
  await expect(page.locator(".message.operator")).toBeVisible();
});
```

## Performance Optimization

### 1. Lazy Loading Images

```javascript
function lazyLoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve("/placeholder.png");
    img.src = src;
  });
}
```

### 2. Throttle Typing Indicator

```javascript
import { throttle } from "lodash";

const handleTyping = throttle(() => {
  if (!isTypingRef.current && socket) {
    isTypingRef.current = true;
    socket.emit("clientTyping", { isTyping: true });
  }
}, 300);
```

### 3. Virtual Scrolling for Long Chats

```javascript
import { FixedSizeList } from "react-window";

function MessageList({ messages }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <Message data={messages[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={400}
      itemCount={messages.length}
      itemSize={60}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

## Deployment Checklist

- [ ] Update `BACKEND_URL` to production URL
- [ ] Configure CORS on backend for your domain
- [ ] Enable HTTPS/SSL
- [ ] Test on multiple devices (mobile, tablet, desktop)
- [ ] Test on multiple browsers (Chrome, Safari, Firefox)
- [ ] Implement analytics tracking
- [ ] Add error monitoring (Sentry, LogRocket)
- [ ] Test reconnection scenarios
- [ ] Verify image upload works
- [ ] Test with slow 3G connection
- [ ] Add accessibility features (ARIA labels, keyboard navigation)
- [ ] Optimize bundle size
- [ ] Set up CDN for static assets

## Support

For backend implementation details, see:
- [README.md](./README.md) - Backend documentation
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - Operator interface guide

## License

MIT
