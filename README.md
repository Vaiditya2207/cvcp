# Local Video Call Application

A simple, lightweight video calling application for two people on the same local network (WiFi). Works without internet connection!

## Features

- Real-time video and audio calling
- Works on local network without internet
- Simple web interface
- Toggle video/audio on and off
- Room-based connections
- Lightweight and fast

## Quick Start

1. **Install dependencies:**
 ```bash
 npm install
 ```

2. **Start the server:**
 ```bash
 npm start
 ```

3. **Access the application:**
 - Open your browser to the address shown in the terminal
 - Share the network URL with the other person
 - Both users should use the same Room ID
 - Click "Join Room" then "Start Call"

## How to Use

1. **Make sure both devices are on the same WiFi network**
2. **Start the server** on one device (can be either device)
3. **Both users open the application** in their web browsers using the network URL
4. **Enter the same Room ID** (e.g., "room1")
5. **Click "Join Room"** - this will ask for camera/microphone permission
6. **Click "Start Call"** - the other person will get a call notification
7. **Accept the call** and enjoy your video chat!

## Browser Requirements

- Modern web browser with WebRTC support (Chrome, Firefox, Safari, Edge)
- Camera and microphone access permission

## Network Requirements

- Both devices must be on the same WiFi network
- No internet connection required (works completely offline)

## Troubleshooting

- **Can't connect?** Make sure both devices are on the same WiFi
- **No video/audio?** Check browser permissions for camera/microphone
- **Connection fails?** Try refreshing the page and rejoining the room

## Technical Details

- Uses WebRTC for peer-to-peer video calling
- Node.js WebSocket server for signaling
- No external dependencies for calling (works offline)
- STUN servers used only for NAT traversal (not required for local network)

Enjoy your private, local video calls! 