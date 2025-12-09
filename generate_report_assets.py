import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

# Load data
with open('benchmark_results.json', 'r') as f:
    data = json.load(f)

cvcp_data = data['cvcp']
http_data = data['http']

# Ensure we have data
if not cvcp_data or not http_data:
    print("No data found in benchmark_results.json")
    exit(1)

# 1. Latency Comparison Line Chart
plt.figure(figsize=(10, 6))
plt.plot(cvcp_data, label='CVCP (Raw TCP)', color='green', linewidth=2)
plt.plot(http_data, label='HTTP (Standard)', color='orange', linewidth=2, linestyle='--')
plt.title('Latency Comparison: CVCP vs HTTP')
plt.xlabel('Sample Index')
plt.ylabel('Latency (ms)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.savefig('figures/latency_comparison.png')
plt.close()

# 2. Latency Distribution Box Plot
plt.figure(figsize=(8, 6))
plt.boxplot([cvcp_data, http_data], labels=['CVCP', 'HTTP'], patch_artist=True,
            boxprops=dict(facecolor='lightblue', color='blue'),
            medianprops=dict(color='red'))
plt.title('Latency Distribution')
plt.ylabel('Latency (ms)')
plt.grid(True, axis='y', alpha=0.3)
plt.savefig('figures/latency_distribution.png')
plt.close()

# 3. Architecture Diagram
fig, ax = plt.subplots(figsize=(12, 8))
ax.set_xlim(0, 12)
ax.set_ylim(0, 8)
ax.axis('off')

# Define boxes
def draw_box(x, y, w, h, text, color='white'):
    rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1", linewidth=2, edgecolor='black', facecolor=color)
    ax.add_patch(rect)
    ax.text(x + w/2, y + h/2, text, ha='center', va='center', fontsize=10, fontweight='bold')
    # Return center, right, left, top, bottom coordinates
    return x+w/2, y+h/2, x+w, y+h/2, x, y+h/2, x+w/2, y+h, x+w/2, y

# Browser
bcx, bcy, brx, bry, blx, bly, btx, bty, bbx, bby = draw_box(1, 4, 2, 3, "Web Browser\n(Chrome/Safari)\n\nUI: HTML/JS\nWebRTC Media", '#e1f5fe')

# Client Proxy
pcx, pcy, prx, pry, plx, ply, ptx, pty, pbx, pby = draw_box(5, 4, 2, 3, "Client Proxy\n(Node.js)\n\nLocal WebSocket\nProtocol Bridge", '#fff9c4')

# Internet Cloud
cloud = patches.Ellipse((9, 5.5), 3, 2, facecolor='#f3e5f5', edgecolor='gray', linestyle='--')
ax.add_patch(cloud)
ax.text(9, 5.5, "Internet", ha='center', va='center', color='gray')

# Server
scx, scy, srx, sry, slx, sly, stx, sty, sbx, sby = draw_box(8, 2, 2, 2, "CVCP Server\n(Node.js)\n\nRaw TCP\nSignaling", '#e8f5e9')

# Arrows
# Browser <-> Proxy (WebSocket)
ax.annotate("", xy=(plx, ply), xytext=(brx, bry), arrowprops=dict(arrowstyle="<->", lw=2, color='blue'))
ax.text((plx+brx)/2, pcy+0.2, "WebSocket\n(ws://localhost)", ha='center', fontsize=8, color='blue')

# Proxy <-> Server (TCP)
ax.annotate("", xy=(slx, sly+1), xytext=(prx, pry), arrowprops=dict(arrowstyle="<->", lw=2, color='red'))
ax.text((prx+slx)/2, (pcy+scy+1)/2 + 0.2, "Raw TCP\n(cvcp://)", ha='center', fontsize=8, color='red')

# Browser <-> Peer (WebRTC)
ax.annotate("", xy=(2, 1), xytext=(2, 4), arrowprops=dict(arrowstyle="<->", lw=2, color='purple', linestyle='dashed'))
ax.text(2, 2.5, "WebRTC Media\n(P2P UDP)", ha='center', fontsize=8, color='purple', rotation=90)

# Peer Box
draw_box(1, 0, 2, 1, "Peer User", '#e1f5fe')

plt.title('CVCP System Architecture')
plt.savefig('figures/architecture_diagram.png')
plt.close()

print("Assets generated in figures/")
