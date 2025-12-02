class LocalVideoCall {
  constructor() {
    // Signaling
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    // Identity
    this.selfId = null;
    this.name = "";
    // Room / Call
    this.roomId = null;
    this.isInCall = false;
    this.callInitiator = false;
    // Media
    this.localStream = null;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
    // Peers map: peerId -> { pc, stream, videoEl, pendingIce: [], name }
    this.peers = new Map();
    // UI
    this.currentMainPeerId = null; // whose video is on main stage
    // Ringtone
    this.ringCtx = null;
    this.ringInterval = null;

    // WebRTC configuration - with STUN servers for NAT traversal
    this.config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
      iceCandidatePoolSize: 10,
    };

    this.initializeElements();
    this.setupEventListeners();
    this.connectToSignalingServer();
  }

  initializeElements() {
    // Screens
    this.screenHome = document.getElementById("screen-home");
    this.screenCall = document.getElementById("screen-call");
    // Home
    this.displayNameInput = document.getElementById("displayName");
    this.createRoomBtn = document.getElementById("createRoomBtn");
    this.showJoinBtn = document.getElementById("showJoinBtn");
    this.roomIdInput = document.getElementById("roomId");
    this.joinBtn = document.getElementById("joinBtn");
    // Call UI
    this.statusMessage = document.getElementById("statusMessage");
    this.roomLabel = document.getElementById("roomLabel");
    this.mainVideo = document.getElementById("mainVideo");
    this.localVideo = document.getElementById("localVideo");
    this.peerStrip = document.getElementById("peerStrip");
    this.startCallBtn = document.getElementById("startCallBtn");
    this.endCallBtn = document.getElementById("endCallBtn");
    this.toggleVideoBtn = document.getElementById("toggleVideoBtn");
    this.toggleAudioBtn = document.getElementById("toggleAudioBtn");
  }

  setupEventListeners() {
    // Home actions
    this.createRoomBtn.addEventListener("click", async () => {
      this.name = (this.displayNameInput.value || "").trim() || "Guest";
      const newRoomId = this.generateRoomId();
      await this.joinRoom(newRoomId);
    });
    this.showJoinBtn.addEventListener("click", () => {
      const row = document.getElementById("joinRow");
      row.style.display = row.style.display === "none" ? "flex" : "none";
    });
    this.joinBtn.addEventListener("click", async () => {
      this.name = (this.displayNameInput.value || "").trim() || "Guest";
      const rid = (this.roomIdInput.value || "").trim();
      if (!rid) return alert("Enter room ID");
      await this.joinRoom(rid);
    });
    this.roomIdInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.joinBtn.click();
    });
    // Call controls
    this.startCallBtn.addEventListener("click", () => this.startCall());
    this.endCallBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("End call button clicked");
      this.endCall();
    });
    this.toggleVideoBtn.addEventListener("click", () => this.toggleVideo());
    this.toggleAudioBtn.addEventListener("click", () => this.toggleAudio());
  }

  showScreen(name) {
    // Class-based
    this.screenHome.classList.remove("active");
    this.screenCall.classList.remove("active");
    if (name === "home") this.screenHome.classList.add("active");
    if (name === "call") this.screenCall.classList.add("active");
    // Style-based (extra safety)
    this.screenHome.style.display = name === "home" ? "flex" : "none";
    this.screenCall.style.display = name === "call" ? "block" : "none";
    console.log(" Switched screen to:", name);
  }

  generateRoomId() {
    const words = [
      "blue",
      "mint",
      "lava",
      "nova",
      "zen",
      "echo",
      "hawk",
      "iris",
      "jade",
      "kite",
      "luna",
      "neon",
      "opal",
      "pyro",
      "quad",
      "rift",
      "sage",
      "tide",
      "ultra",
      "vivo",
      "wave",
      "xeno",
      "yolo",
      "zinc",
    ];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${pick()}-${pick()}-${num}`;
  }

  async connectToSignalingServer() {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close existing socket if any
    if (this.socket) {
      try {
        this.socket.onclose = null;
        this.socket.onerror = null;
        this.socket.close();
      } catch (e) {
        // Ignore close errors
      }
      this.socket = null;
    }

    // Check reconnect limit
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        "Max reconnection attempts reached. Please refresh the page."
      );
      this.updateStatus("Connection failed - refresh page", "disconnected");
      return;
    }

    try {
      // Use WSS (Secure WebSocket)
      const secure = window.location.protocol === "https:";
      const port = window.location.port || "3000";
      // Construct URL that matches the server's expectation
      const cvcpUrl = `cvcp://${window.location.hostname}:${port}`;
      console.log("Connecting to signaling server (CVCP):", cvcpUrl);

      this.socket = new CVCPClient(cvcpUrl, { secure });

      this.socket.onopen = () => {
        console.log("Connected to signaling server (CVCP)");
        this.updateStatus("Connected to server", "connected");
        this.isConnected = true;
        this.reconnectAttempts = 0; // Reset on successful connection
      };

      this.socket.onclose = () => {
        console.log("Disconnected from signaling server");
        this.updateStatus("Disconnected from server", "disconnected");
        this.isConnected = false;
        this.socket = null;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(
            1000 * Math.pow(2, this.reconnectAttempts - 1),
            10000
          );
          console.log(
            `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
          );

          this.reconnectTimeout = setTimeout(() => {
            this.connectToSignalingServer();
          }, delay);
        }
      };

      this.socket.onerror = (error) => {
        console.error("Connection error:", error);
        this.isConnected = false;
        this.updateStatus("Server connection error", "disconnected");
      };

      this.socket.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      await this.socket.connect();
    } catch (error) {
      console.error("Failed to connect:", error);
      this.socket = null;
      this.updateStatus("Connection failed", "disconnected");

      // Exponential backoff for reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(
          1000 * Math.pow(2, this.reconnectAttempts - 1),
          10000
        );
        console.log(
          `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
        );

        this.reconnectTimeout = setTimeout(() => {
          this.connectToSignalingServer();
        }, delay);
      }
    }
  }

  async joinRoom(roomId) {
    if (this._joining) return;
    this._joining = true;

    if (!this.socket || !this.isConnected) {
      alert("Not connected to server yet. Please wait…");
      this._joining = false;
      return;
    }

    this.roomId = roomId;
    this.roomLabel.textContent = roomId;

    try {
      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      this.localVideo.srcObject = this.localStream;
      this.localVideo.onloadedmetadata = () =>
        this.localVideo.play().catch(() => {});

      const v = this.localStream.getVideoTracks()[0];
      if (v && "contentHint" in v) {
        try {
          v.contentHint = "detail";
        } catch {}
      }
    } catch (e) {
      console.error("Media error:", e);
      alert("Could not access camera/microphone.");
      this._joining = false;
      return;
    }

    this.showScreen("call");

    if (this.createRoomBtn) this.createRoomBtn.disabled = true;
    if (this.joinBtn) this.joinBtn.disabled = true;

    await this.socket.send(
      JSON.stringify({
        type: "join-room",
        roomId: this.roomId,
        name: this.name,
      })
    );

    this.updateStatus(`Joined room: ${this.roomId}`, "waiting");
    this._joining = false;
  }

  async handleSignalingMessage(message) {
    console.log("Received:", message.type);

    switch (message.type) {
      case "welcome":
        this.selfId = message.clientId;
        console.log("Assigned client ID:", this.selfId);
        break;

      case "room-joined":
        this.selfId = message.clientId;
        this.updateStatus(`In room: ${this.roomId}`, "waiting");

        // Create peer connections for existing peers
        if (message.peers && message.peers.length > 0) {
          console.log(` ${message.peers.length} peer(s) in room`);
          for (const peer of message.peers) {
            this.ensurePeerRecord(peer.clientId, peer.name);
          }
          // Auto-start call if there are peers already in the room
          if (!this.isInCall) {
            this.startCall();
          }
        }
        this.renderPeerStrip();
        break;

      case "peer-joined":
        console.log(`Peer joined: ${message.name}`);
        this.ensurePeerRecord(message.clientId, message.name);
        this.renderPeerStrip();
        
        // Auto-start call with the new peer if we're already in call
        if (this.isInCall) {
          this.createPeerConnection(message.clientId, true);
        } else {
          // Start call if this is the first peer
          this.startCall();
        }
        break;

      case "peer-left":
        console.log(`Peer left: ${message.clientId}`);
        this.closePeer(message.clientId);
        this.renderPeerStrip();
        break;

      case "offer":
        await this.handleOffer(message.from, message.data);
        break;

      case "answer":
        await this.handleAnswer(message.from, message.data);
        break;

      case "ice-candidate":
        await this.handleIceCandidate(message.from, message.data);
        break;

      case "error":
        alert(message.message);
        break;
    }
  }

  ensurePeerRecord(peerId, peerName) {
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, {
        pc: null,
        stream: null,
        videoEl: null,
        pendingIce: [],
        name: peerName || "Guest",
      });
    } else {
      const p = this.peers.get(peerId);
      p.name = peerName || p.name;
    }
  }

  renderPeerStrip() {
    this.peerStrip.innerHTML = "";
    for (const [pid, pData] of this.peers) {
      const tile = document.createElement("div");
      tile.className = "peer-tile";
      tile.style.position = "relative";
      tile.onclick = () => this.bringToMain(pid);

      if (pData.videoEl) {
        pData.videoEl.style.width = "100%";
        pData.videoEl.style.height = "100%";
        pData.videoEl.style.objectFit = "cover";
        tile.appendChild(pData.videoEl);
      } else {
        tile.textContent = pData.name || "Peer";
      }

      const label = document.createElement("div");
      label.textContent = pData.name || "Peer";
      label.style.position = "absolute";
      label.style.bottom = "4px";
      label.style.left = "4px";
      label.style.right = "4px";
      label.style.background = "rgba(0,0,0,0.6)";
      label.style.fontSize = "11px";
      label.style.padding = "2px 4px";
      label.style.borderRadius = "4px";
      label.style.textAlign = "center";
      tile.appendChild(label);

      this.peerStrip.appendChild(tile);
    }
  }

  bringToMain(peerId) {
    const pData = this.peers.get(peerId);
    if (!pData || !pData.videoEl) return;

    if (this.currentMainPeerId) {
      const oldMain = this.peers.get(this.currentMainPeerId);
      if (oldMain && oldMain.videoEl) {
        oldMain.videoEl.pause();
      }
    }

    this.mainVideo.srcObject = pData.stream;
    this.mainVideo.play().catch(() => {});
    this.currentMainPeerId = peerId;
  }

  async startCall() {
    if (this.isInCall) return;
    console.log("Starting call with all peers");
    this.isInCall = true;
    this.updateStatus("In call…", "in-call");
    this.startCallBtn.classList.add("hidden");
    this.endCallBtn.classList.remove("hidden");

    for (const [peerId] of this.peers) {
      await this.createPeerConnection(peerId, true);
    }
  }

  async createPeerConnection(peerId, initiator = false) {
    const pData = this.peers.get(peerId);
    if (!pData) return;

    if (pData.pc) {
      console.log(`Peer connection already exists for ${peerId}`);
      return;
    }

    console.log(
      ` Creating peer connection with ${pData.name} (initiator: ${initiator})`
    );
    const pc = new RTCPeerConnection(this.config);
    pData.pc = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${pData.name}:`, event.candidate.type);
        this.socket.send(
          JSON.stringify({
            type: "ice-candidate",
            targetId: peerId,
            data: event.candidate,
          })
        );
      } else {
        console.log(`ICE gathering complete for ${pData.name}`);
      }
    };

    pc.ontrack = (event) => {
      console.log(` Received track from ${pData.name}:`, event.track.kind);
      
      // Only update stream once we have it
      if (event.streams && event.streams[0]) {
        pData.stream = event.streams[0];
        
        if (!pData.videoEl) {
          const video = document.createElement("video");
          video.autoplay = true;
          video.playsInline = true;
          video.muted = false;
          pData.videoEl = video;
        }

        // Only set srcObject if it's different or null
        if (pData.videoEl.srcObject !== pData.stream) {
          pData.videoEl.srcObject = pData.stream;
          pData.videoEl.play().catch(e => console.error("Error playing video:", e));
        }
        
        this.renderPeerStrip();

        if (!this.currentMainPeerId) {
          this.bringToMain(peerId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${pData.name}: ${pc.iceConnectionState}`);
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${pData.name}: ${pc.connectionState}`);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        console.warn(`Connection with ${pData.name} ${pc.connectionState}`);
      }
    };

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    if (initiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await this.socket.send(
          JSON.stringify({
            type: "offer",
            targetId: peerId,
            data: offer,
          })
        );
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    }

    // Process any pending ICE candidates
    for (const cand of pData.pendingIce) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.error("Error adding pending ICE:", err);
      }
    }
    pData.pendingIce = [];
  }

  async handleOffer(from, offer) {
    console.log(`Received offer from ${from}`);

    if (!this.isInCall) {
      console.log("Not in call yet, auto-accepting...");
      this.isInCall = true;
      this.updateStatus("In call…", "in-call");
      this.startCallBtn.classList.add("hidden");
      this.endCallBtn.classList.remove("hidden");
    }

    const pData = this.peers.get(from);
    if (!pData) {
      console.warn(`No peer record for ${from}`);
      return;
    }

    await this.createPeerConnection(from, false);

    try {
      await pData.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pData.pc.createAnswer();
      await pData.pc.setLocalDescription(answer);

      await this.socket.send(
        JSON.stringify({
          type: "answer",
          targetId: from,
          data: answer,
        })
      );
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  }

  async handleAnswer(from, answer) {
    console.log(`Received answer from ${from}`);
    const pData = this.peers.get(from);
    if (!pData || !pData.pc) return;

    try {
      if (pData.pc.signalingState === "stable") {
        console.warn("Ignoring duplicate answer while connection is stable");
        return;
      }
      await pData.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }

  async handleIceCandidate(from, candidate) {
    const pData = this.peers.get(from);
    if (!pData) return;

    if (!pData.pc || !pData.pc.remoteDescription) {
      pData.pendingIce.push(candidate);
      return;
    }

    try {
      await pData.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }

  closePeer(peerId) {
    const pData = this.peers.get(peerId);
    if (!pData) return;

    if (pData.pc) {
      pData.pc.close();
    }
    if (pData.videoEl) {
      pData.videoEl.srcObject = null;
    }

    this.peers.delete(peerId);

    if (this.currentMainPeerId === peerId) {
      this.currentMainPeerId = null;
      this.mainVideo.srcObject = null;

      // Switch to another peer if available
      for (const [pid] of this.peers) {
        this.bringToMain(pid);
        break;
      }
    }
  }

  async endCall() {
    if (!this.isInCall) {
      console.log("endCall called but already not in call, ignoring");
      return;
    }
    console.log("Ending call");
    console.trace("endCall stack trace");
    this.isInCall = false;
    this.updateStatus("Call ended", "waiting");
    this.startCallBtn.classList.remove("hidden");
    this.endCallBtn.classList.add("hidden");

    // Close all peer connections
    for (const [peerId] of this.peers) {
      const pData = this.peers.get(peerId);
      if (pData && pData.pc) {
        pData.pc.close();
        pData.pc = null;
      }
      if (pData && pData.videoEl) {
        pData.videoEl.srcObject = null;
      }
    }

    this.mainVideo.srcObject = null;
    this.currentMainPeerId = null;
    this.renderPeerStrip();

    // Leave room
    if (this.socket && this.isConnected) {
      await this.socket.send(
        JSON.stringify({
          type: "leave-room",
        })
      );
    }

    // Stop local media
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.localVideo.srcObject = null;
    this.peers.clear();
    this.roomId = null;

    // Go back to home
    this.showScreen("home");
    if (this.createRoomBtn) this.createRoomBtn.disabled = false;
    if (this.joinBtn) this.joinBtn.disabled = false;
  }

  toggleVideo() {
    if (!this.localStream) return;
    this.isVideoEnabled = !this.isVideoEnabled;

    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = this.isVideoEnabled;
    });

    this.toggleVideoBtn.textContent = this.isVideoEnabled
      ? "Video On"
      : "Video Blocked";
    this.toggleVideoBtn.style.background = this.isVideoEnabled
      ? "#1b2030"
      : "#ef4444";
  }

  toggleAudio() {
    if (!this.localStream) return;
    this.isAudioEnabled = !this.isAudioEnabled;

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = this.isAudioEnabled;
    });

    this.toggleAudioBtn.textContent = this.isAudioEnabled
      ? "Mic On"
      : "Mic Off";
    this.toggleAudioBtn.style.background = this.isAudioEnabled
      ? "#1b2030"
      : "#ef4444";
  }

  updateStatus(msg, state = "idle") {
    this.statusMessage.textContent = msg;

    const colors = {
      idle: "#9aa0a6",
      connected: "#22c55e",
      waiting: "#f59e0b",
      "in-call": "#4f46e5",
      disconnected: "#ef4444",
    };

    this.statusMessage.style.color = colors[state] || colors.idle;
  }
}

// Start the app
const app = new LocalVideoCall();
