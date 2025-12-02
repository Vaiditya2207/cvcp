# System Architecture

## Overview
The system consists of three main components: the **CVCP Server**, the **CVCP Client Proxy**, and the **User Interface**.

```mermaid
graph TD
    User[User] -->|Opens cvcp://| Launcher[Protocol Launcher]
    Launcher -->|Starts| Client[CVCP Client Proxy (Node.js)]
    
    subgraph "Local Machine"
        Client -->|Serves UI| Browser[Web Browser]
        Browser -->|WebSocket (Local)| Client
    end
    
    subgraph "Network"
        Client -->|Raw TCP + Custom Encryption| Server[CVCP Server (Node.js)]
    end
    
    subgraph "Remote Machine"
        Server -->|Raw TCP| RemoteClient[Other CVCP Client]
    end
```

## 1. The Protocol (CVCP)
**Custom Video Call Protocol** is a binary, stateful protocol running over TCP.

### Packet Structure
```
[Header: 4 bytes] [Type: 1 byte] [Payload: Variable]
|                 |              |
+-- Packet Len    +-- Msg Type   +-- Encrypted Data
```

### Message Types
- `0x01`: **Handshake** (Auth & Version check)
- `0x02`: **Signaling** (WebRTC Offer/Answer/ICE)
- `0x03`: **Room Control** (Join/Leave)
- `0x04`: **Keepalive** (Heartbeat)

### Encryption
A custom **XOR-Rotation Cipher** is used.
- **Key**: Shared secret (pre-shared or derived).
- **Algorithm**: `Byte[i] = Byte[i] ^ Key[i % KeyLen]`.
- **Integrity**: Simple checksum appended to payload.

## 2. The Server (`server.js`)
- Listens on a raw **TCP Port** (e.g., 9000).
- Manages active TCP connections.
- Routes signaling messages between clients based on Room ID.
- Does **not** speak HTTP or WebSocket.

## 3. The Client Proxy (`client.js`)
- Launched by the OS when `cvcp://` is clicked.
- **Network Side**: Connects to the Server via TCP. Encrypts/Decrypts CVCP packets.
- **Local Side**: 
    - Starts a minimal HTTP server to serve the UI files.
    - Starts a WebSocket server to pipe data to the Browser.
- **Function**: Acts as a translator. The Browser "thinks" it's talking to a local server, but the Client Proxy is actually converting everything to the custom TCP protocol for the network journey.

## 4. The UI (`public/`)
- Standard HTML/JS.
- Uses WebRTC for the actual media stream (P2P).
- Uses the Local WebSocket for signaling.
