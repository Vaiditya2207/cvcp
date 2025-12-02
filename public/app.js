// Protocol Constants (Must match server)
const TYPES = {
    HANDSHAKE: 0x01,
    SIGNALING: 0x02,
    ROOM_CONTROL: 0x03,
    KEEPALIVE: 0x04
};

class App {
    constructor() {
        this.ws = null;
        this.localStream = null;
        this.peers = new Map(); // peerId -> RTCPeerConnection
        this.roomId = null;
        
        this.config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };

        this.initUI();
        this.connectBridge();
    }

    initUI() {
        this.joinScreen = document.getElementById('join-screen');
        this.callControls = document.getElementById('call-controls');
        this.localVideo = document.getElementById('local-video');
        this.videoGrid = document.getElementById('video-grid');
        this.status = document.getElementById('status');

        // Display target URL
        const params = new URLSearchParams(location.search);
        const target = params.get('target');
        if (target) {
            const targetEl = document.getElementById('connection-target');
            if (targetEl) targetEl.textContent = target;
        }

        document.getElementById('join-btn').onclick = () => {
            const room = document.getElementById('room-input').value;
            if (room) this.joinRoom(room);
        };

        document.getElementById('leave-btn').onclick = () => location.reload();
    }

    connectBridge() {
        // Connect to the Local Client Proxy
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${location.host}`);

        this.ws.onopen = () => {
            this.status.textContent = 'Connected to Proxy';
            this.status.style.color = '#00ff88';
        };

        this.ws.onmessage = (event) => {
            const packet = JSON.parse(event.data);
            this.handlePacket(packet);
        };

        this.ws.onclose = () => {
            this.status.textContent = 'Disconnected';
            this.status.style.color = '#ff4444';
        };
    }

    send(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }

    handlePacket(packet) {
        const { type, payload } = packet;

        switch (type) {
            case TYPES.HANDSHAKE:
                console.log('Handshake confirmed:', payload);
                break;
            
            case TYPES.ROOM_CONTROL:
                if (payload.event === 'joined') {
                    this.joinScreen.style.display = 'none';
                    this.callControls.style.display = 'flex';
                    this.roomId = payload.roomId;
                } else if (payload.event === 'peer-joined') {
                    console.log('Peer joined:', payload.peerId);
                    this.createPeer(payload.peerId, true); // Initiator
                } else if (payload.event === 'peer-left') {
                    this.removePeer(payload.peerId);
                }
                break;

            case TYPES.SIGNALING:
                this.handleSignaling(payload);
                break;
        }
    }

    async joinRoom(roomId) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            this.localVideo.srcObject = this.localStream;
            
            this.send(TYPES.ROOM_CONTROL, { action: 'join', roomId });
        } catch (e) {
            alert('Could not access camera: ' + e.message);
        }
    }

    async createPeer(peerId, initiator) {
        if (this.peers.has(peerId)) return;

        const pc = new RTCPeerConnection(this.config);
        this.peers.set(peerId, pc);

        // Add local tracks
        this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

        // Handle remote tracks
        pc.ontrack = (e) => {
            let video = document.getElementById(`video-${peerId}`);
            if (!video) {
                video = document.createElement('video');
                video.id = `video-${peerId}`;
                video.autoplay = true;
                video.playsInline = true;
                this.videoGrid.appendChild(video);
            }
            video.srcObject = e.streams[0];
        };

        // Handle ICE
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.send(TYPES.SIGNALING, {
                    targetId: peerId,
                    type: 'candidate',
                    candidate: e.candidate
                });
            }
        };

        if (initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.send(TYPES.SIGNALING, {
                targetId: peerId,
                type: 'offer',
                sdp: offer
            });
        }

        return pc;
    }

    async handleSignaling(payload) {
        const { from, type, sdp, candidate } = payload;
        let pc = this.peers.get(from);

        if (!pc) {
            if (type === 'offer') {
                pc = await this.createPeer(from, false);
            } else {
                return; // Ignore stray messages
            }
        }

        if (type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.send(TYPES.SIGNALING, {
                targetId: from,
                type: 'answer',
                sdp: answer
            });
        } else if (type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } else if (type === 'candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    removePeer(peerId) {
        const pc = this.peers.get(peerId);
        if (pc) {
            pc.close();
            this.peers.delete(peerId);
        }
        const video = document.getElementById(`video-${peerId}`);
        if (video) video.remove();
    }
}

new App();
