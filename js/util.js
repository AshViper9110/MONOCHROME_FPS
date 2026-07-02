export const EPSILON = 0.0001;
export const PI = Math.PI;
export const TWO_PI = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const GRAVITY = 20;
export const MAX_FPS = 60;
export const FRAME_TIME = 1 / MAX_FPS;

export class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }

    clone() {
        return new Vec3(this.x, this.y, this.z);
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }

    scale(s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    cross(v) {
        return new Vec3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    normalize() {
        const len = this.length();
        if (len > EPSILON) {
            this.scale(1 / len);
        }
        return this;
    }

    negate() {
        this.x = -this.x;
        this.y = -this.y;
        this.z = -this.z;
        return this;
    }

    lerp(v, t) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        this.z += (v.z - this.z) * t;
        return this;
    }

    static add(a, b) { return a.clone().add(b); }
    static sub(a, b) { return a.clone().sub(b); }
    static scale(v, s) { return v.clone().scale(s); }
    static lerp(a, b, t) { return a.clone().lerp(b, t); }
    static distance(a, b) { return Vec3.sub(a, b).length(); }
    static distanceSq(a, b) { return Vec3.sub(a, b).lengthSq(); }
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > PI) diff -= TWO_PI;
    while (diff < -PI) diff += TWO_PI;
    return a + diff * t;
}

export function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

export function normalizeAngle(angle) {
    while (angle > PI) angle -= TWO_PI;
    while (angle < -PI) angle += TWO_PI;
    return angle;
}

export function worldToScreen(pos, viewMatrix, width, height) {
    const transformed = applyMatrix(viewMatrix, pos);
    if (transformed.z <= 0) return null;
    const fov = 90 * DEG2RAD;
    const f = 1 / Math.tan(fov / 2);
    const aspect = width / height;
    const sx = (transformed.x / transformed.z) * f / aspect;
    const sy = (transformed.y / transformed.z) * f;
    return {
        x: (sx + 1) * 0.5 * width,
        y: (1 - sy) * 0.5 * height,
        depth: transformed.z
    };
}

export function applyMatrix(m, v) {
    return {
        x: m[0] * v.x + m[1] * v.y + m[2] * v.z + m[3],
        y: m[4] * v.x + m[5] * v.y + m[6] * v.z + m[7],
        z: m[8] * v.x + m[9] * v.y + m[10] * v.z + m[11]
    };
}

export function createViewMatrix(pos, yaw, pitch) {
    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const cosP = Math.cos(-pitch);
    const sinP = Math.sin(-pitch);

    const forward = new Vec3(sinY * cosP, sinP, -cosY * cosP);
    const right = new Vec3(cosY, 0, sinY);
    const up = new Vec3(-sinY * sinP, cosP, cosY * sinP);

    return [
        right.x, up.x, forward.x, 0,
        right.y, up.y, forward.y, 0,
        right.z, up.z, forward.z, 0,
        -right.dot(pos), -up.dot(pos), -forward.dot(pos), 1
    ];
}

export class ObjectPool {
    constructor(factory, reset, initialSize = 50) {
        this.factory = factory;
        this.reset = reset;
        this.pool = [];
        this.active = [];
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(factory());
        }
    }

    get() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.factory();
        }
        this.active.push(obj);
        return obj;
    }

    release(obj) {
        const idx = this.active.indexOf(obj);
        if (idx !== -1) {
            this.active.splice(idx, 1);
            this.reset(obj);
            this.pool.push(obj);
        }
    }

    releaseAll() {
        for (const obj of this.active) {
            this.reset(obj);
            this.pool.push(obj);
        }
        this.active.length = 0;
    }

    getActive() {
        return this.active;
    }

    getActiveCount() {
        return this.active.length;
    }
}
