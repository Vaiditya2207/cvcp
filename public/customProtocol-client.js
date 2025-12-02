/**
 * Custom Protocol Client for CVCP (Custom Video Call Protocol)
 * Browser-compatible client that communicates with our custom protocol server
 */

class SimpleCipher {
  constructor(key = "default-video-call-key") {
    // Generate cipher key from provided key
    this.key = this.generateKey(key);
  }

  async generateKey(keyString) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
    return new Uint8Array(hashBuffer);
  }

  async encrypt(data) {
    const key = await this.key;
    const buffer =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);
    const encrypted = new Uint8Array(buffer.length);

    // Simple XOR cipher with key rotation
    for (let i = 0; i < buffer.length; i++) {
      encrypted[i] = buffer[i] ^ key[i % key.length];
    }

    // Add checksum
    const checksum = this.calculateChecksum(buffer);
    const result = new Uint8Array(encrypted.length + 1);
    result.set(encrypted);
    result[encrypted.length] = checksum;

    return result;
  }

  async decrypt(data) {
    const key = await this.key;
    const buffer = new Uint8Array(data);

    // Extract checksum
    const checksum = buffer[buffer.length - 1];
    const encrypted = buffer.slice(0, -1);

    // Decrypt using XOR
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ key[i % key.length];
    }

    // Verify checksum
    const calculatedChecksum = this.calculateChecksum(decrypted);
    if (checksum !== calculatedChecksum) {
      console.warn("Checksum mismatch - data may be corrupted");
    }

    return decrypted;
  }

  calculateChecksum(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum = (sum + buffer[i]) & 0xff;
    }
    return sum;
  }
}

class CVCPClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.secure = Boolean(options.secure);
    this.socket = null;
    this.cipher = new SimpleCipher("video-call-secret-key");
    this.connected = false;
    this.connecting = false;
    this.buffer = new Uint8Array(0);
    this.messageHandlers = [];
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
  }

  connect() {
    if (this.connecting || this.connected) {
      return Promise.reject(new Error("Already connecting or connected"));
    }

    this.connecting = true;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connecting = false;
        if (this.socket) {
          this.socket.close();
        }
        reject(new Error("Connection timeout"));
      }, 5000);

      try {
        // Use WSS (Secure WebSocket)
        const scheme = "wss";
        // If url starts with cvcp://, replace it. If it's just a host, prepend wss://
        let preparedUrl = this.url;
        if (preparedUrl.startsWith("cvcp://")) {
          preparedUrl = preparedUrl.replace(/^cvcp:\/\//i, `${scheme}://`);
        } else if (!preparedUrl.startsWith("wss://") && !preparedUrl.startsWith("ws://")) {
          preparedUrl = `${scheme}://${preparedUrl}`;
        }
        
        // Ensure we are using the same port as the HTTPS server (3000)
        const urlObj = new URL(preparedUrl);
        // If port is missing, default to 3000 for this app
        if (!urlObj.port) urlObj.port = "3000";
        
        const websocketUrl = urlObj.toString();

        console.log(`Connecting to ${websocketUrl}`);

        // Create WebSocket connection (we'll tunnel through it)
        this.socket = new WebSocket(websocketUrl);
        this.socket.binaryType = "arraybuffer";

        this.socket.onopen = async () => {
          clearTimeout(timeout);
          console.log("Connected to server");
          this.connected = true;
          this.connecting = false;

          // Send WebSocket handshake
          try {
            await this.sendPacket(0x03, new TextEncoder().encode("HANDSHAKE"));
          } catch (e) {
            console.error("Handshake failed:", e);
          }

          if (this.onopen) this.onopen();
          resolve();
        };

        this.socket.onmessage = async (event) => {
          await this.handleData(new Uint8Array(event.data));
        };

        this.socket.onclose = () => {
          clearTimeout(timeout);
          console.log("Disconnected from server");
          this.connected = false;
          this.connecting = false;
          this.socket = null;
          if (this.onclose) this.onclose();
        };

        this.socket.onerror = (error) => {
          clearTimeout(timeout);
          console.error("Connection error:", error);
          this.connecting = false;
          this.socket = null;
          if (this.onerror) this.onerror(error);
          reject(error);
        };
      } catch (error) {
        clearTimeout(timeout);
        this.connecting = false;
        console.error("Failed to connect:", error);
        reject(error);
      }
    });
  }

  async handleData(chunk) {
    try {
      // Append to buffer
      const newBuffer = new Uint8Array(this.buffer.length + chunk.length);
      newBuffer.set(this.buffer);
      newBuffer.set(chunk, this.buffer.length);
      this.buffer = newBuffer;

      // Process all complete packets
      while (this.buffer.length >= 5) {
        // Read packet length (4 bytes, big-endian)
        const length =
          (this.buffer[0] << 24) |
          (this.buffer[1] << 16) |
          (this.buffer[2] << 8) |
          this.buffer[3];

        if (this.buffer.length < 5 + length) {
          // Wait for complete packet
          break;
        }

        // Read packet type
        const type = this.buffer[4];

        // Extract encrypted payload
        const encryptedPayload = this.buffer.slice(5, 5 + length);
        this.buffer = this.buffer.slice(5 + length);

        // Decrypt payload
        const payload = await this.cipher.decrypt(encryptedPayload);

        // Handle based on type
        if (type === 0x03) {
          // WebSocket handshake response
          console.log(" Handshake accepted");
        } else if (type === 0x04) {
          // WebSocket message
          const message = new TextDecoder().decode(payload);
          if (this.onmessage) {
            this.onmessage({ data: message });
          }
        } else if (type === 0x05) {
          // WebSocket close
          this.close();
        }
      }
    } catch (error) {
      console.error("Error handling data:", error);
    }
  }

  async send(data) {
    if (!this.connected) {
      throw new Error("Not connected");
    }

    const payload =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);

    await this.sendPacket(0x04, payload);
  }

  async sendPacket(type, payload) {
    try {
      const encrypted = await this.cipher.encrypt(payload);
      const length = encrypted.length;

      const packet = new Uint8Array(5 + length);
      // Write length (big-endian)
      packet[0] = (length >> 24) & 0xff;
      packet[1] = (length >> 16) & 0xff;
      packet[2] = (length >> 8) & 0xff;
      packet[3] = length & 0xff;
      // Write type
      packet[4] = type;
      // Write encrypted payload
      packet.set(encrypted, 5);

      this.socket.send(packet.buffer);
    } catch (error) {
      console.error("Error sending packet:", error);
      throw error;
    }
  }

  close() {
    if (this.socket) {
      this.sendPacket(0x05, new Uint8Array(0)).catch(console.error);
      this.socket.close();
      this.connected = false;
      this.connecting = false;
      this.socket = null;
    }
  }
}

// Export for use in client.js
if (typeof window !== "undefined") {
  window.CVCPClient = CVCPClient;
}
