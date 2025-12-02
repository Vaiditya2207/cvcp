# Problem Statement

## The Challenge
Standard web protocols (HTTP/HTTPS) are designed for general-purpose document retrieval and have significant overhead (headers, statelessness, text-based). For a high-performance local video call application, we need something better.

## Constraints & Requirements
1.  **No HTTPS**: The user explicitly wants to avoid standard HTTPS for the core transport.
2.  **Custom Protocol**: We must implement `CVCP` (Custom Video Call Protocol).
3.  **Optimization**: The protocol should be binary and optimized for real-time signaling.
4.  **Security**: We need encryption, but implemented manually (Simple Encryption) rather than relying on TLS.
5.  **Experience**: The app should be launchable via `cvcp://` links.

## The Solution
We will build a **Hybrid Native-Web Architecture**:
- **Transport Layer**: Raw TCP sockets using a custom binary packet format.
- **Application Layer**: A custom Node.js client that acts as a bridge.
- **Presentation Layer**: A local browser window (UI) that connects to the local bridge.

This ensures that the traffic traveling over the network is **pure, encrypted CVCP**, not HTTP/WebSocket traffic.
