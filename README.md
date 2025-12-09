# Local Video Call (CVCP)

A high-performance video calling application that uses a **Custom Video Call Protocol (`cvcp://`)** over raw TCP, bypassing standard HTTP/HTTPS overhead.

## Architecture
- **Protocol**: Custom Binary Protocol over TCP (Port 9000)
- **Encryption**: Custom XOR-Rotation Cipher
- **Client**: Hybrid Native-Web (Node.js Proxy + WebRTC UI)

## Prerequisites
- Node.js installed
- macOS (for the protocol handler app)

## Setup & Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Register the Protocol Handler** (One-time setup)
   ```bash
   node register.js
   ```
   *   This creates `CVCPHandler.app`.
   *   **Important**: Open Finder (`open .`) and double-click `CVCPHandler.app` once to register it with macOS.

## How to Run

### 1. Start the Server
Open a terminal and run:
```bash
node server.js
```
*   The server listens on TCP Port 9000.

### 2. Launch the Client
Open a **new terminal** (or click a link) and run:
```bash
open cvcp://localhost:9000
```
*   This will automatically:
    1.  Launch the `CVCPHandler.app` (which runs `client.js`).
    2.  Connect to the TCP server.
    3.  Open your default browser with the UI.

## Usage
1.  Enter a **Room ID** (e.g., `room1`).
2.  Click **Join Room**.
3.  Wait for a peer to join the same room. 