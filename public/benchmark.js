const TYPES = {
    HANDSHAKE: 0x01,
    SIGNALING: 0x02,
    ROOM_CONTROL: 0x03,
    KEEPALIVE: 0x04,
    BENCHMARK: 0x05
};

class Benchmark {
    constructor() {
        this.ws = null;
        this.running = false;
        
        // CVCP Stats
        this.latencyHistory = new Array(50).fill(0);
        this.packetsSent = 0;
        this.startTime = 0;

        // HTTP Stats
        this.httpLatencyHistory = new Array(50).fill(0);
        this.httpReqsSent = 0;
        this.httpStartTime = 0;
        
        this.canvas = document.getElementById('graph');
        this.ctx = this.canvas.getContext('2d');
        
        // Fix canvas resolution
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;

        this.init();
    }

    init() {
        document.getElementById('start-btn').onclick = () => this.toggle();
        this.connect();
        this.drawGraph();
    }

    connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${location.host}`);

        this.ws.onopen = () => {
            console.log('Connected to Proxy');
        };

        this.ws.onmessage = (event) => {
            const packet = JSON.parse(event.data);
            if (packet.type === TYPES.BENCHMARK) {
                this.handlePong(packet.payload);
            }
        };
    }

    toggle() {
        if (this.running) {
            this.running = false;
            document.getElementById('start-btn').textContent = "START BENCHMARK";
            document.getElementById('start-btn').style.background = "#00ff88";
        } else {
            this.running = true;
            document.getElementById('start-btn').textContent = "STOP";
            document.getElementById('start-btn').style.background = "#ff4444";
            this.loop();
            this.loopHttp();
        }
    }

    loop() {
        if (!this.running) return;

        const now = Date.now();
        const payload = { ts: now, id: this.packetsSent++ };
        
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: TYPES.BENCHMARK,
                payload: payload
            }));
        }

        // Update PPS
        const elapsed = (Date.now() - this.startTime) / 1000;
        if (elapsed > 1) {
            document.getElementById('pps').textContent = Math.round(this.packetsSent / elapsed);
            this.packetsSent = 0;
            this.startTime = Date.now();
        }

        // Schedule next ping (aim for ~20 packets/second)
        setTimeout(() => this.loop(), 50); 
    }

    async loopHttp() {
        if (!this.running) return;

        const start = Date.now();
        try {
            // Hit the HTTP server on port 9001
            // Note: We assume the server is on the same hostname as the page
            const hostname = location.hostname; 
            await fetch(`http://${hostname}:9001/ping`);
            
            const end = Date.now();
            const rtt = end - start;
            
            this.handleHttpPong(rtt);
            this.httpReqsSent++;
        } catch (e) {
            console.error("HTTP Benchmark failed:", e);
        }

        // Update RPS
        const elapsed = (Date.now() - this.httpStartTime) / 1000;
        if (elapsed > 1) {
            document.getElementById('http-rps').textContent = Math.round(this.httpReqsSent / elapsed);
            this.httpReqsSent = 0;
            this.httpStartTime = Date.now();
        }

        // Schedule next HTTP request
        if (this.running) {
            setTimeout(() => this.loopHttp(), 50);
        }
    }

    handlePong(payload) {
        const now = Date.now();
        const rtt = now - payload.ts;
        
        document.getElementById('latency').textContent = rtt + 'ms';
        
        this.latencyHistory.push(rtt);
        this.latencyHistory.shift();
        this.drawGraph();
    }

    handleHttpPong(rtt) {
        document.getElementById('http-latency').textContent = rtt + 'ms';
        
        this.httpLatencyHistory.push(rtt);
        this.httpLatencyHistory.shift();
        this.drawGraph();
    }

    drawGraph() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, h);

        // Find max scale (Auto-scale, but minimum 5ms to see small details)
        const maxLatency = Math.max(5, ...this.latencyHistory, ...this.httpLatencyHistory);
        const step = w / (this.latencyHistory.length - 1);

        // Helper to draw line
        const drawLine = (data, color) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < data.length; i++) {
                const val = data[i];
                const y = h - (val / maxLatency * h * 0.8) - 10;
                const x = i * step;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };

        // Draw HTTP (Orange)
        drawLine(this.httpLatencyHistory, '#ffaa00');

        // Draw CVCP (Green)
        drawLine(this.latencyHistory, '#00ff88');

        // Draw grid lines
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h/2);
        ctx.lineTo(w, h/2);
        ctx.stroke();
    }
}

new Benchmark();
