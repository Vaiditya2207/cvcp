const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { TYPES, SimpleCipher, Packet } = require('./lib/protocol');

// Configuration
const args = process.argv.slice(2);
let REMOTE_HOST = 'localhost';
let REMOTE_PORT = 9000;
let TARGET_URL = 'cvcp://localhost:9000';

if (args.length > 0) {
    try {
        // Expected format: cvcp://host:port
        // Handle cases where the OS might pass the URL with a trailing slash
        let urlStr = args[0];
        if (!urlStr.startsWith('cvcp://')) {
             // Fallback if just host:port passed
             urlStr = 'cvcp://' + urlStr;
        }
        
        const url = new URL(urlStr);
        if (url.protocol === 'cvcp:') {
            REMOTE_HOST = url.hostname;
            REMOTE_PORT = parseInt(url.port) || 9000;
            TARGET_URL = urlStr;
        }
    } catch (e) {
        console.error('Invalid CVCP URL:', args[0]);
    }
}

const LOCAL_UI_PORT = 0; // 0 = Random free port

const cipher = new SimpleCipher('my-secret-video-key');

// 1. Start Local HTTP Server for UI
const httpServer = http.createServer((req, res) => {
    // Parse URL to handle query parameters correctly
    const u = new URL(req.url, 'http://localhost');
    let pathname = u.pathname;

    // Basic static file server
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    
    // Prevent directory traversal
    if (!filePath.startsWith(path.join(__dirname, 'public'))) {
        res.writeHead(403);
        res.end();
        return;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
        } else {
            const ext = path.extname(filePath);
            const contentType = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css'
            }[ext] || 'text/plain';
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// 2. Start Local WebSocket Server (Bridge)
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
    console.log('[Bridge] UI Connected');
    
    // 3. Connect to Real CVCP Server via TCP
    const tcpClient = new net.Socket();
    // Disable Nagle's algorithm
    tcpClient.setNoDelay(true);

    let buffer = Buffer.alloc(0);

    tcpClient.connect(REMOTE_PORT, REMOTE_HOST, () => {
        console.log('[Bridge] Connected to CVCP Server');
        // Send handshake
        const packet = Packet.encode(TYPES.HANDSHAKE, { agent: 'cvcp-proxy' }, cipher);
        tcpClient.write(packet);
    });

    // TCP -> WebSocket
    tcpClient.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { packets, remaining } = Packet.decode(buffer, cipher);
        buffer = remaining;

        packets.forEach(packet => {
            // Forward decoded packet to UI
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(packet));
            }
        });
    });

    // WebSocket -> TCP
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // data should be { type: ..., payload: ... }
            const packet = Packet.encode(data.type, data.payload, cipher);
            tcpClient.write(packet);
        } catch (e) {
            console.error('Bridge error:', e);
        }
    });

    // Cleanup
    ws.on('close', () => tcpClient.destroy());
    tcpClient.on('close', () => ws.close());
    tcpClient.on('error', (err) => {
        console.error('[Bridge] TCP Error:', err.message);
        ws.close();
    });
});

// Start everything
httpServer.listen(LOCAL_UI_PORT, '127.0.0.1', () => {
    const port = httpServer.address().port;
    console.log(`[Client Proxy] Running on http://127.0.0.1:${port}`);
    console.log(`[Client Proxy] Bridging to ${TARGET_URL}`);
    
    // Open the UI in default browser
    const { exec } = require('child_process');
    // Pass the target CVCP URL to the frontend via query param
    exec(`open "http://127.0.0.1:${port}/?target=${encodeURIComponent(TARGET_URL)}"`);
});
