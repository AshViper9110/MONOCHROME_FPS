import { Vec3, clamp } from './util.js';

const CAM_DISTANCE = 4;
const SHOULDER_OFFSET = 0.8;
const LOOK_AT_HEIGHT = 1.6;
const LERP_SPEED = 12;

export class CameraController {
    constructor() {
        this.position = new Vec3(0, 0, 0);
        this._smoothPosition = new Vec3(0, 0, 0);
        this.pitch = 0;
        this.yaw = 0;
        this._lookTarget = new Vec3(0, 0, 0);
    }

    update(dt, player) {
        if (!player) return;

        const pos = player.body.position;
        const yaw = player.yaw;
        const sinY = Math.sin(yaw);
        const cosY = Math.cos(yaw);
        const cosP = Math.cos(this.pitch);
        const sinP = Math.sin(this.pitch);

        const fwd = new Vec3(sinY * cosP, sinP, -cosY * cosP);
        const right = new Vec3(cosY, 0, sinY);

        const basePos = new Vec3(pos.x, pos.y + LOOK_AT_HEIGHT, pos.z);
        const targetPos = new Vec3(
            basePos.x + right.x * SHOULDER_OFFSET - fwd.x * CAM_DISTANCE,
            basePos.y + right.y * SHOULDER_OFFSET - fwd.y * CAM_DISTANCE,
            basePos.z + right.z * SHOULDER_OFFSET - fwd.z * CAM_DISTANCE
        );
        targetPos.y = Math.max(targetPos.y, pos.y + 0.2);

        if (this._smoothPosition.lengthSq() === 0) {
            this._smoothPosition.copy(targetPos);
        }

        const t = Math.min(1, LERP_SPEED * dt);
        this._smoothPosition.x += (targetPos.x - this._smoothPosition.x) * t;
        this._smoothPosition.y += (targetPos.y - this._smoothPosition.y) * t;
        this._smoothPosition.z += (targetPos.z - this._smoothPosition.z) * t;

        this.position.copy(this._smoothPosition);
        this._lookTarget.set(pos.x, pos.y + LOOK_AT_HEIGHT, pos.z);
    }

    getViewMatrix() {
        const eye = this.position;
        const target = this._lookTarget;
        const worldUp = new Vec3(0, 1, 0);

        const fwd = Vec3.sub(target, eye).normalize();
        const right = worldUp.cross(fwd).normalize();
        const up = fwd.cross(right).normalize();

        return [
            right.x, up.x, fwd.x, 0,
            right.y, up.y, fwd.y, 0,
            right.z, up.z, fwd.z, 0,
            -right.dot(eye), -up.dot(eye), -fwd.dot(eye), 1
        ];
    }

    getForward() {
        const cosP = Math.cos(this.pitch);
        const sinP = Math.sin(this.pitch);
        const cosY = Math.cos(this.yaw);
        const sinY = Math.sin(this.yaw);
        return new Vec3(sinY * cosP, sinP, -cosY * cosP);
    }

    reset() {
        this.position.set(0, 0, 0);
        this._smoothPosition.set(0, 0, 0);
        this._targetPosition.set(0, 0, 0);
        this.pitch = 0;
        this.yaw = 0;
    }
}
