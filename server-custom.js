const { CVCPServer } = require("./customProtocol");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");

class CustomVideoCallServer {
  constructor() {
    this.rooms = new Map(); // Store room information
    this.clients = new Map(); // Store client connections

    this.startServer();
  }

  startServer() {
    // Load SSL Certificates
    const options = {
      key: fs.readFileSync(path.join(__dirname, "key.pem")),
      cert: fs.readFileSync(path.join(__dirname, "cert.pem")),
    };

    // Create HTTPS server (Standard Transport)
    this.httpsServer = https.createServer(options, (req, res) => {
      this.handleHttpRequest(req, res);
    });

    // Initialize Custom Protocol Server (Signaling Layer)
    this.cvcpServer = new CVCPServer({ key: "video-call-secret-key" });
    
    // Attach CVCP to the HTTPS server (Tunneling over WSS)
    this.cvcpServer.attach(this.httpsServer);

    // Handle Custom Protocol Connections
    this.cvcpServer.onWebSocket({
      onConnection: (ws) => {
        this.handleConnection(ws);
      },
      onMessage: (ws, message) => {
        this.handleMessage(ws, message);
      },
      onClose: (ws) => {
        this.handleDisconnection(ws);
      },
    });

    const PORT = 3000;
    this.httpsServer.listen(PORT, "0.0.0.0", () => {
      console.log("\nCustom Protocol Video Call Server Started!");
      console.log("Transport: HTTPS/WSS (Secure)");
      console.log("Protocol: CVCP (Custom Video Call Protocol)");
      this.printNetworkInfo(PORT);
    });
  }

  printNetworkInfo(port) {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    Object.keys(interfaces).forEach((name) => {
      interfaces[name].forEach((iface) => {
        if (iface.family === "IPv4" && !iface.internal) {
          addresses.push(iface.address);
        }
      });
    });

    console.log("Access the application at:");
    console.log(`Localhost: https://localhost:${port}`);

    if (addresses.length > 0) {
      addresses.forEach((address) => {
        console.log(`Network: https://${address}:${port}`);
      });
      console.log("\nNote: Accept the self-signed certificate warning in your browser.");
    } else {
      console.log(
        "\nNo network interfaces found. Make sure you are connected to WiFi."
      );
    }
  }

  handleHttpRequest(req, res) {
    console.log(` ${req.method} ${req.url}`);

    // Serve static files
    let filePath;
    if (req.url === "/") {
      filePath = path.join(__dirname, "public", "index-custom.html");
    } else {
      // Remove query string
      const cleanUrl = req.url.split('?')[0];
      filePath = path.join(__dirname, "public", cleanUrl);
    }

    // Security: prevent directory traversal
    const publicDir = path.join(__dirname, "public");
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(publicDir)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();

        const mimeTypes = {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
          ".ico": "image/x-icon",
        };

        const contentType = mimeTypes[ext] || "application/octet-stream";

        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": content.length,
        });
        res.end(content);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
      }
    } catch (error) {
      console.error("Error serving file:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }

  handleConnection(ws) {
    const clientId = this.generateId();
    ws.clientId = clientId;

    this.clients.set(clientId, {
      ws,
      roomId: null,
      name: "Guest",
    });

    console.log(` Client connected: ${clientId}`);

    // Send welcome message
    this.sendToClient(ws, {
      type: "welcome",
      clientId: clientId,
    });
  }

  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      const client = this.clients.get(ws.clientId);

      if (!client) {
        console.warn("Message from unknown client");
        return;
      }

      console.log(` Message from ${ws.clientId}: ${data.type}`);

      switch (data.type) {
        case "create-room":
          this.handleCreateRoom(ws, data);
          break;
        case "join-room":
          this.handleJoinRoom(ws, data);
          break;
        case "leave-room":
          this.handleLeaveRoom(ws);
          break;
        case "offer":
        case "answer":
        case "ice-candidate":
          this.handleSignaling(ws, data);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  handleDisconnection(ws) {
    const client = this.clients.get(ws.clientId);

    if (client) {
      console.log(` Client disconnected: ${ws.clientId}`);

      if (client.roomId) {
        this.handleLeaveRoom(ws);
      }

      this.clients.delete(ws.clientId);
    }
  }

  handleCreateRoom(ws, data) {
    const client = this.clients.get(ws.clientId);
    const roomId = data.roomId;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        clients: new Set(),
        createdAt: Date.now(),
      });
    }

    const room = this.rooms.get(roomId);
    room.clients.add(ws.clientId);
    client.roomId = roomId;
    client.name = data.name || "Guest";

    console.log(` Room created/joined: ${roomId} by ${client.name}`);

    this.sendToClient(ws, {
      type: "room-joined",
      roomId: roomId,
      clientId: ws.clientId,
    });

    // Notify others in room
    this.broadcastToRoom(
      roomId,
      {
        type: "peer-joined",
        clientId: ws.clientId,
        name: client.name,
      },
      ws.clientId
    );
  }

  handleJoinRoom(ws, data) {
    const client = this.clients.get(ws.clientId);
    const roomId = data.roomId;

    if (!this.rooms.has(roomId)) {
      this.sendToClient(ws, {
        type: "error",
        message: "Room does not exist",
      });
      return;
    }

    const room = this.rooms.get(roomId);
    room.clients.add(ws.clientId);
    client.roomId = roomId;
    client.name = data.name || "Guest";

    console.log(` ${client.name} joined room: ${roomId}`);

    // Send list of existing peers
    const peers = Array.from(room.clients)
      .filter((id) => id !== ws.clientId)
      .map((id) => {
        const peerClient = this.clients.get(id);
        return {
          clientId: id,
          name: peerClient ? peerClient.name : "Guest",
        };
      });

    this.sendToClient(ws, {
      type: "room-joined",
      roomId: roomId,
      clientId: ws.clientId,
      peers: peers,
    });

    // Notify others in room
    this.broadcastToRoom(
      roomId,
      {
        type: "peer-joined",
        clientId: ws.clientId,
        name: client.name,
      },
      ws.clientId
    );
  }

  handleLeaveRoom(ws) {
    const client = this.clients.get(ws.clientId);

    if (!client || !client.roomId) return;

    const roomId = client.roomId;
    const room = this.rooms.get(roomId);

    if (room) {
      room.clients.delete(ws.clientId);

      console.log(` ${client.name} left room: ${roomId}`);

      // Notify others
      this.broadcastToRoom(roomId, {
        type: "peer-left",
        clientId: ws.clientId,
      });

      // Delete room if empty
      if (room.clients.size === 0) {
        this.rooms.delete(roomId);
        console.log(` Room deleted: ${roomId}`);
      }
    }

    client.roomId = null;
  }

  handleSignaling(ws, data) {
    const client = this.clients.get(ws.clientId);

    if (!client || !client.roomId) return;

    const targetId = data.targetId;
    const targetClient = this.clients.get(targetId);

    if (targetClient && targetClient.ws) {
      this.sendToClient(targetClient.ws, {
        type: data.type,
        from: ws.clientId,
        data: data.data,
      });
    }
  }

  sendToClient(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      console.error("Error sending to client:", error);
    }
  }

  broadcastToRoom(roomId, data, excludeClientId = null) {
    const room = this.rooms.get(roomId);

    if (!room) return;

    for (const clientId of room.clients) {
      if (clientId !== excludeClientId) {
        const client = this.clients.get(clientId);
        if (client && client.ws) {
          this.sendToClient(client.ws, data);
        }
      }
    }
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}

// Start the server
new CustomVideoCallServer();
