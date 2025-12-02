const crypto = require("crypto");
const WebSocket = require("ws");

/**
 * Custom Protocol Implementation with Simple Cipher Encryption
 * Protocol: CVCP (Custom Video Call Protocol)
 *
 * Packet Structure (Inside WebSocket Frame):
 * [4 bytes: length][1 byte: type][payload]
 *
 * Types:
 * 0x01 - HTTP Request (Deprecated in favor of standard HTTPS)
 * 0x02 - HTTP Response (Deprecated)
 * 0x03 - WebSocket Handshake (Virtual)
 * 0x04 - WebSocket Message
 * 0x05 - WebSocket Close
 */

class SimpleCipher {
  constructor(key = "default-video-call-key") {
    // Generate a cipher key from the provided key
    this.key = Buffer.from(crypto.createHash("sha256").update(key).digest());
  }

  encrypt(data) {
    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
      const encrypted = Buffer.alloc(buffer.length);

      // Simple XOR cipher with key rotation
      for (let i = 0; i < buffer.length; i++) {
        encrypted[i] = buffer[i] ^ this.key[i % this.key.length];
      }

      // Add a simple checksum
      const checksum = this.calculateChecksum(buffer);
      const result = Buffer.concat([encrypted, Buffer.from([checksum])]);

      return result;
    } catch (error) {
      console.error("Encryption error:", error);
      throw error;
    }
  }

  decrypt(data) {
    try {
      const buffer = Buffer.from(data);

      if (buffer.length === 0) return Buffer.alloc(0);

      // Extract checksum
      const checksum = buffer[buffer.length - 1];
      const encrypted = buffer.slice(0, -1);

      // Decrypt using XOR
      const decrypted = Buffer.alloc(encrypted.length);
      for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i] ^ this.key[i % this.key.length];
      }

      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(decrypted);
      if (checksum !== calculatedChecksum) {
        console.warn("Checksum mismatch - data may be corrupted");
      }

      return decrypted;
    } catch (error) {
      console.error("Decryption error:", error);
      throw error;
    }
  }

  calculateChecksum(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum = (sum + buffer[i]) & 0xff;
    }
    return sum;
  }
}

class CVCPServer {
  constructor(options = {}) {
    this.cipher = new SimpleCipher(options.key);
    this.wsConnections = new Map();
    this.wsHandler = null;
  }

  // Attach to an existing HTTPS server
  attach(httpsServer) {
    this.wss = new WebSocket.Server({ server: httpsServer });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  handleConnection(ws, req) {
    const connId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    console.log(`New CVCP connection: ${connId}`);

    // Wrapper for the WebSocket to handle encryption/decryption transparently
    const wsWrapper = {
      send: (data) => {
        // Encrypt before sending
        const payload = Buffer.from(
          typeof data === "string" ? data : JSON.stringify(data)
        );
        this.sendPacket(ws, 0x04, payload);
      },
      close: () => {
        this.sendPacket(ws, 0x05, Buffer.alloc(0));
        ws.close();
      },
      id: connId,
      originalWs: ws
    };

    this.wsConnections.set(connId, wsWrapper);

    ws.on("message", (message) => {
      // Message is a Buffer containing [Length][Type][EncryptedPayload]
      // Or just [EncryptedPayload] if we simplify, but let's keep the packet structure
      // for "Custom Protocol" feel.
      this.processPacket(ws, connId, message);
    });

    ws.on("close", () => {
      this.handleWebSocketClose(connId);
    });

    ws.on("error", (err) => {
      console.error(`WebSocket error for ${connId}:`, err);
    });

    // Send virtual handshake accepted
    this.sendPacket(ws, 0x03, Buffer.from("ACCEPTED"));

    // Notify handler
    if (this.wsHandler && this.wsHandler.onConnection) {
      this.wsHandler.onConnection(wsWrapper);
    }
  }

  processPacket(ws, connId, buffer) {
    try {
      // In the new WSS transport, the 'buffer' is already a discrete message.
      // We don't need to handle TCP fragmentation (sticky packets) as much,
      // but we should still respect the protocol format.
      
      if (buffer.length < 5) return; // Too short

      const length = buffer.readUInt32BE(0);
      const type = buffer[4];
      const encryptedPayload = buffer.slice(5);

      if (encryptedPayload.length !== length) {
        console.warn("Packet length mismatch");
        // In a real TCP stream we'd wait, but in WS frames, this implies error
        return;
      }

      const payload = this.cipher.decrypt(encryptedPayload);

      if (type === 0x03) {
        // Handshake - already handled implicitly but good for verification
      } else if (type === 0x04) {
        this.handleWebSocketMessage(connId, payload);
      } else if (type === 0x05) {
        this.handleWebSocketClose(connId);
        ws.close();
      }

    } catch (error) {
      console.error("Error processing packet:", error);
    }
  }

  handleWebSocketMessage(connId, payload) {
    const wsWrapper = this.wsConnections.get(connId);
    if (wsWrapper && this.wsHandler && this.wsHandler.onMessage) {
      try {
        const message = payload.toString();
        this.wsHandler.onMessage(wsWrapper, message);
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    }
  }

  handleWebSocketClose(connId) {
    console.log(`CVCP Connection closed: ${connId}`);
    const wsWrapper = this.wsConnections.get(connId);
    if (wsWrapper && this.wsHandler && this.wsHandler.onClose) {
      this.wsHandler.onClose(wsWrapper);
    }
    this.wsConnections.delete(connId);
  }

  sendPacket(ws, type, payload) {
    try {
      if (ws.readyState !== WebSocket.OPEN) return;

      const encrypted = this.cipher.encrypt(payload);
      const length = encrypted.length;

      const packet = Buffer.alloc(5 + length);
      packet.writeUInt32BE(length, 0);
      packet[4] = type;
      encrypted.copy(packet, 5);

      ws.send(packet);
    } catch (error) {
      console.error("Error sending packet:", error);
    }
  }

  onWebSocket(handlers) {
    this.wsHandler = handlers;
  }

  broadcast(message) {
    for (const [connId, ws] of this.wsConnections) {
      try {
        ws.send(message);
      } catch (error) {
        console.error(`Error broadcasting to ${connId}:`, error);
      }
    }
  }
}

module.exports = { CVCPServer, SimpleCipher };
