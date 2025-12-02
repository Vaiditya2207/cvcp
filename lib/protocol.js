const crypto = require('crypto');

// Protocol Constants
const TYPES = {
    HANDSHAKE: 0x01,
    SIGNALING: 0x02,
    ROOM_CONTROL: 0x03,
    KEEPALIVE: 0x04
};

class SimpleCipher {
    constructor(secret = 'cvcp-default-secret') {
        // Derive a fixed-length key from the secret
        this.key = Buffer.from(crypto.createHash('sha256').update(secret).digest());
    }

    process(buffer) {
        const result = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            result[i] = buffer[i] ^ this.key[i % this.key.length];
        }
        return result;
    }
}

class Packet {
    static encode(type, payload, cipher) {
        // 1. Prepare payload
        let payloadBuf;
        if (typeof payload === 'string') {
            payloadBuf = Buffer.from(payload);
        } else if (Buffer.isBuffer(payload)) {
            payloadBuf = payload;
        } else {
            payloadBuf = Buffer.from(JSON.stringify(payload));
        }

        // 2. Encrypt payload
        const encryptedPayload = cipher ? cipher.process(payloadBuf) : payloadBuf;

        // 3. Construct Packet
        // [Length (4)][Type (1)][Payload (N)]
        const length = encryptedPayload.length;
        const packet = Buffer.alloc(5 + length);

        packet.writeUInt32BE(length, 0);
        packet.writeUInt8(type, 4);
        encryptedPayload.copy(packet, 5);

        return packet;
    }

    static decode(buffer, cipher) {
        // Helper to parse a buffer containing potentially multiple packets
        // Returns { packets: [decoded...], remaining: Buffer }
        
        const packets = [];
        let offset = 0;

        while (offset + 5 <= buffer.length) {
            const length = buffer.readUInt32BE(offset);
            const totalPacketSize = 5 + length;

            if (offset + totalPacketSize > buffer.length) {
                // Incomplete packet
                break;
            }

            const type = buffer.readUInt8(offset + 4);
            const encryptedPayload = buffer.slice(offset + 5, offset + totalPacketSize);
            
            // Decrypt
            const payloadBuf = cipher ? cipher.process(encryptedPayload) : encryptedPayload;
            
            // Try to parse JSON, fallback to string
            let payload;
            try {
                payload = JSON.parse(payloadBuf.toString());
            } catch {
                payload = payloadBuf.toString();
            }

            packets.push({ type, payload });
            offset += totalPacketSize;
        }

        return {
            packets,
            remaining: buffer.slice(offset)
        };
    }
}

module.exports = { TYPES, SimpleCipher, Packet };
