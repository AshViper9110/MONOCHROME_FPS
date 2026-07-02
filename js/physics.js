import { Vec3, GRAVITY, EPSILON } from './util.js';

export const CollisionType = {
    NONE: 0,
    WALL: 1,
    FLOOR: 2,
    CEILING: 3,
    WALLRUN: 4,
};

export class PhysicsBody {
    constructor() {
        this.position = new Vec3();
        this.velocity = new Vec3();
        this.size = new Vec3(0.5, 1.8, 0.5);
        this.onGround = false;
        this.onCeiling = false;
        this.onWall = false;
        this.wallNormal = new Vec3();
        this.gravityMultiplier = 1;
        this.friction = 0.85;
        this.bounciness = 0;
        this.collisionLayers = 1;
        this.mass = 1;
        this.isTrigger = false;
    }

    reset() {
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.onGround = false;
        this.onCeiling = false;
        this.onWall = false;
        this.gravityMultiplier = 1;
    }
}

export class PhysicsWorld {
    constructor() {
        this.bodies = [];
        this.colliders = [];
        this.gravity = new Vec3(0, -GRAVITY, 0);
    }

    addBody(body) {
        this.bodies.push(body);
    }

    removeBody(body) {
        const idx = this.bodies.indexOf(body);
        if (idx !== -1) this.bodies.splice(idx, 1);
    }

    setColliders(colliders) {
        this.colliders = colliders;
    }

    update(dt) {
        for (const body of this.bodies) {
            this._integrate(body, dt);
            this._collide(body);
        }
    }

    _integrate(body, dt) {
        const grav = Vec3.scale(this.gravity, body.gravityMultiplier * body.mass);
        body.velocity.add(Vec3.scale(grav, dt));

        body.position.add(Vec3.scale(body.velocity, dt));
    }

    _collide(body) {
        body.onGround = false;
        body.onCeiling = false;
        body.onWall = false;

        const halfSize = new Vec3(
            body.size.x * 0.5,
            body.size.y * 0.5,
            body.size.z * 0.5
        );

        const bodyCenter = Vec3.add(body.position, halfSize);

        for (const collider of this.colliders) {
            const result = this._aabbTest(bodyCenter, halfSize, collider);
            if (result.overlap) {
                this._resolveCollision(body, result, collider);
            }
        }
    }

    _aabbTest(center, halfSize, collider) {
        const cHalf = Vec3.scale(collider.size, 0.5);
        const cCenter = Vec3.add(collider.position, cHalf);

        const dx = center.x - cCenter.x;
        const dy = center.y - cCenter.y;
        const dz = center.z - cCenter.z;

        const overlapX = halfSize.x + cHalf.x - Math.abs(dx);
        const overlapY = halfSize.y + cHalf.y - Math.abs(dy);
        const overlapZ = halfSize.z + cHalf.z - Math.abs(dz);

        if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
            const minOverlap = Math.min(overlapX, overlapY, overlapZ);
            let normal = new Vec3();
            let collisionType = CollisionType.WALL;

            if (minOverlap === overlapX) {
                normal.set(Math.sign(dx) || 1, 0, 0);
                if (Math.abs(normal.x) > 0.5) collisionType = CollisionType.WALL;
            } else if (minOverlap === overlapY) {
                normal.set(0, Math.sign(dy) || 1, 0);
                collisionType = normal.y > 0 ? CollisionType.FLOOR : CollisionType.CEILING;
            } else {
                normal.set(0, 0, Math.sign(dz) || 1);
                if (Math.abs(normal.z) > 0.5) collisionType = CollisionType.WALL;
            }

            if (collider.walkable && collisionType === CollisionType.WALL) {
                collisionType = CollisionType.WALLRUN;
            }

            return {
                overlap: true,
                overlapAmount: minOverlap,
                normal,
                collisionType,
                collider
            };
        }

        return { overlap: false };
    }

    _resolveCollision(body, result, collider) {
        const { normal, overlapAmount, collisionType } = result;

        body.position.add(Vec3.scale(normal, overlapAmount));

        const velDot = body.velocity.dot(normal);
        if (velDot < 0) {
            const velNormal = Vec3.scale(normal, velDot);
            body.velocity.sub(Vec3.scale(velNormal, 1 + body.bounciness));

            if (collisionType === CollisionType.FLOOR) {
                body.onGround = true;
                if (Math.abs(body.velocity.y) < 0.5) {
                    body.velocity.y = 0;
                }
            } else if (collisionType === CollisionType.CEILING) {
                body.onCeiling = true;
                if (body.velocity.y > 0) body.velocity.y = 0;
            } else if (collisionType === CollisionType.WALL) {
                body.onWall = true;
                body.wallNormal.copy(normal);
            } else if (collisionType === CollisionType.WALLRUN) {
                body.onWall = true;
                body.wallNormal.copy(normal);
            }
        }
    }

    raycast(origin, direction, maxDist = 1000) {
        let closestDist = maxDist;
        let hit = null;

        for (const collider of this.colliders) {
            const result = this._rayAABB(origin, direction, collider);
            if (result && result.distance < closestDist) {
                closestDist = result.distance;
                hit = {
                    point: result.point,
                    normal: result.normal,
                    distance: result.distance,
                    collider
                };
            }
        }

        return hit;
    }

    _rayAABB(origin, dir, collider) {
        const min = collider.position;
        const max = new Vec3(
            collider.position.x + collider.size.x,
            collider.position.y + collider.size.y,
            collider.position.z + collider.size.z
        );

        let tmin = -Infinity;
        let tmax = Infinity;

        for (let i = 0; i < 3; i++) {
            const invD = 1 / (i === 0 ? dir.x : i === 1 ? dir.y : dir.z);
            const originC = i === 0 ? origin.x : i === 1 ? origin.y : origin.z;
            const minC = i === 0 ? min.x : i === 1 ? min.y : min.z;
            const maxC = i === 0 ? max.x : i === 1 ? max.y : max.z;

            let t1 = (minC - originC) * invD;
            let t2 = (maxC - originC) * invD;

            if (t1 > t2) [t1, t2] = [t2, t1];

            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);

            if (tmin > tmax) return null;
        }

        if (tmin < 0) return null;

        const point = Vec3.add(origin, Vec3.scale(dir, tmin));
        const normal = new Vec3();

        const eps = 0.001;
        if (Math.abs(point.x - min.x) < eps) normal.x = -1;
        else if (Math.abs(point.x - max.x) < eps) normal.x = 1;
        if (Math.abs(point.y - min.y) < eps) normal.y = -1;
        else if (Math.abs(point.y - max.y) < eps) normal.y = 1;
        if (Math.abs(point.z - min.z) < eps) normal.z = -1;
        else if (Math.abs(point.z - max.z) < eps) normal.z = 1;
        normal.normalize();

        return { point, normal, distance: tmin };
    }
}
