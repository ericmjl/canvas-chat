# WebRTC signaling architecture

Canvas Chat uses a WebRTC-based peer-to-peer sync system built on top of Yjs CRDTs.
This document explains how the signaling server works and why we chose this approach.

## The signaling problem

WebRTC enables direct peer-to-peer connections between browsers, but peers need to
discover each other first. This is the "signaling" problem - how do two browsers
find each other on the internet?

The solution is a lightweight relay server that:

1. Accepts WebSocket connections from peers
2. Groups peers by "room" (session ID in our case)
3. Relays connection metadata (SDP offers/answers, ICE candidates)
4. Never sees or stores the actual sync data

Once peers exchange connection metadata, they establish a direct WebRTC connection
and sync data peer-to-peer without the server.

## Why build our own signaling server?

The y-webrtc package includes a Node.js signaling server, but we chose to implement
a compatible server in FastAPI/Python for several reasons:

1. **Single deployment**: We already deploy a FastAPI app to Modal. Adding a
   separate Node.js service would complicate deployment and monitoring.

2. **Protocol simplicity**: The y-webrtc signaling protocol is just four message
   types (`subscribe`, `unsubscribe`, `publish`, `ping`). Implementing it in
   Python is straightforward.

3. **Consistent stack**: Using Python/FastAPI for the entire backend makes the
   codebase easier to maintain.

## Protocol details

The signaling protocol uses JSON messages over WebSocket:

```text
subscribe   { "type": "subscribe", "topics": ["room-id-1", "room-id-2"] }
unsubscribe { "type": "unsubscribe", "topics": ["room-id-1"] }
publish     { "type": "publish", "topic": "room-id", ...payload... }
ping        { "type": "ping" }  ->  { "type": "pong" }
```

When a peer sends a `publish` message, the server broadcasts it to all other peers
subscribed to that topic. The server adds a `clients` field indicating how many
peers received the message.

## Statelessness

The signaling server is completely stateless:

- **No database**: All state lives in memory
- **No user data**: Only relays opaque connection metadata
- **Restart-safe**: Peers automatically reconnect and re-subscribe
- **Horizontally scalable**: Each server instance is independent

If the server restarts, peers will reconnect within seconds. The CRDTs ensure
eventual consistency even if some sync messages are lost during reconnection.

## Privacy guarantees

The signaling server provides strong privacy guarantees:

1. **Encrypted signaling**: y-webrtc supports optional password-based encryption
   for signaling messages, preventing man-in-the-middle attacks.

2. **No content visibility**: The server only sees room IDs (random UUIDs) and
   encrypted connection metadata. It never sees node content, chat messages,
   or any user data.

3. **Self-hosting option**: Users can run their own signaling server for
   maximum privacy.

## Architecture diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Canvas Chat Server                             │
│                                                                          │
│   ┌─────────────────┐                    ┌─────────────────────────┐    │
│   │  FastAPI App    │                    │  Signaling Manager      │    │
│   │  (HTTP/REST)    │                    │  (WebSocket)            │    │
│   │                 │                    │                         │    │
│   │  /api/chat      │                    │  /signal                │    │
│   │  /api/models    │                    │  ├── topics: Map        │    │
│   │  /api/...       │                    │  └── subscriptions: Map │    │
│   └─────────────────┘                    └─────────────────────────┘    │
│                                                    │                     │
└────────────────────────────────────────────────────│─────────────────────┘
                                                     │
        ┌────────────────────────────────────────────┼────────────────────┐
        │                                            │                    │
        ▼                                            ▼                    ▼
   ┌─────────┐                               ┌─────────────────────────────┐
   │ Browser │◄─────── WebRTC P2P ──────────►│         Browser            │
   │ (Peer A)│                               │         (Peer B)           │
   │         │                               │                            │
   │ ┌─────────────┐                         │ ┌─────────────┐            │
   │ │ CRDTGraph   │                         │ │ CRDTGraph   │            │
   │ │ + WebRTC    │                         │ │ + WebRTC    │            │
   │ │ + IndexedDB │                         │ │ + IndexedDB │            │
   │ └─────────────┘                         │ └─────────────┘            │
   └─────────┘                               └─────────────────────────────┘
```

## Connection flow

1. User A opens a session, CRDTGraph creates a WebrtcProvider
2. Provider connects to `/signal` and subscribes to the session's room ID
3. User B opens the same session (shared link or same browser tab)
4. Provider connects and subscribes to the same room ID
5. Signaling server relays SDP offer from A to B
6. B responds with SDP answer, relayed back to A
7. Peers exchange ICE candidates through signaling
8. Direct WebRTC connection established
9. Yjs syncs CRDT state over WebRTC
10. Both browsers now see the same canvas in real-time

## Failure handling

The system handles various failure modes gracefully:

| Failure | Recovery |
|---------|----------|
| Signaling server down | Peers retry connection automatically |
| WebRTC connection lost | Yjs awareness triggers reconnection |
| NAT traversal fails | Falls back to TURN relay (future) |
| Browser tab closed | Other peers continue, state persists locally |

## Future enhancements

1. **TURN server support**: For peers behind restrictive NATs, we may add
   TURN relay support for guaranteed connectivity.

2. **Presence awareness**: Show which users are viewing/editing the canvas
   using Yjs awareness protocol.

3. **Selective sync**: Only sync visible portions of large canvases.
