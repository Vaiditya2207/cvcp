const net = require('net');
const { TYPES, SimpleCipher, Packet } = require('./lib/protocol');

const PORT = 9000;
const cipher = new SimpleCipher('my-secret-video-key');

const rooms = new Map(); // roomId -> Set(socket)
const clients = new Map(); // socket -> { id, roomId }

const server = net.createServer((socket) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    clients.set(socket, { id: clientId, roomId: null });
    
    console.log(`[TCP] New connection: ${clientId}`);
    
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        const { packets, remaining } = Packet.decode(buffer, cipher);
        buffer = remaining;

        packets.forEach(packet => handlePacket(socket, packet));
    });

    socket.on('close', () => {
        handleDisconnect(socket);
    });

    socket.on('error', (err) => {
        console.error(`[TCP] Error ${clientId}:`, err.message);
    });
});

function handlePacket(socket, packet) {
    const client = clients.get(socket);
    
    switch (packet.type) {
        case TYPES.HANDSHAKE:
            console.log(`[Handshake] Client ${client.id} connected`);
            // Send ack
            send(socket, TYPES.HANDSHAKE, { status: 'ok', clientId: client.id });
            break;

        case TYPES.ROOM_CONTROL:
            handleRoomControl(socket, packet.payload);
            break;

        case TYPES.SIGNALING:
            handleSignaling(socket, packet.payload);
            break;
            
        case TYPES.KEEPALIVE:
            // Just echo back or ignore
            break;
    }
}

function handleRoomControl(socket, payload) {
    const client = clients.get(socket);
    const { action, roomId } = payload;

    if (action === 'join') {
        // Leave old room if any
        if (client.roomId) {
            const oldRoom = rooms.get(client.roomId);
            if (oldRoom) oldRoom.delete(socket);
        }

        // Join new room
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(socket);
        client.roomId = roomId;

        console.log(`[Room] ${client.id} joined ${roomId}`);
        
        // Notify client
        send(socket, TYPES.ROOM_CONTROL, { event: 'joined', roomId });
        
        // Notify others
        broadcastToRoom(roomId, socket, TYPES.ROOM_CONTROL, { event: 'peer-joined', peerId: client.id });
    }
}

function handleSignaling(socket, payload) {
    const client = clients.get(socket);
    if (!client.roomId) return;

    // Relay to specific target or broadcast to room (excluding self)
    // Payload usually contains { targetId, ...data }
    
    if (payload.targetId) {
        // Find specific target
        // (Inefficient search for demo purposes)
        for (const [peerSocket, peerData] of clients) {
            if (peerData.id === payload.targetId) {
                send(peerSocket, TYPES.SIGNALING, { ...payload, from: client.id });
                break;
            }
        }
    } else {
        // Broadcast to room
        broadcastToRoom(client.roomId, socket, TYPES.SIGNALING, { ...payload, from: client.id });
    }
}

function broadcastToRoom(roomId, excludeSocket, type, payload) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const peerSocket of room) {
        if (peerSocket !== excludeSocket) {
            send(peerSocket, type, payload);
        }
    }
}

function handleDisconnect(socket) {
    const client = clients.get(socket);
    if (client) {
        console.log(`[TCP] Disconnected: ${client.id}`);
        if (client.roomId) {
            const room = rooms.get(client.roomId);
            if (room) {
                room.delete(socket);
                broadcastToRoom(client.roomId, socket, TYPES.ROOM_CONTROL, { event: 'peer-left', peerId: client.id });
                if (room.size === 0) rooms.delete(client.roomId);
            }
        }
        clients.delete(socket);
    }
}

function send(socket, type, payload) {
    try {
        const packet = Packet.encode(type, payload, cipher);
        socket.write(packet);
    } catch (e) {
        console.error("Send error:", e);
    }
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║      CVCP SERVER RUNNING               ║
║      Port: ${PORT}                        ║
║      Protocol: Raw TCP + Custom Enc    ║
╚════════════════════════════════════════╝
    `);
});
