# Project Proposal: Custom Video Call Protocol (CVCP)

**Date:** December 2, 2025  
**Project:** Local Video Call with Custom Transport Layer  
**Status:** Implemented

---

## 1. Executive Summary
This project aims to develop a high-performance video calling application that bypasses standard web protocols (HTTP/HTTPS) in favor of a custom, lightweight binary protocol (CVCP) running over raw TCP. The system utilizes a hybrid architecture to combine the raw performance of native sockets with the usability of a web-based interface.

## 2. Problem Statement
Standard web protocols like HTTP and HTTPS are designed for general-purpose document retrieval. They introduce significant overhead due to:
*   **Verbose Headers**: Text-based headers consume unnecessary bandwidth.
*   **Statelessness**: Requires repetitive authentication or cookie management.
*   **Standard TLS**: Adds handshake latency and complexity.

For a specialized, high-performance local video call application, these protocols are inefficient. The goal is to implement a "bare metal" networking approach while keeping the application accessible.

## 3. Proposed Solution
We have implemented a **Hybrid Native-Web Architecture** that separates the User Interface from the Network Transport.

### 3.1 Core Concept
Instead of the browser connecting directly to a server via HTTPS/WSS, the browser connects to a **Local Client Proxy**. This proxy establishes a raw TCP connection to the remote server using our custom protocol.

### 3.2 Key Objectives
1.  **Eliminate HTTPS**: Use raw TCP sockets for all network signaling.
2.  **Custom Protocol (CVCP)**: Implement a binary packet format optimized for speed.
3.  **Custom Encryption**: Replace TLS with a proprietary XOR-Rotation cipher.
4.  **Native Integration**: Launch the application via `cvcp://` URL schemes.

## 4. Technical Architecture

### 4.1 The Protocol (CVCP)
The Custom Video Call Protocol is a stateful, binary protocol.
*   **Transport**: TCP
*   **Packet Structure**: `[Length (4 bytes)] [Type (1 byte)] [Payload (Variable)]`
*   **Encryption**: Symmetric XOR-Rotation algorithm with SHA-256 key derivation.

### 4.2 System Components
1.  **CVCP Server (`server.js`)**:
    *   Listens on TCP Port 9000.
    *   Handles binary packet decoding/encoding.
    *   Routes signaling messages (WebRTC offers/answers) between peers.

2.  **Client Proxy (`client.js`)**:
    *   A local Node.js application launched by the OS.
    *   **Network Side**: Speaks CVCP (TCP) to the remote server.
    *   **Local Side**: Speaks WebSocket to the browser.
    *   Acts as a transparent bridge/translator.

3.  **Protocol Handler (`CVCPHandler.app`)**:
    *   A macOS Application Bundle.
    *   Registers the `cvcp://` scheme with the operating system.
    *   Parses the URL and launches the Client Proxy.

4.  **User Interface**:
    *   Standard HTML5/JS application.
    *   Uses WebRTC for peer-to-peer media streaming.
    *   Displays connection status and custom protocol details.

## 5. Implementation Plan & Status

| Phase | Task | Status |
| :--- | :--- | :--- |
| **Phase 1** | **Protocol Design** | ✅ Completed |
| | Define binary packet structure | Done |
| | Implement `SimpleCipher` encryption | Done |
| **Phase 2** | **Core Infrastructure** | ✅ Completed |
| | Build Raw TCP Server | Done |
| | Build Client Proxy Bridge | Done |
| **Phase 3** | **OS Integration** | ✅ Completed |
| | Create AppleScript Launcher | Done |
| | Compile `.app` bundle | Done |
| | Register `cvcp://` scheme in Info.plist | Done |
| **Phase 4** | **Frontend & Testing** | ✅ Completed |
| | Develop WebRTC UI | Done |
| | End-to-End Connection Test | Done |

## 6. Conclusion
The CVCP project successfully demonstrates that web applications can leverage custom, low-level networking protocols without sacrificing the flexibility of the browser UI. By using a local proxy architecture, we have achieved a "clean slate" transport layer that is fully under our control, secure, and highly optimized.
