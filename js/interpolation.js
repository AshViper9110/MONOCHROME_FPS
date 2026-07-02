import { Vec3, lerp, lerpAngle } from './util.js';

const SNAPSHOT_BUFFER_SIZE = 60;
const INTERPOLATION_DELAY = 0.05;
const PREDICTION_ENABLED = true;
const SNAP_THRESHOLD = 3;
const LERP_SPEED = 10;

export class InterpolationManager {
    constructor() {
        this.snapshots = [];
        this.snapshotBuffer = [];
        this.lastProcessedSeq = 0;
        this.interpolationTime = 0;
        this.remotePlayers = new Map();
    }

    addSnapshot(snapshot) {
        this.snapshots.push(snapshot);
        if (this.snapshots.length > SNAPSHOT_BUFFER_SIZE) {
            this.snapshots.shift();
        }
    }

    setRemotePlayerState(playerId, data) {
        if (!this.remotePlayers.has(playerId)) {
            this.remotePlayers.set(playerId, {
                previousState: null,
                currentState: null,
                renderState: {
                    position: new Vec3(),
                    yaw: 0,
                    pitch: 0,
                },
                interpolationTime: 0,
            });
        }

        const remote = this.remotePlayers.get(playerId);
        remote.previousState = remote.currentState;
        remote.currentState = data;
        remote.interpolationTime = 0;
    }

    update(dt, localPlayerId) {
        this.interpolationTime += dt;

        for (const [id, remote] of this.remotePlayers) {
            if (remote.currentState) {
                this._interpolateRemote(remote, dt);
            }
        }
    }

    _interpolateRemote(remote, dt) {
        if (!remote.previousState) {
            remote.renderState.position.set(
                remote.currentState.position.x,
                remote.currentState.position.y,
                remote.currentState.position.z
            );
            remote.renderState.yaw = remote.currentState.yaw || 0;
            remote.renderState.pitch = remote.currentState.pitch || 0;
            return;
        }

        remote.interpolationTime += dt;
        const t = Math.min(1, remote.interpolationTime / INTERPOLATION_DELAY);

        const prevPos = remote.previousState.position;
        const currPos = remote.currentState.position;

        const renderPos = remote.renderState.position;
        renderPos.x = lerp(prevPos.x, currPos.x, t);
        renderPos.y = lerp(prevPos.y, currPos.y, t);
        renderPos.z = lerp(prevPos.z, currPos.z, t);

        remote.renderState.yaw = lerpAngle(
            remote.previousState.yaw || 0,
            remote.currentState.yaw || 0,
            t
        );
        remote.renderState.pitch = lerp(
            remote.previousState.pitch || 0,
            remote.currentState.pitch || 0,
            t
        );

        const snapDist = Vec3.distance(
            new Vec3(currPos.x, currPos.y, currPos.z),
            renderPos
        );
        if (snapDist > SNAP_THRESHOLD) {
            renderPos.set(currPos.x, currPos.y, currPos.z);
            remote.renderState.yaw = remote.currentState.yaw || 0;
            remote.renderState.pitch = remote.currentState.pitch || 0;
        }
    }

    getRenderState(playerId) {
        const remote = this.remotePlayers.get(playerId);
        if (!remote) return null;
        return remote.renderState;
    }

    getCurrentState(playerId) {
        const remote = this.remotePlayers.get(playerId);
        if (!remote) return null;
        return remote.currentState;
    }

    reset() {
        this.snapshots.length = 0;
        this.remotePlayers.clear();
        this.interpolationTime = 0;
    }
}

export class DeadReckoning {
    constructor() {
        this.predictions = new Map();
    }

    startPrediction(playerId, state) {
        this.predictions.set(playerId, {
            position: new Vec3(state.position.x, state.position.y, state.position.z),
            velocity: new Vec3(state.velocity.x, state.velocity.y, state.velocity.z),
            yaw: state.yaw || 0,
            pitch: state.pitch || 0,
            lastUpdate: performance.now(),
        });
    }

    predict(playerId, timestamp) {
        const pred = this.predictions.get(playerId);
        if (!pred) return null;

        const dt = (timestamp - pred.lastUpdate) / 1000;
        if (dt <= 0) return null;

        return {
            position: new Vec3(
                pred.position.x + pred.velocity.x * dt,
                pred.position.y + pred.velocity.y * dt,
                pred.position.z + pred.velocity.z * dt
            ),
            yaw: pred.yaw,
            pitch: pred.pitch,
        };
    }

    updateState(playerId, state) {
        const pred = this.predictions.get(playerId);
        if (pred) {
            pred.position.set(state.position.x, state.position.y, state.position.z);
            pred.velocity.set(state.velocity.x, state.velocity.y, state.velocity.z);
            pred.yaw = state.yaw || 0;
            pred.pitch = state.pitch || 0;
            pred.lastUpdate = performance.now();
        } else {
            this.startPrediction(playerId, state);
        }
    }

    remove(playerId) {
        this.predictions.delete(playerId);
    }

    reset() {
        this.predictions.clear();
    }
}
