# Final Project Presentation: Custom Video Call Protocol (CVCP)

**Time Limit:** 15 Minutes  
**Team Size:** 3 Members  

---

## 1. Team Roles & Contributions

Before the presentation begins, here is the breakdown of what each member contributed to the project:

*   **Person 1: Frontend & Application Layer**
    *   **Responsibility:** Designed the User Interface and implemented the WebRTC logic for peer-to-peer media streaming.
    *   **Key Code:** `public/index.html`, `public/app.js`, `public/benchmark.html`.
    *   **Focus:** User experience, media stream handling, and the real-time benchmark visualization.

*   **Person 2: System Architecture & OS Integration**
    *   **Responsibility:** Designed the "Client Proxy" architecture and the macOS protocol handler.
    *   **Key Code:** `client.js`, `register.js`, AppleScript automation.
    *   **Focus:** Bridging the gap between the browser and raw TCP sockets, ensuring `cvcp://` links launch the app automatically.

*   **Person 3: Network Protocol & Backend**
    *   **Responsibility:** Designed the custom binary protocol (CVCP) and the raw TCP signaling server.
    *   **Key Code:** `server.js`, `lib/protocol.js`.
    *   **Focus:** Binary packet framing, custom XOR encryption, and low-latency server performance (Nagle's algorithm optimization).

---

## 2. Presentation Script (15 Minutes)

### **Part 1: Introduction & The Problem (0:00 - 3:00)**
**Speaker: Person 1**

*   **Hook:** "We all use video calling apps daily—Zoom, Teams, Meet. They all run on standard web protocols like HTTP and WebSocket. But have you ever wondered if there's a faster, lighter way?"
*   **The Problem:**
    *   Explain that HTTP is "chatty." It sends heavy text headers (`User-Agent`, `Cookie`, `Accept`) with every single request.
    *   For a real-time application, this overhead adds latency (lag).
    *   Standard HTTPS requires complex TLS handshakes which are computationally expensive for simple local networks.
*   **The Goal:** "We wanted to build a video calling app that strips away all the web bloat. We wanted **Raw TCP** speed with the convenience of a **Web Browser** interface."
*   **Project Overview:** "Introducing **CVCP (Custom Video Call Protocol)**. A hybrid application that uses a custom binary protocol for signaling, running over raw TCP, bypassing standard HTTP entirely."

### **Part 2: The Architecture - "How we cheated the Browser" (3:00 - 6:00)**
**Speaker: Person 2**

*   **The Challenge:** "Browsers are sandboxed. You cannot open a raw TCP socket from Chrome or Safari. You are forced to use HTTP or WebSocket. So, how did we get raw TCP?"
*   **The Solution: The Client Proxy.**
    *   *Show Diagram of Architecture.*
    *   Explain the flow:
        1.  User clicks a `cvcp://` link (like `mailto:`).
        2.  **OS Integration:** We wrote a macOS Protocol Handler (compiled via AppleScript) that catches this link.
        3.  **The Bridge:** The OS launches our local Node.js "Client Proxy."
        4.  **The Split:** This proxy talks **WebSocket** to the browser (locally) and **Raw TCP** to the internet.
*   **Why this is cool:** "We effectively 'tricked' the browser. The browser thinks it's talking to a local server, but that local server is actually a gateway to our high-performance custom network."

### **Part 3: The Protocol & Security (6:00 - 9:00)**
**Speaker: Person 3**

*   **The Protocol (CVCP):**
    *   "Instead of JSON text, we send binary packets."
    *   **Packet Structure:** `[Length (4 bytes)] [Type (1 byte)] [Payload]`
    *   Explain **Framing**: "TCP is a stream, not a queue. We had to manually write code to chop the stream into distinct messages. If two messages arrive at once, our code separates them."
*   **Optimization:**
    *   "We disabled **Nagle's Algorithm** (`TCP_NODELAY`). Nagle's waits to fill a packet before sending, which causes lag. We force packets out immediately."
*   **Security (Custom Encryption vs. Standard TLS):**
    *   **The Strategy:** "We prioritized **Latency over Complexity**. Standard TLS handshakes are slow. We wrote a custom `SimpleCipher`."
    *   **The Algorithm:** "It uses a SHA-256 derived key with XOR-Rotation. It is lightweight and prevents packet sniffing (e.g., Wireshark sees garbage)."
    *   **Is it Safe?** "Crucial distinction: The **Video/Audio** stream is handled by WebRTC, which enforces **DTLS-SRTP** (military-grade encryption) automatically. Our custom protocol only handles the *signaling* (connection setup). So, the media is secure, and the signaling is obfuscated for speed."

### **Part 4: Live Demo & Benchmarking (9:00 - 12:00)**
**Speaker: Person 1 & Person 2**

*   **The Demo (Person 1):**
    *   Launch the server.
    *   Click the `cvcp://` link.
    *   Show the app opening automatically.
    *   Join a room and show video streaming (WebRTC).
*   **The Benchmark (Person 2):**
    *   "We didn't just build it; we measured it."
    *   Open the **Speed Test** page.
    *   **Visual Comparison:** Show the Green Line (CVCP) vs. the Orange Line (HTTP).
    *   **Explain the Graph:** "Look at the jitter on the HTTP line. That's the overhead of opening connections and parsing headers. Now look at CVCP—it's flat and near-zero latency because the pipe is already open and raw."

### **Part 5: Challenges & Conclusion (12:00 - 15:00)**
**Speaker: Person 3**

*   **Challenges Faced:**
    *   **TCP Fragmentation:** "Sometimes half a message arrives. We had to write a buffer manager to wait for the rest."
    *   **Browser Security:** "Modern browsers hate non-SSL connections. We had to carefully manage the local proxy to avoid 'Mixed Content' errors."
    *   **OS Permissions:** "Getting macOS to recognize a custom protocol required modifying `Info.plist` and signing the app."
*   **Future Scope:**
    *   Implement a proper Diffie-Hellman key exchange for better security.
    *   Add file sharing support using the binary protocol.
*   **Conclusion:** "CVCP proves that you don't need heavy web frameworks for real-time communication. By going low-level with Raw TCP and building a custom bridge, we achieved lower latency and complete control over our network traffic."
*   **Q&A**

---

## 3. Key Technical Terms to Mention
*   **Overhead:** The extra data (headers) sent with every HTTP request.
*   **Framing:** The process of identifying where one message ends and the next begins in a TCP stream.
*   **Nagle's Algorithm:** A TCP optimization that we disabled to reduce latency.
*   **Protocol Handler:** The OS mechanism that maps a URL scheme (`cvcp://`) to an application.
*   **WebRTC:** The technology used for the actual video/audio media stream (peer-to-peer).
