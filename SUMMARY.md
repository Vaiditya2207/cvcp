# Project Summary

## Current Status
- **Operational**: The system is fully implemented and functional.
- **Architecture**: Hybrid Native-Web model using a "Client Proxy" to bridge standard browsers to a raw TCP custom protocol network.
- **Protocol**: `cvcp://` (Custom Video Call Protocol) is registered on the OS and handles binary packet transmission with custom encryption.

## Components
1.  **`lib/protocol.js`**: Implements the binary packet structure (Header/Type/Payload) and XOR-Rotation encryption.
2.  **`server.js`**: A raw TCP signaling server (Port 9000) that routes messages between peers.
3.  **`client.js`**: A local Node.js proxy that launches on `cvcp://` click, bridging the TCP network stream to a local WebSocket for the browser UI.
4.  **`CVCPHandler.app`**: A macOS application bundle generated to handle the URL scheme and launch the client proxy.
5.  **Frontend**: A WebRTC-based video interface that connects to the local proxy.

## How to Run
1.  **Start Server**: `node server.js`
2.  **Launch Client**: `open cvcp://localhost:9000` (or click a link).

## Key Features
- **True Custom Transport**: Does not use HTTPS/WSS for signaling; uses raw TCP.
- **Custom Encryption**: Implements a proprietary encryption layer over the wire.
- **Seamless UX**: Users click a link, and the app launches automatically.
