import { Vec3 } from './util.js';

export class Bullet {
    constructor(config) {
        this.origin = config.origin;
        this.direction = config.direction;
        this.speed = config.speed;
        this.damage = config.damage;
        this.range = config.range;
        this.ownerId = config.ownerId;
        this.size = config.size || 0.05;
        this.isHitscan = config.isHitscan;
        this.headshotMultiplier = config.headshotMultiplier || 2;
        this.weaponName = config.weaponName || 'Unknown';

        this.position = this.origin.clone();
        this.traveled = 0;
        this.alive = true;
        this.hitPosition = null;
        this.hitNormal = null;
        this.hitEntity = null;
        this.isHeadshot = false;

        if (this.isHitscan) {
            this.position = null;
        }
    }

    update(dt) {
        if (!this.alive) return;
        if (this.isHitscan) return;

        const step = Vec3.scale(this.direction, this.speed * dt);
        this.position.add(step);
        this.traveled += step.length();

        if (this.traveled >= this.range) {
            this.alive = false;
        }
    }

    getTrajectory() {
        if (this.isHitscan) {
            return {
                origin: this.origin,
                direction: this.direction,
                range: this.range,
            };
        }
        return null;
    }

    getPosition() {
        return this.position;
    }

    isExpired() {
        return !this.alive || this.traveled >= this.range;
    }

    deactivate() {
        this.alive = false;
    }
}

export class BulletManager {
    constructor() {
        this.bullets = [];
    }

    addBullet(bullet) {
        this.bullets.push(bullet);
    }

    addBullets(bullets) {
        for (const b of bullets) {
            this.bullets.push(b);
        }
    }

    update(dt, physicsWorld, players) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (!bullet.alive) {
                this.bullets.splice(i, 1);
                continue;
            }

            if (bullet.isHitscan) {
                this._processHitscan(bullet, physicsWorld, players);
                bullet.deactivate();
                this.bullets.splice(i, 1);
            } else {
                bullet.update(dt);
                this._checkProjectileCollision(bullet, physicsWorld, players);
                if (bullet.isExpired()) {
                    this.bullets.splice(i, 1);
                }
            }
        }
    }

    _processHitscan(bullet, physicsWorld, players) {
        const traj = bullet.getTrajectory();
        if (!traj) return;

        const hit = physicsWorld.raycast(traj.origin, traj.direction, traj.range);
        let hitDistance = hit ? hit.distance : traj.range;

        let closestPlayer = null;
        let closestDist = hitDistance;

        for (const player of players) {
            if (player.id === bullet.ownerId) continue;
            if (player.isDead) continue;

            const result = this._rayPlayer(traj.origin, traj.direction, player);
            if (result && result.distance < closestDist) {
                closestDist = result.distance;
                closestPlayer = result;
            }
        }

        if (closestPlayer) {
            bullet.hitEntity = closestPlayer.player;
            bullet.hitPosition = closestPlayer.point;
            bullet.isHeadshot = closestPlayer.isHeadshot;
            bullet.deactivate();

            const dmg = closestPlayer.isHeadshot
                ? bullet.damage * bullet.headshotMultiplier
                : bullet.damage;
            closestPlayer.player.takeDamage(dmg, closestPlayer.isHeadshot);
        }
    }

    _checkProjectileCollision(bullet, physicsWorld, players) {
        const hit = physicsWorld.raycast(
            bullet.origin,
            bullet.direction,
            bullet.traveled
        );
        let hitDistance = hit ? hit.distance : Infinity;

        for (const player of players) {
            if (player.id === bullet.ownerId) continue;
            if (player.isDead) continue;

            const dist = Vec3.distance(bullet.position, player.body.position);
            if (dist < 1.0) {
                const dmg = bullet.damage;
                player.takeDamage(dmg, false);
                bullet.deactivate();
                bullet.hitEntity = player;
                return;
            }
        }

        if (hit && hit.distance < bullet.traveled) {
            bullet.deactivate();
        }
    }

    _rayPlayer(origin, direction, player) {
        const eyePos = player.getEyePosition();
        const bodyPos = player.body.position;

        const headRadius = 0.2;
        const bodyRadius = 0.5;

        const headCenter = new Vec3(bodyPos.x, bodyPos.y + 1.6, bodyPos.z);
        const bodyCenter = new Vec3(bodyPos.x, bodyPos.y + 0.9, bodyPos.z);

        const headHit = this._raySphere(origin, direction, headCenter, headRadius);
        const bodyHit = this._raySphere(origin, direction, bodyCenter, bodyRadius);

        if (headHit && headHit.distance < (bodyHit ? bodyHit.distance : Infinity)) {
            return { ...headHit, player, isHeadshot: true };
        }
        if (bodyHit) {
            return { ...bodyHit, player, isHeadshot: false };
        }
        return null;
    }

    _raySphere(origin, dir, center, radius) {
        const oc = Vec3.sub(origin, center);
        const a = dir.dot(dir);
        const b = 2 * oc.dot(dir);
        const c = oc.dot(oc) - radius * radius;
        const disc = b * b - 4 * a * c;

        if (disc < 0) return null;

        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) return null;

        const point = Vec3.add(origin, Vec3.scale(dir, t));
        const normal = Vec3.sub(point, center).normalize();

        return { distance: t, point, normal };
    }

    getActiveBullets() {
        return this.bullets;
    }

    clear() {
        this.bullets.length = 0;
    }
}
