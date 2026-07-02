import { PeerManager, ConnectionState } from './peer.js';
import { InterpolationManager, DeadReckoning } from './interpolation.js';

const SYNC_INTERVAL = 1 / 20;
const STATE_UPDATE = 'state';
const FIRE_EVENT = 'fire';
const HIT_EVENT = 'hit';
const KILL_EVENT = 'kill';
const SET_WIN = 'setWin';
const MATCH_END = 'matchEnd';
const JOIN_REQUEST = 'join';
const JOIN_ACCEPT = 'joinAccept';
const WEAPON_SELECT = 'weaponSelect';
const SET_START = 'setStart';
const PING = 'ping';
const PONG = 'pong';

export class NetworkManager {
    constructor() {
        this.peer = new PeerManager();
        this.interpolation = new InterpolationManager();
        this.deadReckoning = new DeadReckoning();
        this._syncTimer = 0;
        this._pingTimer = 0;
        this._lastPingTime = 0;
        this._ping = 0;
        this._fps = 0;
        this._frameCount = 0;
        this._fpsTimer = 0;
        this._messageQueue = [];
        this._handlers = new Map();
        this._connected = false;
        this._localPlayerId = null;
        this._gameCallbacks = {};
    }

    async init() {
        try {
            const id = await this.peer.init();
            this._connected = true;
            this._setupHandlers();
            return id;
        } catch (err) {
            console.error('Network init failed:', err);
            throw err;
        }
    }

    connect(remoteId) {
        this.peer.connect(remoteId);
    }

    _setupHandlers() {
        this.peer.onMessage((data) => {
            this._handleMessage(data);
        });

        this.peer.onConnection((remoteId) => {
            this._connected = true;
            if (this._gameCallbacks.onConnected) {
                this._gameCallbacks.onConnected(remoteId);
            }
        });
    }

    _handleMessage(data) {
        const handlers = this._handlers.get(data.type);
        if (handlers) {
            for (const handler of handlers) {
                handler(data);
            }
        }

        switch (data.type) {
            case PING:
                this.peer.send({ type: PONG, time: data.time });
                break;
            case PONG:
                this._ping = performance.now() - data.time;
                break;
            case STATE_UPDATE:
                this._handleStateUpdate(data);
                break;
            case FIRE_EVENT:
                if (this._gameCallbacks.onRemoteFire) {
                    this._gameCallbacks.onRemoteFire(data);
                }
                break;
            case HIT_EVENT:
                if (this._gameCallbacks.onRemoteHit) {
                    this._gameCallbacks.onRemoteHit(data);
                }
                break;
            case KILL_EVENT:
                if (this._gameCallbacks.onRemoteKill) {
                    this._gameCallbacks.onRemoteKill(data);
                }
                break;
            case JOIN_REQUEST:
                if (this._gameCallbacks.onJoinRequest) {
                    this._gameCallbacks.onJoinRequest(data);
                }
                break;
            case JOIN_ACCEPT:
                if (this._gameCallbacks.onJoinAccept) {
                    this._gameCallbacks.onJoinAccept(data);
                }
                break;
            case WEAPON_SELECT:
                if (this._gameCallbacks.onWeaponSelect) {
                    this._gameCallbacks.onWeaponSelect(data);
                }
                break;
            case SET_START:
                if (this._gameCallbacks.onSetStart) {
                    this._gameCallbacks.onSetStart(data);
                }
                break;
            case SET_WIN:
                if (this._gameCallbacks.onSetWin) {
                    this._gameCallbacks.onSetWin(data);
                }
                break;
            case MATCH_END:
                if (this._gameCallbacks.onMatchEnd) {
                    this._gameCallbacks.onMatchEnd(data);
                }
                break;
        }
    }

    _handleStateUpdate(data) {
        if (data.playerId && data.playerId !== this._localPlayerId) {
            this.interpolation.setRemotePlayerState(data.playerId, data);
            this.deadReckoning.updateState(data.playerId, data);
        }
    }

    registerHandler(type, handler) {
        if (!this._handlers.has(type)) {
            this._handlers.set(type, []);
        }
        this._handlers.get(type).push(handler);
    }

    setCallbacks(callbacks) {
        this._gameCallbacks = callbacks;
    }

    sendStateUpdate(player) {
        const data = {
            type: STATE_UPDATE,
            playerId: player.id,
            position: { x: player.body.position.x, y: player.body.position.y, z: player.body.position.z },
            velocity: { x: player.body.velocity.x, y: player.body.velocity.y, z: player.body.velocity.z },
            yaw: player.yaw,
            pitch: player.pitch,
            health: player.health,
            isDead: player.isDead,
            onGround: player.body.onGround,
            onWall: player.body.onWall,
            weapon: player.weapon ? player.weapon.name : null,
            seq: Date.now(),
        };
        this.peer.send(data);
    }

    sendFireEvent(player, weaponName) {
        const forward = player.getForward();
        this.peer.send({
            type: FIRE_EVENT,
            playerId: player.id,
            weapon: weaponName,
            origin: { x: player.getEyePosition().x, y: player.getEyePosition().y, z: player.getEyePosition().z },
            direction: { x: forward.x, y: forward.y, z: forward.z },
        });
    }

    sendHitEvent(shooterId, victimId, damage, isHeadshot) {
        this.peer.send({
            type: HIT_EVENT,
            shooterId,
            victimId,
            damage,
            isHeadshot,
        });
    }

    sendKillEvent(killerId, victimId, weaponName) {
        this.peer.send({
            type: KILL_EVENT,
            killerId,
            victimId,
            weapon: weaponName || 'Unknown',
        });
    }

    sendSetWin(winnerId, setNumber) {
        this.peer.send({
            type: SET_WIN,
            winnerId,
            setNumber,
        });
    }

    sendMatchEnd(winnerId) {
        this.peer.send({
            type: MATCH_END,
            winnerId,
        });
    }

    sendJoinRequest(playerName) {
        this.peer.send({
            type: JOIN_REQUEST,
            playerName,
        });
    }

    sendJoinAccept(playerId, playerName) {
        this.peer.send({
            type: JOIN_ACCEPT,
            playerId,
            playerName,
            yourId: this.peer.peerId,
        });
    }

    sendWeaponSelect(weaponName) {
        this.peer.send({
            type: WEAPON_SELECT,
            weaponName,
        });
    }

    sendSetStart(setNumber) {
        this.peer.send({
            type: SET_START,
            setNumber,
        });
    }

    update(dt, localPlayer) {
        this._syncTimer += dt;
        this._pingTimer += dt;

        if (this._syncTimer >= SYNC_INTERVAL && localPlayer) {
            this._syncTimer = 0;
            this.sendStateUpdate(localPlayer);
        }

        if (this._pingTimer >= 1) {
            this._pingTimer = 0;
            this.peer.measurePing();
        }

        this._fpsTimer += dt;
        this._frameCount++;
        if (this._fpsTimer >= 1) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._fpsTimer = 0;
        }

        this.interpolation.update(dt, this._localPlayerId);
    }

    getRemotePlayerState(playerId) {
        return this.interpolation.getRenderState(playerId);
    }

    setLocalPlayerId(id) {
        this._localPlayerId = id;
    }

    getPing() {
        return this._ping;
    }

    getFPS() {
        return this._fps;
    }

    isConnected() {
        return this.peer.isConnected();
    }

    getPeerId() {
        return this.peer.peerId;
    }

    getRemotePeerId() {
        return this.peer.remotePeerId;
    }

    disconnect() {
        this.peer.disconnect();
        this.interpolation.reset();
        this.deadReckoning.reset();
        this._connected = false;
    }
}
