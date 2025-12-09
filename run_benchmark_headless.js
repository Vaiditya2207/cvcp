const net = require('net');
const http = require('http');
const { fork } = require('child_process');
const { TYPES, SimpleCipher, Packet } = require('./lib/protocol');

const SERVER_PORT = 9000;
const HTTP_PORT = 9001;
const HOST = 'localhost';
const SAMPLES = 100;

const cipher = new SimpleCipher('my-secret-video-key');

async function runBenchmark() {
    console.log("Starting Server...");
    const serverProcess = fork('./server.js', [], { stdio: 'pipe' });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    const results = {
        cvcp: [],
        http: []
    };

    try {
        console.log("Running CVCP Benchmark...");
        results.cvcp = await runCvcpBenchmark();
        
        console.log("Running HTTP Benchmark...");
        results.http = await runHttpBenchmark();

        console.log("Benchmark Complete.");
        console.log(`CVCP Mean: ${mean(results.cvcp).toFixed(2)}ms`);
        console.log(`HTTP Mean: ${mean(results.http).toFixed(2)}ms`);

        const fs = require('fs');
        fs.writeFileSync('benchmark_results.json', JSON.stringify(results, null, 2));

    } catch (e) {
        console.error("Benchmark failed:", e);
    } finally {
        serverProcess.kill();
        process.exit(0);
    }
}

function runCvcpBenchmark() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const latencies = [];
        let sentCount = 0;
        let receivedCount = 0;
        let buffer = Buffer.alloc(0);

        socket.setNoDelay(true);

        socket.connect(SERVER_PORT, HOST, () => {
            // Handshake
            const packet = Packet.encode(TYPES.HANDSHAKE, { agent: 'benchmark' }, cipher);
            socket.write(packet);
        });

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            const { packets, remaining } = Packet.decode(buffer, cipher);
            buffer = remaining;

            packets.forEach(packet => {
                if (packet.type === TYPES.HANDSHAKE) {
                    // Start benchmarking
                    sendPing();
                } else if (packet.type === TYPES.BENCHMARK) {
                    const now = Date.now(); // Use Date.now() for consistency with payload
                    // In high-res timer, process.hrtime() is better, but let's stick to ms for simplicity and matching browser
                    // Actually, let's use process.hrtime for better precision in Node
                    const sentTime = packet.payload.ts;
                    const latency = now - sentTime;
                    latencies.push(latency);
                    receivedCount++;

                    if (receivedCount < SAMPLES) {
                        setTimeout(sendPing, 10); // Small delay to not flood too crazy
                    } else {
                        socket.end();
                        resolve(latencies);
                    }
                }
            });
        });

        function sendPing() {
            const payload = { ts: Date.now(), id: sentCount++ };
            const packet = Packet.encode(TYPES.BENCHMARK, payload, cipher);
            socket.write(packet);
        }

        socket.on('error', reject);
    });
}

function runHttpBenchmark() {
    return new Promise(async (resolve, reject) => {
        const latencies = [];
        const agent = new http.Agent({ keepAlive: true });

        for (let i = 0; i < SAMPLES; i++) {
            const start = Date.now();
            try {
                await new Promise((res, rej) => {
                    const req = http.request({
                        hostname: HOST,
                        port: HTTP_PORT,
                        path: '/ping',
                        method: 'GET',
                        agent: agent
                    }, (response) => {
                        response.on('data', () => {}); // Consume data
                        response.on('end', () => {
                            const end = Date.now();
                            latencies.push(end - start);
                            res();
                        });
                    });
                    req.on('error', rej);
                    req.end();
                });
                await new Promise(r => setTimeout(r, 10));
            } catch (e) {
                console.error(e);
            }
        }
        resolve(latencies);
    });
}

function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

runBenchmark();
