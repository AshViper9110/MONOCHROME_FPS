const PEER_CONFIG = {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    }
};

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;
const CONNECTION_TIMEOUT = 10000;

export const ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error',
};

export class PeerManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.state = ConnectionState.DISCONNECTED;
        this.peerId = null;
        this.remotePeerId = null;
        this._messageHandlers = [];
        this._connectionCallbacks = [];
        this._errorCallbacks = [];
        this._reconnectAttempts = 0;
        this._isHost = false;
        this._pendingMessages = [];
    }

    async init(customId) {
        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer(customId || undefined, PEER_CONFIG);
                this.state = ConnectionState.CONNECTING;

                this.peer.on('open', (id) => {
                    this.peerId = id;
                    this.state = ConnectionState.CONNECTED;
                    resolve(id);
                });

                this.peer.on('connection', (conn) => {
                    this._handleConnection(conn);
                });

                this.peer.on('error', (err) => {
                    console.error('Peer error:', err);
                    this.state = ConnectionState.ERROR;
                    this._errorCallbacks.forEach(cb => cb(err));
                    if (!this.connection) {
                        reject(err);
                    }
                });

                this.peer.on('disconnected', () => {
                    this.state = ConnectionState.DISCONNECTED;
                    this._tryReconnect();
                });

                setTimeout(() => {
                    if (this.state === ConnectionState.CONNECTING) {
                        reject(new Error('PeerJS connection timeout'));
                    }
                }, CONNECTION_TIMEOUT);
            } catch (err) {
                reject(err);
            }
        });
    }

    _handleConnection(conn) {
        this.connection = conn;
        this._isHost = false;

        conn.on('open', () => {
            this.state = ConnectionState.CONNECTED;
            this.remotePeerId = conn.peer;
            this._connectionCallbacks.forEach(cb => cb(conn.peer));
            this._flushPendingMessages();
        });

        conn.on('data', (data) => {
            this._messageHandlers.forEach(cb => cb(data));
        });

        conn.on('close', () => {
            this.state = ConnectionState.DISCONNECTED;
            this.connection = null;
            this._tryReconnect();
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this._errorCallbacks.forEach(cb => cb(err));
        });
    }

    connect(remoteId) {
        if (this.connection) {
            this.connection.close();
        }

        this.remotePeerId = remoteId;
        this._isHost = true;
        this.state = ConnectionState.CONNECTING;

        const conn = this.peer.connect(remoteId, {
            reliable: true,
            serialization: 'json',
        });

        this._handleConnection(conn);
    }

    send(data) {
        if (this.connection && this.connection.open) {
            this.connection.send(data);
        } else {
            this._pendingMessages.push(data);
        }
    }

    _flushPendingMessages() {
        while (this._pendingMessages.length > 0) {
            const msg = this._pendingMessages.shift();
            this.send(msg);
        }
    }

    broadcast(data) {
        this.send(data);
    }

    onMessage(handler) {
        this._messageHandlers.push(handler);
    }

    onConnection(callback) {
        this._connectionCallbacks.push(callback);
    }

    onError(callback) {
        this._errorCallbacks.push(callback);
    }

    isConnected() {
        return this.state === ConnectionState.CONNECTED && this.connection && this.connection.open;
    }

    isHost() {
        return this._isHost;
    }

    getPing() {
        return this._ping || 0;
    }

    measurePing() {
        if (!this.isConnected()) return;
        const start = performance.now();
        this.send({ type: 'ping', time: start });
    }

    _tryReconnect() {
        if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
        this._reconnectAttempts++;
        setTimeout(() => {
            if (this.peer && !this.isConnected()) {
                this.peer.reconnect();
            }
        }, RECONNECT_DELAY);
    }

    disconnect() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.state = ConnectionState.DISCONNECTED;
        this.peerId = null;
        this.remotePeerId = null;
        this._pendingMessages.length = 0;
    }
}
